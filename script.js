// ==========================================
// âš™ï¸ CONFIGURAÃ‡Ã•ES E DADOS GLOBAIS
// ==========================================
const CONFIG = {
  CLIENT_ID: "1451342682487259319",
  // Link direto para o brasÃ£o (necessÃ¡rio para o Discord conseguir carregar no footer)
  BRASAO_URL:
    "https://pt.wikipedia.org/wiki/Ficheiro:Bras%C3%A3o_da_Pol%C3%ADcia_Civil_do_Estado_do_Rio_de_Janeiro.png",
};

// ðŸ‘‡ RODAPÃ‰ PADRÃƒO PARA TODOS OS EMBEDS ðŸ‘‡
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
  nome: { x: 100, y: 380 },
  id: { x: 550, y: 380 },
  rg: { x: 180, y: 440 },
  data: { x: 680, y: 380 },
  corTexto: "#000000",
  fonte: "bold 30px 'Arial'",
};

// TABELA DE PREÃ‡OS
const PRECOS = {
  GLOCK: { arma: 1200000, laudo: 600000, municao: 150000 },
  MP5: { arma: 1600000, laudo: 600000, municao: 150000 },
  TASER: { arma: 1400000, laudo: 600000, municao: 0 },
};

let dbPortes = [];
let dbRevogados = [];
let paginaRevogacao = 1;
const limiteRevogacao = 20;
let totalPaginasRevogacao = 1;
let ultimoFiltroRevogacao = "";
let catAnexos = {
  transferencia: null,
  olx: null,
  whatsapp: [],
};

// ==========================================
// ðŸ•’ SISTEMA DE GATILHOS TEMPORAIS
// ==========================================

/**
 * Calcula o tempo restante atÃ© a prÃ³xima meia-noite e agenda a auditoria.
 */
function agendarAuditoriaMeiaNoite() {
  const agora = new Date();
  const proximaMeiaNoite = new Date();

  // Define para o prÃ³ximo dia Ã s 00:00:00
  proximaMeiaNoite.setHours(24, 0, 0, 0);

  const tempoAteMeiaNoite = proximaMeiaNoite.getTime() - agora.getTime();

  console.log(
    `ðŸ•’ Auditoria AutomÃ¡tica: Agendada para as 00:00 (em ${Math.floor(
      tempoAteMeiaNoite / 1000 / 60
    )} min).`
  );

  setTimeout(() => {
    console.log("ðŸš€ Gatilho 00:00: Iniciando varredura de conformidade...");
    if (typeof window.verificarConformidadePortes === "function") {
      window.verificarConformidadePortes();
    }
    // Re-agenda para o dia seguinte
    agendarAuditoriaMeiaNoite();
  }, tempoAteMeiaNoite);
}

// ==========================================
// ðŸš€ INICIALIZAÃ‡ÃƒO
// ==========================================
document.addEventListener("DOMContentLoaded", async function () {
  console.log("ðŸš€ Sistema Iniciado");

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

  // 2. VerificaÃ§Ã£o de SessÃ£o
  if (sessao) {
    if (isLoginPage) {
      window.location.href = "index.html";
    } else {
      document.body.style.display = "block";
      try {
        const user = JSON.parse(sessao);
        iniciarSistema(user);
        verificarPermissaoRelatorio();

        // Carrega os dados do Discord
        await Promise.all([
          carregarPortesDoDiscord(),
          carregarRevogacoesDoDiscord(),
        ]);

        // Inicia o agendamento da meia-noite
        agendarAuditoriaMeiaNoite();
      } catch (err) {
        console.error("SessÃ£o invÃ¡lida:", err);
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
// ðŸ“… UTILITÃRIOS DE DATA
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
// ðŸ’² CÃLCULO DE VALORES (EMISSÃƒO)
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

  // --- ADICIONE ESTE BLOCO ---
  const portePainel = totalFinal * 0.6;
  const porteOficial = totalFinal * 0.4;

  const elPainelPorte = document.getElementById("val-split-painel-porte");
  const elOficialPorte = document.getElementById("val-split-oficial-porte");

  if (elPainelPorte) elPainelPorte.innerText = fmt(portePainel);
  if (elOficialPorte) elOficialPorte.innerText = fmt(porteOficial);

  painel.dataset.total = totalFinal;
  painel.dataset.desconto = valorDesconto;
  painel.dataset.municaoIncluded = valorMunicao > 0 ? "Sim" : "NÃ£o";
  painel.dataset.ehPolicial = valorDesconto > 0 ? "Sim" : "NÃ£o";
};

// ==========================================
// ðŸ”˜ BOTÃ•ES E EVENTOS
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
// ðŸ“¨ LÃ“GICA DE EMISSÃƒO
// ==========================================
async function processarEmissao() {
  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const rg = document.getElementById("porte-rg").value;
  const arma = document.getElementById("porte-arma").value;
  const validade = document.getElementById("porte-validade").value;
  const expedicao = document.getElementById("porte-expedicao").value;

  const painel = document.getElementById("painel-valores");
  const total = painel ? painel.dataset.total || "0" : "0";
  const desconto = painel ? painel.dataset.desconto || "0" : "0";
  const temMunicao = painel ? painel.dataset.municaoIncluded || "NÃ£o" : "NÃ£o";
  const ehPolicial = painel ? painel.dataset.ehPolicial || "NÃ£o" : "NÃ£o";

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

  const msg = `âœ… **PORTE APROVADO**\nEmitido por ${mencaoOficial}.`;

  const canvas = document.getElementById("canvas-porte");
  canvas.toBlob(async (blob) => {
    const nomeArquivo = `porte_${id}.png`;

    let textoValores = `Arma: \`${fmt(regras.arma)}\`\nLaudo: \`${fmt(
      regras.laudo
    )}\`\nMuniÃ§Ã£o: \`${
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
      title: `ðŸ“„ EMISSÃƒO DE PORTE: ${arma}`,
      description: `Documento oficial registrado.`,
      color: 3447003,
      fields: [
        {
          name: "ðŸ‘¤ CidadÃ£o",
          value: `**${nome.toUpperCase()}**`,
          inline: true,
        },
        { name: "ðŸ†” Passaporte", value: `\`${id}\``, inline: true },
        { name: "ðŸªª RG", value: `\`${rg || "N/A"}\``, inline: true },
        { name: "ðŸ‘® Oficial", value: mencaoOficial, inline: true },
        { name: "ðŸ”« Armamento", value: arma, inline: true },
        { name: "ðŸ“¦ MuniÃ§Ã£o", value: temMunicao, inline: true },
        { name: "ðŸ“… Validade", value: `\`${validade}\``, inline: true },
        { name: "ðŸ’° Valores", value: textoValores, inline: false },
      ],
      image: { url: `attachment://${nomeArquivo}` },
      footer: FOOTER_PADRAO,
    };

    // âœ¨ CORREÃ‡ÃƒO: Capturamos o retorno da API que contÃ©m o ID da mensagem
    const resultado = await enviarParaAPI(
      blob,
      nomeArquivo,
      "porte",
      embedData,
      msg
    );

    if (resultado) {
      // âœ… Agora salvamos o message_id na hora da criaÃ§Ã£o!
      dbPortes.push({
        nome,
        id,
        rg,
        arma,
        validade,
        expedicao,
        message_id: resultado.id, // ðŸ”‘ O ID que o Discord retornou
        oficial: sessao.username,
        oficial_id: sessao.id, // ðŸ‘® ID para o relatÃ³rio
        status: "Ativo",
      });

      renderTables();
      atualizarStats();

      await mostrarAlerta("Sucesso", "Porte emitido!", "success");

      window.navegar("dashboard");
      document.getElementById("preview-porte-container").style.display = "none";
      document.getElementById("porte-nome").value = "";
      document.getElementById("porte-id").value = "";
      document.getElementById("porte-rg").value = "";
      document.getElementById("check-desconto").checked = false;
      atualizarValoresPorte();
    }
  });
}
// ==========================================
// ðŸ” CONSULTA CRIMINAL INTEGRADA (COM DIVISÃƒO DE VALORES)
// ==========================================
window.consultarFicha = async function () {
  const id = document.getElementById("limpeza-id").value;

  if (!id) {
    return mostrarAlerta("Erro", "Digite o ID para consultar.", "warning");
  }

  // Feedback visual no botÃ£o
  const btn = document.querySelector(".btn-search");
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Consultando...';
  btn.disabled = true;

  try {
    const res = await fetch("/api/consultar-ficha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idCidadao: id }),
    });

    if (!res.ok) throw new Error("Erro na consulta");

    const dados = await res.json();

    // --- PROTEÃ‡ÃƒO DE ERRO ---
    if (dados.error) {
      throw new Error(dados.error);
    }
    // ------------------------

    // FunÃ§Ã£o de formataÃ§Ã£o local (mantendo seu padrÃ£o)
    // style: 'decimal' garante que mostre casas decimais corretamente se necessÃ¡rio
    const fmt = (v) =>
      (v || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    // 1. Preenche o input invisÃ­vel (usado no envio do relatÃ³rio)
    const inputValor = document.getElementById("input-valor-limpeza");
    if (inputValor) {
      // Aqui usamos o fmt para ficar bonito no input readonly tambÃ©m, ou raw value se preferir
      inputValor.value = `R$ ${fmt(dados.totalGeral)}`;
    }

    // 2. ATUALIZA O RECIBO VISUAL (EXTRATO)
    document.getElementById("resumo-taxa-base").innerText = `R$ ${fmt(
      dados.taxaBase
    )}`;
    document.getElementById("resumo-multas").innerText = `R$ ${fmt(
      dados.somaMultas
    )}`;
    document.getElementById("resumo-inafiancaveis").innerText = `R$ ${fmt(
      dados.custoInafiancaveis
    )}`;

    // Total Geral Grande
    const totalGeral = dados.totalGeral || 0;
    document.getElementById("total-geral-exibicao").innerText = `R$ ${fmt(
      totalGeral
    )}`;

    // ============================================================
    // 2.1. CÃLCULO E EXIBIÃ‡ÃƒO DA DIVISÃƒO (60% / 40%)
    // ============================================================
    const valPainel = totalGeral * 0.6;
    const valOficial = totalGeral * 0.4;

    const elPainel = document.getElementById("txt-painel-limpeza-auto");
    const elOficial = document.getElementById("txt-oficial-limpeza-auto");

    if (elPainel) elPainel.innerText = `R$ ${fmt(valPainel)}`;
    if (elOficial) elOficial.innerText = `R$ ${fmt(valOficial)}`;
    // ============================================================

    // 3. Alerta de sucesso com resumo rÃ¡pido
    mostrarAlerta(
      "HistÃ³rico Recuperado",
      `O cidadÃ£o possui ${dados.totalLimpezasAnteriores} limpezas prÃ©vias e ${dados.totalInafiancaveis} crimes graves no histÃ³rico atual.`,
      "success"
    );
  } catch (erro) {
    console.error(erro);
    mostrarAlerta(
      "Erro de ConexÃ£o",
      "NÃ£o foi possÃ­vel recuperar os dados. Verifique o ID ou tente novamente.",
      "error"
    );
  } finally {
    // Restaura o botÃ£o
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};
// ==========================================
// ðŸ§¼ LÃ“GICA DE LIMPEZA
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
      title: `ðŸ“œ CERTIFICADO DE BONS ANTECEDENTES`, // Adicionado Ã­cone para facilitar busca
      description: `O registro criminal foi limpo mediante pagamento de taxa.`,
      color: 65280,
      fields: [
        {
          name: "ðŸ‘¤ CidadÃ£o",
          value: `**${nome.toUpperCase()}**`,
          inline: true,
        },
        { name: "ðŸ†” Passaporte", value: `\`${id}\``, inline: true },
        { name: "ðŸ’° Valor Pago", value: `R$ ${valor}`, inline: true },
        { name: "ðŸ‘® Oficial", value: mencaoOficial, inline: true }, // ðŸ‘ˆ OBRIGATÃ“RIO PARA O RELATÃ“RIO
        {
          name: "ðŸ“… Data",
          value: new Date().toLocaleDateString("pt-BR"),
          inline: true,
        },
      ],
      image: { url: `attachment://${nomeArquivo}` },
      footer: FOOTER_PADRAO,
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

function formatMemberLabel(member) {
  return member.nick || member.global_name || member.username || "Usuario";
}

let catMembersCache = null;
let catMembersLoading = false;
let catMembersError = null;
let catMembersSorted = null;

async function carregarMembrosDiscord() {
  if (catMembersCache) return catMembersCache;
  if (catMembersLoading) return [];
  catMembersLoading = true;
  try {
    const response = await fetch("/api/listar-membros");
    if (!response.ok) {
      catMembersError = "Falha ao carregar membros.";
      return [];
    }
    const data = await response.json();
    catMembersCache = data || [];
    return catMembersCache;
  } finally {
    catMembersLoading = false;
  }
}

function preencherSelect(selectId, members, placeholder) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const isMultiple = select.hasAttribute("multiple");
  select.innerHTML = "";
  if (catMembersError) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = catMembersError;
    select.appendChild(opt);
    return;
  }
  if (isMultiple && members.length === 0 && placeholder) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = placeholder;
    select.appendChild(opt);
  } else if (!isMultiple) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = placeholder || "Selecione um oficial";
    select.appendChild(opt);
  }
  members.forEach((member) => {
    if (!member.id) return;
    const opt = document.createElement("option");
    opt.value = member.id;
    opt.textContent = formatMemberLabel(member);
    select.appendChild(opt);
  });
}

