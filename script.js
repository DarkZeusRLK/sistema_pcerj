// ==========================================
// ⚙️ CONFIGURAÇÕES E DADOS GLOBAIS
// ==========================================
const CONFIG = {
  CLIENT_ID: "1451342682487259319",
  ORG_CONFIGS: {
    PCERJ: {
      key: "PCERJ",
      name: "Polícia Civil",
      fullName: "Polícia Civil do Estado do Rio de Janeiro",
      logoPath:
        "assets/Brasão_da_Polícia_Civil_do_Estado_do_Rio_de_Janeiro.png",
      brasaoUrl: "https://www.policiacivil.rj.gov.br/simbolo2.png",
      themeClass: "theme-pcerj",
    },
    PF: {
      key: "PF",
      name: "Polícia Federal",
      fullName: "Polícia Federal",
      logoPath: "assets/brasao_pf.png",
      brasaoUrl:
        "https://www.gov.br/pf/pt-br/principios-fundamentais/simbolos-da-policia-federal-2/emblema.png/@@images/image",
      themeClass: "theme-pf",
    },
  },
};

const SESSION_STORAGE_KEY = "pc_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_REVALIDATION_MS = 5 * 60 * 1000;

let CURRENT_ORG_KEY = "PCERJ";
let CURRENT_ORG = CONFIG.ORG_CONFIGS.PCERJ;
let CURRENT_BRASAO_URL = CONFIG.ORG_CONFIGS.PCERJ.brasaoUrl;
let sessionValidationInterval = null;
let USER_IS_ADMIN = false;
let logsPaginationState = {
  page: 1,
  totalPages: 1,
  totalItems: 0,
};

let FOOTER_PADRAO = {
  text: "Sistema Policial",
  icon_url: CURRENT_BRASAO_URL,
};

function lerSessao() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const sessao = JSON.parse(raw);
    return sessao && typeof sessao === "object" ? sessao : null;
  } catch (error) {
    console.warn("Nao foi possivel ler a sessao salva:", error);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function salvarSessao(data, baseAtual = null) {
  const agora = Date.now();
  const criadoEm = baseAtual?.createdAt || data?.createdAt || new Date(agora).toISOString();
  const expiraEm =
    baseAtual?.expiresAt ||
    data?.expiresAt ||
    new Date(new Date(criadoEm).getTime() + SESSION_DURATION_MS).toISOString();

  const sessaoNormalizada = {
    ...(baseAtual || {}),
    ...(data || {}),
    createdAt: criadoEm,
    expiresAt: expiraEm,
    lastValidatedAt:
      data?.lastValidatedAt || data?.checkedAt || new Date(agora).toISOString(),
  };

  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessaoNormalizada));
  return sessaoNormalizada;
}

function sessaoExpirada(sessao) {
  if (!sessao?.expiresAt) return true;
  const expiresAt = new Date(sessao.expiresAt).getTime();
  return Number.isNaN(expiresAt) || Date.now() >= expiresAt;
}

function redirecionarParaLogin(motivo = "") {
  const destino = motivo ? `login.html?error=${encodeURIComponent(motivo)}` : "login.html";
  if (!window.location.pathname.includes("login.html")) {
    window.location.href = destino;
    return;
  }
  if (motivo) {
    const url = new URL(window.location.href);
    url.searchParams.set("error", motivo);
    window.history.replaceState({}, document.title, url.toString());
  }
}

function encerrarSessao(motivo = "session_invalid") {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  if (sessionValidationInterval) {
    clearInterval(sessionValidationInterval);
    sessionValidationInterval = null;
  }
  redirecionarParaLogin(motivo);
}

async function revalidarSessaoAtual({ force = false } = {}) {
  const sessao = lerSessao();
  if (!sessao) return false;

  if (sessaoExpirada(sessao)) {
    encerrarSessao("session_expired");
    return false;
  }

  const lastValidatedAt = new Date(sessao.lastValidatedAt || 0).getTime();
  const precisaRevalidar =
    force ||
    Number.isNaN(lastValidatedAt) ||
    Date.now() - lastValidatedAt >= SESSION_REVALIDATION_MS;

  if (!precisaRevalidar) return true;

  try {
    const res = await fetch("/api/auth", {
      headers: {
        "X-Session-User-Id": sessao.id || "",
      },
    });

    const data = await res.json();

    if (res.ok && data.authorized) {
      salvarSessao(
        {
          ...data,
          token: sessao.token,
          lastValidatedAt: new Date().toISOString(),
        },
        sessao
      );
      return true;
    }

    if (res.status === 401 || res.status === 403) {
      console.warn("Sessao revogada:", data?.error || "Sem detalhes");
      encerrarSessao("access_revoked");
      return false;
    }

    console.warn("Falha ao revalidar sessao:", data?.error || res.statusText);
    return true;
  } catch (error) {
    console.warn("Nao foi possivel revalidar a sessao agora:", error);
    return true;
  }
}

function iniciarMonitoramentoSessao() {
  if (window.location.pathname.includes("login.html")) return;

  if (sessionValidationInterval) clearInterval(sessionValidationInterval);

  sessionValidationInterval = setInterval(() => {
    revalidarSessaoAtual();
  }, SESSION_REVALIDATION_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") revalidarSessaoAtual({ force: true });
  });

  window.addEventListener("focus", () => {
    revalidarSessaoAtual({ force: true });
  });
}

function exibirFeedbackLogin() {
  const feedback = document.getElementById("login-feedback");
  if (!feedback) return;

  const error = new URLSearchParams(window.location.search).get("error");
  const mensagens = {
    missing_token: "Falha ao receber o login do Discord. Tente novamente.",
    unauthorized:
      "Seu usuario nao possui permissao para acessar este sistema.",
    auth_failed: "Nao foi possivel autenticar no momento. Tente novamente.",
    access_revoked:
      "Seu acesso foi revogado porque voce saiu do servidor ou perdeu o cargo permitido.",
    session_expired:
      "Sua sessao expirou apos 7 dias. Faca login novamente.",
    session_invalid: "Sua sessao ficou invalida. Faca login novamente.",
  };

  if (!error || !mensagens[error]) {
    feedback.classList.add("hidden");
    feedback.textContent = "";
    return;
  }

  feedback.textContent = mensagens[error];
  feedback.classList.remove("hidden");

  const url = new URL(window.location.href);
  url.searchParams.delete("error");
  window.history.replaceState({}, document.title, url.toString());
}

function resolverUrlAbsoluta(path) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const base = window.location.origin || "";
  return `${base}/${path.replace(/^\//, "")}`;
}

function definirOrgao(orgKey) {
  const key = orgKey === "PF" ? "PF" : "PCERJ";
  const org = CONFIG.ORG_CONFIGS[key] || CONFIG.ORG_CONFIGS.PCERJ;

  CURRENT_ORG_KEY = key;
  CURRENT_ORG = org;
  CURRENT_BRASAO_URL = org.brasaoUrl || resolverUrlAbsoluta(org.logoPath || "");
  FOOTER_PADRAO = {
    text: "Sistema Policial",
    icon_url: CURRENT_BRASAO_URL,
  };

  const body = document.body;
  if (body) {
    body.classList.remove("theme-pcerj", "theme-pf");
    if (org.themeClass) body.classList.add(org.themeClass);
  }

  const logo = document.getElementById("org-logo");
  if (logo) {
    logo.src = org.logoPath;
    logo.alt = `Logo ${org.name}`;
  }

  const title = document.getElementById("org-title");
  if (title) title.textContent = org.name;

  const favicon = document.getElementById("org-favicon");
  if (favicon) favicon.setAttribute("href", org.logoPath);

  if (document?.title) {
    document.title = `Sistema de Emissão - ${org.name}`;
  }
}

const TELAS_PERMITIDAS_PF = new Set(["dashboard", "limpeza", "cat"]);
const MENUS_PF_RESTRITOS = [
  "menu-emissao",
  "menu-renovacao",
  "menu-revogacao",
  "menu-recompra",
  "menu-relatorios",
  "menu-logs",
  "menu-admin",
];
const SECOES_PF_RESTRITAS = [
  "sec-emissao",
  "sec-renovacao",
  "sec-revogacao",
  "sec-recompra",
  "sec-relatorios",
  "sec-logs",
];

function aplicarRestricoesPorOrgao() {
  const isPF = CURRENT_ORG_KEY === "PF";
  MENUS_PF_RESTRITOS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isPF) el.classList.add("hidden");
    else if (id !== "menu-logs") el.classList.remove("hidden");
  });

  SECOES_PF_RESTRITAS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isPF) el.classList.add("hidden");
  });

  if (isPF) {
    const ativo = document.querySelector(".screen:not(.hidden)");
    if (ativo && !TELAS_PERMITIDAS_PF.has(ativo.id.replace("sec-", ""))) {
      window.navegar("dashboard");
    }
  }
}

function podeAcessarTela(tela) {
  if (CURRENT_ORG_KEY === "PF") return TELAS_PERMITIDAS_PF.has(tela);
  if ((tela === "relatorios" || tela === "logs") && !USER_IS_ADMIN) {
    return false;
  }
  return true;
}

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

