window.revogar = async function (idPassaporte) {
  const p = dbPortes.find((x) => String(x.id) === String(idPassaporte));
  if (!p) return mostrarAlerta("Erro", "Registro não encontrado.", "error");

  const confirmou = await confirmarAcao(
    "REVOGAR PORTE?",
    `Deseja revogar o porte de ${p.nome}? Isso apagará o registro e preservará as metas.`,
    "danger"
  );
  if (!confirmou) return;

  // 1. Alerta de Processamento (Loading)
  Swal.fire({
    title: "Processando revogação",
    text: "O porte está sendo revogado, por favor aguarde...",
    icon: "info",
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });

  try {
    const sessao = JSON.parse(localStorage.getItem("pc_session") || "{}");
    const mencaoOficial = sessao.id
      ? `<@${sessao.id}>`
      : `**${sessao.username}**`;

    // Captura quem emitiu o porte (campo oficial vindo da API listar)
    const emissorOriginal = p.oficial || "Não Identificado";

    const blob = await gerarBlobRevogacao(p);
    const nomeArquivo = `revogacao_${idPassaporte}.png`;

    const embed = {
      title: "🚫 RELATÓRIO DE REVOGAÇÃO",
      color: 15548997,
      fields: [
        { name: "👤 Cidadão", value: `**${p.nome}**`, inline: true },
        { name: "🆔 Passaporte", value: `\`${p.id}\``, inline: true },
        { name: "👮 Revogado por", value: mencaoOficial, inline: true },
        { name: "📜 Emissor Original", value: emissorOriginal, inline: true }, // ESSENCIAL PARA A META
      ],
      image: { url: `attachment://${nomeArquivo}` },
      footer: FOOTER_PADRAO,
      timestamp: new Date().toISOString(),
    };

    // Envia o Log
    const logTexto = `🚨 **PORTE REVOGADO** | Cidadão: ${p.nome} | Revogado por: ${mencaoOficial}`;
    const sucessoLog = await enviarParaAPI(
      blob,
      nomeArquivo,
      "revogacao",
      embed,
      logTexto
    );

    if (sucessoLog) {
      // Deleta a mensagem original de emissão para limpar o canal
      if (p.message_id) {
        await fetch("/api/deletar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message_id: p.message_id }),
        });
      }

      // Atualiza localmente
      dbPortes = dbPortes.filter(
        (item) => String(item.id) !== String(idPassaporte)
      );
      renderTables();
      atualizarStats();

      // 2. Alerta de Sucesso (Fecha o loading automaticamente)
      Swal.fire({
        title: "Sucesso!",
        text: "Porte revogado e metas preservadas com sucesso.",
        icon: "success",
        timer: 3000,
        showConfirmButton: false,
      });
    }
  } catch (erro) {
    console.error(erro);
    Swal.fire("Erro", "Não foi possível completar a revogação.", "error");
  }
};
