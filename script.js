/**
 * SISTEMA DE GESTÃO - POLÍCIA CIVIL
 * Versão: 2.0 (Com Relatórios e Logs Persistentes)
 */

// ==========================================
// 1. CONFIGURAÇÕES GLOBAIS
// ==========================================
const CONFIG = {
  // Ícone usado no rodapé dos embeds (link público)
  BRASAO_URL:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Bras%C3%A3o_da_Pol%C3%ADcia_Civil_do_Estado_do_Rio_de_Janeiro.png/120px-Bras%C3%A3o_da_Pol%C3%ADcia_Civil_do_Estado_do_Rio_de_Janeiro.png",
};

const FOOTER_PADRAO = {
  text: "Sistema Policial - Polícia Civil",
  icon_url: CONFIG.BRASAO_URL,
};

// Coordenadas do Canvas (Porte de Armas)
const POSICOES = {
  nome: { x: 370, y: 250, max: 400 },
  id: { x: 754, y: 433 },
  rg: { x: 576, y: 433 },
  expedicao: { x: 122, y: 435 },
  validade: { x: 304, y: 435 },
  corTexto: "#000000",
  fonte: "bold 26px 'Arial'",
};

// Coordenadas do Canvas (Limpeza de Ficha)
const POSICOES_LIMPEZA = {
  nome: { x: 180, y: 380 },
  id: { x: 550, y: 380 },
  rg: { x: 180, y: 440 },
  data: { x: 680, y: 380 },
  corTexto: "#000000",
  fonte: "bold 30px 'Arial'",
};

// Tabela de Preços e Configuração de Armas
const PRECOS = {
  "Glock-18": { arma: 40000, laudo: 10000, municao: 5000 },
  "Colt-45": { arma: 60000, laudo: 15000, municao: 7000 },
  "Desert Eagle": { arma: 100000, laudo: 25000, municao: 12000 },
  Fuzil: { arma: 250000, laudo: 50000, municao: 20000 },
  Taser: { arma: 15000, laudo: 5000, municao: 0 },
};

// Banco de dados local (Memória RAM do navegador) para Portes Ativos
let dbPortes = [];

// ==========================================
// 2. INICIALIZAÇÃO E EVENTOS
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  console.log("Sistema Iniciado...");

  // Verificações Iniciais
  verificarSessao();
  carregarPortesDoDiscord();
  configurarDatasAutomaticas();
  verificarPermissaoRelatorio();

  // Função auxiliar para vincular botões com segurança
  const onClick = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.onclick = fn;
  };

  // Botões de Emissão
  onClick("btn-gerar-porte", gerarPreviewPorte);
  onClick("btn-finalizar-emissao", processarEmissao);

  // Botões de Limpeza
  onClick("btn-gerar-limpeza", gerarPreviewLimpeza);
  onClick("btn-finalizar-limpeza", processarLimpeza);

  // Botão de Relatório
  onClick("btn-atualizar-relatorio", gerarRelatorioSemanal);

  // Inputs para cálculo automático
  const inputsCalculo = ["porte-arma", "check-municao", "check-desconto"];
  inputsCalculo.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", atualizarValoresPorte);
  });
});

// ==========================================
// 3. AUTENTICAÇÃO E SEGURANÇA
// ==========================================
function verificarSessao() {
  const sessao = localStorage.getItem("pc_session");
  const isLogin = window.location.pathname.includes("login.html");

  if (!sessao) {
    if (!isLogin) window.location.href = "login.html";
    return;
  }

  const user = JSON.parse(sessao);

  // Renderiza perfil na Sidebar
  const perfilDiv = document.getElementById("user-profile-info");
  if (perfilDiv) {
    const avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
      : "https://cdn.discordapp.com/embed/avatars/0.png";

    perfilDiv.innerHTML = `
      <div class="avatar-circle"><img src="${avatar}"></div>
      <div class="user-info">
        <p>${user.username}</p>
        <small>● Online</small>
      </div>
      <button onclick="logout()" class="btn-logout" title="Sair">
        <i class="fa-solid fa-right-from-bracket"></i>
      </button>`;
  }
}

// Verifica na API se o cargo do usuário permite ver a aba Relatórios
async function verificarPermissaoRelatorio() {
  const user = JSON.parse(localStorage.getItem("pc_session") || "{}");
  if (!user.roles) return;

  try {
    const res = await fetch("/api/verificar-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: user.roles }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.isAdmin) {
        const menu = document.getElementById("menu-relatorios");
        if (menu) menu.classList.remove("hidden");
      }
    }
  } catch (e) {
    console.warn("Falha ao verificar permissões:", e);
  }
}

