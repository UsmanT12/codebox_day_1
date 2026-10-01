require("dotenv").config({ quiet: true });
const { getSupabase } = require("../db/supabase");

async function check() {
  const keyReady = Boolean(process.env.USDA_API_KEY?.trim());
  console.log(`USDA_API_KEY: ${keyReady ? "configured" : "missing (add it to .env)"}`);
  const { error } = await getSupabase().from("nutrition_logs").select("id,user_id").limit(1)
    .abortSignal(AbortSignal.timeout(10000));
  if (error) {
    console.error(["42703", "PGRST204"].includes(error.code)
      ? "Account ownership column missing: run db/accounts.sql in your Supabase SQL Editor."
      : ["PGRST205", "42P01"].includes(error.code)
      ? "Nutrition table missing: run db/nutrition.sql in your Supabase SQL Editor."
      : "Unable to read nutrition_logs. Check your Supabase credentials and network.");
    process.exitCode = 1;
    return;
  }
  console.log("Supabase nutrition_logs: connected and readable.");
  if (!keyReady) process.exitCode = 1;
}
check().catch(() => { console.error("Nutrition setup check failed. Check .env and your network."); process.exitCode = 1; });
