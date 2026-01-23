// api/listar-revogacoes.js
const fetch = require("node-fetch");

module.exports = async (req, res) => {
  const token = process.env.Discord_Bot_Token;
  const channelId = process.env.CHANNEL_REVOGACAO_ID;

  if (!token || !channelId)
    return res.status(500).json({ error: "Configuração faltando" });

  try {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    async function fetchAllMessages() {
      const mensagens = [];
      let before = null;

      while (true) {
        const params = new URLSearchParams({ limit: "100" });
        if (before) params.set("before", before);
        const url = `https://discord.com/api/v10/channels/${channelId}/messages?${params.toString()}`;

        const response = await fetch(url, {
          headers: { Authorization: `Bot ${token}` },
        });

        if (response.status === 429) {
          const data = await response.json().catch(() => null);
          const waitMs = Math.ceil((data?.retry_after || 1) * 1000);
          await delay(waitMs);
          continue;
        }

        if (!response.ok) throw new Error("Erro Discord");
        const batch = await response.json();
        mensagens.push(...batch);

        if (batch.length < 100) break;
        before = batch[batch.length - 1].id;
      }

      return mensagens;
    }

    const messages = await fetchAllMessages();

    const normalize = (text) =>
      (text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    const lista = messages
      .filter((m) => m.embeds && m.embeds.length > 0)
      .map((m) => {
        const e = m.embeds[0];
        const fields = e.fields || [];

        const find = (key) => {
          const keyNorm = normalize(key);
          const f = fields.find((field) =>
            normalize(field.name).includes(keyNorm)
          );
          return f ? f.value.replace(/[*`]/g, "").trim() : null;
        };

        const nome = find("Cidadao") || find("Nome");
        const rawId = find("ID") || find("Passaporte");
        const id = rawId ? (rawId.match(/\d+/) || [rawId])[0] : null;

        const rawData = find("Data");
        const dataRevogacao = rawData
          ? rawData
          : new Date(e.timestamp || m.timestamp).toLocaleDateString("pt-BR");

        if (nome && id) {
          return {
            nome,
            id,
            dataRevogacao,
            status: "Revogado",
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
