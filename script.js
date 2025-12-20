// ==========================================
// ⚙️ CONFIGURAÇÕES E DADOS GLOBAIS
// ==========================================
const CONFIG = {
  CLIENT_ID: "1451342682487259319",
  // Link direto para o brasão (necessário para o Discord conseguir carregar no footer)
  BRASAO_URL:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Bras%C3%A3o_da_Pol%C3%ADcia_Civil_do_Estado_do_Rio_de_Janeiro.png/120px-Bras%C3%A3o_da_Pol%C3%ADcia_Civil_do_Estado_do_Rio_de_Janeiro.png",
};

// 👇 RODAPÉ PADRÃO PARA TODOS OS EMBEDS 👇
const FOOTER_PADRAO = {
  text: "Sistema Policial",
  icon_url: CONFIG.BRASAO_URL,
};

const POSICOES = {
  nome: { x: 370, y: 250, max: 400 },
  id: { x: 754, y: 433 },
  rg: { x: 576, y: 433 },
  expedicao: { x: 122, y: 435 },
  validade: { x: 304, y: 435 },
  corTexto: "#000000",
  fonte: "bold 26px 'Arial'",
};

const POSICOES_LIMPEZA = {
  nome: { x: 180, y: 380 },
  id: { x: 550, y: 380 },
  rg: { x: 180, y: 440 },
  data: { x: 680, y: 380 },
  corTexto: "#000000",
  fonte: "bold 30px 'Arial'",
};

// TABELA DE PREÇOS
const PRECOS = {
  GLOCK: { arma: 400000, laudo: 250000, municao: 100000 },
  MP5: { arma: 600000, laudo: 300000, municao: 100000 },
  TASER: { arma: 700000, laudo: 300000, municao: 0 },
};

let dbPortes = [];

// ==========================================
// 🚀 INICIALIZAÇÃO
// ==========================================
document.addEventListener("DOMContentLoaded", async function () {
  console.log("🚀 Sistema Iniciado");

  try {
    configurarBotoes();
    ativarFormatacaoDinheiro();
    atualizarValoresPorte();
  } catch (e) {
    console.error("Erro config:", e);
  }

  const hash = window.location.hash;
  const isLoginPage = window.location.pathname.includes("login.html");
  const sessao = localStorage.getItem("pc_session");

  // 1. Retorno do Discord (Callback)
  if (hash.includes("access_token")) {
    const fragment = new URLSearchParams(hash.slice(1));
    const accessToken = fragment.get("access_token");
    const tokenType = fragment.get("token_type");
    window.history.replaceState({}, document.title, window.location.pathname);
    await validarLoginNaAPI(`${tokenType} ${accessToken}`);
    return;
  }

  // 2. Verificação de Sessão
  if (sessao) {
    if (isLoginPage) {
      window.location.href = "index.html";
    } else {
      document.body.style.display = "block";
      try {
        const user = JSON.parse(sessao);
        iniciarSistema(user);
        verificarPermissaoRelatorio();
        await carregarPortesDoDiscord();
      } catch (err) {
        console.error("Sessão inválida:", err);
        localStorage.removeItem("pc_session");
        window.location.href = "login.html";
      }
    }
  } else {
    if (!isLoginPage) {
      window.location.href = "login.html";
    } else {
      document.body.style.display = "flex";
    }
  }

  if (!isLoginPage) configurarDatasAutomaticas();
});

// ==========================================
// 📅 UTILITÁRIOS DE DATA
// ==========================================
function parseData(dataStr) {
  if (!dataStr) return new Date();
  const partes = dataStr.split("/");
  return new Date(partes[2], partes[1] - 1, partes[0]);
}

function calcularDiasCorridos(dataExpedicaoStr) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const expedicao = parseData(dataExpedicaoStr);
  expedicao.setHours(0, 0, 0, 0);

  const diffTime = Math.abs(hoje - expedicao);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// ==========================================
