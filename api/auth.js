const authHandler = require("../lib/handlers/auth");
const verifyAdminHandler = require("../lib/handlers/verificar-admin");

module.exports = async (req, res) => {
  const route = req.query?.route || "auth";

  if (route === "verificar-admin") {
    return verifyAdminHandler(req, res);
  }

  return authHandler(req, res);
};
