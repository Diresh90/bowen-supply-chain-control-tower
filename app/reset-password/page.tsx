"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false), [password, setPassword] = useState(""), [confirm, setConfirm] = useState(""), [message, setMessage] = useState("Checking recovery link…"), [loading, setLoading] = useState(false);
  useEffect(() => {
    const values = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = values.get("access_token"), refreshToken = values.get("refresh_token"), expiresIn = Number(values.get("expires_in") || 3600);
    if (!accessToken || !refreshToken) { setMessage("This recovery link is invalid or has expired. Request a new link from the login page."); return; }
    void fetch("/api/auth/recovery-session", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({accessToken,refreshToken,expiresIn}) }).then(async response => {
      const data=(await response.json()) as {error?:string};
      if (!response.ok) return setMessage(data.error || "This recovery link is invalid.");
      history.replaceState(null,"",window.location.pathname); setReady(true); setMessage("");
    });
  }, []);
  async function submit(event: FormEvent){event.preventDefault();if(password!==confirm){setMessage("Passwords do not match.");return;}setLoading(true);setMessage("");const response=await fetch("/api/auth/update-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});const data=(await response.json()) as {error?:string};setLoading(false);if(!response.ok){setMessage(data.error||"Password could not be updated.");return;}window.location.assign("/dashboard");}
  return <main className="login-page"><section className="login-card"><div className="login-brand"><Image src="/bowen-logo.svg" alt="Bowen Engineered Storage Systems" width={741} height={227}/><p>SUPPLY CHAIN CONTROL TOWER</p></div><div className="login-heading"><span>ACCOUNT RECOVERY</span><h1>Set a new password</h1><p>Choose a secure password for your Bowen account.</p></div>{message&&<div className="auth-message error" role="alert">{message}</div>}{ready&&<form className="login-form" onSubmit={submit}><label>New password<input type="password" minLength={8} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><label>Confirm password<input type="password" minLength={8} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} required/></label><button className="login-submit" disabled={loading}>{loading?"Updating…":"Update Password"}</button></form>}</section></main>;
}
