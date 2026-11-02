import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import { HttpError, requireEnv } from "./utils";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * TEMPORARY, for testing: one email and password sign-in, enabled only while TEST_LOGIN_EMAIL and TEST_LOGIN_PASSWORD are
 * both set. Delete those two variables to turn it off; nothing is stored in the database.
 */
const testLogin =
  process.env.TEST_LOGIN_EMAIL && process.env.TEST_LOGIN_PASSWORD
    ? [
        CredentialsProvider({
          id: "test-login",
          name: "Email and password",
          credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
          async authorize(credentials) {
            const email = String(credentials?.email ?? "").trim().toLowerCase();
            const emailOk = timingSafeEqual(digest(email), digest(process.env.TEST_LOGIN_EMAIL!.trim().toLowerCase()));
            const passwordOk = timingSafeEqual(digest(String(credentials?.password ?? "")), digest(process.env.TEST_LOGIN_PASSWORD!));
            if (!emailOk || !passwordOk) {
              await new Promise((r) => setTimeout(r, 800)); // slows down guessing
              return null;
            }
            const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email, name: "Test user" } });
            return { id: user.id, email: user.email, name: user.name };
          },
        }),
      ]
    : [];

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    ...testLogin,
  ],
  callbacks: {
    async signIn({ profile, account }) {
      if (account?.provider === "test-login") return true;
      return Boolean(profile?.email && (profile as { email_verified?: boolean }).email_verified !== false);
    },
    async jwt({ token, profile, user, account }) {
      if (account?.provider === "test-login" && user?.id) token.uid = user.id;
      // on sign-in, find or create the user row; every later request reads the id from the token
      if (profile?.email) {
        const user = await prisma.user.upsert({
          where: { email: profile.email.toLowerCase() },
          update: { name: profile.name ?? undefined },
          create: { email: profile.email.toLowerCase(), name: profile.name ?? null },
        });
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) session.user.id = token.uid;
      return session;
    },
  },
};

/** The signed-in user, or a 401. Every API route calls this first. */
export async function requireUser() {
  requireEnv("NEXTAUTH_SECRET");
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) throw new HttpError(401, "Sign in to continue");
  return { id, email: session.user?.email ?? "" };
}

/**
 * Ownership checks. Each returns the record when it belongs to the signed-in user and throws a 404 otherwise
 * (404, not 403, so ids of other users' records are not confirmed to exist).
 */
export async function requireProject(projectId: string) {
  const user = await requireUser();
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) throw new HttpError(404, "Project not found");
  return project;
}

export async function requireChapter(chapterId: string) {
  const user = await requireUser();
  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, project: { userId: user.id } } });
  if (!chapter) throw new HttpError(404, "Chapter not found");
  return chapter;
}

export async function requireJob(jobId: string) {
  const user = await requireUser();
  const job = await prisma.bookJob.findFirst({ where: { id: jobId, project: { userId: user.id } } });
  if (!job) throw new HttpError(404, "Job not found");
  return job;
}

export async function requireCharacter(id: string) {
  const user = await requireUser();
  const character = await prisma.character.findFirst({ where: { id, project: { userId: user.id } } });
  if (!character) throw new HttpError(404, "Character not found");
  return character;
}

export async function requireDocument(id: string) {
  const user = await requireUser();
  const doc = await prisma.sourceDocument.findFirst({ where: { id, project: { userId: user.id } }, select: { id: true } });
  if (!doc) throw new HttpError(404, "Document not found");
  return doc;
}