// 💲 CÁLCULO DE VALORES (EMISSÃO)
// ==========================================
window.atualizarValoresPorte = function () {
  const selectArma = document.getElementById("porte-arma");
  const checkMunicao = document.getElementById("check-municao");
  const checkDesconto = document.getElementById("check-desconto");
  const painel = document.getElementById("painel-valores");

  if (!selectArma || !painel) return;

  painel.classList.remove("hidden");
  const armaSelecionada = selectArma.value;
  const regras = PRECOS[armaSelecionada];

  if (armaSelecionada === "TASER") {
    checkMunicao.checked = false;
    checkMunicao.disabled = true;
  } else {
    checkMunicao.disabled = false;
  }

  const valorArma = regras.arma;
  const valorLaudo = regras.laudo;
  const valorMunicao =
    checkMunicao.checked && armaSelecionada !== "TASER" ? regras.municao : 0;

  const subtotal = valorArma + valorLaudo + valorMunicao;

  let valorDesconto = 0;
  if (checkDesconto && checkDesconto.checked) {
    valorDesconto = subtotal * 0.15;
  }

  const totalFinal = subtotal - valorDesconto;
  const fmt = (v) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  document.getElementById("val-arma").innerText = fmt(valorArma);
  document.getElementById("val-laudo").innerText = fmt(valorLaudo);
  document.getElementById("val-municao").innerText = fmt(valorMunicao);

  const rowDesconto = document.getElementById("row-desconto");
  const elDesconto = document.getElementById("val-desconto");

  if (valorDesconto > 0) {
    rowDesconto.style.display = "flex";
    elDesconto.innerText = "- " + fmt(valorDesconto);
  } else {
    rowDesconto.style.display = "none";
  }

  document.getElementById("val-total").innerText = fmt(totalFinal);

  painel.dataset.total = totalFinal;
  painel.dataset.desconto = valorDesconto;
  painel.dataset.municaoIncluded = valorMunicao > 0 ? "Sim" : "Não";
  painel.dataset.ehPolicial = valorDesconto > 0 ? "Sim" : "Não";
};

// ==========================================
// 🔘 BOTÕES E EVENTOS
// ==========================================
function configurarBotoes() {
  const btnPreview = document.getElementById("btn-gerar-previa");
  if (btnPreview) {
    const novoBtn = btnPreview.cloneNode(true);
    btnPreview.parentNode.replaceChild(novoBtn, btnPreview);
    novoBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.gerarPreviewPorte();
    });
  }

  const btnEmitir = document.getElementById("btn-emitir-final");
  if (btnEmitir) {
    const novoBtnEmitir = btnEmitir.cloneNode(true);
    btnEmitir.parentNode.replaceChild(novoBtnEmitir, btnEmitir);
    novoBtnEmitir.addEventListener("click", async () => {
      await processarEmissao();
    });
  }
}
// Dentro de configurarBotoes() no script.js
const btnRelatorio = document.getElementById("btn-atualizar-relatorio");
if (btnRelatorio) {
  btnRelatorio.addEventListener("click", () => {
    gerarRelatorioSemanal(); // Chama a função que busca os dados
  });
}

function ativarFormatacaoDinheiro() {
  const inputValor = document.getElementById("input-valor-limpeza");
  if (inputValor) {
    inputValor.addEventListener("input", function (e) {
      let value = e.target.value.replace(/\D/g, "");
      value = value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      e.target.value = value;
    });
  }
}

// ==========================================
// 📨 LÓGICA DE EMISSÃO
// ==========================================
async function processarEmissao() {
  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const rg = document.getElementById("porte-rg").value; // <--- O valor é pego aqui
  const arma = document.getElementById("porte-arma").value;
  const validade = document.getElementById("porte-validade").value;
  const expedicao = document.getElementById("porte-expedicao").value;

  const painel = document.getElementById("painel-valores");
  const total = painel ? painel.dataset.total || "0" : "0";
  const desconto = painel ? painel.dataset.desconto || "0" : "0";
  const temMunicao = painel ? painel.dataset.municaoIncluded || "Não" : "Não";
  const ehPolicial = painel ? painel.dataset.ehPolicial || "Não" : "Não";

  const regras = PRECOS[arma];
  const fmt = (v) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (!nome || !id)
    return mostrarAlerta("Erro", "Preencha Nome e Passaporte.", "warning");

  mostrarAlerta("Aguarde", "Gerando documento...", "warning");
  const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
  const mencaoOficial = sessao.id
    ? `<@${sessao.id}>`
    : `**${sessao.username || "Oficial"}**`;
  const msg = `✅ **PORTE APROVADO**\nEmitido por ${mencaoOficial}.`;

  const canvas = document.getElementById("canvas-porte");
  canvas.toBlob(async (blob) => {
    const nomeArquivo = `porte_${id}.png`;

    let textoValores = `Arma: \`${fmt(regras.arma)}\`\nLaudo: \`${fmt(
      regras.laudo
    )}\`\nMunição: \`${
      temMunicao === "Sim" ? fmt(regras.municao) : "R$ 0,00"
    }\``;
    if (ehPolicial === "Sim") {
      textoValores += `\nDesconto Policial (15%): \`-${fmt(
        parseFloat(desconto)
      )}\``;
    }
    textoValores += `\n**TOTAL: \`${parseInt(total).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    })}\`**`;

    const embedData = {
      title: `PORTE EMITIDO: ${arma}`,
      description: `Documento oficial registrado.`,
      color: 3447003,
      fields: [
        {
          name: "👤 Cidadão",
          value: `**${nome.toUpperCase()}**`,
          inline: true,
        },
        { name: "🆔 Passaporte", value: `\`${id}\``, inline: true },

        // 👇 AQUI ESTAVA FALTANDO SALVAR O RG 👇
        { name: "🪪 RG", value: `\`${rg || "N/A"}\``, inline: true },

        { name: "👮 Oficial", value: mencaoOficial, inline: true },
        { name: "🔫 Armamento", value: arma, inline: true },
        { name: "📦 Munição", value: temMunicao, inline: true },
        { name: "📅 Validade", value: `\`${validade}\``, inline: true },
        { name: "💰 Valores", value: textoValores, inline: false },
      ],
      image: { url: `attachment://${nomeArquivo}` },
      footer: FOOTER_PADRAO,
    };

    const sucesso = await enviarParaAPI(
      blob,
      nomeArquivo,
      "porte",
      embedData,
      msg
    );
    if (sucesso) {
      await mostrarAlerta("Sucesso", "Porte emitido!", "success");
      // Atualiza lista local já com o RG para não precisar recarregar
      dbPortes.push({
        nome,
        id,
        rg,
        arma,
        validade,
        expedicao,
        status: "Ativo",
      });
      renderTables();
      atualizarStats();
      window.navegar("dashboard");
      document.getElementById("preview-porte-container").style.display = "none";
      document.getElementById("porte-nome").value = "";
      document.getElementById("porte-id").value = "";
      document.getElementById("porte-rg").value = ""; // Limpa RG também
      document.getElementById("check-desconto").checked = false;
      atualizarValoresPorte();
    }
  });
}

