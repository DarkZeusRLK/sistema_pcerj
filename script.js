/**
 * SISTEMA DE GESTÃO - POLÍCIA CIVIL
 * Versão: 3.0 (Completa - Restaurada)
 */

// ==========================================
// 1. CONFIGURAÇÕES E CONSTANTES
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

// Canvas: Porte
const POSICOES = {
  nome: { x: 370, y: 250, max: 400 },
  id: { x: 754, y: 433 },
  rg: { x: 576, y: 433 },
  expedicao: { x: 122, y: 435 },
  validade: { x: 304, y: 435 },
  corTexto: "#000000",
  fonte: "bold 26px 'Arial'",
};

// Canvas: Limpeza
const POSICOES_LIMPEZA = {
  nome: { x: 180, y: 380 },
  id: { x: 550, y: 380 },
  rg: { x: 180, y: 440 },
  data: { x: 680, y: 380 },
  corTexto: "#000000",
  fonte: "bold 30px 'Arial'",
};

// Tabela de Preços
const PRECOS = {
  "Glock-18": { arma: 40000, laudo: 10000, municao: 5000 },
  "Colt-45": { arma: 60000, laudo: 15000, municao: 7000 },
  "Desert Eagle": { arma: 100000, laudo: 25000, municao: 12000 },
  Fuzil: { arma: 250000, laudo: 50000, municao: 20000 },
  Taser: { arma: 15000, laudo: 5000, municao: 0 },
};

let dbPortes = [];

// ==========================================
// 2. INICIALIZAÇÃO E EVENTOS
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  console.log("Sistema Iniciado. Carregando módulos...");

  verificarSessao();
  carregarPortesDoDiscord();
  configurarDatasAutomaticas();
  verificarPermissaoRelatorio(); // Nova função de segurança

  // Event Listeners (Vínculo seguro)
  const bind = (id, evento, callback) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(evento, callback);
  };

  // Botões Emissão
  bind("btn-gerar-porte", "click", gerarPreviewPorte);
  bind("btn-finalizar-emissao", "click", processarEmissao);

  // Botões Limpeza
  bind("btn-gerar-limpeza", "click", gerarPreviewLimpeza);
  bind("btn-finalizar-limpeza", "click", processarLimpeza);

  // Botão Relatório (Novo)
  bind("btn-atualizar-relatorio", "click", gerarRelatorioSemanal);

  // Inputs de Cálculo (Atualização em tempo real)
  ["porte-arma", "check-municao", "check-desconto"].forEach((id) => {
    bind(id, "change", atualizarValoresPorte);
  });

  // Input de Busca
  bind("input-busca", "input", renderTables);

  // Máscara de dinheiro na limpeza
  const inputValorLimp = document.getElementById("input-valor-limpeza");
  if (inputValorLimp) {
    inputValorLimp.addEventListener("input", (e) => {
      let value = e.target.value.replace(/\D/g, "");
      value = (Number(value) / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      e.target.value = value;
    });
  }
});

// ==========================================
// 3. SEGURANÇA E SESSÃO
// ==========================================
function verificarSessao() {
  const sessao = localStorage.getItem("pc_session");
  const isLogin = window.location.pathname.includes("login.html");

  if (!sessao) {
    if (!isLogin) window.location.href = "login.html";
    return;
  }

  const user = JSON.parse(sessao);
  const perfilDiv = document.getElementById("user-profile-info");

  if (perfilDiv) {
    const avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
      : "https://cdn.discordapp.com/embed/avatars/0.png";

    perfilDiv.innerHTML = `
      <div class="avatar-circle"><img src="${avatar}"></div>
      <div class="user-info"><p>${user.username}</p><small>● Online</small></div>
      <button onclick="logout()" class="btn-logout" title="Sair"><i class="fa-solid fa-right-from-bracket"></i></button>`;
  }
}

