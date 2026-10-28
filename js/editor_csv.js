const LINHAS_POR_PAGINA_CSV = 100;
const LEITOR_DE_PLANILHA = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const INTEGRIDADE_DO_LEITOR = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw';

const editorCsv = {
  item: null,
  cabecalho: [],
  linhas: [],
  pagina: 0,
  filtro: '',
  soProblemas: false,
  alteracoes: 0,
  importacao: null,
  salvando: false,
};

function decodificarCsvEditor(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes).replace(/^﻿/, '');
  }
}

function separarCsv(texto, separador) {
  const linhas = [];
  let linha = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += ch;
      continue;
    }
    if (ch === '"' && campo === '') { aspas = true; continue; }
    if (ch === separador) { linha.push(campo); campo = ''; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
      continue;
    }
    campo += ch;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter(l => l.some(c => String(c).trim()));
}

function separadorProvavel(primeiraLinha) {
  if (primeiraLinha.includes(';')) return ';';
  if (primeiraLinha.includes('\t')) return '\t';
  return ',';
}

function limparCelula(v) {
  return String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/;/g, ',').trim();
}

function ajustarColunas(celulas) {
  const n = editorCsv.cabecalho.length;
  const linha = celulas.slice(0, n).map(c => String(c ?? ''));
  while (linha.length < n) linha.push('');
  return linha;
}

function problemasDaLinhaEditor(celulas) {
  if (celulas.every(c => !String(c).trim())) return [];
  return problemasDaLinha(editorCsv.item.nome, celulas.map(limparCelula));
}

function marcarAlteracao() {
  editorCsv.alteracoes++;
  atualizarRodapeEditor();
}

function abrirEditorCsv(item) {
  editorCsv.item = item;
  editorCsv.cabecalho = CABECALHOS_DOS_CSVS[item.nome].split(';');
  editorCsv.linhas = [];
  editorCsv.pagina = 0;
  editorCsv.filtro = '';
  editorCsv.soProblemas = false;
  editorCsv.alteracoes = 0;
  editorCsv.importacao = null;
  document.getElementById('titulo-editor-csv').textContent = `Editar ${item.rotulo}`;
  document.getElementById('info-editor-csv').textContent =
    `Obra ${item.filial_id} · ${item.nome} · versão atual: ${descreverVersao(item)}. Ao salvar, o arquivo editado substitui o atual só nesta obra e a versão sobe.`;
  document.getElementById('busca-editor-csv').value = '';
  document.getElementById('so-problemas-csv').checked = false;
  document.getElementById('barra-importacao-csv').hidden = true;
  document.getElementById('progresso-editor-csv').hidden = true;
  mostrarValidacaoEditor([]);
  bloquearEditor(true);
  document.getElementById('corpo-editor-csv').innerHTML = '<tr><td class="carregando">Carregando o arquivo atual…</td></tr>';
  document.getElementById('dialogo-editor-csv').showModal();
  carregarArquivoNoEditor(item);
}

async function carregarArquivoNoEditor(item) {
  try {
    if (item.arquivo) {
      const resposta = await fetch(urlPublicaDosDados(item.arquivo), { cache: 'no-store' });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      const texto = decodificarCsvEditor(new Uint8Array(await resposta.arrayBuffer()));
      if (editorCsv.item !== item) return;
      const linhas = separarCsv(texto, ';');
      if (linhas.length && linhas[0].length >= editorCsv.cabecalho.length) editorCsv.cabecalho = linhas[0].map(c => c.trim());
      editorCsv.linhas = linhas.slice(1).map(ajustarColunas);
    } else {
      mostrarValidacaoEditor([{ tipo: 'aviso', texto: 'Esta obra ainda não tem este arquivo. Preencha as linhas aqui ou importe um CSV ou uma planilha do Excel.' }]);
    }
  } catch (e) {
    if (editorCsv.item !== item) return;
    mostrarValidacaoEditor([{ tipo: 'erro', texto: `Não foi possível abrir o arquivo atual (${e.message}). Você pode importar um arquivo para começar.` }]);
  }
  if (editorCsv.item !== item) return;
  bloquearEditor(false);
  renderizarEditorCsv();
}

