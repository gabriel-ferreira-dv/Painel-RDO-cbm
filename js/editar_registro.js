let registroEmEdicao = null;
let listasDaEdicao = null;

const UNIDADES_DE_MEDICAO = ['m³', 'm²', 'm', 'un', 'kg', 't', 'vb'];
const KMS_VIZINHOS_NA_EDICAO = 2;

const CONFIG_PADRAO_DA_OBRA = {
  vias: { primeira_serie: 'Via 02 Norte', segunda_serie: 'Via 01 Sul', inicio_segunda_serie: 2000, deslocamento: 1000 },
  trechos_sem_via: ['CONTORNO DE FUNDAO', 'CONTORNO DE IBIRACU', 'CANTEIRO INDUSTRIAL', 'PATIO DE VIGAS'],
  trechos_sem_estaca: ['CANTEIRO INDUSTRIAL', 'PATIO DE VIGAS'],
};

const NOMES_DOS_CAMPOS = {
  trecho: 'trecho', via: 'via', km: 'KM', km_final: 'KM final',
  estaca_inicial: 'estaca inicial', estaca_final: 'estaca final',
  atividade: 'atividade', servico_notavel: 'serviço', servico_notavel_detalhe: 'passo',
  quantidade: 'medição', unidade: 'unidade', descricao: 'descrição',
};

const listasPorFilial = new Map();

function texto(v) {
  return String(v ?? '').trim();
}

function soDigitos(v) {
  return texto(v).replace(/[^0-9]/g, '');
}

async function lerCsvOpcional(arquivo) {
  try {
    return await lerCsvDados(arquivo);
  } catch {
    return [];
  }
}

function carregarListasDaObra(filial) {
  if (!listasPorFilial.has(filial)) {
    listasPorFilial.set(filial, (async () => {
      const obras = await obrasDosDados().catch(() => new Map());
      const obra = obras.get(filial) || obraPadraoDosDados();
      const arquivo = (nome) => arquivoDaObra(obra, filial, nome);
      const config = obra.config && Object.keys(obra.config).length ? obra.config
        : filial === FILIAL_PADRAO_DOS_DADOS ? CONFIG_PADRAO_DA_OBRA : {};
      if (!arquivo('SevNotaveis.csv')) {
        throw new Error(`a obra ${filial} ainda não tem a lista de serviços. Envie o SevNotaveis.csv em Dados da obra`);
      }
      const [servicos, kms, coords] = await Promise.all([
        lerCsvDados(arquivo('SevNotaveis.csv')),
        arquivo('KMxEst.csv') ? lerCsvOpcional(arquivo('KMxEst.csv')) : [],
        arquivo('estacas_coords.csv') ? lerCsvOpcional(arquivo('estacas_coords.csv')) : [],
      ]);
      return montarListas(config, obra, servicos, kms, coords);
    })().catch(e => { listasPorFilial.delete(filial); throw e; }));
  }
  return listasPorFilial.get(filial);
}

