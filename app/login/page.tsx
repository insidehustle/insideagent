"use client";

import { Suspense, useEffect, useState } from "react";
import { getProviders, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

function LoginCard() {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [testError, setTestError] = useState(false);
  const [testLoginOn, setTestLoginOn] = useState(false);
  const callbackUrl = params.get("callbackUrl") || "/dashboard";

  // the email form shows only while the server has the temporary test login switched on
  useEffect(() => {
    getProviders().then((p) => setTestLoginOn(Boolean(p?.["test-login"]))).catch(() => {});
  }, []);
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
      {testLoginOn && (
        <form
          className="mt-6 space-y-3 border-t border-ink-200 pt-6 text-left"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setTestError(false);
            const res = await signIn("test-login", { email, password, callbackUrl, redirect: false });
            if (res?.ok && !res.error) window.location.href = res.url ?? callbackUrl;
            else {
              setTestError(true);
              setBusy(false);
            }
          }}
        >
          <p className="text-center text-xs font-medium uppercase tracking-wide text-ink-700">Test sign-in (temporary)</p>
          <input type="email" required autoComplete="username" placeholder="Email" aria-label="Email" className="w-full" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" required autoComplete="current-password" placeholder="Password" aria-label="Password" className="w-full" value={password} onChange={(e) => setPassword(e.target.value)} />
          {testError && <p role="alert" className="text-sm text-red-700">Wrong email or password.</p>}
          <button disabled={busy} className="w-full rounded-lg border border-ink-200 px-5 py-3 font-medium hover:bg-ink-100 disabled:opacity-60">
            Sign in with email
          </button>
        </form>
      )}
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
