let papelDados = null;
let itensDados = [];
let itemEmEnvio = null;
let arquivoValidado = null;
let enviandoDados = false;
let esperaAvisoDados = null;

const hd = (v) => escaparHtml(v ?? '');

const COLUNAS_DOS_CSVS = {
  'SevNotaveis.csv': [['atividade'], ['servico'], ['passo', 'correlato'], ['trecho']],
  'KMxEst.csv': [['trecho'], ['estaca'], ['km'], ['km']],
  'estacas_coords.csv': [['trecho'], ['estaca'], ['e'], ['n']],
};

const CABECALHOS_DOS_CSVS = {
  'SevNotaveis.csv': 'Atividade;Servico notavel;SERVIÇO CORRELATO (PASSO);Trecho',
  'KMxEst.csv': 'Trecho;TRECHO D ESTACA;TRECHO D km;KM resumido',
  'estacas_coords.csv': 'Trecho;TRECHO D ESTACA;UTM E;UTM N',
};

function mostrarTelaDados(id) {
  for (const t of ['tela-negado', 'pagina-admin']) document.getElementById(t).hidden = t !== id;
  document.documentElement.classList.remove('verificando');
}

function negarDados(texto) {
  document.getElementById('texto-negado').textContent = texto;
  mostrarTelaDados('tela-negado');
}

function avisarDados(texto) {
  const el = document.getElementById('aviso-flutuante');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(esperaAvisoDados);
  esperaAvisoDados = setTimeout(() => { el.hidden = true; }, 6000);
}

function erroDados(texto) {
  const el = document.getElementById('erro-envio');
  el.textContent = texto || '';
  el.hidden = !texto;
}

function textoDoErroDados(error) {
  const msg = String(error?.message || error || 'erro desconhecido');
  if (/could not find the function|relation .*dados_da_obra.* does not exist/i.test(msg)) {
    return 'As funções dos dados da obra ainda não estão no banco. Rode o arquivo dados_por_filial.sql no SQL Editor do Supabase.';
  }
  if (/row-level security|violates/i.test(msg)) {
    return 'O Storage recusou o arquivo: sua conta não pode enviar dados para esta obra (ou a política "adm envia dados da obra" não foi criada).';
  }
  return msg;
}

function filialEscolhida() {
  return document.getElementById('obra-dados').value;
}

function filiaisDosItens() {
  const vistas = new Map();
  for (const i of itensDados) if (!vistas.has(i.filial_id)) vistas.set(i.filial_id, i.filial_nome);
  return [...vistas.entries()].map(([id, nome]) => ({ id, nome }));
}

function preencherObras() {
  const select = document.getElementById('obra-dados');
  const escolhida = select.value || papelDados?.filial || '';
  const filiais = filiaisDosItens();
  select.innerHTML = filiais.map(f => `<option value="${hd(f.id)}">${hd(f.id)} · ${hd(f.nome)}</option>`).join('');
  select.value = filiais.some(f => f.id === escolhida) ? escolhida : (filiais[0]?.id || '');
  document.getElementById('campo-obra-dados').hidden = filiais.length <= 1;
}

function descreverVersao(i) {
  if (i.versao == null) return i.tipo === 'mapa' ? 'não enviado' : 'a do app (1)';
  if (i.versao === 1) return i.tipo === 'mapa' ? '1' : '1 (a do app)';
  return String(i.versao);
}