async function verificarPermissaoRelatorio() {
  const user = JSON.parse(localStorage.getItem("pc_session") || "{}");
  if (!user.roles) return;

  try {
    // Verifica no Backend se o cargo é Admin/Coordenador
    const res = await fetch("/api/verificar-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: user.roles }),
    });
    const data = await res.json();

    if (data.isAdmin) {
      const menu = document.getElementById("menu-relatorios");
      if (menu) menu.classList.remove("hidden");
    }
  } catch (e) {
    console.error("Erro auth admin:", e);
  }
}

window.logout = () => {
  localStorage.removeItem("pc_session");
  window.location.href = "login.html";
};

// ==========================================
// 4. GESTÃO DE DADOS (Listagem e Tabelas)
// ==========================================
async function carregarPortesDoDiscord() {
  try {
    const res = await fetch("/api/listar");
    if (!res.ok) throw new Error("Erro API");

    const dados = await res.json();
    // Garante compatibilidade de ID
    dbPortes = dados.map((p) => ({
      ...p,
      message_id: p.message_id || p.id_mensagem || p.msg_id,
    }));

    renderTables();
    atualizarStats();
  } catch (err) {
    console.error(err);
  }
}

function calcularDiasCorridos(dataExpedicaoStr) {
  if (!dataExpedicaoStr) return 0;
  const partes = dataExpedicaoStr.split("/");
  // Data no formato PT-BR para objeto Date
  const expedicao = new Date(partes[2], partes[1] - 1, partes[0]);
  const hoje = new Date();

  const diffTime = Math.abs(hoje - expedicao);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function renderTables() {
  const tbodyAtivos = document.getElementById("lista-ativos-para-revogar");
  const tbodyRenovacao = document.getElementById("lista-renovacao"); // Se houver tabela separada
  const filtro =
    document.getElementById("input-busca")?.value.toLowerCase() || "";

  if (tbodyAtivos) {
    tbodyAtivos.innerHTML = "";

    const lista = dbPortes.filter(
      (p) =>
        !filtro ||
        p.nome.toLowerCase().includes(filtro) ||
        p.id.includes(filtro)
    );

    lista.forEach((p) => {
      const dias = calcularDiasCorridos(p.expedicao);
      let statusHTML = p.validade;

      // Lógica de Vencimento (Badges)
      if (dias > 33) {
        statusHTML = `<span class="badge-priority"><i class="fa-solid fa-triangle-exclamation"></i> EXPIRADO</span>`;
      } else if (dias >= 30) {
        statusHTML = `<span class="badge-warning">VENCE HOJE/GRACE</span>`;
      }

      // Botão Renovar só aparece se estiver no prazo (30+ dias)
      let btnRenovar = "";
      if (dias >= 28) {
        btnRenovar = `<button class="btn-primary-sm" onclick="renovarPorte('${p.id}')" title="Renovar"><i class="fa-solid fa-arrows-rotate"></i></button>`;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${p.nome}</strong></td>
        <td>${p.id}</td>
        <td>${p.arma}</td>
        <td>${statusHTML}</td>
        <td style="display:flex; gap:5px;">
          ${btnRenovar}
          <button class="btn-danger-sm" onclick="revogar('${p.id}')" title="Revogar"><i class="fa-solid fa-ban"></i></button>
        </td>`;
      tbodyAtivos.appendChild(tr);
    });
  }

  // Histórico Local
  const tbodyHist = document.getElementById("lista-ja-revogados");
  if (tbodyHist) {
    const hist = JSON.parse(
      localStorage.getItem("historico_revogacoes") || "[]"
    );
    tbodyHist.innerHTML = hist
      .slice()
      .reverse()
      .map(
        (h) => `
      <tr style="opacity:0.8">
        <td>${h.nome}</td>
        <td>${h.id}</td>
        <td>${h.dataRevogacao}</td>
        <td><span class="badge-revogado">REVOGADO POR ${
          h.oficial || "Sistema"
        }</span></td>
      </tr>`
      )
      .join("");
  }
}

function atualizarStats() {
  const elA = document.getElementById("stat-ativos");
  const elR = document.getElementById("stat-revogados");
  if (elA) elA.innerText = dbPortes.length;
  if (elR)
    elR.innerText = JSON.parse(
      localStorage.getItem("historico_revogacoes") || "[]"
    ).length;
}

// ==========================================
// 5. EMISSÃO (Lógica Completa)
// ==========================================
window.atualizarValoresPorte = () => {
  const elArma = document.getElementById("porte-arma");
  if (!elArma) return;

  const arma = elArma.value;
  const municao = document.getElementById("check-municao").checked;
  const desconto = document.getElementById("check-desconto").checked;
  const dados = PRECOS[arma];

  if (arma === "Taser") {
    document.getElementById("check-municao").checked = false;
    document.getElementById("check-municao").disabled = true;
  } else {
    document.getElementById("check-municao").disabled = false;
  }

  const vArma = dados.arma;
  const vLaudo = dados.laudo;
  const vMunicao = arma !== "Taser" && municao ? dados.municao : 0;

  const subtotal = vArma + vLaudo + vMunicao;
  const valDesconto = desconto ? subtotal * 0.15 : 0;
  const total = subtotal - valDesconto;

  const container = document.getElementById("valores-container");
  if (container) {
    container.innerHTML = `
      <div class="price-row"><span>Armamento (${arma})</span><span>R$ ${vArma.toLocaleString()}</span></div>
      <div class="price-row"><span>Exame/Laudo</span><span>R$ ${vLaudo.toLocaleString()}</span></div>
      ${
        vMunicao > 0
          ? `<div class="price-row"><span>Munição</span><span>R$ ${vMunicao.toLocaleString()}</span></div>`
          : ""
      }
      ${
        valDesconto > 0
          ? `<div class="price-row discount"><span>Desconto Policial (15%)</span><span>- R$ ${valDesconto.toLocaleString()}</span></div>`
          : ""
      }
    `;
  }
  document.getElementById(
    "total-valor"
  ).innerText = `R$ ${total.toLocaleString()}`;

  const painel = document.getElementById("painel-valores");
  painel.dataset.total = total;
  painel.dataset.municao = municao ? "Sim" : "Não";
};

async function gerarPreviewPorte() {
  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const rg = document.getElementById("porte-rg").value;
  const exp = document.getElementById("porte-expedicao").value;
  const val = document.getElementById("porte-validade").value;

  if (!nome || !id || !rg)
    return mostrarAlerta(
      "Dados Incompletos",
      "Preencha Nome, ID e RG.",
      "warning"
    );

  const canvas = document.getElementById("canvas-porte");
  const ctx = canvas.getContext("2d");
  const img = new Image();
  img.src = "assets/modelo_porte.png";

  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    ctx.font = POSICOES.fonte;
    ctx.fillStyle = POSICOES.corTexto;

    ctx.fillText(nome.toUpperCase(), POSICOES.nome.x, POSICOES.nome.y);
    ctx.fillText(id, POSICOES.id.x, POSICOES.id.y);
    ctx.fillText(rg, POSICOES.rg.x, POSICOES.rg.y);
    ctx.fillText(exp, POSICOES.expedicao.x, POSICOES.expedicao.y);
    ctx.fillText(val, POSICOES.validade.x, POSICOES.validade.y);

    document.getElementById("preview-porte-container").style.display = "block";
    mostrarAlerta("Sucesso", "Prévia gerada. Confira os dados.", "success");
  };
  img.onerror = () =>
    mostrarAlerta("Erro", "Imagem base não encontrada.", "error");
}

async function processarEmissao() {
  const painel = document.getElementById("painel-valores");
  if (!painel.dataset.total)
    return mostrarAlerta(
      "Erro",
      "Gere a prévia para calcular valores.",
      "warning"
    );

  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const rg = document.getElementById("porte-rg").value;
  const arma = document.getElementById("porte-arma").value;
  const validade = document.getElementById("porte-validade").value;

  mostrarAlerta("Processando", "Enviando registro...", "warning");

  const canvas = document.getElementById("canvas-porte");
  canvas.toBlob(async (blob) => {
    const nomeArq = `porte_${id}.png`;
    const sessao = JSON.parse(localStorage.getItem("pc_session"));
    const mencao = sessao.id ? `<@${sessao.id}>` : `**${sessao.username}**`;

    const embed = {
      title: `📄 EMISSÃO DE PORTE: ${arma.toUpperCase()}`,
      color: 3447003,
      fields: [
        { name: "👤 Cidadão", value: nome.toUpperCase(), inline: true },
        { name: "🆔 ID", value: id, inline: true },
        { name: "🪪 RG", value: rg, inline: true },
        { name: "📅 Validade", value: validade, inline: true },
        { name: "📦 Munição", value: painel.dataset.municao, inline: true },
        {
          name: "💰 Total",
          value: `R$ ${parseInt(painel.dataset.total).toLocaleString()}`,
          inline: true,
        },
        { name: "👮 Oficial", value: mencao, inline: false },
      ],
      image: { url: `attachment://${nomeArq}` },
      footer: FOOTER_PADRAO,
    };

    const ok = await enviarParaAPI(
      blob,
      nomeArq,
      "porte",
      embed,
      `✅ **Novo Porte Emitido:** ${nome}`
    );
    if (ok) {
      await mostrarAlerta("Sucesso", "Porte emitido e meta salva!", "success");
      location.reload();
    }
  });
}

// ==========================================
// 6. LIMPEZA DE FICHA
// ==========================================
async function gerarPreviewLimpeza() {
  const nome = document.getElementById("limpeza-nome").value;
  const id = document.getElementById("limpeza-id").value;
  const rg = document.getElementById("limpeza-rg").value;
  const data = document.getElementById("limpeza-data").value;

  if (!nome || !id)
    return mostrarAlerta(
      "Atenção",
      "Preencha os campos obrigatórios.",
      "warning"
    );

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
    ctx.fillText(rg, POSICOES_LIMPEZA.rg.x, POSICOES_LIMPEZA.rg.y);
    ctx.fillText(data, POSICOES_LIMPEZA.data.x, POSICOES_LIMPEZA.data.y);
    document.getElementById("preview-limpeza-container").style.display =
      "block";
  };
}

async function processarLimpeza() {
  const nome = document.getElementById("limpeza-nome").value;
  const id = document.getElementById("limpeza-id").value;

  mostrarAlerta("Processando", "Registrando limpeza...", "warning");
  const canvas = document.getElementById("canvas-limpeza");

  canvas.toBlob(async (blob) => {
    const nomeArq = `limpeza_${id}.png`;
    const sessao = JSON.parse(localStorage.getItem("pc_session"));
    const embed = {
      title: "🧼 LIMPEZA DE FICHA",
      description: "Antecedentes criminais removidos.",
      color: 65280,
      fields: [
        { name: "👤 Cidadão", value: nome.toUpperCase(), inline: true },
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
      await mostrarAlerta("Sucesso", "Limpeza registrada!", "success");
      location.reload();
    }
  });
}

// ==========================================
// 7. REVOGAÇÃO (DELETE MSG + LOG META)
// ==========================================
window.revogar = async function (idPassaporte) {
  const p = dbPortes.find((x) => String(x.id) === String(idPassaporte));
  if (!p) return mostrarAlerta("Erro", "Porte não encontrado.", "error");

  const ok = await confirmarAcao(
    "REVOGAR?",
    `Revogar porte de ${p.nome}? O registo visual será apagado, mas a meta mantida.`,
    "danger"
  );
  if (!ok) return;

  mostrarAlerta("Aguarde", "Atualizando sistema...", "warning");

  try {
    const sessao = JSON.parse(localStorage.getItem("pc_session"));
    const mencao = sessao.id ? `<@${sessao.id}>` : sessao.username;

    // 1. LOG DE REVOGAÇÃO (Salva a meta)
    const embedRevog = {
      title: "🚫 PORTE REVOGADO",
      color: 15548997,
      fields: [
        { name: "👤 Cidadão", value: p.nome, inline: true },
        { name: "🆔 ID", value: p.id, inline: true },
        { name: "👮 Revogado por", value: mencao, inline: true },
      ],
      footer: FOOTER_PADRAO,
      timestamp: new Date().toISOString(),
    };

    await fetch("/api/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "revogacao",
        embed: embedRevog,
        content: `🚨 **Revogação:** ${p.nome} (ID: ${p.id})`,
      }),
    });

    // 2. DELETE DA MENSAGEM ORIGINAL (Limpeza Visual)
    if (p.message_id) {
      await fetch("/api/deletar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: p.message_id }),
      });
    }

    // 3. HISTÓRICO LOCAL
    const hist = JSON.parse(
      localStorage.getItem("historico_revogacoes") || "[]"
    );
    hist.push({
      nome: p.nome,
      id: p.id,
      dataRevogacao: new Date().toLocaleString(),
      oficial: sessao.username,
    });
    localStorage.setItem("historico_revogacoes", JSON.stringify(hist));

    // 4. ATUALIZAR UI
    dbPortes = dbPortes.filter(
      (item) => String(item.id) !== String(idPassaporte)
    );
    renderTables();
    atualizarStats();
    mostrarAlerta("Sucesso", "Porte revogado!", "success");
  } catch (err) {
    mostrarAlerta("Erro", "Falha na comunicação.", "error");
  }
};

