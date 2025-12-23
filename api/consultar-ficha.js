// api/consultar-ficha.js
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  const { idCidadao } = req.body;
  const {
    Discord_Bot_Token,
    CHANNEL_PRISOES_ID,
    CHANNEL_FIANCAS_ID,
    CHANNEL_LIMPEZA_ID,
  } = process.env;

  try {
    // 1. BUSCAR ÚLTIMA LIMPEZA E CONTAR HISTÓRICO
    const mensagensLimpeza = await buscarMensagensDiscord(
      CHANNEL_LIMPEZA_ID,
      idCidadao,
      Discord_Bot_Token
    );
    let dataUltimaLimpeza = new Date(0); // Início de tudo
    let totalLimpezasAnteriores = mensagensLimpeza.length;

    if (totalLimpezasAnteriores > 0) {
      // A primeira da lista é a mais recente
      dataUltimaLimpeza = new Date(mensagensLimpeza[0].timestamp);
    }

    // 2. BUSCAR PRISÕES E FIANÇAS APÓS ESSA DATA
    const prisoes = await buscarMensagensDiscord(
      CHANNEL_PRISOES_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza
    );
    const fiancas = await buscarMensagensDiscord(
      CHANNEL_FIANCAS_ID,
      idCidadao,
      Discord_Bot_Token,
      dataUltimaLimpeza
    );

    const todosRegistros = [...prisoes, ...fiancas];

    // 3. PROCESSAR VALORES
    let somaMultas = 0;
    let totalInafiancaveis = 0;
    const listaCrimesInafiancaveis = [
      "Desacato",
      "Homicidio Doloso",
      "Tentativa de Homicidio",
    ]; // Adicione todos aqui

    todosRegistros.forEach((msg) => {
      const embed = msg.embeds[0];

      // Somar multas (Extraindo do campo "Multa" ou "Valores")
      const campoMulta = embed.fields.find(
        (f) => f.name.includes("Multa") || f.name.includes("Total")
      );
      if (campoMulta) {
        const valorMulta = parseInt(campoMulta.value.replace(/\D/g, "")) || 0;
        somaMultas += valorMulta;
      }

      // Contar inafiançáveis na descrição ou campos de crimes
      const textoCrimes =
        embed.fields.find((f) => f.name.includes("Crimes"))?.value || "";
      listaCrimesInafiancaveis.forEach((crime) => {
        const regex = new RegExp(crime, "gi");
        const ocorrencias = (textoCrimes.match(regex) || []).length;
        totalInafiancaveis += ocorrencias;
      });
    });

    // 4. CÁLCULO FINAL
    const taxaBase =
      totalLimpezasAnteriores === 0
        ? 1000000
        : 1000000 + totalLimpezasAnteriores * 400000;
    const custoInafiancaveis = totalInafiancaveis * 400000;
    const totalGeral = taxaBase + somaMultas + custoInafiancaveis;

    res.status(200).json({
      taxaBase,
      somaMultas,
      totalInafiancaveis,
      custoInafiancaveis,
      totalGeral,
      ultimaLimpeza: dataUltimaLimpeza,
      registrosEncontrados: todosRegistros.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

async function buscarMensagensDiscord(
  channelId,
  idCidadao,
  token,
  dataCorte = new Date(0)
) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;
  const response = await fetch(url, {
    headers: { Authorization: `Bot ${token}` },
  });
  const mensagens = await response.json();

  // Filtra mensagens que contêm o ID no embed e são posteriores à data de corte
  return mensagens.filter((msg) => {
    const dataMsg = new Date(msg.timestamp);
    const temId = JSON.stringify(msg.embeds).includes(idCidadao);
    return temId && dataMsg > dataCorte;
  });
}
