// ==========================================
// ⚙️ CONFIGURAÇÕES E CONSTANTES GLOBAIS
// ==========================================
const CONFIG = {
  CLIENT_ID: "1451342682487259319",
  // Link para ícone no rodapé do Discord (precisa ser URL pública)
  BRASAO_URL:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Bras%C3%A3o_da_Pol%C3%ADcia_Civil_do_Estado_do_Rio_de_Janeiro.png/120px-Bras%C3%A3o_da_Pol%C3%ADcia_Civil_do_Estado_do_Rio_de_Janeiro.png",
};

const FOOTER_PADRAO = {
  text: "Sistema Policial - Polícia Civil",
  icon_url: CONFIG.BRASAO_URL,
};

// Coordenadas para o Canvas do PORTE
const POSICOES = {
  nome: { x: 370, y: 250, max: 400 },
  id: { x: 754, y: 433 },
  rg: { x: 576, y: 433 },
  expedicao: { x: 122, y: 435 },
  validade: { x: 304, y: 435 },
  corTexto: "#000000",
  fonte: "bold 26px 'Arial'",
};

// Coordenadas para o Canvas da LIMPEZA
const POSICOES_LIMPEZA = {
  nome: { x: 180, y: 380 },
  id: { x: 550, y: 380 },
  rg: { x: 180, y: 440 },
  data: { x: 680, y: 380 },
  corTexto: "#000000",
  fonte: "bold 30px 'Arial'",
};

const PRECOS = {
  "Glock-18": { arma: 40000, laudo: 10000, municao: 5000 },
  "Colt-45": { arma: 60000, laudo: 15000, municao: 7000 },
  "Desert Eagle": { arma: 100000, laudo: 25000, municao: 12000 },
  Fuzil: { arma: 250000, laudo: 50000, municao: 20000 },
  Taser: { arma: 15000, laudo: 5000, municao: 0 },
};

let dbPortes = [];

// ==========================================
// 🚀 INICIALIZAÇÃO DO SISTEMA
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Sistema Iniciado");

  verificarSessao();
  carregarPortesDoDiscord();
  configurarDatasAutomaticas();
  verificarPermissaoRelatorio();

  // Bind de Botões (Verifica se existem antes de adicionar evento)
  const bind = (id, func) => {
    const el = document.getElementById(id);
    if (el) el.onclick = func;
  };

  bind("btn-gerar-porte", gerarPreviewPorte);
  bind("btn-finalizar-emissao", processarEmissao);
  bind("btn-gerar-limpeza", gerarPreviewLimpeza);
  bind("btn-finalizar-limpeza", processarLimpeza);
  bind("btn-atualizar-relatorio", gerarRelatorioSemanal); // Botão dentro da aba relatórios
});

// ==========================================
// 🔐 AUTENTICAÇÃO E PERMISSÕES
// ==========================================
function verificarSessao() {
  const user = JSON.parse(localStorage.getItem("pc_session"));

  // Se não tiver sessão, manda pro login (exceto se já estiver lá)
  if (!user) {
    if (!window.location.href.includes("login.html")) {
      window.location.href = "login.html";
    }
    return;
  }

  // Preenche o perfil na sidebar
  const avatar = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
    : "https://cdn.discordapp.com/embed/avatars/0.png";

  const perfilDiv = document.getElementById("user-profile-info");
  if (perfilDiv) {
    perfilDiv.innerHTML = `
      <div class="avatar-circle"><img src="${avatar}" style="width:100%"></div>
      <div class="user-info"><p>${user.username}</p><small>● Online</small></div>
      <button onclick="logout()" title="Sair" style="color:#e52e4d;background:none;border:none;margin-left:auto;cursor:pointer;font-size:1.1rem">
        <i class="fa-solid fa-right-from-bracket"></i>
      </button>`;
  }
}

// Verifica se o usuário tem cargo para ver a aba Relatórios
async function verificarPermissaoRelatorio() {
  const user = JSON.parse(localStorage.getItem("pc_session"));
  if (!user || !user.roles) return;

  try {
    const res = await fetch("/api/verificar-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: user.roles }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.isAdmin) {
        const menuRelatorio = document.getElementById("menu-relatorios");
        if (menuRelatorio) menuRelatorio.classList.remove("hidden");
      }
    }
  } catch (e) {
    console.warn("Não foi possível verificar permissões de admin.");
  }
}

window.logout = () => {
  localStorage.removeItem("pc_session");
  window.location.href = "login.html";
};

