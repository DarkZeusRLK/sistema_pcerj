const Busboy = require("busboy");
const FormData = require("form-data");
const fetch = require("node-fetch");

module.exports.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = (req, res) => {
  return new Promise((resolve) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(200).end();
      return resolve();
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Metodo invalido" });
      return resolve();
    }

    const { Discord_Bot_Token, CAT_CHANNEL_ID } = process.env;
    if (!Discord_Bot_Token || !CAT_CHANNEL_ID) {
      res.status(500).json({ error: "Configuracao faltando" });
      return resolve();
    }

    const busboy = Busboy({ headers: req.headers });
    const files = [];
    let content = "";

    busboy.on("file", (name, file, info) => {
      const chunks = [];
      file.on("data", (data) => {
        chunks.push(data);
      });
      file.on("end", () => {
        if (chunks.length === 0) return;
        files.push({
          buffer: Buffer.concat(chunks),
          filename: info.filename || "anexo",
          mimeType: info.mimeType,
        });
      });
    });

    busboy.on("field", (name, val) => {
      if (name === "content") content = val;
    });

    busboy.on("finish", async () => {
      if (!content || !content.trim()) {
        res.status(400).json({ error: "Conteudo obrigatorio" });
        return resolve();
      }

      try {
        const discordForm = new FormData();
        const payload = {
          content,
          attachments: files.map((file, index) => ({
            id: index,
            filename: file.filename,
          })),
        };
        discordForm.append("payload_json", JSON.stringify(payload));

        files.forEach((file, index) => {
          discordForm.append(`files[${index}]`, file.buffer, {
            filename: file.filename,
            contentType: file.mimeType || "application/octet-stream",
          });
        });

        const response = await fetch(
          `https://discord.com/api/v10/channels/${CAT_CHANNEL_ID}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bot ${Discord_Bot_Token}`,
              ...discordForm.getHeaders(),
            },
            body: discordForm,
          }
        );

        if (!response.ok) {
          const text = await response.text();
          res.status(response.status).json({ error: text });
          return resolve();
        }

        const data = await response.json();
        res.status(200).json(data);
        return resolve();
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
        return resolve();
      }
    });

    req.pipe(busboy);
  });
};
