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

// 👇 SUAS COORDENADAS NOVAS AQUI
const POSICOES_LIMPEZA = {
  nome: { x: 180, y: 380 },
  id: { x: 550, y: 380 },
  rg: { x: 180, y: 440 },
  data: { x: 680, y: 380 },
  corTexto: "#000000",
  fonte: "bold 30px 'Arial'",
};

let dbPortes = [];

// ==========================================
// 🚀 INICIALIZAÇÃO
// ==========================================
document.addEventListener("DOMContentLoaded", async function () {
  console.log("🚀 Sistema Iniciado");

  try {
    configurarBotoes(); // <--- AQUI ESTA A CORREÇÃO DOS BOTÕES
    ativarFormatacaoDinheiro();
  } catch (e) {
    console.error("Erro config:", e);
  }

  const hash = window.location.hash;
  const isLoginPage = window.location.pathname.includes("login.html");
  const sessao = localStorage.getItem("pc_session");

  if (hash.includes("access_token")) {
    const fragment = new URLSearchParams(hash.slice(1));
    const accessToken = fragment.get("access_token");
    const tokenType = fragment.get("token_type");
    window.history.replaceState({}, document.title, window.location.pathname);
    await validarLoginNaAPI(`${tokenType} ${accessToken}`);
    return;
  }

  if (sessao) {
    if (isLoginPage) {
      window.location.href = "index.html";
    } else {
      document.body.style.display = "block";
      try {
        const user = JSON.parse(sessao);
        iniciarSistema(user);
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
// 🔘 CONFIGURAÇÃO DOS BOTÕES (CORRIGIDO)
// ==========================================
function configurarBotoes() {
  console.log("🔧 Configurando botões...");

  // 1. Botão de Gerar Prévia
  const btnPreview = document.getElementById("btn-gerar-previa");

  if (btnPreview) {
    // Clona para remover eventos antigos (limpa a memória do botão)
    const novoBtn = btnPreview.cloneNode(true);
    btnPreview.parentNode.replaceChild(novoBtn, btnPreview);

    novoBtn.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("🖱️ Botão Prévia Clicado");
      window.gerarPreviewPorte();
    });
    console.log("✅ Botão de Prévia encontrado e configurado.");
  } else {
    console.error("❌ ERRO: Botão 'btn-gerar-previa' não achado no HTML.");
  }

  // 2. Botão de Emitir Final (que aparece depois da prévia)
  const btnEmitir = document.getElementById("btn-emitir-final");
  if (btnEmitir) {
    const novoBtnEmitir = btnEmitir.cloneNode(true);
    btnEmitir.parentNode.replaceChild(novoBtnEmitir, btnEmitir);

    novoBtnEmitir.addEventListener("click", async () => {
      await processarEmissao();
    });
  }
}
// ==========================================
// 💰 FORMATAÇÃO DE DINHEIRO
// ==========================================
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
// 🧼 AÇÃO DE LIMPEZA
// ==========================================
window.processarLimpeza = async function () {
  const nome = (document.getElementById("limpeza-nome")?.value || "").trim();
  const id = (document.getElementById("limpeza-id")?.value || "").trim();
  const rg = (document.getElementById("limpeza-rg")?.value || "").trim();
  const valor = (
    document.getElementById("input-valor-limpeza")?.value || "0"
  ).trim();

  if (!nome || !id) {
    return mostrarAlerta(
      "Dados Incompletos",
      "Preencha os campos NOME e PASSAPORTE na tela de Limpeza.",
      "warning"
    );
  }

  const confirmou = await confirmarAcao(
    "Limpar Ficha?",
    `Confirmar limpeza para ${nome} no valor de R$ ${valor}?`
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
    const avatarUrl = sessao.avatar
      ? `https://cdn.discordapp.com/avatars/${sessao.id}/${sessao.avatar}.png`
      : "";

    const mensagemExterna = `🧼 **LIMPEZA DE FICHA REALIZADA**\nProcedimento realizado por ${mencaoOficial}.`;

    const embedLimpeza = {
      title: `🧼 CERTIFICADO DE BONS ANTECEDENTES`,
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
      footer: { text: `Departamento de Justiça`, icon_url: avatarUrl },
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

// ==========================================
// 🧼 GERADOR DE IMAGEM LIMPEZA
// ==========================================
function gerarBlobLimpeza(nome, id, rg) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    // Use o nome do seu arquivo aqui (bg_limpeza.png ou limpeza.png)
    img.src = "assets/bg_limpeza.png";

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      ctx.font = POSICOES_LIMPEZA.fonte;
      ctx.fillStyle = POSICOES_LIMPEZA.corTexto;
      ctx.textAlign = "left";

      // Dados (usando suas novas coordenadas)
      ctx.fillText(
        nome.toUpperCase(),
        POSICOES_LIMPEZA.nome.x,
        POSICOES_LIMPEZA.nome.y
      );
      ctx.fillText(id, POSICOES_LIMPEZA.id.x, POSICOES_LIMPEZA.id.y);
      ctx.fillText(rg || "N/A", POSICOES_LIMPEZA.rg.x, POSICOES_LIMPEZA.rg.y);

      const dataHoje = new Date().toLocaleDateString("pt-BR");
      ctx.fillText(dataHoje, POSICOES_LIMPEZA.data.x, POSICOES_LIMPEZA.data.y);

      canvas.toBlob((blob) => resolve(blob), "image/png");
    };

    img.onerror = () => reject(new Error("Imagem da limpeza não encontrada."));
  });
}

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
  }
}