// ==========================================
// 8. RENOVAÇÃO DE PORTE (Restaurada)
// ==========================================
window.renovarPorte = async function (idPassaporte) {
  const p = dbPortes.find((x) => String(x.id) === String(idPassaporte));
  if (!p) return;

  if (
    !(await confirmarAcao(
      "RENOVAR?",
      `Renovar o porte de ${p.nome} por +30 dias?`
    ))
  )
    return;

  mostrarAlerta("Processando", "Registrando renovação...", "warning");

  const sessao = JSON.parse(localStorage.getItem("pc_session"));
  const mencao = sessao.id ? `<@${sessao.id}>` : sessao.username;

  // Data Nova (+30 dias)
  const novaData = new Date();
  novaData.setDate(novaData.getDate() + 30);
  const dataStr = novaData.toLocaleDateString("pt-BR");

  const embed = {
    title: "🔄 RENOVAÇÃO DE PORTE",
    description: "O porte foi estendido dentro do prazo legal.",
    color: 16776960, // Amarelo
    fields: [
      { name: "👤 Cidadão", value: p.nome, inline: true },
      { name: "🆔 ID", value: p.id, inline: true },
      { name: "📅 Nova Validade", value: dataStr, inline: true },
      { name: "👮 Oficial", value: mencao, inline: false },
    ],
    footer: FOOTER_PADRAO,
  };

  const ok = await enviarParaAPI(
    null,
    null,
    "porte",
    embed,
    `🔄 **Renovação:** ${p.nome}`
  );
  if (ok) {
    mostrarAlerta("Sucesso", "Renovação registrada na meta!", "success");
    // Aqui idealmente você deletaria o antigo e emitiria um novo se quiser atualizar a imagem,
    // mas apenas logar a renovação já conta para a meta.
  }
};