// TABELA DE PREÇOS
const PRECOS = {
  GLOCK: { arma: 1200000, laudo: 600000, municao: 150000 },
  MP5: { arma: 1600000, laudo: 600000, municao: 150000 },
  TASER: { arma: 3600000, laudo: 1400000, municao: 0 },
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
let alertasPortesPendentesRevogacao = new Map();

function normalizarIdNumerico(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function obterIdsRevogadosSet() {
  const ids = new Set();
  dbRevogados.forEach((item) => {
    const id = normalizarIdNumerico(item?.id);
    if (id) ids.add(id);
  });
  return ids;
}

// ==========================================
// 🕒 SISTEMA DE GATILHOS TEMPORAIS
// ==========================================

/**
 * Calcula o tempo restante até a próxima meia-noite e agenda a auditoria.
 */
function agendarAuditoriaMeiaNoite() {
  const agora = new Date();
  const proximaMeiaNoite = new Date();

  // Define para o próximo dia às 00:00:00
  proximaMeiaNoite.setHours(24, 0, 0, 0);

  const tempoAteMeiaNoite = proximaMeiaNoite.getTime() - agora.getTime();

  console.log(
    `🕒 Auditoria Automática: Agendada para as 00:00 (em ${Math.floor(
      tempoAteMeiaNoite / 1000 / 60,
    )} min).`,
  );

  setTimeout(() => {
    console.log("🚀 Gatilho 00:00: Iniciando varredura de conformidade...");
    if (typeof window.verificarConformidadePortes === "function") {
      window.verificarConformidadePortes();
    }
    // Re-agenda para o dia seguinte
    agendarAuditoriaMeiaNoite();
  }, tempoAteMeiaNoite);
}

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
  const sessao = lerSessao();
  definirOrgao("PCERJ");
  if (isLoginPage) exibirFeedbackLogin();

  // 1. Retorno do Discord (Callback)
  if (hash.includes("access_token")) {
    const fragment = new URLSearchParams(hash.slice(1));
    const accessToken = fragment.get("access_token");
    const tokenType = fragment.get("token_type") || "Bearer";
    window.history.replaceState({}, document.title, window.location.pathname);
    if (!accessToken) {
      window.location.href = "login.html?error=missing_token";
      return;
    }
    await validarLoginNaAPI(`${tokenType} ${accessToken}`);
    return;
  }

  // 2. Verificação de Sessão
  if (sessao) {
    const sessaoValida = await revalidarSessaoAtual({ force: true });
    if (!sessaoValida) return;

    const user = lerSessao();
    if (!user) {
      encerrarSessao("session_invalid");
      return;
    }

    if (isLoginPage) {
      window.location.href = "index.html";
    } else {
      document.body.style.display = "block";
      try {
        definirOrgao(user.org);
        aplicarRestricoesPorOrgao();
        iniciarSistema(user);
        await verificarPermissoesAdmin();

        await Promise.all([
          carregarPortesDoDiscord(),
          carregarRevogacoesDoDiscord(),
        ]);

        agendarAuditoriaMeiaNoite();
        iniciarMonitoramentoSessao();
      } catch (err) {
        console.error("Sessao invalida:", err);
        encerrarSessao("session_invalid");
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
  if (!dataStr) return null;
  const match = String(dataStr).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const dia = Number(match[1]);
  const mes = Number(match[2]) - 1;
  const ano = Number(match[3]);
  const data = new Date(ano, mes, dia);
  if (Number.isNaN(data.getTime())) return null;
  return data;
}

function calcularDiasCorridos(dataExpedicaoStr, dataValidadeStr) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  let expedicao = parseData(dataExpedicaoStr);
  if (!expedicao && dataValidadeStr) {
    const validade = parseData(dataValidadeStr);
    if (validade) {
      expedicao = new Date(validade);
      expedicao.setDate(expedicao.getDate() - 30);
    }
  }
  if (!expedicao) return null;

  expedicao.setHours(0, 0, 0, 0);

  const diffTime = Math.abs(hoje - expedicao);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// ==========================================
// 💲 CÁLCULO DE VALORES (EMISSÃO MULTI-ARMA)
// ==========================================
window.atualizarValoresPorte = function () {
  const checkboxes = document.querySelectorAll('#armamentos-grid input[type="checkbox"]');
  const checkMunicao = document.getElementById("check-municao");
  const checkDesconto = document.getElementById("check-desconto");
  const checkDescontoMec = document.getElementById("check-desconto-mec");
  const painel = document.getElementById("painel-valores");

  if (!checkboxes.length || !painel) return;

  const armasSelecionadas = [];
  checkboxes.forEach((cb) => {
    if (cb.checked) armasSelecionadas.push(cb.value);
  });

  if (armasSelecionadas.length === 0) {
    painel.classList.add("hidden");
    return;
  }

  painel.classList.remove("hidden");

  // Desabilita munição se TODAS forem Taser, habilita caso contrário
  const todasTaser = armasSelecionadas.every((a) => a === "TASER");
  if (todasTaser) {
    checkMunicao.checked = false;
    checkMunicao.disabled = true;
  } else {
    checkMunicao.disabled = false;
  }

  const fmt = (v) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // MOnta linhas de itens individuais
  let htmlItens = "";
  let somatorioGeral = 0;
  let somatorioDescontoPolicial = 0;
  let somatorioDescontoMecanico = 0;
  let percentualPolicial = 0;
  const temAlgumPolicial = checkDesconto && checkDesconto.checked;
  const temMecanico = checkDescontoMec && checkDescontoMec.checked;

  armasSelecionadas.forEach((arma, idx) => {
    const regras = PRECOS[arma];
    if (!regras) return;

    const valorArma = regras.arma;
    const valorLaudo = regras.laudo;
    const podeMunicao = arma !== "TASER";
    const incluiMunicao = podeMunicao && checkMunicao.checked;
    const valorMunicao = incluiMunicao ? regras.municao : 0;

    let subtotal = valorArma + valorLaudo + valorMunicao;

    let descPolicial = 0;
    if (temAlgumPolicial) {
      const perc = arma === "TASER" ? 50 : 15;
      descPolicial = subtotal * (perc / 100);
      if (idx === 0) percentualPolicial = perc;
    }

    let descMecanico = 0;
    if (temMecanico) {
      descMecanico = subtotal * 0.2;
    }

    const totalItem = subtotal - descPolicial - descMecanico;
    somatorioGeral += totalItem;
    somatorioDescontoPolicial += descPolicial;
    somatorioDescontoMecanico += descMecanico;

    const nomeArma = { GLOCK: "Glock 9mm", MP5: "MP5", TASER: "Taser" }[arma] || arma;
    htmlItens += `
      <div class="price-row" style="border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px; margin-bottom:6px;">
        <span><strong style="color:var(--gold-accent);">${nomeArma}</strong></span>
        <span style="font-size:0.85rem;">Arma: ${fmt(valorArma)} + Laudo: ${fmt(valorLaudo)}${incluiMunicao ? " + Mun: " + fmt(valorMunicao) : ""} = <strong>${fmt(totalItem)}</strong></span>
      </div>`;
  });

  // Atualiza o painel de itens
  const priceContent = document.getElementById("price-content-dinamico");
  if (priceContent) {
    if (armasSelecionadas.length === 0) {
      priceContent.innerHTML = '<div style="padding: 10px 0; text-align: center; color: var(--text-secondary); font-size:0.9rem;">Selecione um ou mais armamentos acima para ver o resumo.</div>';
    } else {
      priceContent.innerHTML = htmlItens;
    }
  }

  // Linhas de desconto
  const rowDesconto = document.getElementById("row-desconto");
  const elDesconto = document.getElementById("val-desconto");
  const rowDescontoMec = document.getElementById("row-desconto-mec");
  const elDescontoMec = document.getElementById("val-desconto-mec");

  if (somatorioDescontoPolicial > 0) {
    rowDesconto.style.display = "flex";
    elDesconto.innerText = "- " + fmt(somatorioDescontoPolicial);
  } else {
    rowDesconto.style.display = "none";
  }

  if (somatorioDescontoMecanico > 0) {
    rowDescontoMec.style.display = "flex";
    elDescontoMec.innerText = "- " + fmt(somatorioDescontoMecanico);
  } else {
    rowDescontoMec.style.display = "none";
  }

  const totalFinal = somatorioGeral;
  document.getElementById("val-total").innerText = fmt(totalFinal);

  const portePainel = totalFinal * 0.6;
  const porteOficial = totalFinal * 0.4;

  const elPainelPorte = document.getElementById("val-split-painel-porte");
  const elOficialPorte = document.getElementById("val-split-oficial-porte");

  if (elPainelPorte) elPainelPorte.innerText = fmt(portePainel);
  if (elOficialPorte) elOficialPorte.innerText = fmt(porteOficial);

  painel.dataset.total = totalFinal;
  painel.dataset.desconto = somatorioDescontoPolicial + somatorioDescontoMecanico;
  painel.dataset.descontoPolicial = somatorioDescontoPolicial;
  painel.dataset.descontoMecanico = somatorioDescontoMecanico;
  painel.dataset.descontoPercent = percentualPolicial;
  painel.dataset.descontoPolicialPercent = percentualPolicial;
  painel.dataset.descontoMecanicoPercent = 20;
  painel.dataset.municaoIncluded = checkMunicao.checked ? "Sim" : "Não";
  painel.dataset.ehPolicial = somatorioDescontoPolicial > 0 ? "Sim" : "Não";
  painel.dataset.ehMecanico = temMecanico ? "Sim" : "Não";
  painel.dataset.armasSelecionadas = JSON.stringify(armasSelecionadas);
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
// 📨 LÓGICA DE EMISSÃO MULTI-ARMA
// ==========================================
async function processarEmissao() {
  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const telefone = document.getElementById("porte-telefone").value;
  const validade = document.getElementById("porte-validade").value;
  const expedicao = document.getElementById("porte-expedicao").value;

  const painel = document.getElementById("painel-valores");
  const total = painel ? painel.dataset.total || "0" : "0";
  const desconto = painel ? painel.dataset.desconto || "0" : "0";
  const descontoPolicial = painel ? painel.dataset.descontoPolicial || "0" : "0";
  const descontoMecanico = painel ? painel.dataset.descontoMecanico || "0" : "0";
  const descontoPolicialPercent = painel ? painel.dataset.descontoPolicialPercent || "0" : "0";
  const descontoMecanicoPercent = painel ? painel.dataset.descontoMecanicoPercent || "0" : "0";
  const temMunicao = painel ? painel.dataset.municaoIncluded || "Não" : "Não";
  const ehPolicial = painel ? painel.dataset.ehPolicial || "Não" : "Não";
  const ehMecanico = painel ? painel.dataset.ehMecanico || "Não" : "Não";

  const armasSelecionadas = [];
  document.querySelectorAll('#armamentos-grid input[type="checkbox"]:checked').forEach((cb) => {
    armasSelecionadas.push(cb.value);
  });

  const fmt = (v) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (!nome || !id || !telefone) {
    return mostrarAlerta(
      "Erro",
      "Preencha Nome, Passaporte e Telefone.",
      "warning",
    );
  }

  if (armasSelecionadas.length === 0) {
    return mostrarAlerta("Erro", "Selecione pelo menos um armamento.", "warning");
  }

  const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
  const mencaoOficial = sessao.id
    ? `<@${sessao.id}>`
    : `**${sessao.username || "Oficial"}**`;

  mostrarAlerta("Aguarde", "Gerando documentos...", "warning");

  const imgSrcPorArma = { GLOCK: "assets/porte_glock.png", MP5: "assets/porte_mp5.png", TASER: "assets/porte_taser.png" };
  const nomeArmaLabel = { GLOCK: "Glock (9mm)", MP5: "MP5 (Submetralhadora)", TASER: "Taser (Não letal)" };

  let emitidos = 0;

  for (const arma of armasSelecionadas) {
    const regras = PRECOS[arma];
    if (!regras) continue;

    const nomeArquivo = `porte_${id}_${arma.toLowerCase()}.png`;

    // Gera o canvas para esta arma
    const blob = await new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.src = imgSrcPorArma[arma] || "assets/porte_glock.png";

      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        ctx.font = POSICOES.fonte;
        ctx.fillStyle = POSICOES.corTexto;

        ctx.fillText(nome.toUpperCase(), POSICOES.nome.x, POSICOES.nome.y);
        ctx.fillText(id, POSICOES.id.x, POSICOES.id.y);
        ctx.fillText(telefone, POSICOES.rg.x, POSICOES.rg.y);
        ctx.fillText(expedicao, POSICOES.expedicao.x, POSICOES.expedicao.y);
        ctx.fillText(validade, POSICOES.validade.x, POSICOES.validade.y);

        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error("Falha ao gerar blob"));
        }, "image/png");
      };
      img.onerror = () => reject(new Error(`Imagem ${arma} não encontrada`));
    });

    // Texto de valores para o embed
    const valorMunicaoItem = (temMunicao === "Sim" && arma !== "TASER") ? regras.municao : 0;
    let textoValores = `Arma: \`${fmt(regras.arma)}\`\nLaudo: \`${fmt(regras.laudo)}\`\nMunição: \`${valorMunicaoItem > 0 ? fmt(valorMunicaoItem) : "R$ 0,00"}\``;

    if (ehPolicial === "Sim" && parseFloat(descontoPolicial) > 0) {
      textoValores += `\nDesconto Policial: \`-${fmt(parseFloat(descontoPolicial) / armasSelecionadas.length)}\``;
    }
    if (ehMecanico === "Sim" && parseFloat(descontoMecanico) > 0) {
      textoValores += `\nDesconto Mecânico: \`-${fmt(parseFloat(descontoMecanico) / armasSelecionadas.length)}\``;
    }
    textoValores += `\n**TOTAL GERAL (${armasSelecionadas.length} armas): \`${parseInt(total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\`**`;

    const embedData = {
      title: `📄 EMISSÃO DE PORTE: ${nomeArmaLabel[arma] || arma}`,
      description: `Documento oficial registrado.`,
      color: 3447003,
      fields: [
        { name: "👤 Cidadão", value: `**${nome.toUpperCase()}**`, inline: true },
        { name: "🆔 Passaporte", value: `\`${id}\``, inline: true },
        { name: "📞 Telefone", value: `\`${telefone || "N/A"}\``, inline: true },
        { name: "👮 Oficial", value: mencaoOficial, inline: true },
        { name: "🔫 Armamento", value: nomeArmaLabel[arma] || arma, inline: true },
        { name: "📦 Munição", value: temMunicao, inline: true },
        { name: "📅 Expedição", value: `\`${expedicao}\``, inline: true },
        { name: "📅 Validade", value: `\`${validade}\``, inline: true },
        { name: "💰 Valores", value: textoValores, inline: false },
      ],
      image: { url: `attachment://${nomeArquivo}` },
      footer: FOOTER_PADRAO,
    };

    const resultado = await enviarParaAPI(blob, nomeArquivo, "porte", embedData, `✅ **PORTE APROVADO (${nomeArmaLabel[arma] || arma})**\nEmitido por ${mencaoOficial}.`);

    if (resultado) {
      dbPortes.push({
        nome,
        id,
        telefone,
        rg: telefone,
        arma: nomeArmaLabel[arma] || arma,
        validade,
        expedicao,
        imagem_url: resultado?.attachments?.[0]?.url || "",
        message_id: resultado.id,
        oficial: sessao.username,
        oficial_id: sessao.id,
        status: "Ativo",
      });
      emitidos++;
    }
  }

  renderTables();
  atualizarStats();

  if (emitidos > 0) {
    await mostrarAlerta("Sucesso", `${emitidos} porte(s) emitido(s) com sucesso!`, "success");
    window.navegar("dashboard");
    document.getElementById("preview-porte-container").style.display = "none";
    document.getElementById("porte-nome").value = "";
    document.getElementById("porte-id").value = "";
    document.getElementById("porte-telefone").value = "";
    document.getElementById("check-desconto").checked = false;
    document.querySelectorAll('#armamentos-grid input[type="checkbox"]').forEach((cb) => cb.checked = false);
    atualizarValoresPorte();
  } else {
    mostrarAlerta("Erro", "Falha ao emitir portes.", "error");
  }
}
// ==========================================
// 🔍 CONSULTA CRIMINAL INTEGRADA (COM DIVISÃO DE VALORES)
// ==========================================
window.consultarFicha = async function () {
  const id = document.getElementById("limpeza-id").value;

  if (!id) {
    return mostrarAlerta("Erro", "Digite o ID para consultar.", "warning");
  }

  // Feedback visual no botão
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

    // --- PROTEÇÃO DE ERRO ---
    if (dados.error) {
      throw new Error(dados.error);
    }
    // ------------------------

    // Função de formatação local (mantendo seu padrão)
    // style: 'decimal' garante que mostre casas decimais corretamente se necessário
    const fmt = (v) =>
      (v || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    // 1. Preenche o input invisível (usado no envio do relatório)
    const inputValor = document.getElementById("input-valor-limpeza");
    if (inputValor) {
      // Aqui usamos o fmt para ficar bonito no input readonly também, ou raw value se preferir
      inputValor.value = `R$ ${fmt(dados.totalGeral)}`;
    }

    // 2. ATUALIZA O RECIBO VISUAL (EXTRATO)
    document.getElementById("resumo-taxa-base").innerText = `R$ ${fmt(
      dados.taxaBase,
    )}`;
    document.getElementById("resumo-multas").innerText = `R$ ${fmt(
      dados.somaMultas,
    )}`;
    document.getElementById("resumo-inafiancaveis").innerText = `R$ ${fmt(
      dados.custoInafiancaveis,
    )}`;

    // Total Geral Grande
    const totalGeral = dados.totalGeral || 0;
    document.getElementById("total-geral-exibicao").innerText = `R$ ${fmt(
      totalGeral,
    )}`;

    // ============================================================
    // 2.1. CÁLCULO E EXIBIÇÃO DA DIVISÃO (60% / 40%)
    // ============================================================
    const valPainel = totalGeral * 0.6;
    const valOficial = totalGeral * 0.4;

    const elPainel = document.getElementById("txt-painel-limpeza-auto");
    const elOficial = document.getElementById("txt-oficial-limpeza-auto");

    if (elPainel) elPainel.innerText = `R$ ${fmt(valPainel)}`;
    if (elOficial) elOficial.innerText = `R$ ${fmt(valOficial)}`;
    // ============================================================

    // 3. Alerta de sucesso com resumo rápido
    mostrarAlerta(
      "Histórico Recuperado",
      `O cidadão possui ${dados.totalLimpezasAnteriores} limpezas prévias e ${dados.totalInafiancaveis} crimes graves no histórico atual.`,
      "success",
    );
  } catch (erro) {
    console.error(erro);
    mostrarAlerta(
      "Erro de Conexão",
      "Não foi possível recuperar os dados. Verifique o ID ou tente novamente.",
      "error",
    );
  } finally {
    // Restaura o botão
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};
// ==========================================
// 🧼 LÓGICA DE LIMPEZA
// ==========================================
window.processarLimpeza = async function () {
  const nome = (document.getElementById("limpeza-nome")?.value || "").trim();
  const id = (document.getElementById("limpeza-id")?.value || "").trim();
  const telefone = (
    document.getElementById("limpeza-telefone")?.value || ""
  ).trim();
  const valor = (
    document.getElementById("input-valor-limpeza")?.value || "0"
  ).trim();

  if (!nome || !id || !telefone) {
    return mostrarAlerta(
      "Dados Incompletos",
      "Preencha NOME, PASSAPORTE e TELEFONE.",
      "warning",
    );
  }

  const confirmou = await confirmarAcao(
    "Limpar Ficha?",
    `Confirmar limpeza para ${nome} (R$ ${valor})?`,
  );
  if (!confirmou) return;

  mostrarAlerta("Processando", "Gerando comprovante...", "warning");

  try {
    const blobLimpeza = await gerarBlobLimpeza(nome, id, telefone);
    const nomeArquivo = `limpeza_${id}.png`;

    const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
    const mencaoOficial = sessao.id
      ? `<@${sessao.id}>`
      : `**${sessao.username || "Oficial"}**`;

    const mensagemExterna = ` **LIMPEZA DE FICHA REALIZADA**\nProcedimento realizado por ${mencaoOficial}.`;

    const embedLimpeza = {
      title: `📜 CERTIFICADO DE BONS ANTECEDENTES`, // Adicionado ícone para facilitar busca
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
          name: "📞 Telefone",
          value: `\`${telefone || "N/A"}\``,
          inline: true,
        },
        { name: "👮 Oficial", value: mencaoOficial, inline: true }, // 👈 OBRIGATÓRIO PARA O RELATÓRIO
        {
          name: "📅 Data",
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
      mensagemExterna,
    );

    if (sucesso) {
      mostrarAlerta("Sucesso", "Procedimento realizado!", "success");
      document.getElementById("limpeza-nome").value = "";
      document.getElementById("limpeza-id").value = "";
      const telefoneInput = document.getElementById("limpeza-telefone");
      if (telefoneInput) telefoneInput.value = "";
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
let catMembersSorted = null;

async function carregarMembrosDiscord() {
  if (catMembersCache) return catMembersCache;
  if (catMembersLoading) return [];
  catMembersLoading = true;
  try {
    const response = await fetch("/api/listar-membros");
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    catMembersCache = data || [];
    return catMembersCache;
  } finally {
    catMembersLoading = false;
  }
}

function obterMembrosOrdenados() {
  if (catMembersSorted) return catMembersSorted;
  if (!catMembersCache || catMembersCache.length === 0) return [];
  catMembersSorted = catMembersCache
    .slice()
    .sort((a, b) => formatMemberLabel(a).localeCompare(formatMemberLabel(b)));
  return catMembersSorted;
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
    const arquivos = multiple ? catAnexos[key] || [] : catAnexos[key] || null;
    renderCatAnexoPreview(
      preview,
      arquivos,
      emptyLabel || "Nenhuma imagem selecionada",
      multiple,
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
            "warning",
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
        item.type.startsWith("image/"),
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
              "warning",
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
    const placeholders = [
      "cat-investigador-input",
      "cat-autorizou-input",
      "cat-envolvidos-input",
    ];
    placeholders.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.placeholder = "Carregando membros...";
    });
  }
  const members = await carregarMembrosDiscord();
  if (!members || members.length === 0) return;
  catMembersSorted = null;
  obterMembrosOrdenados();
  configurarAutocomplete("cat-investigador-input", "cat-investigador-list", "cat-investigador-autocomplete");
  configurarAutocomplete("cat-autorizou-input", "cat-autorizou-list", "cat-autorizou-autocomplete");
  configurarAutocomplete("cat-envolvidos-input", "cat-envolvidos-list", "cat-envolvidos-autocomplete");
}

function coletarListaIds(listId) {
  const list = document.getElementById(listId);
  if (!list) return [];
  return Array.from(list.querySelectorAll("[data-id]")).map((el) =>
    el.getAttribute("data-id"),
  );
}

function adicionarMembroNaLista(listId, memberId, memberLabel) {
  const list = document.getElementById(listId);
  if (!list) return;
  const exists = Array.from(list.querySelectorAll("[data-id]")).some(
    (el) => el.getAttribute("data-id") === memberId,
  );
  if (exists) return;
  const row = document.createElement("div");
  row.className = "envolvido-item";
  row.setAttribute("data-id", memberId);
  row.innerHTML = `<span><i class="fa-solid fa-user"></i> ${memberLabel}</span><button type="button" aria-label="Remover">×</button>`;
  row.querySelector("button").addEventListener("click", () => row.remove());
  list.appendChild(row);
}

function configurarAutocomplete(inputId, listId, autocompleteId) {
  const input = document.getElementById(inputId);
  const autocompleteList = document.getElementById(autocompleteId);
  if (!input || !autocompleteList) return;

  let selectedIndex = -1;

  function getMembers() {
    return obterMembrosOrdenados();
  }

  function renderDropdown(members, termo) {
    autocompleteList.innerHTML = "";
    if (!termo || members.length === 0) {
      autocompleteList.classList.remove("open");
      return;
    }
    selectedIndex = -1;
    const termoLower = termo.toLowerCase();
    members.forEach((member, idx) => {
      const label = formatMemberLabel(member);
      const li = document.createElement("li");
      li.dataset.id = member.id;
      li.dataset.label = label;
      li.innerHTML = `${label} <span class="member-id">#${member.id}</span>`;
      if (termoLower && label.toLowerCase().startsWith(termoLower)) {
        li.classList.add("selected");
        selectedIndex = idx;
      }
      li.addEventListener("click", () => {
        adicionarMembroNaLista(listId, member.id, label);
        input.value = "";
        autocompleteList.classList.remove("open");
        input.focus();
      });
      autocompleteList.appendChild(li);
    });
    autocompleteList.classList.add("open");
  }

  function filtrar(texto) {
    const termo = (texto || "").trim().toLowerCase();
    const membros = getMembers();
    const filtrados = termo
      ? membros.filter((member) => {
          const label = formatMemberLabel(member).toLowerCase();
          const id = String(member.id || "").toLowerCase();
          return label.includes(termo) || id.includes(termo);
        })
      : [];
    renderDropdown(filtrados, termo);
  }

  input.addEventListener("input", () => {
    filtrar(input.value);
  });

  input.addEventListener("keydown", (e) => {
    const items = autocompleteList.querySelectorAll("li");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      items.forEach((li, i) => li.classList.toggle("selected", i === selectedIndex));
      if (items[selectedIndex]) items[selectedIndex].scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, -1);
      items.forEach((li, i) => li.classList.toggle("selected", i === selectedIndex));
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (autocompleteList.classList.contains("open") && selectedIndex >= 0 && items[selectedIndex]) {
        e.preventDefault();
        items[selectedIndex].click();
      }
    } else if (e.key === "Escape") {
      autocompleteList.classList.remove("open");
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => autocompleteList.classList.remove("open"), 200);
  });

  input.addEventListener("focus", () => {
    if (input.value.trim()) {
      filtrar(input.value);
    }
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
        "warning",
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
        "warning",
      );
    }
    return alert(`Preencha o campo: ${faltando.label}.`);
  }

  if (anexos.length < 2) {
    if (typeof mostrarAlerta === "function") {
      return mostrarAlerta(
        "Atenção",
        "Envie pelo menos 2 imagens nos anexos do C.A.T.",
        "warning",
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
        "error",
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
      false,
    );
    renderCatAnexoPreview(
      document.getElementById("cat-anexo-olx-preview"),
      null,
      "Nenhuma imagem selecionada",
      false,
    );
    renderCatAnexoPreview(
      document.getElementById("cat-anexo-whatsapp-preview"),
      [],
      "Nenhuma imagem selecionada",
      true,
    );
    document.getElementById("cat-itens").value = "";

    document.getElementById("cat-investigador-input").value = "";
    document.getElementById("cat-autorizou-input").value = "";
    document.getElementById("cat-envolvidos-input").value = "";
    const listInvestigadorReset = document.getElementById("cat-investigador-list");
    const listAutorizouReset = document.getElementById("cat-autorizou-list");
    const listEnvolvidosReset = document.getElementById("cat-envolvidos-list");
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

function gerarBlobLimpeza(nome, id, telefone) {
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
        POSICOES_LIMPEZA.nome.y,
      );
      ctx.fillText(id, POSICOES_LIMPEZA.id.x, POSICOES_LIMPEZA.id.y);
      ctx.fillText(
        telefone || "N/A",
        POSICOES_LIMPEZA.rg.x,
        POSICOES_LIMPEZA.rg.y,
      );
      ctx.fillText(
        new Date().toLocaleDateString("pt-BR"),
        POSICOES_LIMPEZA.data.x,
        POSICOES_LIMPEZA.data.y,
      );

      canvas.toBlob((blob) => resolve(blob), "image/png");
    };
    img.onerror = () =>
      reject(new Error("Imagem assets/bg_limpeza.png não encontrada."));
  });
}