window.logout = () => {
  localStorage.removeItem("pc_session");
  window.location.href = "login.html";
};

// ==========================================
// 4. GESTÃO DE DADOS (CARREGAMENTO)
// ==========================================
async function carregarPortesDoDiscord() {
  try {
    const res = await fetch("/api/listar");
    if (!res.ok) throw new Error("Erro na API");

    const dados = await res.json();

    // Mapeia e normaliza os dados (message_id é crucial para revogação)
    dbPortes = dados.map((p) => ({
      ...p,
      message_id: p.message_id || p.id_mensagem || p.msg_id,
    }));

    renderTables();
    atualizarStats();
  } catch (err) {
    console.error("Erro ao carregar portes:", err);
    // Não exibimos alerta para não bloquear a UI na inicialização
  }
}

function renderTables() {
  // 1. Tabela de Ativos
  const tbodyAtivos = document.getElementById("lista-ativos-para-revogar");
  const filtro =
    document.getElementById("input-busca")?.value.toLowerCase() || "";

  if (tbodyAtivos) {
    tbodyAtivos.innerHTML = "";

    // Ordena por nome
    const listaFiltrada = dbPortes.filter(
      (p) =>
        !filtro ||
        p.nome.toLowerCase().includes(filtro) ||
        p.id.includes(filtro)
    );

    listaFiltrada.forEach((p) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${p.nome}</strong></td>
        <td>${p.id}</td>
        <td>${p.arma}</td>
        <td>${p.validade}</td>
        <td>
          <button class="btn-danger-sm" onclick="revogar('${p.id}')" title="Revogar e Deletar">
            <i class="fa-solid fa-ban"></i>
          </button>
        </td>`;
      tbodyAtivos.appendChild(tr);
    });
  }

  // 2. Tabela de Histórico Local (Revogados)
  const tbodyHist = document.getElementById("lista-ja-revogados");
  if (tbodyHist) {
    const historico = JSON.parse(
      localStorage.getItem("historico_revogacoes") || "[]"
    );

    tbodyHist.innerHTML = historico
      .reverse()
      .map(
        (h) => `
      <tr style="opacity: 0.7;">
        <td>${h.nome}</td>
        <td>${h.id}</td>
        <td>${h.dataRevogacao}</td>
        <td><span class="badge-revogado">REVOGADO POR ${
          h.oficial || "?"
        }</span></td>
      </tr>
    `
      )
      .join("");
  }
}

function atualizarStats() {
  const elAtivos = document.getElementById("stat-ativos");
  const elRevogados = document.getElementById("stat-revogados");

  if (elAtivos) elAtivos.innerText = dbPortes.length;
  if (elRevogados) {
    const qtd = JSON.parse(
      localStorage.getItem("historico_revogacoes") || "[]"
    ).length;
    elRevogados.innerText = qtd;
  }
}

// ==========================================
// 5. EMISSÃO DE PORTE (Lógica e Canvas)
// ==========================================
window.atualizarValoresPorte = () => {
  const elArma = document.getElementById("porte-arma");
  if (!elArma) return;

  const arma = elArma.value;
  const municao = document.getElementById("check-municao").checked;
  const desconto = document.getElementById("check-desconto").checked;
  const dados = PRECOS[arma];

  // Regra do Taser (sem munição)
  const elMunicao = document.getElementById("check-municao");
  if (arma === "Taser") {
    elMunicao.checked = false;
    elMunicao.disabled = true;
  } else {
    elMunicao.disabled = false;
  }

  // Cálculos
  const valArma = dados.arma;
  const valLaudo = dados.laudo;
  const valMunicao = arma !== "Taser" && municao ? dados.municao : 0;

  const subtotal = valArma + valLaudo + valMunicao;
  const valDesconto = desconto ? subtotal * 0.15 : 0;
  const total = subtotal - valDesconto;

  // Atualiza HTML
  const container = document.getElementById("valores-container");
  if (container) {
    container.innerHTML = `
      <div class="price-row"><span>Armamento (${arma})</span><span>R$ ${valArma.toLocaleString()}</span></div>
      <div class="price-row"><span>Exame/Laudo</span><span>R$ ${valLaudo.toLocaleString()}</span></div>
      ${
        valMunicao > 0
          ? `<div class="price-row"><span>Munição</span><span>R$ ${valMunicao.toLocaleString()}</span></div>`
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

  // Salva no dataset para uso posterior
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
    return mostrarAlerta("Atenção", "Preencha Nome, ID e RG.", "warning");

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
    mostrarAlerta("Sucesso", "Prévia gerada com sucesso.", "success");
  };

  img.onerror = () =>
    mostrarAlerta("Erro", "Imagem modelo_porte.png não encontrada.", "error");
}

async function processarEmissao() {
  const painel = document.getElementById("painel-valores");
  if (!painel.dataset.total)
    return mostrarAlerta(
      "Erro",
      "Gere a prévia para calcular os valores.",
      "warning"
    );

  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const rg = document.getElementById("porte-rg").value;
  const arma = document.getElementById("porte-arma").value;
  const val = document.getElementById("porte-validade").value;

  mostrarAlerta(
    "Processando",
    "Enviando registro para o sistema...",
    "warning"
  );

  const canvas = document.getElementById("canvas-porte");
  canvas.toBlob(async (blob) => {
    const nomeArq = `porte_${id}.png`;
    const sessao = JSON.parse(localStorage.getItem("pc_session"));
    const mencao = sessao.id ? `<@${sessao.id}>` : `**${sessao.username}**`;

    const embed = {
      title: `📄 EMISSÃO DE PORTE: ${arma.toUpperCase()}`,
      color: 3447003, // Azul
      fields: [
        { name: "👤 Cidadão", value: nome.toUpperCase(), inline: true },
        { name: "🆔 Passaporte", value: id, inline: true },
        { name: "🪪 RG", value: rg, inline: true },
        { name: "📅 Validade", value: val, inline: true },
        { name: "📦 Munição", value: painel.dataset.municao, inline: true },
        {
          name: "💰 Valor Total",
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
      `✅ **Novo Porte Registrado:** ${nome}`
    );

    if (ok) {
      await mostrarAlerta(
        "Sucesso",
        "Porte emitido e meta contabilizada!",
        "success"
      );
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
    return mostrarAlerta("Atenção", "Nome e ID são obrigatórios.", "warning");

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

  mostrarAlerta("Aguarde", "Gerando certificado...", "warning");

  const canvas = document.getElementById("canvas-limpeza");
  canvas.toBlob(async (blob) => {
    const nomeArq = `limpeza_${id}.png`;
    const sessao = JSON.parse(localStorage.getItem("pc_session"));

    const embed = {
      title: "🧼 LIMPEZA DE FICHA",
      description: "Antecedentes criminais removidos mediante taxa.",
      color: 65280, // Verde
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
      `🧼 **Limpeza Realizada:** ${nome}`
    );

    if (ok) {
      await mostrarAlerta("Concluído", "Ficha limpa com sucesso!", "success");
      location.reload();
    }
  });
}

// ==========================================
// 7. REVOGAÇÃO (COM LOG DE META)
// ==========================================
window.revogar = async function (idPassaporte) {
  const p = dbPortes.find((x) => String(x.id) === String(idPassaporte));
  if (!p)
    return mostrarAlerta(
      "Erro",
      "Porte não encontrado na lista local.",
      "error"
    );

  const confirmar = await confirmarAcao(
    "REVOGAR PORTE?",
    `Deseja realmente revogar o porte de ${p.nome}?\nIsso apagará a mensagem do canal ativo, mas o ponto da meta será mantido.`,
    "danger"
  );

  if (!confirmar) return;

  mostrarAlerta(
    "Processando",
    "Removendo do sistema e salvando log...",
    "warning"
  );

  try {
    const sessao = JSON.parse(localStorage.getItem("pc_session"));
    const mencao = sessao.id ? `<@${sessao.id}>` : sessao.username;

    // 1. ENVIA O LOG (Para garantir a meta antes de deletar)
    const embedRevog = {
      title: "🚫 PORTE REVOGADO",
      color: 15548997, // Vermelho
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
        type: "revogacao", // Vai para o canal de logs
        embed: embedRevog,
        content: `🚨 **REVOGAÇÃO:** O porte de ${p.nome} foi cancelado.`,
      }),
    });

    // 2. DELETA A MENSAGEM ORIGINAL (Limpa o canal de ativos)
    if (p.message_id) {
      await fetch("/api/deletar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: p.message_id }),
      });
    }

    // 3. SALVA NO HISTÓRICO LOCAL
    const historico = JSON.parse(
      localStorage.getItem("historico_revogacoes") || "[]"
    );
    historico.push({
      nome: p.nome,
      id: p.id,
      dataRevogacao: new Date().toLocaleString("pt-BR"),
      oficial: sessao.username,
    });
    localStorage.setItem("historico_revogacoes", JSON.stringify(historico));

    // 4. ATUALIZA A TELA
    dbPortes = dbPortes.filter(
      (item) => String(item.id) !== String(idPassaporte)
    );
    renderTables();
    atualizarStats();

    mostrarAlerta("Sucesso", "Revogação concluída!", "success");
  } catch (err) {
    console.error(err);
    mostrarAlerta(
      "Erro",
      "Houve um problema na comunicação com o servidor.",
      "error"
    );
  }
};

// ==========================================
// 8. RELATÓRIOS (METAS SEMANAIS)
// ==========================================
window.gerarRelatorioSemanal = async function () {
  const corpo = document.getElementById("corpo-relatorio");
  const user = JSON.parse(localStorage.getItem("pc_session"));

  if (!corpo) return;

  mostrarAlerta(
    "Aguarde",
    "Calculando produtividade dos últimos 7 dias...",
    "warning"
  );

  try {
    const res = await fetch("/api/relatorio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: user.roles }),
    });

    if (res.status === 403) throw new Error("Sem permissão");
    if (!res.ok) throw new Error("Erro API");

    const dados = await res.json();
    corpo.innerHTML = "";

    if (Object.keys(dados).length === 0) {
      corpo.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px;">Nenhuma atividade registrada na semana.</td></tr>`;
    } else {
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
    }

    mostrarAlerta("Atualizado", "Relatório gerado com sucesso.", "success");
  } catch (err) {
    if (err.message === "Sem permissão") {
      mostrarAlerta(
        "Acesso Negado",
        "Apenas cargos administrativos podem gerar relatórios.",
        "error"
      );
    } else {
      mostrarAlerta("Erro", "Falha ao gerar o relatório.", "error");
    }
  }
};

// ==========================================
// 9. FUNÇÕES UTILITÁRIAS
// ==========================================

// Envio para API (Upload + JSON)
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
    console.error(e);
    return false;
  }
}

