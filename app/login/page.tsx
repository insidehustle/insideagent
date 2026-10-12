"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

function LoginCard() {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const callbackUrl = params.get("callbackUrl") || "/dashboard";
  const failed = params.get("error");

  return (
    <div className="w-full max-w-sm rounded-xl border border-ink-200 bg-white p-8 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-accent">Book Automation System</p>
      <h1 className="mt-3 font-serif text-3xl">Sign in</h1>
      <p className="mt-2 text-sm text-ink-700">Your projects are private to your Google account.</p>
      {failed && <p className="mt-4 text-sm text-red-700">Sign-in failed. Try again. <span className="text-ink-700/70">(error: {failed})</span></p>}
      <button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signIn("google", { callbackUrl });
        }}
        className="mt-6 w-full rounded-lg bg-accent px-5 py-3 font-medium text-white hover:bg-accent-dark disabled:opacity-60"
      >
        {busy ? "Redirecting..." : "Continue with Google"}
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Suspense>
        <LoginCard />
      </Suspense>
    </main>
  );
}
