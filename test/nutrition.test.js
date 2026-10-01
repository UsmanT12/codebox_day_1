const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { randomUUID } = require("node:crypto");
const express = require("express");
const { normalizeFood, fail } = require("../services/foodService");
const nutrition = require("../services/nutrition");

function load(file, overrides = {}, globals = {}) {
  const filename = path.join(__dirname, "..", file);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, exports: module.exports, process: { env: {} }, URL, AbortSignal,
    require: (name) => Object.hasOwn(overrides, name) ? overrides[name] : localRequire(name), ...globals,
  }, { filename });
  return module.exports;
}

const banana = {
  fdcId: 173944, description: "Bananas, raw", dataType: "SR Legacy",
  foodNutrients: [
    { nutrient: { id: 1008, unitName: "kcal" }, amount: 89 },
    { nutrient: { id: 1003, unitName: "g" }, amount: 1.1 },
    { nutrient: { id: 1079, unitName: "g" }, amount: 2.6 },
    { nutrient: { id: 1092, unitName: "mg" }, amount: 358 },
    { nutrient: { id: 1114, unitName: "µg" }, amount: 0 },
    { nutrient: { id: 1178, unitName: "mg" }, amount: 0.001 },
  ],
  foodPortions: [{ amount: 1, modifier: "medium", gramWeight: 118 }],
};

test("USDA detail normalization preserves zero, null, units, and gram portions", () => {
  const food = normalizeFood(banana);
  assert.equal(food.servingAmount, 100);
  assert.equal(food.nutrients.calories, 89);
  assert.equal(food.nutrients.vitaminD, 0);
  assert.equal(food.nutrients.calcium, null);
  assert.equal(food.nutrients.vitaminB12, 1);
  assert.equal(food.portions[0].grams, 118);
});

test("Foundation energy and DFE take precedence without double-counting", () => {
  const food = normalizeFood({ ...banana, foodNutrients: [
    ...banana.foodNutrients,
    { nutrient: { id: 2047, unitName: "kcal" }, amount: 90 },
    { nutrient: { id: 2048, unitName: "kcal" }, amount: 91 },
    { nutrient: { id: 1177, unitName: "ug" }, amount: 20 },
    { nutrient: { id: 1190, unitName: "ug" }, amount: 25 },
  ] });
  assert.equal(food.nutrients.calories, 91);
  assert.equal(food.nutrients.folate, 25);
});

test("missing nutrient arrays and non-gram servings remain usable", () => {
  const food = normalizeFood({ fdcId: 1, description: "Liquid", dataType: "Branded", servingSize: 200, servingSizeUnit: "ml" });
  assert.equal(food.portions.length, 1);
  assert.equal(food.portions[0].id, "oz");
  assert.equal(Object.values(food.nutrients).every((value) => value === null), true);
});

test("status thresholds match requested boundaries", () => {
  const cases = {
    calcium: [[59.99, "red"], [60, "yellow"], [89.99, "yellow"], [90, "green"], [110, "green"], [110.01, "green"]],
    fiber: [[59, "red"], [90, "green"], [111, "orange"]],
    protein: [[59, "red"], [60, "yellow"], [90, "green"], [200, "green"]],
    calories: [[74.99, "red"], [75, "yellow"], [89.99, "yellow"], [90, "green"], [105, "green"], [105.01, "yellow"], [115, "yellow"], [115.01, "orange"]],
    fat: [[64.99, "red"], [65, "yellow"], [80, "green"], [120, "green"], [135, "yellow"], [135.01, "orange"]],
    carbs: [[65, "yellow"], [80, "green"], [120, "green"], [135, "yellow"], [135.01, "orange"]],
  };
  for (const [key, checks] of Object.entries(cases)) {
    for (const [percent, color] of checks) assert.equal(nutrition.status(key, percent).color, color, `${key} at ${percent}%`);
  }
  for (const { key } of nutrition.nutrients.filter((item) => item.group === "micro")) {
    for (const percent of [90, 110, 111, 200, 1000]) {
      assert.equal(nutrition.status(key, percent).color, "green", `${key} at ${percent}%`);
    }
  }
});

