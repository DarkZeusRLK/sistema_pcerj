const consultarFichaHandler = require("../lib/handlers/consultar-ficha");
const relatorioHandler = require("../lib/handlers/relatorio");
const logsPortesHandler = require("../lib/handlers/logs-portes");

const routes = {
  "consultar-ficha": consultarFichaHandler,
  relatorio: relatorioHandler,
  "logs-portes": logsPortesHandler,
};

module.exports = async (req, res) => {
  const route = req.query?.route;
  const handler = routes[route];

  if (!handler) {
    return res.status(404).json({ error: "Rota nao encontrada." });
  }

  return handler(req, res);
};