function renderizarDados() {
  const filial = filialEscolhida();
  const lista = itensDados.filter(i => i.filial_id === filial);
  document.getElementById('contagem-dados').textContent = lista.length ? `${lista.length} arquivos` : '';
  document.getElementById('corpo-dados').innerHTML = lista.map(i => `
    <tr>
      <td class="col-gestor"><b>${hd(i.rotulo)}</b><div class="email-gestor">${hd(i.nome)}${i.tipo === 'mapa' && i.linhas ? ` · grade ${i.linhas} x ${i.colunas}` : ''}</div></td>
      <td data-rotulo="Tipo">${i.tipo === 'mapa' ? 'Mapa (.zip)' : 'CSV'}</td>
      <td data-rotulo="Versão"><span class="selo-situacao ${i.versao == null ? 'aviso' : 'ok'}">${hd(descreverVersao(i))}</span></td>
      <td data-rotulo="Atualizado">${i.atualizado_em ? `${formatarDataHora(i.atualizado_em)}${i.atualizado_por ? `<div class="email-gestor">por ${hd(i.atualizado_por)}</div>` : ''}` : '—'}</td>
      <td class="col-acoes-usuario">
        <div class="acoes-usuario">
          ${i.arquivo ? `<a class="botao-editar-registro" href="${hd(urlPublicaDosDados(i.arquivo))}" download>Baixar atual</a>` : ''}
          ${i.tipo === 'mapa' ? '' : `<button type="button" class="botao-editar-registro" data-editar-csv="${hd(i.nome)}">Editar</button>`}
          <button type="button" class="botao-editar-registro" data-enviar="${hd(i.nome)}">Enviar novo</button>
        </div>
      </td>
    </tr>`).join('') || '<tr><td colspan="5" class="vazio">Nenhum arquivo para esta obra.</td></tr>';
}

function urlPublicaDosDados(arquivo) {
  return `${SUPABASE_URL}/storage/v1/object/public/dados/${String(arquivo).split('/').map(encodeURIComponent).join('/')}`;
}

async function carregarDados() {
  const status = document.getElementById('status-dados');
  status.textContent = 'Atualizando…';
  const { data, error } = await sb.rpc('dados_da_obra_painel');
  if (error) {
    status.textContent = '';
    document.getElementById('corpo-dados').innerHTML =
      `<tr><td colspan="5" class="vazio">Falha ao carregar: ${hd(textoDoErroDados(error))}</td></tr>`;
    return;
  }
  itensDados = data || [];
  preencherObras();
  renderizarDados();
  status.textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
}

function itemPorNome(nome) {
  return itensDados.find(i => i.filial_id === filialEscolhida() && i.nome === nome);
}

function abrirEnvio(item) {
  itemEmEnvio = item;
  arquivoValidado = null;
  document.getElementById('titulo-dialogo-envio').textContent = `Enviar ${item.rotulo}`;
  document.getElementById('info-dialogo-envio').textContent = item.tipo === 'mapa'
    ? `Obra ${item.filial_id}. Envie o .zip com os tiles .webp do mapa ${item.nome}${item.linhas ? ` (grade ${item.linhas} linhas x ${item.colunas} colunas)` : ''}. Versão atual: ${descreverVersao(item)}.`
    : `Obra ${item.filial_id}. Envie o ${item.nome} em UTF-8, separado por ponto e vírgula. Versão atual: ${descreverVersao(item)}.`;
  const entrada = document.getElementById('arquivo-envio');
  entrada.value = '';
  entrada.accept = item.tipo === 'mapa' ? '.zip,application/zip' : '.csv,text/csv';
  entrada.disabled = false;
  mostrarValidacao([]);
  erroDados('');
  document.getElementById('progresso-envio').hidden = true;
  document.getElementById('confirmar-envio').disabled = true;
  document.getElementById('cancelar-envio').disabled = false;
  document.getElementById('dialogo-envio').showModal();
}

function mostrarValidacao(itens) {
  const ul = document.getElementById('resultado-validacao');
  ul.hidden = itens.length === 0;
  ul.innerHTML = itens.map(i => `<li class="${i.tipo}">${hd(i.texto)}</li>`).join('');
}

function normalizarCabecalho(t) {
  return semAcento(t).toLowerCase().replace(/\s+/g, ' ').trim();
}

function numeroDoCsv(v) {
  const t = String(v || '').trim();
  if (!/^-?[\d.,]+$/.test(t)) return NaN;
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
}

function colunasErradas(nome, cabecalho) {
  return COLUNAS_DOS_CSVS[nome]
    .map((palavras, i) => ({ i, palavras, achado: normalizarCabecalho(cabecalho[i] || '') }))
    .filter(c => !c.palavras.some(p => c.achado === p || c.achado.split(/[^a-z0-9]+/).includes(p) || (p.length > 2 && c.achado.includes(p))));
}

