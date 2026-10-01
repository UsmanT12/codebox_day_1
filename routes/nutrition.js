const express = require("express");
const foodService = require("../services/foodService");
const logService = require("../services/logService");
const { summarize, nutrients, goalsFor } = require("../services/nutrition");
const accountService = require("../services/accountService");
const localOnly = require("../middleware/localOnly");
const { accountAuth } = require("../middleware/accountAuth");
const router = express.Router();

function dateValue(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw foodService.fail(400, "Use a date in YYYY-MM-DD format.");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value < "1900-01-01" || value > "2100-12-31") {
    throw foodService.fail(400, "Choose a valid date between 1900 and 2100.");
  }
  return value;
}

router.use((req, res, next) => {
  if (!/^\/(foods|logs|goals)(\/|$)/.test(req.path)) return next();
  return localOnly(req, res, (error) => error ? next(error) : accountAuth(req, res, next));
});

router.put("/goals", async (req, res) => {
  const goals = req.body?.goals;
  if (!goals || typeof goals !== "object" || Array.isArray(goals) ||
    Object.keys(goals).some((key) => !nutrients.some((nutrient) => nutrient.key === key)) ||
    nutrients.some(({ key }) => typeof goals[key] !== "number" || !Number.isFinite(goals[key]) || goals[key] < 0.01 || goals[key] > 100000)) {
    throw foodService.fail(400, "Enter a goal between 0.01 and 100,000 for every nutrient.");
  }
  const saved = goalsFor(goals);
  await accountService.saveGoals(req.account.id, saved);
  res.json({ goals: saved });
});

router.get("/foods/search", async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (query.length < 2 || query.length > 120) throw foodService.fail(400, "Search with 2–120 characters.");
  res.json({ foods: await foodService.searchFoods(query) });
});

router.get("/foods/:fdcId", async (req, res) => {
  if (!/^\d{1,10}$/.test(req.params.fdcId) || Number(req.params.fdcId) < 1) throw foodService.fail(400, "Use a valid USDA food ID.");
  res.json(await foodService.getFood(Number(req.params.fdcId)));
});

router.get("/logs/weekly", async (req, res) => {
  const end = dateValue(req.query.end);
  const startDate = new Date(`${end}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate() - 6);
  const start = startDate.toISOString().slice(0, 10);
  const logs = await logService.listLogs(req.account.id, start, end);
  res.json({ start, end, days: 7, daysLogged: new Set(logs.map((log) => log.log_date)).size, count: logs.length, summary: summarize(logs, 7, req.account.user_metadata?.nutrition_goals) });
});

router.get("/logs", async (req, res) => {
  const date = dateValue(req.query.date);
  const logs = await logService.listLogs(req.account.id, date);
  res.json({ date, logs, summary: summarize(logs, 1, req.account.user_metadata?.nutrition_goals) });
});

router.post("/logs", async (req, res) => {
  const { date, fdcId, amount, unit, portionId } = req.body || {};
  dateValue(date);
  if (!Number.isSafeInteger(fdcId) || fdcId <= 0 || fdcId > 9999999999) throw foodService.fail(400, "Choose a valid USDA food.");
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 10000) throw foodService.fail(400, "Enter an amount greater than 0 and no more than 10,000.");
  if (!["g", "serving"].includes(unit)) throw foodService.fail(400, "Choose grams or a USDA serving.");
  if (unit === "serving" && typeof portionId !== "string") throw foodService.fail(400, "Choose a USDA serving.");
  res.status(201).json(await logService.addLog(req.account.id, { date, fdcId, amount, unit, portionId }));
});

router.delete("/logs/:id", async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) throw foodService.fail(400, "Use a valid food entry ID.");
  await logService.deleteLog(req.account.id, req.params.id);
  res.status(204).end();
});

module.exports = router;
