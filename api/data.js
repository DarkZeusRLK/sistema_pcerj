const listarHandler = require("../lib/handlers/listar");
const listarRevogacoesHandler = require("../lib/handlers/listar-revogacoes");
const listarMembrosHandler = require("../lib/handlers/listar-membros");
const buscarMembrosHandler = require("../lib/handlers/buscar-membros");
const consultarPortesHandler = require("../lib/handlers/consultar-portes");

const routes = {
  listar: listarHandler,
  "listar-revogacoes": listarRevogacoesHandler,
  "listar-membros": listarMembrosHandler,
  "buscar-membros": buscarMembrosHandler,
  "consultar-portes": consultarPortesHandler,
};

module.exports = async (req, res) => {
  const route = req.query?.route;
  const handler = routes[route];

  if (!handler) {
    return res.status(404).json({ error: "Rota nao encontrada." });
  }

  return handler(req, res);
};
