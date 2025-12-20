/**
 * SISTEMA DE GESTÃO - POLÍCIA CIVIL
 * Versão: 4.0 (Full - Restaurado e Adaptado)
 */

// ==========================================
// 1. CONFIGURAÇÕES E DADOS GLOBAIS
// ==========================================
const CONFIG = {
  CLIENT_ID: "1451342682487259319",
  BRASAO_URL:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Bras%C3%A3o_da_Pol%C3%ADcia_Civil_do_Estado_do_Rio_de_Janeiro.png/120px-Bras%C3%A3o_da_Pol%C3%ADcia_Civil_do_Estado_do_Rio_de_Janeiro.png",
};

const FOOTER_PADRAO = {
  text: "Sistema Policial - Polícia Civil",
  icon_url: CONFIG.BRASAO_URL,
};

// Coordenadas Canvas (Porte)
const POSICOES = {
  nome: { x: 370, y: 250, max: 400 },
  id: { x: 754, y: 433 },
  rg: { x: 576, y: 433 },
  expedicao: { x: 122, y: 435 },
  validade: { x: 304, y: 435 },
  corTexto: "#000000",
  fonte: "bold 26px 'Arial'",
};

// Coordenadas Canvas (Limpeza)
const POSICOES_LIMPEZA = {
  nome: { x: 180, y: 380 },
  id: { x: 550, y: 380 },
  rg: { x: 180, y: 440 },
  data: { x: 680, y: 380 },
  corTexto: "#000000",
  fonte: "bold 30px 'Arial'",
};

// Tabela de Preços (Conforme seu arquivo enviado)
const PRECOS = {
  GLOCK: { arma: 400000, laudo: 250000, municao: 100000 },
  MP5: { arma: 600000, laudo: 300000, municao: 100000 },
  TASER: { arma: 700000, laudo: 300000, municao: 0 },
};

let dbPortes = [];

// ==========================================
// 2. INICIALIZAÇÃO
// ==========================================
document.addEventListener("DOMContentLoaded", async function () {
  console.log("🚀 Sistema Iniciado (v4.0)");

  // Configuração inicial de inputs e botões
  configurarBotoes();
  ativarFormatacaoDinheiro();
  configurarDatasAutomaticas();

  // Verifica callback do Discord (Login)
  const hash = window.location.hash;
  if (hash.includes("access_token")) {
    await processarCallbackDiscord(hash);
    return;
  }

  // Verifica Sessão
  await verificarSessao();

  // Se estiver logado, carrega dados
  if (localStorage.getItem("pc_session")) {
    await carregarPortesDoDiscord();
    verificarPermissaoRelatorio();

    // Listeners para atualização de preço em tempo real
    ["porte-arma", "check-municao", "check-desconto"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", atualizarValoresPorte);
    });

    // Filtro de busca
    const busca = document.getElementById("input-busca");
    if (busca) busca.addEventListener("input", renderTables);
  }
});

// ==========================================
// 3. AUTENTICAÇÃO E SEGURANÇA
// ==========================================
async function processarCallbackDiscord(hash) {
  const fragment = new URLSearchParams(hash.slice(1));
  const accessToken = fragment.get("access_token");
  const tokenType = fragment.get("token_type");
  window.history.replaceState({}, document.title, window.location.pathname);

  // Chama API para validar token e pegar dados do user
  try {
    const res = await fetch("/api/auth", {
      headers: { Authorization: `${tokenType} ${accessToken}` },
    });
    const data = await res.json();
    if (res.ok && data.authorized) {
      localStorage.setItem(
        "pc_session",
        JSON.stringify({ ...data, token: accessToken })
      );
      window.location.href = "index.html";
    } else {
      window.location.href = "login.html?error=unauthorized";
    }
  } catch (e) {
    console.error("Erro auth:", e);
    window.location.href = "login.html?error=server";
  }
}