test("averages include all seven days, missing values are flagged, labels remain intact", () => {
  const summary = nutrition.summarize([{ nutrients: { calcium: 7000, protein: 1050 } }], 7);
  const calcium = summary.values.find((item) => item.key === "calcium");
  assert.equal(calcium.label, "Calcium");
  assert.equal(calcium.total, 1000);
  assert.equal(calcium.percent, 100);
  assert.equal(summary.values.find((item) => item.key === "iron").missing, 1);
  assert.equal(summary.gaps.length, 3);
  assert.equal(summary.gaps.some((item) => ["calories", "protein", "fat", "carbs"].includes(item.key)), false);
  assert.equal(summary.doingWell.some((item) => item.key === "calcium"), true);
});

test("USDA search prefers nonbranded results and sends the key only upstream", async () => {
  const requests = [];
  const service = load("services/foodService.js", {}, {
    process: { env: { USDA_API_KEY: "test-only-key" } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ foods: [{ ...banana, dataType: requests.length === 1 ? "SR Legacy" : "Branded" }] }) };
    },
  });
  const result = await service.searchFoods("banana");
  assert.equal(requests.length, 2);
  assert.equal(JSON.parse(requests[0].options.body).dataType.includes("Foundation"), true);
  assert.equal(JSON.parse(requests[1].options.body).dataType[0], "Branded");
  assert.equal(result[0].dataType, "SR Legacy");
  assert.equal(requests[0].options.headers["X-Api-Key"], "test-only-key");
  assert.equal(JSON.stringify(result).includes("test-only-key"), false);
});

test("missing USDA configuration, rate limits and network failures are clear errors", async () => {
  const missing = load("services/foodService.js");
  await assert.rejects(missing.searchFoods("banana"), (error) => error.status === 503 && /USDA_API_KEY/.test(error.message));
  for (const status of [403, 429, 500]) {
    const service = load("services/foodService.js", {}, { process: { env: { USDA_API_KEY: "test-key" } }, fetch: async () => ({ ok: false, status }) });
    await assert.rejects(service.getFood(1), (error) => error.status === (status === 500 ? 502 : 503));
  }
});

let rows = [];
const ownerOne = "11111111-1111-4111-8111-111111111111";
const ownerTwo = "22222222-2222-4222-8222-222222222222";
let foodCalls = 0;
let sourceCalories = 89;
let pageCalls = 0;
let dbFailure = null;
const client = {
  from(table) {
    assert.equal(table, "nutrition_logs");
    const query = { mode: "read", filters: [], start: 0, end: 499,
      select() { return this; }, order() { return this; }, single() { this.one = true; return this; },
      gte(key, value) { this.filters.push((row) => row[key] >= value); return this; },
      lte(key, value) { this.filters.push((row) => row[key] <= value); return this; },
      eq(key, value) { this.filters.push((row) => row[key] === value); return this; },
      range(start, end) { this.start = start; this.end = end; return this; },
      insert(row) { this.mode = "insert"; this.row = row; return this; },
      delete() { this.mode = "delete"; return this; },
      async abortSignal() {
        if (dbFailure) return { error: dbFailure, data: null };
        if (this.mode === "insert") {
          const row = JSON.parse(JSON.stringify({ ...this.row, id: randomUUID(), created_at: new Date().toISOString() }));
          rows.push(row); return { data: row, error: null };
        }
        const matching = rows.filter((row) => this.filters.every((filter) => filter(row)));
        if (this.mode === "delete") rows = rows.filter((row) => !matching.includes(row));
        else pageCalls++;
        return { data: this.mode === "delete" ? matching : matching.slice(this.start, this.end + 1), error: null };
      },
    };
    return query;
  },
};
const foods = {
  fail,
  getFood: async () => { foodCalls++; const food = normalizeFood(banana); food.nutrients.calories = sourceCalories; return food; },
  searchFoods: async () => [{ fdcId: banana.fdcId, name: banana.description, dataType: banana.dataType }],
};
const logs = load("services/logService.js", { "../db/supabase": { getSupabase: () => client }, "./foodService": foods });
let server;
let base;
const savedGoals = new Map();
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", load("routes/nutrition.js", {
    "../services/foodService": foods, "../services/logService": logs,
    "../services/accountService": { saveGoals: async (id, goals) => { savedGoals.set(id, goals); } },
    "../middleware/accountAuth": { accountAuth(req, res, next) {
      if (req.get("X-Test-Signed-Out")) return res.status(401).json({ error: "Please sign in." });
      req.account = { id: req.get("X-Test-User") === "second" ? ownerTwo : ownerOne };
      req.account.user_metadata = { nutrition_goals: savedGoals.get(req.account.id) };
      return next();
    } },
  }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  await new Promise((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve());
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server?.listening) await new Promise((resolve) => server.close(resolve)); });

