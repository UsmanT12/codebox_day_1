const express = require("express");
const userService = require("../services/userService");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(userService.getAllUsers());
});

router.get("/:id", (req, res) => {
  const user = userService.getUserById(req.params.id);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.status(200).json(user);
});

module.exports = router;