function trechoDaLinha(nome, c) {
  return String((nome === 'SevNotaveis.csv' ? c[3] : c[0]) || '').trim();
}

function problemasDaLinha(nome, c) {
  const problemas = [];
  if (c.length < 4) return [`só ${c.length} coluna(s)`];
  if (!trechoDaLinha(nome, c) && nome !== 'SevNotaveis.csv') problemas.push('trecho vazio');
  if (nome === 'SevNotaveis.csv') {
    if (!c[0].trim() || !c[1].trim()) problemas.push('atividade ou serviço vazio');
  } else {
    if (!/^\s*\d+\s*$/.test(c[1])) problemas.push(`estaca "${c[1]}" não é número inteiro`);
    if (nome === 'estacas_coords.csv' && (Number.isNaN(numeroDoCsv(c[2])) || Number.isNaN(numeroDoCsv(c[3])))) {
      problemas.push(`UTM E/N "${c[2]}" / "${c[3]}" não é número`);
    }
    if (nome === 'KMxEst.csv' && c[2].trim() && Number.isNaN(numeroDoCsv(c[2]))) problemas.push(`KM "${c[2]}" não é número`);
  }
  return problemas;
}

async function validarCsv(arquivo, nome) {
  const avisos = [];
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  let texto;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, avisos: [{ tipo: 'erro', texto: 'O arquivo não está em UTF-8 (provavelmente foi salvo em ANSI pelo Excel). No Excel use Salvar como → "CSV UTF-8 (delimitado por vírgulas)".' }] };
  }
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (linhas.length < 2) return { ok: false, avisos: [{ tipo: 'erro', texto: 'O arquivo está vazio ou só tem o cabeçalho.' }] };
  const cabecalho = linhas[0].split(';');
  if (cabecalho.length < 4) {
    const outro = linhas[0].includes('\t') ? 'tabulação' : linhas[0].includes(',') ? 'vírgula' : '';
    return { ok: false, avisos: [{ tipo: 'erro', texto: `O cabeçalho não tem 4 colunas separadas por ponto e vírgula (;)${outro ? `: parece separado por ${outro}` : ''}. Esperado: ${CABECALHOS_DOS_CSVS[nome]}` }] };
  }
  const erradas = colunasErradas(nome, cabecalho);
  if (erradas.length) {
    return { ok: false, avisos: [{ tipo: 'erro', texto: `As colunas não são as de ${nome} (coluna ${erradas.map(c => `${c.i + 1}: "${cabecalho[c.i] || ''}"`).join(', ')}). Esperado: ${CABECALHOS_DOS_CSVS[nome]}` }] };
  }

  const problemas = [];
  const trechos = new Set();
  linhas.slice(1).forEach((linha, i) => {
    const c = linha.split(';');
    const trecho = trechoDaLinha(nome, c);
    if (trecho) trechos.add(trecho);
    for (const p of problemasDaLinha(nome, c)) problemas.push(`linha ${i + 2}: ${p}`);
  });
  if (problemas.length) {
    return {
      ok: false,
      avisos: [{ tipo: 'erro', texto: `${problemas.length} linha(s) com problema: ${problemas.slice(0, 5).join('; ')}${problemas.length > 5 ? '…' : ''}` }],
    };
  }
  avisos.push({ tipo: 'ok', texto: `UTF-8, separado por ; e com as colunas certas: ${linhas.length - 1} linhas.` });
  avisos.push({ tipo: 'ok', texto: `Trechos: ${[...trechos].slice(0, 12).join(', ')}${trechos.size > 12 ? ` e mais ${trechos.size - 12}` : ''}.` });
  return { ok: true, avisos };
}

async function fatiaDoArquivo(arquivo, inicio, fim) {
  return new Uint8Array(await arquivo.slice(inicio, fim).arrayBuffer());
}

