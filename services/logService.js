const { getSupabase } = require("../db/supabase");
const { getFood, fail } = require("./foodService");
const { nutrients } = require("./nutrition");

function database() {
  try { return getSupabase(); }
  catch { throw fail(503, "Add SUPABASE_URL and SUPABASE_SECRET_KEY to .env, then restart the server."); }
}

function check(error) {
  if (!error) return;
  if (["42703", "PGRST204"].includes(error.code)) {
    throw fail(503, "Finish account setup by running db/accounts.sql in the Supabase SQL Editor.");
  }
  if (["PGRST205", "42P01"].includes(error.code)) {
    throw fail(503, "Set up your food diary by running db/nutrition.sql in the Supabase SQL Editor.");
  }
  throw fail(503, "The food diary database is unavailable. Check your Supabase setup and try again.");
}

function requireOwner(userId) {
  if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw fail(401, "Please sign in to view your diary.");
  }
}

async function listLogs(userId, start, end = start) {
  requireOwner(userId);
  const rows = [];
  // PostgREST caps each page. Page explicitly so weekly totals never silently truncate.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await database().from("nutrition_logs").select("*")
      .eq("user_id", userId)
      .gte("log_date", start).lte("log_date", end)
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(offset, offset + 499).abortSignal(AbortSignal.timeout(10000));
    check(error);
    rows.push(...data);
    if (data.length < 500) break;
  }
  return rows;
}

async function addLog(userId, { date, fdcId, amount, unit, portionId }) {
  requireOwner(userId);
  const food = await getFood(fdcId);
  const portion = unit === "serving" ? food.portions.find((item) => item.id === portionId) : null;
  if (unit === "serving" && !portion) throw fail(400, "Choose a serving with a known gram weight, or use grams.");
  const grams = unit === "g" ? amount : amount * portion.grams;
  if (!Number.isFinite(grams) || grams <= 0 || grams > 10000) throw fail(400, "Use an amount greater than 0 and no more than 10,000 g.");
  const snapshot = Object.fromEntries(nutrients.map(({ key }) => [key,
    food.nutrients[key] === null ? null : food.nutrients[key] * grams / 100,
  ]));
  const row = {
    user_id: userId,
    log_date: date, fdc_id: fdcId, food_name: food.name, data_type: food.dataType,
    amount, unit, grams, portion_label: portion?.label || null,
    nutrients: snapshot, nutrients_per_100g: food.nutrients,
  };
  const { data, error } = await database().from("nutrition_logs").insert(row).select().single()
    .abortSignal(AbortSignal.timeout(10000));
  check(error);
  return data;
}

async function deleteLog(userId, id) {
  requireOwner(userId);
  const { data, error } = await database().from("nutrition_logs").delete().eq("user_id", userId).eq("id", id).select("id")
    .abortSignal(AbortSignal.timeout(10000));
  check(error);
  if (!data.length) throw fail(404, "That food entry no longer exists.");
}

module.exports = { listLogs, addLog, deleteLog };
