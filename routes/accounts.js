const express = require("express");
const accounts = require("../services/accountService");
const { accountAuth, readCookie } = require("../middleware/accountAuth");
const localOnly = require("../middleware/localOnly");
const { fail } = require("../services/foodService");
const router = express.Router();
router.use(localOnly);

const attempts = new Map();
function limitAttempts(req, res, next) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const key = req.ip;
  const value = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
  attempts.set(key, value);
  if (++value.count > 30) {
    res.set("Retry-After", String(Math.ceil((value.until - now) / 1000)));
    return res.status(429).json({ error: "Too many sign-in attempts. Please try again in 15 minutes." });
  }
  next();
}

function credentials(body, signup = false) {
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = body?.password;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, "Enter a valid email address.");
  if (typeof password !== "string" || password.length > 128 || password.length < (signup ? 8 : 1)) {
    throw fail(400, signup ? "Use a password between 8 and 128 characters." : "Enter your password.");
  }
  return { email, password };
}
function cookieOptions(path) {
  return { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path };
}
function setSession(res, session) {
  res.cookie("trace_access", session.access_token, { ...cookieOptions("/api"), maxAge: session.expires_in * 1000 });
  res.cookie("trace_refresh", session.refresh_token, { ...cookieOptions("/api/auth"), maxAge: 30 * 24 * 60 * 60 * 1000 });
}
function clearSession(res) {
  res.clearCookie("trace_access", cookieOptions("/api"));
  res.clearCookie("trace_refresh", cookieOptions("/api/auth"));
}
function profile(user) { return { id: user.id, email: user.email }; }

router.post("/signup", limitAttempts, async (req, res) => {
  const { email, password } = credentials(req.body, true);
  const data = await accounts.signUp(email, password, `${req.protocol}://${req.get("Host")}/tracker/`);
  if (data.session) {
    setSession(res, data.session);
    return res.status(201).json({ user: profile(data.user), confirmationRequired: false });
  }
  res.status(201).json({ user: null, confirmationRequired: true, message: "Check your email for a confirmation link, then return here to sign in. If you already have an account, sign in instead." });
});

router.post("/signin", limitAttempts, async (req, res) => {
  const { email, password } = credentials(req.body);
  const data = await accounts.signIn(email, password);
  setSession(res, data.session);
  res.json({ user: profile(data.user) });
});

router.get("/session", accountAuth, (req, res) => res.json({ user: profile(req.account) }));

router.post("/refresh", async (req, res) => {
  const refreshToken = readCookie(req, "trace_refresh");
  if (!refreshToken) throw fail(401, "Please sign in to view your diary.");
  try {
    const data = await accounts.refresh(refreshToken);
    setSession(res, data.session);
    res.json({ user: profile(data.user) });
  } catch (error) {
    if (error.status === 401) clearSession(res);
    throw error;
  }
});

router.post("/signout", async (req, res) => {
  // Always clear this browser's cookies, even if the upstream session expired.
  try { await accounts.signOut(readCookie(req, "trace_access")); }
  catch { /* This browser can still sign out when Supabase cannot be reached. */ }
  clearSession(res);
  res.status(204).end();
});

module.exports = router;