function bloquearEditor(bloqueado) {
  for (const id of ['busca-editor-csv', 'so-problemas-csv', 'nova-linha-csv', 'importar-csv', 'baixar-editor-csv', 'salvar-editor-csv']) {
    document.getElementById(id).disabled = bloqueado;
  }
}

function linhasVisiveis() {
  const termo = normalizarCabecalho(editorCsv.filtro);
  const indices = [];
  editorCsv.linhas.forEach((celulas, i) => {
    if (termo && !celulas.some(c => normalizarCabecalho(c).includes(termo))) return;
    if (editorCsv.soProblemas && problemasDaLinhaEditor(celulas).length === 0) return;
    indices.push(i);
  });
  return indices;
}

function htmlDaLinhaEditor(i) {
  const celulas = editorCsv.linhas[i];
  const problemas = problemasDaLinhaEditor(celulas);
  return `<tr data-i="${i}"${problemas.length ? ` class="com-problema" title="${hd(problemas.join('; '))}"` : ''}>
    <td class="num-linha">${i + 1}</td>
    ${celulas.map((v, c) => `<td><input data-c="${c}" value="${hd(v)}" aria-label="${hd(editorCsv.cabecalho[c])}, linha ${i + 1}" spellcheck="false"></td>`).join('')}
    <td class="col-remover"><button type="button" class="remover-linha" data-remover title="Excluir a linha ${i + 1}" aria-label="Excluir a linha ${i + 1}">×</button></td>
  </tr>`;
}

function renderizarEditorCsv() {
  const visiveis = linhasVisiveis();
  const paginas = Math.max(1, Math.ceil(visiveis.length / LINHAS_POR_PAGINA_CSV));
  editorCsv.pagina = Math.min(editorCsv.pagina, paginas - 1);
  const inicio = editorCsv.pagina * LINHAS_POR_PAGINA_CSV;
  const pagina = visiveis.slice(inicio, inicio + LINHAS_POR_PAGINA_CSV);
  document.getElementById('cabeca-editor-csv').innerHTML =
    `<tr><th class="num-linha">#</th>${editorCsv.cabecalho.map(c => `<th>${hd(c)}</th>`).join('')}<th class="col-remover"><span class="sr-only">Excluir</span></th></tr>`;
  document.getElementById('corpo-editor-csv').innerHTML = pagina.map(htmlDaLinhaEditor).join('')
    || `<tr><td colspan="${editorCsv.cabecalho.length + 2}" class="vazio">${editorCsv.linhas.length ? 'Nenhuma linha com esse filtro.' : 'Nenhuma linha. Use "+ Linha" ou importe um arquivo.'}</td></tr>`;
  document.getElementById('pagina-editor-csv').textContent = visiveis.length
    ? `Linhas ${inicio + 1}–${inicio + pagina.length} de ${visiveis.length}${visiveis.length !== editorCsv.linhas.length ? ` (filtradas de ${editorCsv.linhas.length})` : ''}`
    : '';
  document.getElementById('anterior-editor-csv').disabled = editorCsv.pagina === 0;
  document.getElementById('proxima-editor-csv').disabled = editorCsv.pagina >= paginas - 1;
  atualizarRodapeEditor();
}

function atualizarRodapeEditor() {
  const comProblema = editorCsv.linhas.filter(l => problemasDaLinhaEditor(l).length).length;
  const partes = [`${editorCsv.linhas.length} linha(s)`];
  if (comProblema) partes.push(`${comProblema} com problema`);
  if (editorCsv.alteracoes) partes.push('alterações não salvas');
  const el = document.getElementById('estado-editor-csv');
  el.textContent = partes.join(' · ');
  el.classList.toggle('com-problema', comProblema > 0);
}

function atualizarLinhaNaTela(i) {
  const tr = document.querySelector(`#corpo-editor-csv tr[data-i="${i}"]`);
  if (!tr) return;
  const problemas = problemasDaLinhaEditor(editorCsv.linhas[i]);
  tr.classList.toggle('com-problema', problemas.length > 0);
  if (problemas.length) tr.title = problemas.join('; ');
  else tr.removeAttribute('title');
}

function aoEditarCelula(e) {
  const input = e.target.closest('input[data-c]');
  if (!input) return;
  const i = Number(input.closest('tr').dataset.i);
  editorCsv.linhas[i][Number(input.dataset.c)] = input.value;
  atualizarLinhaNaTela(i);
  marcarAlteracao();
}