// ==========================================
// 🧼 LÓGICA DE LIMPEZA
// ==========================================
window.processarLimpeza = async function () {
  const nome = (document.getElementById("limpeza-nome")?.value || "").trim();
  const id = (document.getElementById("limpeza-id")?.value || "").trim();
  const rg = (document.getElementById("limpeza-rg")?.value || "").trim();
  const valor = (
    document.getElementById("input-valor-limpeza")?.value || "0"
  ).trim();

  if (!nome || !id)
    return mostrarAlerta(
      "Dados Incompletos",
      "Preencha NOME e PASSAPORTE.",
      "warning"
    );

  const confirmou = await confirmarAcao(
    "Limpar Ficha?",
    `Confirmar limpeza para ${nome} (R$ ${valor})?`
  );
  if (!confirmou) return;

  mostrarAlerta("Processando", "Gerando comprovante...", "warning");

  try {
    const blobLimpeza = await gerarBlobLimpeza(nome, id, rg);
    const nomeArquivo = `limpeza_${id}.png`;

    const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
    const mencaoOficial = sessao.id
      ? `<@${sessao.id}>`
      : `**${sessao.username || "Oficial"}**`;

    const mensagemExterna = ` **LIMPEZA DE FICHA REALIZADA**\nProcedimento realizado por ${mencaoOficial}.`;

    const embedLimpeza = {
      title: "LIMPEZA DE FICHA",
      description: `O registro criminal foi limpo mediante pagamento de taxa.`,
      color: 65280,
      fields: [
        {
          name: "👤 Cidadão",
          value: `**${nome.toUpperCase()}**`,
          inline: true,
        },
        { name: "🆔 Passaporte", value: `\`${id}\``, inline: true },
        { name: "💰 Valor Pago", value: `R$ ${valor}`, inline: true },
        {
          name: "📅 Data",
          value: new Date().toLocaleDateString("pt-BR"),
          inline: true,
        },
      ],
      image: { url: `attachment://${nomeArquivo}` },
      footer: FOOTER_PADRAO, // <-- RODAPÉ PADRÃO DO SISTEMA
      timestamp: new Date().toISOString(),
    };

    const sucesso = await enviarParaAPI(
      blobLimpeza,
      nomeArquivo,
      "limpeza",
      embedLimpeza,
      mensagemExterna
    );

    if (sucesso) {
      mostrarAlerta("Sucesso", "Procedimento realizado!", "success");
      document.getElementById("limpeza-nome").value = "";
      document.getElementById("limpeza-id").value = "";
      document.getElementById("input-valor-limpeza").value = "";
    }
  } catch (erro) {
    console.error(erro);
    mostrarAlerta("Erro", "Erro ao processar limpeza.", "error");
  }
};

