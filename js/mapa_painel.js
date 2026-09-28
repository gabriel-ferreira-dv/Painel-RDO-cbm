let mapaPainel = null;
let camadaAtividades = null;
let camadaRotulos = null;
let geracaoMapa = 0;
let ultimoRecorteMapa = null;

const ZOOM_ROTULOS = 14;
const ZOOM_DETALHE_PROJETO = 17;
const pecasEmCache = new Map();

const CamadaDoProjeto = typeof L === 'undefined' ? null : L.Layer.extend({
  onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create('canvas', 'camada-projeto leaflet-zoom-hide');
    map.getPane('projeto').appendChild(this._canvas);
    map.on('moveend resize', this._redesenhar, this);
    this._redesenhar();
  },

  onRemove(map) {
    map.off('moveend resize', this._redesenhar, this);
    this._canvas.remove();
  },

  async _redesenhar() {
    const map = this._map;
    const geracao = (this._geracao = (this._geracao || 0) + 1);
    const tamanho = map.getSize();
    const dpr = window.devicePixelRatio || 1;
    const canvas = this._canvas;
    canvas.width = tamanho.x * dpr;
    canvas.height = tamanho.y * dpr;
    canvas.style.width = `${tamanho.x}px`;
    canvas.style.height = `${tamanho.y}px`;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    mostrarAvisoMapa('');

    const zoom = map.getZoom();
    if (zoom < VISAO_GERAL_ZOOM_MINIMO) {
      if (camadaAtividades && camadaAtividades.getLayers().length > 0) {
        mostrarAvisoMapa('Aproxime o mapa para ver o desenho do projeto');
      }
      return;
    }
    const b = map.getBounds();
    const area = { sul: b.getSouth(), norte: b.getNorth(), oeste: b.getWest(), leste: b.getEast() };
    const defs = mapasNaArea(area);
    if (defs.length === 0) return;
    const pontoNaTela = (p) => map.latLngToContainerPoint([p.lat, p.lng]);
    const visoes = new Map();
    const pecas = zoom >= ZOOM_DETALHE_PROJETO ? pecasDoProjetoNaArea(area) : [];
    const comDetalhe = pecas.length > 0 && pecas.length <= MAPA_MAX_PECAS;

    const desenhar = () => {
      if (geracao !== this._geracao) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = MAPA_OPACIDADE_PROJETO;
      for (const def of defs) {
        const img = visoes.get(def.nome);
        if (img) desenharVisaoGeral(ctx, def, img, pontoNaTela, dpr);
      }
      if (!comDetalhe) return;
      for (const p of pecas) {
        const img = pecasEmCache.get(chavePeca(p));
        if (!img) continue;
        const t = map.latLngToContainerPoint([p.topo.lat, p.topo.lng]);
        const be = map.latLngToContainerPoint([p.baseEsq.lat, p.baseEsq.lng]);
        const bd = map.latLngToContainerPoint([p.baseDir.lat, p.baseDir.lng]);
        ctx.setTransform(
          dpr * (bd.x - be.x) / img.width, dpr * (bd.y - be.y) / img.width,
          dpr * (be.x - t.x) / img.height, dpr * (be.y - t.y) / img.height,
          dpr * t.x, dpr * t.y);
        ctx.drawImage(img, 0, 0);
      }
    };

    const imagensGerais = await Promise.all(defs.map(visaoGeralDoMapa));
    if (geracao !== this._geracao) return;
    defs.forEach((def, i) => { if (imagensGerais[i]) visoes.set(def.nome, imagensGerais[i]); });
    desenhar();
    if (!comDetalhe) return;

    const arquivos = await arquivosDosMapas();
    if (geracao !== this._geracao) return;
    const faltando = pecas.filter(p => !pecasEmCache.has(chavePeca(p)));
    if (faltando.length === 0) return;
    if (pecasEmCache.size + faltando.length > 800) pecasEmCache.clear();
    mostrarAvisoMapa(`Carregando o detalhe do projeto (${faltando.length} partes)…`);
    for (let i = 0; i < faltando.length; i += 6) {
      if (geracao !== this._geracao) return;
      await Promise.all(faltando.slice(i, i + 6).map(async (p) => {
        const arquivo = arquivos.get(p.def.nome);
        try {
          const img = arquivo ? await tileDoZip(`${URL_DADOS}/${encodeURIComponent(arquivo)}`, p.linha, p.coluna) : null;
          if (img) pecasEmCache.set(chavePeca(p), img);
        } catch (e) {
          console.warn('Mapa: parte do projeto falhou', p.def.nome, p.linha, p.coluna, e);
        }
      }));
      desenhar();
    }
    if (geracao === this._geracao) mostrarAvisoMapa('');
  },
});

