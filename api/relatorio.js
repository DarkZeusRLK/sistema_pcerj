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
    Discord_Guild_ID,
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

    // Canais monitorados: Portes Ativos, Logs de Revogação e Logs de Limpeza
    const canais = [
      CHANNEL_PORTE_ID,
      CHANNEL_REVOGACAO_ID,
      CHANNEL_LIMPEZA_ID,
    ].filter(Boolean);

    // Loop principal de processamento das mensagens
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

        // 1. Identificar quem fez a ação da mensagem atual
        let oficialId = null;

        // Tenta achar campos específicos no embed
        const campoOficial = embed.fields?.find((f) =>
          /OFICIAL|RESPONSAVEL|POLICIAL|EMISSOR|AUTOR|REVOGADO POR/i.test(
            f.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          )
        );

        if (campoOficial) {
          const match = campoOficial.value.match(/<@!?(\d+)>/);
          if (match) oficialId = match[1];
        }

        // Se não achar no campo, usa o autor da mensagem
        if (!oficialId && msg.author) oficialId = msg.author.id;
        if (!oficialId) return;

        // Inicializa stats se não existir
        if (!statsPorID[oficialId]) {
          statsPorID[oficialId] = {
            emissao: 0,
            revogacao: 0,
            limpeza: 0,
            renovacao: 0,
          };
        }

        // --- LÓGICA DE CONTAGEM ---

        // A. EMISSÃO ATIVA (Mensagem está no canal de Portes)
        if (
          title.includes("EMISSAO") ||
          title.includes("EMITIDO") ||
          title.includes("PORTE DE ARMA")
        ) {
          statsPorID[oficialId].emissao++;
        }

        // B. REVOGAÇÃO (Mensagem está no canal de Revogações)
        else if (title.includes("REVOGA")) {
          statsPorID[oficialId].revogacao++; // Conta 1 revogação para quem clicou no botão

          // Recuperar o ponto de quem emitiu originalmente para não prejudicar a contagem
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

              // Garante que o emissor original tenha um objeto de stats
              if (!statsPorID[idOriginal]) {
                statsPorID[idOriginal] = {
                  emissao: 0,
                  revogacao: 0,
                  limpeza: 0,
                  renovacao: 0,
                };
              }

              // Adiciona o ponto de emissão para o oficial original
              statsPorID[idOriginal].emissao++;
            }
          }
        }

        // C. LIMPEZA DE FICHA
        else if (
          title.includes("LIMPEZA") ||
          title.includes("CERTIFICADO") ||
          title.includes("ANTECEDENTES")
        ) {
          statsPorID[oficialId].limpeza++;
        }

        // D. RENOVAÇÃO
        else if (title.includes("RENOVA")) {
          statsPorID[oficialId].renovacao++;
        }
      });
    }

    // --- CORREÇÃO AQUI: Tradução de IDs para Nomes ---
    const ids = Object.keys(statsPorID);
    const mapaNomes = {};

    await Promise.all(
      ids.map(async (id) => {
        try {
          // TENTATIVA 1: Buscar membro dentro do servidor (Guild Member)
          let r = await fetch(
            `https://discord.com/api/v10/guilds/${Discord_Guild_ID}/members/${id}`,
            {
              headers: { Authorization: `Bot ${Discord_Bot_Token}` },
            }
          );

          if (r.ok) {
            const d = await r.json();
            // Prioridade: Apelido > Nome Global > Username
            mapaNomes[id] = d.nick || d.user?.global_name || d.user?.username;
            return;
          }

          // TENTATIVA 2: Se falhar (ex: saiu do servidor), buscar usuário global
          r = await fetch(`https://discord.com/api/v10/users/${id}`, {
            headers: { Authorization: `Bot ${Discord_Bot_Token}` },
          });

          if (r.ok) {
            const d = await r.json();
            mapaNomes[id] = d.global_name || d.username;
            return;
          }

          // Fallback final se nada der certo
          throw new Error("User not found");
        } catch {
          mapaNomes[id] = `Oficial (${id})`;
        }
      })
    );

    // Montagem do objeto final
    const final = {};
    ids.forEach((id) => {
      const nomeFinal = mapaNomes[id] || `Oficial (${id})`;
      final[nomeFinal] = statsPorID[id];
    });

    res.status(200).json(final);
  } catch (e) {
    console.error(e); // Log para debug interno, se necessário
    res.status(500).json({ error: "Erro ao gerar relatório" });
  }
};