function obterMembrosOrdenados() {
  if (catMembersSorted) return catMembersSorted;
  if (!catMembersCache || catMembersCache.length === 0) return [];
  catMembersSorted = catMembersCache
    .slice()
    .sort((a, b) => formatMemberLabel(a).localeCompare(formatMemberLabel(b)));
  return catMembersSorted;
}

function filtrarSelectPorTexto(selectId, texto) {
  const termo = (texto || "").trim().toLowerCase();
  const membros = obterMembrosOrdenados();
  const filtrados = termo
    ? membros.filter((member) => {
        const label = formatMemberLabel(member).toLowerCase();
        const id = String(member.id || "").toLowerCase();
        return label.includes(termo) || id.includes(termo);
      })
    : membros;

  preencherSelect(selectId, filtrados, "Selecione um oficial");

  if (termo && filtrados.length > 0) {
    const select = document.getElementById(selectId);
    if (select) select.value = filtrados[0].id;
  }
}

function renderCatAnexoPreview(preview, files, emptyLabel, multiple) {
  if (!preview) return;
  const lista = Array.isArray(files) ? files : files ? [files] : [];
  if (lista.length === 0) {
    preview.classList.remove("multi");
    preview.innerHTML = `<i class="fa-solid fa-image"></i><span>${emptyLabel}</span>`;
    return;
  }

  if (!multiple && lista.length === 1) {
    const file = lista[0];
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      preview.classList.remove("multi");
      preview.innerHTML = `<img src="${url}" alt="Preview do anexo">`;
    } else {
      preview.classList.remove("multi");
      preview.innerHTML = `<i class="fa-solid fa-file-lines"></i><span>${file.name}</span>`;
    }
    return;
  }

  preview.classList.add("multi");
  preview.innerHTML = lista
    .map((file) => {
      const url = URL.createObjectURL(file);
      return `<img src="${url}" alt="Preview do anexo">`;
    })
    .join("");
}

function configurarCatAnexo({
  key,
  dropId,
  inputId,
  previewId,
  buttonId,
  multiple,
  emptyLabel,
}) {
  const drop = document.getElementById(dropId);
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  const btn = document.getElementById(buttonId);

  if (!input || !preview) return;

  if (btn) {
    btn.addEventListener("click", () => input.click());
  }

  const atualizarPreview = () => {
    const arquivos = multiple
      ? catAnexos[key] || []
      : catAnexos[key] || null;
    renderCatAnexoPreview(
      preview,
      arquivos,
      emptyLabel || "Nenhuma imagem selecionada",
      multiple
    );
  };

  const aplicarArquivos = (files) => {
    if (multiple) {
      const lista = Array.from(files || []).slice(0, 2);
      if (Array.from(files || []).length > 2) {
        if (typeof mostrarAlerta === "function") {
          mostrarAlerta(
            "Atenção",
            "Você pode enviar no máximo 2 prints do WhatsApp.",
            "warning"
          );
        } else {
          alert("Você pode enviar no máximo 2 prints do WhatsApp.");
        }
      }
      catAnexos[key] = lista;
    } else {
      catAnexos[key] = files?.[0] || null;
    }
    atualizarPreview();
  };

  if (drop) {
    drop.addEventListener("dblclick", () => input.click());
    drop.addEventListener("click", () => drop.focus());
    drop.addEventListener("paste", (event) => {
      const items = event.clipboardData?.items || [];
      const imageItem = Array.from(items).find((item) =>
        item.type.startsWith("image/")
      );
      if (!imageItem) return;
      const blob = imageItem.getAsFile();
      if (!blob) return;
      const file = new File([blob], `${key}-print.png`, { type: blob.type });

      if (multiple) {
        const atual = Array.isArray(catAnexos[key]) ? catAnexos[key] : [];
        if (atual.length >= 2) {
          if (typeof mostrarAlerta === "function") {
            return mostrarAlerta(
              "Atenção",
              "Você pode enviar no máximo 2 prints do WhatsApp.",
              "warning"
            );
          }
          return alert("Você pode enviar no máximo 2 prints do WhatsApp.");
        }
        catAnexos[key] = [...atual, file];
      } else {
        catAnexos[key] = file;
      }
      atualizarPreview();
    });
  }

  input.addEventListener("change", () => {
    aplicarArquivos(input.files);
  });

  atualizarPreview();
}