// ==========================================
// 👁️ GERAR PREVIEW DO PORTE (VISUAL CORRIGIDO)
// ==========================================
window.gerarPreviewPorte = function () {
  console.log("📸 Iniciando geração de preview...");

  // Pega os elementos
  const container = document.getElementById("preview-porte-container");
  const canvas = document.getElementById("canvas-porte");
  const imgPreview = document.getElementById("img-porte-final"); // A tag <img> onde vamos mostrar

  // Pega os dados
  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const arma = document.getElementById("porte-arma").value;
  const rg = document.getElementById("porte-rg").value;
  const expedicao = document.getElementById("porte-expedicao").value;
  const validade = document.getElementById("porte-validade").value;

  if (!nome || !id) {
    return mostrarAlerta(
      "Dados Faltando",
      "Preencha pelo menos o Nome e o Passaporte.",
      "warning"
    );
  }

  const ctx = canvas.getContext("2d");
  const imgBase = new Image();

  // Seleciona a base correta
  if (arma === "GLOCK") imgBase.src = "assets/porte_glock.png";
  else if (arma === "MP5") imgBase.src = "assets/porte_mp5.png";
  else imgBase.src = "assets/porte_taser.png";

  imgBase.onload = () => {
    // 1. Ajusta o tamanho do canvas ao da imagem
    canvas.width = imgBase.width;
    canvas.height = imgBase.height;

    // 2. Desenha a base
    ctx.drawImage(imgBase, 0, 0);

    // 3. Configura o texto
    ctx.font = POSICOES.fonte;
    ctx.fillStyle = POSICOES.corTexto;

    // 4. Escreve os dados nas coordenadas (POSICOES definido no início do arquivo)
    ctx.fillText(
      nome.toUpperCase(),
      POSICOES.nome.x,
      POSICOES.nome.y,
      POSICOES.nome.max
    );
    ctx.fillText(id, POSICOES.id.x, POSICOES.id.y);
    ctx.fillText(rg, POSICOES.rg.x, POSICOES.rg.y);
    ctx.fillText(expedicao, POSICOES.expedicao.x, POSICOES.expedicao.y);
    ctx.fillText(validade, POSICOES.validade.x, POSICOES.validade.y);

    // 5. MÁGICA: Transfere do Canvas para a Imagem visível
    const dataUrl = canvas.toDataURL("image/png");
    imgPreview.src = dataUrl;
    imgPreview.style.display = "block"; // Garante que a imagem apareça

    // 6. Mostra o container cinza
    container.classList.remove("hidden");
    container.style.display = "block";

    // Reconfigura o botão de confirmar que estava escondido
    configurarBotoes();
  };

  imgBase.onerror = () => {
    mostrarAlerta(
      "Erro de Arquivo",
      `Não foi possível carregar a imagem: ${imgBase.src}. Verifique a pasta assets.`,
      "error"
    );
  };
};

async function processarEmissao() {
  const nome = document.getElementById("porte-nome").value;
  const id = document.getElementById("porte-id").value;
  const rg = document.getElementById("porte-rg").value;
  const arma = document.getElementById("porte-arma").value;
  const validade = document.getElementById("porte-validade").value;
  const expedicao = document.getElementById("porte-expedicao").value;

  mostrarAlerta("Aguarde", "Gerando documento...", "warning");
  const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
  const mencaoOficial = sessao.id
    ? `<@${sessao.id}>`
    : `**${sessao.username || "Oficial"}**`;
  const msg = `✅ **PORTE APROVADO**\nEmitido por ${mencaoOficial}.`;

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
        { name: "📅 Validade", value: `\`${validade}\``, inline: true },
        { name: "🔫 Armamento", value: arma, inline: false },
      ],
      image: { url: `attachment://${nomeArquivo}` },
      footer: {
        text: "Polícia Civil",
        icon_url: sessao.avatar
          ? `https://cdn.discordapp.com/avatars/${sessao.id}/${sessao.avatar}.png`
          : "",
      },
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
    }
  });
}

