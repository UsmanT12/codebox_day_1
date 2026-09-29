require("dotenv").config({ quiet: true });

const jwt = require("jsonwebtoken");
const secret = process.env.JWT_SECRET;

if (!secret || !secret.trim()) {
  throw new Error("JWT_SECRET is required. Set it in your local .env file.");
}

// Teaching shortcut: this signs a sample identity without checking credentials.
const token = jwt.sign({}, secret, {
  algorithm: "HS256",
  subject: "1",
  expiresIn: "15m",
});

console.log(token);
