require("dotenv").config({ quiet: true });

const express = require("express");
const userRoutes = require("./routes/users");
const auth = require("./middleware/auth");
const userService = require("./services/userService");

const app = express();
const port = Number(process.env.PORT || 3000);

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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
