# Codebox

A local nutrition diary built with Express, CommonJS JavaScript, Supabase, USDA
FoodData Central, and React with Vite and CSS. The earlier bootcamp routes are
still available.

## Nutrition tracker setup

Requires Node.js 22 or newer. Run `npm install`, then keep the existing `PORT`,
`JWT_SECRET`, `SUPABASE_URL`, and `SUPABASE_SECRET_KEY` entries in `.env`.

1. Get a USDA API key at https://fdc.nal.usda.gov/api-key-signup/ and add
   `USDA_API_KEY=your-key` to `.env`. The browser never receives this key.
2. Run `db/nutrition.sql` in your Supabase project's SQL Editor. This creates a
   separate `nutrition_logs` table; it does not modify existing user data.
   Then run `db/accounts.sql` to add private ownership and access policies.
3. Run `npm run nutrition:check` to check configuration and read access to the
   table. This does not write data or validate the USDA key remotely.
4. Run `npm run dev` to build React and start Express, then open
   **http://localhost:3000/tracker/**. If you change `PORT`, use that port in the
   browser. Restart this command and refresh the browser after code changes.
   There is no separate frontend server or automatic browser reload.

Enter a food and quantity together (grams, ounces, or servings), search, select
a match, and click Add
food. Pick a different date for past entries. Delete removes that entry and
refreshes totals. Weekly shows the seven calendar days ending on the selected
date; averages always divide by seven, including days with no logs.

Each Supabase Auth account has a private diary. Use **Daily goals** beside the
date to edit calorie, macro, and micronutrient targets. Save applies the goals
to daily and weekly progress, including past dates; logged food amounts stay
unchanged. Reset to defaults fills the form; Save commits the reset.
Goals are stored in the account's Supabase user metadata and follow the account
across devices. No new SQL migration is required. `PUT /api/goals` validates all
13 targets and updates only the verified account.
Nutrition API routes accept loopback requests only and reject browser requests
from another origin, so the app is still intended to run locally. The earlier
JWT demonstration remains separate and cannot authenticate diary requests.

### User accounts

1. Run `db/accounts.sql` in Supabase's SQL Editor after `db/nutrition.sql`.
2. In Supabase Authentication, enable the Email provider if it is disabled.
   Leave email confirmation enabled. Under URL Configuration, allow your local
   tracker URL, for example `http://localhost:3002/tracker/` if PORT is 3002.
   Set Site URL to that same address so confirmation links return to your app.
3. Restart Express, open the tracker, and choose **Create an account**. After
   confirming the email, sign in using your email and password.

Supabase handles password storage and verification. Express keeps the access
and refresh tokens in HTTP-only, SameSite=Strict cookies; no tokens or secrets
are returned to frontend JavaScript or put in browser storage. Refresh tokens
are restricted to `/api/auth`. Cookies use Secure in production. Successful
sign-out clears both cookies and requests session revocation from Supabase.

Every diary API request verifies the access token with Supabase. A new Auth
client is created for each authentication operation so sessions cannot leak
between users through a shared client. The database service uses the private
server client and explicitly filters every read/delete by the verified user ID;
inserts set the owner server-side and ignore any client-supplied owner. Row Level
Security separately restricts direct authenticated database access to owned rows.

