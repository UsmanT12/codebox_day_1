require("dotenv").config({ quiet: true });

const express = require("express");
const userRoutes = require("./routes/users");
const auth = require("./middleware/auth");
const userService = require("./services/userService");
const nutritionRoutes = require("./routes/nutrition");
const accountRoutes = require("./routes/accounts");
const path = require("node:path");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "16kb" }));
app.use("/tracker", express.static(path.join(__dirname, "dist")));
app.use("/api/auth", accountRoutes);
app.use("/api", nutritionRoutes);

app.get("/", (req, res) => {
  res.send("Hello from codebox!");
});

app.use("/api/users", userRoutes);

app.get("/api/me", auth, (req, res) => {
  const user = userService.getUserById(req.auth.sub);

  if (!user) {
    return res.status(401).json({ error: "Invalid token" });
  }

  res.json(user);
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  const message = error.type === "entity.parse.failed" ? "Request body must be valid JSON."
    : error.type === "entity.too.large" ? "Request body is too large."
    : status < 500 || error.status ? error.message : "Something went wrong. Please try again.";
  res.status(status).json({ error: message });
});

app.listen(port, (error) => {
  if (error) {
    console.error(`Failed to start server on port ${port}: ${error.code || error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Server running at http://localhost:${port}`);
});