function gerarBlobLimpeza(nome, id, rg) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.src = "assets/bg_limpeza.png";

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      ctx.font = POSICOES_LIMPEZA.fonte;
      ctx.fillStyle = POSICOES_LIMPEZA.corTexto;
      ctx.textAlign = "left";

      ctx.fillText(
        nome.toUpperCase(),
        POSICOES_LIMPEZA.nome.x,
        POSICOES_LIMPEZA.nome.y
      );
      ctx.fillText(id, POSICOES_LIMPEZA.id.x, POSICOES_LIMPEZA.id.y);
      ctx.fillText(rg || "N/A", POSICOES_LIMPEZA.rg.x, POSICOES_LIMPEZA.rg.y);
      ctx.fillText(
        new Date().toLocaleDateString("pt-BR"),
        POSICOES_LIMPEZA.data.x,
        POSICOES_LIMPEZA.data.y
      );

      canvas.toBlob((blob) => resolve(blob), "image/png");
    };
    img.onerror = () =>
      reject(new Error("Imagem assets/bg_limpeza.png não encontrada."));
  });
}

// ==========================================
// 👁️ PREVIEW (VISUAL)
// ==========================================
window.gerarPreviewPorte = function () {
  const container = document.getElementById("preview-porte-container");
  const canvas = document.getElementById("canvas-porte");
  const imgPreview = document.getElementById("img-porte-final");

  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const arma = document.getElementById("porte-arma").value;
  const rg = document.getElementById("porte-rg").value;
  const expedicao = document.getElementById("porte-expedicao").value;
  const validade = document.getElementById("porte-validade").value;

  if (!nome || !id)
    return mostrarAlerta("Erro", "Preencha Nome e Passaporte", "warning");

  const ctx = canvas.getContext("2d");
  const imgBase = new Image();

  if (arma === "GLOCK") imgBase.src = "assets/porte_glock.png";
  else if (arma === "MP5") imgBase.src = "assets/porte_mp5.png";
  else imgBase.src = "assets/porte_taser.png";

  imgBase.onload = () => {
    canvas.width = imgBase.width;
    canvas.height = imgBase.height;
    ctx.drawImage(imgBase, 0, 0);
    ctx.font = POSICOES.fonte;
    ctx.fillStyle = POSICOES.corTexto;

    ctx.fillText(nome.toUpperCase(), POSICOES.nome.x, POSICOES.nome.y);
    ctx.fillText(id, POSICOES.id.x, POSICOES.id.y);
    ctx.fillText(rg, POSICOES.rg.x, POSICOES.rg.y);
    ctx.fillText(expedicao, POSICOES.expedicao.x, POSICOES.expedicao.y);
    ctx.fillText(validade, POSICOES.validade.x, POSICOES.validade.y);

    const dataUrl = canvas.toDataURL("image/png");
    imgPreview.src = dataUrl;
    imgPreview.style.display = "block";
    container.classList.remove("hidden");
    container.style.display = "block";

    configurarBotoes();
  };

  imgBase.onerror = () =>
    mostrarAlerta("Erro", "Imagem do porte não encontrada.", "error");
};

// ==========================================
// ☁️ DADOS E TABELAS
// ==========================================
async function carregarPortesDoDiscord() {
  try {
    const res = await fetch("/api/listar");
    if (!res.ok) throw new Error(`Erro API: ${res.status}`);
    const dados = await res.json();
    dbPortes = dados;
    renderTables();
    atualizarStats();
  } catch (erro) {
    console.error("Erro ao listar:", erro);
  }
}

window.renderTables = function () {
  const tbodyRevogacao = document.getElementById("lista-ativos-para-revogar");
  const tbodyRenovacao = document.getElementById("lista-renovacao");
  const filtro = document.getElementById("input-busca")
    ? document.getElementById("input-busca").value.toLowerCase()
    : "";

  if (tbodyRevogacao) tbodyRevogacao.innerHTML = "";
  if (tbodyRenovacao) tbodyRenovacao.innerHTML = "";

  dbPortes
    .slice()
    .reverse()
    .forEach((porte, index) => {
      if (porte.status === "Revogado") return;

      if (
        filtro &&
        !porte.nome.toLowerCase().includes(filtro) &&
        !porte.id.includes(filtro)
      )
        return;

      const diasCorridos = calcularDiasCorridos(porte.expedicao);

      // 1. RENOVAÇÃO (30 a 33 dias)
      if (diasCorridos >= 30 && diasCorridos <= 33) {
        if (tbodyRenovacao) {
          const tr = document.createElement("tr");
          tr.innerHTML = `
                <td>${porte.nome}</td>
                <td>${porte.id}</td>
                <td>${porte.expedicao}</td>
                <td><span class="badge-warning">${diasCorridos} dias (Prazo Final)</span></td>
                <td>
                    <button class="btn-primary" style="padding: 5px 10px; font-size: 0.8rem;" onclick="renovarPorte('${porte.id}')">
                        <i class="fa-solid fa-arrows-rotate"></i> Renovar
                    </button>
                </td>
            `;
          tbodyRenovacao.appendChild(tr);
        }
      }

      // 2. REVOGAÇÃO (Todos ativos)
      if (tbodyRevogacao) {
        const trRev = document.createElement("tr");
        let validadeHTML = porte.validade || "N/A";

        if (diasCorridos > 33) {
          validadeHTML = `<span class="badge-priority"><i class="fa-solid fa-triangle-exclamation"></i> EXPIRADO (+3 dias)</span>`;
        } else if (diasCorridos >= 30) {
          validadeHTML = `<span class="badge-warning" style="color:orange">Período de Graça</span>`;
        }

        trRev.innerHTML = `
            <td>${porte.nome}</td>
            <td>${porte.id}</td>
            <td>${porte.arma}</td>
            <td>${validadeHTML}</td>
            <td>
                <button class="btn-danger" onclick="revogar('${porte.id}')">
                    <i class="fa-solid fa-ban"></i>
                </button>
            </td>
        `;
        tbodyRevogacao.appendChild(trRev);
      }
    });

  renderRevogadosHistorico();
  atualizarStats();
};