// ==========================================
// 9. RELATÓRIOS (METAS)
// ==========================================
window.gerarRelatorioSemanal = async function () {
  const corpo = document.getElementById("corpo-relatorio");
  const user = JSON.parse(localStorage.getItem("pc_session"));

  if (!corpo) return;
  mostrarAlerta("Aguarde", "Gerando relatório de produtividade...", "warning");

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
      corpo.innerHTML = `<tr><td colspan="5" align="center">Sem dados recentes.</td></tr>`;
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
    mostrarAlerta("Pronto", "Relatório atualizado.", "success");
  } catch (e) {
    if (e.message === "Acesso Negado")
      mostrarAlerta("Erro", "Permissão insuficiente.", "error");
    else mostrarAlerta("Erro", "Falha ao gerar relatório.", "error");
  }
};

// ==========================================
// 10. UTILITÁRIOS (API, Navegação, Modais)
// ==========================================
async function enviarParaAPI(blob, fileName, type, embed, content) {
  const formData = new FormData();
  if (blob) formData.append("file", blob, fileName);
  formData.append("type", type);
  formData.append("embed", JSON.stringify(embed));
  formData.append("content", content);

  try {
    const res = await fetch("/api/enviar", { method: "POST", body: formData });
    return res.ok;
  } catch (e) {
    return false;
  }
}

