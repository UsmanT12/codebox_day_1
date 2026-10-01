import { useEffect, useState } from "react";
import { createApi } from "./api.js";
import Diary from "./Diary.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("Checking your session…");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [api] = useState(() => createApi(() => {
    setUser(null);
    setMessage("Please sign in to continue.");
    setError(false);
  }));

  useEffect(() => {
    let active = true;
    api.request("/api/auth/session").then((result) => {
      if (active) { setUser(result.user); setMessage(""); }
    }).catch((error) => {
      if (active) { setMessage(error.status === 401 ? "Please sign in to continue." : error.message); setError(error.status !== 401); }
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [api]);

  async function signOut() {
    setBusy(true);
    setMessage("");
    try { await api.signOut(); setUser(null); setMessage("You’re signed out."); setError(false); }
    catch (error) { setMessage(`Couldn’t sign out: ${error.message}`); setError(true); }
    finally { setBusy(false); }
  }

  return <>
    <header className="site-header">
      <a className="brand" href="/tracker/"><span className="brand-mark" aria-hidden="true">t.</span>trace<span className="brand-caption">NUTRITION DIARY</span></a>
      {user && <div className="account-menu"><span>{user.email}</span><button className="text-button" onClick={signOut} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button></div>}
    </header>
    <main>
      {user ? <>
        {message && <p className={`message${error ? " error" : ""}`} role="status">{message}</p>}
        <Diary key={user.id} api={api} disabled={busy} />
      </> : <AccountForm {...{ api, checking, message, error, setMessage, setError, setUser }} />}
      <footer><span>trace / A little more awareness, every day.</span></footer>
    </main>
  </>;
}

function AccountForm({ api, checking, message, error, setMessage, setError, setUser }) {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy || checking) return;
    setBusy(true); setError(false);
    setMessage(signup ? "Creating your account…" : "Signing in…");
    try {
      const result = await api.authenticate(signup ? "signup" : "signin", { email: email.trim(), password });
      setPassword("");
      if (result.confirmationRequired) { setSignup(false); setMessage(result.message); }
      else { setMessage(""); setUser(result.user); }
    } catch (error) { setMessage(error.message); setError(true); }
    finally { setBusy(false); }
  }

  return <section className="account-panel" aria-labelledby="account-title">
    <p className="eyebrow">YOUR DIARY, JUST FOR YOU</p>
    <h1 id="account-title">{signup ? "Make room for better habits." : "Welcome back."}</h1>
    <p className="account-description">{signup ? "Create an account for your own private food diary." : "Sign in to see your food diary."}</p>
    <form id="account-form" onSubmit={submit}>
      <label>Email<input type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Password<input type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : 1} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button type="submit" className="primary" disabled={busy || checking}>{signup ? "Create account" : "Sign in"}</button>
    </form>
    <p className={`message${error ? " error" : ""}`} role="status" aria-live="polite">{message}</p>
    <button className="text-button" disabled={busy || checking} onClick={() => { setSignup(!signup); setMessage(""); setError(false); }}>{signup ? "Already have an account? Sign in" : "New here? Create an account"}</button>
  </section>;
}
