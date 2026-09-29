const jwt = require("jsonwebtoken");

const secret = process.env.JWT_SECRET;

if (!secret || !secret.trim()) {
  throw new Error("JWT_SECRET is required. Set it in your local .env file.");
}

function auth(req, res, next) {
  const authorization = req.get("Authorization");
  const match = authorization && authorization.match(/^Bearer ([^\s]+)$/i);

  if (!match) {
    return res.status(401).json({ error: "Bearer token required" });
  }

  try {
    const payload = jwt.verify(match[1], secret, { algorithms: ["HS256"] });

    if (typeof payload.exp !== "number" || typeof payload.sub !== "string") {
      return res.status(401).json({ error: "Invalid token" });
    }

    req.auth = payload;
  } catch (error) {
    const message = error.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
    return res.status(401).json({ error: message });
  }

  next();
}

module.exports = auth;