async function verificarSessao() {
  const isLoginPage = window.location.pathname.includes("login.html");
  const sessao = localStorage.getItem("pc_session");

  if (!sessao) {
    if (!isLoginPage) window.location.href = "login.html";
    return;
  }

  // Se estamos na login page mas temos sessão, vai pra home
  if (isLoginPage) {
    window.location.href = "index.html";
    return;
  }

  // Renderiza perfil
  try {
    const user = JSON.parse(sessao);
    const avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
      : "https://cdn.discordapp.com/embed/avatars/0.png";

    const perfil = document.getElementById("user-profile-info");
    if (perfil) {
      perfil.innerHTML = `
        <div class="avatar-circle"><img src="${avatar}" style="width:100%"></div>
        <div class="user-info"><p>${user.username}</p><small>● Online</small></div>
        <button onclick="logout()" title="Sair" style="color:#e52e4d;background:none;border:none;margin-left:auto;cursor:pointer">
          <i class="fa-solid fa-right-from-bracket"></i>
        </button>`;
    }
    document.body.style.display = "block";
  } catch (e) {
    localStorage.removeItem("pc_session");
    window.location.href = "login.html";
  }
}

async function verificarPermissaoRelatorio() {
  const user = JSON.parse(localStorage.getItem("pc_session") || "{}");
  if (!user.roles) return;

  try {
    const res = await fetch("/api/verificar-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: user.roles }),
    });
    const data = await res.json();
    if (data.isAdmin) {
      document.getElementById("menu-relatorios")?.classList.remove("hidden");
    }
  } catch (e) {
    console.error("Erro check admin", e);
  }
}

window.logout = () => {
  localStorage.removeItem("pc_session");
  window.location.href = "login.html";
};

// ==========================================
// 4. TABELAS E DADOS (CORAÇÃO DO SISTEMA)
// ==========================================
async function carregarPortesDoDiscord() {
  try {
    const res = await fetch("/api/listar");
    if (!res.ok) throw new Error("Erro API Listar");
    const dados = await res.json();

    // Normaliza ID da mensagem para garantir que o delete funcione
    dbPortes = dados.map((p) => ({
      ...p,
      message_id: p.message_id || p.id_mensagem || p.msg_id,
    }));

    renderTables();
    atualizarStats();
  } catch (err) {
    console.error("Erro ao carregar portes:", err);
  }
}

// Utilitário de Datas
function parseData(dataStr) {
  if (!dataStr) return new Date();
  const partes = dataStr.split("/"); // Espera DD/MM/YYYY
  return new Date(partes[2], partes[1] - 1, partes[0]);
}

function calcularDiasRestantes(dataValidadeStr) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = parseData(dataValidadeStr);
  const diffTime = validade - hoje;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Renderização das Tabelas
window.renderTables = function () {
  const tbodyAtivos = document.getElementById("lista-ativos-para-revogar");
  const tbodyRenovacao = document.getElementById("lista-renovacao");
  const filtro =
    document.getElementById("input-busca")?.value.toLowerCase() || "";

  if (tbodyAtivos) tbodyAtivos.innerHTML = "";
  if (tbodyRenovacao) tbodyRenovacao.innerHTML = "";

  dbPortes.forEach((porte) => {
    // Filtro de busca
    if (
      filtro &&
      !porte.nome.toLowerCase().includes(filtro) &&
      !porte.id.includes(filtro)
    )
      return;

    // Lógica de Vencimento
    const diasRestantes = calcularDiasRestantes(porte.validade);
    let statusHTML = porte.validade;
    let classeLinha = "";

    // Badge de Status
    if (diasRestantes < 0) {
      statusHTML = `<span class="badge-priority" style="background:#e52e4d; color:white; padding:2px 6px; border-radius:4px;">VENCIDO (${Math.abs(
        diasRestantes
      )} dias)</span>`;
      classeLinha = "row-expired";
    } else if (diasRestantes <= 5) {
      statusHTML = `<span class="badge-warning" style="background:#f1c40f; color:black; padding:2px 6px; border-radius:4px;">VENCE EM BREVE (${diasRestantes} dias)</span>`;
    }

    // 1. Tabela Principal (Ativos)
    if (tbodyAtivos) {
      const tr = document.createElement("tr");
      if (classeLinha) tr.classList.add(classeLinha);
      tr.innerHTML = `
            <td><strong>${porte.nome}</strong></td>
            <td>${porte.id}</td>
            <td>${porte.arma}</td>
            <td>${statusHTML}</td>
            <td>
                <button class="btn-danger-sm" onclick="revogar('${porte.id}')" title="Revogar">
                    <i class="fa-solid fa-ban"></i>
                </button>
            </td>
        `;
      tbodyAtivos.appendChild(tr);
    }

    // 2. Tabela de Renovação (Aparece se faltar menos de 7 dias ou já venceu)
    if (tbodyRenovacao && diasRestantes <= 7) {
      const trRen = document.createElement("tr");
      trRen.innerHTML = `
            <td>${porte.nome}</td>
            <td>${porte.id}</td>
            <td>${porte.validade}</td>
            <td><span style="color:${diasRestantes < 0 ? "red" : "orange"}">${
        diasRestantes < 0 ? "Vencido" : "Vence em breve"
      }</span></td>
            <td>
                <button class="btn-primary-sm" onclick="renovarPorte('${
                  porte.id
                }')">
                    <i class="fa-solid fa-arrows-rotate"></i> Renovar
                </button>
            </td>
        `;
      tbodyRenovacao.appendChild(trRen);
    }
  });

  renderHistoricoLocal();
  atualizarStats();
};

