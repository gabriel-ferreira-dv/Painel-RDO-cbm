const URL_DADOS = `${SUPABASE_URL}/storage/v1/object/public/dados`;
const URL_SATELITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';

const MAPA_LARGURA = 1200;
const MAPA_ALTURA = 700;
const MAPA_TILE = 256;
const MAPA_ZOOM_PROJETO = 16;
const MAPA_ZOOM_MAXIMO = 18;
const MAPA_ZOOM_MINIMO = 10;
const MAPA_MAX_PECAS = 200;
const MAPA_OPACIDADE_PROJETO = 0.8;

const CORES_DE_SERVICO = [
  '#00E5FF', '#E040FB', '#FFEA00', '#FF6D00', '#76FF03',
  '#2979FF', '#FF1744', '#1DE9B6', '#F50057', '#8D6E63',
];

const MAPAS_DO_PROJETO = [
  { nome: 'D2', swE: 351849.7584, swN: 7784342.6030, neE: 354010.7511, neN: 7794250.1072, cols: 25, rows: 90 },
  { nome: 'C1', swE: 351473.537, swN: 7796577.542, neE: 355442.406, neN: 7803295.129, cols: 30, rows: 60 },
  { nome: 'Contorno_Fundão', swE: 352423.387, swN: 7793005.057, neE: 354770.603, neN: 7797645.351, cols: 15, rows: 30 },
  { nome: 'Contorno_Ibiraçu', swE: 354902.080, swN: 7806251.889, neE: 357104.019, neN: 7808991.788, cols: 20, rows: 30 },
];

function utmParaLatLng(leste, norte) {
  const a = 6378137;
  const f = 1 / 298.257222101;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const x = leste - 500000;
  const y = norte - 10000000;
  const m = y / k0;
  const mu = m / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const sen = Math.sin(phi1);
  const cos = Math.cos(phi1);
  const tan = Math.tan(phi1);
  const n1 = a / Math.sqrt(1 - e2 * sen * sen);
  const t1 = tan * tan;
  const c1 = ep2 * cos * cos;
  const r1 = a * (1 - e2) / (1 - e2 * sen * sen) ** 1.5;
  const d = x / (n1 * k0);
  const lat = phi1 - (n1 * tan / r1) * (
    d ** 2 / 2
    - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4 / 24
    + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6 / 720);
  const lon = (-39 * Math.PI / 180) + (
    d
    - (1 + 2 * t1 + c1) * d ** 3 / 6
    + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5 / 120) / cos;
  return { lat: lat * 180 / Math.PI, lng: lon * 180 / Math.PI };
}

function pixelNoMundo(p, zoom) {
  const escala = MAPA_TILE * 2 ** zoom;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, p.lat)) * Math.PI / 180;
  return {
    x: (p.lng + 180) / 360 * escala,
    y: (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * escala,
  };
}

function latLngDoPixel(x, y, zoom) {
  const escala = MAPA_TILE * 2 ** zoom;
  const n = Math.PI * (1 - 2 * y / escala);
  return { lat: Math.atan(Math.sinh(n)) * 180 / Math.PI, lng: x / escala * 360 - 180 };
}

function enquadrarMapa(pontos, margem = 30) {
  const base = pontos.map(p => pixelNoMundo(p, 0));
  const larguraBase = Math.max(...base.map(p => p.x)) - Math.min(...base.map(p => p.x));
  const alturaBase = Math.max(...base.map(p => p.y)) - Math.min(...base.map(p => p.y));
  const z = Math.max(MAPA_ZOOM_MINIMO, Math.min(
    MAPA_ZOOM_MAXIMO,
    Math.log2((MAPA_LARGURA - 2 * margem) / larguraBase),
    Math.log2((MAPA_ALTURA - 2 * margem) / alturaBase)));
  const px = pontos.map(p => pixelNoMundo(p, z));
  const xs = px.map(p => p.x);
  const ys = px.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { zoom: z, x: (minX + maxX) / 2 - MAPA_LARGURA / 2, y: (minY + maxY) / 2 - MAPA_ALTURA / 2 };
}

function chaveDoTrecho(trecho) {
  return semAcento(String(trecho || '')).toUpperCase().replace(/\s+/g, ' ').trim();
}

function numeroInteiroDaEstaca(texto) {
  const n = estacaEmNumero(texto);
  return Number.isNaN(n) ? NaN : Math.floor(n);
}

