"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { signIn } from "@/lib/auth";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <Image src="/bowen-logo.svg" alt="Bowen Engineered Storage Systems" width={741} height={227} priority />
        </div>
        <h1>Supply Chain Control Tower</h1>
        <p className="login-note">Sign in with the account Bowen set up for you.</p>
        <label>
          Email
          <input type="email" autoComplete="username" required placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="login-help">No account yet? Ask your Bowen contact to add you.</p>
      </form>
    </main>
  );
}
