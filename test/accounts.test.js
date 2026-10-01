const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const express = require("express");

function load(file, overrides = {}) {
  const filename = path.join(__dirname, "..", file);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, process: { env: {} },
    require: (name) => Object.hasOwn(overrides, name) ? overrides[name] : localRequire(name),
  }, { filename });
  return module.exports;
}
const user = { id: "11111111-1111-4111-8111-111111111111", email: "test@example.com" };
const session = { access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600 };
let clientsCreated = 0;
let goalUpdate;
let goalUpdateError = null;
const service = load("services/accountService.js", { "../db/supabase": { createSupabase() {
  clientsCreated++;
  return { auth: {
    signUp: async () => ({ data: { user, session: null }, error: null }),
    signInWithPassword: async ({ password }) => password === "correct-password" ? { data: { user, session }, error: null } : { data: {}, error: { status: 400, code: "invalid_credentials" } },
    getUser: async (token) => token === session.access_token ? { data: { user }, error: null } : { data: {}, error: { status: 401 } },
    refreshSession: async ({ refresh_token }) => refresh_token === session.refresh_token ? { data: { user, session }, error: null } : { data: {}, error: { status: 400 } },
    admin: {
      signOut: async () => ({ error: null }),
      updateUserById: async (id, attributes) => { goalUpdate = { id, attributes }; return { error: goalUpdateError }; },
    },
  } };
} } });
const middleware = load("middleware/accountAuth.js", { "../services/accountService": service });
test("daily goals update only the requested user's preference metadata and report storage failures", async () => {
  await service.saveGoals(user.id, { calories: 1800 });
  assert.equal(goalUpdate.id, user.id);
  assert.equal(goalUpdate.attributes.user_metadata.nutrition_goals.calories, 1800);
  assert.deepEqual(Object.keys(goalUpdate.attributes), ["user_metadata"]);
  goalUpdateError = { status: 503 };
  try { await assert.rejects(service.saveGoals(user.id, {}), (error) => error.status === 503); }
  finally { goalUpdateError = null; }
});
let server;
let base;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", load("routes/accounts.js", { "../services/accountService": service, "../middleware/accountAuth": middleware }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  await new Promise((resolve, reject) => { server = app.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve()); });
  base = `http://127.0.0.1:${server.address().port}/api/auth`;
});
after(async () => { if (server?.listening) await new Promise((resolve) => server.close(resolve)); });
function post(route, body, headers = {}) {
  return fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

test("sign-up supports email confirmation without issuing a premature session", async () => {
  const response = await post("/signup", { email: user.email, password: "correct-password" });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).confirmationRequired, true);
  assert.equal(response.headers.has("set-cookie"), false);
});
test("sign-in verifies credentials and sets HTTP-only same-site cookies", async () => {
  const response = await post("/signin", { email: user.email, password: "correct-password" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { user });
  assert.equal(JSON.stringify(body).includes("test-access"), false);
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  for (const cookie of cookies) { assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); }
  assert.match(cookies[1], /Path=\/api\/auth/);
});
test("wrong credentials fail with 401 and no session cookie", async () => {
  const response = await post("/signin", { email: user.email, password: "wrong-password" });
  assert.equal(response.status, 401);
  assert.equal(response.headers.has("set-cookie"), false);
});
test("session requires a remotely verified Supabase token; demo Bearer tokens do not authenticate", async () => {
  assert.equal((await fetch(base + "/session")).status, 401);
  assert.equal((await fetch(base + "/session", { headers: { Authorization: "Bearer demo-token" } })).status, 401);
  assert.equal((await fetch(base + "/session", { headers: { Cookie: "trace_access=forged" } })).status, 401);
  const response = await fetch(base + "/session", { headers: { Cookie: "trace_access=test-access" } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user });
});
test("refresh renews cookies; invalid refresh clears them", async () => {
  const success = await post("/refresh", {}, { Cookie: "trace_refresh=test-refresh" });
  assert.equal(success.status, 200);
  assert.equal(success.headers.getSetCookie().length, 2);
  const failure = await post("/refresh", {}, { Cookie: "trace_refresh=invalid" });
  assert.equal(failure.status, 401);
  assert.match(failure.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/);
});
test("sign-out clears both cookies", async () => {
  const response = await post("/signout", {}, { Cookie: "trace_access=test-access" });
  assert.equal(response.status, 204);
  assert.equal(response.headers.getSetCookie().length, 2);
  for (const cookie of response.headers.getSetCookie()) assert.match(cookie, /Expires=Thu, 01 Jan 1970/);
});
test("cross-origin sign-in and invalid sign-up input are rejected", async () => {
  assert.equal((await post("/signin", { email: user.email, password: "correct-password" }, { Origin: "https://unrelated.example" })).status, 403);
  assert.equal((await post("/signup", { email: user.email, password: "short" })).status, 400);
  assert.equal((await post("/signup", { email: "invalid", password: "correct-password" })).status, 400);
});
test("authentication operations never reuse a mutable authenticated client", async () => {
  const beforeCount = clientsCreated;
  await service.verify("test-access");
  await service.signIn(user.email, "correct-password");
  assert.equal(clientsCreated - beforeCount, 2);
});