function montarListas(config, obra, servicos, kms, coords) {
  const vias = config.vias || null;
  const viaSul = texto(vias?.segunda_serie);
  const viaNorte = texto(vias?.primeira_serie);
  const inicioSul = vias && vias.inicio_segunda_serie != null ? Number(vias.inicio_segunda_serie) : null;
  const deslocamento = Number(vias?.deslocamento) || 0;
  const daSerieSul = (n) => inicioSul != null && n >= inicioSul;

  const pistaDupla = new Set(coords
    .filter(l => l.length > 1 && daSerieSul(Number(soDigitos(l[1])) || 0))
    .map(l => texto(l[0])));
  const viaDaEstaca = (trecho, n) => (pistaDupla.has(trecho) ? (daSerieSul(n) ? viaSul : viaNorte) : null);

  const estacas = [];
  const conhecidas = new Set();
  for (const l of kms) {
    if (l.length < 2) continue;
    const trecho = texto(l[0]);
    const rotulo = texto(l[1]);
    const numero = Number.parseInt(soDigitos(rotulo), 10);
    if (Number.isNaN(numero) || conhecidas.has(`${trecho}|${numero}`)) continue;
    conhecidas.add(`${trecho}|${numero}`);
    estacas.push({ trecho, numero, rotulo, km: l.length > 3 ? texto(l[3]) : '', via: viaDaEstaca(trecho, numero) });
  }
  for (const e of [...estacas]) {
    if (!pistaDupla.has(e.trecho) || daSerieSul(e.numero)) continue;
    const numeroSul = e.numero + deslocamento;
    if (conhecidas.has(`${e.trecho}|${numeroSul}`)) continue;
    estacas.push({ trecho: e.trecho, numero: numeroSul, rotulo: String(numeroSul), km: e.km, via: viaSul });
  }
  estacas.sort((a, b) => a.numero - b.numero);

  const semVia = new Set((config.trechos_sem_via || []).map(chaveDoTrecho));
  const semEstaca = new Set((config.trechos_sem_estaca || []).map(chaveDoTrecho));
  const semKm = obra.trechosSemKm || new Set();
  const usaKm = obra.usaKm !== false;

  return {
    servicos: servicos.filter(l => l.length > 3).map(l => ({
      atividade: texto(l[0]), servico: texto(l[1]), passo: texto(l[2]), trecho: texto(l[3]),
    })),
    estacas,
    vias: vias ? [viaNorte, viaSul].filter(Boolean) : [],
    pedeVia: (trecho) => !!vias && !semVia.has(chaveDoTrecho(trecho)),
    pedeEstaca: (trecho) => !semEstaca.has(chaveDoTrecho(trecho)),
    pedeKm: (trecho) => usaKm && !semKm.has(chaveDoTrecho(trecho)),
  };
}

function distintos(valores) {
  const vistos = new Set();
  return valores.filter(v => v && !vistos.has(v) && vistos.add(v));
}

function mesmoTrecho(a, b) {
  return a === b || chaveDoTrecho(a) === chaveDoTrecho(b);
}

function preencherOpcoes(id, opcoes, atual, vazio, soDaLista = false) {
  const select = document.getElementById(id);
  const lista = opcoes.map(o => (typeof o === 'string' ? { valor: o, rotulo: o } : o));
  const naLista = (v) => lista.some(o => o.valor === v);
  const valorAtual = soDaLista && !naLista(texto(atual)) ? '' : texto(atual);
  const foraDaLista = valorAtual && !naLista(valorAtual);
  select.innerHTML =
    (vazio !== null ? `<option value="">${escaparHtml(vazio || 'Selecione…')}</option>` : '')
    + (foraDaLista ? `<option value="${escaparHtml(valorAtual)}" data-fora="1">${escaparHtml(valorAtual)} (atual, fora da lista)</option>` : '')
    + lista.map(o => `<option value="${escaparHtml(o.valor)}">${escaparHtml(o.rotulo)}</option>`).join('');
  select.value = valorAtual && (foraDaLista || lista.some(o => o.valor === valorAtual)) ? valorAtual : '';
  return lista.length;
}

function valorDe(id) {
  return document.getElementById(id).value;
}

function mostrarCampo(id, visivel) {
  document.getElementById(id).hidden = !visivel;
}

function trechoDaEdicao() {
  return valorDe('ed-trecho');
}

function linhasDoTrecho() {
  const t = trechoDaEdicao();
  return listasDaEdicao.servicos.filter(l => mesmoTrecho(l.trecho, t));
}

function estacasDoTrecho() {
  const t = trechoDaEdicao();
  return listasDaEdicao.estacas.filter(e => mesmoTrecho(e.trecho, t));
}

function kmNaFaixa(km, de, ate) {
  const n = Number.parseInt(km, 10);
  const a = Number.parseInt(de, 10);
  const b = Number.parseInt(ate, 10);
  if ([n, a, b].some(Number.isNaN)) return km === de || km === ate;
  return n >= Math.min(a, b) && n <= Math.max(a, b);
}

