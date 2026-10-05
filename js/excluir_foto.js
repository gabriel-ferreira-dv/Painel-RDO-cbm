let fotoParaExcluir = null;
let esperaAviso = null;

function mostrarAvisoFlutuante(texto) {
  const el = document.getElementById('aviso-flutuante');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(esperaAviso);
  esperaAviso = setTimeout(() => { el.hidden = true; }, 5000);
}

function abrirExclusaoDaFotoAtual() {
  if (!ehAdminPainel || indiceLightbox < 0) return;
  const item = galeria.itens[indiceLightbox];
  if (!item || item.foto.id == null) return;
  fotoParaExcluir = item;
  const { foto, registro: r } = item;
  document.getElementById('previa-excluir-foto').src = galeria.urls.get(foto.caminho_storage) || '';
  document.getElementById('info-excluir-foto').innerHTML = r
    ? `<b>${escaparHtml(descreverServico(r))}</b><br>`
      + `${escaparHtml(r.encarregado)} · ${formatarDataHora(foto.criado_em)}<br>`
      + `${escaparHtml(r.trecho)} · KM ${escaparHtml(descreverKm(r))} · Estaca ${escaparHtml(descreverEstaca(r))}`
    : formatarDataHora(foto.criado_em);
  document.getElementById('motivo-excluir-foto').value = '';
  document.getElementById('erro-excluir-foto').hidden = true;
  const botao = document.getElementById('confirmar-excluir-foto');
  botao.disabled = false;
  botao.textContent = 'Excluir foto';
  document.getElementById('dialogo-excluir-foto').showModal();
}

async function confirmarExclusaoDeFoto() {
  if (!fotoParaExcluir) return;
  const botao = document.getElementById('confirmar-excluir-foto');
  const erroEl = document.getElementById('erro-excluir-foto');
  botao.disabled = true;
  botao.textContent = 'Excluindo…';
  erroEl.hidden = true;
  const id = fotoParaExcluir.foto.id;
  const { error } = await sb.rpc('excluir_foto_painel', {
    p_id: id,
    p_motivo: document.getElementById('motivo-excluir-foto').value.trim(),
  });
  if (error) {
    erroEl.textContent = 'Não foi possível excluir: ' + error.message;
    erroEl.hidden = false;
    botao.disabled = false;
    botao.textContent = 'Excluir foto';
    return;
  }
  fotoParaExcluir = null;
  document.getElementById('dialogo-excluir-foto').close();
  fecharLightbox();
  cacheFotos = cacheFotos.filter(f => f.id !== id);
  aplicarFiltrosLocais();
  mostrarAvisoFlutuante('Foto excluída. Para desfazer, use "Fotos excluídas" na página Movimentações.');
}

let registroParaExcluir = null;

function abrirExclusaoDeRegistro(id) {
  if (!ehAdminPainel) return;
  const r = cacheRegistros.find(x => x.id === id);
  if (!r) return;
  registroParaExcluir = r;
  const qtdFotos = cacheFotos.filter(f => f.dispositivo_id === r.dispositivo_id && f.registro_id_local === r.id_local).length;
  document.getElementById('info-excluir-registro').innerHTML =
    `<b>${escaparHtml(descreverServico(r))}</b><br>`
    + `${escaparHtml(r.atividade)} · ${escaparHtml(r.encarregado)} · ${formatarDataHora(r.criado_em)}<br>`
    + `${escaparHtml(r.trecho)}${r.via ? ' · ' + escaparHtml(r.via) : ''} · KM ${escaparHtml(descreverKm(r))} · Estaca ${escaparHtml(descreverEstaca(r))}`
    + (descreverMedicao(r) ? `<br>Medição: ${escaparHtml(descreverMedicao(r))}` : '')
    + (qtdFotos ? `<br><b>${qtdFotos} foto(s)</b> deste registro também deixarão de aparecer.` : '');
  document.getElementById('motivo-excluir-registro').value = '';
  document.getElementById('erro-excluir-registro').hidden = true;
  const botao = document.getElementById('confirmar-excluir-registro');
  botao.disabled = false;
  botao.textContent = 'Excluir registro';
  document.getElementById('dialogo-excluir-registro').showModal();
}

async function confirmarExclusaoDeRegistro() {
  if (!registroParaExcluir) return;
  const botao = document.getElementById('confirmar-excluir-registro');
  const erroEl = document.getElementById('erro-excluir-registro');
  botao.disabled = true;
  botao.textContent = 'Excluindo…';
  erroEl.hidden = true;
  const r = registroParaExcluir;
  const { error } = await sb.rpc('excluir_registro_painel', {
    p_id: r.id,
    p_motivo: document.getElementById('motivo-excluir-registro').value.trim(),
  });
  if (error) {
    erroEl.textContent = 'Não foi possível excluir: ' + error.message;
    erroEl.hidden = false;
    botao.disabled = false;
    botao.textContent = 'Excluir registro';
    return;
  }
  registroParaExcluir = null;
  document.getElementById('dialogo-excluir-registro').close();
  cacheRegistros = cacheRegistros.filter(x => x.id !== r.id);
  popularSelectsDeFiltro();
  aplicarFiltrosLocais();
  mostrarAvisoFlutuante('Registro excluído. Para desfazer, use "Registros excluídos" na página Movimentações.');
}