async function prepararSelectsCAT() {
  if (catMembersCache) return;
  if (!catMembersLoading) {
    preencherSelect("cat-investigador-select", [], "Carregando membros...");
    preencherSelect("cat-autorizou-select", [], "Carregando membros...");
    preencherSelect("cat-envolvidos-select", [], "Carregando membros...");
  }
  const members = await carregarMembrosDiscord();
  if (!members || members.length === 0) return;
  catMembersSorted = null;
  const ordenados = obterMembrosOrdenados();
  preencherSelect("cat-investigador-select", ordenados, "Selecione um oficial");
  preencherSelect("cat-autorizou-select", ordenados, "Selecione um oficial");
  preencherSelect("cat-envolvidos-select", ordenados, "Selecione um oficial");
}

function coletarSelecionados(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return [];
  return Array.from(select.selectedOptions)
    .map((opt) => opt.value)
    .filter(Boolean);
}

function coletarListaIds(listId) {
  const list = document.getElementById(listId);
  if (!list) return [];
  return Array.from(list.querySelectorAll("[data-id]")).map((el) =>
    el.getAttribute("data-id")
  );
}

function adicionarNaLista(selectId, listId) {
  const picker = document.getElementById(selectId);
  const list = document.getElementById(listId);
  if (!picker || !list) return;

  const selectedOptions = Array.from(picker.selectedOptions).filter(
    (option) => option.value
  );
  if (selectedOptions.length === 0) return;

  selectedOptions.forEach((option) => {
    const selected = option.value;
    const exists = Array.from(list.querySelectorAll("[data-id]")).some(
      (el) => el.getAttribute("data-id") === selected
    );
    if (exists) return;

    const label = option.textContent || "Oficial";
    const row = document.createElement("div");
    row.className = "envolvido-item";
    row.setAttribute("data-id", selected);
    row.innerHTML = `<span>${label}</span><button type="button" aria-label="Remover">×</button>`;
    row.querySelector("button").addEventListener("click", () => row.remove());
    list.appendChild(row);
  });

  Array.from(picker.options).forEach((option) => {
    option.selected = false;
  });
}

window.registrarCAT = async function () {
  const operacao = document.getElementById("cat-operacao")?.value.trim();
  const organizacao = document.getElementById("cat-organizacao")?.value.trim();
  const suspeito = document.getElementById("cat-suspeito")?.value.trim();
  const rg = document.getElementById("cat-rg")?.value.trim();
  const linkPrisao = document.getElementById("cat-link-prisao")?.value.trim();
  const linkPericia = document.getElementById("cat-link-pericia")?.value.trim();
  const transferenciaInput = document.getElementById("cat-anexo-transferencia");
  const olxInput = document.getElementById("cat-anexo-olx");
  const whatsappInput = document.getElementById("cat-anexo-whatsapp");
  const transferencia =
    catAnexos.transferencia || transferenciaInput?.files?.[0] || null;
  const olx = catAnexos.olx || olxInput?.files?.[0] || null;
  let whatsapp = catAnexos.whatsapp.length
    ? catAnexos.whatsapp
    : Array.from(whatsappInput?.files || []);
  if (whatsapp.length > 2) {
    if (typeof mostrarAlerta === "function") {
      return mostrarAlerta(
        "Atenção",
        "Você pode enviar no máximo 2 prints do WhatsApp.",
        "warning"
      );
    }
    return alert("Você pode enviar no máximo 2 prints do WhatsApp.");
  }
  whatsapp = whatsapp.slice(0, 2);
  const anexos = [];
  if (transferencia) anexos.push(transferencia);
  if (olx) anexos.push(olx);
  whatsapp.forEach((file) => anexos.push(file));
  const itens = document.getElementById("cat-itens")?.value.trim();

  const investigadorIds = coletarListaIds("cat-investigador-list");
  const autorizouIds = coletarListaIds("cat-autorizou-list");
  const envolvidosIds = coletarListaIds("cat-envolvidos-list");
  const investigador = investigadorIds.map((id) => `<@${id}>`).join(" ");
  const autorizou = autorizouIds.map((id) => `<@${id}>`).join(" ");
  const envolvidos = envolvidosIds.map((id) => `<@${id}>`).join(" ");

  const camposObrigatorios = [
    { label: "Nome da Operação", value: operacao },
    { label: "Investigador(a) responsável", value: investigador },
    { label: "Quem Autorizou", value: autorizou },
    { label: "Participantes envolvidos", value: envolvidos },
    { label: "Organização", value: organizacao },
    { label: "Suspeito", value: suspeito },
    { label: "RG", value: rg },
    { label: "Itens apreendidos", value: itens },
    { label: "Link da prisão/fiança", value: linkPrisao },
    { label: "Link da perícia", value: linkPericia },
  ];

  const faltando = camposObrigatorios.find((c) => !c.value);
  if (faltando) {
    if (typeof mostrarAlerta === "function") {
      return mostrarAlerta(
        "Atenção",
        `Preencha o campo: ${faltando.label}.`,
        "warning"
      );
    }
    return alert(`Preencha o campo: ${faltando.label}.`);
  }

  if (anexos.length < 2) {
    if (typeof mostrarAlerta === "function") {
      return mostrarAlerta(
        "Atenção",
        "Envie pelo menos 2 imagens nos anexos do C.A.T.",
        "warning"
      );
    }
    return alert("Envie pelo menos 2 imagens nos anexos do C.A.T.");
  }

  const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
  if (!sessao.id) {
    if (typeof mostrarAlerta === "function") {
      return mostrarAlerta(
        "Erro",
        "Sessao invalida. Faça login novamente.",
        "error"
      );
    }
    return alert("Sessao invalida. Faça login novamente.");
  }

  const mensagem = [
    `**Nome da Operação:** ${operacao}`,
    `**Investigador(a) responsável:** ${investigador}`,
    `**Quem Autorizou:** ${autorizou}`,
    `**Participantes envolvidos:** ${envolvidos}`,
    `**Organização:** ${organizacao}`,
    `**Suspeito:** ${suspeito}`,
    `**RG:** ${rg}`,
    `**Itens apreendidos:** ${itens}`,
    `**Link da prisão/fiança:** ${linkPrisao}`,
    `**Link da perícia:** ${linkPericia}`,
    `**Relatório emitido por:** <@${sessao.id}>`,
  ].join("\n");

  try {
    if (typeof mostrarCarregando === "function") mostrarCarregando(true);
    const formData = new FormData();
    formData.append("content", mensagem);
    anexos.forEach((file) => {
      formData.append("file", file, file.name);
    });
    const response = await fetch("/api/enviar-cat", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Falha ao enviar C.A.T.");
    }

    if (typeof mostrarAlerta === "function") {
      mostrarAlerta("Sucesso", "C.A.T enviado com sucesso!", "success");
    }

    document.getElementById("cat-operacao").value = "";
    document.getElementById("cat-organizacao").value = "";
    document.getElementById("cat-suspeito").value = "";
    document.getElementById("cat-rg").value = "";
    document.getElementById("cat-link-prisao").value = "";
    document.getElementById("cat-link-pericia").value = "";
    if (transferenciaInput) transferenciaInput.value = "";
    if (olxInput) olxInput.value = "";
    if (whatsappInput) whatsappInput.value = "";
    catAnexos = { transferencia: null, olx: null, whatsapp: [] };
    renderCatAnexoPreview(
      document.getElementById("cat-anexo-transferencia-preview"),
      null,
      "Nenhuma imagem selecionada",
      false
    );
    renderCatAnexoPreview(
      document.getElementById("cat-anexo-olx-preview"),
      null,
      "Nenhuma imagem selecionada",
      false
    );
    renderCatAnexoPreview(
      document.getElementById("cat-anexo-whatsapp-preview"),
      [],
      "Nenhuma imagem selecionada",
      true
    );
    document.getElementById("cat-itens").value = "";

    const selectInvestigador = document.getElementById("cat-investigador-select");
    const selectAutorizou = document.getElementById("cat-autorizou-select");
    const listInvestigadorReset = document.getElementById("cat-investigador-list");
    const listAutorizouReset = document.getElementById("cat-autorizou-list");
    const listEnvolvidosReset = document.getElementById("cat-envolvidos-list");
    const selectEnvolvidos = document.getElementById("cat-envolvidos-select");
    [selectInvestigador, selectAutorizou, selectEnvolvidos].forEach((select) => {
      if (!select) return;
      Array.from(select.options).forEach((option) => {
        option.selected = false;
      });
    });
    if (listInvestigadorReset) listInvestigadorReset.innerHTML = "";
    if (listAutorizouReset) listAutorizouReset.innerHTML = "";
    if (listEnvolvidosReset) listEnvolvidosReset.innerHTML = "";
  } catch (err) {
    console.error(err);
    if (typeof mostrarAlerta === "function") {
      mostrarAlerta("Erro", "Falha ao enviar C.A.T.", "error");
    } else {
      alert("Falha ao enviar C.A.T.");
    }
  } finally {
    if (typeof mostrarCarregando === "function") mostrarCarregando(false);
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
      reject(new Error("Imagem assets/bg_limpeza.png nÃ£o encontrada."));
  });
}