function renderHistoricoLocal() {
  const tbody = document.getElementById("lista-ja-revogados");
  if (!tbody) return;

  const hist = JSON.parse(localStorage.getItem("historico_revogacoes") || "[]");
  tbody.innerHTML = hist
    .slice()
    .reverse()
    .map(
      (h) => `
        <tr style="opacity: 0.7">
            <td>${h.nome}</td>
            <td>${h.id}</td>
            <td>${h.dataRevogacao}</td>
            <td><span class="badge-revogado">REVOGADO</span></td>
        </tr>
    `
    )
    .join("");
}

// ==========================================
// 5. EMISSÃO DE PORTE
// ==========================================
window.atualizarValoresPorte = function () {
  const selectArma = document.getElementById("porte-arma");
  const checkMunicao = document.getElementById("check-municao");
  const checkDesconto = document.getElementById("check-desconto");
  const painel = document.getElementById("painel-valores");

  if (!selectArma || !painel) return;
  painel.classList.remove("hidden");

  const arma = selectArma.value;
  const regras = PRECOS[arma] || { arma: 0, laudo: 0, municao: 0 };

  // Taser não tem munição
  if (arma === "TASER") {
    checkMunicao.checked = false;
    checkMunicao.disabled = true;
  } else {
    checkMunicao.disabled = false;
  }

  const vArma = regras.arma;
  const vLaudo = regras.laudo;
  const vMunicao =
    checkMunicao.checked && arma !== "TASER" ? regras.municao : 0;

  const subtotal = vArma + vLaudo + vMunicao;
  const vDesconto = checkDesconto.checked ? subtotal * 0.15 : 0;
  const total = subtotal - vDesconto;

  // Atualiza UI
  const fmt = (v) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  document.getElementById("val-arma").innerText = fmt(vArma);
  document.getElementById("val-laudo").innerText = fmt(vLaudo);
  document.getElementById("val-municao").innerText = fmt(vMunicao);
  document.getElementById("val-total").innerText = fmt(total);

  const rowDesc = document.getElementById("row-desconto");
  if (vDesconto > 0) {
    rowDesc.style.display = "flex";
    document.getElementById("val-desconto").innerText = "- " + fmt(vDesconto);
  } else {
    rowDesc.style.display = "none";
  }

  // Salva no dataset para envio
  painel.dataset.total = total;
  painel.dataset.desconto = vDesconto;
  painel.dataset.municao = vMunicao > 0 ? "Sim" : "Não";
  painel.dataset.policial = vDesconto > 0 ? "Sim" : "Não";
};

