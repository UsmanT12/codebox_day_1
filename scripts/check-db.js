require("dotenv").config({ quiet: true });

const { getSupabase } = require("../db/supabase");

async function checkDatabase() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("codebox_users")
    .select("id, name")
    .order("id")
    .limit(2)
    .abortSignal(AbortSignal.timeout(10000));

  if (error) {
    throw new Error("Database check failed. Verify your Supabase URL/key, network, and that db/setup.sql has been run.");
  }
  if (data.length !== 2 || data[0].id !== 1 || data[1].id !== 2) {
    throw new Error("Connected, but sample users are missing. Run db/setup.sql in Supabase.");
  }

  console.log("Supabase connection verified: sample users 1 and 2 are readable.");
}

checkDatabase().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