function renderRevogadosHistorico() {
  const tbodyJaRevogados = document.getElementById("lista-ja-revogados");
  if (!tbodyJaRevogados) return;
  tbodyJaRevogados.innerHTML = "";

  dbPortes
    .filter((p) => p.status === "Revogado")
    .forEach((p) => {
      tbodyJaRevogados.innerHTML += `
            <tr style="opacity:0.7">
                <td>${p.nome}</td>
                <td>${p.id}</td>
                <td>${p.expedicao || "N/A"}</td>
                <td><span class="badge revogado">REVOGADO</span></td>
            </tr>`;
    });
}

// ==========================================
// 🔄 AÇÃO DE RENOVAR
// ==========================================
window.renovarPorte = async function (idPorte) {
  const porte = dbPortes.find((p) => String(p.id) === String(idPorte));
  if (!porte) return;

  if (
    !(await confirmarAcao(
      "Renovar?",
      `Renovar porte de ${porte.nome} por +30 dias?`
    ))
  )
    return;

  mostrarAlerta("Processando", "Renovando porte...", "warning");

  const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
  const mencaoOficial = sessao.id
    ? `<@${sessao.id}>`
    : `**${sessao.username}**`;

  const hoje = new Date();
  const novaValidade = new Date();
  novaValidade.setDate(hoje.getDate() + 30);
  const novaValidadeStr = novaValidade.toLocaleDateString("pt-BR");

  const embedData = {
    title: "RENOVACAO DE PORTE",
    description: `O porte foi renovado com sucesso dentro do prazo de graça.`,
    color: 16776960, // Amarelo
    fields: [
      { name: "👤 Cidadão", value: `**${porte.nome}**`, inline: true },
      { name: "🆔 Passaporte", value: `\`${porte.id}\``, inline: true },
      { name: "👮 Renovado por", value: mencaoOficial, inline: true },
      { name: "🔫 Arma", value: porte.arma, inline: true },
      {
        name: "📅 Nova Validade",
        value: `\`${novaValidadeStr}\``,
        inline: true,
      },
    ],
    footer: FOOTER_PADRAO, // <-- RODAPÉ PADRÃO DO SISTEMA
  };

  const blob = new Blob(["RENOVACAO"], { type: "text/plain" });

  const sucesso = await enviarParaAPI(
    blob,
    "renovacao_log.txt",
    "revogacao",
    embedData,
    `🔄 **PORTE RENOVADO:** ${porte.id}`
  );

  if (sucesso) {
    porte.validade = novaValidadeStr;
    porte.expedicao = new Date().toLocaleDateString("pt-BR");
    renderTables();
    mostrarAlerta("Sucesso", "Porte renovado!", "success");
  } else {
    mostrarAlerta("Erro", "Falha ao registrar renovação.", "error");
  }
};