// ==========================================
// ðŸ‘ï¸ PREVIEW (VISUAL)
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
    mostrarAlerta("Erro", "Imagem do porte nÃ£o encontrada.", "error");
};

// ==========================================
// â˜ï¸ DADOS E TABELAS
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

async function carregarRevogacoesDoDiscord() {
  try {
    const res = await fetch("/api/listar-revogacoes");
    if (!res.ok) throw new Error(`Erro API: ${res.status}`);
    const dados = await res.json();
    dbRevogados = Array.isArray(dados) ? dados : [];
    renderRevogadosHistorico();
    atualizarStats();
  } catch (erro) {
    console.error("Erro ao listar revogacoes:", erro);
  }
}

window.renderTables = function () {
  const tbodyRevogacao = document.getElementById("lista-ativos-para-revogar");
  const tbodyRenovacao = document.getElementById("lista-renovacao");
  const filtro = document.getElementById("input-busca")
    ? document.getElementById("input-busca").value.toLowerCase()
    : "";

  if (filtro !== ultimoFiltroRevogacao) {
    paginaRevogacao = 1;
    ultimoFiltroRevogacao = filtro;
  }

  if (tbodyRevogacao) tbodyRevogacao.innerHTML = "";
  if (tbodyRenovacao) tbodyRenovacao.innerHTML = "";

  const ativosFiltrados = dbPortes
    .slice()
    .reverse()
    .filter((porte) => porte.status !== "Revogado")
    .filter((porte) => {
      if (!filtro) return true;
      return (
        porte.nome.toLowerCase().includes(filtro) ||
        String(porte.id).includes(filtro)
      );
    });

  // 1. RENOVACAO (30 a 33 dias)
  ativosFiltrados.forEach((porte) => {
    const diasCorridos = calcularDiasCorridos(porte.expedicao);

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
  });

  // 2. REVOGACAO (Todos ativos) com paginacao
  const totalRegistros = ativosFiltrados.length;
  totalPaginasRevogacao = Math.max(
    1,
    Math.ceil(totalRegistros / limiteRevogacao)
  );
  if (paginaRevogacao > totalPaginasRevogacao) {
    paginaRevogacao = totalPaginasRevogacao;
  }

  const inicio = (paginaRevogacao - 1) * limiteRevogacao;
  const paginaAtual = ativosFiltrados.slice(
    inicio,
    inicio + limiteRevogacao
  );

  if (tbodyRevogacao) {
    paginaAtual.forEach((porte) => {
      const diasCorridos = calcularDiasCorridos(porte.expedicao);
      const trRev = document.createElement("tr");
      let validadeHTML = porte.validade || "N/A";

      if (diasCorridos > 33) {
        validadeHTML = `<span class="badge-priority"><i class="fa-solid fa-triangle-exclamation"></i> EXPIRADO (+3 dias)</span>`;
      } else if (diasCorridos >= 30) {
        validadeHTML = `<span class="badge-warning" style="color:orange">Periodo de Graca</span>`;
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
    });
  }

  atualizarPaginacaoRevogacao(totalRegistros);
  renderRevogadosHistorico();
  atualizarStats();
};

function atualizarPaginacaoRevogacao(totalRegistros) {
  const info = document.getElementById("revogacao-paginacao-info");
  const btnPrev = document.getElementById("revogacao-prev");
  const btnNext = document.getElementById("revogacao-next");

  if (!info || !btnPrev || !btnNext) return;

  info.innerText = `Pagina ${paginaRevogacao} de ${totalPaginasRevogacao} (${totalRegistros})`;
  btnPrev.disabled = paginaRevogacao <= 1;
  btnNext.disabled = paginaRevogacao >= totalPaginasRevogacao;
}

window.mudarPaginaRevogacao = function (delta) {
  paginaRevogacao = Math.min(
    totalPaginasRevogacao,
    Math.max(1, paginaRevogacao + delta)
  );
  renderTables();
};
function renderRevogadosHistorico() {
  const tbodyJaRevogados = document.getElementById("lista-ja-revogados");
  if (!tbodyJaRevogados) return;
  tbodyJaRevogados.innerHTML = "";

  dbRevogados.forEach((p) => {
    tbodyJaRevogados.innerHTML += `
          <tr style="opacity:0.7">
              <td>${p.nome}</td>
              <td>${p.id}</td>
              <td>${p.dataRevogacao || "N/A"}</td>
              <td><span class="badge revogado">REVOGADO</span></td>
          </tr>`;
  });
}

// ==========================================
// ðŸ”„ AÃ‡ÃƒO DE RENOVAR
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
    title: `ðŸ”„ RENOVAÃ‡ÃƒO DE PORTE`,
    description: `O porte foi renovado com sucesso dentro do prazo de graÃ§a.`,
    color: 16776960, // Amarelo
    fields: [
      { name: "ðŸ‘¤ CidadÃ£o", value: `**${porte.nome}**`, inline: true },
      { name: "ðŸ†” Passaporte", value: `\`${porte.id}\``, inline: true },
      { name: "ðŸ‘® Renovado por", value: mencaoOficial, inline: true },
      { name: "ðŸ”« Arma", value: porte.arma, inline: true },
      {
        name: "ðŸ“… Nova Validade",
        value: `\`${novaValidadeStr}\``,
        inline: true,
      },
    ],
    footer: FOOTER_PADRAO, // <-- RODAPÃ‰ PADRÃƒO DO SISTEMA
  };

  const blob = new Blob(["RENOVACAO"], { type: "text/plain" });

  const sucesso = await enviarParaAPI(
    blob,
    "renovacao_log.txt",
    "revogacao",
    embedData,
    `ðŸ”„ **PORTE RENOVADO:** ${porte.id}`
  );

  if (sucesso) {
    porte.validade = novaValidadeStr;
    porte.expedicao = new Date().toLocaleDateString("pt-BR");
    renderTables();
    mostrarAlerta("Sucesso", "Porte renovado!", "success");
  } else {
    mostrarAlerta("Erro", "Falha ao registrar renovaÃ§Ã£o.", "error");
  }
};