// ... (RESTANTE DO CÓDIGO DE REVOGAÇÃO E AUXILIARES MANTIDO IGUAL)
window.revogar = async function (id) {
  const p = dbPortes.find((x) => String(x.id) === String(id));
  if (!p) return mostrarAlerta("Erro", "Registro não encontrado.", "error");

  if (!(await confirmarAcao("Revogar?", `Revogar porte de ${p.nome}?`))) return;

  mostrarAlerta("Processando", "Revogando...", "warning");
  const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
  const mencao = sessao.id ? `<@${sessao.id}>` : sessao.username;

  try {
    const blob = await gerarBlobRevogacao(p);
    const nomeArq = `revogacao_${id}.png`;
    const embed = {
      title: `🚫 REVOGADO: ${p.arma}`,
      description: "Porte cancelado.",
      color: 15548997,
      fields: [
        { name: "👤 Cidadão", value: p.nome, inline: true },
        { name: "🆔 ID", value: p.id, inline: true },
      ],
      image: { url: `attachment://${nomeArq}` },
    };

    if (
      await enviarParaAPI(
        blob,
        nomeArq,
        "revogacao",
        embed,
        `🚨 REVOGADO por ${mencao}`
      )
    ) {
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
      mostrarAlerta("Sucesso", "Revogado!", "success");
    }
  } catch (e) {
    console.error(e);
    mostrarAlerta("Erro", "Falha na revogação.", "error");
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
    mostrarAlerta("Erro", "Falha API", "error");
    return false;
  }
}

window.renderTables = function () {
  const tbodyAtivos = document.getElementById("lista-ativos-para-revogar");
  const tbodyRev = document.getElementById("lista-ja-revogados");
  const busca =
    document.getElementById("input-busca")?.value.toLowerCase() || "";
  if (tbodyAtivos) tbodyAtivos.innerHTML = "";
  if (tbodyRev) tbodyRev.innerHTML = "";

  const lista = dbPortes
    .filter(
      (p) =>
        !busca || p.nome.toLowerCase().includes(busca) || p.id.includes(busca)
    )
    .reverse();

  lista.forEach((p) => {
    if (p.status === "Ativo" && tbodyAtivos) {
      tbodyAtivos.innerHTML += `<tr><td>${p.nome}</td><td>${p.id}</td><td>${
        p.arma
      }</td><td>${
        p.validade || "N/A"
      }</td><td><button class="btn-danger" onclick="revogar('${
        p.id
      }')"><i class="fa-solid fa-ban"></i></button></td></tr>`;
    } else if (p.status === "Revogado" && tbodyRev) {
      tbodyRev.innerHTML += `<tr style="opacity:0.7"><td>${p.nome}</td><td>${
        p.id
      }</td><td>${
        p.expedicao || "Hoje"
      }</td><td><span class="badge revogado">REVOGADO</span></td></tr>`;
    }
  });
  atualizarStats();
};

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
window.navegar = (t) => {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.add("hidden"));
  document
    .querySelectorAll(".nav-links li")
    .forEach((l) => l.classList.remove("active"));
  const sec = document.getElementById(`sec-${t}`);
  if (sec) sec.classList.remove("hidden");
  const menu = document.getElementById(`menu-${t}`);
  if (menu) menu.classList.add("active");
  if (t === "emissao") configurarDatasAutomaticas();
};
window.mostrarAlerta = (t, m, type) => {
  return new Promise((r) => {
    const modal = document.getElementById("custom-modal");
    if (modal) {
      document.getElementById("modal-title").innerText = t;
      document.getElementById("modal-desc").innerText = m;
      modal.classList.remove("hidden");
      document.getElementById("btn-modal-confirm").onclick = () => {
        modal.classList.add("hidden");
        r(true);
      };
    } else {
      alert(`${t}\n${m}`);
      r(true);
    }
  });
};
window.confirmarAcao = (t, m) => new Promise((r) => r(confirm(`${t}\n${m}`)));