// ==========================================
// 🚨 FUNÇÃO DE REVOGAR (VIA TABELA)
// ==========================================
window.revogar = async function (idPassaporte, nomeCidadão) {
  // 1. Pergunta o Motivo usando o navegador (Simples e rápido)
  const motivo = prompt(`Qual o motivo da revogação para ${nomeCidadão}?`);

  // Se o usuário clicar em Cancelar ou deixar vazio, para tudo.
  if (!motivo) return;

  // 2. Pede confirmação visual
  const confirmacao = await mostrarConfirmacao(
    "Confirmar Revogação",
    `Tem certeza que deseja revogar o porte de ${nomeCidadão} (ID: ${idPassaporte})?`
  );

  if (!confirmacao) return;

  const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
  const webhookUrl = sessao.webhook;

  if (!webhookUrl) {
    return mostrarAlerta(
      "Erro",
      "Erro de sessão. Faça login novamente.",
      "error"
    );
  }

  mostrarAlerta("Aguarde", "Processando revogação...", "info");

  // Cria o Embed
  const embedRevog = {
    title: "PORTE REVOGADO",
    color: 15158332, // Vermelho
    fields: [
      { name: "Nome", value: nomeCidadão, inline: true },
      { name: "Passaporte", value: idPassaporte.toString(), inline: true },
      { name: "Motivo", value: motivo, inline: false },
      { name: "Revogado por", value: `<@${sessao.id}>`, inline: false },
    ],
    footer: {
      text: "Sistema Policial",
      icon_url: CONFIG.BRASAO_URL,
    },
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Sistema Policial",
        avatar_url: CONFIG.BRASAO_URL,
        embeds: [embedRevog],
      }),
    });

    if (response.ok) {
      mostrarAlerta("Sucesso", "Porte revogado!", "success");
      // Aqui você pode chamar a função para atualizar a tabela, se tiver
      if (typeof renderTables === "function") renderTables();
    } else {
      throw new Error("Erro no Discord");
    }
  } catch (error) {
    console.error(error);
    mostrarAlerta("Erro", "Falha ao comunicar com o servidor.", "error");
  }
};

function gerarBlobRevogacao(p) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    let imgName = "revogado_glock.png";
    if (p.arma && p.arma.includes("MP5")) imgName = "revogado_mp5.png";
    if (p.arma && p.arma.includes("TASER")) imgName = "revogado_taser.png";

    img.src = `assets/${imgName}`;
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      ctx.font = POSICOES.fonte;
      ctx.fillStyle = POSICOES.corTexto;
      ctx.fillText(p.nome.toUpperCase(), POSICOES.nome.x, POSICOES.nome.y);
      ctx.fillText(p.id, POSICOES.id.x, POSICOES.id.y);
      // RG Corrigido na imagem
      ctx.fillText(p.rg || "N/A", POSICOES.rg.x, POSICOES.rg.y);

      const dataHoje = new Date().toLocaleDateString("pt-BR");
      const dataExp =
        p.expedicao && p.expedicao !== "N/A" ? p.expedicao : dataHoje;
      const dataVal =
        p.validade && p.validade !== "N/A" ? p.validade : "Indeterminado";

      ctx.fillText(dataExp, POSICOES.expedicao.x, POSICOES.expedicao.y);
      ctx.fillText(dataVal, POSICOES.validade.x, POSICOES.validade.y);
      canvas.toBlob(resolve, "image/png");
    };
    img.onerror = reject;
  });
}

// ==========================================
// 🔌 COMUNICAÇÃO API
// ==========================================
async function enviarParaAPI(blob, filename, tipo, embed, content) {
  const form = new FormData();
  form.append("file", blob, filename);
  form.append("payload_json", JSON.stringify({ content, embeds: [embed] }));
  try {
    const res = await fetch(`/api/enviar?tipo=${tipo}`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(await res.text());
    return true;
  } catch (e) {
    console.error(e);
    mostrarAlerta("Erro", "Falha API (Verifique permissões do Bot)", "error");
    return false;
  }
}

async function validarLoginNaAPI(token) {
  try {
    const res = await fetch("/api/auth", { headers: { Authorization: token } });
    const data = await res.json();
    if (res.ok && data.authorized) {
      localStorage.setItem("pc_session", JSON.stringify({ ...data, token }));
      window.location.href = "index.html";
    } else window.location.href = "login.html?error=unauthorized";
  } catch (e) {
    console.error(e);
  }
}

// ==========================================
// 🛠️ FUNÇÕES DE SISTEMA & MODAL (VISUAL ATUALIZADO)
// ==========================================
function atualizarStats() {
  const elA = document.getElementById("counter-ativos");
  const elR = document.getElementById("counter-revogados");
  if (elA) elA.innerText = dbPortes.filter((p) => p.status === "Ativo").length;
  if (elR)
    elR.innerText = dbPortes.filter((p) => p.status === "Revogado").length;
}

function configurarDatasAutomaticas() {
  const hoje = new Date();
  const cExp = document.getElementById("porte-expedicao");
  if (cExp) cExp.value = hoje.toLocaleDateString("pt-BR");
  const cVal = document.getElementById("porte-validade");
  if (cVal) {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    cVal.value = d.toLocaleDateString("pt-BR");
  }
  const dt = document.getElementById("data-atual");
  if (dt) dt.innerText = hoje.toLocaleDateString("pt-BR");
}

function iniciarSistema(user) {
  const div = document.querySelector(".user-profile");
  if (div) {
    const avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
      : "assets/logo_pc.png";
    div.innerHTML = `<div class="avatar-circle"><img src="${avatar}" style="width:100%"></div><div class="user-info"><p>${user.username}</p><small>● Online</small></div><button onclick="logout()" style="color:#e52e4d;background:none;border:none;margin-left:auto"><i class="fa-solid fa-right-from-bracket"></i></button>`;
  }
}

window.logout = () => {
  localStorage.removeItem("pc_session");
  window.location.href = "login.html";
};

window.navegar = (tela) => {
  // 1. Esconde todas as telas
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.add("hidden"));

  // 2. Remove ativo dos menus
  document
    .querySelectorAll(".nav-links li")
    .forEach((l) => l.classList.remove("active"));

  // 3. Mostra a tela certa (Agora vai achar o sec-relatorios!)
  const sec = document.getElementById(`sec-${tela}`);
  if (sec) sec.classList.remove("hidden");

  // 4. Ativa o menu (opcional, se quiser destaque)
  const menu = document.getElementById(`menu-${tela}`);
  if (menu) menu.classList.add("active");

  // Recarrega datas se for emissão, etc.
  if (tela === "emissao") configurarDatasAutomaticas();
};

