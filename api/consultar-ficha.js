// api/consultar-ficha.js
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  // Habilitar CORS para evitar bloqueios no frontend
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { idCidadao } = req.body;
  const {
    Discord_Bot_Token,
    CHANNEL_PRISOES_ID,
    CHANNEL_FIANCAS_ID,
    CHANNEL_LIMPEZA_ID,
  } = process.env;

  // Validação básica
  if (!idCidadao)
    return res.status(400).json({ error: "ID do cidadão é obrigatório." });

  try {
    // 1. BUSCAR TODAS AS LIMPEZAS PARA DEFINIR A TAXA E A DATA DE CORTE
    // Buscamos até 500 mensagens no canal de limpeza para ter um histórico sólido
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token,
      null, // Sem data de corte inicial (queremos o histórico todo disponível)
      500 // Limite de varredura
    );

    let dataUltimaLimpeza = new Date(0); // Se nunca limpou, conta desde sempre
    let totalLimpezasAnteriores = mensagensLimpeza.length;

    if (totalLimpezasAnteriores > 0) {
      // A primeira mensagem retornada é a mais recente
      dataUltimaLimpeza = new Date(mensagensLimpeza[0].timestamp);
    }

    // 2. BUSCAR PRISÕES E FIANÇAS APÓS A DATA DA ÚLTIMA LIMPEZA
    // Aumentamos o limite para 1000 mensagens para garantir que pegamos tudo
    const prisoes = await buscarMensagensDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza,
      1000
    );
    const fiancas = await buscarMensagensDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza,
      1000
    );

    const todosRegistros = [...prisoes, ...fiancas];

    // 3. PROCESSAR VALORES (Multas e Inafiançáveis)
    let somaMultas = 0;
    let totalInafiancaveis = 0;
    const listaCrimesInafiancaveis = [
      "Desacato",
      "Homicidio Doloso",
      "Tentativa de Homicidio",
      "Sequestro",
      "Homicidio",
      "Trafico",
    ];

    todosRegistros.forEach((msg) => {
      const embed = msg.embeds[0];
      if (!embed) return;

      // Soma Multas: Procura campos que contenham "Multa", "Valor" ou "Total"
      embed.fields?.forEach((f) => {
        const nomeCampo = f.name.toLowerCase();
        if (
          nomeCampo.includes("multa") ||
          nomeCampo.includes("total") ||
          nomeCampo.includes("valor")
        ) {
          const valorExtraido = parseInt(f.value.replace(/\D/g, "")) || 0;
          somaMultas += valorExtraido;
        }

        // Conta Crimes Inafiançáveis no campo de Crimes
        if (nomeCampo.includes("crime")) {
          listaCrimesInafiancaveis.forEach((crime) => {
            const regex = new RegExp(crime, "gi");
            const ocorrencias = (f.value.match(regex) || []).length;
            totalInafiancaveis += ocorrencias;
          });
        }
      });
    });

    // 4. CÁLCULO DA TAXA PROGRESSIVA
    // Se 0 limpezas: 1.000.000
    // Se 1 limpeza: 1.400.000, etc...
    const taxaBase = 1000000 + totalLimpezasAnteriores * 400000;
    const custoInafiancaveis = totalInafiancaveis * 400000;
    const totalGeral = taxaBase + somaMultas + custoInafiancaveis;

    res.status(200).json({
      taxaBase,
      somaMultas,
      totalInafiancaveis,
      custoInafiancaveis,
      totalGeral,
      totalLimpezasAnteriores,
      ultimaLimpeza:
        dataUltimaLimpeza.getTime() === 0
          ? "Nunca"
          : dataUltimaLimpeza.toLocaleDateString("pt-BR"),
      registrosEncontrados: todosRegistros.length,
    });
  } catch (error) {
    console.error("Erro na API de consulta:", error);
    res
      .status(500)
      .json({ error: "Erro interno ao consultar Discord: " + error.message });
  }
};

/**
 * Função de busca com Paginação (Before)
 */
async function buscarMensagensDiscord(
  channelId,
  idCidadao,
  token,
  dataCorte = null,
  limiteBusca = 500
) {
  let filtradas = [];
  let ultimoId = null;
  let processadas = 0;
  let continuar = true;

  while (continuar && processadas < limiteBusca) {
    let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
    if (ultimoId) url += `&before=${ultimoId}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!res.ok) {
      console.error(`Erro ao acessar canal ${channelId}: ${res.status}`);
      break;
    }

    const mensagens = await res.json();
    if (!mensagens || mensagens.length === 0) break;

    for (const msg of mensagens) {
      processadas++;
      ultimoId = msg.id;
      const dataMsg = new Date(msg.timestamp);

      // Se a mensagem for anterior à limpeza, paramos a busca neste canal
      if (dataCorte && dataMsg <= dataCorte) {
        continuar = false;
        break;
      }

      // Verifica se o ID do cidadão aparece nos embeds
      const temId = JSON.stringify(msg.embeds || []).includes(idCidadao);
      if (temId) {
        filtradas.push(msg);
      }
    }

    if (mensagens.length < 100) break;
  }

  return filtradas;
}