// ==========================================
// 📥 CARREGAMENTO DE DADOS (DASHBOARD)
// ==========================================
async function carregarPortesDoDiscord() {
  try {
    const res = await fetch("/api/listar");
    if (!res.ok) throw new Error("Erro na API de listagem");

    const dados = await res.json();

    // Normaliza os dados garantindo que message_id exista
    dbPortes = dados.map((p) => ({
      ...p,
      message_id: p.message_id || p.id_mensagem || p.msg_id,
    }));

    renderTables();
    atualizarStats();
  } catch (erro) {
    console.error(erro);
    // Não mostra alerta intrusivo no carregamento, apenas log
  }
}

function renderTables() {
  // 1. Tabela de Portes Ativos
  const listaAtivos = document.getElementById("lista-ativos-para-revogar");
  const filtro = document.getElementById("input-busca")
    ? document.getElementById("input-busca").value.toLowerCase()
    : "";

  if (listaAtivos) {
    listaAtivos.innerHTML = "";
    dbPortes.forEach((p) => {
      // Filtro de busca
      if (
        filtro &&
        !p.nome.toLowerCase().includes(filtro) &&
        !p.id.includes(filtro)
      )
        return;

      // Verifica validade (exemplo simples)
      // Você pode adicionar a lógica de dias corridos aqui se desejar

      const tr = document.createElement("tr");
      tr.innerHTML = `
          <td><strong>${p.nome}</strong></td>
          <td>${p.id}</td>
          <td>${p.arma}</td>
          <td>${p.validade}</td>
          <td>
            <button class="btn-danger" onclick="revogar('${p.id}')" title="Revogar Porte">
                <i class="fa-solid fa-ban"></i>
            </button>
          </td>
        `;
      listaAtivos.appendChild(tr);
    });
  }

  // 2. Tabela de Histórico (LocalStorage)
  const listaHistorico = document.getElementById("lista-ja-revogados");
  if (listaHistorico) {
    const historico = JSON.parse(
      localStorage.getItem("historico_revogacoes") || "[]"
    );

    listaHistorico.innerHTML = historico
      .slice()
      .reverse()
      .map(
        (h) => `
      <tr style="opacity: 0.8">
        <td>${h.nome}</td>
        <td>${h.id}</td>
        <td>${h.dataRevogacao}</td>
        <td><span class="badge revogado">REVOGADO POR ${
          h.oficial || "Sistema"
        }</span></td>
      </tr>
    `
      )
      .join("");
  }
}

// Atualiza contadores no topo da Dashboard
function atualizarStats() {
  const elAtivos = document.getElementById("stat-ativos");
  const elRevogados = document.getElementById("stat-revogados");

  if (elAtivos) elAtivos.innerText = dbPortes.length;

  if (elRevogados) {
    const hist = JSON.parse(
      localStorage.getItem("historico_revogacoes") || "[]"
    );
    elRevogados.innerText = hist.length;
  }
}

