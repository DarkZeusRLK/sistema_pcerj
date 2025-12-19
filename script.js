// ==========================================
// ⚙️ CONFIGURAÇÕES
// ==========================================
const CONFIG = {
  CLIENT_ID: "1451342682487259319",
  REDIRECT_URI: "https://sistema-emissao.vercel.app/",
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

let dbPortes = []; // Lista local

// ==========================================
// 🚀 INICIALIZAÇÃO (Tudo começa aqui)
// ==========================================
document.addEventListener("DOMContentLoaded", async function () {
  console.log("🚀 Sistema Iniciado");

  // 1. Configurações de Navegação e Botões
  configurarBotoes();

  const hash = window.location.hash;
  const isLoginPage = window.location.pathname.includes("login.html");

  // 2. Verifica Login Discord
  if (hash.includes("access_token")) {
    const fragment = new URLSearchParams(hash.slice(1));
    const accessToken = fragment.get("access_token");
    const tokenType = fragment.get("token_type");
    window.history.replaceState({}, document.title, window.location.pathname);
    await validarLoginNaAPI(`${tokenType} ${accessToken}`);
  } else {
    const sessao = localStorage.getItem("pc_session");

    if (sessao) {
      if (isLoginPage) window.location.href = "index.html";
      else {
        iniciarSistema(JSON.parse(sessao));
        // Carrega a lista do Discord ao iniciar
        await carregarPortesDoDiscord();
      }
    } else if (!isLoginPage) {
      window.location.href = "login.html";
    }
  }

  if (!isLoginPage) configurarDatasAutomaticas();
});

// ==========================================
// ☁️ BUSCAR DADOS DO DISCORD
// ==========================================
async function carregarPortesDoDiscord() {
  try {
    console.log("🔄 Buscando portes...");
    const res = await fetch("/api/listar");

    if (!res.ok) throw new Error(`Erro API: ${res.status}`);

    const dados = await res.json();
    dbPortes = dados;

    console.log(`✅ ${dbPortes.length} portes carregados.`);
    renderTables();
    atualizarStats();
  } catch (erro) {
    console.error("Erro ao listar:", erro);
    // Não mostramos alerta aqui para não spammar o usuário, apenas console
  }
}

// ==========================================
// 🖱️ CONFIGURAR BOTÕES (A Correção do "Nada Acontece")
// ==========================================
function configurarBotoes() {
  // Botão de Emitir (Final)
  const btnEmitir = document.getElementById("btn-emitir-final");
  if (btnEmitir) {
    // Remove ouvintes antigos para não duplicar
    const novoBtn = btnEmitir.cloneNode(true);
    btnEmitir.parentNode.replaceChild(novoBtn, btnEmitir);

    novoBtn.addEventListener("click", async () => {
      console.log("🖱️ Botão Emitir Clicado!");
      await processarEmissao();
    });
  }
}

// ==========================================
// 📨 LÓGICA DE EMISSÃO
// ==========================================
async function processarEmissao() {
  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const rg = document.getElementById("porte-rg").value;
  const arma = document.getElementById("porte-arma").value;
  const validade = document.getElementById("porte-validade").value;
  const expedicao = document.getElementById("porte-expedicao").value;

  if (!nome || !id)
    return mostrarAlerta("Erro", "Preencha Nome e Passaporte.", "warning");

  mostrarAlerta("Aguarde", "Gerando documento e enviando...", "warning");

  const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
  const mencaoOficial = sessao.id
    ? `<@${sessao.id}>`
    : `**${sessao.username || "Oficial"}**`;
  const mensagemNotificacao = `✅ **PORTE APROVADO**\nEmitido por ${mencaoOficial} oficial da Polícia Civil.`;

  const canvas = document.getElementById("canvas-porte");

  canvas.toBlob(async (blob) => {
    const nomeArquivo = `porte_${id}.png`;

    const embedData = {
      title: `📄 EMISSÃO DE PORTE: ${arma}`,
      description: `Documento oficial registrado.`,
      color: 3447003,
      fields: [
        {
          name: "👤 Cidadão",
          value: `**${nome.toUpperCase()}**`,
          inline: true,
        },
        { name: "🆔 Passaporte", value: `\`${id}\``, inline: true },
        { name: "🪪 RG", value: rg, inline: true },
        { name: "📅 Expedição", value: `\`${expedicao}\``, inline: true },
        { name: "📅 Validade", value: `\`${validade}\``, inline: true },
        { name: "🔫 Armamento", value: arma, inline: false },
      ],
      image: { url: `attachment://${nomeArquivo}` },
      footer: {
        text: `Sistema Integrado • Polícia Civil`,
        icon_url: sessao.avatar
          ? `https://cdn.discordapp.com/avatars/${sessao.id}/${sessao.avatar}.png`
          : "",
      },
      timestamp: new Date().toISOString(),
    };

    const sucesso = await enviarParaAPI(
      blob,
      nomeArquivo,
      "porte",
      embedData,
      mensagemNotificacao
    );

    if (sucesso) {
      await mostrarAlerta("Sucesso", "Porte emitido!", "success");
      // Adiciona na lista localmente para não precisar recarregar o Discord na hora
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

      // Limpa
      document.getElementById("preview-porte-container").style.display = "none";
      document.getElementById("porte-nome").value = "";
      document.getElementById("porte-id").value = "";
    }
  });
}

// ==========================================
// 🚫 REVOGAÇÃO
// ==========================================
window.revogar = async function (id) {
  // Força conversão para string para comparação segura
  const p = dbPortes.find((x) => String(x.id) === String(id));
  if (!p)
    return mostrarAlerta(
      "Erro",
      "Registro não encontrado localmente.",
      "error"
    );

  const confirmou = await confirmarAcao(
    "Revogar Porte?",
    `Deseja revogar o porte de ${p.nome}?`
  );
  if (!confirmou) return;

  mostrarAlerta("Processando", "Gerando documento de revogação...", "warning");

  const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
  const mencaoOficial = sessao.id
    ? `<@${sessao.id}>`
    : `**${sessao.username}**`;
  const msgNotif = `🚨 **PORTE REVOGADO**\nRevogado por ${mencaoOficial}.`;

  try {
    const blobRev = await gerarBlobRevogacao(p);
    const nomeArq = `revogacao_${id}.png`;

    const embed = {
      title: `🚫 REVOGADO: ${p.arma}`,
      description: "Porte cancelado.",
      color: 15548997,
      fields: [
        { name: "👤 Cidadão", value: `**${p.nome}**`, inline: true },
        { name: "🆔 ID", value: `\`${p.id}\``, inline: true },
        {
          name: "📅 Data",
          value: new Date().toLocaleDateString("pt-BR"),
          inline: true,
        },
      ],
      image: { url: `attachment://${nomeArq}` },
      footer: { text: "Polícia Civil" },
    };

    const sucesso = await enviarParaAPI(
      blobRev,
      nomeArq,
      "revogacao",
      embed,
      msgNotif
    );

    if (sucesso) {
      // Tenta deletar a mensagem original se tivermos o ID dela
      if (p.message_id) {
        await fetch("/api/deletar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message_id: p.message_id }),
        });
      }

      p.status = "Revogado";
      renderTables();
      atualizarStats();
      mostrarAlerta("Sucesso", "Porte revogado!", "success");
    }
  } catch (err) {
    console.error(err);
    mostrarAlerta("Erro", "Falha ao gerar imagem de revogação.", "error");
  }
};