function aoColarNoEditor(e) {
  const input = e.target.closest('input[data-c]');
  if (!input) return;
  const texto = e.clipboardData?.getData('text') || '';
  if (!/[\t\n]/.test(texto.replace(/\r?\n$/, ''))) return;
  e.preventDefault();
  const bloco = separarCsv(texto, '\t');
  const i0 = Number(input.closest('tr').dataset.i);
  const c0 = Number(input.dataset.c);
  bloco.forEach((celulas, d) => {
    const i = i0 + d;
    if (i >= editorCsv.linhas.length) editorCsv.linhas.push(ajustarColunas([]));
    celulas.forEach((v, k) => {
      if (c0 + k < editorCsv.cabecalho.length) editorCsv.linhas[i][c0 + k] = v.trim();
    });
  });
  marcarAlteracao();
  renderizarEditorCsv();
  avisarDados(`${bloco.length} linha(s) coladas a partir da linha ${i0 + 1}.`);
}

function aoTeclarNoEditor(e) {
  if (e.key !== 'Enter') return;
  const input = e.target.closest('input[data-c]');
  if (!input) return;
  e.preventDefault();
  const tr = e.shiftKey ? input.closest('tr').previousElementSibling : input.closest('tr').nextElementSibling;
  tr?.querySelector(`input[data-c="${input.dataset.c}"]`)?.focus();
}

function aoClicarNoEditor(e) {
  const botao = e.target.closest('button[data-remover]');
  if (!botao) return;
  const i = Number(botao.closest('tr').dataset.i);
  editorCsv.linhas.splice(i, 1);
  marcarAlteracao();
  renderizarEditorCsv();
}

function novaLinhaCsv() {
  editorCsv.linhas.push(ajustarColunas([]));
  editorCsv.filtro = '';
  editorCsv.soProblemas = false;
  document.getElementById('busca-editor-csv').value = '';
  document.getElementById('so-problemas-csv').checked = false;
  editorCsv.pagina = Math.ceil(editorCsv.linhas.length / LINHAS_POR_PAGINA_CSV) - 1;
  marcarAlteracao();
  renderizarEditorCsv();
  const ultima = editorCsv.linhas.length - 1;
  const input = document.querySelector(`#corpo-editor-csv tr[data-i="${ultima}"] input[data-c="0"]`);
  input?.scrollIntoView({ block: 'nearest' });
  input?.focus();
}

function carregarLeitorDePlanilha() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolver, rejeitar) => {
    const s = document.createElement('script');
    s.src = LEITOR_DE_PLANILHA;
    s.integrity = INTEGRIDADE_DO_LEITOR;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolver(window.XLSX);
    s.onerror = () => rejeitar(new Error('não foi possível carregar o leitor de planilhas. Confira a internet ou salve a planilha como CSV'));
    document.head.appendChild(s);
  });
}

async function lerArquivoImportado(arquivo) {
  if (/\.(xlsx|xls|ods)$/i.test(arquivo.name)) {
    const XLSX = await carregarLeitorDePlanilha();
    const livro = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' });
    const aba = livro.SheetNames[0];
    const linhas = XLSX.utils.sheet_to_json(livro.Sheets[aba], { header: 1, raw: false, defval: '' })
      .map(l => l.map(c => String(c ?? '')))
      .filter(l => l.some(c => c.trim()));
    return { linhas, origem: `aba "${aba}"` };
  }
  const texto = decodificarCsvEditor(new Uint8Array(await arquivo.arrayBuffer()));
  const separador = separadorProvavel(texto.split(/\r?\n/, 1)[0] || '');
  const nomes = { ';': 'ponto e vírgula', '\t': 'tabulação', ',': 'vírgula' };
  return { linhas: separarCsv(texto, separador), origem: `separado por ${nomes[separador]}` };
}