// ==========================================
// ✍️ EMISSÃO DE PORTE (LÓGICA + CANVAS)
// ==========================================
window.atualizarValoresPorte = () => {
  const selectArma = document.getElementById("porte-arma");
  const checkMunicao = document.getElementById("check-municao");
  const checkDesconto = document.getElementById("check-desconto");

  if (!selectArma) return;

  const arma = selectArma.value;
  const regras = PRECOS[arma] || { arma: 0, laudo: 0, municao: 0 };

  // Taser não tem munição
  if (arma === "Taser") {
    checkMunicao.checked = false;
    checkMunicao.disabled = true;
  } else {
    checkMunicao.disabled = false;
  }

  const vArma = regras.arma;
  const vLaudo = regras.laudo;
  const vMunicao = checkMunicao.checked ? regras.municao : 0;

  const subtotal = vArma + vLaudo + vMunicao;
  const desconto = checkDesconto.checked ? subtotal * 0.15 : 0;
  const total = subtotal - desconto;

  // Atualiza HTML do painel
  const container = document.getElementById("valores-container");
  const elTotal = document.getElementById("total-valor");
  const painel = document.getElementById("painel-valores");

  if (container) {
    container.innerHTML = `
        <div class="price-row"><span>Armamento (${arma})</span><span>R$ ${vArma.toLocaleString()}</span></div>
        <div class="price-row"><span>Exame Psicotécnico</span><span>R$ ${vLaudo.toLocaleString()}</span></div>
        ${
          vMunicao > 0
            ? `<div class="price-row"><span>Kit Munição</span><span>R$ ${vMunicao.toLocaleString()}</span></div>`
            : ""
        }
        ${
          desconto > 0
            ? `<div class="price-row discount"><span>Desconto Policial (15%)</span><span>- R$ ${desconto.toLocaleString()}</span></div>`
            : ""
        }
      `;
  }

  if (elTotal) elTotal.innerText = `R$ ${total.toLocaleString()}`;

  // Salva dados no dataset para envio posterior
  if (painel) {
    painel.dataset.total = total;
    painel.dataset.municao = checkMunicao.checked ? "Sim" : "Não";
    painel.dataset.desconto = desconto > 0 ? "Sim" : "Não";
  }
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
      "Preencha Nome, ID e RG antes de gerar a prévia.",
      "warning"
    );

  const canvas = document.getElementById("canvas-porte");
  const ctx = canvas.getContext("2d");
  const img = new Image();

  // Escolha da imagem base (pode ser dinâmica se tiver várias)
  img.src = "assets/modelo_porte.png";

  img.onload = () => {
    // 1. Limpa e desenha fundo
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // 2. Configura Texto
    ctx.fillStyle = POSICOES.corTexto;
    ctx.font = POSICOES.fonte;

    // 3. Escreve dados
    ctx.fillText(nome.toUpperCase(), POSICOES.nome.x, POSICOES.nome.y);
    ctx.fillText(id, POSICOES.id.x, POSICOES.id.y);
    ctx.fillText(rg, POSICOES.rg.x, POSICOES.rg.y);
    ctx.fillText(exp, POSICOES.expedicao.x, POSICOES.expedicao.y);
    ctx.fillText(val, POSICOES.validade.x, POSICOES.validade.y);

    // 4. Mostra container
    document.getElementById("preview-porte-container").style.display = "block";
    mostrarAlerta(
      "Prévia Gerada",
      "Verifique os dados antes de finalizar.",
      "success"
    );
  };

  img.onerror = () =>
    mostrarAlerta(
      "Erro",
      "Imagem modelo_porte.png não encontrada na pasta assets.",
      "error"
    );
}

