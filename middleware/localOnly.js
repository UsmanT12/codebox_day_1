module.exports = function localOnly(req, res, next) {
  const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
  const host = ["localhost", "127.0.0.1", "[::1]"].includes(req.hostname);
  if (!local || !host || (req.get("Origin") && req.get("Origin") !== `${req.protocol}://${req.get("Host")}`)) {
    return res.status(403).json({ error: "This food diary is available only on this computer." });
  }
  res.set("Cache-Control", "no-store");
  return next();
};
