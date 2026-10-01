const accountService = require("../services/accountService");

function readCookie(req, name) {
  const part = (req.get("Cookie") || "").split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  if (!part) return null;
  try { return decodeURIComponent(part.slice(name.length + 1)); }
  catch { return null; }
}

async function accountAuth(req, res, next) {
  const token = readCookie(req, "trace_access");
  if (!token) return res.status(401).json({ error: "Please sign in to view your diary." });
  req.account = await accountService.verify(token);
  next();
}

module.exports = { accountAuth, readCookie };