async function processarEmissao() {
  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const rg = document.getElementById("porte-rg").value;
  const arma = document.getElementById("porte-arma").value;
  const validade = document.getElementById("porte-validade").value;
  const painel = document.getElementById("painel-valores");

  if (!painel.dataset.total)
    return mostrarAlerta(
      "Erro",
      "Gere a prévia e calcule os valores primeiro.",
      "warning"
    );

  mostrarAlerta("Aguarde", "Enviando registro para o sistema...", "warning");

  const canvas = document.getElementById("canvas-porte");

  canvas.toBlob(async (blob) => {
    const nomeArq = `porte_${id}.png`;
    const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
    const mencao = sessao.id ? `<@${sessao.id}>` : `**${sessao.username}**`;

    const embed = {
      title: `📄 NOVO PORTE EMITIDO: ${arma.toUpperCase()}`,
      color: 3447003, // Azul
      fields: [
        { name: "👤 Cidadão", value: nome.toUpperCase(), inline: true },
        { name: "🆔 Passaporte", value: id, inline: true },
        { name: "🪪 RG", value: rg, inline: true },
        { name: "📅 Validade", value: validade, inline: true },
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

    // Envia para API
    const sucesso = await enviarParaAPI(
      blob,
      nomeArq,
      "porte",
      embed,
      `✅ **Emissão Registrada:** ${nome} (ID: ${id})`
    );

    if (sucesso) {
      await mostrarAlerta(
        "Sucesso",
        "Porte emitido e contabilizado na meta!",
        "success"
      );
      // Recarrega para limpar campos e atualizar lista
      window.location.reload();
    }
  });
}

// ==========================================
// 🧼 LIMPEZA DE FICHA
// ==========================================
async function gerarPreviewLimpeza() {
  const nome = document.getElementById("limpeza-nome").value;
  const id = document.getElementById("limpeza-id").value;
  const rg = document.getElementById("limpeza-rg").value;
  const data = document.getElementById("limpeza-data").value;

  if (!nome || !id)
    return mostrarAlerta("Atenção", "Preencha Nome e ID.", "warning");

  const canvas = document.getElementById("canvas-limpeza");
  const ctx = canvas.getContext("2d");
  const img = new Image();
  img.src = "assets/modelo_limpeza.png";

  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = POSICOES_LIMPEZA.corTexto;
    ctx.font = POSICOES_LIMPEZA.fonte;
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

  mostrarAlerta("Processando", "Registrando limpeza criminal...", "warning");

  const canvas = document.getElementById("canvas-limpeza");
  canvas.toBlob(async (blob) => {
    const nomeArq = `limpeza_${id}.png`;
    const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");

    const embed = {
      title: `🧼 LIMPEZA DE FICHA REALIZADA`,
      description: "O cidadão quitou seus débitos com a justiça.",
      color: 65280, // Verde
      fields: [
        { name: "👤 Cidadão", value: nome.toUpperCase(), inline: true },
        { name: "🆔 ID", value: id, inline: true },
        { name: "👮 Oficial", value: sessao.username, inline: true },
      ],
      image: { url: `attachment://${nomeArq}` },
      footer: FOOTER_PADRAO,
    };

    const sucesso = await enviarParaAPI(
      blob,
      nomeArq,
      "limpeza",
      embed,
      `🧼 **Ficha Limpa:** ${nome}`
    );
    if (sucesso) {
      await mostrarAlerta("Concluído", "Limpeza registrada!", "success");
      window.location.reload();
    }
  });
}

// ==========================================
// 🚫 REVOGAÇÃO (DELETE + LOG DE META)
// ==========================================
window.revogar = async function (idPassaporte) {
  const p = dbPortes.find((x) => String(x.id) === String(idPassaporte));
  if (!p)
    return mostrarAlerta("Erro", "Porte não encontrado na memória.", "error");

  const confirmou = await confirmarAcao(
    "REVOGAR PORTE?",
    `Tem certeza que deseja revogar o porte de ${p.nome}? \n\nIsso apagará a mensagem do canal 'Portes Ativos', mas salvará o log para a meta do oficial.`,
    "danger"
  );

  if (!confirmou) return;

  mostrarAlerta("Processando", "Atualizando sistema e registros...", "warning");

  try {
    const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
    const mencao = sessao.id ? `<@${sessao.id}>` : sessao.username;

    // 1. CRIAR LOG DE REVOGAÇÃO (GARANTE A META)
    // Mesmo apagando a mensagem original, este log prova que a ação ocorreu
    const embedRevog = {
      title: "🚫 PORTE REVOGADO",
      description: "O documento foi invalidado no sistema.",
      color: 15548997, // Vermelho
      fields: [
        { name: "👤 Cidadão", value: p.nome, inline: true },
        { name: "🆔 ID", value: p.id, inline: true },
        { name: "🔫 Arma", value: p.arma || "Desconhecida", inline: true },
        { name: "👮 Revogado por", value: mencao, inline: false },
      ],
      footer: FOOTER_PADRAO,
      timestamp: new Date().toISOString(),
    };

    // Envia Log
    await fetch("/api/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "revogacao",
        embed: embedRevog,
        content: `🚨 **REVOGAÇÃO:** O porte de ${p.nome} (ID: ${p.id}) foi revogado.`,
      }),
    });

    // 2. APAGAR MENSAGEM ORIGINAL (LIMPEZA VISUAL)
    if (p.message_id) {
      await fetch("/api/deletar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: p.message_id }),
      });
    }

    // 3. SALVAR NO HISTÓRICO DO NAVEGADOR (FEEDBACK VISUAL)
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

    // 4. ATUALIZAR INTERFACE
    // Remove da lista local de ativos
    dbPortes = dbPortes.filter(
      (item) => String(item.id) !== String(idPassaporte)
    );
    renderTables();
    atualizarStats();

    mostrarAlerta(
      "Sucesso",
      "Porte revogado e registrado no histórico!",
      "success"
    );
  } catch (err) {
    console.error(err);
    mostrarAlerta(
      "Erro Parcial",
      "Ocorreu um erro na comunicação, mas a ação foi tentada.",
      "error"
    );
  }
};

// ==========================================
// 📊 RELATÓRIOS (METAS SEMANAIS)
// ==========================================
window.gerarRelatorioSemanal = async function () {
  const corpo = document.getElementById("corpo-relatorio");
  const user = JSON.parse(localStorage.getItem("pc_session"));

  if (!corpo) return;

  mostrarAlerta(
    "Aguarde",
    "Consultando logs de produtividade (7 dias)...",
    "warning"
  );

  try {
    const res = await fetch("/api/relatorio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: user.roles }),
    });

    if (res.status === 403) throw new Error("Sem Permissão");
    if (!res.ok) throw new Error("Erro API");

    const dados = await res.json();
    corpo.innerHTML = "";

    // Se vier vazio
    if (Object.keys(dados).length === 0) {
      corpo.innerHTML = `<tr><td colspan="5" style="text-align:center">Nenhuma atividade encontrada nos últimos 7 dias.</td></tr>`;
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

    mostrarAlerta(
      "Relatório Atualizado",
      "Dados carregados com sucesso.",
      "success"
    );
  } catch (err) {
    if (err.message === "Sem Permissão") {
      mostrarAlerta(
        "Acesso Negado",
        "Você não possui cargo administrativo para ver relatórios.",
        "error"
      );
    } else {
      mostrarAlerta("Erro", "Falha ao gerar relatório.", "error");
    }
  }
};