// ==========================================
// 👁️ PREVIEW MULTI-ARMA (VISUAL)
// ==========================================
window.gerarPreviewPorte = function () {
  const container = document.getElementById("preview-porte-container");
  const multipreviewBox = document.getElementById("multipreview-box");

  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const telefone = document.getElementById("porte-telefone").value;
  const expedicao = document.getElementById("porte-expedicao").value;
  const validade = document.getElementById("porte-validade").value;

  if (!nome || !id)
    return mostrarAlerta("Erro", "Preencha Nome e Passaporte", "warning");

  const armasSelecionadas = [];
  document.querySelectorAll('#armamentos-grid input[type="checkbox"]:checked').forEach((cb) => {
    armasSelecionadas.push(cb.value);
  });

  if (armasSelecionadas.length === 0)
    return mostrarAlerta("Erro", "Selecione pelo menos um armamento.", "warning");

  multipreviewBox.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top:10px;">Gerando documentos...</p></div>';
  container.classList.remove("hidden");
  container.style.display = "block";

  const nomeArmaLabel = { GLOCK: "Glock (9mm)", MP5: "MP5 (Submetralhadora)", TASER: "Taser (Não letal)" };
  const imgSrcPorArma = { GLOCK: "assets/porte_glock.png", MP5: "assets/porte_mp5.png", TASER: "assets/porte_taser.png" };

  let imagensCarregadas = 0;
  const totalImagens = armasSelecionadas.length;

  armasSelecionadas.forEach((arma) => {
    const imgBase = new Image();
    imgBase.src = imgSrcPorArma[arma] || "assets/porte_glock.png";

    imgBase.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = imgBase.width;
      canvas.height = imgBase.height;
      ctx.drawImage(imgBase, 0, 0);
      ctx.font = POSICOES.fonte;
      ctx.fillStyle = POSICOES.corTexto;

      ctx.fillText(nome.toUpperCase(), POSICOES.nome.x, POSICOES.nome.y);
      ctx.fillText(id, POSICOES.id.x, POSICOES.id.y);
      ctx.fillText(telefone, POSICOES.rg.x, POSICOES.rg.y);
      ctx.fillText(expedicao, POSICOES.expedicao.x, POSICOES.expedicao.y);
      ctx.fillText(validade, POSICOES.validade.x, POSICOES.validade.y);

      const dataUrl = canvas.toDataURL("image/png");

      const previewItem = document.createElement("div");
      previewItem.className = "preview-item";
      previewItem.innerHTML = `
        <div class="preview-item-header">
          <i class="fa-solid fa-file-signature"></i> Porte - ${nomeArmaLabel[arma] || arma}
        </div>
        <div class="preview-item-body">
          <img src="${dataUrl}" alt="Prévia ${arma}">
        </div>
      `;
      multipreviewBox.appendChild(previewItem);

      imagensCarregadas++;
      if (imagensCarregadas === totalImagens) {
        configurarBotoes();
      }
    };

    imgBase.onerror = () => {
      mostrarAlerta("Erro", `Imagem do porte ${arma} não encontrada.`, "error");
      imagensCarregadas++;
    };
  });
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