// Navegação (Abas)
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

// Datas automáticas nos inputs
function configurarDatasAutomaticas() {
  const hoje = new Date();
  const validade = new Date();
  validade.setDate(hoje.getDate() + 30);

  const fmt = (d) => d.toLocaleDateString("pt-BR");

  const elExp = document.getElementById("porte-expedicao");
  const elVal = document.getElementById("porte-validade");
  const elLimp = document.getElementById("limpeza-data");

  if (elExp && !elExp.value) elExp.value = fmt(hoje);
  if (elVal && !elVal.value) elVal.value = fmt(validade);
  if (elLimp && !elLimp.value) elLimp.value = fmt(hoje);

  // Data no topo
  const dtTopo = document.getElementById("data-atual");
  if (dtTopo) dtTopo.innerText = fmt(hoje);
}

// Modal Personalizado (Substitui confirm/alert nativos)
window.confirmarAcao = (titulo, mensagem, tipo) => {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-modal");
    if (!modal) return resolve(confirm(mensagem));

    // Elementos
    const t = document.getElementById("modal-title");
    const d = document.getElementById("modal-desc");
    const i = document.getElementById("modal-icon");
    const bConf = document.getElementById("btn-modal-confirm");
    const bCanc = document.getElementById("btn-modal-cancel");

    // Configuração
    t.innerText = titulo;
    d.innerText = mensagem;
    bCanc.classList.remove("hidden");

    // Estilo Danger ou Padrão
    if (tipo === "danger") {
      i.className = "fa-solid fa-triangle-exclamation modal-icon danger";
      bConf.className = "btn-danger-modal";
      bConf.innerText = "Sim, Confirmar";
    } else {
      i.className = "fa-solid fa-circle-question modal-icon";
      bConf.className = "btn-primary";
      bConf.innerText = "Confirmar";
    }

    modal.classList.remove("hidden");

    // Clona botões para remover eventos antigos
    const nConf = bConf.cloneNode(true);
    const nCanc = bCanc.cloneNode(true);
    bConf.parentNode.replaceChild(nConf, bConf);
    bCanc.parentNode.replaceChild(nCanc, bCanc);

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

    const t = document.getElementById("modal-title");
    const d = document.getElementById("modal-desc");
    const i = document.getElementById("modal-icon");
    const bConf = document.getElementById("btn-modal-confirm");
    const bCanc = document.getElementById("btn-modal-cancel");

    t.innerText = titulo;
    d.innerText = mensagem;
    bCanc.classList.add("hidden");
    bConf.className = "btn-primary";
    bConf.innerText = "OK";

    if (type === "error")
      i.className = "fa-solid fa-circle-xmark modal-icon error";
    else if (type === "warning")
      i.className = "fa-solid fa-circle-exclamation modal-icon warning";
    else i.className = "fa-solid fa-circle-check modal-icon success";
    i.style.color = "";

    modal.classList.remove("hidden");

    const nConf = bConf.cloneNode(true);
    bConf.parentNode.replaceChild(nConf, bConf);
    nConf.onclick = () => {
      modal.classList.add("hidden");
      resolve(true);
    };
  });
};