// 👇 MODAL PERSONALIZADO (NÃO USA ALERT/CONFIRM NATIVO) 👇
window.confirmarAcao = (titulo, mensagem, tipo = "padrao") => {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-modal");
    // Se não achar o modal no HTML, usa o nativo por segurança
    if (!modal) return resolve(confirm(`${titulo}\n${mensagem}`));

    const elTitulo = document.getElementById("modal-title");
    const elDesc = document.getElementById("modal-desc");
    const elIcon = document.getElementById("modal-icon");
    const btnConfirm = document.getElementById("btn-modal-confirm");
    const btnCancel = document.getElementById("btn-modal-cancel");

    elTitulo.innerText = titulo;
    elDesc.innerText = mensagem;

    if (tipo === "danger") {
      elIcon.className = "fa-solid fa-triangle-exclamation modal-icon danger";
      btnConfirm.className = "btn-danger-modal";
      btnConfirm.innerText = "Sim, Revogar";
    } else {
      elIcon.className = "fa-solid fa-circle-question modal-icon";
      elIcon.style.color = "#fff";
      btnConfirm.className = "btn-primary";
      btnConfirm.innerText = "Confirmar";
    }

    modal.classList.remove("hidden");
    btnCancel.classList.remove("hidden");

    // Clona botões para limpar eventos antigos
    const novoConfirm = btnConfirm.cloneNode(true);
    const novoCancel = btnCancel.cloneNode(true);
    btnConfirm.parentNode.replaceChild(novoConfirm, btnConfirm);
    btnCancel.parentNode.replaceChild(novoCancel, btnCancel);

    novoConfirm.onclick = () => {
      modal.classList.add("hidden");
      novoCancel.classList.add("hidden");
      resolve(true);
    };
    novoCancel.onclick = () => {
      modal.classList.add("hidden");
      novoCancel.classList.add("hidden");
      resolve(false);
    };
  });
};

// Alerta Simples (Só OK)
window.mostrarAlerta = (titulo, mensagem, type) => {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-modal");
    if (!modal) {
      alert(`${titulo}\n${mensagem}`);
      return resolve(true);
    }

    const elTitulo = document.getElementById("modal-title");
    const elDesc = document.getElementById("modal-desc");
    const elIcon = document.getElementById("modal-icon");
    const btnConfirm = document.getElementById("btn-modal-confirm");
    const btnCancel = document.getElementById("btn-modal-cancel");

    elTitulo.innerText = titulo;
    elDesc.innerText = mensagem;

    if (type === "error")
      elIcon.className = "fa-solid fa-circle-xmark modal-icon error";
    else if (type === "warning")
      elIcon.className = "fa-solid fa-circle-exclamation modal-icon warning";
    else elIcon.className = "fa-solid fa-circle-check modal-icon success";
    elIcon.style.color = "";

    btnCancel.classList.add("hidden");
    btnConfirm.className = "btn-primary";
    btnConfirm.innerText = "OK";

    modal.classList.remove("hidden");

    const novoBtn = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(novoBtn, btnConfirm);

    novoBtn.onclick = () => {
      modal.classList.add("hidden");
      resolve(true);
    };
  });
};
async function verificarPermissaoRelatorio() {
  const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");

  // Se não tiver roles, não faz nada (continua hidden)
  if (!sessao.roles) return;

  try {
    const res = await fetch("/api/verificar-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: sessao.roles }),
    });

    const data = await res.json();

    if (data.isAdmin) {
      const btnRelatorio = document.getElementById("menu-relatorios");
      if (btnRelatorio) {
        // Apenas removemos a classe que esconde.
        // O estilo visual virá do seu style.css padrão.
        btnRelatorio.classList.remove("hidden");
        console.log("🔓 Aba Relatórios liberada.");
      }
    }
  } catch (erro) {
    console.error("Erro permissão:", erro);
  }
}

