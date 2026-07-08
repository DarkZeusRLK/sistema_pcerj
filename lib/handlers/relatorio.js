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

    // --- Função para buscar mensagens (agora com paginação real) ---
    async function fetchMessages(channelId, nomeCanal) {
      if (!channelId) {
        console.warn(`[AVISO] Variável de canal "${nomeCanal}" não configurada - pulando.`);
        return [];
      }

      const todasMensagens = [];
      let before = null;
      const MAX_PAGINAS = 15; // 15 x 100 = até 1500 mensagens por canal, por período

      try {
        for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
          const url = new URL(
            `https://discord.com/api/v10/channels/${channelId}/messages`
          );
          url.searchParams.set("limit", "100");
          if (before) url.searchParams.set("before", before);

          const response = await fetch(url.toString(), {
            headers: { Authorization: `Bot ${Discord_Bot_Token}` },
          });

          if (!response.ok) {
            console.error(
              `[ERRO] Falha ao ler canal ${channelId} (pagina ${pagina + 1}): ${response.status}`
            );
            break;
          }

          const lote = await response.json();
          if (!Array.isArray(lote) || lote.length === 0) break;

          todasMensagens.push(...lote);

          // Mensagens do Discord vêm da mais nova pra mais antiga.
          // Se a última mensagem do lote já é mais antiga que o início do período,
          // não precisa buscar páginas anteriores (mais antigas ainda).
          const maisAntigaDoLote = new Date(lote[lote.length - 1].timestamp);
          if (maisAntigaDoLote < startObj) break;

          before = lote[lote.length - 1].id;
          if (lote.length < 100) break; // acabaram as mensagens do canal
        }

        console.log(
          `[SUCESSO] Canal ${channelId}: ${todasMensagens.length} mensagens lidas no total.`
        );
        return todasMensagens;
      } catch (err) {
        console.error(`[ERRO] Exceção no canal ${channelId}:`, err);
        return todasMensagens;
      }
    }

    // Lista de canais únicos (remove duplicatas se houver)
    const canaisNomeados = [
      { id: CHANNEL_PORTE_ID, nome: "CHANNEL_PORTE_ID" },
      { id: CHANNEL_REVOGACAO_ID, nome: "CHANNEL_REVOGACAO_ID" },
      { id: CHANNEL_LIMPEZA_ID, nome: "CHANNEL_LIMPEZA_ID" },
      { id: CHANNEL_RECOMPRA_ID, nome: "CHANNEL_RECOMPRA_ID" },
      { id: CAT_CHANNEL_ID, nome: "CAT_CHANNEL_ID" },
    ];
    // Filtra nulos e remove duplicados (mantendo o primeiro nome associado)
    const idsVistos = new Set();
    const canais = canaisNomeados.filter(({ id }) => {
      if (!id || idsVistos.has(id)) return false;
      idsVistos.add(id);
      return true;
    });

    // --- Processamento ---
    let totalMensagensProcessadas = 0;
    let totalSemEmbed = 0;
    let totalForaDoPeriodo = 0;

    for (const { id: channelId, nome: nomeCanal } of canais) {
      const msgs = await fetchMessages(channelId, nomeCanal);

      msgs.forEach((msg) => {
        const dataMsg = new Date(msg.timestamp);
        if (dataMsg < startObj || dataMsg > endObj) {
          totalForaDoPeriodo++;
          return;
        }
        totalMensagensProcessadas++;

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

        if (!msg.embeds || msg.embeds.length === 0) {
          totalSemEmbed++;
          return;
        }

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
        if (!oficialId && msg.author) {
          oficialId = msg.author.id;
          console.warn(
            `[AVISO] Canal ${channelId}, msg ${msg.id}: nenhum campo de "Oficial/Responsável" encontrado no embed - atribuindo ao autor da mensagem (${msg.author.username || oficialId}). Se isso for o bot, a meta não vai contar para o policial certo.`
          );
        }

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
    console.log(
      `[RELATORIO] Mensagens: ${totalMensagensProcessadas} dentro do período, ${totalForaDoPeriodo} fora do período, ${totalSemEmbed} sem embed (ignoradas).`
    );
    console.log(
      `[RELATORIO] ${Object.keys(statsPorID).length} oficial(is) com atividade encontrada nas mensagens (antes de nomes/filtro de cargo).`
    );

    const mapaNomes = {};
    const mapaRoles = {};
    const cargosEscrivaes = (CARGOS_ESCRIVAES_RELATORIO || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const filtrarPorCargo = cargosEscrivaes.length > 0;
    console.log(
      `[RELATORIO] Filtro de cargo ${filtrarPorCargo ? "ATIVO" : "DESATIVADO"} - cargos aceitos: [${cargosEscrivaes.join(", ")}]`
    );

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

    // --- Busca TODOS os membros do servidor que têm o(s) cargo(s) de escrivão,
    //     mesmo que não tenham nenhuma atividade registrada nas mensagens ---
    async function buscarMembrosComCargo(guildId, cargosAlvo) {
      const membros = new Map(); // id -> { nome, roles }
      let after = "0";
      const LIMITE_PAGINAS = 20; // 20 x 1000 = até 20.000 membros

      for (let pagina = 0; pagina < LIMITE_PAGINAS; pagina++) {
        const url = new URL(`https://discord.com/api/v10/guilds/${guildId}/members`);
        url.searchParams.set("limit", "1000");
        url.searchParams.set("after", after);

        const resp = await fetchWithRetry(url.toString(), {
          headers: { Authorization: `Bot ${Discord_Bot_Token}` },
        });

        if (!resp.ok) {
          console.error(`[ERRO] Falha ao listar membros do servidor (pagina ${pagina + 1}): ${resp.status}`);
          break;
        }

        const lote = await resp.json();
        if (!Array.isArray(lote) || lote.length === 0) break;

        lote.forEach((membro) => {
          const roles = membro.roles || [];
          const temCargo = roles.some((r) => cargosAlvo.includes(r));
          if (!temCargo || !membro.user) return;

          const id = membro.user.id;
          const nome =
            (membro.nick && membro.nick.trim()) ||
            membro.user.global_name ||
            membro.user.username ||
            `Oficial (${id})`;
          membros.set(id, { nome, roles });
        });

        if (lote.length < 1000) break;
        after = lote[lote.length - 1].user.id;
      }

      return membros;
    }

    if (filtrarPorCargo && Discord_Guild_ID) {
      const membrosComCargo = await buscarMembrosComCargo(Discord_Guild_ID, cargosEscrivaes);
      console.log(`[RELATORIO] ${membrosComCargo.size} membro(s) do servidor têm o cargo de escrivão.`);

      membrosComCargo.forEach(({ nome, roles }, id) => {
        if (!statsPorID[id]) {
          statsPorID[id] = { emissao: 0, revogacao: 0, limpeza: 0, renovacao: 0, cat: 0 };
        }
        // Já temos nome e cargos direto da listagem - evita uma chamada extra por pessoa
        mapaNomes[id] = nome;
        mapaRoles[id] = roles;
      });
    }

    const ids = Object.keys(statsPorID);

    for (const id of ids) {
      if (mapaNomes[id] && mapaRoles[id]) continue; // já resolvido pela listagem de membros acima

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

        console.warn(
          `[AVISO] ID ${id}: não encontrado no servidor (guild ${Discord_Guild_ID}) - status ${rGuild.status}. Cargos não puderam ser verificados; caindo para busca de usuário (sem cargos).`
        );
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
    let removidosPorCargo = 0;
    ids.forEach((id) => {
      if (filtrarPorCargo) {
        const roles = mapaRoles[id] || [];
        const temCargo = roles.some((roleId) =>
          cargosEscrivaes.includes(roleId)
        );
        console.log(
          `[RELATORIO] ID ${id} (${mapaNomes[id] || "sem nome"}) - cargos reais: [${roles.join(", ")}] - bate com filtro? ${temCargo}`
        );
        if (!temCargo) {
          removidosPorCargo++;
          return;
        }
      }
      final[mapaNomes[id] || `Oficial (${id})`] = statsPorID[id];
    });

    if (filtrarPorCargo && removidosPorCargo > 0 && Object.keys(final).length === 0) {
      console.warn(
        `[AVISO] Todos os ${removidosPorCargo} oficial(is) com atividade foram removidos pelo filtro de cargo (CARGOS_ESCRIVAES_RELATORIO). ` +
        `Verifique se os IDs de cargo estão corretos e se Discord_Guild_ID aponta pro servidor certo.`
      );
    }

    console.log(
      `[RELATORIO] Finalizado: ${Object.keys(final).length} oficial(is) no resultado final (${removidosPorCargo} removido(s) pelo filtro de cargo).`
    );
    res.status(200).json(final);
  } catch (e) {
    console.error("[ERRO CRÍTICO]", e);
    res.status(500).json({ error: "Erro interno no relatório" });
  }
};