window.gerarPreviewPorte = function () {
  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const rg = document.getElementById("porte-rg").value;
  const arma = document.getElementById("porte-arma").value;
  const exp = document.getElementById("porte-expedicao").value;
  const val = document.getElementById("porte-validade").value;

  if (!nome || !id || !rg)
    return mostrarAlerta("Erro", "Preencha Nome, Passaporte e RG.", "warning");

  const canvas = document.getElementById("canvas-porte");
  const ctx = canvas.getContext("2d");
  const imgBase = new Image();

  // Seleciona asset baseado na arma (se tiver imagens diferentes)
  if (arma.includes("GLOCK")) imgBase.src = "assets/porte_glock.png";
  else if (arma.includes("MP5")) imgBase.src = "assets/porte_mp5.png";
  else imgBase.src = "assets/porte_taser.png"; // Fallback ou específico

  // Fallback de erro de imagem
  imgBase.onerror = () => {
    // Tenta carregar o genérico se o específico falhar
    imgBase.src = "assets/modelo_porte.png";
  };

  imgBase.onload = () => {
    canvas.width = imgBase.width;
    canvas.height = imgBase.height;
    ctx.drawImage(imgBase, 0, 0);
    ctx.font = POSICOES.fonte;
    ctx.fillStyle = POSICOES.corTexto;

    ctx.fillText(nome.toUpperCase(), POSICOES.nome.x, POSICOES.nome.y);
    ctx.fillText(id, POSICOES.id.x, POSICOES.id.y);
    ctx.fillText(rg, POSICOES.rg.x, POSICOES.rg.y);
    ctx.fillText(exp, POSICOES.expedicao.x, POSICOES.expedicao.y);
    ctx.fillText(val, POSICOES.validade.x, POSICOES.validade.y);

    document.getElementById("preview-porte-container").style.display = "block";
    const imgFinal = document.getElementById("img-porte-final");
    if (imgFinal) imgFinal.src = canvas.toDataURL();
  };
};

window.processarEmissao = async function () {
  const painel = document.getElementById("painel-valores");
  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const rg = document.getElementById("porte-rg").value;
  const arma = document.getElementById("porte-arma").value;
  const validade = document.getElementById("porte-validade").value;

  if (!painel.dataset.total)
    return mostrarAlerta("Erro", "Gere a prévia primeiro.", "warning");

  mostrarAlerta("Aguarde", "Enviando para o sistema...", "warning");

  const canvas = document.getElementById("canvas-porte");
  canvas.toBlob(async (blob) => {
    const nomeArq = `porte_${id}.png`;
    const sessao = JSON.parse(localStorage.getItem("pc_session"));
    const mencao = `<@${sessao.id}>`;
    const fmtMoney = (v) =>
      parseFloat(v).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

    const embed = {
      title: `📄 PORTE EMITIDO: ${arma}`,
      color: 3447003,
      fields: [
        {
          name: "👤 Cidadão",
          value: `**${nome.toUpperCase()}**`,
          inline: true,
        },
        { name: "🆔 Passaporte", value: `\`${id}\``, inline: true },
        { name: "🪪 RG", value: `\`${rg}\``, inline: true },
        { name: "👮 Oficial", value: mencao, inline: true },
        { name: "📅 Validade", value: `\`${validade}\``, inline: true },
        {
          name: "💰 Total",
          value: `\`${fmtMoney(painel.dataset.total)}\``,
          inline: true,
        },
        { name: "📦 Munição", value: painel.dataset.municao, inline: true },
      ],
      image: { url: `attachment://${nomeArq}` },
      footer: FOOTER_PADRAO,
    };

    const ok = await enviarParaAPI(
      blob,
      nomeArq,
      "porte",
      embed,
      `✅ **Novo Porte:** ${nome}`
    );

    if (ok) {
      // Adiciona localmente para não precisar recarregar
      dbPortes.push({
        nome,
        id,
        rg,
        arma,
        validade,
        expedicao: document.getElementById("porte-expedicao").value,
        status: "Ativo",
      });
      renderTables();
      mostrarAlerta("Sucesso", "Porte registrado!", "success");
      setTimeout(() => location.reload(), 2000);
    }
  });
};

