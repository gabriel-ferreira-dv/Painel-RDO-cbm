const PDFMAKE_SCRIPTS = [
  'https://cdn.jsdelivr.net/npm/pdfmake@0.2.12/build/pdfmake.min.js',
  'https://cdn.jsdelivr.net/npm/pdfmake@0.2.12/build/vfs_fonts.js',
];

const PDF_MARGEM = 12;
const PDF_LARGURA = 595.28 - PDF_MARGEM * 2;
const PDF_ESPACO_FOTOS = 12;
const PDF_LARGURA_FOTO = (PDF_LARGURA - PDF_ESPACO_FOTOS) / 2 - 1;
const PDF_AVISO_FOTOS = 300;

let exportacaoPdf = { cancelada: false, rodando: false };

function carregarScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Não foi possível carregar ' + url));
    document.head.appendChild(s);
  });
}

async function garantirPdfMake() {
  if (window.pdfMake && window.pdfMake.vfs) return;
  for (const url of PDFMAKE_SCRIPTS) await carregarScript(url);
}

function blobParaDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = reject;
    leitor.readAsDataURL(blob);
  });
}

async function reduzirFoto(blob) {
  const bitmap = await createImageBitmap(blob);
  const escala = Math.min(1, 1200 / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

async function baixarFotoParaPdf(caminho) {
  try {
    const { data, error } = await sb.storage.from(BUCKET_FOTOS).download(caminho);
    if (error || !data) return null;
    return await reduzirFoto(data);
  } catch {
    return null;
  }
}

function horaMinuto(iso) {
  return formatarHora(iso);
}

function formatarDuracaoPdf(minutos) {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

function dataBr(chave) {
  const [a, m, d] = chave.split('-');
  return `${d}/${m}/${a}`;
}

function diaDaSemanaPdf(chave) {
  const txt = new Date(chave + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function descreverAtividadePdf(r) {
  const passo = String(r.servico_notavel_detalhe || '').trim();
  const estaca = r.estaca_inicial ? descreverEstaca(r) : '';
  const via = String(r.via || '').trim();
  const medicao = descreverMedicao(r);
  const porOutro = capitalizarNome(r.registrado_por_nome);
  return `${r.servico_notavel}${passo ? ` (${passo})` : ''}, `
    + `${r.trecho} / KM ${descreverKm(r)}`
    + `${estaca ? `, estaca ${estaca}` : ''}`
    + `${via ? `, via ${via}` : ''}`
    + `${medicao ? ` - ${medicao}` : ''}`
    + `${porOutro ? ` (lançado por ${porOutro})` : ''}.`;
}

function listarAtividadesPdf(registros) {
  const horas = new Map();
  for (const r of [...registros].sort((a, b) => a.criado_em.localeCompare(b.criado_em))) {
    const linha = descreverAtividadePdf(r);
    if (!horas.has(linha)) horas.set(linha, []);
    horas.get(linha).push(horaMinuto(r.criado_em));
  }
  return [...horas].map(([linha, hs]) => {
    const intervalo = hs[0] === hs[hs.length - 1] ? hs[0] : `${hs[0]} a ${hs[hs.length - 1]}`;
    return `${intervalo}  ${linha}`;
  });
}

function descreverParalisacaoPdf(p) {
  let horario;
  if (p.fim) {
    const min = Math.round((new Date(p.fim) - new Date(p.inicio)) / 60000);
    horario = `${horaMinuto(p.inicio)} às ${horaMinuto(p.fim)} (${formatarDuracaoPdf(min)})`;
  } else {
    horario = `${horaMinuto(p.inicio)} - sem término`;
  }
  const local = [
    String(p.trecho || '').trim(),
    String(p.km || '').trim() ? `KM ${String(p.km).trim()}` : '',
  ].filter(Boolean).join(' / ');
  return [horario, p.motivo, local, String(p.observacao || '').trim()].filter(Boolean).join(' - ');
}

function nomeDoCampo(valor) {
  const v = String(valor || '').trim();
  const i = v.indexOf('::');
  return i < 0 ? v : v.slice(i + 2).trim();
}

function matriculaDoCampo(valor) {
  const v = String(valor || '').trim();
  const i = v.indexOf('::');
  return i < 0 ? '' : v.slice(0, i).trim();
}

function formatarFuncao(bruta) {
  return nomeDoCampo(bruta).split(/\s+/).map(p => {
    if (!p) return p;
    const semPonto = p.replace(/\./g, '');
    if (/^[IVX]+$/.test(semPonto) || semPonto.length <= 1) return p.toUpperCase();
    if (/^\d+$/.test(semPonto)) return p;
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }).join(' ');
}

function resumirEfetivo(linhas) {
  const funcaoPorPessoa = new Map();
  for (const l of linhas) {
    const chave = matriculaDoCampo(l.funcionario) || chaveNome(nomeDoCampo(l.funcionario));
    if (!chave) continue;
    const funcao = formatarFuncao(l.funcao);
    if (!funcao || funcao === '-') continue;
    if (!funcaoPorPessoa.has(chave)) funcaoPorPessoa.set(chave, funcao);
  }
  const contagem = new Map();
  for (const f of funcaoPorPessoa.values()) contagem.set(f, (contagem.get(f) || 0) + 1);
  return [...contagem]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([funcao, qtd]) => ({ funcao, qtd }));
}

function diasDoPeriodo(inicio, fim) {
  const dias = [];
  const d = inicioDoDia(inicio);
  const ultimo = inicioDoDia(fim);
  while (d <= ultimo) {
    dias.push(chaveDia(d));
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

async function buscarOuVazio(montarConsulta) {
  try {
    return await buscarTodasAsLinhas(montarConsulta);
  } catch (e) {
    console.warn('Relatório PDF: consulta auxiliar falhou', e);
    return [];
  }
}

async function buscarParalisacoes(matriculas) {
  if (matriculas.length === 0) return [];
  return buscarOuVazio(() => sb
    .from('paralisacoes_app')
    .select('*')
    .in('usuario_matricula', matriculas)
    .eq('excluida', false)
    .gte('inicio', periodoCarregado.inicio.toISOString())
    .lte('inicio', periodoCarregado.fim.toISOString())
    .order('inicio', { ascending: true })
    .order('id', { ascending: true }));
}

async function buscarFotosDeParalisacoes(paralisacoes) {
  if (paralisacoes.length === 0) return [];
  const dispositivos = [...new Set(paralisacoes.map(p => p.dispositivo_id))];
  const ids = [...new Set(paralisacoes.map(p => p.id_local))];
  const chaves = new Set(paralisacoes.map(p => `${p.dispositivo_id}|${p.id_local}`));
  const linhas = await buscarOuVazio(() => sb
    .from('paralisacao_fotos_app')
    .select('*')
    .in('dispositivo_id', dispositivos)
    .in('paralisacao_id_local', ids)
    .order('criado_em', { ascending: true })
    .order('id', { ascending: true }));
  return linhas.filter(f => chaves.has(`${f.dispositivo_id}|${f.paralisacao_id_local}`));
}

async function buscarClima(matriculas) {
  if (matriculas.length === 0) return new Map();
  const linhas = await buscarOuVazio(() => sb
    .from('clima_dia_app')
    .select('*')
    .in('usuario_matricula', matriculas)
    .gte('data', chaveDia(periodoCarregado.inicio))
    .lte('data', chaveDia(periodoCarregado.fim))
    .order('data', { ascending: true })
    .order('usuario_matricula', { ascending: true }));
  const mapa = new Map();
  for (const c of linhas) {
    const texto = [
      c.clima_manha ? `Manhã: ${c.clima_manha}` : '',
      c.clima_tarde ? `Tarde: ${c.clima_tarde}` : '',
      c.clima_noite ? `Noite: ${c.clima_noite}` : '',
    ].filter(Boolean).join('  ');
    if (texto) mapa.set(`${c.usuario_matricula}|${c.data}`, texto);
  }
  return mapa;
}

async function buscarEfetivoDoDia(matriculas, dia) {
  const porEncarregado = matriculas.map(m => `encarregado.like.${m}::*`).join(',');
  const consultar = (padrao) => buscarOuVazio(() => sb
    .from('equipe_apontamento')
    .select('encarregado,funcionario,funcao,data_inicial')
    .or(porEncarregado)
    .like('data_inicial', padrao)
    .order('encarregado', { ascending: true })
    .order('funcionario', { ascending: true })
    .order('funcao', { ascending: true }));
  const linhas = await consultar(`${dia}%`);
  return linhas.length > 0 ? linhas : consultar(`${dataBr(dia)}%`);
}

async function buscarEfetivo(matriculas, dias, aoProgredir) {
  const mapa = new Map();
  if (matriculas.length === 0) return mapa;
  const simultaneos = 4;
  for (let i = 0; i < dias.length; i += simultaneos) {
    if (exportacaoPdf.cancelada) throw new Error('CANCELADO');
    const lote = dias.slice(i, i + simultaneos);
    aoProgredir(`Buscando efetivo (${Math.min(i + simultaneos, dias.length)} de ${dias.length} dias)…`,
      Math.min(i + simultaneos, dias.length) / dias.length);
    const resultados = await Promise.all(lote.map(dia => buscarEfetivoDoDia(matriculas, dia)));
    lote.forEach((dia, j) => {
      const porMatricula = new Map();
      for (const l of resultados[j]) {
        const mat = matriculaDoCampo(l.encarregado);
        if (!mat) continue;
        if (!porMatricula.has(mat)) porMatricula.set(mat, []);
        porMatricula.get(mat).push(l);
      }
      for (const [mat, grupo] of porMatricula) mapa.set(`${mat}|${dia}`, resumirEfetivo(grupo));
    });
  }
  return mapa;
}

function descreverFiltrosAtivos() {
  const partes = [];
  const rotulos = {
    'filtro-trecho': 'Trecho', 'filtro-km': 'KM', 'filtro-estaca-de': 'Estaca inicial',
    'filtro-estaca-ate': 'Estaca final', 'filtro-encarregado': 'Encarregado',
    'filtro-atividade': 'Atividade', 'filtro-servico': 'Serviço',
  };
  for (const [id, rotulo] of Object.entries(rotulos)) {
    const sel = document.getElementById(id);
    if (sel && sel.value) partes.push(`${rotulo}: ${sel.options[sel.selectedIndex].text}`);
  }
  return partes.join('  ·  ');
}

async function montarBlocosDoRelatorio(registros, fotos, incluirFotos, aoProgredir) {
  const dias = diasDoPeriodo(periodoCarregado.inicio, periodoCarregado.fim);
  const trechoFiltro = document.getElementById('filtro-trecho').value;

  const chavePorMatricula = new Map();
  const nomePorChave = new Map();
  for (const r of registros) {
    nomePorChave.set(r.encarregado_chave, r.encarregado);
    const mat = String(r.usuario_matricula || '').trim();
    if (mat && !chavePorMatricula.has(mat)) chavePorMatricula.set(mat, r.encarregado_chave);
  }
  const matriculas = [...chavePorMatricula.keys()];

  aoProgredir('Buscando paralisações e clima…');
  const [paralisacoesBrutas, clima] = await Promise.all([
    buscarParalisacoes(matriculas),
    buscarClima(matriculas),
  ]);
  const efetivo = await buscarEfetivo(matriculas, dias, aoProgredir);
  const paralisacoes = paralisacoesBrutas.filter(p =>
    !trechoFiltro || !p.trecho || p.trecho === trechoFiltro);
  const fotosParalisacao = incluirFotos ? await buscarFotosDeParalisacoes(paralisacoes) : [];

  const blocos = new Map();
  const bloco = (dia, chave, matricula) => {
    const id = `${dia}|${chave}`;
    if (!blocos.has(id)) {
      blocos.set(id, {
        dia, chave, matricula, nome: nomePorChave.get(chave) || '(sem nome)',
        registros: [], paralisacoes: [], fotos: [],
      });
    }
    const b = blocos.get(id);
    if (!b.matricula && matricula) b.matricula = matricula;
    return b;
  };

  const registroPorChave = new Map();
  for (const r of registros) {
    const b = bloco(chaveDia(r.criado_em), r.encarregado_chave, String(r.usuario_matricula || '').trim());
    b.registros.push(r);
    registroPorChave.set(`${r.dispositivo_id}|${r.id_local}`, { r, b });
  }
  const paralisacaoPorChave = new Map();
  for (const p of paralisacoes) {
    const chave = chavePorMatricula.get(p.usuario_matricula);
    if (!chave) continue;
    const b = bloco(chaveDia(p.inicio), chave, p.usuario_matricula);
    b.paralisacoes.push(p);
    paralisacaoPorChave.set(`${p.dispositivo_id}|${p.id_local}`, { p, b });
  }

  if (incluirFotos) {
    for (const f of [...fotos].sort((a, b) => a.criado_em.localeCompare(b.criado_em))) {
      const alvo = registroPorChave.get(`${f.dispositivo_id}|${f.registro_id_local}`);
      if (!alvo) continue;
      const { r, b } = alvo;
      const descricao = String(r.descricao || '').trim();
      const legenda = [
        descricao || descreverServico(r),
        r.estaca_inicial ? `Estaca ${descreverEstaca(r)}.` : '',
      ].filter(Boolean).join(' - ');
      b.fotos.push({ caminho: f.caminho_storage, criadoEm: f.criado_em, legenda, ordem: 0 });
    }
    for (const f of fotosParalisacao) {
      const alvo = paralisacaoPorChave.get(`${f.dispositivo_id}|${f.paralisacao_id_local}`);
      if (!alvo) continue;
      alvo.b.fotos.push({
        caminho: f.caminho_storage, criadoEm: f.criado_em,
        legenda: `Paralisação - ${alvo.p.motivo} - ${horaMinuto(alvo.p.inicio)}`, ordem: 1,
      });
    }
  }

  const lista = [...blocos.values()].sort((a, b) =>
    a.dia.localeCompare(b.dia) || a.nome.localeCompare(b.nome, 'pt-BR'));
  for (const b of lista) {
    b.fotos.sort((x, y) => x.ordem - y.ordem || x.criadoEm.localeCompare(y.criadoEm));
    b.clima = clima.get(`${b.matricula}|${b.dia}`) || '';
    b.efetivo = efetivo.get(`${b.matricula}|${b.dia}`) || [];
    b.atividades = listarAtividadesPdf(b.registros);
    b.linhasParalisacao = b.paralisacoes.map(descreverParalisacaoPdf);
    b.minutosParados = b.paralisacoes.reduce((s, p) =>
      p.fim ? s + Math.round((new Date(p.fim) - new Date(p.inicio)) / 60000) : s, 0);
  }

  if (incluirFotos) {
    const todas = lista.flatMap(b => b.fotos);
    let feitas = 0;
    const simultaneas = 6;
    for (let i = 0; i < todas.length; i += simultaneas) {
      if (exportacaoPdf.cancelada) throw new Error('CANCELADO');
      const lote = todas.slice(i, i + simultaneas);
      const imagens = await Promise.all(lote.map(f => baixarFotoParaPdf(f.caminho)));
      lote.forEach((f, j) => { f.imagem = imagens[j]; });
      feitas += lote.length;
      aoProgredir(`Baixando fotos ${feitas} de ${todas.length}…`, feitas / todas.length);
    }
  }

  return { blocos: lista, dias };
}

function pdfBarra(texto, { centro = false, tamanho = 12 } = {}) {
  return {
    table: {
      widths: ['*'],
      body: [[{
        text: texto, color: '#ffffff', bold: true, fontSize: tamanho,
        alignment: centro ? 'center' : 'left', fillColor: '#000000',
        margin: [8, 5, 8, 5],
      }]],
    },
    layout: 'noBorders',
  };
}

function pdfLista(titulo, itens, vazio) {
  return {
    stack: [
      { text: titulo, bold: true, fontSize: 11, margin: [0, 0, 0, 2] },
      ...(itens.length === 0
        ? (vazio ? [{ text: vazio, italics: true, fontSize: 10, color: '#616161' }] : [])
        : itens.map(i => ({ text: `-  ${i}`, fontSize: 10 }))),
    ],
  };
}

function pdfFoto(foto, numero) {
  const legenda = {
    text: [{ text: `Foto ${numero}. `, bold: true }, { text: foto.legenda, italics: true }],
    fontSize: 9, alignment: 'center', margin: [0, 3, 0, 0],
  };
  const hora = { text: horaMinuto(foto.criadoEm), fontSize: 8, color: '#616161', alignment: 'center' };
  if (!foto.imagem) {
    return {
      width: PDF_LARGURA_FOTO,
      stack: [
        {
          table: { widths: ['*'], body: [[{ text: 'Foto indisponível', fontSize: 9, alignment: 'center', margin: [0, 90, 0, 90] }]] },
        },
        legenda, hora,
      ],
    };
  }
  return { width: PDF_LARGURA_FOTO, stack: [{ image: foto.imagem, width: PDF_LARGURA_FOTO }, legenda, hora] };
}

function pdfCabecalho(logo, usuario, periodo) {
  const larguraLogo = 30 * 600 / 181;
  return {
    table: {
      widths: ['*', 'auto'],
      body: [
        [
          {
            colSpan: 2,
            columns: [
              {
                width: larguraLogo + 12,
                table: { body: [[{ image: logo, width: larguraLogo, fillColor: '#000000', margin: [6, 6, 6, 6] }]] },
                layout: 'noBorders',
              },
              { width: '*', text: 'Relatório de Atividades', bold: true, fontSize: 18, alignment: 'center', margin: [0, 10, 0, 0] },
              { width: larguraLogo + 12, text: '' },
            ],
            margin: [10, 10, 10, 10],
          },
          {},
        ],
        [
          { text: `Usuário: ${usuario}`, fontSize: 11, margin: [10, 8, 10, 8] },
          { text: `Período: ${periodo}`, fontSize: 11, bold: true, margin: [10, 8, 10, 8] },
        ],
      ],
    },
  };
}

function pdfNumero(valor, rotulo) {
  return {
    width: '*',
    stack: [
      { text: String(valor), fontSize: 20, bold: true, alignment: 'center' },
      { text: rotulo, fontSize: 10, alignment: 'center' },
    ],
  };
}

function pdfMapa(mapa) {
  const itens = mapa.legenda.map(l => ({
    width: 'auto',
    columns: [
      { width: 16, canvas: [{ type: 'rect', x: 0, y: 3, w: 16, h: 5, color: l.cor }] },
      { width: 'auto', text: l.servico, fontSize: 9, margin: [4, 0, 12, 0] },
    ],
  }));
  const linhasLegenda = [];
  for (let i = 0; i < itens.length; i += 4) {
    linhasLegenda.push({ columns: itens.slice(i, i + 4), margin: [0, 3, 0, 0] });
  }
  return {
    stack: [
      pdfBarra('Mapa das atividades', { centro: true, tamanho: 13 }),
      { image: mapa.imagem, width: PDF_LARGURA, margin: [0, 6, 0, 0] },
      ...linhasLegenda,
      mapa.comSatelite
        ? { text: 'Imagem de satélite: Esri World Imagery', fontSize: 7, color: '#757575', margin: [0, 2, 0, 0] }
        : null,
    ].filter(Boolean),
    unbreakable: true,
    margin: [0, 0, 0, 18],
  };
}

function montarDefinicaoPdf({ blocos, dias }, logo, incluirFotos, mapa) {
  const inicio = chaveDia(periodoCarregado.inicio);
  const fim = chaveDia(periodoCarregado.fim);
  const periodo = inicio === fim ? dataBr(inicio) : `${dataBr(inicio)} a ${dataBr(fim)}`;
  const usuario = document.getElementById('nome-usuario').textContent || '';
  const filtros = descreverFiltrosAtivos();

  const diasComDados = new Set(blocos.map(b => b.dia));
  const encarregados = new Set(blocos.map(b => b.chave));
  const totalRegistros = blocos.reduce((s, b) => s + b.registros.length, 0);
  const totalFotos = blocos.reduce((s, b) => s + b.fotos.length, 0);
  const totalParadas = blocos.reduce((s, b) => s + b.paralisacoes.length, 0);
  const numeros = [
    pdfNumero(diasComDados.size, diasComDados.size === 1 ? 'dia' : 'dias'),
    pdfNumero(encarregados.size, 'encarregados'),
    pdfNumero(totalRegistros, 'registros'),
  ];
  if (incluirFotos) numeros.push(pdfNumero(totalFotos, 'fotos'));
  if (diasComDados.size === 1) {
    numeros.push(pdfNumero(blocos.reduce((s, b) => s + b.efetivo.reduce((t, e) => t + e.qtd, 0), 0), 'pessoas no efetivo'));
  }
  if (totalParadas > 0) numeros.push(pdfNumero(totalParadas, 'paralisações'));

  const conteudo = [
    pdfCabecalho(logo, usuario, periodo),
    filtros ? { text: `Filtros aplicados: ${filtros}`, fontSize: 9, color: '#424242', margin: [0, 6, 0, 0] } : null,
    {
      table: { widths: ['*'], body: [[{ columns: numeros, margin: [10, 10, 10, 10] }]] },
      margin: [0, 12, 0, 14],
    },
    mapa ? pdfMapa(mapa) : null,
  ].filter(Boolean);

  if (blocos.length === 0) {
    conteudo.push({ text: 'Nenhum registro no período e filtros selecionados.', italics: true, alignment: 'center', margin: [0, 20, 0, 0] });
  }

  let numeroFoto = 0;
  let diaAtual = null;
  for (const b of blocos) {
    if (b.dia !== diaAtual) {
      diaAtual = b.dia;
      const efetivoDoDia = blocos
        .filter(x => x.dia === b.dia)
        .reduce((s, x) => s + x.efetivo.reduce((t, e) => t + e.qtd, 0), 0);
      const tituloDia = `${diaDaSemanaPdf(b.dia)}, ${dataBr(b.dia)}`
        + (efetivoDoDia > 0 ? `  ·  Efetivo do dia: ${efetivoDoDia} pessoa${efetivoDoDia === 1 ? '' : 's'}` : '');
      conteudo.push({ ...pdfBarra(tituloDia, { centro: true, tamanho: 13 }), margin: [0, 4, 0, 10] });
    }
    const titulo = `${b.nome}${b.matricula ? `  ·  Matrícula ${b.matricula}` : ''}`;
    const cabecalhoBloco = [pdfBarra(titulo)];
    if (b.clima) cabecalhoBloco.push({ text: `Clima: ${b.clima}`, bold: true, fontSize: 10, margin: [0, 6, 0, 0] });
    const totalPessoas = b.efetivo.reduce((s, e) => s + e.qtd, 0);
    cabecalhoBloco.push({
      columns: [
        {
          width: '33%',
          ...pdfLista(
            `Efetivo (${totalPessoas})`,
            b.efetivo.map(e => `${e.qtd} - ${e.funcao}`),
            'Sem apontamento de efetivo',
          ),
        },
        { width: '*', ...pdfLista('Atividades', b.atividades, 'Nenhuma atividade registrada no app') },
      ],
      columnGap: 16,
      margin: [0, 6, 0, 0],
    });
    if (b.linhasParalisacao.length > 0) {
      const titulo = b.minutosParados > 0
        ? `Paralisações (${formatarDuracaoPdf(b.minutosParados)} parado)`
        : 'Paralisações';
      cabecalhoBloco.push({ ...pdfLista(titulo, b.linhasParalisacao, ''), margin: [0, 6, 0, 0] });
    }
    conteudo.push({ stack: cabecalhoBloco, unbreakable: cabecalhoBloco.length < 6 });

    if (b.fotos.length > 0) {
      conteudo.push({ text: '', margin: [0, 8, 0, 0] });
      for (let i = 0; i < b.fotos.length; i += 2) {
        const par = b.fotos.slice(i, i + 2).map(f => pdfFoto(f, ++numeroFoto));
        if (par.length === 1) par.push({ width: PDF_LARGURA_FOTO, text: '' });
        conteudo.push({ columns: par, columnGap: PDF_ESPACO_FOTOS, unbreakable: true, margin: [0, 0, 0, 10] });
      }
    }
    conteudo.push({ text: '', margin: [0, 0, 0, 18] });
  }

  return {
    pageSize: 'A4',
    pageMargins: [PDF_MARGEM, PDF_MARGEM, PDF_MARGEM, 24],
    info: { title: `Relatório de Atividades - ${periodo}`, author: usuario, creator: 'Painel RDO cbm' },
    defaultStyle: { fontSize: 10 },
    footer: (atual, total) => ({ text: `${atual} / ${total}`, alignment: 'right', fontSize: 9, margin: [0, 6, PDF_MARGEM, 0] }),
    content: conteudo,
  };
}

async function carregarLogoPdf() {
  const resposta = await fetch('img/logo-pdf.png');
  return blobParaDataUrl(await resposta.blob());
}

function nomeArquivoPdf() {
  const inicio = chaveDia(periodoCarregado.inicio);
  const fim = chaveDia(periodoCarregado.fim);
  return inicio === fim ? `Relatorio_RDO_${inicio}.pdf` : `Relatorio_RDO_${inicio}_a_${fim}.pdf`;
}

function abrirDialogoPdf() {
  const { registros, fotos } = recorteAtual;
  const inicio = chaveDia(periodoCarregado.inicio);
  const fim = chaveDia(periodoCarregado.fim);
  const periodo = inicio === fim ? dataBr(inicio) : `${dataBr(inicio)} a ${dataBr(fim)}`;
  const encarregados = new Set(registros.map(r => r.encarregado_chave)).size;
  const filtros = descreverFiltrosAtivos();

  document.getElementById('pdf-resumo').innerHTML =
    `<b>Período:</b> ${escaparHtml(periodo)}<br>`
    + `<b>${registros.length}</b> registro(s) de <b>${encarregados}</b> encarregado(s)`
    + (filtros ? `<br><b>Filtros:</b> ${escaparHtml(filtros)}` : '');
  document.getElementById('pdf-qtd-fotos').textContent = fotos.length;
  const incluir = document.getElementById('pdf-incluir-fotos');
  incluir.checked = fotos.length > 0;
  incluir.disabled = fotos.length === 0;
  atualizarAvisoPdf();
  document.getElementById('pdf-progresso').hidden = true;
  document.getElementById('pdf-erro').hidden = true;
  document.getElementById('pdf-gerar').disabled = registros.length === 0;
  document.getElementById('pdf-gerar').textContent = 'Gerar PDF';
  document.getElementById('dialogo-pdf').showModal();
}

function atualizarAvisoPdf() {
  const qtd = recorteAtual.fotos.length;
  const incluir = document.getElementById('pdf-incluir-fotos').checked;
  document.getElementById('pdf-aviso').hidden = !(incluir && qtd > PDF_AVISO_FOTOS);
}

function mostrarProgressoPdf(texto, fracao) {
  document.getElementById('pdf-progresso').hidden = false;
  document.getElementById('pdf-progresso-texto').textContent = texto;
  const barra = document.getElementById('pdf-progresso-barra');
  if (fracao === undefined) barra.removeAttribute('value');
  else barra.value = fracao;
}

async function gerarRelatorioPdf() {
  if (exportacaoPdf.rodando) return;
  exportacaoPdf = { cancelada: false, rodando: true };
  const botao = document.getElementById('pdf-gerar');
  const erroEl = document.getElementById('pdf-erro');
  botao.disabled = true;
  botao.textContent = 'Gerando…';
  erroEl.hidden = true;
  try {
    const incluirFotos = document.getElementById('pdf-incluir-fotos').checked;
    const incluirMapa = document.getElementById('pdf-incluir-mapa').checked;
    mostrarProgressoPdf('Preparando…');
    await garantirPdfMake();
    const logo = await carregarLogoPdf();
    const dados = await montarBlocosDoRelatorio(
      recorteAtual.registros, recorteAtual.fotos, incluirFotos, mostrarProgressoPdf);
    if (exportacaoPdf.cancelada) throw new Error('CANCELADO');
    let mapa = null;
    if (incluirMapa) {
      mostrarProgressoPdf('Montando o mapa…');
      try {
        mapa = await montarMapaDasAtividadesPdf(dados.blocos.flatMap(b => b.registros), mostrarProgressoPdf);
      } catch (e) {
        console.warn('Relatório PDF: mapa não montado', e);
      }
    }
    if (exportacaoPdf.cancelada) throw new Error('CANCELADO');
    mostrarProgressoPdf('Montando o PDF…');
    const definicao = montarDefinicaoPdf(dados, logo, incluirFotos, mapa);
    await new Promise((resolve, reject) => {
      try {
        pdfMake.createPdf(definicao).download(nomeArquivoPdf(), resolve);
      } catch (e) {
        reject(e);
      }
    });
    mostrarProgressoPdf('PDF gerado.', 1);
    const inicioPdf = chaveDia(periodoCarregado.inicio);
    const fimPdf = chaveDia(periodoCarregado.fim);
    registrarUso('pdf', {
      periodo: inicioPdf === fimPdf ? dataBr(inicioPdf) : `${dataBr(inicioPdf)} a ${dataBr(fimPdf)}`,
      registros: dados.blocos.reduce((s, b) => s + b.registros.length, 0),
      fotos: incluirFotos,
      mapa: incluirMapa,
      filtros: descreverFiltrosAtivos(),
    });
    setTimeout(() => document.getElementById('dialogo-pdf').close(), 800);
  } catch (e) {
    if (e.message !== 'CANCELADO') {
      console.error(e);
      erroEl.textContent = 'Não foi possível gerar o PDF: ' + e.message;
      erroEl.hidden = false;
    }
    document.getElementById('pdf-progresso').hidden = true;
  } finally {
    exportacaoPdf.rodando = false;
    botao.disabled = false;
    botao.textContent = 'Gerar PDF';
  }
}

function cancelarRelatorioPdf() {
  exportacaoPdf.cancelada = true;
  document.getElementById('dialogo-pdf').close();
}
