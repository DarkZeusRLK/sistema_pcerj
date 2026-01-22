const fetch = require("node-fetch");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Metodo invalido" });

  const { Discord_Bot_Token, Discord_Guild_ID } = process.env;
  const query = (req.query.q || "").trim();

  if (!Discord_Bot_Token || !Discord_Guild_ID) {
    return res.status(500).json({ error: "Configuracao faltando" });
  }

  if (!query) return res.status(200).json([]);

  try {
    const url = `https://discord.com/api/v10/guilds/${Discord_Guild_ID}/members/search?query=${encodeURIComponent(
      query
    )}&limit=10`;
    const response = await fetch(url, {
      headers: { Authorization: `Bot ${Discord_Bot_Token}` },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }

    const data = await response.json();
    const membros = (data || []).map((m) => ({
      id: m.user?.id,
      username: m.user?.username,
      global_name: m.user?.global_name,
      nick: m.nick,
    }));
    return res.status(200).json(membros);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