async function lerCsvDados(arquivo) {
  const bytes = new Uint8Array(await (await fetch(`${URL_DADOS}/${arquivo}`)).arrayBuffer());
  let texto = new TextDecoder('utf-8').decode(bytes);
  if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(bytes);
  return texto.replace(/^﻿/, '').split(/\r?\n/).slice(1).filter(l => l.trim()).map(l => l.split(';'));
}

function numeroCsv(v) {
  const t = String(v || '').trim();
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
}

let estacasDoProjetoCache = null;

function carregarEstacasDoProjeto() {
  if (!estacasDoProjetoCache) {
    estacasDoProjetoCache = (async () => {
      const [coords, kms] = await Promise.all([lerCsvDados('estacas_coords.csv'), lerCsvDados('KMxEst.csv')]);
      const kmPorEstaca = new Map();
      for (const [trecho, estaca, , km] of kms) {
        kmPorEstaca.set(`${chaveDoTrecho(trecho)}|${parseInt(estaca, 10)}`, String(km || '').trim());
      }
      const porTrecho = new Map();
      for (const [trecho, estaca, leste, norte] of coords) {
        const numero = parseInt(estaca, 10);
        const e = numeroCsv(leste), n = numeroCsv(norte);
        if (Number.isNaN(numero) || !e || !n) continue;
        const chave = chaveDoTrecho(trecho);
        if (!porTrecho.has(chave)) porTrecho.set(chave, []);
        porTrecho.get(chave).push({
          numero, ponto: utmParaLatLng(e, n), km: kmPorEstaca.get(`${chave}|${numero}`) || '',
        });
      }
      for (const lista of porTrecho.values()) lista.sort((a, b) => a.numero - b.numero);
      return porTrecho;
    })().catch(e => { estacasDoProjetoCache = null; throw e; });
  }
  return estacasDoProjetoCache;
}

function estacasDoIntervaloMapa(r, porTrecho) {
  const lista = porTrecho.get(chaveDoTrecho(r.trecho));
  if (!lista) return [];
  const ini = numeroInteiroDaEstaca(r.estaca_inicial);
  if (Number.isNaN(ini)) return [];
  const fimBruto = numeroInteiroDaEstaca(r.estaca_final);
  const fim = Number.isNaN(fimBruto) ? ini : fimBruto;
  const de = Math.min(ini, fim), ate = Math.max(ini, fim);
  return lista.filter(e => e.numero >= de && e.numero <= ate);
}

function servicosPorFrequencia(servicos) {
  const contagem = new Map();
  for (const s of servicos) contagem.set(s, (contagem.get(s) || 0) + 1);
  return [...contagem.keys()].sort((a, b) => contagem.get(b) - contagem.get(a) || (a < b ? -1 : a > b ? 1 : 0));
}

function corDoServicoMapa(servico, servicos) {
  const i = servicos.indexOf(servico);
  return CORES_DE_SERVICO[(i < 0 ? 0 : i) % CORES_DE_SERVICO.length];
}

let arquivosDosMapasCache = null;

async function arquivosDosMapas() {
  if (!arquivosDosMapasCache) {
    arquivosDosMapasCache = (async () => {
      const mapa = new Map(MAPAS_DO_PROJETO.map(m => [m.nome, `${semAcento(m.nome)}.zip`]));
      try {
        const { data } = await sb.from('versoes_dados').select('nome,arquivo');
        for (const l of data || []) if (mapa.has(l.nome) && l.arquivo) mapa.set(l.nome, l.arquivo);
      } catch {}
      return mapa;
    })();
  }
  return arquivosDosMapasCache;
}

const indicesDeZip = new Map();

async function faixaDoArquivo(url, inicio, fim) {
  const resposta = await fetch(url, { headers: { Range: `bytes=${inicio}-${fim}` } });
  if (resposta.status !== 206 && resposta.status !== 200) throw new Error(`HTTP ${resposta.status}`);
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  return resposta.status === 200 ? bytes.subarray(inicio, fim + 1) : bytes;
}

