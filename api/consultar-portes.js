const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  // Configuracoes de CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { idCidadao } = req.body;
  const { Discord_Bot_Token, CHANNEL_PORTE_ID } = process.env;

  if (!idCidadao) return res.status(400).json({ error: "ID obrigatorio" });

  try {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    async function fetchAllMessages(channelId) {
      const mensagens = [];
      let before = null;

      while (true) {
        const params = new URLSearchParams({ limit: "100" });
        if (before) params.set("before", before);
        const url = `https://discord.com/api/v10/channels/${channelId}/messages?${params.toString()}`;

        const response = await fetch(url, {
          headers: { Authorization: `Bot ${Discord_Bot_Token}` },
        });

        if (response.status === 429) {
          const data = await response.json().catch(() => null);
          const waitMs = Math.ceil((data?.retry_after || 1) * 1000);
          await delay(waitMs);
          continue;
        }

        if (!response.ok) throw new Error("Erro ao acessar Discord");
        const batch = await response.json();
        mensagens.push(...batch);

        if (batch.length < 100) break;
        before = batch[batch.length - 1].id;
      }

      return mensagens;
    }

    const mensagens = await fetchAllMessages(CHANNEL_PORTE_ID);

    const portesEncontrados = [];
    const idBuscado = String(idCidadao).trim();

    for (const msg of mensagens) {
      if (!msg.embeds || msg.embeds.length === 0) continue;

      const embed = msg.embeds[0];
      const fields = embed.fields || [];

      const campoId = fields.find((f) =>
        /PASSAPORTE|ID/i.test(
          (f.name || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
        )
      );

      if (!campoId || !campoId.value) continue;

      const rawId = campoId.value.replace(/[`*]/g, "").trim();
      const matchId = rawId.match(/\d+/);
      const idEncontrado = matchId ? matchId[0] : rawId;

      if (idEncontrado !== idBuscado) continue;

      const campoArma = fields.find(
        (f) =>
          f.name.toUpperCase().includes("ARMA") ||
          f.name.toUpperCase().includes("MODELO")
      );
      const campoValidade = fields.find((f) =>
        f.name.toUpperCase().includes("VALIDADE")
      );
      const campoStatus = fields.find((f) =>
        f.name.toUpperCase().includes("STATUS")
      );

      let nomeArma = campoArma ? campoArma.value : "Arma Desconhecida";
      const embedTexto = JSON.stringify(embed).toLowerCase();

      if (embedTexto.includes("glock")) nomeArma = "Glock";
      else if (embedTexto.includes("mp5")) nomeArma = "MP5";
      else if (embedTexto.includes("taser")) nomeArma = "Taser";

      portesEncontrados.push({
        id_msg: msg.id,
        arma: nomeArma,
        validade: campoValidade ? campoValidade.value : "Indefinido",
        status: campoStatus ? campoStatus.value : "Ativo",
        originalEmbed: embed,
      });
    }

    res.status(200).json(portesEncontrados);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
