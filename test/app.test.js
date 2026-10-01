const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { randomBytes } = require("node:crypto");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const express = require("express");

const root = path.resolve(__dirname, "..");
const secret = randomBytes(32).toString("hex");

// Execute a fresh module with isolated configuration; never load the local .env.
function load(file, env = {}, overrides = {}, output = []) {
  const filename = path.join(root, file);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  const process = { env, exitCode: 0 };
  const context = {
    module, exports: module.exports, process, URL, AbortSignal, __dirname: path.dirname(filename),
    console: { log: (value) => output.push(value), error: (value) => output.push(value) },
    require: (name) => {
      if (name === "dotenv") return { config() {} };
      if (Object.hasOwn(overrides, name)) return overrides[name];
      return localRequire(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
  return { exports: module.exports, process };
}

let server;
let base;
before(async () => {
  const auth = load("middleware/auth.js", { JWT_SECRET: secret }).exports;
  const app = express();
  app.listen = (port) => assert.equal(port, 3000);
  load("server.js", { JWT_SECRET: secret }, {
    express: Object.assign(() => app, express),
    "./middleware/auth": auth,
  });
  server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
});

async function request(route, expectedStatus, expectedBody, token) {
  const headers = token === undefined ? {} : { Authorization: `Bearer ${token}` };
  const response = await fetch(`${base}${route}`, { headers });
  assert.equal(response.status, expectedStatus);
  if (typeof expectedBody === "string") {
    assert.equal(await response.text(), expectedBody);
  } else {
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.deepEqual(await response.json(), expectedBody);
  }
}
function sign(payload = {}, options = {}) {
  return jwt.sign(payload, secret, { algorithm: "HS256", subject: "1", expiresIn: "15m", ...options });
}

test("public greeting is unchanged", () => request("/", 200, "Hello from codebox!"));
test("public list returns both users", () => request("/api/users", 200, [{ id: 1, name: "Alex" }, { id: 2, name: "Sam" }]));
for (const [id, name] of [[1, "Alex"], [2, "Sam"]]) {
  test(`public user ${id}`, () => request(`/api/users/${id}`, 200, { id, name }));
}
for (const id of ["999", "invalid"]) {
  test(`unknown user ${id} returns JSON 404`, () => request(`/api/users/${id}`, 404, { error: "User not found" }));
}
test("missing token", () => request("/api/me", 401, { error: "Bearer token required" }));
test("valid token returns sample profile", () => request("/api/me", 200, { id: 1, name: "Alex" }, sign()));
test("tampered token", () => request("/api/me", 401, { error: "Invalid token" }, `x${sign()}`));
test("expired token", () => request("/api/me", 401, { error: "Token expired" }, sign({}, { expiresIn: -1 })));
test("wrong algorithm", () => request("/api/me", 401, { error: "Invalid token" }, sign({}, { algorithm: "HS384" })));
test("different signing secret", () => request("/api/me", 401, { error: "Invalid token" }, jwt.sign({}, randomBytes(32), { subject: "1", expiresIn: "15m" })));
test("token without expiry", () => request("/api/me", 401, { error: "Invalid token" }, jwt.sign({}, secret, { subject: "1" })));
test("token without subject", () => request("/api/me", 401, { error: "Invalid token" }, jwt.sign({}, secret, { expiresIn: "15m" })));
test("unknown token subject", () => request("/api/me", 401, { error: "Invalid token" }, sign({}, { subject: "999" })));

for (const value of [undefined, "", "   "]) {
  test(`auth and token generation reject ${JSON.stringify(value)} secret`, () => {
    assert.throws(() => loadAuth(value), /JWT_SECRET is required/);
    assert.throws(() => load("scripts/token.js", { JWT_SECRET: value }), /JWT_SECRET is required/);
  });
}
function loadAuth(value) {
  return load("middleware/auth.js", { JWT_SECRET: value }).exports;
}
test("token script signs HS256 subject 1 for exactly 15 minutes", () => {
  const output = [];
  load("scripts/token.js", { JWT_SECRET: secret }, {}, output);
  assert.equal(output.length, 1);
  const payload = jwt.verify(output[0], secret, { algorithms: ["HS256"] });
  assert.equal(payload.sub, "1");
  assert.equal(payload.exp - payload.iat, 900);
});

const dbEnv = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_test_placeholder" };
for (const [label, env] of [
  ["missing", {}], ["malformed URL", { ...dbEnv, SUPABASE_URL: "invalid" }],
  ["HTTP URL", { ...dbEnv, SUPABASE_URL: "http://example.supabase.co" }],
  ["nonsecret key", { ...dbEnv, SUPABASE_SECRET_KEY: "public-placeholder" }],
]) {
  test(`database rejects ${label} configuration before connecting`, () => {
    const { getSupabase } = load("db/supabase.js", env, {
      "@supabase/supabase-js": { createClient() { assert.fail("must not connect"); } },
    }).exports;
    assert.throws(getSupabase, /SUPABASE_URL/);
  });
}
test("database client is cached and disables session persistence", () => {
  let calls = 0;
  const client = {};
  const { getSupabase } = load("db/supabase.js", dbEnv, {
    "@supabase/supabase-js": { createClient(url, key, options) {
      calls++;
      assert.equal(url, dbEnv.SUPABASE_URL);
      assert.equal(key, dbEnv.SUPABASE_SECRET_KEY);
      assert.equal(options.auth.persistSession, false);
      assert.equal(options.auth.autoRefreshToken, false);
      return client;
    } },
  }).exports;
  assert.equal(getSupabase(), client);
  assert.equal(getSupabase(), client);
  assert.equal(calls, 1);
});

for (const [label, result, exitCode, message] of [
  ["success", { data: [{ id: 1 }, { id: 2 }], error: null }, 0, /connection verified/],
  ["query error", { data: null, error: { message: "sensitive upstream detail" } }, 1, /Database check failed/],
  ["missing sample rows", { data: [], error: null }, 1, /sample users are missing/],
]) {
  test(`database check handles ${label} without live database access`, async () => {
    const output = [];
    const query = {
      from(table) { assert.equal(table, "codebox_users"); return this; },
      select(columns) { assert.equal(columns, "id, name"); return this; },
      order(column) { assert.equal(column, "id"); return this; },
      limit(count) { assert.equal(count, 2); return this; },
      abortSignal(signal) { assert.equal(signal.aborted, false); return Promise.resolve(result); },
    };
    const execution = load("scripts/check-db.js", {}, { "../db/supabase": { getSupabase: () => query } }, output);
    await new Promise(setImmediate);
    assert.equal(execution.process.exitCode, exitCode);
    assert.match(output.join("\n"), message);
    assert.doesNotMatch(output.join("\n"), /sensitive upstream detail/);
  });
}
test("database check reports configuration failure", async () => {
  const output = [];
  const execution = load("scripts/check-db.js", {}, {
    "../db/supabase": { getSupabase() { throw new Error("Missing database configuration"); } },
  }, output);
  await new Promise(setImmediate);
  assert.equal(execution.process.exitCode, 1);
  assert.deepEqual(output, ["Missing database configuration"]);
});

// Express 5 passes listen errors to this callback.
test("startup does not report success when its port is occupied", () => {
  const output = [];
  const app = express();
  app.listen = (port, callback) => callback(Object.assign(new Error("Port occupied"), { code: "EADDRINUSE" }));
  const execution = load("server.js", { JWT_SECRET: secret }, {
    express: Object.assign(() => app, express),
    "./middleware/auth": loadAuth(secret),
  }, output);
  assert.equal(output.some((line) => line.includes("Server running")), false);
  assert.match(output.join("\n"), /Failed to start server on port 3000: EADDRINUSE/);
  assert.equal(execution.process.exitCode, 1);
});
