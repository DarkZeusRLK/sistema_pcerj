// Arquivo: api/listar.js
export default async function handler(req, res) {
  // 1. Configurações (Pegaremos das variáveis de ambiente da Vercel)
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const CHANNEL_ID = process.env.CHANNEL_PORTES_ID; // ID do canal de PORTES ATIVOS

  if (!BOT_TOKEN || !CHANNEL_ID) {
    return res
      .status(500)
      .json({ error: "Configuração do Bot ausente na Vercel." });
  }

  try {
    // 2. Pede ao Discord as últimas 100 mensagens do canal
    const response = await fetch(
      `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages?limit=100`,
      {
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Erro Discord: ${response.statusText}`);
    }

    const messages = await response.json();

    // 3. Filtra e processa apenas as mensagens que são Portes Válidos
    const portesEncontrados = messages
      .filter((msg) => msg.embeds && msg.embeds.length > 0) // Tem que ter Embed
      .map((msg) => {
        const embed = msg.embeds[0];

        // Função para achar o valor de um campo específico do Embed
        const getField = (namePart) => {
          const field = embed.fields?.find((f) => f.name.includes(namePart));
          return field ? field.value.replace(/`|\*|/g, "").trim() : "N/A"; // Limpa ** e ``
        };

        // Verifica se é um embed de Emissão (pelo título ou campos)
        if (embed.title && embed.title.includes("EMISSÃO DE PORTE")) {
          return {
            message_id: msg.id, // Guardamos o ID da mensagem para poder deletar depois se quiser
            nome: getField("Cidadão"),
            id: getField("Passaporte") || getField("ID"),
            rg: getField("RG"),
            arma: getField("Armamento"),
            validade: getField("Validade"),
            expedicao: getField("Expedição"),
            status: "Ativo",
          };
        }
        return null;
      })
      .filter((item) => item !== null); // Remove os nulos

    // 4. Retorna a lista limpa para o seu site
    return res.status(200).json(portesEncontrados);
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Falha ao buscar registros no Discord." });
  }
}