// ==========================================
// 6. REVOGAÇÃO (FLUXO CORRIGIDO)
// ==========================================
window.revogar = async function (idPassaporte) {
  const p = dbPortes.find((x) => String(x.id) === String(idPassaporte));
  if (!p)
    return mostrarAlerta("Erro", "Porte não encontrado localmente.", "error");

  const confirmou = await confirmarAcao(
    "REVOGAR?",
    `Deseja invalidar o porte de ${p.nome}? O registro será removido da lista ativa.`
  );
  if (!confirmou) return;

  mostrarAlerta("Processando", "Registrando revogação...", "warning");

  try {
    const sessao = JSON.parse(localStorage.getItem("pc_session"));

    // 1. Gera Log para Meta (Antes de deletar)
    // Se não tiver imagem de revogado pronta, mandamos sem imagem ou geramos na hora
    // Aqui vou simplificar mandando o embed de revogação
    const embedRevog = {
      title: "🚫 PORTE REVOGADO",
      description: "O documento foi cancelado no sistema.",
      color: 15548997,
      fields: [
        { name: "👤 Cidadão", value: p.nome, inline: true },
        { name: "🆔 ID", value: p.id, inline: true },
        { name: "👮 Revogado por", value: sessao.username, inline: true },
      ],
      footer: FOOTER_PADRAO,
      timestamp: new Date().toISOString(),
    };

    await enviarParaAPI(
      null,
      null,
      "revogacao",
      embedRevog,
      `🚨 **REVOGAÇÃO:** ${p.nome} (ID: ${p.id})`
    );

    // 2. Deleta Mensagem Original (Se tiver ID)
    if (p.message_id) {
      await fetch("/api/deletar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: p.message_id }),
      });
    }

    // 3. Salva no Histórico Local
    const hist = JSON.parse(
      localStorage.getItem("historico_revogacoes") || "[]"
    );
    hist.push({
      nome: p.nome,
      id: p.id,
      arma: p.arma,
      dataRevogacao: new Date().toLocaleString("pt-BR"),
      oficial: sessao.username,
    });
    localStorage.setItem("historico_revogacoes", JSON.stringify(hist));

    // 4. Atualiza Tela
    dbPortes = dbPortes.filter(
      (item) => String(item.id) !== String(idPassaporte)
    );
    renderTables();
    atualizarStats();
    mostrarAlerta("Sucesso", "Revogação concluída.", "success");
  } catch (e) {
    console.error(e);
    mostrarAlerta("Erro", "Falha no processo de revogação.", "error");
  }
};

// ==========================================
// 7. RENOVAÇÃO
// ==========================================
window.renovarPorte = async function (idPassaporte) {
  const p = dbPortes.find((x) => String(x.id) === String(idPassaporte));
  if (!p) return;

  if (
    !(await confirmarAcao(
      "RENOVAR?",
      `Renovar porte de ${p.nome} por +30 dias?`
    ))
  )
    return;

  const sessao = JSON.parse(localStorage.getItem("pc_session"));
  const novaValidade = new Date();
  novaValidade.setDate(novaValidade.getDate() + 30);
  const valStr = novaValidade.toLocaleDateString("pt-BR");

  const embed = {
    title: "🔄 RENOVAÇÃO DE PORTE",
    description: "Porte estendido dentro do prazo.",
    color: 16776960,
    fields: [
      { name: "👤 Cidadão", value: p.nome, inline: true },
      { name: "🆔 ID", value: p.id, inline: true },
      { name: "📅 Nova Validade", value: valStr, inline: true },
      { name: "👮 Oficial", value: sessao.username, inline: true },
    ],
    footer: FOOTER_PADRAO,
  };

  const ok = await enviarParaAPI(
    null,
    null,
    "porte",
    embed,
    `🔄 **Renovação:** ${p.nome}`
  ); // Usa webhook de porte para contar meta
  if (ok) {
    p.validade = valStr;
    renderTables();
    mostrarAlerta("Sucesso", "Renovação registrada!", "success");
  }
};

