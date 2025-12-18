// api/enviar.js - Versão Correta para Porte de Armas
export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const BOT_TOKEN = process.env.Discord_Bot_Token;
  const { tipo } = req.query; // Pega o tipo da URL (?tipo=porte)

  // IDs DOS CANAIS - Certifique-se de criar essas variáveis na Vercel
  const CANAIS = {
    limpeza: process.env.CHANNEL_LIMPEZA_ID,
    porte: process.env.CHANNEL_PORTE_ID,
    renovacao: process.env.CHANNEL_RENOVACAO_ID,
    revogacao: process.env.CHANNEL_REVOGACAO_ID,
  };

  const channelId = CANAIS[tipo];

  if (!BOT_TOKEN || !channelId) {
    return res
      .status(500)
      .json({ error: "Configuração de Canal ou Token inválida." });
  }

  try {
    const discordRes = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          "Content-Type": req.headers["content-type"],
        },
        body: req,
        duplex: "half",
      }
    );

    if (discordRes.ok) return res.status(200).json({ success: true });

    const erroTexto = await discordRes.text();
    return res.status(500).json({ error: erroTexto });
  } catch (error) {
    return res.status(500).json({ error: "Erro interno no servidor." });
  }
}
