// api/enviar.js
const Busboy = require("busboy");
const FormData = require("form-data");
const fetch = require("node-fetch");

// Desativa o body-parser padrão da Vercel para lidarmos com o arquivo manualmente
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = (req, res) => {
  // IMPORTANTE: Envolvemos tudo numa Promise para a Vercel não matar o processo
  return new Promise((resolve, reject) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Método inválido" });
      return resolve();
    }

    const busboy = Busboy({ headers: req.headers });
    const discordForm = new FormData();
    let channelId = "";

    // Mapeamento dos Canais
    const CANAIS = {
      porte: process.env.CHANNEL_PORTE_ID,
      revogacao: process.env.CHANNEL_REVOGACAO_ID,
      limpeza: process.env.CHANNEL_LIMPEZA_ID,
    };

    const { tipo } = req.query;
    channelId = CANAIS[tipo];

    // 1. Processa o Arquivo
    busboy.on("file", (name, file, info) => {
      const { filename } = info;
      discordForm.append("file", file, filename);
    });

    // 2. Processa os Campos (JSON)
    busboy.on("field", (name, val) => {
      if (name === "payload_json") discordForm.append("payload_json", val);
    });

    // 3. Finaliza e Envia
    busboy.on("finish", async () => {
      if (!channelId || !process.env.Discord_Bot_Token) {
        res
          .status(500)
          .json({ error: "Configuração de Canal ou Token faltando." });
        return resolve();
      }

      try {
        // Envia para o Discord
        const response = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bot ${process.env.Discord_Bot_Token}`,
              ...discordForm.getHeaders(), // Headers obrigatórios do form-data
            },
            body: discordForm,
          }
        );

        if (!response.ok) {
          const text = await response.text();
          console.error("Erro Discord:", text);
          res.status(500).json({ error: text });
          return resolve();
        }

        const data = await response.json();
        res.status(200).json(data);
        return resolve();
      } catch (err) {
        console.error("Erro Fetch:", err);
        res.status(500).json({ error: err.message });
        return resolve();
      }
    });

    // Tratamento de erros do Busboy
    busboy.on("error", (err) => {
      console.error("Erro Busboy:", err);
      res.status(500).json({ error: "Erro no upload do arquivo." });
      return resolve();
    });

    req.pipe(busboy);
  });
};
