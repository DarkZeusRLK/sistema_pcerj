// api/listar.js
const fetch = require("node-fetch");

module.exports = async (req, res) => {
  const token = process.env.Discord_Bot_Token;
  const channelId = process.env.CHANNEL_PORTE_ID;

  if (!token || !channelId)
    return res.status(500).json({ error: "Configuração faltando" });

  try {
    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
      {
        headers: { Authorization: `Bot ${token}` },
      }
    );

    if (!response.ok) throw new Error("Erro Discord");
    const messages = await response.json();

    const lista = messages
      .filter((m) => m.embeds && m.embeds.length > 0)
      .map((m) => {
        const e = m.embeds[0];
        const fields = e.fields || [];

        // Função que busca ignorando maiúsculas e acentos
        const find = (key) => {
          const f = fields.find((field) =>
            field.name.toLowerCase().includes(key.toLowerCase())
          );
          // Remove asteriscos, crases e espaços extras
          return f ? f.value.replace(/[*`]/g, "").trim() : null;
        };

        const nome = find("Cidadão") || find("Nome");
        const id = find("Passaporte") || find("ID");

        if (nome && id) {
          return {
            message_id: m.id,
            nome,
            id,
            // 👇 AQUI ESTÁ A CORREÇÃO: Lendo as datas
            expedicao: find("Expedição") || find("Data") || "N/A",
            validade: find("Validade") || find("Vencimento") || "N/A",
            rg: find("RG") || "N/A",
            arma: find("Armamento") || find("Arma") || "N/A",
            status: "Ativo",
          };
        }
        return null;
      })
      .filter((i) => i !== null);

    res.status(200).json(lista);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
