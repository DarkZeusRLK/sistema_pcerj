// api/listar.js
const fetch = require("node-fetch");

module.exports = async (req, res) => {
  // 1. Configurações
  const token = process.env.Discord_Bot_Token;
  const channelId = process.env.CHANNEL_PORTE_ID;

  if (!token || !channelId) {
    return res
      .status(500)
      .json({ error: "Configuração de Token ou Canal faltando." });
  }

  try {
    // 2. Busca as últimas 100 mensagens
    console.log(`🔍 Buscando mensagens no canal ${channelId}...`);
    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
      {
        headers: { Authorization: `Bot ${token}` },
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Erro Discord:", err);
      throw new Error("Falha ao conectar com Discord");
    }

    const messages = await response.json();
    console.log(`📨 Total de mensagens encontradas: ${messages.length}`);

    // 3. Filtragem Inteligente (Ignora Emojis e Maiúsculas)
    const lista = messages
      .filter((msg) => msg.embeds && msg.embeds.length > 0)
      .map((msg) => {
        const embed = msg.embeds[0];
        const fields = embed.fields || [];

        // Função auxiliar: Limpa emojis e espaços, deixa tudo minúsculo para comparar
        // Ex: "👤 Cidadão" vira "cidadao"
        const clean = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, "");

        const findValue = (possibleNames) => {
          const found = fields.find((f) => {
            const fieldNameClean = clean(f.name);
            return possibleNames.some((name) => fieldNameClean.includes(name));
          });
          // Se achou, limpa os asteriscos e crases do valor (**Valor**)
          return found ? found.value.replace(/[*`]/g, "").trim() : null;
        };

        // Busca flexível
        const nome = findValue(["cidadao", "nome", "civil", "portador"]);
        const id = findValue(["passaporte", "id", "pass"]);

        // Se não tiver Nome E ID, ignora
        if (!nome || !id) return null;

        return {
          message_id: msg.id,
          nome: nome,
          id: id,
          arma: findValue(["armamento", "arma"]) || "Desconhecida",
          rg: findValue(["rg"]) || "N/A",
          status: "Ativo", // Força o status ativo pois veio da sala de ativos
        };
      })
      .filter((item) => item !== null); // Remove os vazios

    console.log(`✅ Portes válidos processados: ${lista.length}`);
    return res.status(200).json(lista);
  } catch (error) {
    console.error("Erro Fatal no Listar:", error);
    return res.status(500).json({ error: error.message });
  }
};
