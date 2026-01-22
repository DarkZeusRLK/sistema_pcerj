const fetch = require("node-fetch");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Metodo invalido" });

  const { Discord_Bot_Token, CAT_CHANNEL_ID } = process.env;
  const { content } = req.body || {};

  if (!Discord_Bot_Token || !CAT_CHANNEL_ID) {
    return res.status(500).json({ error: "Configuracao faltando" });
  }

  if (!content || !content.trim()) {
    return res.status(400).json({ error: "Conteudo obrigatorio" });
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/channels/${CAT_CHANNEL_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${Discord_Bot_Token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
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