async function entradasDoZip(arquivo) {
  const tamanho = arquivo.size;
  const cauda = await fatiaDoArquivo(arquivo, Math.max(0, tamanho - 65557), tamanho);
  const dv = new DataView(cauda.buffer, cauda.byteOffset, cauda.byteLength);
  let fimDir = -1;
  for (let i = cauda.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { fimDir = i; break; }
  }
  if (fimDir < 0) throw new Error('não é um .zip válido');
  const total = dv.getUint16(fimDir + 10, true);
  const dirTam = dv.getUint32(fimDir + 12, true);
  const dirIni = dv.getUint32(fimDir + 16, true);
  if (total === 0xffff || dirIni === 0xffffffff) throw new Error('zip64 não é aceito; gere o zip sem a opção zip64');
  const dir = await fatiaDoArquivo(arquivo, dirIni, dirIni + dirTam);
  const cv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const decodificador = new TextDecoder();
  const nomes = [];
  let p = 0;
  for (let i = 0; i < total && p + 46 <= dir.length; i++) {
    if (cv.getUint32(p, true) !== 0x02014b50) throw new Error('diretório do zip corrompido');
    const n = cv.getUint16(p + 28, true);
    const extra = cv.getUint16(p + 30, true);
    const coment = cv.getUint16(p + 32, true);
    nomes.push(decodificador.decode(dir.subarray(p + 46, p + 46 + n)));
    p += 46 + n + extra + coment;
  }
  return nomes;
}

async function validarZip(arquivo, item) {
  let nomes;
  try {
    nomes = await entradasDoZip(arquivo);
  } catch (e) {
    return { ok: false, avisos: [{ tipo: 'erro', texto: `Não foi possível ler o zip: ${e.message}.` }] };
  }
  const tiles = [];
  const pastas = new Set();
  let foraDoPadrao = 0;
  for (const nome of nomes) {
    if (nome.endsWith('/')) continue;
    const m = nome.match(/^(?:([^/]+)\/)?(\d+)_(\d+)\.webp$/i);
    if (!m) {
      if (/\.webp$/i.test(nome)) foraDoPadrao++;
      continue;
    }
    pastas.add(m[1] || '');
    tiles.push({ linha: parseInt(m[2], 10), coluna: parseInt(m[3], 10) });
  }
  if (tiles.length < 10) {
    return { ok: false, avisos: [{ tipo: 'erro', texto: `O zip tem ${tiles.length} tile(s) .webp com nome linha_coluna (ex.: 00_0.webp), na raiz ou numa única pasta. O app exige pelo menos 10.${foraDoPadrao ? ` Há ${foraDoPadrao} .webp em subpastas ou com outro nome.` : ''}` }] };
  }
  if (pastas.size > 1) {
    return { ok: false, avisos: [{ tipo: 'erro', texto: `Os tiles estão espalhados em ${pastas.size} pastas. Deixe todos na raiz do zip ou dentro de uma única pasta.` }] };
  }
  const avisos = [];
  if (item.linhas && item.colunas) {
    const fora = tiles.filter(t => t.linha >= item.linhas || t.coluna >= item.colunas);
    if (fora.length) {
      return { ok: false, avisos: [{ tipo: 'erro', texto: `${fora.length} tile(s) fora da grade da configuração (${item.linhas} x ${item.colunas}), ex.: ${fora[0].linha}_${fora[0].coluna}.webp. Se a grade mudou, peça ao ADMapp para ajustar a configuração da obra antes.` }] };
    }
    const esperado = item.linhas * item.colunas;
    avisos.push({ tipo: 'ok', texto: `${tiles.length} de ${esperado} tiles da grade ${item.linhas} x ${item.colunas}${pastas.has('') ? ', na raiz do zip' : `, na pasta ${[...pastas][0]}`}.` });
    if (tiles.length < esperado) avisos.push({ tipo: 'aviso', texto: `Faltam ${esperado - tiles.length} tiles: essas partes do mapa ficam em branco.` });
  } else {
    avisos.push({ tipo: 'ok', texto: `${tiles.length} tiles .webp.` });
  }
  if (foraDoPadrao) avisos.push({ tipo: 'aviso', texto: `${foraDoPadrao} arquivo(s) .webp fora do padrão serão ignorados.` });
  avisos.push({ tipo: 'ok', texto: `Tamanho: ${(arquivo.size / 1048576).toFixed(1).replace('.', ',')} MB.` });
  return { ok: true, avisos };
}

