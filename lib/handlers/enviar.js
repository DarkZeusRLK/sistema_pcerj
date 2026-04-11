// api/enviar.js
const Busboy = require("busboy");
const FormData = require("form-data");
const fetch = require("node-fetch");

// Configuração obrigatória para Vercel
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = (req, res) => {
  return new Promise((resolve, reject) => {
    console.log("📨 Iniciando envio via API...");

    if (req.method !== "POST") {
      res.status(405).json({ error: "Método inválido" });
      return resolve();
    }

    const busboy = Busboy({ headers: req.headers });

    // Vamos guardar os dados na memória antes de enviar
    let fileBuffer = [];
    let fileName = "";
    let payloadJson = "";

    const CANAIS = {
      porte: process.env.CHANNEL_PORTE_ID,
      revogacao: process.env.CHANNEL_REVOGACAO_ID,
      limpeza: process.env.CHANNEL_LIMPEZA_ID,
      recompra: process.env.CHANNEL_RENOVACAO_ID,
    };

    const { tipo } = req.query;
    const channelId = CANAIS[tipo];

    // 1. Recebe o Arquivo (Guarda pedacinhos num array)
    busboy.on("file", (name, file, info) => {
      console.log(`📎 Recebendo arquivo: ${info.filename}`);
      fileName = info.filename;

      file.on("data", (data) => {
        fileBuffer.push(data);
      });
    });

    // 2. Recebe o JSON (Texto)
    busboy.on("field", (name, val) => {
      if (name === "payload_json") {
        payloadJson = val;
      }
    });

    // 3. Tudo recebido? Agora monta e envia pro Discord
    busboy.on("finish", async () => {
      console.log(
        "📦 Upload recebido pelo servidor. Preparando envio para Discord..."
      );

      if (!channelId || !process.env.Discord_Bot_Token) {
        console.error("? Erro: Configuração faltando.");
        res
          .status(500)
          .json({ error: "Configuração de Canal ou Token faltando." });
        return resolve();
      }

      try {
        // Reconstrói o arquivo final
        const discordForm = new FormData();

        // Anexa arquivo apenas quando existir
        if (fileBuffer.length > 0 && fileName) {
          const finalBuffer = Buffer.concat(fileBuffer);
          discordForm.append("file", finalBuffer, fileName);
        }
        if (payloadJson) discordForm.append("payload_json", payloadJson);

        // Dispara pro Discord
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
          console.error("❌ Discord recusou:", text);
          res.status(response.status).json({ error: text });
          return resolve();
        }

        const data = await response.json();
        console.log("✅ Sucesso! Mensagem enviada.");
        res.status(200).json(data);
        return resolve();
      } catch (err) {
        console.error("❌ Erro fatal no envio:", err);
        res.status(500).json({ error: err.message });
        return resolve();
      }
    });

    req.pipe(busboy);
  });
};
