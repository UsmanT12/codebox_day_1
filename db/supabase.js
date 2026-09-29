const { createClient } = require("@supabase/supabase-js");

let client;

function getSupabase() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in your local .env file.");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("SUPABASE_URL must be your project's HTTPS URL.");
  }
  if (parsedUrl.protocol !== "https:" || !key.startsWith("sb_secret_")) {
    throw new Error("Use an HTTPS SUPABASE_URL and a server secret API key (sb_secret_...).");
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

module.exports = { getSupabase };
