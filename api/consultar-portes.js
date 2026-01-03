const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  // Configurações de CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { idCidadao } = req.body;
  const { Discord_Bot_Token, CHANNEL_PORTE_ID } = process.env;

  if (!idCidadao) return res.status(400).json({ error: "ID obrigatório" });

  try {
    // Busca mensagens no canal de Portes
    const url = `https://discord.com/api/v10/channels/${CHANNEL_PORTE_ID}/messages?limit=100`;
    const response = await fetch(url, {
      headers: { Authorization: `Bot ${Discord_Bot_Token}` },
    });

    if (!response.ok) throw new Error("Erro ao acessar Discord");
    const mensagens = await response.json();

    const portesEncontrados = [];

    for (const msg of mensagens) {
      if (!msg.embeds || msg.embeds.length === 0) continue;

      const embed = msg.embeds[0];
      const jsonEmbed = JSON.stringify(embed).toLowerCase();

      // Se a mensagem contém o ID do cidadão
      if (jsonEmbed.includes(idCidadao)) {
        // Tenta achar campos específicos
        const campoArma = embed.fields?.find(
          (f) =>
            f.name.toUpperCase().includes("ARMA") ||
            f.name.toUpperCase().includes("MODELO")
        );
        const campoValidade = embed.fields?.find((f) =>
          f.name.toUpperCase().includes("VALIDADE")
        );
        const campoStatus = embed.fields?.find((f) =>
          f.name.toUpperCase().includes("STATUS")
        );

        // Se não achou campo, tenta pegar do título ou descrição
        let nomeArma = campoArma ? campoArma.value : "Arma Desconhecida";

        // Normaliza o nome para o Frontend conseguir ler o preço
        if (jsonEmbed.includes("glock")) nomeArma = "Glock";
        else if (jsonEmbed.includes("mp5")) nomeArma = "MP5";
        else if (jsonEmbed.includes("taser")) nomeArma = "Taser";

        portesEncontrados.push({
          id_msg: msg.id,
          arma: nomeArma, // Glock, MP5 ou Taser
          validade: campoValidade ? campoValidade.value : "Indefinido",
          status: campoStatus ? campoStatus.value : "Ativo",
          originalEmbed: embed, // Guarda para referência
        });
      }
    }

    res.status(200).json(portesEncontrados);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