async function carregarRevogacoesDoDiscord() {
  try {
    const res = await fetch("/api/listar-revogacoes");
    if (!res.ok) throw new Error(`Erro API: ${res.status}`);
    const dados = await res.json();
    dbRevogados = Array.isArray(dados) ? dados : [];
    renderTables();
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

  const idsRevogados = obterIdsRevogadosSet();
  const ativosFiltrados = dbPortes
    .slice()
    .reverse()
    .filter((porte) => porte.status === "Ativo")
    .filter((porte) => !idsRevogados.has(normalizarIdNumerico(porte.id)))
    .filter((porte) => {
      if (!filtro) return true;
      return (
        porte.nome.toLowerCase().includes(filtro) ||
        String(porte.id).includes(filtro)
      );
    });

  const ativosComDias = ativosFiltrados.map((porte, index) => ({
    porte,
    index,
    diasCorridos: calcularDiasCorridos(porte.expedicao, porte.validade),
  }));

  // 1. RENOVACAO (30 a 33 dias de uso)
  ativosComDias.forEach(({ porte, diasCorridos }) => {
    if (diasCorridos !== null && diasCorridos >= 30 && diasCorridos <= 33) {
      if (tbodyRenovacao) {
        const tr = document.createElement("tr");
        const telefone = porte.telefone || porte.rg || "N/A";
        tr.innerHTML = `
              <td>${porte.nome}</td>
              <td>${porte.id}</td>
              <td>${porte.arma}</td>
              <td>${telefone}</td>
              <td>${porte.expedicao}</td>
              <td><span class="badge-warning">${diasCorridos} dias (Prazo Final)</span></td>
              <td>
                  <button class="btn-primary" style="padding: 5px 10px; font-size: 0.8rem;" onclick="renovarPorte('${porte.message_id || ""}', '${porte.id}')">
                      <i class="fa-solid fa-arrows-rotate"></i> Renovar
                  </button>
              </td>
          `;
        tbodyRenovacao.appendChild(tr);
      }
    }
  });

  // 2. REVOGACAO (Todos ativos) com paginacao
  const ativosOrdenadosRevogacao = ativosComDias.slice().sort((a, b) => {
    const aExpirado = a.diasCorridos !== null && a.diasCorridos > 33;
    const bExpirado = b.diasCorridos !== null && b.diasCorridos > 33;
    if (aExpirado !== bExpirado) return aExpirado ? -1 : 1;
    return a.index - b.index;
  });

  const totalRegistros = ativosOrdenadosRevogacao.length;
  totalPaginasRevogacao = Math.max(
    1,
    Math.ceil(totalRegistros / limiteRevogacao),
  );
  if (paginaRevogacao > totalPaginasRevogacao) {
    paginaRevogacao = totalPaginasRevogacao;
  }

  const inicio = (paginaRevogacao - 1) * limiteRevogacao;
  const paginaAtual = ativosOrdenadosRevogacao.slice(
    inicio,
    inicio + limiteRevogacao,
  );

  if (tbodyRevogacao) {
    paginaAtual.forEach(({ porte, diasCorridos }) => {
      const trRev = document.createElement("tr");
      let validadeHTML = porte.validade || "N/A";

      if (diasCorridos !== null && diasCorridos > 33) {
        trRev.classList.add("linha-expirada");
        validadeHTML = `<span class="badge-priority"><i class="fa-solid fa-triangle-exclamation"></i> EXPIRADO - REVOGAR</span>`;
      } else if (diasCorridos !== null && diasCorridos >= 30) {
        validadeHTML = `<span class="badge-warning" style="color:orange">Periodo de Graca</span>`;
      }

      const telefone = porte.telefone || porte.rg || "N/A";
      trRev.innerHTML = `
          <td>${porte.nome}</td>
          <td>${porte.id}</td>
          <td>${porte.arma}</td>
          <td>${telefone}</td>
          <td>${validadeHTML}</td>
          <td>
              <button class="btn-danger" onclick="revogar('${porte.message_id || ""}', '${porte.id}')">
                  <i class="fa-solid fa-ban"></i>
              </button>
          </td>
      `;
      tbodyRevogacao.appendChild(trRev);
      const alertaPersistido = alertasPortesPendentesRevogacao.get(
        normalizarIdNumerico(porte.id),
      );
      if (alertaPersistido) marcarLinhaComoInfrator(trRev, alertaPersistido);
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
    Math.max(1, paginaRevogacao + delta),
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

function obterImagemModeloPorte(arma) {
  const nomeArma = String(arma || "").toUpperCase();
  if (nomeArma.includes("GLOCK")) return "assets/porte_glock.png";
  if (nomeArma.includes("MP5")) return "assets/porte_mp5.png";
  return "assets/porte_taser.png";
}

function carregarImagemDocumento(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//i.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error(`Falha ao carregar imagem base: ${src}`));
    img.src = src;
  });
}

async function gerarBlobRenovacaoPorte(porte, novaExpedicao, novaValidade) {
  const fontes = [porte.imagem_url, obterImagemModeloPorte(porte.arma)].filter(
    Boolean,
  );

  let imgBase = null;
  for (const fonte of fontes) {
    try {
      imgBase = await carregarImagemDocumento(fonte);
      break;
    } catch (erro) {
      console.warn("[RENOVACAO] Falha ao usar imagem base:", erro.message);
    }
  }

  if (!imgBase)
    throw new Error("Imagem do porte não encontrada para renovação");

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = imgBase.width;
  canvas.height = imgBase.height;
  ctx.drawImage(imgBase, 0, 0);

  // Limpa os campos de data antes de desenhar os novos valores.
  const larguraCampoData = 165;
  const alturaCampoData = 34;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(
    POSICOES.expedicao.x - 6,
    POSICOES.expedicao.y - 27,
    larguraCampoData,
    alturaCampoData,
  );
  ctx.fillRect(
    POSICOES.validade.x - 6,
    POSICOES.validade.y - 27,
    larguraCampoData,
    alturaCampoData,
  );

  ctx.font = POSICOES.fonte;
  ctx.fillStyle = POSICOES.corTexto;
  ctx.fillText(novaExpedicao, POSICOES.expedicao.x, POSICOES.expedicao.y);
  ctx.fillText(novaValidade, POSICOES.validade.x, POSICOES.validade.y);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Falha ao gerar imagem da renovação"));
      resolve(blob);
    }, "image/png");
  });
}

