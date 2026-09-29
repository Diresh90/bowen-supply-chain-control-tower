"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const queryMessages: Record<string, string> = {
  login_required: "Sign in to access the Bowen Control Tower.",
  access_denied: "Your account is inactive or has not been granted access.",
  session_expired: "Your session expired. Please sign in again.",
  signed_out: "You have been signed out securely.",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<"error" | "success">("error");
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);
  useEffect(() => {
    setMessage(queryMessages[new URLSearchParams(window.location.search).get("message") ?? ""] ?? "");
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage(""); setKind("error");
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const payload = (await response.json()) as { error?: string };
    setLoading(false);
    if (!response.ok) return setMessage(payload.error || "Sign in failed. Please try again.");
    router.replace("/dashboard"); router.refresh();
  }

  async function recover() {
    if (!email) { setMessage("Enter your email address first."); return; }
    setLoading(true); setMessage("");
    const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const payload = (await response.json()) as { error?: string; message?: string };
    setLoading(false); setKind(response.ok ? "success" : "error"); setMessage(payload.message || payload.error || "Unable to send recovery instructions.");
  }

  return <main className="login-page"><section className="login-card">
    <div className="login-brand"><Image src="/bowen-logo.svg" alt="Bowen Engineered Storage Systems" width={741} height={227} priority/><p>SUPPLY CHAIN CONTROL TOWER</p></div>
    <div className="login-heading"><span>SECURE ACCESS</span><h1>Welcome back</h1><p>Sign in with your Bowen account to continue.</p></div>
    {message && <div className={`auth-message ${kind}`} role="alert">{message}</div>}
    <form onSubmit={submit} className="login-form">
      <label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@bowenstorage.com.au" required autoFocus/></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password" required/></label>
      <button className="login-submit" disabled={loading}>{loading ? "Please wait…" : "Sign In"}</button>
    </form>
    <button type="button" className="forgot-link" onClick={()=>{setForgot(true);void recover();}} disabled={loading}>{forgot&&loading ? "Sending…" : "Forgot Password?"}</button>
    <p className="invite-note">Access is invitation only. Contact your administrator if you need an account.</p>
  </section></main>;
}
