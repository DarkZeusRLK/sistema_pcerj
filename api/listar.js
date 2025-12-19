import fetch from "node-fetch";

export default async function handler(req, res) {
  // Pegando suas variáveis exatas
  const token = process.env.Discord_Bot_Token;
  const channelId = process.env.CHANNEL_PORTE_ID;

  if (!token || !channelId) {
    return res
      .status(500)
      .json({ error: "Configuração (Token/ID) faltando na Vercel." });
  }

  try {
    // Busca as últimas 100 mensagens
    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
      {
        headers: { Authorization: `Bot ${token}` },
      }
    );

    if (!response.ok) throw new Error(`Erro Discord: ${response.status}`);

    const messages = await response.json();

    // Filtra e limpa os dados
    const lista = messages
      .filter((msg) => msg.embeds && msg.embeds.length > 0)
      .map((msg) => {
        const embed = msg.embeds[0];

        // Função auxiliar para achar campos ignorando maiúsculas/minúsculas e acentos
        const getVal = (keys) => {
          const field = embed.fields?.find((f) =>
            keys.some((k) => f.name.toLowerCase().includes(k))
          );
          return field ? field.value.replace(/[*`]/g, "").trim() : null;
        };

        // Procura por campos comuns
        const nome = getVal(["cidadão", "nome", "civil"]);
        const id = getVal(["passaporte", "id"]);

        // Se não tiver Nome e ID, ignora (não é um porte válido)
        if (!nome || !id) return null;

        return {
          message_id: msg.id, // Importante para deletar depois
          nome: nome,
          id: id,
          rg: getVal(["rg"]) || "N/A",
          arma: getVal(["arma", "armamento"]) || "Desconhecida",
          validade: getVal(["validade"]) || "N/A",
          expedicao: getVal(["expedição"]) || "N/A",
          status: "Ativo",
        };
      })
      .filter((item) => item !== null); // Remove os vazios

    return res.status(200).json(lista);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Falha ao listar portes." });
  }
}