// ==========================================
// 🛠️ FUNÇÕES AUXILIARES (Listar, Canvas, API)
// ==========================================
async function enviarParaAPI(
  blob,
  filename,
  tipoCanal,
  embedData,
  mensagemTexto = ""
) {
  const formData = new FormData();
  formData.append("file", blob, filename);
  formData.append(
    "payload_json",
    JSON.stringify({ content: mensagemTexto, embeds: [embedData] })
  );

  try {
    const res = await fetch(`/api/enviar?tipo=${tipoCanal}`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error("Erro API Enviar:", txt);
      mostrarAlerta(
        "Erro",
        "Falha ao enviar para o Discord. Verifique o console.",
        "error"
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(err);
    mostrarAlerta("Erro Crítico", "Sem conexão com a API.", "error");
    return false;
  }
}

function gerarBlobRevogacao(p) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    // Lógica simples para imagem
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

      // Preenche dados (posições definidas no topo)
      ctx.fillText(
        (p.nome || "").toUpperCase(),
        POSICOES.nome.x,
        POSICOES.nome.y
      );
      ctx.fillText(p.id || "", POSICOES.id.x, POSICOES.id.y);

      canvas.toBlob((b) => resolve(b), "image/png");
    };
    img.onerror = () => reject(new Error("Imagem base não encontrada"));
  });
}

