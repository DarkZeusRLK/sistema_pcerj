const Busboy = require("busboy");
const FormData = require("form-data");
const fetch = require("node-fetch");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo invalido" });
  }

  const { Discord_Bot_Token, CAT_CHANNEL_ID } = process.env;
  if (!Discord_Bot_Token || !CAT_CHANNEL_ID) {
    return res.status(500).json({ error: "Configuracao faltando" });
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

  await new Promise((resolve) => {
    busboy.on("finish", resolve);
    req.pipe(busboy);
  });

  if (!content || !content.trim()) {
    return res.status(400).json({ error: "Conteudo obrigatorio" });
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
      return res.status(response.status).json({ error: text });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