function indiceDoZip(url) {
  if (!indicesDeZip.has(url)) {
    indicesDeZip.set(url, (async () => {
      const cabeca = await fetch(url, { method: 'HEAD' });
      const tamanho = Number(cabeca.headers.get('content-length'));
      if (!cabeca.ok || !tamanho) throw new Error('zip indisponível');
      const cauda = await faixaDoArquivo(url, Math.max(0, tamanho - 65557), tamanho - 1);
      const dv = new DataView(cauda.buffer, cauda.byteOffset, cauda.byteLength);
      let fimDir = -1;
      for (let i = cauda.length - 22; i >= 0; i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { fimDir = i; break; }
      }
      if (fimDir < 0) throw new Error('zip sem diretório');
      const total = dv.getUint16(fimDir + 10, true);
      const dirTam = dv.getUint32(fimDir + 12, true);
      const dirIni = dv.getUint32(fimDir + 16, true);
      const dir = await faixaDoArquivo(url, dirIni, dirIni + dirTam - 1);
      const cv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
      const decodificador = new TextDecoder();
      const entradas = new Map();
      let p = 0;
      for (let i = 0; i < total; i++) {
        const metodo = cv.getUint16(p + 10, true);
        const comprimido = cv.getUint32(p + 20, true);
        const n = cv.getUint16(p + 28, true);
        const extra = cv.getUint16(p + 30, true);
        const coment = cv.getUint16(p + 32, true);
        const deslocamento = cv.getUint32(p + 42, true);
        const nome = decodificador.decode(dir.subarray(p + 46, p + 46 + n));
        const m = nome.match(/(\d+)_(\d+)\.webp$/i);
        if (m) entradas.set(`${parseInt(m[1], 10)}_${parseInt(m[2], 10)}`, { metodo, comprimido, deslocamento });
        p += 46 + n + extra + coment;
      }
      return entradas;
    })().catch(e => { indicesDeZip.delete(url); throw e; }));
  }
  return indicesDeZip.get(url);
}

async function tileDoZip(url, linha, coluna) {
  const entradas = await indiceDoZip(url);
  const entrada = entradas.get(`${linha}_${coluna}`);
  if (!entrada) return null;
  const bloco = await faixaDoArquivo(url, entrada.deslocamento, entrada.deslocamento + 30 + 1024 + entrada.comprimido);
  const lv = new DataView(bloco.buffer, bloco.byteOffset, bloco.byteLength);
  const inicio = 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
  let dados = bloco.subarray(inicio, inicio + entrada.comprimido);
  if (entrada.metodo === 8) {
    const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    dados = new Uint8Array(await new Response(fluxo).arrayBuffer());
  } else if (entrada.metodo !== 0) {
    return null;
  }
  return createImageBitmap(new Blob([dados], { type: 'image/webp' }));
}

function cantoDoMapa(def, linha, coluna) {
  if (!def.grade) {
    def.grade = [];
    for (let r = 0; r <= def.rows; r++) {
      const fila = [];
      for (let c = 0; c <= def.cols; c++) {
        fila.push(utmParaLatLng(
          def.swE + (def.neE - def.swE) * c / def.cols,
          def.neN - (def.neN - def.swN) * r / def.rows));
      }
      def.grade.push(fila);
    }
  }
  return def.grade[linha][coluna];
}

const VISAO_GERAL_ZOOM_MINIMO = 11;
const VISAO_GERAL_LINHAS_POR_FAIXA = 10;
const visoesGerais = new Map();

function visaoGeralDoMapa(def) {
  if (!visoesGerais.has(def.nome)) {
    visoesGerais.set(def.nome, carregarImagem(`img/mapas/${encodeURIComponent(semAcento(def.nome))}.webp`));
  }
  return visoesGerais.get(def.nome);
}

function mapasNaArea(area) {
  return MAPAS_DO_PROJETO.filter(def =>
    sobrepoe(area, envelope([cantoDoMapa(def, def.rows, 0), cantoDoMapa(def, 0, def.cols), cantoDoMapa(def, 0, 0), cantoDoMapa(def, def.rows, def.cols)])));
}

function desenharAfim(ctx, img, sx, sy, sw, sh, t, be, bd, escala = 1, sobra = 0) {
  ctx.setTransform(
    escala * (bd.x - be.x), escala * (bd.y - be.y),
    escala * (be.x - t.x), escala * (be.y - t.y),
    escala * t.x, escala * t.y);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 1, 1 + sobra);
}

function desenharVisaoGeral(ctx, def, img, naTela, escala = 1) {
  const alturaLinha = img.height / def.rows;
  for (let r = 0; r < def.rows; r += VISAO_GERAL_LINHAS_POR_FAIXA) {
    const r1 = Math.min(def.rows, r + VISAO_GERAL_LINHAS_POR_FAIXA);
    const t = naTela(cantoDoMapa(def, r, 0));
    const be = naTela(cantoDoMapa(def, r1, 0));
    const bd = naTela(cantoDoMapa(def, r1, def.cols));
    const sy = Math.round(r * alturaLinha);
    const sh = Math.round(r1 * alturaLinha) - sy;
    desenharAfim(ctx, img, 0, sy, img.width, sh, t, be, bd, escala, r1 < def.rows ? 0.02 : 0);
  }
}