async function aoEscolherImportacao() {
  const entrada = document.getElementById('arquivo-importar-csv');
  const arquivo = entrada.files[0];
  entrada.value = '';
  if (!arquivo || !editorCsv.item) return;
  mostrarValidacaoEditor([{ tipo: 'aviso', texto: `Lendo ${arquivo.name}…` }]);
  let lido;
  try {
    lido = await lerArquivoImportado(arquivo);
  } catch (e) {
    mostrarValidacaoEditor([{ tipo: 'erro', texto: `Não foi possível ler ${arquivo.name}: ${e.message}.` }]);
    return;
  }
  const avisos = [];
  let linhas = lido.linhas;
  if (linhas.length && colunasErradas(editorCsv.item.nome, linhas[0]).length === 0) {
    linhas = linhas.slice(1);
  } else if (linhas.length) {
    avisos.push({ tipo: 'aviso', texto: `A primeira linha não tem os títulos de ${editorCsv.item.nome}; ela entrou como dado. Confira se as colunas estão na ordem: ${editorCsv.cabecalho.join(' · ')}.` });
  }
  const largura = Math.max(0, ...linhas.map(l => l.length));
  if (largura > editorCsv.cabecalho.length) {
    avisos.push({ tipo: 'aviso', texto: `O arquivo tem ${largura} colunas; só as ${editorCsv.cabecalho.length} primeiras entram.` });
  }
  if (linhas.length === 0) {
    mostrarValidacaoEditor([{ tipo: 'erro', texto: `${arquivo.name} não tem linhas de dados.` }]);
    return;
  }
  editorCsv.importacao = { linhas: linhas.map(ajustarColunas) };
  mostrarValidacaoEditor(avisos);
  document.getElementById('texto-importacao-csv').textContent =
    `${arquivo.name} (${lido.origem}): ${linhas.length} linha(s). O que fazer com as ${editorCsv.linhas.length} linha(s) atuais?`;
  document.getElementById('barra-importacao-csv').hidden = false;
}

function aplicarImportacao(modo) {
  const importacao = editorCsv.importacao;
  document.getElementById('barra-importacao-csv').hidden = true;
  editorCsv.importacao = null;
  if (!importacao) return;
  editorCsv.linhas = modo === 'substituir' ? importacao.linhas : editorCsv.linhas.concat(importacao.linhas);
  editorCsv.filtro = '';
  editorCsv.soProblemas = false;
  document.getElementById('busca-editor-csv').value = '';
  document.getElementById('so-problemas-csv').checked = false;
  editorCsv.pagina = modo === 'substituir' ? 0 : Math.floor((editorCsv.linhas.length - importacao.linhas.length) / LINHAS_POR_PAGINA_CSV);
  marcarAlteracao();
  renderizarEditorCsv();
  avisarDados(modo === 'substituir'
    ? `Linhas substituídas: ${importacao.linhas.length}. Confira e salve para subir a versão.`
    : `${importacao.linhas.length} linha(s) acrescentadas no fim. Confira e salve para subir a versão.`);
}

function mostrarValidacaoEditor(itens) {
  const ul = document.getElementById('validacao-editor-csv');
  ul.hidden = itens.length === 0;
  ul.innerHTML = itens.map(i => `<li class="${i.tipo}">${hd(i.texto)}</li>`).join('');
}

function textoDoEditor() {
  const linhas = editorCsv.linhas
    .map(l => l.map(limparCelula))
    .filter(l => l.some(Boolean));
  return '﻿' + [editorCsv.cabecalho.map(limparCelula), ...linhas].map(l => l.join(';')).join('\r\n') + '\r\n';
}

function arquivoDoEditor() {
  return new File([textoDoEditor()], editorCsv.item.nome, { type: 'text/csv' });
}