function chavePeca(p) {
  return `${p.def.nome}|${p.linha}|${p.coluna}`;
}

function mostrarAvisoMapa(texto) {
  const el = document.getElementById('aviso-mapa');
  el.textContent = texto;
  el.hidden = !texto;
}

function criarMapaPainel() {
  mapaPainel = L.map('mapa-atividades', { zoomControl: true, maxZoom: 20, preferCanvas: false });
  mapaPainel.createPane('projeto').style.zIndex = 350;
  L.tileLayer(`${URL_SATELITE}/{z}/{y}/{x}`, {
    maxZoom: 20, maxNativeZoom: 19, attribution: 'Imagem de satélite: Esri World Imagery',
  }).addTo(mapaPainel);
  new CamadaDoProjeto().addTo(mapaPainel);
  camadaAtividades = L.featureGroup().addTo(mapaPainel);
  camadaRotulos = L.layerGroup();
  mapaPainel.on('zoomend', atualizarRotulosMapa);
  mapaPainel.setView([-19.99, -40.40], 13);
}

function atualizarRotulosMapa() {
  if (!mapaPainel) return;
  const mostrar = mapaPainel.getZoom() >= ZOOM_ROTULOS;
  if (mostrar && !mapaPainel.hasLayer(camadaRotulos)) camadaRotulos.addTo(mapaPainel);
  if (!mostrar && mapaPainel.hasLayer(camadaRotulos)) mapaPainel.removeLayer(camadaRotulos);
}

function popupDoRegistro(r) {
  const porTerceiro = capitalizarNome(r.registrado_por_nome);
  const medicao = descreverMedicao(r);
  return `<div class="popup-mapa">
    <b>${escaparHtml(descreverServico(r))}</b>
    <div>${escaparHtml(r.encarregado)} · ${formatarDataHora(r.criado_em)}</div>
    <div>${escaparHtml(r.trecho)}${r.via ? ' · ' + escaparHtml(r.via) : ''} · KM ${escaparHtml(descreverKm(r))} · Est. ${escaparHtml(descreverEstaca(r))}</div>
    ${medicao ? `<div>Medição: ${escaparHtml(medicao)}</div>` : ''}
    ${porTerceiro ? `<div class="popup-terceiro">Lançado por ${escaparHtml(porTerceiro)}</div>` : ''}
  </div>`;
}

let mapaAberto = false;
let registrosDoMapa = [];

function atualizarMapaAtividades(registros) {
  registrosDoMapa = registros;
  if (mapaAberto) desenharMapaAtividades(registros);
}

function alternarMapaAtividades() {
  mapaAberto = !mapaAberto;
  const botao = document.getElementById('botao-mostrar-mapa');
  document.getElementById('conteudo-mapa').hidden = !mapaAberto;
  botao.textContent = mapaAberto ? 'Ocultar mapa' : 'Mostrar mapa';
  botao.setAttribute('aria-expanded', String(mapaAberto));
  if (!mapaAberto) {
    document.getElementById('contagem-mapa').textContent = '';
    return;
  }
  ultimoRecorteMapa = null;
  desenharMapaAtividades(registrosDoMapa);
}