function preencherTrechosDaEdicao(atual) {
  const trechos = distintos(listasDaEdicao.servicos.map(l => l.trecho)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  preencherOpcoes('ed-trecho', trechos, atual);
}

function preencherKmsDaEdicao(atual) {
  const t = trechoDaEdicao();
  const pede = !!t && listasDaEdicao.pedeKm(t);
  mostrarCampo('campo-ed-km', pede);
  if (!pede) { preencherOpcoes('ed-km', [], '', null); return; }
  preencherOpcoes('ed-km', distintos(estacasDoTrecho().map(e => e.km)), atual);
}

function preencherViasDaEdicao(atual) {
  const t = trechoDaEdicao();
  const pede = !!t && listasDaEdicao.pedeVia(t);
  mostrarCampo('campo-ed-via', pede);
  preencherOpcoes('ed-via', pede ? listasDaEdicao.vias : [], pede ? atual : '', pede ? undefined : null);
}

function estacasDisponiveis() {
  const t = trechoDaEdicao();
  if (!t || !listasDaEdicao.pedeEstaca(t)) return [];
  const via = listasDaEdicao.pedeVia(t) ? valorDe('ed-via') : '';
  let lista = estacasDoTrecho().filter(e => !via || e.via == null || e.via === via);
  if (listasDaEdicao.pedeKm(t)) {
    const km = valorDe('ed-km');
    if (!km) return [];
    const n = Number.parseInt(km, 10);
    const de = Number.isNaN(n) ? km : String(n - KMS_VIZINHOS_NA_EDICAO);
    const ate = Number.isNaN(n) ? km : String(n + KMS_VIZINHOS_NA_EDICAO);
    lista = lista.filter(e => kmNaFaixa(e.km, de, ate));
  }
  return lista;
}

function opcoesDeEstaca(lista) {
  const km = valorDe('ed-km');
  return lista.map(e => ({
    valor: e.rotulo,
    rotulo: !e.km || e.km === km || !listasDaEdicao.pedeKm(trechoDaEdicao()) ? e.rotulo : `${e.rotulo} (KM ${e.km})`,
  }));
}

function preencherEstacasDaEdicao(inicial, final) {
  const t = trechoDaEdicao();
  const pede = !!t && listasDaEdicao.pedeEstaca(t);
  mostrarCampo('campo-ed-estaca-inicial', pede);
  mostrarCampo('campo-ed-estaca-final', pede);
  const opcoes = pede ? opcoesDeEstaca(estacasDisponiveis()) : [];
  const cascata = inicial === undefined;
  preencherOpcoes('ed-estaca-inicial', opcoes, cascata ? valorDe('ed-estaca-inicial') : inicial, undefined, cascata);
  preencherOpcoes('ed-estaca-final', opcoes, cascata ? valorDe('ed-estaca-final') : final, undefined, cascata);
  atualizarAvisoForaDaLista();
}

function aoTrocarEstacaInicialNaEdicao() {
  const final = document.getElementById('ed-estaca-final');
  if (!final.value) final.value = valorDe('ed-estaca-inicial');
  atualizarAvisoForaDaLista();
}

function preencherAtividadesDaEdicao(atual) {
  preencherOpcoes('ed-atividade', distintos(linhasDoTrecho().map(l => l.atividade)).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    atual ?? valorDe('ed-atividade'), undefined, atual === undefined);
  preencherServicosDaEdicao();
}

function preencherServicosDaEdicao(atual) {
  const atividade = valorDe('ed-atividade');
  const servicos = distintos(linhasDoTrecho().filter(l => l.atividade === atividade).map(l => l.servico))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  preencherOpcoes('ed-servico', servicos, atual ?? valorDe('ed-servico'), undefined, atual === undefined);
  preencherPassosDaEdicao();
}

function preencherPassosDaEdicao(atual) {
  const atividade = valorDe('ed-atividade');
  const servico = valorDe('ed-servico');
  const passos = distintos(linhasDoTrecho()
    .filter(l => l.atividade === atividade && l.servico === servico)
    .map(l => l.passo)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const cascata = atual === undefined;
  const valor = cascata ? valorDe('ed-passo') : atual;
  mostrarCampo('campo-ed-passo', passos.length > 0 || (!cascata && !!texto(valor)));
  preencherOpcoes('ed-passo', passos, valor, undefined, cascata);
  atualizarAvisoForaDaLista();
}

function aoTrocarTrechoNaEdicao() {
  preencherKmsDaEdicao('');
  preencherViasDaEdicao('');
  preencherEstacasDaEdicao('', '');
  preencherAtividadesDaEdicao('');
}

function atualizarAvisoForaDaLista() {
  const fora = [...document.querySelectorAll('#form-editar-registro select')]
    .filter(s => !s.closest('[hidden]') && s.selectedOptions[0]?.dataset.fora === '1')
    .map(s => s.closest('.campo').querySelector('label').textContent.toLowerCase());
  const aviso = document.getElementById('aviso-fora-da-lista');
  aviso.hidden = fora.length === 0;
  aviso.textContent = fora.length
    ? `Fora do padrão do app: ${fora.join(', ')}. Escolha um valor da lista para corrigir.`
    : '';
}

function quantidadeParaTexto(q) {
  return q == null || q === '' ? '' : formatarQuantidade(Number(q));
}

function travarFormularioDeEdicao(travar) {
  document.getElementById('carregando-listas-edicao').hidden = !travar;
  document.querySelectorAll('#form-editar-registro select, #form-editar-registro input, #form-editar-registro textarea')
    .forEach(el => { el.disabled = travar; });
  document.getElementById('salvar-editar-registro').disabled = travar;
}

async function abrirEdicaoDeRegistro(r) {
  if (!ehAdminPainel || !r) return;
  registroEmEdicao = r;
  listasDaEdicao = null;
  const qtdFotos = cacheFotos.filter(f => f.dispositivo_id === r.dispositivo_id && f.registro_id_local === r.id_local).length;
  document.getElementById('info-editar-registro').innerHTML =
    `${escaparHtml(r.encarregado)} · ${formatarDataHora(r.criado_em)}`
    + (qtdFotos ? ` · ${qtdFotos} foto(s)` : '')
    + (r.editado_em ? `<br>Última correção: ${formatarDataHora(r.editado_em)}${r.editado_por_matricula ? ` por ${escaparHtml(quemCorrigiu(r.editado_por_matricula))}` : ''}` : '');
  document.getElementById('erro-editar-registro').hidden = true;
  document.getElementById('aviso-fora-da-lista').hidden = true;
  document.getElementById('ed-quantidade').value = quantidadeParaTexto(r.quantidade);
  document.getElementById('ed-descricao').value = texto(r.descricao);
  preencherOpcoes('ed-unidade', UNIDADES_DE_MEDICAO, r.unidade, 'Sem medição');
  const botao = document.getElementById('salvar-editar-registro');
  botao.textContent = 'Salvar correção';
  travarFormularioDeEdicao(true);
  document.getElementById('dialogo-editar-registro').showModal();

  let listas;
  try {
    listas = await carregarListasDaObra(filialDoRegistro(r));
  } catch (e) {
    if (registroEmEdicao !== r) return;
    document.getElementById('carregando-listas-edicao').textContent =
      `Não foi possível carregar as listas da obra (${e.message || e}). Feche e tente de novo.`;
    return;
  }
  if (registroEmEdicao !== r) return;
  listasDaEdicao = listas;
  travarFormularioDeEdicao(false);
  preencherTrechosDaEdicao(r.trecho);
  preencherKmsDaEdicao(r.km);
  preencherViasDaEdicao(r.via);
  preencherEstacasDaEdicao(r.estaca_inicial, r.estaca_final || r.estaca_inicial);
  preencherAtividadesDaEdicao(r.atividade);
  preencherServicosDaEdicao(r.servico_notavel);
  preencherPassosDaEdicao(r.servico_notavel_detalhe);
  atualizarAvisoForaDaLista();
}

function abrirEdicaoDaFotoAtual() {
  if (indiceLightbox < 0) return;
  abrirEdicaoDeRegistro(galeria.itens[indiceLightbox]?.registro);
}

function estacaPorRotulo(rotulo) {
  return estacasDoTrecho().find(e => e.rotulo === rotulo) || null;
}

function lerFormularioDeEdicao() {
  const r = registroEmEdicao;
  const trecho = valorDe('ed-trecho');
  if (!trecho) throw new Error('Escolha o trecho.');
  const pedeKm = listasDaEdicao.pedeKm(trecho);
  const pedeVia = listasDaEdicao.pedeVia(trecho);
  const pedeEstaca = listasDaEdicao.pedeEstaca(trecho);
  const campos = { trecho };

  campos.via = pedeVia ? valorDe('ed-via') : '';
  if (pedeVia && !campos.via) throw new Error('Escolha a via.');

  if (pedeEstaca) {
    campos.estaca_inicial = valorDe('ed-estaca-inicial');
    campos.estaca_final = valorDe('ed-estaca-final') || campos.estaca_inicial;
    if (!campos.estaca_inicial) throw new Error('Escolha a estaca inicial.');
  } else {
    const mesmoLocal = mesmoTrecho(trecho, texto(r.trecho));
    campos.estaca_inicial = mesmoLocal ? texto(r.estaca_inicial) : '';
    campos.estaca_final = mesmoLocal ? texto(r.estaca_final) : '';
  }

  if (pedeKm) {
    const km = valorDe('ed-km');
    if (!km) throw new Error('Escolha o KM.');
    const kmInicio = (pedeEstaca && estacaPorRotulo(campos.estaca_inicial)?.km) || km;
    const kmFim = (pedeEstaca && estacaPorRotulo(campos.estaca_final)?.km) || kmInicio;
    campos.km = kmInicio;
    campos.km_final = kmFim === kmInicio ? '' : kmFim;
  } else {
    campos.km = '';
    campos.km_final = '';
  }

  campos.atividade = valorDe('ed-atividade');
  campos.servico_notavel = valorDe('ed-servico');
  if (!campos.atividade || !campos.servico_notavel) throw new Error('Escolha a atividade e o serviço.');
  const temPassos = !document.getElementById('campo-ed-passo').hidden
    && document.querySelectorAll('#ed-passo option[value]:not([value=""])').length > 0;
  campos.servico_notavel_detalhe = valorDe('ed-passo');
  if (temPassos && !campos.servico_notavel_detalhe) throw new Error('Escolha o passo do serviço.');

  const bruto = document.getElementById('ed-quantidade').value.trim();
  if (!bruto) {
    campos.quantidade = null;
  } else {
    const n = Number(bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto);
    if (!Number.isFinite(n) || n < 0) throw new Error('Medição inválida. Use só números, por exemplo 120,5.');
    campos.quantidade = n;
  }
  campos.unidade = valorDe('ed-unidade');
  if (campos.quantidade != null && !campos.unidade) throw new Error('Escolha a unidade da medição.');
  if (campos.quantidade == null && campos.unidade && !texto(r.unidade)) campos.unidade = '';
  campos.descricao = document.getElementById('ed-descricao').value.trim();
  return campos;
}

function camposAlterados(r, campos) {
  const alterados = {};
  for (const [campo, valor] of Object.entries(campos)) {
    const atual = campo === 'quantidade'
      ? (r.quantidade == null ? null : Number(r.quantidade))
      : texto(r[campo]);
    if (atual !== valor) alterados[campo] = valor;
  }
  return alterados;
}

async function salvarEdicaoDeRegistro() {
  const r = registroEmEdicao;
  if (!r || !listasDaEdicao) return;
  const erroEl = document.getElementById('erro-editar-registro');
  const botao = document.getElementById('salvar-editar-registro');
  erroEl.hidden = true;
  let alterados;
  try {
    alterados = camposAlterados(r, lerFormularioDeEdicao());
  } catch (e) {
    erroEl.textContent = e.message;
    erroEl.hidden = false;
    return;
  }
  if (Object.keys(alterados).length === 0) {
    erroEl.textContent = 'Nada foi alterado.';
    erroEl.hidden = false;
    return;
  }
  botao.disabled = true;
  botao.textContent = 'Salvando…';
  const { data, error } = await sb.from('registros_app')
    .update(alterados)
    .eq('dispositivo_id', r.dispositivo_id)
    .eq('id_local', r.id_local)
    .select('id, editado_em, editado_por_matricula');
  botao.disabled = false;
  botao.textContent = 'Salvar correção';
  if (error || !data || data.length === 0) {
    erroEl.textContent = error
      ? 'Não foi possível salvar: ' + error.message
      : 'Sem permissão para corrigir este registro. Confira se o admin_corrige_registros.sql foi rodado no Supabase.';
    erroEl.hidden = false;
    return;
  }
  Object.assign(r, alterados, {
    editado_em: data[0].editado_em || new Date().toISOString(),
    editado_por_matricula: data[0].editado_por_matricula || r.editado_por_matricula || '',
  });
  registroEmEdicao = null;
  document.getElementById('dialogo-editar-registro').close();
  registrarUso('registro_editado', {
    registro_id: r.id,
    campos: Object.keys(alterados).map(c => NOMES_DOS_CAMPOS[c] || c),
  });
  popularSelectsDeFiltro();
  aplicarFiltrosLocais();
  mostrarAvisoFlutuante('Registro corrigido. O carimbo das fotos será refeito pelo celular de quem as tirou, na próxima sincronização.');
}