function baixarEditorCsv() {
  const url = URL.createObjectURL(arquivoDoEditor());
  const a = document.createElement('a');
  a.href = url;
  a.download = `${editorCsv.item.filial_id}_${editorCsv.item.nome}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function salvarEditorCsv() {
  const item = editorCsv.item;
  if (!item || editorCsv.salvando) return;
  const comProblema = [];
  editorCsv.linhas.forEach((l, i) => {
    const p = problemasDaLinhaEditor(l);
    if (p.length) comProblema.push(`linha ${i + 1}: ${p.join(', ')}`);
  });
  if (comProblema.length) {
    mostrarValidacaoEditor([{ tipo: 'erro', texto: `${comProblema.length} linha(s) com problema: ${comProblema.slice(0, 5).join('; ')}${comProblema.length > 5 ? '…' : ''}. Marque "Só linhas com problema" para achar e corrigir.` }]);
    return;
  }
  const arquivo = arquivoDoEditor();
  const conferido = await validarCsv(arquivo, item.nome);
  if (!conferido.ok) {
    mostrarValidacaoEditor(conferido.avisos);
    return;
  }
  const progresso = document.getElementById('progresso-editor-csv');
  const texto = document.getElementById('texto-progresso-editor-csv');
  const barra = document.getElementById('barra-progresso-editor-csv');
  editorCsv.salvando = true;
  bloquearEditor(true);
  document.getElementById('fechar-editor-csv').disabled = true;
  mostrarValidacaoEditor(conferido.avisos);
  progresso.hidden = false;
  barra.value = 0;
  try {
    const versao = await enviarArquivoDaObra(item, arquivo, (f) => {
      barra.value = f;
      texto.textContent = f < 1 ? `Enviando o arquivo… ${Math.round(f * 100)}%` : 'Subindo a versão…';
    });
    editorCsv.alteracoes = 0;
    document.getElementById('dialogo-editor-csv').close();
    avisarDados(`${item.rotulo} da obra ${item.filial_id} atualizado para a versão ${versao}.`);
    await carregarDados();
  } catch (e) {
    progresso.hidden = true;
    mostrarValidacaoEditor([{ tipo: 'erro', texto: textoDoErroDados(e) }]);
  } finally {
    editorCsv.salvando = false;
    bloquearEditor(false);
    document.getElementById('fechar-editor-csv').disabled = false;
  }
}

function fecharEditorCsv() {
  if (editorCsv.salvando) return false;
  if (editorCsv.alteracoes && !confirm('Descartar as alterações que não foram salvas?')) return false;
  editorCsv.item = null;
  document.getElementById('dialogo-editor-csv').close();
  return true;
}

let esperaBuscaCsv = null;
document.getElementById('busca-editor-csv').addEventListener('input', (e) => {
  clearTimeout(esperaBuscaCsv);
  esperaBuscaCsv = setTimeout(() => {
    editorCsv.filtro = e.target.value;
    editorCsv.pagina = 0;
    renderizarEditorCsv();
  }, 200);
});
document.getElementById('so-problemas-csv').addEventListener('change', (e) => {
  editorCsv.soProblemas = e.target.checked;
  editorCsv.pagina = 0;
  renderizarEditorCsv();
});
document.getElementById('anterior-editor-csv').addEventListener('click', () => { editorCsv.pagina--; renderizarEditorCsv(); });
document.getElementById('proxima-editor-csv').addEventListener('click', () => { editorCsv.pagina++; renderizarEditorCsv(); });
document.getElementById('nova-linha-csv').addEventListener('click', novaLinhaCsv);
document.getElementById('importar-csv').addEventListener('click', () => document.getElementById('arquivo-importar-csv').click());
document.getElementById('arquivo-importar-csv').addEventListener('change', aoEscolherImportacao);
document.getElementById('substituir-importacao-csv').addEventListener('click', () => aplicarImportacao('substituir'));
document.getElementById('acrescentar-importacao-csv').addEventListener('click', () => aplicarImportacao('acrescentar'));
document.getElementById('cancelar-importacao-csv').addEventListener('click', () => {
  editorCsv.importacao = null;
  document.getElementById('barra-importacao-csv').hidden = true;
});
const corpoEditorCsv = document.getElementById('corpo-editor-csv');
corpoEditorCsv.addEventListener('input', aoEditarCelula);
corpoEditorCsv.addEventListener('paste', aoColarNoEditor);
corpoEditorCsv.addEventListener('keydown', aoTeclarNoEditor);
corpoEditorCsv.addEventListener('click', aoClicarNoEditor);
document.getElementById('baixar-editor-csv').addEventListener('click', baixarEditorCsv);
document.getElementById('salvar-editor-csv').addEventListener('click', salvarEditorCsv);
document.getElementById('fechar-editor-csv').addEventListener('click', fecharEditorCsv);
document.getElementById('dialogo-editor-csv').addEventListener('cancel', (e) => {
  e.preventDefault();
  fecharEditorCsv();
});
window.addEventListener('beforeunload', (e) => {
  if (editorCsv.item && editorCsv.alteracoes) e.preventDefault();
});
