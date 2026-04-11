// api/relatorio.js
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  // --- Configuração de CORS ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const {
    Discord_Bot_Token,
    Discord_Guild_ID,
    CHANNEL_PORTE_ID,
    CHANNEL_REVOGACAO_ID,
    CHANNEL_LIMPEZA_ID,
    CHANNEL_RECOMPRA_ID, // <--- NOVA VARIÁVEL
    CAT_CHANNEL_ID,
    CARGOS_ESCRIVAES_RELATORIO,
  } = process.env;

  const { dataInicio, dataFim } = req.body || {};

  try {
    const startObj = new Date(`${dataInicio}T00:00:00`);
    const endObj = new Date(`${dataFim}T23:59:59`);
    const statsPorID = {};

    console.log(`[RELATORIO] Iniciando busca de ${dataInicio} a ${dataFim}`);

    // --- Função para buscar mensagens ---
    async function fetchMessages(channelId) {
      if (!channelId) return [];
      try {
        const response = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
          { headers: { Authorization: `Bot ${Discord_Bot_Token}` } }
        );
        if (!response.ok) {
          console.error(
            `[ERRO] Falha ao ler canal ${channelId}: ${response.status}`
          );
          return [];
        }
        const data = await response.json();
        console.log(
          `[SUCESSO] Canal ${channelId}: ${data.length} mensagens encontradas.`
        );
        return data;
      } catch (err) {
        console.error(`[ERRO] Exceção no canal ${channelId}:`, err);
        return [];
      }
    }

    // Lista de canais únicos (remove duplicatas se houver)
    const canaisBrutos = [
      CHANNEL_PORTE_ID,
      CHANNEL_REVOGACAO_ID,
      CHANNEL_LIMPEZA_ID,
      CHANNEL_RECOMPRA_ID,
      CAT_CHANNEL_ID,
    ];
    // Filtra nulos e remove duplicados
    const canais = [...new Set(canaisBrutos.filter(Boolean))];

    // --- Processamento ---
    for (const channelId of canais) {
      const msgs = await fetchMessages(channelId);

      msgs.forEach((msg) => {
        const dataMsg = new Date(msg.timestamp);
        if (dataMsg < startObj || dataMsg > endObj) return;

        if (channelId === CAT_CHANNEL_ID) {
          const matches = [...(msg.content || "").matchAll(/<@!?(\d+)>/g)];
          if (matches.length === 0) return;

          matches.forEach((m) => {
            const oficialId = m[1];
            if (!statsPorID[oficialId]) {
              statsPorID[oficialId] = {
                emissao: 0,
                revogacao: 0,
                limpeza: 0,
                renovacao: 0,
                cat: 0,
              };
            }
            statsPorID[oficialId].cat++;
          });
          return;
        }

        if (!msg.embeds || msg.embeds.length === 0) return;

        const embed = msg.embeds[0];
        const title = (embed.title || "")
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        // 1. Identificar Oficial (ID)
        let oficialId = null;

        // Tenta achar campo de Oficial/Responsável
        const campoOficial = embed.fields?.find((f) =>
          /OFICIAL|RESPONSAVEL|POLICIAL|EMISSOR|AUTOR|REVOGADO POR/i.test(
            f.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          )
        );

        if (campoOficial) {
          const match = campoOficial.value.match(/<@!?(\d+)>/);
          if (match) oficialId = match[1];
        }

        // Se não achou no campo, tenta ver se foi o próprio bot/autor (fallback)
        if (!oficialId && msg.author) oficialId = msg.author.id;

        if (!oficialId) return;

        // Inicializar objeto do oficial
        if (!statsPorID[oficialId]) {
          statsPorID[oficialId] = {
            emissao: 0,
            revogacao: 0,
            limpeza: 0,
            renovacao: 0,
            cat: 0,
          };
        }

        // --- Contagem ---

        // A. EMISSÃO
        if (
          title.includes("EMISSAO") ||
          title.includes("EMITIDO") ||
          title.includes("PORTE DE ARMA")
        ) {
          statsPorID[oficialId].emissao++;
        }
        // B. REVOGAÇÃO
        else if (title.includes("REVOGA")) {
          statsPorID[oficialId].revogacao++;
          // Tenta dar o ponto da emissão original para quem emitiu
          const campoEmissorOriginal = embed.fields?.find((f) =>
            /ORIGINAL|EMITIDO POR/i.test(
              f.name
                .toUpperCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
            )
          );
          if (campoEmissorOriginal) {
            const matchO = campoEmissorOriginal.value.match(/<@!?(\d+)>/);
            if (matchO) {
              const idOriginal = matchO[1];
              if (!statsPorID[idOriginal]) {
                statsPorID[idOriginal] = {
                  emissao: 0,
                  revogacao: 0,
                  limpeza: 0,
                  renovacao: 0,
                  cat: 0,
                };
              }
              statsPorID[idOriginal].emissao++;
            }
          }
        }
        // C. LIMPEZA
        else if (
          title.includes("LIMPEZA") ||
          title.includes("CERTIFICADO") ||
          title.includes("ANTECEDENTES")
        ) {
          statsPorID[oficialId].limpeza++;
        }
        // D. RENOVAÇÃO / RECOMPRA
        else if (
          title.includes("RENOVA") ||
          title.includes("RECOMPRA") ||
          title.includes("REPOSICAO")
        ) {
          statsPorID[oficialId].renovacao++;
        }
      });
    }

    // --- TRADUÇÃO DE NOMES ---
    const ids = Object.keys(statsPorID);
    const mapaNomes = {};
    const mapaRoles = {};
    const cargosEscrivaes = (CARGOS_ESCRIVAES_RELATORIO || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const filtrarPorCargo = cargosEscrivaes.length > 0;

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    async function fetchWithRetry(url, options) {
      while (true) {
        const response = await fetch(url, options);
        if (response.status === 429) {
          const data = await response.json().catch(() => null);
          const waitMs = Math.ceil((data?.retry_after || 1) * 1000);
          await delay(waitMs);
          continue;
        }
        return response;
      }
    }

    for (const id of ids) {
      try {
        // Tenta pegar do Servidor (com Nickname - apelido do servidor)
        const rGuild = await fetchWithRetry(
          `https://discord.com/api/v10/guilds/${Discord_Guild_ID}/members/${id}`,
          { headers: { Authorization: `Bot ${Discord_Bot_Token}` } }
        );
        if (rGuild.ok) {
          const d = await rGuild.json();
          mapaRoles[id] = d.roles || [];
          // SEMPRE prioriza o nickname do servidor (d.nick)
          // Se d.nick existe (não é null/undefined/string vazia), usa ele
          // Caso contrário, usa o que aparece no servidor (username ou global_name)
          if (d.nick && d.nick.trim() !== "") {
            mapaNomes[id] = d.nick;
          } else {
            mapaNomes[id] =
              d.user?.global_name || d.user?.username || `Oficial (${id})`;
          }
          continue;
        }
        // Fallback: API de Usuário (quando não está no servidor)
        const rUser = await fetchWithRetry(
          `https://discord.com/api/v10/users/${id}`,
          { headers: { Authorization: `Bot ${Discord_Bot_Token}` } }
        );
        if (rUser.ok) {
          const d = await rUser.json();
          mapaNomes[id] = d.global_name || d.username;
          continue;
        }
        mapaNomes[id] = `Oficial (${id})`;
      } catch (err) {
        console.error(`[ERRO] Ao buscar nome para ID ${id}:`, err);
        mapaNomes[id] = `Oficial (${id})`;
      }
    }

    const final = {};
    ids.forEach((id) => {
      if (filtrarPorCargo) {
        const roles = mapaRoles[id] || [];
        const temCargo = roles.some((roleId) =>
          cargosEscrivaes.includes(roleId)
        );
        if (!temCargo) return;
      }
      final[mapaNomes[id] || `Oficial (${id})`] = statsPorID[id];
    });

    console.log("[RELATORIO] Finalizado com sucesso.");
    res.status(200).json(final);
  } catch (e) {
    console.error("[ERRO CRÍTICO]", e);
    res.status(500).json({ error: "Erro interno no relatório" });
  }
};
