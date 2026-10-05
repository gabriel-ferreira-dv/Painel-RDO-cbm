function descreverDispositivo() {
  const ua = navigator.userAgent;
  const tipo = /Mobi|Android|iPhone|iPad/i.test(ua) || window.matchMedia('(pointer: coarse)').matches
    ? 'celular' : 'computador';
  const navegador = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'outro';
  return `${tipo} · ${navegador}`;
}

const DISPOSITIVO_DO_USO = descreverDispositivo();

async function registrarUso(evento, detalhes = {}) {
  try {
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return;
    const { error } = await sb.from('uso_painel').insert({
      user_id: user.id, evento, detalhes, dispositivo: DISPOSITIVO_DO_USO,
    });
    if (error) console.warn('Registro de uso não gravado:', error.message);
  } catch (e) {
    console.warn('Registro de uso não gravado:', e);
  }
}

function registrarUsoComLimite(evento, detalhes, ms = 1500) {
  return Promise.race([registrarUso(evento, detalhes), new Promise(r => setTimeout(r, ms))]);
}

function registrarAcesso(tipo) {
  try {
    if (tipo === 'sessao' && sessionStorage.getItem('uso-acesso')) return;
    sessionStorage.setItem('uso-acesso', '1');
  } catch {}
  registrarUso('acesso', { tipo });
}

let ehAdminPainel = false;

async function mostrarLinkAdmin() {
  try {
    const { data, error } = await sb.rpc('sou_admin_painel');
    ehAdminPainel = !error && data === true;
  } catch {
    ehAdminPainel = false;
  }
  document.getElementById('link-admin').hidden = !ehAdminPainel;
  document.getElementById('lightbox-excluir').hidden = !ehAdminPainel;
  document.body.classList.toggle('modo-admin', ehAdminPainel);
}

function periodoDosCampos() {
  return {
    de: document.getElementById('filtro-inicio').value,
    ate: document.getElementById('filtro-fim').value,
  };
}

let esperaFiltrosUso = null;
let ultimosFiltrosUso = '';

function agendarRegistroDeFiltros() {
  clearTimeout(esperaFiltrosUso);
  esperaFiltrosUso = setTimeout(() => {
    const filtros = descreverFiltrosAtivos();
    if (filtros === ultimosFiltrosUso) return;
    ultimosFiltrosUso = filtros;
    registrarUso('filtros', { filtros });
  }, 4000);
}