// ==========================================
// 🔄 AÇÃO DE RENOVAR
// ==========================================
window.renovarPorte = async function (identificadorPorte, idPorteFallback) {
  const identificadorNormalizado = String(identificadorPorte || "").trim();
  let porte = null;

  if (identificadorNormalizado) {
    porte = dbPortes.find(
      (p) => String(p.message_id || "").trim() === identificadorNormalizado,
    );
  }

  if (!porte) {
    const idNormalizado = normalizarIdNumerico(
      idPorteFallback || identificadorPorte,
    );
    porte = dbPortes.find((p) => normalizarIdNumerico(p.id) === idNormalizado);
  }

  if (!porte) return;

  const hoje = new Date();
  const novaValidade = new Date();
  novaValidade.setDate(hoje.getDate() + 30);
  const novaExpedicaoStr = hoje.toLocaleDateString("pt-BR");
  const novaValidadeStr = novaValidade.toLocaleDateString("pt-BR");
  const validadeAtual = porte.validade || "N/A";

  if (
    !(await confirmarAcao(
      "Renovar porte?",
      `Tem certeza que deseja renovar o porte do cidadão ${porte.nome} (${porte.arma})?\n\nValidade atual: ${validadeAtual}\nNova validade: ${novaValidadeStr}`,
      "renovacao",
      "Sim, Renovar",
    ))
  )
    return;

  mostrarAlerta("Processando", "Renovando porte...", "warning");

  const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
  const mencaoOficial = sessao.id
    ? `<@${sessao.id}>`
    : `**${sessao.username}**`;
  const idArquivo = porte.message_id || normalizarIdNumerico(porte.id) || porte.id;
  const nomeArquivo = `renovacao_${idArquivo}.png`;

  let blobRenovacao = null;
  try {
    blobRenovacao = await gerarBlobRenovacaoPorte(
      porte,
      novaExpedicaoStr,
      novaValidadeStr,
    );
  } catch (erro) {
    console.error("[RENOVACAO] Erro ao gerar imagem:", erro);
    return mostrarAlerta(
      "Erro",
      "Não foi possível gerar a imagem do porte renovado.",
      "error",
    );
  }

  const embedData = {
    title: `🔄 RENOVAÇÃO DE PORTE`,
    description: `Renovação de documentação com cartão atualizado.`,
    color: 16776960, // Amarelo
    fields: [
      { name: "👤 Cidadão", value: `**${porte.nome}**`, inline: true },
      { name: "🆔 Passaporte", value: `\`${porte.id}\``, inline: true },
      {
        name: "📞 Telefone",
        value: `\`${porte.telefone || porte.rg || "N/A"}\``,
        inline: true,
      },
      { name: "👮 Renovado por", value: mencaoOficial, inline: true },
      { name: "🔫 Arma", value: porte.arma, inline: true },
      {
        name: "📅 Nova Expedição",
        value: `\`${novaExpedicaoStr}\``,
        inline: true,
      },
      {
        name: "📅 Nova Validade",
        value: `\`${novaValidadeStr}\``,
        inline: true,
      },
    ],
    image: { url: `attachment://${nomeArquivo}` },
    footer: FOOTER_PADRAO, // <-- RODAPÉ PADRÃO DO SISTEMA
  };

  const sucesso = await enviarParaAPI(
    blobRenovacao,
    nomeArquivo,
    "porte",
    embedData,
    `🔄 **PORTE RENOVADO:** ${porte.id}`,
  );

  if (sucesso) {
    porte.validade = novaValidadeStr;
    porte.expedicao = novaExpedicaoStr;
    porte.imagem_url = sucesso?.attachments?.[0]?.url || porte.imagem_url;
    renderTables();
    mostrarAlerta("Sucesso", "Porte renovado!", "success");
  } else {
    mostrarAlerta("Erro", "Falha ao registrar renovação.", "error");
  }
};

// ==========================================
// 🚫 AÇÃO DE REVOGAR (CORRIGIDA)
// ==========================================
window.revogar = async function (identificadorPorte, idPassaporteFallback) {
  const identificadorNormalizado = String(identificadorPorte || "").trim();
  let p = null;

  if (identificadorNormalizado) {
    p = dbPortes.find(
      (x) => String(x.message_id || "").trim() === identificadorNormalizado,
    );
  }

  if (!p) {
    const idNormalizado = normalizarIdNumerico(
      idPassaporteFallback || identificadorPorte,
    );
    p = dbPortes.find((x) => normalizarIdNumerico(x.id) === idNormalizado);
  }

  if (!p) return mostrarAlerta("Erro", "Registro não encontrado.", "error");
  const idNormalizado = normalizarIdNumerico(p.id);
  const idPassaporte = p.id;

  // IMPORTANTE: Se não tiver message_id, o sistema não vai conseguir apagar do Discord
  if (!p.message_id) {
    console.error("Erro: message_id não encontrado no objeto", p);
  }

  const confirmou = await confirmarAcao(
    "REVOGAR PORTE?",
    `Deseja revogar o porte de ${p.nome}? Isso apagará o registro original e enviará o log de revogação.`,
    "danger",
  );

  if (!confirmou) return;

  const modal = document.getElementById("custom-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalDesc = document.getElementById("modal-desc");
  const modalFooter = document.getElementById("modal-footer");
  const modalIcon = document.getElementById("modal-icon");

  if (modalTitle) modalTitle.innerText = "Processando Revogação...";
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

    // Tentamos pegar a menção real do emissor original (p.oficial_id deve vir do listar.js)
    const mencaoEmissorOriginal = p.oficial_id
      ? `<@${p.oficial_id}>`
      : p.oficial;

    const blob = await gerarBlobRevogacao(p);
    const nomeArquivo = `revogacao_${idPassaporte}.png`;

    const embed = {
      title: `🚫 PORTE REVOGADO`,
      color: 15548997,
      fields: [
        { name: "👤 Cidadão", value: p.nome, inline: true },
        { name: "🆔 ID", value: p.id, inline: true },
        { name: "👮 Revogado por", value: mencaoRevogador, inline: true },
        // A menção abaixo é vital para o relatorio.js continuar contando a meta
        {
          name: "📜 Emissor Original",
          value: mencaoEmissorOriginal,
          inline: true,
        },
      ],
      image: { url: `attachment://${nomeArquivo}` },
      footer: FOOTER_PADRAO,
      timestamp: new Date().toISOString(),
    };

    const logTexto = `🚨 **PORTE REVOGADO** | Cidadão: ${p.nome} | Emissor Original: ${mencaoEmissorOriginal}`;

    // 1. Envia o Log para o canal de revogação
    const sucessoLog = await enviarParaAPI(
      blob,
      nomeArquivo,
      "revogacao",
      embed,
      logTexto,
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
      dbPortes = dbPortes.filter((item) =>
        p.message_id
          ? item.message_id !== p.message_id
          : normalizarIdNumerico(item.id) !== idNormalizado,
      );
      alertasPortesPendentesRevogacao.delete(idNormalizado);
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
        "success",
      );
    }
  } catch (e) {
    console.error(e);
    if (modalFooter) modalFooter.style.display = "flex";
    mostrarAlerta("Erro", "Falha ao processar revogação.", "error");
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
      // Telefone corrigido na imagem
      ctx.fillText(
        (p.telefone || p.rg || "N/A").toString(),
        POSICOES.rg.x,
        POSICOES.rg.y,
      );

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
  if (blob && filename) {
    form.append("file", blob, filename);
  }
  form.append("payload_json", JSON.stringify({ content, embeds: [embed] }));

  try {
    const res = await fetch(`/api/enviar?tipo=${tipo}`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) throw new Error(await res.text());

    // ✨ MUDANÇA AQUI: Retornamos os dados da resposta em vez de apenas 'true'
    const data = await res.json();
    return data;
  } catch (e) {
    console.error(e);
    mostrarAlerta("Erro", "Falha API (Verifique permissões do Bot)", "error");
    return null; // Retorna null em caso de erro
  }
}