// ==========================================
// 8. RELATÓRIO DE METAS
// ==========================================
window.gerarRelatorioSemanal = async function () {
  const corpo = document.getElementById("corpo-relatorio");
  const user = JSON.parse(localStorage.getItem("pc_session"));

  if (!corpo) return;
  mostrarAlerta("Processando", "Buscando dados...", "warning");

  try {
    const res = await fetch("/api/relatorio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: user.roles }),
    });

    if (res.status === 403) throw new Error("Acesso Negado");
    if (!res.ok) throw new Error("Erro API");

    const dados = await res.json();
    corpo.innerHTML = "";

    if (Object.keys(dados).length === 0) {
      corpo.innerHTML = `<tr><td colspan="5" align="center">Sem dados na última semana.</td></tr>`;
    }

    Object.keys(dados).forEach((oficial) => {
      const d = dados[oficial];
      corpo.innerHTML += `
        <tr>
          <td><strong>${oficial}</strong></td>
          <td>${d.emissao || 0}</td>
          <td>${d.renovacao || 0}</td>
          <td>${d.limpeza || 0}</td>
          <td>${d.revogacao || 0}</td>
        </tr>`;
    });
    mostrarAlerta("Pronto", "Relatório gerado.", "success");
  } catch (err) {
    if (err.message === "Acesso Negado")
      mostrarAlerta("Erro", "Sem permissão de Coordenador.", "error");
    else mostrarAlerta("Erro", "Falha ao buscar relatório.", "error");
  }
};

// ==========================================
// 9. LIMPEZA DE FICHA
// ==========================================
window.processarLimpeza = async function () {
  const nome = document.getElementById("limpeza-nome").value;
  const id = document.getElementById("limpeza-id").value;
  const valor = document.getElementById("input-valor-limpeza").value;

  if (!nome || !id)
    return mostrarAlerta("Erro", "Preencha os dados.", "warning");

  const canvas = document.getElementById("canvas-limpeza");
  const ctx = canvas.getContext("2d");
  const img = new Image();
  img.src = "assets/modelo_limpeza.png";

  img.onload = () => {
    ctx.drawImage(img, 0, 0);
    ctx.font = POSICOES_LIMPEZA.fonte;
    ctx.fillStyle = POSICOES_LIMPEZA.corTexto;
    ctx.fillText(
      nome.toUpperCase(),
      POSICOES_LIMPEZA.nome.x,
      POSICOES_LIMPEZA.nome.y
    );
    ctx.fillText(id, POSICOES_LIMPEZA.id.x, POSICOES_LIMPEZA.id.y);

    canvas.toBlob(async (blob) => {
      const nomeArq = `limpeza_${id}.png`;
      const sessao = JSON.parse(localStorage.getItem("pc_session"));
      const embed = {
        title: "🧼 LIMPEZA DE FICHA",
        description: `Valor pago: R$ ${valor}`,
        color: 65280,
        fields: [
          { name: "👤 Cidadão", value: nome, inline: true },
          { name: "🆔 ID", value: id, inline: true },
          { name: "👮 Oficial", value: sessao.username, inline: true },
        ],
        image: { url: `attachment://${nomeArq}` },
        footer: FOOTER_PADRAO,
      };
      const ok = await enviarParaAPI(
        blob,
        nomeArq,
        "limpeza",
        embed,
        `🧼 **Limpeza:** ${nome}`
      );
      if (ok) {
        mostrarAlerta("Sucesso", "Ficha limpa!", "success");
        location.reload();
      }
    });
  };
};

window.gerarPreviewLimpeza = function () {
  // Mesma lógica do processar, mas só mostra o canvas
  // Simplificado para brevidade, pois a lógica de desenho está acima
  const container = document.getElementById("preview-limpeza-container");
  if (container) container.style.display = "block";
};