function envelope(pontos) {
  return {
    sul: Math.min(...pontos.map(p => p.lat)), norte: Math.max(...pontos.map(p => p.lat)),
    oeste: Math.min(...pontos.map(p => p.lng)), leste: Math.max(...pontos.map(p => p.lng)),
  };
}

function sobrepoe(a, b) {
  return a.sul <= b.norte && a.norte >= b.sul && a.oeste <= b.leste && a.leste >= b.oeste;
}

function pecasDoProjetoNaArea(area) {
  const pecas = [];
  for (const def of MAPAS_DO_PROJETO) {
    const todo = envelope([cantoDoMapa(def, def.rows, 0), cantoDoMapa(def, 0, def.cols)]);
    if (!sobrepoe(area, todo)) continue;
    for (let r = 0; r < def.rows; r++) {
      for (let c = 0; c < def.cols; c++) {
        const cantos = [cantoDoMapa(def, r, c), cantoDoMapa(def, r, c + 1), cantoDoMapa(def, r + 1, c), cantoDoMapa(def, r + 1, c + 1)];
        if (!sobrepoe(area, envelope(cantos))) continue;
        pecas.push({ def, linha: r, coluna: c, topo: cantos[0], baseEsq: cantos[2], baseDir: cantos[3] });
      }
    }
  }
  return pecas;
}

async function emLotes(itens, tamanho, fn) {
  const resultados = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    resultados.push(...await Promise.all(itens.slice(i, i + tamanho).map(fn)));
  }
  return resultados;
}

async function carregarImagem(url) {
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) return null;
    return await createImageBitmap(await resposta.blob());
  } catch {
    return null;
  }
}

function desenharLinha(ctx, xy, cor, espessura) {
  ctx.strokeStyle = cor;
  ctx.lineWidth = espessura;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  xy.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
}