// Lógica Visual
window.gerarPreviewPorte = function () {
  const container = document.getElementById("preview-porte-container");
  const canvas = document.getElementById("canvas-porte");
  const wrapper = document.querySelector(".canvas-wrapper");
  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const arma = document.getElementById("porte-arma").value;

  // Pegando valores do DOM para desenhar
  const rg = document.getElementById("porte-rg").value;
  const expedicao = document.getElementById("porte-expedicao").value;
  const validade = document.getElementById("porte-validade").value;

  if (!nome || !id)
    return mostrarAlerta("Erro", "Preencha os dados.", "warning");

  const ctx = canvas.getContext("2d");
  const img = new Image();

  if (arma === "GLOCK") img.src = "assets/porte_glock.png";
  else if (arma === "MP5") img.src = "assets/porte_mp5.png";
  else img.src = "assets/porte_taser.png";

  img.onload = function () {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    ctx.font = POSICOES.fonte;
    ctx.fillStyle = POSICOES.corTexto;

    ctx.fillText(nome.toUpperCase(), POSICOES.nome.x, POSICOES.nome.y);
    ctx.fillText(id, POSICOES.id.x, POSICOES.id.y);
    ctx.fillText(rg, POSICOES.rg.x, POSICOES.rg.y);
    ctx.fillText(expedicao, POSICOES.expedicao.x, POSICOES.expedicao.y);
    ctx.fillText(validade, POSICOES.validade.x, POSICOES.validade.y);

    container.classList.remove("hidden");
    container.style.display = "block";
    if (wrapper)
      wrapper.scrollIntoView({ behavior: "smooth", block: "center" });

    // Chama a reconfiguração dos botões caso o DOM tenha mudado
    configurarBotoes();
  };
};

window.renderTables = function () {
  const tbodyAtivos = document.getElementById("lista-ativos-para-revogar");
  const tbodyRevogados = document.getElementById("lista-ja-revogados");

  if (tbodyAtivos) tbodyAtivos.innerHTML = "";
  if (tbodyRevogados) tbodyRevogados.innerHTML = "";

  [...dbPortes].reverse().forEach((p) => {
    if (p.status === "Ativo" && tbodyAtivos) {
      tbodyAtivos.innerHTML += `
            <tr>
                <td>${p.nome}</td>
                <td>${p.id}</td>
                <td>${p.arma}</td>
                <td><button class="btn-danger" onclick="revogar('${p.id}')"><i class="fa-solid fa-ban"></i></button></td>
            </tr>`;
    } else if (p.status === "Revogado" && tbodyRevogados) {
      tbodyRevogados.innerHTML += `
            <tr style="opacity:0.7">
                <td>${p.nome}</td>
                <td>${p.id}</td>
                <td>Hoje</td>
                <td><span class="badge revogado">REVOGADO</span></td>
            </tr>`;
    }
  });
};

function atualizarStats() {
  const elAtivos = document.getElementById("counter-ativos");
  const elRevogados = document.getElementById("counter-revogados");
  if (elAtivos)
    elAtivos.innerText = dbPortes.filter((p) => p.status === "Ativo").length;
  if (elRevogados)
    elRevogados.innerText = dbPortes.filter(
      (p) => p.status === "Revogado"
    ).length;
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

// AUTH API E MODAIS
async function validarLoginNaAPI(token) {
  try {
    const res = await fetch("/api/auth", { headers: { Authorization: token } });
    const data = await res.json();
    if (res.ok && data.authorized) {
      localStorage.setItem("pc_session", JSON.stringify({ ...data, token }));
      window.location.href = "index.html";
    } else {
      window.location.href = "login.html?error=unauthorized";
    }
  } catch (e) {
    console.error(e);
  }
}

function iniciarSistema(user) {
  const div = document.querySelector(".user-profile");
  if (div) {
    const avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
      : "assets/logo_pc.png";
    div.innerHTML = `<div class="avatar-circle"><img src="${avatar}" style="width:100%"></div>
                         <div class="user-info"><p>${user.username}</p><small>● Online</small></div>
                         <button onclick="logout()" style="color:#e52e4d;background:none;border:none;margin-left:auto"><i class="fa-solid fa-right-from-bracket"></i></button>`;
  }
}
window.logout = () => {
  localStorage.removeItem("pc_session");
  window.location.href = "login.html";
};
window.navegar = (t) => {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.add("hidden"));
  const sec = document.getElementById(`sec-${t}`);
  if (sec) sec.classList.remove("hidden");
  if (t === "emissao") configurarDatasAutomaticas();
};

// Alertas Simplificados
window.mostrarAlerta = (t, m, type) => {
  return new Promise((r) => {
    alert(`${t}: ${m}`); // Fallback rápido para debug
    r(true);
  });
};
window.confirmarAcao = (t, m) => {
  return new Promise((r) => {
    const res = confirm(`${t}\n${m}`);
    r(res);
  });
};
