let preferirSemCarimbo = false;
const urlsSemCarimbo = new LinksAssinados();

function caminhoSemCarimbo(foto) {
  return String(foto?.caminho_original_storage || '').trim();
}

async function linkAssinado(cache, caminho) {
  if (!caminho) return '';
  if (cache.has(caminho)) return cache.get(caminho);
  try {
    const { data } = await sb.storage.from(BUCKET_FOTOS).createSignedUrls([caminho], VALIDADE_DOS_LINKS_S);
    const url = data?.[0]?.signedUrl || '';
    if (url) cache.set(caminho, url);
    return url;
  } catch (e) {
    console.warn('Link da foto não gerado:', e);
    return '';
  }
}

function urlSemCarimbo(foto) {
  return linkAssinado(urlsSemCarimbo, caminhoSemCarimbo(foto));
}

async function versaoDaFotoParaMostrar(foto) {
  const comCarimbo = await linkAssinado(galeria.urls, foto.caminho_storage);
  const temSemCarimbo = !!caminhoSemCarimbo(foto);
  if (!temSemCarimbo || !preferirSemCarimbo) return { url: comCarimbo, semCarimbo: false, temSemCarimbo };
  const url = await urlSemCarimbo(foto);
  return url ? { url, semCarimbo: true, temSemCarimbo } : { url: comCarimbo, semCarimbo: false, temSemCarimbo };
}

function atualizarSeletorDeCarimbo(temSemCarimbo, semCarimbo) {
  const seletor = document.getElementById('seletor-carimbo');
  seletor.hidden = !temSemCarimbo;
  for (const b of seletor.querySelectorAll('button[data-carimbo]')) {
    const ativo = (b.dataset.carimbo === 'sem') === semCarimbo;
    b.classList.toggle('ativo', ativo);
    b.setAttribute('aria-pressed', String(ativo));
  }
}

const imagensAdiantadas = new Map();

function adiantarImagem(url) {
  if (!url || imagensAdiantadas.has(url)) return;
  if (imagensAdiantadas.size > 60) imagensAdiantadas.delete(imagensAdiantadas.keys().next().value);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  imagensAdiantadas.set(url, img);
}

async function adiantarVersoesAoRedor(indice) {
  for (const i of [indice, indice + 1, indice - 1]) {
    const item = galeria.itens[i];
    if (!item || i >= galeria.mostrados) continue;
    adiantarImagem(await linkAssinado(galeria.urls, item.foto.caminho_storage));
    if (caminhoSemCarimbo(item.foto)) adiantarImagem(await urlSemCarimbo(item.foto));
  }
}

function urlDaPrevia(item) {
  const caminho = caminhoSemCarimbo(item.foto);
  if (preferirSemCarimbo && caminho && urlsSemCarimbo.has(caminho)) return urlsSemCarimbo.get(caminho);
  return galeria.urls.get(item.foto.caminho_storage) || '';
}

function atualizarPreviasDoLightbox(indice) {
  for (const [id, passo] of [['previa-anterior', -1], ['previa-proxima', 1]]) {
    const botao = document.getElementById(id);
    const i = indice + passo;
    const item = galeria.itens[i];
    const url = item && i < galeria.mostrados ? urlDaPrevia(item) : '';
    botao.hidden = !url;
    const img = botao.querySelector('img');
    if (url && img.getAttribute('src') !== url) img.src = url;
  }
}

function escolherVersaoDaFoto(semCarimbo) {
  if (preferirSemCarimbo === semCarimbo) return;
  preferirSemCarimbo = semCarimbo;
  if (indiceLightbox >= 0) abrirLightbox(indiceLightbox);
}
