import fetch from "node-fetch";

export default async function handler(req, res) {
  const token = process.env.Discord_Bot_Token;
  const channelId = process.env.CHANNEL_PORTE_ID;
  const { message_id } = req.body;

  if (!message_id) return res.status(400).json({ error: "ID faltando" });

  try {
    await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages/${message_id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bot ${token}` },
      }
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao deletar" });
  }
}