test("goals are validated, private to the account, and used for daily and weekly progress", async () => {
  const goals = { ...nutrition.goalsFor(), calories: 1800, vitaminB12: 3.5 };
  const put = (body, headers = {}) => fetch(`${base}/api/goals`, { method: "PUT", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  assert.equal((await put({ goals }, { "X-Test-Signed-Out": "yes" })).status, 401);
  assert.equal((await put({ goals }, { Origin: "https://example.com" })).status, 403);
  for (const invalid of [null, [], {}, { ...goals, calories: 0 }, { ...goals, calories: -2 }, { ...goals, calories: "2000" }, { ...goals, calories: 100001 }, { ...goals, extra: 1 }]) {
    assert.equal((await put({ goals: invalid })).status, 400);
  }
  assert.equal((await put({ goals, userId: ownerTwo })).status, 200);
  for (const path of ["/logs?date=2026-09-30", "/logs/weekly?end=2026-09-30"]) {
    const own = await (await fetch(`${base}/api${path}`)).json();
    assert.equal(own.summary.values[0].target, 1800);
    const other = await (await fetch(`${base}/api${path}`, { headers: { "X-Test-User": "second" } })).json();
    assert.equal(other.summary.values[0].target, 2200);
  }
  const summary = nutrition.summarize([{ nutrients: { calories: 900 } }], 1, goals);
  assert.equal(summary.values[0].percent, 50);
  assert.equal(nutrition.goalsFor({ calories: 0 }).calories, 2200);
  savedGoals.clear();
});

test("add, reload, weekly averages and delete use immutable snapshots", async () => {
  rows = []; foodCalls = 0; sourceCalories = 89;
  const added = await fetch(`${base}/api/logs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: "2026-09-30", fdcId: 173944, amount: 150, unit: "g", nutrients: { calories: 99999 } }) });
  assert.equal(added.status, 201);
  const row = await added.json();
  assert.equal(row.nutrients.calories, 133.5);
  assert.equal(row.nutrients.calcium, null);
  sourceCalories = 1000;
  const daily = await (await fetch(`${base}/api/logs?date=2026-09-30`)).json();
  assert.equal(daily.summary.values.find((item) => item.key === "calories").total, 133.5);
  const weekly = await (await fetch(`${base}/api/logs/weekly?end=2026-09-30`)).json();
  assert.equal(weekly.start, "2026-09-24");
  assert.equal(weekly.daysLogged, 1);
  assert.equal(weekly.summary.values.find((item) => item.key === "calories").total, 133.5 / 7);
  assert.equal(foodCalls, 1);
  assert.equal((await fetch(`${base}/api/logs/${row.id}`, { method: "DELETE" })).status, 204);
  const empty = await (await fetch(`${base}/api/logs?date=2026-09-30`)).json();
  assert.equal(empty.logs.length, 0);
  assert.equal(empty.summary.values[0].total, 0);
  assert.equal(foodCalls, 1);
});

test("known USDA servings scale by their actual gram weight", async () => {
  rows = []; sourceCalories = 89;
  const row = await logs.addLog(ownerOne, { date: "2026-09-30", fdcId: 173944, amount: 2, unit: "serving", portionId: "portion-0" });
  assert.equal(row.grams, 236);
  assert.equal(row.nutrients.calories, 89 * 2.36);
  await assert.rejects(logs.addLog(ownerOne, { date: "2026-09-30", fdcId: 173944, amount: 2, unit: "serving", portionId: "not-real" }), (error) => error.status === 400);
});

test("normal ounces use weight conversion instead of USDA cooking yields", async () => {
  const food = normalizeFood({ ...banana, foodPortions: [
    { amount: 1, modifier: "oz, yields", gramWeight: 17 },
    { amount: 1, modifier: "large egg", gramWeight: 50 },
  ] });
  assert.equal(food.portions.some((portion) => /yields/i.test(portion.label)), false);
  assert.equal(food.portions.find((portion) => portion.id === "oz").grams, 28.349523125);
  assert.equal(food.portions.some((portion) => /large egg/.test(portion.label)), true);
  sourceCalories = 89;
  const row = await logs.addLog(ownerOne, { date: "2026-09-30", fdcId: 173944, amount: 2, unit: "serving", portionId: "oz" });
  assert.equal(row.grams, 56.69904625);
  assert.equal(row.portion_label, "oz");
  assert.equal(row.nutrients.calories, 89 * 56.69904625 / 100);
});

test("reject invalid dates, quantities, IDs and cross-origin requests", async () => {
  for (const route of ["/logs?date=2026-02-30", "/logs?date=bad", "/foods/not-a-number", "/foods/search?q=a"]) {
    assert.equal((await fetch(`${base}/api${route}`)).status, 400, route);
  }
  for (const amount of [0, -1, "100", 10001]) {
    assert.equal((await fetch(`${base}/api/logs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: "2026-09-30", fdcId: 1, amount, unit: "g" }) })).status, 400);
  }
  assert.equal((await fetch(`${base}/api/logs?date=2026-09-30`, { headers: { Origin: "https://unrelated.example" } })).status, 403);
  assert.equal((await fetch(`${base}/api/logs/not-a-uuid`, { method: "DELETE" })).status, 400);
  assert.equal((await fetch(`${base}/api/logs/${randomUUID()}`, { method: "DELETE" })).status, 404);
});