async function aoEscolherArquivo() {
  const arquivo = document.getElementById('arquivo-envio').files[0];
  arquivoValidado = null;
  erroDados('');
  document.getElementById('confirmar-envio').disabled = true;
  if (!arquivo || !itemEmEnvio) { mostrarValidacao([]); return; }
  const mapa = itemEmEnvio.tipo === 'mapa';
  if (mapa ? !/\.zip$/i.test(arquivo.name) : !/\.csv$/i.test(arquivo.name)) {
    mostrarValidacao([{ tipo: 'erro', texto: `Escolha um arquivo ${mapa ? '.zip' : '.csv'}.` }]);
    return;
  }
  mostrarValidacao([{ tipo: 'aviso', texto: 'Conferindo o arquivo…' }]);
  const item = itemEmEnvio;
  const resultado = mapa ? await validarZip(arquivo, item) : await validarCsv(arquivo, item.nome);
  if (itemEmEnvio !== item || document.getElementById('arquivo-envio').files[0] !== arquivo) return;
  mostrarValidacao(resultado.avisos);
  if (resultado.ok) {
    arquivoValidado = arquivo;
    document.getElementById('confirmar-envio').disabled = false;
  }
}

function carimboDoEnvio() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function caminhoDoEnvio(item) {
  const nomeArquivo = item.tipo === 'mapa' ? `${semAcento(item.nome).replace(/[^A-Za-z0-9_.-]+/g, '_')}.zip` : item.nome;
  return `${item.filial_id}/${carimboDoEnvio()}/${nomeArquivo}`;
}

function subirParaOStorage(caminho, arquivo, tipo, aoProgredir) {
  return new Promise(async (resolver, rejeitar) => {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { rejeitar(new Error('Sessão expirada. Entre de novo no painel.')); return; }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/dados/${caminho.split('/').map(encodeURIComponent).join('/')}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', SUPABASE_KEY);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('Content-Type', tipo);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) aoProgredir(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { resolver(); return; }
      let msg = `HTTP ${xhr.status}`;
      try {
        const corpo = JSON.parse(xhr.responseText);
        msg = corpo.message || corpo.error || msg;
      } catch {}
      if (xhr.status === 413 || /maximum allowed size|too large/i.test(msg)) {
        msg = 'O arquivo passa do tamanho máximo aceito pelo Storage. Peça ao ADMapp para aumentar o limite do bucket "dados".';
      }
      rejeitar(new Error(msg));
    };
    xhr.onerror = () => rejeitar(new Error('Falha de rede no envio. Confira a conexão e tente de novo.'));
    xhr.send(arquivo);
  });
}

async function enviarArquivoDaObra(item, arquivo, aoProgredir) {
  const caminho = caminhoDoEnvio(item);
  const tipo = item.tipo === 'mapa' ? 'application/zip' : 'text/csv; charset=utf-8';
  await subirParaOStorage(caminho, arquivo, tipo, aoProgredir);
  aoProgredir(1);
  const { data: versao, error } = await sb.rpc('dados_registrar_envio', {
    p_filial: item.filial_id, p_nome: item.nome, p_arquivo: caminho,
  });
  if (error) throw error;
  return versao;
}

