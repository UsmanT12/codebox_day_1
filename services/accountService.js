const { createSupabase } = require("../db/supabase");
const { fail } = require("./foodService");

function client() {
  try { return createSupabase(); }
  catch { throw fail(503, "Accounts are unavailable. Check the Supabase settings in .env."); }
}

function accountError(error, fallback) {
  if (error?.status === 429) return fail(429, "Too many attempts. Please wait a few minutes and try again.");
  if (!error?.status || error.status >= 500) return fail(503, "The account service is unavailable. Please try again.");
  return fail(400, fallback);
}

async function signUp(email, password, redirectTo) {
  const { data, error } = await client().auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
  if (error) throw accountError(error, "Couldn’t create an account. Use a valid email and a stronger password, or sign in if you already have an account.");
  return data;
}

async function signIn(email, password) {
  const { data, error } = await client().auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") throw fail(401, "Confirm your email using the link in your inbox, then sign in.");
    const failure = accountError(error, "Email or password is incorrect.");
    if (failure.status === 400) failure.status = 401;
    throw failure;
  }
  return data;
}

async function verify(token) {
  const { data, error } = await client().auth.getUser(token);
  if (error || !data?.user) {
    if (error && (!error.status || error.status >= 500)) throw fail(503, "The account service is unavailable. Please try again.");
    throw fail(401, "Please sign in to view your diary.");
  }
  return data.user;
}

async function refresh(token) {
  const { data, error } = await client().auth.refreshSession({ refresh_token: token });
  if (error || !data?.session) {
    if (error && (!error.status || error.status >= 500)) throw fail(503, "The account service is unavailable. Please try again.");
    throw fail(401, "Your session has expired. Please sign in again.");
  }
  return data;
}

async function signOut(token) {
  if (token) await client().auth.admin.signOut(token, "local");
}

async function saveGoals(userId, goals) {
  const { error } = await client().auth.admin.updateUserById(userId, { user_metadata: { nutrition_goals: goals } });
  if (error) throw accountError(error, "Couldn’t save your daily goals. Please try again.");
}

module.exports = { signUp, signIn, verify, refresh, signOut, saveGoals };