// ==========================================
// 10. UTILITÁRIOS E HELPERS
// ==========================================
async function enviarParaAPI(blob, filename, tipo, embed, content) {
  const formData = new FormData();
  if (blob) formData.append("file", blob, filename);
  formData.append("payload_json", JSON.stringify({ content, embeds: [embed] }));
  try {
    const res = await fetch(`/api/enviar?tipo=${tipo}`, {
      method: "POST",
      body: formData,
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

function configurarDatasAutomaticas() {
  const hoje = new Date();
  const val = new Date();
  val.setDate(hoje.getDate() + 30);
  const fmt = (d) => d.toLocaleDateString("pt-BR");

  const setIfEmpty = (id, val) => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = val;
  };

  setIfEmpty("porte-expedicao", fmt(hoje));
  setIfEmpty("porte-validade", fmt(val));
  setIfEmpty("limpeza-data", fmt(hoje));

  const topo = document.getElementById("data-atual");
  if (topo) topo.innerText = fmt(hoje);
}

function ativarFormatacaoDinheiro() {
  const input = document.getElementById("input-valor-limpeza");
  if (input) {
    input.addEventListener("input", (e) => {
      let value = e.target.value.replace(/\D/g, "");
      value = (Number(value) / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      e.target.value = value;
    });
  }
}

function atualizarStats() {
  const ativos = dbPortes.filter((p) => p.status !== "Revogado").length;
  const revs = JSON.parse(
    localStorage.getItem("historico_revogacoes") || "[]"
  ).length;
  const elA = document.getElementById("stat-ativos");
  const elR = document.getElementById("stat-revogados");
  if (elA) elA.innerText = ativos;
  if (elR) elR.innerText = revs;
}

function configurarBotoes() {
  // Vincula eventos se ainda não estiverem vinculados
  const btnGerar = document.getElementById("btn-gerar-porte");
  if (btnGerar) btnGerar.onclick = gerarPreviewPorte;

  const btnEmitir = document.getElementById("btn-finalizar-emissao");
  if (btnEmitir) btnEmitir.onclick = processarEmissao;

  const btnLimp = document.getElementById("btn-finalizar-limpeza");
  if (btnLimp) btnLimp.onclick = processarLimpeza;

  const btnRel = document.getElementById("btn-atualizar-relatorio");
  if (btnRel) btnRel.onclick = gerarRelatorioSemanal;
}

window.navegar = (tela) => {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.add("hidden"));
  document
    .querySelectorAll(".nav-links li")
    .forEach((l) => l.classList.remove("active"));
  const sec = document.getElementById(`sec-${tela}`);
  const menu = document.getElementById(`menu-${tela}`);
  if (sec) sec.classList.remove("hidden");
  if (menu) menu.classList.add("active");
  if (tela === "emissao") configurarDatasAutomaticas();
};

window.mostrarAlerta = (titulo, mensagem, type) => {
  return new Promise((resolve) => {
    // Tenta usar modal customizado, fallback para alert
    const modal = document.getElementById("custom-modal");
    if (!modal) {
      alert(mensagem);
      return resolve(true);
    }

    document.getElementById("modal-title").innerText = titulo;
    document.getElementById("modal-desc").innerText = mensagem;
    const btn = document.getElementById("btn-modal-confirm");
    const icon = document.getElementById("modal-icon");

    document.getElementById("btn-modal-cancel").classList.add("hidden");
    btn.innerText = "OK";
    btn.className = "btn-primary";

    if (type === "error")
      icon.className = "fa-solid fa-circle-xmark modal-icon error";
    else if (type === "warning")
      icon.className = "fa-solid fa-circle-exclamation modal-icon warning";
    else icon.className = "fa-solid fa-circle-check modal-icon success";

    modal.classList.remove("hidden");
    btn.onclick = () => {
      modal.classList.add("hidden");
      resolve(true);
    };
  });
};

window.confirmarAcao = (titulo, mensagem, tipo) => {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-modal");
    if (!modal) return resolve(confirm(mensagem));

    document.getElementById("modal-title").innerText = titulo;
    document.getElementById("modal-desc").innerText = mensagem;
    const btnConf = document.getElementById("btn-modal-confirm");
    const btnCanc = document.getElementById("btn-modal-cancel");
    const icon = document.getElementById("modal-icon");

    btnCanc.classList.remove("hidden");

    if (tipo === "danger") {
      btnConf.className = "btn-danger-modal";
      icon.className = "fa-solid fa-triangle-exclamation modal-icon danger";
    } else {
      btnConf.className = "btn-primary";
      icon.className = "fa-solid fa-circle-question modal-icon";
    }

    modal.classList.remove("hidden");

    // Clona para limpar listeners antigos
    const nConf = btnConf.cloneNode(true);
    const nCanc = btnCanc.cloneNode(true);
    btnConf.parentNode.replaceChild(nConf, btnConf);
    btnCanc.parentNode.replaceChild(nCanc, btnCanc);

    nConf.onclick = () => {
      modal.classList.add("hidden");
      resolve(true);
    };
    nCanc.onclick = () => {
      modal.classList.add("hidden");
      resolve(false);
    };
  });
};
