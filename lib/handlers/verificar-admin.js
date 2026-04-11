const { requireAdmin } = require("../admin");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Session-User-Id"
  );

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const admin = await requireAdmin(req);
    return res.status(200).json({ isAdmin: true, roles: admin.userRoles });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      isAdmin: false,
      error: error.message,
    });
  }
};