test("weekly ranges cross month/year boundaries correctly", async () => {
  const result = await (await fetch(`${base}/api/logs/weekly?end=2026-01-02`)).json();
  assert.equal(result.start, "2025-12-27");
  assert.equal(result.days, 7);
});

test("pagination prevents silently incomplete daily totals", async () => {
  rows = Array.from({ length: 1001 }, () => ({ id: randomUUID(), user_id: ownerOne, log_date: "2026-09-30", nutrients: { calories: 1 } }));
  pageCalls = 0;
  const result = await logs.listLogs(ownerOne, "2026-09-30");
  assert.equal(result.length, 1001);
  assert.equal(pageCalls, 3);
  rows = [];
});

test("missing database table produces actionable JSON without upstream secrets", async () => {
  dbFailure = { code: "PGRST205", message: "private upstream detail" };
  try {
    const response = await fetch(`${base}/api/logs?date=2026-09-30`);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.match(body.error, /db\/nutrition.sql/);
    assert.equal(body.error.includes("private upstream detail"), false);
  } finally { dbFailure = null; }
});

test("accounts cannot read or delete another user's entries or unowned legacy entries", async () => {
  rows = [];
  const privateRow = await logs.addLog(ownerOne, { date: "2026-09-30", fdcId: 173944, amount: 100, unit: "g" });
  rows.push({ id: randomUUID(), user_id: null, log_date: "2026-09-30", nutrients: { calories: 9000 } });
  const otherDaily = await (await fetch(`${base}/api/logs?date=2026-09-30`, { headers: { "X-Test-User": "second" } })).json();
  assert.equal(otherDaily.logs.length, 0);
  const otherWeekly = await (await fetch(`${base}/api/logs/weekly?end=2026-09-30`, { headers: { "X-Test-User": "second" } })).json();
  assert.equal(otherWeekly.count, 0);
  assert.equal((await fetch(`${base}/api/logs/${privateRow.id}`, { method: "DELETE", headers: { "X-Test-User": "second" } })).status, 404);
  assert.equal((await logs.listLogs(ownerOne, "2026-09-30")).length, 1);
  await assert.rejects(logs.listLogs(undefined, "2026-09-30"), (error) => error.status === 401);
  assert.equal((await fetch(`${base}/api/logs?date=2026-09-30`, { headers: { "X-Test-Signed-Out": "yes" } })).status, 401);
});

test("new food log owner comes from the verified account, not request JSON", async () => {
  const response = await fetch(`${base}/api/logs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: ownerTwo, date: "2026-09-30", fdcId: 173944, amount: 100, unit: "g" }) });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).user_id, ownerOne);
});