// ===============================================
// 📊 LÓGICA DE RELATÓRIOS (Atualizada)
// ===============================================

// 1. Função Principal de Geração
window.gerarRelatorio = async function () {
  const corpo = document.getElementById("corpo-relatorio");
  const inicioInput = document.getElementById("rel-inicio");
  const fimInput = document.getElementById("rel-fim");

  // Validação
  if (!inicioInput.value || !fimInput.value) {
    alert("⚠️ Por favor, selecione a Data Inicial e a Data Final.");
    return;
  }

  // Feedback visual (Loading)
  corpo.innerHTML = `
        <tr>
            <td colspan="7" align="center" style="padding: 40px;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; color: var(--gold-accent);"></i>
                <p style="margin-top: 10px; color: #ccc;">Analisando registros do Discord...</p>
            </td>
        </tr>
    `;

  try {
    const user = JSON.parse(localStorage.getItem("pc_session") || "{}");

    // Chamada API
    const response = await fetch("/api/relatorio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roles: user.roles,
        dataInicio: inicioInput.value,
        dataFim: fimInput.value,
      }),
    });

    if (!response.ok) throw new Error("Erro na comunicação com a API");

    const dados = await response.json();

    // Limpa tabela
    corpo.innerHTML = "";

    // Verifica se veio vazio
    if (Object.keys(dados).length === 0) {
      corpo.innerHTML = `<tr><td colspan="7" align="center" style="padding: 30px;">Nenhum registro encontrado neste período.</td></tr>`;
      return;
    }

    // Preenche Tabela
    Object.keys(dados).forEach((oficial) => {
      const d = dados[oficial];
      const total =
        (d.emissao || 0) +
        (d.renovacao || 0) +
        (d.limpeza || 0) +
        (d.revogacao || 0);
      const meta = 15;
      const bateuMeta = total >= meta;

      // Define o HTML do Status
      const statusHtml = bateuMeta
        ? `<span class="meta-badge meta-success"><i class="fa-solid fa-check"></i> Meta Batida</span>`
        : `<span class="meta-badge meta-warning"><i class="fa-solid fa-clock"></i> Falta ${
            meta - total
          }</span>`;

      // Linha da Tabela
      const row = `
                <tr>
                    <td style="font-weight: bold; color: var(--text-primary);">${oficial}</td>
                    <td align="center">${d.emissao || 0}</td>
                    <td align="center">${d.renovacao || 0}</td>
                    <td align="center">${d.limpeza || 0}</td>
                    <td align="center">${d.revogacao || 0}</td>
                    <td align="center" style="background: rgba(255,255,255,0.05); font-weight: bold; color: var(--gold-accent); font-size: 1.1em;">${total}</td>
                    <td align="center">${statusHtml}</td>
                </tr>
            `;
      corpo.innerHTML += row;
    });
  } catch (error) {
    console.error(error);
    corpo.innerHTML = `<tr><td colspan="7" align="center" style="color: #e52e4d; padding: 20px;">Erro ao carregar dados. Tente novamente.</td></tr>`;
  }
};

// 2. Event Listener (CORREÇÃO DO CLIQUE)
// Adicione isto no final do seu arquivo ou dentro da função que inicia o app
document.addEventListener("DOMContentLoaded", () => {
  const btnFiltrar = document.getElementById("btn-filtrar-relatorio");

  if (btnFiltrar) {
    // Remove listeners antigos para evitar duplicação e adiciona o novo
    btnFiltrar.replaceWith(btnFiltrar.cloneNode(true));
    document
      .getElementById("btn-filtrar-relatorio")
      .addEventListener("click", window.gerarRelatorio);
    console.log("Botão de Relatório ativado com sucesso!");
  }
});
// ==========================================
// 🛡️ SISTEMA DE PERMISSÃO (RELATÓRIOS)
// ==========================================
async function verificarPermissaoRelatorio() {
  // 1. Pega a sessão salva
  const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");

  // Se não tiver roles salvos, nem tenta
  if (!sessao.roles || sessao.roles.length === 0) return;

  try {
    // 2. Pergunta para a API se esses cargos podem ver o relatório
    const res = await fetch("/api/verificar-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: sessao.roles }),
    });

    const data = await res.json();

    // 3. Se a API disser "true", mostra o botão
    if (data.isAdmin) {
      const btnRelatorio = document.getElementById("menu-relatorios");
      if (btnRelatorio) {
        btnRelatorio.classList.add("visible"); // Usa a classe do CSS novo
        console.log("🔓 Acesso a Relatórios LIBERADO.");
      }
    }
  } catch (erro) {
    console.error("Erro ao verificar permissão:", erro);
  }
}