window.navegar = (tela) => {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.add("hidden"));
  document
    .querySelectorAll(".nav-links li")
    .forEach((l) => l.classList.remove("active"));

  const target = document.getElementById(`sec-${tela}`);
  const menu = document.getElementById(`menu-${tela}`);
  if (target) target.classList.remove("hidden");
  if (menu) menu.classList.add("active");

  if (tela === "emissao" || tela === "limpeza") configurarDatasAutomaticas();
};

function configurarDatasAutomaticas() {
  const hoje = new Date();
  const val = new Date();
  val.setDate(hoje.getDate() + 30);
  const fmt = (d) => d.toLocaleDateString("pt-BR");

  const inputs = {
    "porte-expedicao": hoje,
    "porte-validade": val,
    "limpeza-data": hoje,
  };

  for (const [id, date] of Object.entries(inputs)) {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = fmt(date);
  }

  const topo = document.getElementById("data-atual");
  if (topo) topo.innerText = fmt(hoje);
}

// Modal Customizado
window.confirmarAcao = (titulo, mensagem, tipo) => {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-modal");
    if (!modal) return resolve(confirm(mensagem));

    const elements = {
      title: document.getElementById("modal-title"),
      desc: document.getElementById("modal-desc"),
      icon: document.getElementById("modal-icon"),
      btnConfirm: document.getElementById("btn-modal-confirm"),
      btnCancel: document.getElementById("btn-modal-cancel"),
    };

    elements.title.innerText = titulo;
    elements.desc.innerText = mensagem;
    elements.btnCancel.classList.remove("hidden");

    if (tipo === "danger") {
      elements.icon.className =
        "fa-solid fa-triangle-exclamation modal-icon danger";
      elements.btnConfirm.className = "btn-danger-modal";
      elements.btnConfirm.innerText = "Sim, Confirmar";
    } else {
      elements.icon.className = "fa-solid fa-circle-question modal-icon";
      elements.btnConfirm.className = "btn-primary";
      elements.btnConfirm.innerText = "Confirmar";
    }

    modal.classList.remove("hidden");

    const clean = () => {
      const nConf = elements.btnConfirm.cloneNode(true);
      const nCanc = elements.btnCancel.cloneNode(true);
      elements.btnConfirm.parentNode.replaceChild(nConf, elements.btnConfirm);
      elements.btnCancel.parentNode.replaceChild(nCanc, elements.btnCancel);
      return { nConf, nCanc };
    };

    const { nConf, nCanc } = clean();

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

window.mostrarAlerta = (titulo, mensagem, type) => {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-modal");
    if (!modal) {
      alert(mensagem);
      return resolve(true);
    }

    const elements = {
      title: document.getElementById("modal-title"),
      desc: document.getElementById("modal-desc"),
      icon: document.getElementById("modal-icon"),
      btnConfirm: document.getElementById("btn-modal-confirm"),
      btnCancel: document.getElementById("btn-modal-cancel"),
    };

    elements.title.innerText = titulo;
    elements.desc.innerText = mensagem;
    elements.btnCancel.classList.add("hidden");
    elements.btnConfirm.className = "btn-primary";
    elements.btnConfirm.innerText = "OK";

    if (type === "error")
      elements.icon.className = "fa-solid fa-circle-xmark modal-icon error";
    else if (type === "warning")
      elements.icon.className =
        "fa-solid fa-circle-exclamation modal-icon warning";
    else
      elements.icon.className = "fa-solid fa-circle-check modal-icon success";

    elements.icon.style.color = "";
    modal.classList.remove("hidden");

    const nConf = elements.btnConfirm.cloneNode(true);
    elements.btnConfirm.parentNode.replaceChild(nConf, elements.btnConfirm);
    nConf.onclick = () => {
      modal.classList.add("hidden");
      resolve(true);
    };
  });
};