// ==========================================
// ðŸš« AÃ‡ÃƒO DE REVOGAR (CORRIGIDA)
// ==========================================
window.revogar = async function (idPassaporte) {
  const p = dbPortes.find((x) => String(x.id) === String(idPassaporte));
  if (!p) return mostrarAlerta("Erro", "Registro nÃ£o encontrado.", "error");

  // IMPORTANTE: Se nÃ£o tiver message_id, o sistema nÃ£o vai conseguir apagar do Discord
  if (!p.message_id) {
    console.error("Erro: message_id nÃ£o encontrado no objeto", p);
  }

  const confirmou = await confirmarAcao(
    "REVOGAR PORTE?",
    `Deseja revogar o porte de ${p.nome}? Isso apagarÃ¡ o registro original e enviarÃ¡ o log de revogaÃ§Ã£o.`,
    "danger"
  );

  if (!confirmou) return;

  const modal = document.getElementById("custom-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalDesc = document.getElementById("modal-desc");
  const modalFooter = document.getElementById("modal-footer");
  const modalIcon = document.getElementById("modal-icon");

  if (modalTitle) modalTitle.innerText = "Processando RevogaÃ§Ã£o...";
  if (modalDesc)
    modalDesc.innerText = "Apagando registro original e gerando log...";
  if (modalIcon) modalIcon.className = "fa-solid fa-spinner fa-spin";
  if (modalFooter) modalFooter.style.display = "none";
  modal.classList.remove("hidden");

  try {
    const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
    const mencaoRevogador = sessao.id
      ? `<@${sessao.id}>`
      : `**${sessao.username}**`;

    // Tentamos pegar a menÃ§Ã£o real do emissor original (p.oficial_id deve vir do listar.js)
    const mencaoEmissorOriginal = p.oficial_id
      ? `<@${p.oficial_id}>`
      : p.oficial;

    const blob = await gerarBlobRevogacao(p);
    const nomeArquivo = `revogacao_${idPassaporte}.png`;

    const embed = {
      title: `ðŸš« PORTE REVOGADO`,
      color: 15548997,
      fields: [
        { name: "ðŸ‘¤ CidadÃ£o", value: p.nome, inline: true },
        { name: "ðŸ†” ID", value: p.id, inline: true },
        { name: "ðŸ‘® Revogado por", value: mencaoRevogador, inline: true },
        // A menÃ§Ã£o abaixo Ã© vital para o relatorio.js continuar contando a meta
        {
          name: "ðŸ“œ Emissor Original",
          value: mencaoEmissorOriginal,
          inline: true,
        },
      ],
      image: { url: `attachment://${nomeArquivo}` },
      footer: FOOTER_PADRAO,
      timestamp: new Date().toISOString(),
    };

    const logTexto = `ðŸš¨ **PORTE REVOGADO** | CidadÃ£o: ${p.nome} | Emissor Original: ${mencaoEmissorOriginal}`;

    // 1. Envia o Log para o canal de revogaÃ§Ã£o
    const sucessoLog = await enviarParaAPI(
      blob,
      nomeArquivo,
      "revogacao",
      embed,
      logTexto
    );

    if (sucessoLog) {
      // 2. Apaga a mensagem original do canal de Portes para sumir do sistema
      if (p.message_id) {
        await fetch("/api/deletar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message_id: p.message_id }),
        });
      }

      // Atualiza a interface local
      dbPortes = dbPortes.filter(
        (item) => String(item.id) !== String(idPassaporte)
      );
      dbRevogados.unshift({
        nome: p.nome,
        id: p.id,
        dataRevogacao: new Date().toLocaleDateString("pt-BR"),
        status: "Revogado",
      });
      renderTables();
      atualizarStats();

      if (modalFooter) modalFooter.style.display = "flex";
      mostrarAlerta(
        "Sucesso",
        "Porte revogado e removido do sistema!",
        "success"
      );
    }
  } catch (e) {
    console.error(e);
    if (modalFooter) modalFooter.style.display = "flex";
    mostrarAlerta("Erro", "Falha ao processar revogaÃ§Ã£o.", "error");
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
// ðŸ”Œ COMUNICAÃ‡ÃƒO API
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

    // âœ¨ MUDANÃ‡A AQUI: Retornamos os dados da resposta em vez de apenas 'true'
    const data = await res.json();
    return data;
  } catch (e) {
    console.error(e);
    mostrarAlerta("Erro", "Falha API (Verifique permissÃµes do Bot)", "error");
    return null; // Retorna null em caso de erro
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
// ðŸ› ï¸ FUNÃ‡Ã•ES DE SISTEMA & MODAL (VISUAL ATUALIZADO)
// ==========================================
function atualizarStats() {
  const elA = document.getElementById("counter-ativos");
  const elR = document.getElementById("counter-revogados");
  if (elA) elA.innerText = dbPortes.filter((p) => p.status === "Ativo").length;
  if (elR) elR.innerText = dbRevogados.length;
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
    div.innerHTML = `<div class="avatar-circle"><img src="${avatar}" style="width:100%"></div><div class="user-info"><p>${user.username}</p><small>â— Online</small></div><button onclick="logout()" style="color:#e52e4d;background:none;border:none;margin-left:auto"><i class="fa-solid fa-right-from-bracket"></i></button>`;
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

  // Recarrega datas se for emissÃ£o, etc.
  if (tela === "emissao") configurarDatasAutomaticas();
};

// ðŸ‘‡ MODAL PERSONALIZADO (NÃƒO USA ALERT/CONFIRM NATIVO) ðŸ‘‡
window.confirmarAcao = (titulo, mensagem, tipo = "padrao") => {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-modal");
    // Se nÃ£o achar o modal no HTML, usa o nativo por seguranÃ§a
    if (!modal) return resolve(confirm(`${titulo}\n${mensagem}`));

    const elTitulo = document.getElementById("modal-title");
    const elDesc = document.getElementById("modal-desc");
    const elIcon = document.getElementById("modal-icon");
    const btnConfirm = document.getElementById("modal-btn-confirm");
    const btnCancel = document.getElementById("modal-btn-cancel");

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

    // Clona botÃµes para limpar eventos antigos
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

// Alerta Simples (SÃ³ OK)
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
    const btnConfirm = document.getElementById("modal-btn-confirm");
    const btnCancel = document.getElementById("modal-btn-cancel");

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

  // Se nÃ£o tiver roles, nÃ£o faz nada (continua hidden)
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
        // O estilo visual virÃ¡ do seu style.css padrÃ£o.
        btnRelatorio.classList.remove("hidden");
        console.log("ðŸ”“ Aba RelatÃ³rios liberada.");
      }
    }
  } catch (erro) {
    console.error("Erro permissÃ£o:", erro);
  }
}

// ===============================================
// ðŸ“Š LÃ“GICA DE RELATÃ“RIOS (Atualizada e Ordenada)
// ===============================================

window.gerarRelatorio = async function () {
  const corpo = document.getElementById("corpo-relatorio");
  const inicioInput = document.getElementById("rel-inicio");
  const fimInput = document.getElementById("rel-fim");

  if (!inicioInput.value || !fimInput.value) {
    // Certifique-se de que a funÃ§Ã£o mostrarAlerta existe ou use alert()
    if (typeof mostrarAlerta === "function") {
      return mostrarAlerta(
        "Atenção",
        "Selecione o período inicial e final.",
        "warning"
      );
    } else {
      return alert("Selecione o período inicial e final.");
    }
  }

  corpo.innerHTML = `<tr><td colspan="8" align="center"><i class="fa-solid fa-magnifying-glass"></i> Analisando registros...</td></tr>`;

  try {
    const user = JSON.parse(localStorage.getItem("pc_session") || "{}");

    const response = await fetch("/api/relatorio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataInicio: inicioInput.value,
        dataFim: fimInput.value,
        roles: user.roles, // Enviado caso precise filtrar permissÃµes no backend
      }),
    });

    const dados = await response.json();
    corpo.innerHTML = "";

    if (!dados || Object.keys(dados).length === 0) {
      corpo.innerHTML = `<tr><td colspan="8" align="center">Nenhum registro encontrado neste período.</td></tr>`;
      return;
    }

    // --- NOVA LÃ“GICA DE ORDENAÃ‡ÃƒO ---
    // 1. Converte o objeto { "Nome": {stats} } em um Array para poder ordenar
    const listaOrdenada = Object.entries(dados).map(([nome, stats]) => {
      const total =
        (stats.emissao || 0) +
        (stats.renovacao || 0) +
        (stats.limpeza || 0) +
        (stats.revogacao || 0) +
        (stats.cat || 0);
      return {
        nome: nome,
        ...stats,
        total: total,
      };
    });

    // 2. Ordena do Maior Total para o Menor (Decrescente)
    listaOrdenada.sort((a, b) => b.total - a.total);

    // 3. Renderiza na tabela
    const meta = 15;

    listaOrdenada.forEach((d) => {
      // Definicao do Badge de Status
      let statusHtml = "";
      if (d.total >= meta) {
        statusHtml = `<span class="badge badge-success" style="background-color: #28a745; color: white; padding: 4px 8px; border-radius: 4px;">Meta Batida</span>`;
      } else {
        const falta = meta - d.total;
        statusHtml = `<span class="badge badge-warning" style="background-color: #ffc107; color: black; padding: 4px 8px; border-radius: 4px;">Faltam ${falta}</span>`;
      }

      corpo.innerHTML += `
        <tr>
          <td style="font-weight: 500;">${d.nome}</td>
          <td align="center">${d.emissao || 0}</td>
          <td align="center">${d.renovacao || 0}</td>
          <td align="center">${d.limpeza || 0}</td>
          <td align="center">${d.revogacao || 0}</td>
          <td align="center">${d.cat || 0}</td>
          <td align="center"><strong style="font-size: 1.1em;">${
            d.total
          }</strong></td>
          <td align="center">${statusHtml}</td>
        </tr>`;
    });
  } catch (error) {
    console.error(error);
    corpo.innerHTML = `<tr><td colspan="8" align="center" style="color:red">Erro ao carregar relatório. Tente novamente.</td></tr>`;
  }
};

