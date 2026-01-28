// api/listar.js
const fetch = require("node-fetch");

module.exports = async (req, res) => {
  const token = process.env.Discord_Bot_Token;
  const channelId = process.env.CHANNEL_PORTE_ID;

  if (!token || !channelId)
    return res.status(500).json({ error: "Configuracao faltando" });

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

    const lista = messages
      .filter((m) => m.embeds && m.embeds.length > 0)
      .map((m) => {
        const e = m.embeds[0];
        const fields = e.fields || [];

        const normalize = (text) =>
          (text || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();

        const find = (key) => {
          const keyNorm = normalize(key);
          const f = fields.find((field) =>
            normalize(field.name).includes(keyNorm)
          );
          // Mantem a mencao <@ID> se existir, removendo apenas lixo visual
          return f ? f.value.replace(/[*`]/g, "").trim() : null;
        };

        const nome = find("Cidadao") || find("Nome");
        const id = find("Passaporte") || find("ID");
        const telefone = find("Telefone");
        const rg = find("RG");

        if (nome && id) {
          return {
            message_id: m.id,
            nome,
            id,
            oficial:
              find("Oficial") || find("Responsavel") || "Oficial Desconhecido",
            expedicao: find("Expedicao") || find("Data") || "N/A",
            validade: find("Validade") || find("Vencimento") || "N/A",
            telefone: telefone || rg || "N/A",
            rg: rg || telefone || "N/A",
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