async function validarLoginNaAPI(token) {
  try {
    if (!token) {
      redirecionarParaLogin("missing_token");
      return;
    }
    const res = await fetch("/api/auth", { headers: { Authorization: token } });
    const data = await res.json();
    if (res.ok && data.authorized) {
      salvarSessao({ ...data, token });
      window.location.href = "index.html";
    } else {
      console.warn("Login negado:", data?.error || "Sem detalhes");
      redirecionarParaLogin("unauthorized");
    }
  } catch (e) {
    console.error(e);
    redirecionarParaLogin("auth_failed");
  }
}

// ==========================================
// 🛠️ FUNÇÕES DE SISTEMA & MODAL (VISUAL ATUALIZADO)
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
      : CURRENT_ORG.logoPath;
    div.innerHTML = `
      <div class="user-card">
        <div class="avatar-circle"><img src="${avatar}" style="width:100%"></div>
        <div class="user-info"><p>${user.username}</p><small>● Online</small></div>
        <div class="user-actions">
          <button class="btn-user-config" id="btn-config-usuario" onclick="abrirPopupConfig()" title="Configurações">
            <i class="fa-solid fa-gear"></i>
          </button>
          <button class="btn-user-logout" onclick="logout()" title="Desconectar">
            <i class="fa-solid fa-right-from-bracket"></i>
          </button>
        </div>
      </div>
      <div class="user-config-overlay hidden" id="user-config-overlay" onclick="fecharPopupConfig()"></div>
      <div class="user-config-popup hidden" id="user-config-popup">
        <div class="popup-header">
          <i class="fa-solid fa-palette"></i>
          <span>Personalizar</span>
          <button class="popup-close" onclick="fecharPopupConfig()">&times;</button>
        </div>
        <div class="popup-body">
          <div class="config-item">
            <div class="config-item-icon"><i class="fa-solid fa-sun"></i></div>
            <div class="config-item-content">
              <span class="config-item-label">Modo Claro</span>
              <span class="config-item-desc">Alternar entre claro e escuro</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="toggle-modo-claro" onchange="alternarModoClaro(this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>`;
  }
  aplicarModoSalvo();
}

window.alternarModoClaro = function (ativo) {
  if (ativo) {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("pc-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("pc-theme", "dark");
  }
};

function aplicarModoSalvo() {
  const tema = localStorage.getItem("pc-theme");
  const toggle = document.getElementById("toggle-modo-claro");
  if (tema === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    if (toggle) toggle.checked = true;
  } else {
    document.documentElement.removeAttribute("data-theme");
    if (toggle) toggle.checked = false;
  }
}

window.abrirPopupConfig = function () {
  const overlay = document.getElementById("user-config-overlay");
  const popup = document.getElementById("user-config-popup");
  if (overlay) overlay.classList.remove("hidden");
  if (popup) popup.classList.remove("hidden");
  aplicarModoSalvo();
};

window.fecharPopupConfig = function () {
  const overlay = document.getElementById("user-config-overlay");
  const popup = document.getElementById("user-config-popup");
  if (overlay) overlay.classList.add("hidden");
  if (popup) popup.classList.add("hidden");
};

window.logout = () => {
  encerrarSessao();
};

window.navegar = (tela) => {
  if (!podeAcessarTela(tela)) {
    console.warn(`🚫 Acesso negado à tela ${tela} para ${CURRENT_ORG_KEY}.`);
    tela = "dashboard";
  }

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
  if (tela === "logs" && USER_IS_ADMIN) carregarLogsAuditoria(logsPaginationState.page || 1);

  // Fecha sidebar mobile após navegar
  if (window.innerWidth <= 768) {
    document.querySelector(".sidebar")?.classList.remove("open");
    document.querySelector(".sidebar-overlay")?.classList.remove("active");
    document.body.style.overflow = "";
  }
};

// 👇 HAMBURGER - Sidebar toggle para mobile
document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.querySelector(".sidebar");
  const hamburger = document.getElementById("hamburger-btn");

  // Criar overlay
  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";
  document.body.appendChild(overlay);

  hamburger?.addEventListener("click", () => {
    sidebar?.classList.toggle("open");
    overlay.classList.toggle("active");
    document.body.style.overflow = sidebar?.classList.contains("open") ? "hidden" : "";
  });

  overlay.addEventListener("click", () => {
    sidebar?.classList.remove("open");
    overlay.classList.remove("active");
    document.body.style.overflow = "";
  });
});

// 👇 MODAL PERSONALIZADO (NÃO USA ALERT/CONFIRM NATIVO) 👇
window.confirmarAcao = (
  titulo,
  mensagem,
  tipo = "padrao",
  confirmLabel = "",
) => {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-modal");
    // Se não achar o modal no HTML, usa o nativo por segurança
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
      btnConfirm.innerText = confirmLabel || "Sim, Revogar";
    } else if (tipo === "renovacao") {
      elIcon.className = "fa-solid fa-arrows-rotate modal-icon renovacao";
      btnConfirm.className = "btn-warning-modal";
      btnConfirm.innerText = confirmLabel || "Sim, Renovar";
    } else {
      elIcon.className = "fa-solid fa-circle-question modal-icon";
      elIcon.style.color = "#fff";
      btnConfirm.className = "btn-primary";
      btnConfirm.innerText = confirmLabel || "Confirmar";
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
async function verificarPermissoesAdmin() {
  if (CURRENT_ORG_KEY === "PF") {
    USER_IS_ADMIN = false;
    return false;
  }

  const sessao = lerSessao();
  if (!sessao?.id) {
    USER_IS_ADMIN = false;
    return false;
  }

  try {
    const res = await fetch("/api/verificar-admin", {
      headers: {
        "X-Session-User-Id": sessao.id,
      },
    });

    const data = await res.json();
    USER_IS_ADMIN = Boolean(res.ok && data.isAdmin);

    const btnRelatorio = document.getElementById("menu-relatorios");
    const btnLogs = document.getElementById("menu-logs");

    if (btnRelatorio) btnRelatorio.classList.toggle("visible", USER_IS_ADMIN);
    if (btnLogs) btnLogs.classList.toggle("hidden", !USER_IS_ADMIN);

    return USER_IS_ADMIN;
  } catch (erro) {
    USER_IS_ADMIN = false;
    console.error("Erro ao verificar permissao admin:", erro);
    return false;
  }
}

function resolverEmitidoPor(item) {
  if (item.emitidoPor && !item.emitidoPor.startsWith("<@")) {
    return item.emitidoPor;
  }
  const id = item.emitidoPorIdDiscord;
  if (!id || id === "N/A") return item.emitidoPor || "N/A";
  if (typeof catMembersCache !== "undefined" && catMembersCache) {
    const member = catMembersCache.find((m) => m.id === id);
    if (member) {
      return member.nick || member.global_name || member.username || id;
    }
  }
  return `ID: ${id}`;
}

function renderizarLogsAuditoria(items = []) {
  const corpo = document.getElementById("corpo-logs");
  if (!corpo) return;

  if (!items.length) {
    corpo.innerHTML = `
      <tr>
        <td colspan="6" align="center" style="padding: 32px; color: var(--text-secondary);">
          Nenhum log encontrado.
        </td>
      </tr>`;
    return;
  }

  corpo.innerHTML = items
    .map(
      (item) => `
        <tr>
          <td>${item.data || "N/A"}</td>
          <td>${item.horario || "N/A"}</td>
          <td>${item.tipo || "N/A"}</td>
          <td>${item.itemEmitido || "N/A"}</td>
          <td>${resolverEmitidoPor(item)}</td>
          <td><code>${item.emitidoPorIdDiscord || "N/A"}</code></td>
        </tr>`
    )
    .join("");
}

function atualizarPaginacaoLogs(pagination) {
  logsPaginationState = {
    page: pagination?.page || 1,
    totalPages: pagination?.totalPages || 1,
    totalItems: pagination?.totalItems || 0,
  };

  const info = document.getElementById("logs-pagination-info");
  const btnPrev = document.getElementById("btn-logs-prev");
  const btnNext = document.getElementById("btn-logs-next");

  if (info) {
    info.textContent = `Pagina ${logsPaginationState.page} de ${logsPaginationState.totalPages} (${logsPaginationState.totalItems} registros)`;
  }

  if (btnPrev) btnPrev.disabled = logsPaginationState.page <= 1;
  if (btnNext) {
    btnNext.disabled = logsPaginationState.page >= logsPaginationState.totalPages;
  }
}

async function carregarLogsAuditoria(page = 1) {
  const corpo = document.getElementById("corpo-logs");
  const sessao = lerSessao();

  if (!corpo || !sessao?.id) return;

  corpo.innerHTML = `
    <tr>
      <td colspan="6" align="center" style="padding: 32px; color: var(--text-secondary);">
        <i class="fa-solid fa-spinner fa-spin"></i> Carregando logs...
      </td>
    </tr>`;

  if (!catMembersCache) {
    carregarMembrosDiscord();
  }

  try {
    const response = await fetch(`/api/logs-portes?page=${page}`, {
      headers: {
        "X-Session-User-Id": sessao.id,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        USER_IS_ADMIN = false;
        const btnLogs = document.getElementById("menu-logs");
        const btnRelatorio = document.getElementById("menu-relatorios");
        if (btnLogs) btnLogs.classList.add("hidden");
        if (btnRelatorio) btnRelatorio.classList.remove("visible");
        window.navegar("dashboard");
      }
      throw new Error(data?.error || "Falha ao carregar logs.");
    }

    renderizarLogsAuditoria(data.items || []);
    atualizarPaginacaoLogs(data.pagination || {});
  } catch (error) {
    console.error(error);
    corpo.innerHTML = `
      <tr>
        <td colspan="6" align="center" style="padding: 32px; color: #ff8f8f;">
          Erro ao carregar logs de auditoria.
        </td>
      </tr>`;
  }
}

// ===============================================
// 📊 LÓGICA DE RELATÓRIOS (Atualizada e Ordenada)
// ===============================================

let _ultimoRelatorioGerado = null;

window.gerarRelatorio = async function () {
  const corpo = document.getElementById("corpo-relatorio");
  const inicioInput = document.getElementById("rel-inicio");
  const fimInput = document.getElementById("rel-fim");
  const btnCopiar = document.getElementById("btn-copiar-relatorio");

  if (!inicioInput.value || !fimInput.value) {
    // Certifique-se de que a função mostrarAlerta existe ou use alert()
    if (typeof mostrarAlerta === "function") {
      return mostrarAlerta(
        "Atenção",
        "Selecione o período inicial e final.",
        "warning",
      );
    } else {
      return alert("Selecione o período inicial e final.");
    }
  }

  corpo.innerHTML = `
    <div class="relatorio-vazio">
      <i class="fa-solid fa-magnifying-glass fa-spin"></i>
      <p>Analisando registros...</p>
    </div>`;
  if (btnCopiar) btnCopiar.disabled = true;
  _ultimoRelatorioGerado = null;

  try {
    const user = JSON.parse(localStorage.getItem("pc_session") || "{}");

    const response = await fetch("/api/relatorio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataInicio: inicioInput.value,
        dataFim: fimInput.value,
        roles: user.roles, // Enviado caso precise filtrar permissões no backend
      }),
    });

    const dados = await response.json();

    if (!dados || Object.keys(dados).length === 0) {
      corpo.innerHTML = `
        <div class="relatorio-vazio">
          <i class="fa-solid fa-circle-info"></i>
          <p>Nenhum registro encontrado neste período.</p>
        </div>`;
      _ultimoRelatorioGerado = null;
      if (btnCopiar) btnCopiar.disabled = true;
      return;
    }

    // --- Converte o objeto { "Nome": {stats} } em um Array pra poder ordenar ---
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

    // Ordena do Maior Total para o Menor (Decrescente)
    listaOrdenada.sort((a, b) => b.total - a.total);

    const meta = 10;

    const itens = [
      { chave: "emissao", label: "Portes", icon: "fa-passport" },
      { chave: "renovacao", label: "Renov.", icon: "fa-arrows-rotate" },
      { chave: "limpeza", label: "Limp.", icon: "fa-eraser" },
      { chave: "revogacao", label: "Revog.", icon: "fa-ban" },
      { chave: "cat", label: "C.A.T", icon: "fa-clipboard" },
    ];

    corpo.innerHTML = listaOrdenada
      .map((d) => {
        const bateuMeta = d.total >= meta;
        const percentual = Math.min(100, Math.round((d.total / meta) * 100));

        const statsHtml = itens
          .map(
            (item) => `
              <div class="relatorio-stat">
                <i class="fa-solid ${item.icon}"></i>
                <span class="relatorio-stat-valor">${d[item.chave] || 0}</span>
                <span class="relatorio-stat-label">${item.label}</span>
              </div>`
          )
          .join("");

        const statusHtml = bateuMeta
          ? `<span class="meta-badge meta-success"><i class="fa-solid fa-circle-check"></i> Meta Batida</span>`
          : `<span class="meta-badge meta-warning"><i class="fa-solid fa-triangle-exclamation"></i> Faltam ${meta - d.total}</span>`;

        return `
          <div class="relatorio-card ${bateuMeta ? "relatorio-card-ok" : ""}">
            <div class="relatorio-card-topo">
              <div class="relatorio-card-nome">
                <i class="fa-solid fa-user-shield"></i>
                <span>${d.nome}</span>
              </div>
              ${statusHtml}
            </div>

            <div class="relatorio-progresso">
              <div class="relatorio-progresso-barra">
                <div class="relatorio-progresso-preenchido ${bateuMeta ? "cheio" : ""}" style="width: ${percentual}%;"></div>
              </div>
              <span class="relatorio-progresso-texto">${d.total} / ${meta}</span>
            </div>

            <div class="relatorio-stats-grid">
              ${statsHtml}
            </div>
          </div>`;
      })
      .join("");

    _ultimoRelatorioGerado = {
      lista: listaOrdenada,
      meta,
      dataInicio: inicioInput.value,
      dataFim: fimInput.value,
    };
    if (btnCopiar) btnCopiar.disabled = false;
  } catch (error) {
    console.error(error);
    corpo.innerHTML = `
      <div class="relatorio-vazio relatorio-erro">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <p>Erro ao carregar relatório. Tente novamente.</p>
      </div>`;
    _ultimoRelatorioGerado = null;
    if (btnCopiar) btnCopiar.disabled = true;
  }
};

