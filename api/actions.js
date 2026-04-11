const enviarHandler = require("../lib/handlers/enviar");
const enviarCatHandler = require("../lib/handlers/enviar-cat");
const deletarHandler = require("../lib/handlers/deletar");

const routes = {
  enviar: enviarHandler,
  "enviar-cat": enviarCatHandler,
  deletar: deletarHandler,
};

module.exports = async (req, res) => {
  const route = req.query?.route;
  const handler = routes[route];

  if (!handler) {
    return res.status(404).json({ error: "Rota nao encontrada." });
  }

  return handler(req, res);
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