async function montarMapaDasAtividadesPdf(registros, aoProgredir) {
  const porTrecho = await carregarEstacasDoProjeto();
  const servicos = servicosPorFrequencia(registros.map(r => r.servico_notavel));
  const tracos = [];
  const desenhados = new Set();
  const trechos = new Set();
  const rotulos = new Map();
  for (const r of registros) {
    const cobertas = estacasDoIntervaloMapa(r, porTrecho);
    if (cobertas.length === 0) continue;
    tracos.push({ pontos: cobertas.map(e => e.ponto), cor: corDoServicoMapa(r.servico_notavel, servicos) });
    desenhados.add(r.servico_notavel);
    const trecho = chaveDoTrecho(r.trecho);
    trechos.add(trecho);
    const inicio = cobertas[0];
    if (inicio.km && !rotulos.has(`${trecho}|${inicio.km}`)) {
      rotulos.set(`${trecho}|${inicio.km}`, { ponto: inicio.ponto, texto: `KM ${inicio.km}` });
    }
  }
  if (tracos.length === 0) return null;

  const quadro = enquadrarMapa(tracos.flatMap(t => t.pontos));
  const z = quadro.zoom;
  const naTela = (p) => { const px = pixelNoMundo(p, z); return { x: px.x - quadro.x, y: px.y - quadro.y }; };

  const canvas = document.createElement('canvas');
  canvas.width = MAPA_LARGURA;
  canvas.height = MAPA_ALTURA;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ececec';
  ctx.fillRect(0, 0, MAPA_LARGURA, MAPA_ALTURA);

  aoProgredir('Montando o mapa: imagem de satélite…');
  const zTile = Math.ceil(z);
  const tamTile = MAPA_TILE * 2 ** (z - zTile);
  const pedidos = [];
  for (let ty = Math.floor(quadro.y / tamTile); ty <= Math.floor((quadro.y + MAPA_ALTURA - 1) / tamTile); ty++) {
    for (let tx = Math.floor(quadro.x / tamTile); tx <= Math.floor((quadro.x + MAPA_LARGURA - 1) / tamTile); tx++) {
      pedidos.push({ tx, ty });
    }
  }
  const meio = pedidos[Math.floor(pedidos.length / 2)];
  let comSatelite = false;
  const primeiro = await carregarImagem(`${URL_SATELITE}/${zTile}/${meio.ty}/${meio.tx}`);
  if (primeiro) {
    comSatelite = true;
    const resto = pedidos.filter(p => p !== meio);
    const imagens = await emLotes(resto, 8, p => carregarImagem(`${URL_SATELITE}/${zTile}/${p.ty}/${p.tx}`));
    [[meio, primeiro], ...resto.map((p, i) => [p, imagens[i]])].forEach(([p, img]) => {
      if (!img) return;
      const x = Math.floor(p.tx * tamTile - quadro.x);
      const y = Math.floor(p.ty * tamTile - quadro.y);
      ctx.drawImage(img, x, y, Math.ceil((p.tx + 1) * tamTile - quadro.x) - x, Math.ceil((p.ty + 1) * tamTile - quadro.y) - y);
    });
  }

  let comProjeto = false;
  const areaDaImagem = envelope([
    latLngDoPixel(quadro.x, quadro.y + MAPA_ALTURA, z),
    latLngDoPixel(quadro.x + MAPA_LARGURA, quadro.y, z),
  ]);
  if (z >= VISAO_GERAL_ZOOM_MINIMO) {
    aoProgredir('Montando o mapa: desenho do projeto…');
    const defs = mapasNaArea(areaDaImagem);
    const imagens = await Promise.all(defs.map(visaoGeralDoMapa));
    ctx.save();
    ctx.globalAlpha = MAPA_OPACIDADE_PROJETO;
    defs.forEach((def, i) => {
      if (!imagens[i]) return;
      desenharVisaoGeral(ctx, def, imagens[i], naTela);
      comProjeto = true;
    });
    ctx.restore();
  }
  if (z >= MAPA_ZOOM_PROJETO) {
    const area = areaDaImagem;
    const pecas = pecasDoProjetoNaArea(area);
    if (pecas.length > 0 && pecas.length <= MAPA_MAX_PECAS) {
      const arquivos = await arquivosDosMapas();
      let feitas = 0;
      const imagens = await emLotes(pecas, 6, async (p) => {
        const arquivo = arquivos.get(p.def.nome);
        let img = null;
        try {
          img = arquivo ? await tileDoZip(`${URL_DADOS}/${encodeURIComponent(arquivo)}`, p.linha, p.coluna) : null;
        } catch (e) {
          console.warn('Mapa do relatório: tile do projeto falhou', p.def.nome, p.linha, p.coluna, e);
        }
        feitas++;
        aoProgredir(`Montando o mapa: desenho do projeto (${feitas} de ${pecas.length})…`, feitas / pecas.length);
        return img;
      });
      ctx.save();
      ctx.globalAlpha = MAPA_OPACIDADE_PROJETO;
      pecas.forEach((p, i) => {
        const img = imagens[i];
        if (!img) return;
        const t = naTela(p.topo), be = naTela(p.baseEsq), bd = naTela(p.baseDir);
        const ax = bd.x - be.x, ay = bd.y - be.y;
        const bx = be.x - t.x, by = be.y - t.y;
        ctx.setTransform(ax / img.width, ay / img.width, bx / img.height, by / img.height, t.x, t.y);
        ctx.drawImage(img, 0, 0);
        comProjeto = true;
      });
      ctx.restore();
    }
  }

  if (!comProjeto) {
    const corEixo = comSatelite ? 'rgba(255,255,255,0.55)' : '#969696';
    for (const trecho of trechos) {
      const lista = porTrecho.get(trecho) || [];
      for (const serie of [lista.filter(e => e.numero < 2000), lista.filter(e => e.numero >= 2000)]) {
        if (serie.length > 1) desenharLinha(ctx, serie.map(e => naTela(e.ponto)), corEixo, 2);
      }
    }
  }

  for (const t of tracos) {
    const xy = t.pontos.map(naTela);
    if (xy.length === 1) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(xy[0].x, xy[0].y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = t.cor;
      ctx.beginPath(); ctx.arc(xy[0].x, xy[0].y, 7, 0, Math.PI * 2); ctx.fill();
    } else {
      desenharLinha(ctx, xy, '#ffffff', 11);
      desenharLinha(ctx, xy, t.cor, 7);
    }
  }

  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  for (const r of rotulos.values()) {
    const p = naTela(r.ponto);
    const largura = ctx.measureText(r.texto).width;
    const x = p.x + 12;
    ctx.fillStyle = 'rgba(0,0,0,0.67)';
    ctx.beginPath();
    ctx.roundRect(x - 6, p.y - 15, largura + 12, 30, 4);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(r.texto, x, p.y + 1);
  }

  return {
    imagem: canvas.toDataURL('image/jpeg', 0.85),
    comSatelite,
    legenda: servicos.filter(s => desenhados.has(s)).map(s => ({ servico: s, cor: corDoServicoMapa(s, servicos) })),
  };
}