// ===============================================
// 📋 Copiar relatório em Markdown (formatado pro Discord)
// ===============================================
function formatarDataBR(isoDate) {
  const [ano, mes, dia] = isoDate.split("-");
  return `${dia}/${mes}/${ano}`;
}

function montarTextoRelatorioDiscord({ lista, meta, dataInicio, dataFim }) {
  const totalGeral = lista.reduce((soma, d) => soma + d.total, 0);
  const bateram = lista.filter((d) => d.total >= meta).length;

  let texto = `📊 **RELATÓRIO DE PRODUTIVIDADE**\n`;
  texto += `🗓️ Período: **${formatarDataBR(dataInicio)}** a **${formatarDataBR(dataFim)}**\n`;
  texto += `🎯 Meta: **${meta}** ações + C.A.T\n`;
  texto += `✅ ${bateram}/${lista.length} bateram a meta • 📈 Total geral: **${totalGeral}**\n`;
  texto += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  lista.forEach((d, i) => {
    const bateuMeta = d.total >= meta;
    const medalha = i === 0 ? "🥇 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : "";
    const statusEmoji = bateuMeta ? "✅ **Meta Batida**" : `⚠️ Faltam **${meta - d.total}**`;

    texto += `${medalha}👮 **${d.nome}**\n`;
    texto += `> 🔫 Portes: **${d.emissao || 0}** • 🔄 Renov.: **${d.renovacao || 0}** • 🧹 Limp.: **${d.limpeza || 0}** • 🚫 Revog.: **${d.revogacao || 0}** • 📋 C.A.T: **${d.cat || 0}**\n`;
    texto += `> 📌 Total: **${d.total}** — ${statusEmoji}\n\n`;
  });

  texto += `━━━━━━━━━━━━━━━━━━━━\n`;
  texto += `_Relatório gerado automaticamente pelo Sistema de Emissão._`;

  return texto;
}

document.addEventListener("DOMContentLoaded", () => {
  const btnCopiar = document.getElementById("btn-copiar-relatorio");
  if (!btnCopiar) return;

  btnCopiar.addEventListener("click", async () => {
    if (!_ultimoRelatorioGerado) return;

    const texto = montarTextoRelatorioDiscord(_ultimoRelatorioGerado);

    try {
      await navigator.clipboard.writeText(texto);
      if (typeof mostrarAlerta === "function") {
        mostrarAlerta("Copiado!", "Relatório copiado - já é só colar no Discord.", "success");
      }
    } catch (err) {
      console.error("Falha ao copiar:", err);
      if (typeof mostrarAlerta === "function") {
        mostrarAlerta("Erro", "Não foi possível copiar automaticamente. Tente novamente.", "error");
      }
    }
  });
});

// ===============================================
// 2. Event Listener (Seguro)
// ===============================================
document.addEventListener("DOMContentLoaded", () => {
  const btnFiltrar = document.getElementById("btn-filtrar-relatorio");
  const btnLogsPrev = document.getElementById("btn-logs-prev");
  const btnLogsNext = document.getElementById("btn-logs-next");

  if (btnFiltrar) {
    const novoBtn = btnFiltrar.cloneNode(true);
    btnFiltrar.parentNode.replaceChild(novoBtn, btnFiltrar);

    novoBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.gerarRelatorio();
    });

    console.log("Botão de Relatório ativado.");
  }

  if (btnLogsPrev) {
    btnLogsPrev.addEventListener("click", () => {
      if (logsPaginationState.page > 1) {
        carregarLogsAuditoria(logsPaginationState.page - 1);
      }
    });
  }

  if (btnLogsNext) {
    btnLogsNext.addEventListener("click", () => {
      if (logsPaginationState.page < logsPaginationState.totalPages) {
        carregarLogsAuditoria(logsPaginationState.page + 1);
      }
    });
  }
});

// protecao contra cliques aqui
// =========================================================
// 🔎 SISTEMA DE VARREDURA AUTOMÁTICA DE INFRAÇÕES (CORRIGIDO)
// =========================================================

window.verificarConformidadePortes = async function () {
  console.log("🔍 Auditoria: Iniciando varredura...");

  const statusAuditoria = document.getElementById("status-auditoria");
  const textoAuditoria = document.getElementById("texto-auditoria");

  if (statusAuditoria) statusAuditoria.classList.remove("hidden");
  await carregarRevogacoesDoDiscord();

  // Usa a mesma regra de filtragem da tabela para auditar todos os ativos
  const filtro = document.getElementById("input-busca")
    ? document.getElementById("input-busca").value.toLowerCase()
    : "";
  const idsRevogados = obterIdsRevogadosSet();
  const ativosFiltrados = dbPortes
    .slice()
    .reverse()
    .filter((porte) => porte.status !== "Revogado")
    .filter((porte) => !idsRevogados.has(normalizarIdNumerico(porte.id)))
    .filter((porte) => {
      if (!filtro) return true;
      return (
        porte.nome.toLowerCase().includes(filtro) ||
        String(porte.id).includes(filtro)
      );
    });

  if (!ativosFiltrados.length) {
    console.warn(
      "⚠️ Auditoria: Nenhuma linha de porte encontrada para analisar.",
    );
    if (statusAuditoria) statusAuditoria.classList.add("hidden");
    return mostrarAlerta(
      "Aviso",
      "Não há portes ativos na tabela para auditar.",
      "warning",
    );
  }

  let detectados = 0;
  let processados = 0;
  alertasPortesPendentesRevogacao.clear();

  // Mapeia as linhas da pagina atual para marcar infratores visiveis
  const corpoTabela =
    document.getElementById("lista-ativos-para-revogar") ||
    document.getElementById("corpo-revogacao");
  const linhas = corpoTabela ? corpoTabela.querySelectorAll("tr") : [];
  const linhasPorId = new Map();
  linhas.forEach((linha) => {
    const idLinha = normalizarIdNumerico(linha.cells[1]?.innerText.trim());
    if (idLinha) linhasPorId.set(idLinha, linha);
  });

  for (const porte of ativosFiltrados) {
    const idCidadao = normalizarIdNumerico(porte.id);
    if (!idCidadao || isNaN(idCidadao)) continue;

    processados++;
    if (textoAuditoria)
      textoAuditoria.innerText = `Auditando ID: ${idCidadao} (${processados}/${ativosFiltrados.length})...`;

    console.log(`⏳ Verificando ficha e banco de dados do ID: ${idCidadao}...`);

    try {
      const res = await fetch("/api/consultar-ficha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idCidadao: idCidadao }),
      });

      const data = await res.json();

      // REGRA: Achou na ficha criminal ou no canal de banco de dados => revogação recomendada
      if (data.registrosEncontrados > 0) {
        alertasPortesPendentesRevogacao.set(idCidadao, data);
        const registrosCriminais = Number(
          data.registrosCriminaisEncontrados || 0,
        );
        const registrosBancoDados = Number(
          data.registrosBancoDadosEncontrados || 0,
        );
        console.log(
          `🚨 INFRAÇÃO: ID ${idCidadao} possui ${data.registrosEncontrados} registro(s). Crimes: ${registrosCriminais} | Banco: ${registrosBancoDados}`,
        );
        const linha = linhasPorId.get(idCidadao);
        if (linha) marcarLinhaComoInfrator(linha, data);
        detectados++;
      } else {
        alertasPortesPendentesRevogacao.delete(idCidadao);
      }
    } catch (e) {
      console.error(`❌ Erro ao consultar ID ${idCidadao}:`, e);
    }
  }

  if (statusAuditoria) statusAuditoria.classList.add("hidden");
  renderTables();

  if (detectados > 0) {
    mostrarAlerta(
      "Auditoria Concluída",
      `${detectados} porte(s) com alerta encontrados na ficha criminal e/ou no banco de dados. Revogação recomendada.`,
      "error",
    );
  } else {
    mostrarAlerta(
      "Auditoria Concluída",
      `Nenhuma irregularidade encontrada nos ${processados} registros analisados.`,
      "success",
    );
  }
};

