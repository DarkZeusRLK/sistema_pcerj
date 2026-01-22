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
    let fileBuffer = [];
    let fileName = "";
    let content = "";

    busboy.on("file", (name, file, info) => {
      fileName = info.filename || "anexo";
      file.on("data", (data) => {
        fileBuffer.push(data);
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
        const payload = { content };
        discordForm.append("payload_json", JSON.stringify(payload));

        if (fileBuffer.length > 0) {
          const finalBuffer = Buffer.concat(fileBuffer);
          discordForm.append("file", finalBuffer, fileName);
        }

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