// ===============================================
// 2. Event Listener (Seguro)
// ===============================================
document.addEventListener("DOMContentLoaded", () => {
  const btnFiltrar = document.getElementById("btn-filtrar-relatorio");

  if (btnFiltrar) {
    // Remove listeners antigos (cloneNode Ã© um hack eficiente para isso)
    const novoBtn = btnFiltrar.cloneNode(true);
    btnFiltrar.parentNode.replaceChild(novoBtn, btnFiltrar);

    novoBtn.addEventListener("click", (e) => {
      e.preventDefault(); // Previne reload se estiver dentro de um form
      window.gerarRelatorio();
    });

    console.log("BotÃ£o de RelatÃ³rio ativado.");
  }
});
// ==========================================
// ðŸ›¡ï¸ SISTEMA DE PERMISSÃƒO (RELATÃ“RIOS)
// ==========================================
async function verificarPermissaoRelatorio() {
  // 1. Pega a sessÃ£o salva
  const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");

  // Se nÃ£o tiver roles salvos, nem tenta
  if (!sessao.roles || sessao.roles.length === 0) return;

  try {
    // 2. Pergunta para a API se esses cargos podem ver o relatÃ³rio
    const res = await fetch("/api/verificar-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: sessao.roles }),
    });

    const data = await res.json();

    // 3. Se a API disser "true", mostra o botÃ£o
    if (data.isAdmin) {
      const btnRelatorio = document.getElementById("menu-relatorios");
      if (btnRelatorio) {
        btnRelatorio.classList.add("visible"); // Usa a classe do CSS novo
        console.log("ðŸ”“ Acesso a RelatÃ³rios LIBERADO.");
      }
    }
  } catch (erro) {
    console.error("Erro ao verificar permissÃ£o:", erro);
  }
}

// protecao contra cliques aqui
// =========================================================
// ðŸ”Ž SISTEMA DE VARREDURA AUTOMÃTICA DE INFRAÃ‡Ã•ES (CORRIGIDO)
// =========================================================

window.verificarConformidadePortes = async function () {
  console.log("ðŸ” Auditoria: Iniciando varredura...");

  const statusAuditoria = document.getElementById("status-auditoria");
  const textoAuditoria = document.getElementById("texto-auditoria");

  if (statusAuditoria) statusAuditoria.classList.remove("hidden");

  // Usa a mesma regra de filtragem da tabela para auditar todos os ativos
  const filtro = document.getElementById("input-busca")
    ? document.getElementById("input-busca").value.toLowerCase()
    : "";
  const ativosFiltrados = dbPortes
    .slice()
    .reverse()
    .filter((porte) => porte.status !== "Revogado")
    .filter((porte) => {
      if (!filtro) return true;
      return (
        porte.nome.toLowerCase().includes(filtro) ||
        String(porte.id).includes(filtro)
      );
    });

  if (!ativosFiltrados.length) {
    console.warn(
      "âš ï¸ Auditoria: Nenhuma linha de porte encontrada para analisar."
    );
    if (statusAuditoria) statusAuditoria.classList.add("hidden");
    return mostrarAlerta(
      "Aviso",
      "NÃ£o hÃ¡ portes ativos na tabela para auditar.",
      "warning"
    );
  }

  let detectados = 0;
  let processados = 0;

  // Mapeia as linhas da pagina atual para marcar infratores visiveis
  const corpoTabela =
    document.getElementById("lista-ativos-para-revogar") ||
    document.getElementById("corpo-revogacao");
  const linhas = corpoTabela ? corpoTabela.querySelectorAll("tr") : [];
  const linhasPorId = new Map();
  linhas.forEach((linha) => {
    const idLinha = linha.cells[1]?.innerText.trim();
    if (idLinha && !isNaN(idLinha)) linhasPorId.set(String(idLinha), linha);
  });

  for (const porte of ativosFiltrados) {
    const idCidadao = String(porte.id).trim();
    if (!idCidadao || isNaN(idCidadao)) continue;

    processados++;
    if (textoAuditoria)
      textoAuditoria.innerText = `Auditando ID: ${idCidadao} (${processados}/${ativosFiltrados.length})...`;

    console.log(`â³ Verificando ficha do ID: ${idCidadao}...`);

    try {
      const res = await fetch("/api/consultar-ficha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idCidadao: idCidadao }),
      });

      const data = await res.json();

      // REGRA: Registros criminais encontrados apÃ³s a Ãºltima limpeza (ou apÃ³s 10/12)
      if (data.registrosEncontrados > 0) {
        console.log(
          `ðŸš¨ INFRAÃ‡ÃƒO: ID ${idCidadao} possui ${data.registrosEncontrados} crimes.`
        );
        const linha = linhasPorId.get(String(idCidadao));
        if (linha) marcarLinhaComoInfrator(linha, data);
        detectados++;
      }
    } catch (e) {
      console.error(`âŒ Erro ao consultar ID ${idCidadao}:`, e);
    }
  }

  if (statusAuditoria) statusAuditoria.classList.add("hidden");

  if (detectados > 0) {
    mostrarAlerta(
      "Auditoria ConcluÃ­da",
      `${detectados} infratores identificados com crimes cometidos apÃ³s a emissÃ£o/limpeza!`,
      "error"
    );
  } else {
    mostrarAlerta(
      "Auditoria ConcluÃ­da",
      `Nenhuma irregularidade encontrada nos ${processados} registros analisados.`,
      "success"
    );
  }
};