Old shared logs are preserved with a NULL `user_id` and do not appear in any
account. Do not assign them to the first person who signs up. If these were your
personal entries, their ownership can be migrated deliberately after your account
exists. No existing entries are deleted by the account migration.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/signup` | Email/password sign-up; may require email confirmation |
| POST | `/api/auth/signin` | Verify credentials and set session cookies |
| GET | `/api/auth/session` | Return the verified account's ID and email |
| POST | `/api/auth/refresh` | Renew the session using its HTTP-only refresh cookie |
| POST | `/api/auth/signout` | Clear this browser's session |

`/api/foods/*` and `/api/logs/*` now require a signed-in account. The example curl
requests below return 401 without session cookies; use the signed-in browser for
normal food logging. The practice `/api/users` and `/api/me` routes still behave
as before. Account tests use mocks and never send confirmation emails.

Auth reference: https://supabase.com/docs/guides/auth/passwords

### Data and calculations

- Food search prefers Foundation, SR Legacy, and Survey (FNDDS); branded foods
  fill remaining result slots. At most eight matches are returned.
- USDA nutrient IDs are mapped to thirteen tracked nutrients per 100 g. Energy
  prefers Atwater-specific, then Atwater-general, then the older energy value.
  Folate prefers dietary folate equivalents (DFE), then total folate where DFE
  is absent. Source nutrient units are converted to the displayed units.
- Servings are offered only when USDA supplies a gram weight. No ml-to-gram
  conversion is guessed. You can always enter grams.
- Standard ounces are available for every food: 1 oz = 28.349523125 g. USDA
  ounce/yield portions are excluded from the selector. Ounces are weight units,
  not fluid ounces, and are saved as a fixed-weight portion without a schema change.
- Missing nutrient values remain `null` in food details and snapshots. Totals
  sum known values (missing contributes zero) and flag incomplete data. They
  cannot prove a nutrient deficiency or excess.
- Adding a food retrieves trusted details on the backend and saves both its
  per-100-g values and scaled consumed nutrients. Daily, weekly, and deletion
  use saved snapshots and never fetch historical nutrition from USDA.
- The targets and exact status thresholds live in `services/nutrition.js`.
  React renders the summaries calculated by the server. Gaps and highlights use micronutrients
  and fiber. Above-target intake is not a diagnosis of toxicity.
- Saved food details are cached in memory for ten minutes (at most 100 foods)
  to avoid fetching the same selected food twice. Food logs persist in Supabase.

### Nutrition API

| Method | URL | Purpose |
| --- | --- | --- |
| GET | `/api/foods/search?q=banana` | Search real USDA foods |
| GET | `/api/foods/:fdcId` | Normalized nutrients and known portions |
| GET | `/api/logs?date=YYYY-MM-DD` | Saved daily entries and totals |
| POST | `/api/logs` | Save a nutrient snapshot; returns 201 |
| DELETE | `/api/logs/:id` | Delete one saved entry; returns 204 |
| GET | `/api/logs/weekly?end=YYYY-MM-DD` | Seven-day average and rankings |

POST JSON example (replace the food ID with a search result):

```json
{"date":"2026-09-30","fdcId":173944,"amount":150,"unit":"g"}
```

For portions, use `"unit":"serving"`, a serving count in `amount`, and the
`portionId` returned by the food details endpoint. Client-supplied nutrient
values are ignored. Invalid input returns 400; missing entries return 404;
database/configuration outages return 503 and upstream food-service errors 502.

```bash
curl -i 'http://localhost:3000/api/foods/search?q=banana'
curl -i 'http://localhost:3000/api/logs?date=2026-09-30'
curl -i 'http://localhost:3000/api/logs/weekly?end=2026-09-30'
npm test
```

USDA references: https://fdc.nal.usda.gov/api-guide/ and
https://fdc.nal.usda.gov/Foundation_Foods_Documentation/

## Run locally

```bash
npm install
```

If `.env` does not exist, copy `.env.example` to `.env`. Set `JWT_SECRET` to a
random secret locally; never commit it or share it. To generate one without
printing it, run this only after creating `.env` with an empty `JWT_SECRET=`:

```bash
node -e 'const fs = require("node:fs"); const crypto = require("node:crypto"); const file = ".env"; const content = fs.readFileSync(file, "utf8"); if (!/^JWT_SECRET=$/m.test(content)) throw new Error("Expected an empty JWT_SECRET entry; existing secrets were not changed"); fs.writeFileSync(file, content.replace(/^JWT_SECRET=$/m, "JWT_SECRET=" + crypto.randomBytes(48).toString("hex")), { mode: 0o600 });'
```

```bash
npm run dev
```

The server uses `PORT` from `.env`, or port 3000 by default. Restart it after
editing code. Keep the server running while testing in another terminal.

## Routes

| Method | URL | Response |
| --- | --- | --- |
| GET | `/` | 200: `Hello from codebox!` |
| GET | `/api/users` | 200: JSON array of Alex and Sam |
| GET | `/api/users/:id` | 200: JSON user, or 404: JSON error |
| GET | `/api/me` | 200: JSON user with a valid token, or 401: JSON error |

```bash
curl -i http://localhost:3000/
curl -i http://localhost:3000/api/users
curl -i http://localhost:3000/api/users/1
curl -i http://localhost:3000/api/users/999
curl -i http://localhost:3000/api/me
```

From the project folder, generate a token and test the protected route:

```bash
TOKEN=$(npm run --silent token)
curl -i http://localhost:3000/api/me -H "Authorization: Bearer $TOKEN"
curl -i http://localhost:3000/api/me -H "Authorization: Bearer x$TOKEN"
```

These last two requests return 200 and 401 respectively. Tokens expire after
15 minutes. The local token script is a teaching shortcut that signs user 1's
identity without checking credentials; it is not a real login system.

## Structure

- `frontend/src/`: React components, API client, and styles; `main.jsx` mounts the app.
- `frontend/src/App.jsx`: account screens and session state.
- `frontend/src/Diary.jsx`: diary dates, views, and API requests.
- `frontend/src/FoodSearch.jsx`: food search, quantity, and portion entry.
- `frontend/src/Dashboard.jsx`: nutrition summaries and saved food entries.
- `vite.config.mjs`: builds frontend assets for the `/tracker/` URL.
- `dist/`: generated frontend, ignored by Git. `npm run build` recreates it;
  `npm start` serves an existing build. `npm run dev` does both.
- `server.js`: configuration, route mounting, and startup.
- `routes/users.js`: user HTTP handlers.
- `services/userService.js`: temporary user data and lookup logic.
- `middleware/auth.js`: HS256 JWT signature and expiration verification.
- `scripts/token.js`: local demonstration token generation.
- `.env.example`: configuration placeholders, safe to commit.
- `.env`: private local configuration, ignored by Git.

## Configure Supabase

1. Create a project at https://supabase.com/dashboard.
2. Copy its Project URL from the Connect dialog. Find or create a secret API key
   in Settings > API Keys. Use the key starting with `sb_secret_`.
3. Add these values to your existing local `.env` without changing `JWT_SECRET`:

   ```dotenv
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SECRET_KEY=your-server-secret-key
   ```

4. Open the project's SQL Editor and run the contents of `db/setup.sql`.
5. Run `npm run db:check`. Success prints:
   `Supabase connection verified: sample users 1 and 2 are readable.`

`db/supabase.js` creates a reusable backend client; `scripts/check-db.js` checks
database access. The setup SQL enables Row Level Security and keeps the sample
table inaccessible to anonymous and signed-in client roles. The server secret
key bypasses Row Level Security, so keep it only in local/server configuration.
It is separate from the JWT secret used by the bootcamp's demonstration tokens.

Existing API routes still use the in-memory service. The database exercise
configures credentials and verifies a real query without changing those routes.

Reference: https://supabase.com/docs/guides/getting-started/api-keys
