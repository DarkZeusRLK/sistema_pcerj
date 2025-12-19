// api/enviar.js
const Busboy = require("busboy");
const FormData = require("form-data");
const fetch = require("node-fetch");

// Desativa o body-parser padrão da Vercel
module.exports = (req, res) => {
  // Configuração para processar arquivo bruto
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método inválido" });

  const busboy = Busboy({ headers: req.headers });
  const discordForm = new FormData();
  let channelId = "";

  const CANAIS = {
    porte: process.env.CHANNEL_PORTE_ID,
    revogacao: process.env.CHANNEL_REVOGACAO_ID,
    limpeza: process.env.CHANNEL_LIMPEZA_ID,
  };

  // Pega o tipo da URL (?tipo=revogacao)
  const { tipo } = req.query;
  channelId = CANAIS[tipo];

  busboy.on("file", (name, file, info) => {
    const { filename } = info;
    discordForm.append("file", file, filename);
  });

  busboy.on("field", (name, val) => {
    if (name === "payload_json") discordForm.append("payload_json", val);
  });

  busboy.on("finish", async () => {
    if (!channelId || !process.env.Discord_Bot_Token) {
      return res
        .status(500)
        .json({ error: "Configuração de Canal ou Token faltando." });
    }

    try {
      const response = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${process.env.Discord_Bot_Token}`,
            ...discordForm.getHeaders(),
          },
          body: discordForm,
        }
      );

      if (!response.ok) {
        const text = await response.text();
        return res.status(500).json({ error: text });
      }

      const data = await response.json();
      res.status(200).json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Tubulação do stream
  req.pipe(busboy);
};

// Exporta config para desativar parser da Vercel
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