async function confirmarEnvio() {
  if (!itemEmEnvio || !arquivoValidado || enviandoDados) return;
  const item = itemEmEnvio;
  const arquivo = arquivoValidado;
  const botao = document.getElementById('confirmar-envio');
  const progresso = document.getElementById('progresso-envio');
  const texto = document.getElementById('texto-progresso-envio');
  const barra = document.getElementById('barra-progresso-envio');
  enviandoDados = true;
  botao.disabled = true;
  document.getElementById('cancelar-envio').disabled = true;
  document.getElementById('arquivo-envio').disabled = true;
  erroDados('');
  progresso.hidden = false;
  barra.value = 0;
  texto.textContent = 'Enviando o arquivo…';
  try {
    const versao = await enviarArquivoDaObra(item, arquivo, (f) => {
      barra.value = f;
      texto.textContent = f < 1 ? `Enviando o arquivo… ${Math.round(f * 100)}%` : 'Subindo a versão…';
    });
    document.getElementById('dialogo-envio').close();
    avisarDados(`${item.rotulo} da obra ${item.filial_id} atualizado para a versão ${versao}.`);
    await carregarDados();
  } catch (e) {
    erroDados(textoDoErroDados(e));
    progresso.hidden = true;
    botao.disabled = false;
  } finally {
    enviandoDados = false;
    document.getElementById('cancelar-envio').disabled = false;
    document.getElementById('arquivo-envio').disabled = false;
  }
}

function prepararTelaDados() {
  const obra = papelDados.papel === 'obra';
  const titulo = obra ? `Dados da obra ${papelDados.filial}` : 'Dados das obras · ADMapp';
  document.getElementById('titulo-dados').textContent = titulo;
  document.title = `${titulo} · Painel RDO cbm`;
  document.getElementById('link-gestao').hidden = papelDados.permissoes?.usuarios !== true;
  const aviso = document.getElementById('aviso-papel');
  aviso.hidden = false;
  aviso.textContent = obra
    ? `Aqui você pode mudar e ajustar os dados de entrada do app da obra ${papelDados.filial}${papelDados.filial_nome ? ` · ${papelDados.filial_nome}` : ''}: serviços, estacas, KM e mapas. As alterações valem somente para esta obra.`
    : 'Aqui você pode mudar e ajustar os dados de entrada do app de cada obra: serviços, estacas, KM e mapas. Escolha a obra; as alterações valem somente para ela, sem afetar as demais.';
}

async function iniciarPaginaDados() {
  aplicarTema(temaInicial());
  if (temSessaoGuardada()) {
    adiantarLinksDoPapel();
    mostrarTelaDados('pagina-admin');
  }
  try {
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      location.replace('index.html');
      return;
    }
    papelDados = await lerPapelAdmin();
    if (!papelDados) {
      negarDados('Esta página é exclusiva dos administradores do painel.');
      return;
    }
    if (papelDados.papel === 'obra' && papelDados.permissoes?.dados !== true) {
      negarDados(`O ADMapp não liberou a atualização dos dados para a obra ${papelDados.filial}. Fale com o gestor geral.`);
      return;
    }
  } catch (e) {
    negarDados('Não foi possível confirmar o acesso: ' + e.message);
    return;
  }
  prepararTelaDados();
  mostrarTelaDados('pagina-admin');
  await carregarDados();
}

document.getElementById('obra-dados').addEventListener('change', renderizarDados);
document.getElementById('corpo-dados').addEventListener('click', (e) => {
  const editar = e.target.closest('button[data-editar-csv]');
  if (editar) {
    const item = itemPorNome(editar.dataset.editarCsv);
    if (item) abrirEditorCsv(item);
    return;
  }
  const botao = e.target.closest('button[data-enviar]');
  if (!botao) return;
  const item = itemPorNome(botao.dataset.enviar);
  if (item) abrirEnvio(item);
});
document.getElementById('arquivo-envio').addEventListener('change', aoEscolherArquivo);
document.getElementById('confirmar-envio').addEventListener('click', confirmarEnvio);
document.getElementById('cancelar-envio').addEventListener('click', () => {
  if (!enviandoDados) document.getElementById('dialogo-envio').close();
});
document.getElementById('dialogo-envio').addEventListener('cancel', (e) => { if (enviandoDados) e.preventDefault(); });
document.getElementById('botao-tema').addEventListener('click', alternarTema);
document.getElementById('botao-sair').addEventListener('click', async () => {
  try { sessionStorage.removeItem('uso-acesso'); sessionStorage.removeItem('papel-admin'); } catch {}
  await sb.auth.signOut();
  location.replace('index.html');
});

iniciarPaginaDados();
