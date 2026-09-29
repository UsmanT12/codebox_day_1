# Codebox

A small Express app written in JavaScript using CommonJS modules.

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