function marcarLinhaComoInfrator(linha, data) {
  // Estilo visual de perigo
  linha.style.background = "rgba(255, 0, 0, 0.2)";
  linha.style.borderLeft = "5px solid #ff4d4d";

  // Atualiza a coluna de Status/Alerta (Coluna 4 no seu index.html)
  // Coluna 0: Nome, 1: ID, 2: Arma, 3: Status/Alerta, 4: AÃ§Ã£o
  const celulaAlerta = linha.cells[3];
  if (celulaAlerta) {
    celulaAlerta.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
         <span style="background:#ff4d4d; color:white; font-size:10px; padding:2px 6px; border-radius:3px; font-weight:bold;">âš ï¸ FICHA SUJA</span>
         <small style="font-size:9px; color: #ff9999;">${data.registrosEncontrados} novos registros</small>
      </div>
    `;
  }

  // Move o infrator para o topo da tabela
  linha.parentNode.prepend(linha);
}
// ==========================================
// ðŸ› ï¸ SISTEMA DE RECOMPRA (COMPLETO)
// ==========================================

// 1. Tabela de PreÃ§os
const PRECOS_RECOMPRA = {
  MUNICAO: 150000,
  ARMAS: {
    GLOCK: 1200000,
    MP5: 1600000,
    TASER: 1400000,
  },
};

// VariÃ¡vel global para armazenar qual porte estÃ¡ sendo editado
let porteSelecionadoParaRecompra = null;

// 2. FunÃ§Ã£o de Busca
async function buscarPortesParaRecompra() {
  const idInput = document.getElementById("busca-recompra-id").value.trim();
  if (!idInput) return mostrarAlerta("Erro", "Digite um ID.", "error");

  const container = document.getElementById("lista-portes-recompra");
  const formDetalhes = document.getElementById("form-recompra-detalhes");

  // Loading visual
  container.innerHTML =
    '<div style="grid-column: 1/-1; text-align: center; padding: 40px;"><i class="fa-solid fa-circle-notch fa-spin fa-2x" style="color: var(--gold-accent);"></i><p style="margin-top: 15px; color: #ccc;">Consultando base de dados...</p></div>';
  container.classList.remove("hidden");
  formDetalhes.classList.add("hidden");

  try {
    const res = await fetch("/api/consultar-portes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idCidadao: idInput }),
    });

    const portes = await res.json();

    if (!portes || portes.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: rgba(255,0,0,0.05); border-radius: 8px; border: 1px dashed rgba(255,0,0,0.2);">
            <i class="fa-solid fa-folder-open fa-3x" style="color: #555; margin-bottom: 15px;"></i>
            <p style="color:#ccc; font-size: 1.1rem;">Nenhum porte ativo encontrado para o ID <strong>${idInput}</strong>.</p>
        </div>`;
      return;
    }

    container.innerHTML = "";

    // Gera os cards
    portes.forEach((porte) => {
      const card = document.createElement("div");
      card.className = "card-porte-item";

      let icone = '<i class="fa-solid fa-gun"></i>';
      if (porte.arma.toUpperCase().includes("TASER"))
        icone = '<i class="fa-solid fa-bolt"></i>';

      card.innerHTML = `
        <div class="card-porte-header">
            <h4 class="card-porte-title">${icone} ${porte.arma}</h4>
            <span class="badge-ativo"><i class="fa-solid fa-check-circle"></i> Ativo</span>
        </div>
        <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
             <small style="display:block; color:#aaa;"><i class="fa-regular fa-calendar"></i> Validade: <span style="color: #eee;">${porte.validade}</span></small>
             <small style="display:block; color: var(--gold-accent); margin-top:8px; text-align: right; font-weight: bold;">Clique para selecionar <i class="fa-solid fa-arrow-right"></i></small>
        </div>
      `;

      card.onclick = () => selecionarPorteRecompra(porte, card);
      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML =
      '<p style="color:red; grid-column: 1/-1; text-align:center;">Erro de conexÃ£o com a API.</p>';
  }
}

// 3. FunÃ§Ã£o de SeleÃ§Ã£o
function selecionarPorteRecompra(porte, elementoCard) {
  // Remove seleÃ§Ã£o visual anterior
  document
    .querySelectorAll(".card-porte-item")
    .forEach((c) => c.classList.remove("selected"));
  elementoCard.classList.add("selected");

  porteSelecionadoParaRecompra = porte;

  const nomeArma = porte.arma.toUpperCase();
  const isTaser = nomeArma.includes("TASER");

  // LÃ³gica visual do Taser (Esconde opÃ§Ã£o de muniÃ§Ã£o)
  const divMunicaoLabel = document.getElementById("lbl-municao");
  if (isTaser) {
    divMunicaoLabel.style.display = "none";
    document.getElementById("chk-municao").checked = false;
  } else {
    divMunicaoLabel.style.display = "flex";
  }

  // Define PreÃ§o Base
  let precoArma = 0;
  if (nomeArma.includes("GLOCK")) precoArma = PRECOS_RECOMPRA.ARMAS.GLOCK;
  else if (nomeArma.includes("MP5")) precoArma = PRECOS_RECOMPRA.ARMAS.MP5;
  else if (nomeArma.includes("TASER")) precoArma = PRECOS_RECOMPRA.ARMAS.TASER;

  // Salva no objeto para usar no cÃ¡lculo
  porteSelecionadoParaRecompra.precoBaseArma = precoArma;

  // Atualiza HTML
  const form = document.getElementById("form-recompra-detalhes");
  document.getElementById("recompra-arma-display").innerText = porte.arma;
  document.getElementById(
    "recompra-preco-base"
  ).innerText = `Custo Base da Arma: R$ ${precoArma.toLocaleString("pt-BR")}`;

  // Reseta checkboxes
  document.getElementById("chk-arma").checked = false;
  document.getElementById("chk-municao").checked = false;

  // CHAMA A FUNÃ‡ÃƒO QUE ESTAVA FALTANDO
  calcularTotalRecompra();

  // Mostra o formulÃ¡rio
  form.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

// 4. FunÃ§Ã£o de CÃ¡lculo (A QUE ESTAVA FALTANDO)
function calcularTotalRecompra() {
  if (!porteSelecionadoParaRecompra) return;

  const querMunicao = document.getElementById("chk-municao").checked;
  const querArma = document.getElementById("chk-arma").checked;

  let total = 0;

  // Soma MuniÃ§Ã£o
  if (querMunicao) {
    total += PRECOS_RECOMPRA.MUNICAO;
  }

  // Soma Arma
  if (querArma) {
    // Usa o preÃ§o que salvamos na funÃ§Ã£o de seleÃ§Ã£o
    total += porteSelecionadoParaRecompra.precoBaseArma || 0;
  }

  // Atualiza o texto na tela
  document.getElementById(
    "recompra-valor-total"
  ).innerText = `R$ ${total.toLocaleString("pt-BR")}`;
}

// 5. FunÃ§Ã£o de EmissÃ£o
// ==========================================
// 5. FunÃ§Ã£o de EmissÃ£o (Embed Padronizado)
// ==========================================
// ==========================================
// 5. FunÃ§Ã£o de EmissÃ£o (Embed com MenÃ§Ã£o Correta)
// ==========================================
async function emitirRecompra() {
  if (!porteSelecionadoParaRecompra) return;

  const chkMunicao = document.getElementById("chk-municao").checked;
  const chkArma = document.getElementById("chk-arma").checked;
  const idCidadao = document.getElementById("busca-recompra-id").value;

  if (!chkMunicao && !chkArma) {
    return mostrarAlerta(
      "AtenÃ§Ã£o",
      "Selecione o que serÃ¡ comprado (MuniÃ§Ã£o ou Arma).",
      "warning"
    );
  }

  // --- CORREÃ‡ÃƒO DA IDENTIFICAÃ‡ÃƒO DO OFICIAL ---
  const sessionData = JSON.parse(localStorage.getItem("pc_session") || "{}");

  // 1. Tenta pegar o ID (Para mencionar no Discord)
  // Verifica se o ID estÃ¡ na raiz ou dentro de um objeto 'user'
  const idOficial = sessionData.id || (sessionData.user && sessionData.user.id);

  // 2. Tenta pegar o Nome (Para escrever na imagem)
  const nomeVisual =
    sessionData.global_name ||
    sessionData.username ||
    (sessionData.user && sessionData.user.username) ||
    "Oficial";

  // 3. Cria a string de menÃ§Ã£o: Se tiver ID, usa <@ID>, senÃ£o usa o nome texto
  const mencaoOficial = idOficial ? `<@${idOficial}>` : `\`${nomeVisual}\``;
  // ---------------------------------------------

  // Recalcula total internamente
  let total = 0;
  if (chkMunicao) total += PRECOS_RECOMPRA.MUNICAO;
  if (chkArma) total += porteSelecionadoParaRecompra.precoBaseArma;

  // Monta texto dos itens
  let itens = [];
  if (chkArma) itens.push(`Armamento (${porteSelecionadoParaRecompra.arma})`);
  if (chkMunicao) itens.push("Recarga de MuniÃ§Ã£o");
  const resumoItens = itens.join("\n+ ");

  // Ativa loading
  if (typeof mostrarCarregando === "function") mostrarCarregando(true);

  // --- GERAR CANVAS (O Recibo Visual) ---
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 1080;
  canvas.height = 1080;

  // Fundo Preto
  ctx.fillStyle = "#121212";
  ctx.fillRect(0, 0, 1080, 1080);

  // Faixa Topo Dourada
  ctx.fillStyle = "#D4AF37";
  ctx.fillRect(0, 0, 1080, 180);

  // TÃ­tulo Recibo
  ctx.fillStyle = "#000";
  ctx.font = "bold 70px Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("RECIBO DE RECOMPRA", 540, 115);

  // ConteÃºdo do Recibo
  ctx.fillStyle = "#FFF";
  ctx.textAlign = "left";
  ctx.font = "45px Roboto, sans-serif";

  let y = 350;
  ctx.fillStyle = "#D4AF37";
  ctx.fillText("Oficial:", 100, y);
  // Na imagem escrevemos o NOME VISUAL (Texto), pois imagem nÃ£o aceita menÃ§Ã£o
  ctx.fillStyle = "#FFF";
  ctx.fillText(nomeVisual, 400, y);

  y += 100;
  ctx.fillStyle = "#D4AF37";
  ctx.fillText("CidadÃ£o:", 100, y);
  ctx.fillStyle = "#FFF";
  ctx.fillText(idCidadao, 400, y);

  y += 100;
  ctx.fillStyle = "#D4AF37";
  ctx.fillText("Porte Base:", 100, y);
  ctx.fillStyle = "#FFF";
  ctx.fillText(porteSelecionadoParaRecompra.arma, 400, y);

  y += 100;
  ctx.fillStyle = "#D4AF37";
  ctx.fillText("Itens:", 100, y);
  ctx.fillStyle = "#FFF";
  ctx.fillText(resumoItens.replace("\n", " "), 400, y, 600);

  // Valor Gigante
  y += 200;
  ctx.textAlign = "center";
  ctx.fillStyle = "#4cd137";
  ctx.font = "bold 100px Roboto, sans-serif";
  ctx.fillText(`R$ ${total.toLocaleString("pt-BR")}`, 540, y);

  // Data RodapÃ©
  ctx.fillStyle = "#666";
  ctx.font = "30px Roboto, sans-serif";
  ctx.fillText(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, 540, 1020);

  // --- ENVIO DISCORD ---
  canvas.toBlob(async (blob) => {
    const formData = new FormData();
    formData.append("file", blob, "recompra.png");

    // PAYLOAD
    const payload = {
      embeds: [
        {
          title: "ðŸ“¦ REGISTRO DE RECOMPRA",
          description: `ReposiÃ§Ã£o de equipamento autorizada para porte ativo.`,
          color: 5034295, // Verde
          author: {
            name: "PolÃ­cia Civil do Estado do Rio de Janeiro",
            icon_url: CONFIG.BRASAO_URL,
          },
          thumbnail: {
            url: CONFIG.BRASAO_URL,
          },
          fields: [
            // AQUI usamos a variÃ¡vel mencaoOficial que contÃ©m o <@ID>
            {
              name: "ðŸ‘® Oficial ResponsÃ¡vel",
              value: mencaoOficial,
              inline: true,
            },
            {
              name: "ðŸ‘¤ CidadÃ£o (ID)",
              value: `\`${idCidadao}\``,
              inline: true,
            },
            { name: "â €", value: "â €", inline: false },
            {
              name: "ðŸ”« Armamento Base",
              value: `**${porteSelecionadoParaRecompra.arma}**`,
              inline: true,
            },
            {
              name: "ðŸ“¦ Itens Adquiridos",
              value: `\`${resumoItens}\``,
              inline: true,
            },
            {
              name: "ðŸ’° Valor Total",
              value: `\`R$ ${total.toLocaleString("pt-BR")}\``,
              inline: false,
            },
          ],
          image: {
            url: "attachment://recompra.png",
          },
          footer: FOOTER_PADRAO,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    formData.append("payload_json", JSON.stringify(payload));

    try {
      const resp = await fetch("/api/enviar?tipo=recompra", {
        method: "POST",
        body: formData,
      });

      if (resp.ok) {
        mostrarAlerta(
          "Sucesso",
          "Recompra registrada e enviada ao Discord!",
          "success"
        );
        // Limpa formulÃ¡rio
        document.getElementById("lista-portes-recompra").innerHTML = "";
        document
          .getElementById("form-recompra-detalhes")
          .classList.add("hidden");
        document.getElementById("busca-recompra-id").value = "";
      } else {
        mostrarAlerta("Erro", "Falha ao enviar para o Discord.", "error");
      }
    } catch (e) {
      console.error(e);
      mostrarAlerta("Erro", "Erro de conexÃ£o.", "error");
    } finally {
      if (typeof mostrarCarregando === "function") mostrarCarregando(false);
    }
  });
}
// ==========================================
// ðŸ”„ FUNÃ‡ÃƒO DE LOADING (GLOBAL)
// ==========================================
window.mostrarCarregando = (ativar) => {
  const overlay = document.getElementById("loading-overlay");

  if (!overlay) {
    console.warn("Elemento de loading nÃ£o encontrado no HTML.");
    return;
  }

  if (ativar) {
    overlay.classList.remove("hidden");
  } else {
    overlay.classList.add("hidden");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const selectInvestigador = document.getElementById("cat-investigador-select");
  const selectAutorizou = document.getElementById("cat-autorizou-select");
  const selectEnvolvidos = document.getElementById("cat-envolvidos-select");
  const listInvestigador = document.getElementById("cat-investigador-list");
  const listAutorizou = document.getElementById("cat-autorizou-list");
  const listEnvolvidos = document.getElementById("cat-envolvidos-list");
  const btnAddInvestigador = document.getElementById("cat-investigador-add");
  const btnAddAutorizou = document.getElementById("cat-autorizou-add");
  const btnAddEnvolvido = document.getElementById("cat-envolvidos-add");
  const searchInvestigador = document.getElementById("cat-investigador-search");
  const searchAutorizou = document.getElementById("cat-autorizou-search");
  const searchEnvolvidos = document.getElementById("cat-envolvidos-search");

  [selectInvestigador, selectAutorizou, selectEnvolvidos].forEach((select) => {
    if (!select) return;
    select.addEventListener("focus", prepararSelectsCAT);
    select.addEventListener("click", prepararSelectsCAT);
  });

  prepararSelectsCAT();

  if (btnAddInvestigador) {
    btnAddInvestigador.addEventListener("click", () =>
      adicionarNaLista("cat-investigador-select", "cat-investigador-list")
    );
  }

  if (btnAddAutorizou) {
    btnAddAutorizou.addEventListener("click", () =>
      adicionarNaLista("cat-autorizou-select", "cat-autorizou-list")
    );
  }

  if (btnAddEnvolvido) {
    btnAddEnvolvido.addEventListener("click", () =>
      adicionarNaLista("cat-envolvidos-select", "cat-envolvidos-list")
    );
  }

  [selectInvestigador, selectAutorizou, selectEnvolvidos].forEach((select) => {
    if (!select) return;
    select.addEventListener("dblclick", () => {
      if (select === selectInvestigador) {
        adicionarNaLista("cat-investigador-select", "cat-investigador-list");
      } else if (select === selectAutorizou) {
        adicionarNaLista("cat-autorizou-select", "cat-autorizou-list");
      } else {
        adicionarNaLista("cat-envolvidos-select", "cat-envolvidos-list");
      }
    });
  });

  if (listInvestigador) listInvestigador.innerHTML = "";
  if (listAutorizou) listAutorizou.innerHTML = "";
  if (listEnvolvidos) listEnvolvidos.innerHTML = "";

  const vincularPesquisa = (input, selectId) => {
    if (!input) return;
    input.addEventListener("input", async () => {
      if (!catMembersCache) {
        await prepararSelectsCAT();
      }
      filtrarSelectPorTexto(selectId, input.value);
    });

    input.addEventListener("blur", async () => {
      if (!input.value.trim()) {
        if (!catMembersCache) {
          await prepararSelectsCAT();
        }
        filtrarSelectPorTexto(selectId, "");
      }
    });
  };

  vincularPesquisa(searchInvestigador, "cat-investigador-select");
  vincularPesquisa(searchAutorizou, "cat-autorizou-select");
  vincularPesquisa(searchEnvolvidos, "cat-envolvidos-select");

  configurarCatAnexo({
    key: "transferencia",
    dropId: "cat-anexo-transferencia-drop",
    inputId: "cat-anexo-transferencia",
    previewId: "cat-anexo-transferencia-preview",
    buttonId: "cat-anexo-transferencia-btn",
    multiple: false,
    emptyLabel: "Nenhuma imagem selecionada",
  });

  configurarCatAnexo({
    key: "olx",
    dropId: "cat-anexo-olx-drop",
    inputId: "cat-anexo-olx",
    previewId: "cat-anexo-olx-preview",
    buttonId: "cat-anexo-olx-btn",
    multiple: false,
    emptyLabel: "Nenhuma imagem selecionada",
  });

  configurarCatAnexo({
    key: "whatsapp",
    dropId: "cat-anexo-whatsapp-drop",
    inputId: "cat-anexo-whatsapp",
    previewId: "cat-anexo-whatsapp-preview",
    buttonId: "cat-anexo-whatsapp-btn",
    multiple: true,
    emptyLabel: "Nenhuma imagem selecionada",
  });
});