async function desenharMapaAtividades(registros) {
  if (!CamadaDoProjeto) {
    document.getElementById('legenda-mapa').innerHTML = '<div class="vazio">Não foi possível carregar o mapa.</div>';
    return;
  }
  if (!mapaPainel) criarMapaPainel();
  const geracao = ++geracaoMapa;
  const contagem = document.getElementById('contagem-mapa');
  const legenda = document.getElementById('legenda-mapa');
  contagem.textContent = 'carregando…';

  let porTrecho;
  try {
    porTrecho = await carregarEstacasDoProjeto();
  } catch (e) {
    if (geracao !== geracaoMapa) return;
    contagem.textContent = '';
    legenda.innerHTML = '<div class="vazio">Não foi possível carregar as coordenadas das estacas.</div>';
    return;
  }
  if (geracao !== geracaoMapa) return;

  camadaAtividades.clearLayers();
  camadaRotulos.clearLayers();
  const servicos = servicosPorFrequencia(registros.map(r => r.servico_notavel));
  const porServico = new Map();
  const rotulos = new Map();
  let semCoordenada = 0;

  const ordenados = [...registros].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  for (const r of ordenados) {
    const cobertas = estacasDoIntervaloMapa(r, porTrecho);
    if (cobertas.length === 0) { semCoordenada++; continue; }
    const cor = corDoServicoMapa(r.servico_notavel, servicos);
    porServico.set(r.servico_notavel, (porServico.get(r.servico_notavel) || 0) + 1);
    const pontos = cobertas.map(e => [e.ponto.lat, e.ponto.lng]);
    const popup = popupDoRegistro(r);
    if (pontos.length === 1) {
      L.circleMarker(pontos[0], { radius: 7, color: '#ffffff', weight: 3, fillColor: cor, fillOpacity: 1 })
        .bindPopup(popup).addTo(camadaAtividades);
    } else {
      L.polyline(pontos, { color: '#ffffff', weight: 10, opacity: 1, interactive: false }).addTo(camadaAtividades);
      L.polyline(pontos, { color: cor, weight: 6, opacity: 1 }).bindPopup(popup).addTo(camadaAtividades);
    }
    const trecho = chaveDoTrecho(r.trecho);
    const inicio = cobertas[0];
    if (inicio.km && !rotulos.has(`${trecho}|${inicio.km}`)) {
      rotulos.set(`${trecho}|${inicio.km}`, true);
      L.marker([inicio.ponto.lat, inicio.ponto.lng], {
        interactive: false,
        icon: L.divIcon({ className: 'rotulo-km', html: `<span>KM ${escaparHtml(inicio.km)}</span>`, iconSize: null }),
      }).addTo(camadaRotulos);
    }
  }

  const noMapa = registros.length - semCoordenada;
  contagem.textContent = registros.length === 0
    ? ''
    : `${noMapa} de ${registros.length} registro(s)${semCoordenada ? ` · ${semCoordenada} sem coordenada de estaca` : ''}`;
  legenda.innerHTML = porServico.size === 0
    ? `<div class="vazio">${registros.length === 0 ? 'Nenhum registro no período/filtro selecionado.' : 'Nenhum registro com estaca que tenha coordenada.'}</div>`
    : servicos.filter(s => porServico.has(s)).map(s => `
      <span class="item-legenda"><i style="background:${corDoServicoMapa(s, servicos)}"></i>${escaparHtml(s)} <small>(${porServico.get(s)})</small></span>`).join('');

  const chave = registros.map(r => `${r.dispositivo_id}|${r.id_local}`).join(',');
  if (chave !== ultimoRecorteMapa) {
    ultimoRecorteMapa = chave;
    mapaPainel.invalidateSize();
    if (camadaAtividades.getLayers().length > 0) {
      mapaPainel.fitBounds(camadaAtividades.getBounds(), { padding: [40, 40], maxZoom: 18 });
    }
  }
  atualizarRotulosMapa();
}

function alternarTelaCheiaMapa() {
  const caixa = document.getElementById('caixa-mapa');
  if (document.fullscreenElement) document.exitFullscreen();
  else caixa.requestFullscreen?.();
}

document.addEventListener('fullscreenchange', () => {
  if (mapaPainel) setTimeout(() => mapaPainel.invalidateSize(), 100);
});
