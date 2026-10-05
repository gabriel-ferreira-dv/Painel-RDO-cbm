let mapaDaFoto = null;
let camadaDaFoto = null;
const ZOOM_MAPA_FOTO = 18;

function avisoMapaFoto(texto) {
  const el = document.getElementById('aviso-mapa-foto');
  el.textContent = texto;
  el.hidden = !texto;
}

function criarMapaDaFoto() {
  mapaDaFoto = L.map('mapa-foto', { zoomControl: true, maxZoom: 20, ...OPCOES_DE_GIRO });
  criarPaneDoProjeto(mapaDaFoto);
  adicionarControleDeGiro(mapaDaFoto);
  L.tileLayer(`${URL_SATELITE}/{z}/{y}/{x}`, {
    maxZoom: 20, maxNativeZoom: 18, attribution: 'Imagem de satélite: Esri World Imagery',
  }).addTo(mapaDaFoto);
  new CamadaDoProjeto({ aoAvisar: avisoMapaFoto, avisarDeLonge: false }).addTo(mapaDaFoto);
  camadaDaFoto = L.layerGroup().addTo(mapaDaFoto);
}

function pontoDaFoto(foto) {
  const lat = Number(foto.latitude);
  const lng = Number(foto.longitude);
  if (foto.latitude == null || foto.longitude == null || !lat || !lng) return null;
  return [lat, lng];
}

async function trechoDoRegistroNoMapa(r) {
  if (!r) return [];
  try {
    const porTrecho = await carregarEstacasDoProjeto();
    return estacasDoIntervaloMapa(r, porTrecho).map(e => [e.ponto.lat, e.ponto.lng]);
  } catch {
    return [];
  }
}

function fotoTemLocal(item) {
  return !!item && !!pontoDaFoto(item.foto);
}

async function abrirMapaDaObra() {
  if (indiceLightbox < 0 || typeof L === 'undefined') return;
  const item = galeria.itens[indiceLightbox];
  if (!item) return;
  const { foto, registro: r } = item;
  const ponto = pontoDaFoto(foto);

  document.getElementById('info-mapa-foto').innerHTML = r
    ? `<b>${escaparHtml(descreverServico(r))}</b> · ${escaparHtml(r.encarregado)} · ${formatarDataHora(foto.criado_em)}<br>`
      + `${escaparHtml(r.trecho)}${r.via ? ' · ' + escaparHtml(r.via) : ''} · KM ${escaparHtml(descreverKm(r))} · Estaca ${escaparHtml(descreverEstaca(r))}`
    : formatarDataHora(foto.criado_em);

  const dialogo = document.getElementById('dialogo-mapa-foto');
  dialogo.classList.remove('expandido');
  document.getElementById('expandir-mapa-foto').textContent = '⛶ Expandir';
  document.getElementById('expandir-mapa-foto').setAttribute('aria-pressed', 'false');
  dialogo.showModal();
  if (!mapaDaFoto) criarMapaDaFoto();
  mapaDaFoto.invalidateSize();
  camadaDaFoto.clearLayers();

  const linha = await trechoDoRegistroNoMapa(r);
  if (linha.length > 1) {
    L.polyline(linha, { color: '#ffffff', weight: 9, opacity: 0.9, interactive: false }).addTo(camadaDaFoto);
    L.polyline(linha, { color: '#00E5FF', weight: 5, opacity: 1, interactive: false }).addTo(camadaDaFoto);
  } else if (linha.length === 1) {
    L.circleMarker(linha[0], { radius: 6, color: '#ffffff', weight: 2, fillColor: '#00E5FF', fillOpacity: 1, interactive: false }).addTo(camadaDaFoto);
  }

  if (ponto) {
    L.marker(ponto, {
      icon: L.divIcon({ className: 'pino-foto', html: '<span></span>', iconSize: [26, 26], iconAnchor: [13, 13] }),
      title: 'Onde a foto foi tirada',
    }).addTo(camadaDaFoto);
    mapaDaFoto.setView(ponto, ZOOM_MAPA_FOTO, { animate: false });
    document.getElementById('legenda-mapa-foto').innerHTML =
      '<span class="item-legenda"><i class="pino-legenda"></i>Onde a foto foi tirada</span>'
      + (linha.length ? '<span class="item-legenda"><i style="background:#00E5FF"></i>Estacas do registro</span>' : '');
  } else if (linha.length) {
    mapaDaFoto.fitBounds(L.latLngBounds(linha), { padding: [40, 40], maxZoom: ZOOM_MAPA_FOTO });
    document.getElementById('legenda-mapa-foto').innerHTML =
      '<span class="item-legenda"><i style="background:#00E5FF"></i>Estacas do registro</span>'
      + '<span class="aviso-sem-gps">Esta foto não tem localização GPS; o mapa mostra as estacas do registro.</span>';
  } else {
    mapaDaFoto.setView([-19.99, -40.40], 13, { animate: false });
    document.getElementById('legenda-mapa-foto').innerHTML =
      '<span class="aviso-sem-gps">Esta foto não tem localização GPS nem estaca com coordenada.</span>';
  }
}

function definirMapaDaObraExpandido(expandido) {
  const dialogo = document.getElementById('dialogo-mapa-foto');
  const botao = document.getElementById('expandir-mapa-foto');
  dialogo.classList.toggle('expandido', expandido);
  botao.setAttribute('aria-pressed', String(expandido));
  botao.textContent = expandido ? '⤡ Reduzir' : '⛶ Expandir';
  botao.title = expandido ? 'Voltar ao tamanho normal' : 'Expandir para a tela inteira';
  if (mapaDaFoto) {
    const centro = mapaDaFoto.getCenter();
    setTimeout(() => {
      mapaDaFoto.invalidateSize();
      mapaDaFoto.setView(centro, mapaDaFoto.getZoom(), { animate: false });
    }, 60);
  }
}

function alternarMapaDaObraExpandido() {
  definirMapaDaObraExpandido(!document.getElementById('dialogo-mapa-foto').classList.contains('expandido'));
}

function fecharMapaDaObra() {
  document.getElementById('dialogo-mapa-foto').close();
}
