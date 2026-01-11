// api/relatorio.js
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  // Configuração de CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const {
    Discord_Bot_Token,
    Discord_Guild_ID, // CERTIFIQUE-SE QUE ESTE ID É DO SERVIDOR DA POLÍCIA (ONDE ESTÃO OS CARGOS E NICKNAMES)
    CHANNEL_PORTE_ID,
    CHANNEL_REVOGACAO_ID,
    CHANNEL_LIMPEZA_ID,
  } = process.env;

  const { dataInicio, dataFim } = req.body || {};

  try {
    const startObj = new Date(`${dataInicio}T00:00:00`);
    const endObj = new Date(`${dataFim}T23:59:59`);
    const statsPorID = {};

    // Função auxiliar para buscar mensagens
    async function fetchMessages(channelId) {
      if (!channelId) return [];
      try {
        const response = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
          { headers: { Authorization: `Bot ${Discord_Bot_Token}` } }
        );
        return response.ok ? await response.json() : [];
      } catch (err) {
        return [];
      }
    }

    const canais = [
      CHANNEL_PORTE_ID,
      CHANNEL_REVOGACAO_ID,
      CHANNEL_LIMPEZA_ID,
    ].filter(Boolean);

    // --- PROCESSAMENTO DAS MENSAGENS ---
    for (const channelId of canais) {
      const msgs = await fetchMessages(channelId);
      msgs.forEach((msg) => {
        const dataMsg = new Date(msg.timestamp);
        if (dataMsg < startObj || dataMsg > endObj) return;
        if (!msg.embeds || msg.embeds.length === 0) return;

        const embed = msg.embeds[0];
        const title = (embed.title || "")
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        // 1. Identificar Oficial (ID)
        let oficialId = null;

        // Procura nos campos por "Oficial Responsável", "Emitido Por", etc.
        const campoOficial = embed.fields?.find((f) =>
          /OFICIAL|RESPONSAVEL|POLICIAL|EMISSOR|AUTOR|REVOGADO POR/i.test(
            f.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          )
        );

        if (campoOficial) {
          const match = campoOficial.value.match(/<@!?(\d+)>/);
          if (match) oficialId = match[1];
        }

        // Fallback: Autor da mensagem (caso o embed não tenha o campo explícito)
        if (!oficialId && msg.author) oficialId = msg.author.id;

        if (!oficialId) return;

        // Inicializa estatísticas
        if (!statsPorID[oficialId]) {
          statsPorID[oficialId] = {
            emissao: 0,
            revogacao: 0,
            limpeza: 0,
            renovacao: 0,
          };
        }

        // --- REGRAS DE CONTAGEM ---

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

          // Tenta recuperar quem emitiu originalmente para dar o ponto de emissão a ele
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

        // D. RENOVAÇÃO & RECOMPRA (CORREÇÃO AQUI)
        else if (
          title.includes("RENOVA") ||
          title.includes("RECOMPRA") || // Adicionado para pegar "Registro de Recompra"
          title.includes("REPOSICAO")
        ) {
          statsPorID[oficialId].renovacao++;
        }
      });
    }

    // --- TRADUÇÃO DE IDs PARA NOMES (CORREÇÃO AQUI) ---
    const ids = Object.keys(statsPorID);
    const mapaNomes = {};

    await Promise.all(
      ids.map(async (id) => {
        try {
          // TENTATIVA 1: Buscar no SERVIDOR (Guild Member)
          // Isso é o que traz o Apelido [TAG] Nome
          let r = await fetch(
            `https://discord.com/api/v10/guilds/${Discord_Guild_ID}/members/${id}`,
            {
              headers: { Authorization: `Bot ${Discord_Bot_Token}` },
            }
          );

          if (r.ok) {
            const d = await r.json();
            // Prioridade: Apelido (nick) > Nome Global > Username
            mapaNomes[id] = d.nick || d.user?.global_name || d.user?.username;
            return;
          }

          // TENTATIVA 2: Buscar USUÁRIO GLOBAL (Caso tenha saído do servidor)
          r = await fetch(`https://discord.com/api/v10/users/${id}`, {
            headers: { Authorization: `Bot ${Discord_Bot_Token}` },
          });

          if (r.ok) {
            const d = await r.json();
            mapaNomes[id] = d.global_name || d.username;
            return;
          }

          // Fallback final
          mapaNomes[id] = `Oficial (${id})`;
        } catch {
          mapaNomes[id] = `Oficial (${id})`;
        }
      })
    );

    // Monta o objeto final substituindo IDs pelos nomes encontrados
    const final = {};
    ids.forEach((id) => {
      const nomeFinal = mapaNomes[id] || `Oficial (${id})`;
      final[nomeFinal] = statsPorID[id];
    });

    res.status(200).json(final);
  } catch (e) {
    console.error("Erro Relatório:", e);
    res.status(500).json({ error: "Erro ao gerar relatório" });
  }
};
