import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./prisma";
import { HttpError, requireEnv } from "./utils";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      return Boolean(profile?.email && (profile as { email_verified?: boolean }).email_verified !== false);
    },
    async jwt({ token, profile }) {
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
