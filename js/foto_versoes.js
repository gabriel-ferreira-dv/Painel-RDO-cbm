let preferirSemCarimbo = false;
const urlsSemCarimbo = new Map();

function caminhoSemCarimbo(foto) {
  return String(foto?.caminho_original_storage || '').trim();
}

async function urlSemCarimbo(foto) {
  const caminho = caminhoSemCarimbo(foto);
  if (!caminho) return '';
  if (urlsSemCarimbo.has(caminho)) return urlsSemCarimbo.get(caminho);
  try {
    const { data } = await sb.storage.from(BUCKET_FOTOS).createSignedUrls([caminho], 3600);
    const url = data?.[0]?.signedUrl || '';
    if (url) urlsSemCarimbo.set(caminho, url);
    return url;
  } catch (e) {
    console.warn('Foto sem carimbo não carregada:', e);
    return '';
  }
}

async function versaoDaFotoParaMostrar(foto) {
  const comCarimbo = galeria.urls.get(foto.caminho_storage) || '';
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
    adiantarImagem(galeria.urls.get(item.foto.caminho_storage));
    if (caminhoSemCarimbo(item.foto)) adiantarImagem(await urlSemCarimbo(item.foto));
  }
}

function escolherVersaoDaFoto(semCarimbo) {
  if (preferirSemCarimbo === semCarimbo) return;
  preferirSemCarimbo = semCarimbo;
  if (indiceLightbox >= 0) abrirLightbox(indiceLightbox);
}