// ==========================================
// 🛠️ FUNÇÕES UTILITÁRIAS
// ==========================================

// Função Genérica de Envio para API
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

// Navegação entre abas
window.navegar = (tela) => {
  // Esconde todas as sections
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.add("hidden"));
  // Remove ativo do menu
  document
    .querySelectorAll(".nav-links li")
    .forEach((l) => l.classList.remove("active"));

  // Mostra alvo
  const target = document.getElementById(`sec-${tela}`);
  const menu = document.getElementById(`menu-${tela}`);

  if (target) target.classList.remove("hidden");
  if (menu) menu.classList.add("active");

  // Atualizações específicas por tela
  if (tela === "emissao" || tela === "limpeza") configurarDatasAutomaticas();
};

// Configura datas nos inputs
function configurarDatasAutomaticas() {
  const hoje = new Date();
  const validade = new Date();
  validade.setDate(hoje.getDate() + 30); // 30 dias padrão

  const fmt = (d) => d.toLocaleDateString("pt-BR");

  const elExp = document.getElementById("porte-expedicao");
  const elVal = document.getElementById("porte-validade");
  const elLimp = document.getElementById("limpeza-data");

  if (elExp && !elExp.value) elExp.value = fmt(hoje);
  if (elVal && !elVal.value) elVal.value = fmt(validade);
  if (elLimp && !elLimp.value) elLimp.value = fmt(hoje);

  const dataTopo = document.getElementById("data-atual");
  if (dataTopo) dataTopo.innerText = fmt(hoje);
}

// Modal Customizado (Substituto do Alert/Confirm)
window.confirmarAcao = (titulo, mensagem, tipo) => {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-modal");
    if (!modal) return resolve(confirm(`${titulo}\n${mensagem}`)); // Fallback

    const elTitulo = document.getElementById("modal-title");
    const elDesc = document.getElementById("modal-desc");
    const elIcon = document.getElementById("modal-icon");
    const btnConfirm = document.getElementById("btn-modal-confirm");
    const btnCancel = document.getElementById("btn-modal-cancel");

    elTitulo.innerText = titulo;
    elDesc.innerText = mensagem;
    btnCancel.classList.remove("hidden"); // Mostra cancelar

    // Reseta classes
    elIcon.className = "fa-solid fa-circle-question modal-icon";
    btnConfirm.className = "btn-primary";
    btnConfirm.innerText = "Confirmar";

    if (tipo === "danger") {
      elIcon.className = "fa-solid fa-triangle-exclamation modal-icon danger";
      btnConfirm.className = "btn-danger-modal";
      btnConfirm.innerText = "Sim, Continuar";
    }

    modal.classList.remove("hidden");

    // Clona para limpar eventos antigos
    const novoConfirm = btnConfirm.cloneNode(true);
    const novoCancel = btnCancel.cloneNode(true);
    btnConfirm.parentNode.replaceChild(novoConfirm, btnConfirm);
    btnCancel.parentNode.replaceChild(novoCancel, btnCancel);

    novoConfirm.onclick = () => {
      modal.classList.add("hidden");
      resolve(true);
    };
    novoCancel.onclick = () => {
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

    const elTitulo = document.getElementById("modal-title");
    const elDesc = document.getElementById("modal-desc");
    const elIcon = document.getElementById("modal-icon");
    const btnConfirm = document.getElementById("btn-modal-confirm");
    const btnCancel = document.getElementById("btn-modal-cancel");

    elTitulo.innerText = titulo;
    elDesc.innerText = mensagem;
    btnCancel.classList.add("hidden"); // Esconde cancelar

    btnConfirm.className = "btn-primary";
    btnConfirm.innerText = "OK";

    if (type === "error")
      elIcon.className = "fa-solid fa-circle-xmark modal-icon error";
    else if (type === "warning")
      elIcon.className = "fa-solid fa-circle-exclamation modal-icon warning";
    else elIcon.className = "fa-solid fa-circle-check modal-icon success";
    elIcon.style.color = ""; // Remove inline styles se houver

    modal.classList.remove("hidden");

    const novoBtn = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(novoBtn, btnConfirm);

    novoBtn.onclick = () => {
      modal.classList.add("hidden");
      resolve(true);
    };
  });
};