function marcarLinhaComoInfrator(linha, data) {
  const registrosCriminais = Number(data.registrosCriminaisEncontrados || 0);
  const registrosBancoDados = Number(data.registrosBancoDadosEncontrados || 0);
  const registrosTotais = Number(data.registrosEncontrados || 0);
  const origemPartes = [];
  if (registrosCriminais > 0)
    origemPartes.push(`${registrosCriminais} ficha criminal`);
  if (registrosBancoDados > 0)
    origemPartes.push(`${registrosBancoDados} banco de dados`);
  const resumoOrigens =
    origemPartes.length > 0
      ? origemPartes.join(" | ")
      : `${registrosTotais} registro(s)`;
  const tituloAlerta =
    registrosBancoDados > 0 ? "⚠️ REVOGAR (PASSAPORTE)" : "⚠️ FICHA SUJA";

  // Estilo visual de perigo
  linha.style.background = "rgba(255, 0, 0, 0.2)";
  linha.style.borderLeft = "5px solid #ff4d4d";

  // Atualiza a coluna de Status/Alerta (Coluna 4 no seu index.html)
  // Coluna 0: Nome, 1: ID, 2: Arma, 3: Telefone, 4: Status/Alerta, 5: Ação
  const celulaAlerta = linha.cells[4] || linha.cells[3];
  if (celulaAlerta) {
    celulaAlerta.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
         <span style="background:#ff4d4d; color:white; font-size:10px; padding:2px 6px; border-radius:3px; font-weight:bold;">${tituloAlerta}</span>
         <small style="font-size:9px; color: #ff9999;">${resumoOrigens}</small>
         <small style="font-size:9px; color: #ffb3b3;">Ação recomendada: revogar porte.</small>
      </div>
    `;
  }

  // Move o infrator para o topo da tabela
  if (linha.parentNode) linha.parentNode.prepend(linha);
}
// ==========================================
// 🛠️ SISTEMA DE RECOMPRA (COMPLETO)
// ==========================================

// 1. Tabela de Preços
const PRECOS_RECOMPRA = {
  MUNICAO: 150000,
  ARMAS: {
    GLOCK: 1200000,
    MP5: 1600000,
    TASER: 3600000,
  },
};

// Variável global para armazenar qual porte está sendo editado
let porteSelecionadoParaRecompra = null;

// 2. Função de Busca
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
      '<p style="color:red; grid-column: 1/-1; text-align:center;">Erro de conexão com a API.</p>';
  }
}

// 3. Função de Seleção
function selecionarPorteRecompra(porte, elementoCard) {
  // Remove seleção visual anterior
  document
    .querySelectorAll(".card-porte-item")
    .forEach((c) => c.classList.remove("selected"));
  elementoCard.classList.add("selected");

  porteSelecionadoParaRecompra = porte;

  const nomeArma = porte.arma.toUpperCase();
  const isTaser = nomeArma.includes("TASER");

  // Lógica visual do Taser (Esconde opção de munição)
  const divMunicaoLabel = document.getElementById("lbl-municao");
  if (isTaser) {
    divMunicaoLabel.style.display = "none";
    document.getElementById("chk-municao").checked = false;
  } else {
    divMunicaoLabel.style.display = "flex";
  }

  // Define Preço Base
  let precoArma = 0;
  if (nomeArma.includes("GLOCK")) precoArma = PRECOS_RECOMPRA.ARMAS.GLOCK;
  else if (nomeArma.includes("MP5")) precoArma = PRECOS_RECOMPRA.ARMAS.MP5;
  else if (nomeArma.includes("TASER")) precoArma = PRECOS_RECOMPRA.ARMAS.TASER;

  // Salva no objeto para usar no cálculo
  porteSelecionadoParaRecompra.precoBaseArma = precoArma;

  // Atualiza HTML
  const form = document.getElementById("form-recompra-detalhes");
  document.getElementById("recompra-arma-display").innerText = porte.arma;
  document.getElementById("recompra-preco-base").innerText =
    `Custo Base da Arma: R$ ${precoArma.toLocaleString("pt-BR")}`;

  // Reseta checkboxes
  document.getElementById("chk-arma").checked = false;
  document.getElementById("chk-municao").checked = false;

  // CHAMA A FUNÇÃO QUE ESTAVA FALTANDO
  calcularTotalRecompra();

  // Mostra o formulário
  form.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

// 4. Função de Cálculo (A QUE ESTAVA FALTANDO)
function calcularTotalRecompra() {
  if (!porteSelecionadoParaRecompra) return;

  const querMunicao = document.getElementById("chk-municao").checked;
  const querArma = document.getElementById("chk-arma").checked;

  let total = 0;

  // Soma Munição
  if (querMunicao) {
    total += PRECOS_RECOMPRA.MUNICAO;
  }

  // Soma Arma
  if (querArma) {
    // Usa o preço que salvamos na função de seleção
    total += porteSelecionadoParaRecompra.precoBaseArma || 0;
  }

  // Atualiza o texto na tela
  document.getElementById("recompra-valor-total").innerText =
    `R$ ${total.toLocaleString("pt-BR")}`;
}

// 5. Função de Emissão
// ==========================================
// 5. Função de Emissão (Embed Padronizado)
// ==========================================
// ==========================================
// 5. Função de Emissão (Embed com Menção Correta)
// ==========================================
async function emitirRecompra() {
  if (!porteSelecionadoParaRecompra) return;

  const chkMunicao = document.getElementById("chk-municao").checked;
  const chkArma = document.getElementById("chk-arma").checked;
  const idCidadao = document.getElementById("busca-recompra-id").value;

  if (!chkMunicao && !chkArma) {
    return mostrarAlerta(
      "Atenção",
      "Selecione o que será comprado (Munição ou Arma).",
      "warning",
    );
  }

  // --- CORREÇÃO DA IDENTIFICAÇÃO DO OFICIAL ---
  const sessionData = JSON.parse(localStorage.getItem("pc_session") || "{}");

  // 1. Tenta pegar o ID (Para mencionar no Discord)
  // Verifica se o ID está na raiz ou dentro de um objeto 'user'
  const idOficial = sessionData.id || (sessionData.user && sessionData.user.id);

  // 2. Tenta pegar o Nome (Para escrever na imagem)
  const nomeVisual =
    sessionData.global_name ||
    sessionData.username ||
    (sessionData.user && sessionData.user.username) ||
    "Oficial";

  // 3. Cria a string de menção: Se tiver ID, usa <@ID>, senão usa o nome texto
  const mencaoOficial = idOficial ? `<@${idOficial}>` : `\`${nomeVisual}\``;
  // ---------------------------------------------

  // Recalcula total internamente
  let total = 0;
  if (chkMunicao) total += PRECOS_RECOMPRA.MUNICAO;
  if (chkArma) total += porteSelecionadoParaRecompra.precoBaseArma;

  // Monta texto dos itens
  let itens = [];
  if (chkArma) itens.push(`Armamento (${porteSelecionadoParaRecompra.arma})`);
  if (chkMunicao) itens.push("Recarga de Munição");
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

  // Título Recibo
  ctx.fillStyle = "#000";
  ctx.font = "bold 70px Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("RECIBO DE RECOMPRA", 540, 115);

  // Conteúdo do Recibo
  ctx.fillStyle = "#FFF";
  ctx.textAlign = "left";
  ctx.font = "45px Roboto, sans-serif";

  let y = 350;
  ctx.fillStyle = "#D4AF37";
  ctx.fillText("Oficial:", 100, y);
  // Na imagem escrevemos o NOME VISUAL (Texto), pois imagem não aceita menção
  ctx.fillStyle = "#FFF";
  ctx.fillText(nomeVisual, 400, y);

  y += 100;
  ctx.fillStyle = "#D4AF37";
  ctx.fillText("Cidadão:", 100, y);
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

  // Data Rodapé
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
          title: "📦 REGISTRO DE RECOMPRA",
          description: `Reposição de equipamento autorizada para porte ativo.`,
          color: 5034295, // Verde
          author: {
            name: CURRENT_ORG.fullName,
            icon_url: CURRENT_BRASAO_URL,
          },
          thumbnail: {
            url: CURRENT_BRASAO_URL,
          },
          fields: [
            // AQUI usamos a variável mencaoOficial que contém o <@ID>
            {
              name: "👮 Oficial Responsável",
              value: mencaoOficial,
              inline: true,
            },
            {
              name: "👤 Cidadão (ID)",
              value: `\`${idCidadao}\``,
              inline: true,
            },
            { name: "⠀", value: "⠀", inline: false },
            {
              name: "🔫 Armamento Base",
              value: `**${porteSelecionadoParaRecompra.arma}**`,
              inline: true,
            },
            {
              name: "📦 Itens Adquiridos",
              value: `\`${resumoItens}\``,
              inline: true,
            },
            {
              name: "💰 Valor Total",
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
          "success",
        );
        // Limpa formulário
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
      mostrarAlerta("Erro", "Erro de conexão.", "error");
    } finally {
      if (typeof mostrarCarregando === "function") mostrarCarregando(false);
    }
  });
}
// ==========================================
// 🔄 FUNÇÃO DE LOADING (GLOBAL)
// ==========================================
window.mostrarCarregando = (ativar) => {
  const overlay = document.getElementById("loading-overlay");

  if (!overlay) {
    console.warn("Elemento de loading não encontrado no HTML.");
    return;
  }

  if (ativar) {
    overlay.classList.remove("hidden");
  } else {
    overlay.classList.add("hidden");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  prepararSelectsCAT();

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
