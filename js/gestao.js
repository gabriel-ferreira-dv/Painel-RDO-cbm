let usuariosGestao = [];
let filiaisGestao = [];
let meuIdGestao = null;
let usuarioEmEdicao = null;
let filialEmEdicao = null;
let acaoConfirmada = null;
let esperaAvisoGestao = null;
let papelGestao = null;

const h = (v) => escaparHtml(v ?? '');

const PERMISSOES_PADRAO_DA_OBRA = { usuarios: true, registros: true, dados: false };
const NOMES_DAS_PERMISSOES = { usuarios: 'usuários', registros: 'registros e fotos', dados: 'serviços, estacas, KM e mapas' };

function modoObra() {
  return papelGestao?.papel === 'obra';
}

function filialDaObra() {
  return modoObra() ? papelGestao.filial : null;
}

function contaProtegida(u) {
  return modoObra() && (u.admin || (u.gestor && !u.filial_painel));
}

const ACOES_DAS_PERMISSOES = {
  usuarios: 'cadastrar e gerenciar os usuários da obra',
  registros: 'corrigir e apagar registros e fotos',
  dados: 'atualizar serviços, estacas, KM e mapas',
};

function juntarComE(itens) {
  return itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

function descreverPerfilDaObra() {
  const obra = `${papelGestao.filial}${papelGestao.filial_nome ? ` · ${papelGestao.filial_nome}` : ''}`;
  const acoes = Object.keys(ACOES_DAS_PERMISSOES)
    .filter(k => papelGestao.permissoes?.[k] === true)
    .map(k => ACOES_DAS_PERMISSOES[k]);
  return acoes.length
    ? `Usuário administrador da obra ${obra}, podendo ${juntarComE(acoes)}.`
    : `Usuário administrador da obra ${obra}.`;
}

function descreverPermissoes(p) {
  const liberadas = Object.keys(NOMES_DAS_PERMISSOES).filter(k => p && p[k] === true).map(k => NOMES_DAS_PERMISSOES[k]);
  return liberadas.length ? liberadas.join(', ') : 'nada liberado';
}

function mostrarTela(id) {
  for (const t of ['tela-negado', 'pagina-admin']) document.getElementById(t).hidden = t !== id;
  document.documentElement.classList.remove('verificando');
}

function avisar(texto) {
  const el = document.getElementById('aviso-flutuante');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(esperaAvisoGestao);
  esperaAvisoGestao = setTimeout(() => { el.hidden = true; }, 5000);
}

function mostrarErro(id, texto) {
  const el = document.getElementById(id);
  el.textContent = texto || '';
  el.hidden = !texto;
}

function textoDoErro(error) {
  const msg = String(error?.message || error || 'erro desconhecido');
  if (/could not find the function/i.test(msg)) {
    return 'As funções de gestão ainda não estão no banco. Rode o arquivo painel_gestao.sql no SQL Editor do Supabase.';
  }
  if (/acesso negado/i.test(msg)) return 'Acesso negado: sua conta não é administradora.';
  return msg;
}

function nomeDaFilial(id) {
  if (!id) return '';
  const f = filiaisGestao.find(x => x.id === id);
  return f ? `${f.id} · ${f.nome}` : id;
}

function urlDoPainel() {
  return location.origin + location.pathname.replace(/[^/]*$/, '');
}

function situacaoDoUsuario(u) {
  if (u.bloqueado) return { texto: 'Bloqueado', classe: 'alerta' };
  if (!u.usa_app && !u.gestor) return { texto: 'Sem acesso', classe: 'alerta' };
  if (u.trocar_senha) return { texto: 'Troca de senha pendente', classe: 'aviso' };
  if (!u.ultimo_login) return { texto: 'Nunca entrou', classe: 'aviso' };
  return { texto: 'Ativo', classe: 'ok' };
}

function chipsDeAcesso(u) {
  const chips = [];
  if (u.usa_app) chips.push(`<span class="chip-acesso chip-app">App · ${u.supervisor ? 'Supervisor' : 'Encarregado'}</span>`);
  if (u.gestor) chips.push(`<span class="chip-acesso chip-painel">Painel · ${u.filial_painel ? h(u.filial_painel) : 'todas'}</span>`);
  if (u.admin) chips.push(`<span class="chip-acesso chip-admin">${u.filial_painel ? `ADM obra · ${h(u.filial_painel)}` : 'ADMapp'}</span>`);
  return chips.join('') || '<span class="tempo-desde">nenhum</span>';
}

function preencherSelectsDeFilial() {
  const opcoes = filiaisGestao.map(f => `<option value="${h(f.id)}">${h(f.id)} · ${h(f.nome)}</option>`).join('');
  const filtro = document.getElementById('filtro-filial-usuario');
  const escolhido = filtro.value;
  filtro.innerHTML = '<option value="">Todas</option>' + opcoes;
  filtro.value = filiaisGestao.some(f => f.id === escolhido) ? escolhido : '';
  document.getElementById('us-filial').innerHTML = opcoes;
  document.getElementById('us-filial-painel').innerHTML =
    (modoObra() ? '' : '<option value="">Todas as filiais</option>')
    + filiaisGestao.map(f => `<option value="${h(f.id)}">Só a filial ${h(f.id)} · ${h(f.nome)}</option>`).join('');
  document.getElementById('fi-copiar').innerHTML = '<option value="">Nenhuma (configuração vazia)</option>' + opcoes;
}

async function carregarFiliais() {
  const alvo = document.getElementById('lista-filiais');
  const { data, error } = await sb.rpc('gestao_listar_filiais');
  if (error) {
    alvo.innerHTML = `<div class="vazio">Falha ao carregar: ${h(textoDoErro(error))}</div>`;
    document.getElementById('contagem-filiais').textContent = '';
    return;
  }
  filiaisGestao = data || [];
  preencherSelectsDeFilial();
  document.getElementById('contagem-filiais').textContent =
    filiaisGestao.length === 1 ? '1 filial' : `${filiaisGestao.length} filiais`;
  alvo.innerHTML = filiaisGestao.map(f => `
    <div class="cartao-filial">
      <div class="cartao-filial-topo">
        <span class="codigo-filial">${h(f.id)}</span>
        ${modoObra() ? '' : `<button type="button" class="botao-editar-registro" data-editar-filial="${h(f.id)}">Editar</button>`}
      </div>
      <b>${h(f.nome)}</b>
      <span class="tempo-desde">${f.pessoas_app} no app · ${f.gestores} gestor(es) só desta filial</span>
      <span class="permissoes-filial">ADM da obra: ${h(descreverPermissoes(f.permissoes_adm || PERMISSOES_PADRAO_DA_OBRA))}</span>
    </div>`).join('') || '<div class="vazio">Nenhuma filial cadastrada.</div>';
}

async function carregarUsuarios() {
  const status = document.getElementById('status-gestao');
  status.textContent = 'Atualizando…';
  const { data, error } = await sb.rpc('gestao_listar_usuarios');
  if (error) {
    status.textContent = '';
    document.getElementById('corpo-usuarios').innerHTML =
      `<tr><td colspan="7" class="vazio">Falha ao carregar: ${h(textoDoErro(error))}</td></tr>`;
    return;
  }
  usuariosGestao = data || [];
  document.getElementById('kpi-contas').textContent = usuariosGestao.length;
  document.getElementById('kpi-app').textContent = usuariosGestao.filter(u => u.usa_app).length;
  document.getElementById('kpi-painel').textContent = usuariosGestao.filter(u => u.gestor).length;
  document.getElementById('kpi-pendentes').textContent =
    usuariosGestao.filter(u => u.bloqueado || (!u.usa_app && !u.gestor)).length;
  renderizarUsuarios();
  status.textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
}

function usuarioPassaNoFiltro(u, termos, filial, acesso) {
  if (termos.length) {
    const texto = semAcento(`${u.nome} ${u.email} ${u.matricula || ''}`).toLowerCase();
    if (!termos.every(t => texto.includes(t))) return false;
  }
  if (filial && u.filial_app !== filial && u.filial_painel !== filial) return false;
  switch (acesso) {
    case 'app': return u.usa_app;
    case 'supervisor': return u.usa_app && u.supervisor;
    case 'painel': return u.gestor;
    case 'admin': return u.admin;
    case 'trocar': return u.trocar_senha;
    case 'bloqueado': return u.bloqueado;
    case 'sem': return !u.usa_app && !u.gestor;
    default: return true;
  }
}

function renderizarUsuarios() {
  const termos = semAcento(document.getElementById('busca-usuario').value).toLowerCase().split(/\s+/).filter(Boolean);
  const filial = document.getElementById('filtro-filial-usuario').value;
  const acesso = document.getElementById('filtro-acesso-usuario').value;
  const lista = usuariosGestao.filter(u => usuarioPassaNoFiltro(u, termos, filial, acesso));
  document.getElementById('contagem-usuarios').textContent =
    lista.length === usuariosGestao.length ? `${lista.length} contas` : `${lista.length} de ${usuariosGestao.length} contas`;
  document.getElementById('corpo-usuarios').innerHTML = lista.map(u => {
    const s = situacaoDoUsuario(u);
    const eu = u.user_id === meuIdGestao;
    const travada = contaProtegida(u);
    const bloqueio = eu ? 'disabled' : travada ? 'disabled title="Só o ADMapp altera esta conta"' : '';
    return `
      <tr>
        <td class="col-gestor"><b>${h(u.nome)}</b>${eu ? ' <span class="tempo-desde">(você)</span>' : ''}<div class="email-gestor">${h(u.email)}</div></td>
        <td data-rotulo="Matrícula">${h(u.matricula || '—')}</td>
        <td data-rotulo="Acessos"><div class="chips-acesso">${chipsDeAcesso(u)}</div></td>
        <td data-rotulo="Filial">${h(nomeDaFilial(u.filial_app) || '—')}</td>
        <td data-rotulo="Último login">${u.ultimo_login ? `${formatarDataHora(u.ultimo_login)}` : '—'}</td>
        <td data-rotulo="Situação"><span class="selo-situacao ${s.classe}">${h(s.texto)}</span></td>
        <td class="col-acoes-usuario">
          <div class="acoes-usuario">
            <button type="button" class="botao-editar-registro" data-acao="editar" data-id="${h(u.user_id)}" ${travada ? 'disabled title="Só o ADMapp altera esta conta"' : ''}>Editar</button>
            <button type="button" class="botao-editar-registro" data-acao="senha" data-id="${h(u.user_id)}" ${eu ? 'disabled title="Use a troca de senha normal"' : bloqueio}>Senha provisória</button>
            <button type="button" class="botao-excluir-registro" data-acao="bloquear" data-id="${h(u.user_id)}" ${bloqueio}>${u.bloqueado ? 'Desbloquear' : 'Bloquear'}</button>
          </div>
        </td>
      </tr>`;
  }).join('') || '<tr><td colspan="7" class="vazio">Nenhuma conta com esses filtros.</td></tr>';
}

function funcaoEscolhida() {
  return document.querySelector('input[name="us-funcao"]:checked')?.value === 'supervisor';
}

function atualizarCamposDeAcesso() {
  const app = document.getElementById('us-app').checked;
  const painel = document.getElementById('us-painel').checked;
  const camposApp = document.getElementById('campos-app');
  const camposPainel = document.getElementById('campos-painel');
  camposApp.classList.toggle('desligado', !app);
  camposPainel.classList.toggle('desligado', !painel);
  camposApp.querySelectorAll('input, select').forEach(el => { el.disabled = !app; });
  camposPainel.querySelectorAll('input, select').forEach(el => { el.disabled = !painel; });
  const admin = document.getElementById('us-admin');
  const filialPainel = document.getElementById('us-filial-painel');
  if (!painel) admin.value = '';
  if (admin.value === 'geral') {
    filialPainel.value = '';
    filialPainel.disabled = true;
  } else if (admin.value === 'obra' && !filialPainel.value) {
    filialPainel.value = document.getElementById('us-filial').value || filiaisGestao[0]?.id || '';
  }
  if (modoObra()) {
    document.getElementById('us-filial').value = filialDaObra();
    document.getElementById('us-filial').disabled = true;
    filialPainel.value = filialDaObra();
    filialPainel.disabled = true;
  }
  document.getElementById('campo-admin').hidden = modoObra();
  const aviso = [];
  if (admin.value === 'obra') aviso.push('O ADM da obra só faz na filial escolhida o que você liberou na configuração da obra (Filiais → Editar).');
  if (admin.value === 'geral') aviso.push('O ADMapp vê todas as filiais e pode tudo, inclusive criar filiais e outros administradores.');
  if (!usuarioEmEdicao) aviso.push('Ao criar, o sistema gera uma senha provisória e mostra para você enviar à pessoa.');
  if (painel) aviso.push('No painel, a pessoa é obrigada a trocar a senha provisória no primeiro acesso.');
  if (usuarioEmEdicao && usuarioEmEdicao.usa_app && !app) aviso.push('Sem o app, a pessoa deixa de ver e enviar registros pelo celular. Os registros dela continuam no banco.');
  document.getElementById('aviso-usuario').textContent = aviso.join(' ');
}

function abrirNovoUsuario() {
  usuarioEmEdicao = null;
  document.getElementById('titulo-dialogo-usuario').textContent = 'Novo usuário';
  document.getElementById('info-dialogo-usuario').textContent = 'Crie a conta e escolha o que a pessoa pode acessar.';
  document.getElementById('form-usuario').reset();
  const email = document.getElementById('us-email');
  email.disabled = false;
  document.getElementById('us-app').checked = true;
  document.getElementById('us-painel').checked = false;
  if (filiaisGestao[0]) document.getElementById('us-filial').value = filialDaObra() || filiaisGestao[0].id;
  document.getElementById('us-filial-painel').value = filialDaObra() || '';
  document.getElementById('us-admin').value = '';
  document.getElementById('salvar-usuario').textContent = 'Criar usuário';
  mostrarErro('erro-usuario', '');
  atualizarCamposDeAcesso();
  document.getElementById('dialogo-usuario').showModal();
  document.getElementById('us-nome').focus();
}

function abrirEdicaoUsuario(u) {
  usuarioEmEdicao = u;
  document.getElementById('titulo-dialogo-usuario').textContent = 'Editar usuário';
  document.getElementById('info-dialogo-usuario').textContent =
    `Conta criada em ${new Date(u.criado_em).toLocaleDateString('pt-BR')}${u.ultimo_login ? ` · último login ${formatarDataHora(u.ultimo_login)}` : ' · nunca entrou'}.`;
  document.getElementById('form-usuario').reset();
  document.getElementById('us-nome').value = u.nome || '';
  const email = document.getElementById('us-email');
  email.value = u.email || '';
  email.disabled = true;
  document.getElementById('us-app').checked = !!u.usa_app;
  document.getElementById('us-matricula').value = u.matricula || '';
  document.getElementById('us-filial').value = u.filial_app || filiaisGestao[0]?.id || '';
  document.querySelector(`input[name="us-funcao"][value="${u.supervisor ? 'supervisor' : 'encarregado'}"]`).checked = true;
  document.getElementById('us-painel').checked = !!u.gestor;
  document.getElementById('us-filial-painel').value = u.filial_painel || '';
  document.getElementById('us-admin').value = u.admin ? (u.filial_painel ? 'obra' : 'geral') : '';
  document.getElementById('salvar-usuario').textContent = 'Salvar';
  mostrarErro('erro-usuario', '');
  atualizarCamposDeAcesso();
  document.getElementById('dialogo-usuario').showModal();
}

function lerFormularioUsuario() {
  const dados = {
    p_nome: limparEspacos(document.getElementById('us-nome').value),
    p_app: document.getElementById('us-app').checked,
    p_matricula: document.getElementById('us-matricula').value.trim(),
    p_supervisor: funcaoEscolhida(),
    p_filial: document.getElementById('us-filial').value || null,
    p_painel: document.getElementById('us-painel').checked,
    p_filial_painel: document.getElementById('us-filial-painel').value || null,
    p_admin: document.getElementById('us-admin').value !== '',
  };
  const nivel = document.getElementById('us-admin').value;
  if (nivel === 'geral') dados.p_filial_painel = null;
  if (modoObra()) {
    dados.p_admin = false;
    dados.p_filial = dados.p_app ? filialDaObra() : null;
    dados.p_filial_painel = dados.p_painel ? filialDaObra() : null;
  }
  if (!dados.p_nome) throw new Error('Informe o nome.');
  if (nivel === 'obra' && !dados.p_filial_painel) {
    throw new Error('Para ADM da obra, escolha em "Dados que vê no painel" a filial que ele vai administrar.');
  }
  if (!dados.p_app && !dados.p_painel) throw new Error('Marque pelo menos um acesso: app ou painel.');
  if (dados.p_app && !dados.p_matricula) throw new Error('Informe a matrícula de quem usa o app.');
  if (dados.p_app && !dados.p_filial) throw new Error('Escolha a filial de quem usa o app.');
  if (!usuarioEmEdicao) {
    const email = document.getElementById('us-email').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.');
    dados.p_email = email;
  }
  return dados;
}

function descreverAcessos(d) {
  return [
    d.p_app ? `app (${d.p_supervisor ? 'supervisor' : 'encarregado'}, filial ${d.p_filial}, matrícula ${d.p_matricula})` : '',
    d.p_painel ? `painel (${d.p_filial_painel ? 'filial ' + d.p_filial_painel : 'todas as filiais'})` : '',
    d.p_admin ? (d.p_filial_painel ? `ADM da obra ${d.p_filial_painel}` : 'ADMapp') : '',
  ].filter(Boolean).join(' · ');
}

async function salvarUsuario() {
  const botao = document.getElementById('salvar-usuario');
  mostrarErro('erro-usuario', '');
  let dados;
  try {
    dados = lerFormularioUsuario();
  } catch (e) {
    mostrarErro('erro-usuario', e.message);
    return;
  }
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Salvando…';
  try {
    if (usuarioEmEdicao) {
      const { error } = await sb.rpc('gestao_salvar_usuario', { p_user: usuarioEmEdicao.user_id, ...dados });
      if (error) throw error;
      registrarUso('usuario_alterado', { email: usuarioEmEdicao.email, acessos: descreverAcessos(dados) });
      document.getElementById('dialogo-usuario').close();
      avisar(`Acessos de ${dados.p_nome} salvos.`);
    } else {
      const { data: senha, error } = await sb.rpc('gestao_criar_usuario', dados);
      if (error) throw error;
      registrarUso('usuario_criado', { email: dados.p_email, acessos: descreverAcessos(dados) });
      document.getElementById('dialogo-usuario').close();
      mostrarSenha({ nome: dados.p_nome, email: dados.p_email, usa_app: dados.p_app, gestor: dados.p_painel }, senha, true);
    }
    await carregarUsuarios();
  } catch (e) {
    mostrarErro('erro-usuario', textoDoErro(e));
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}

function mensagemDaSenha(u, senha, nova) {
  const primeiro = limparEspacos(u.nome).split(' ')[0] || '';
  const linhas = [
    `Olá, ${capitalizarNome(primeiro)}!`,
    '',
    nova ? 'Seu acesso foi criado.' : 'Sua senha foi redefinida.',
  ];
  if (u.gestor) linhas.push(`Painel de Gestão RDO cbm: ${urlDoPainel()}`);
  if (u.usa_app) linhas.push('App RDO cbm: entre no aplicativo com o e-mail e a senha abaixo.');
  linhas.push(`E-mail: ${u.email}`, `Senha provisória: ${senha}`, '');
  if (u.gestor) linhas.push('No primeiro acesso ao painel, você vai criar uma senha nova.');
  linhas.push('Dúvidas: gabriel.ferreira@cbmsa.com.br');
  return linhas.join('\n');
}

function mostrarSenha(u, senha, nova) {
  document.getElementById('titulo-dialogo-senha').textContent = nova ? 'Usuário criado' : 'Senha provisória gerada';
  document.getElementById('info-dialogo-senha').textContent =
    `${nova ? 'Conta criada para' : 'Nova senha de'} ${u.nome} (${u.email}). Envie a senha para a pessoa.`;
  document.getElementById('senha-gerada').textContent = senha;
  document.getElementById('mensagem-senha').value = mensagemDaSenha(u, senha, nova);
  document.getElementById('dialogo-senha').showModal();
}

async function copiarTexto(texto, rotulo) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  avisar(`${rotulo} copiada.`);
}

function confirmar({ titulo, texto, botao, perigo, acao }) {
  acaoConfirmada = acao;
  document.getElementById('titulo-confirmar').textContent = titulo;
  document.getElementById('texto-confirmar').textContent = texto;
  const ok = document.getElementById('ok-confirmar');
  ok.textContent = botao;
  ok.classList.toggle('perigo', !!perigo);
  ok.disabled = false;
  mostrarErro('erro-confirmar', '');
  document.getElementById('dialogo-confirmar').showModal();
}

async function executarConfirmacao() {
  if (!acaoConfirmada) return;
  const ok = document.getElementById('ok-confirmar');
  const texto = ok.textContent;
  ok.disabled = true;
  ok.textContent = 'Aguarde…';
  try {
    await acaoConfirmada();
    document.getElementById('dialogo-confirmar').close();
  } catch (e) {
    mostrarErro('erro-confirmar', textoDoErro(e));
  } finally {
    ok.disabled = false;
    ok.textContent = texto;
  }
}

function pedirSenhaProvisoria(u) {
  const detalhes = [
    'A senha atual deixa de funcionar e a pessoa sai de todos os aparelhos.',
    u.gestor ? 'No painel, ela vai ter que criar uma senha nova no próximo acesso.' : '',
    u.usa_app ? 'No app, ela entra com a provisória (o app ainda não pede para trocar).' : '',
  ].filter(Boolean).join(' ');
  confirmar({
    titulo: `Gerar senha provisória para ${u.nome}?`,
    texto: detalhes,
    botao: 'Gerar senha',
    acao: async () => {
      const { data: senha, error } = await sb.rpc('gestao_senha_provisoria', { p_user: u.user_id });
      if (error) throw error;
      registrarUso('senha_provisoria', { email: u.email });
      document.getElementById('dialogo-confirmar').close();
      mostrarSenha(u, senha, false);
      carregarUsuarios();
    },
  });
}

function pedirBloqueio(u) {
  const bloquear = !u.bloqueado;
  confirmar({
    titulo: `${bloquear ? 'Bloquear' : 'Desbloquear'} ${u.nome}?`,
    texto: bloquear
      ? 'A pessoa não consegue mais entrar no app nem no painel, e sai dos aparelhos onde estava logada. Os registros e as fotos dela continuam.'
      : 'A pessoa volta a conseguir entrar com a senha que já tinha.',
    botao: bloquear ? 'Bloquear' : 'Desbloquear',
    perigo: bloquear,
    acao: async () => {
      const { error } = await sb.rpc('gestao_bloquear_usuario', { p_user: u.user_id, p_bloquear: bloquear });
      if (error) throw error;
      registrarUso(bloquear ? 'usuario_bloqueado' : 'usuario_desbloqueado', { email: u.email });
      avisar(`${u.nome} ${bloquear ? 'bloqueado' : 'desbloqueado'}.`);
      await carregarUsuarios();
    },
  });
}

function marcarPermissoesDaFilial(p) {
  for (const chave of Object.keys(NOMES_DAS_PERMISSOES)) {
    document.getElementById(`fi-perm-${chave}`).checked = p?.[chave] === true;
  }
}

function lerPermissoesDaFilial() {
  return Object.fromEntries(Object.keys(NOMES_DAS_PERMISSOES)
    .map(chave => [chave, document.getElementById(`fi-perm-${chave}`).checked]));
}

function configDaFilial(id) {
  return filiaisGestao.find(f => f.id === id)?.config || {};
}

function usaKm(config) {
  return config?.usa_km !== false;
}

function configComKm(config, marcado) {
  return usaKm(config) === marcado ? null : { ...config, usa_km: marcado };
}

function lerConfigDoTexto() {
  try {
    const config = JSON.parse(document.getElementById('fi-config').value.trim() || '{}');
    return config && typeof config === 'object' && !Array.isArray(config) ? config : null;
  } catch {
    return null;
  }
}

function aoMudarUsaKm() {
  if (!filialEmEdicao) return;
  const config = lerConfigDoTexto();
  if (!config) return;
  config.usa_km = document.getElementById('fi-usa-km').checked;
  document.getElementById('fi-config').value = JSON.stringify(config, null, 2);
}

function aoEditarConfig() {
  const config = lerConfigDoTexto();
  if (config) document.getElementById('fi-usa-km').checked = usaKm(config);
}

function abrirNovaFilial() {
  filialEmEdicao = null;
  document.getElementById('titulo-dialogo-filial').textContent = 'Nova filial';
  document.getElementById('form-filial').reset();
  document.getElementById('fi-id').disabled = false;
  document.getElementById('campo-copiar-config').hidden = false;
  document.getElementById('fi-copiar').value = filiaisGestao[0]?.id || '';
  document.getElementById('fi-usa-km').checked = usaKm(configDaFilial(document.getElementById('fi-copiar').value));
  document.getElementById('detalhes-config-filial').hidden = true;
  marcarPermissoesDaFilial(PERMISSOES_PADRAO_DA_OBRA);
  mostrarErro('erro-filial', '');
  document.getElementById('dialogo-filial').showModal();
  document.getElementById('fi-id').focus();
}

function abrirEdicaoFilial(f) {
  filialEmEdicao = f;
  document.getElementById('titulo-dialogo-filial').textContent = `Editar filial ${f.id}`;
  document.getElementById('fi-id').value = f.id;
  document.getElementById('fi-id').disabled = true;
  document.getElementById('fi-nome').value = f.nome;
  document.getElementById('campo-copiar-config').hidden = true;
  const detalhes = document.getElementById('detalhes-config-filial');
  detalhes.hidden = false;
  detalhes.open = false;
  document.getElementById('fi-config').value = JSON.stringify(f.config || {}, null, 2);
  document.getElementById('fi-usa-km').checked = usaKm(f.config);
  marcarPermissoesDaFilial(f.permissoes_adm || PERMISSOES_PADRAO_DA_OBRA);
  mostrarErro('erro-filial', '');
  document.getElementById('dialogo-filial').showModal();
}

async function salvarFilial() {
  const botao = document.getElementById('salvar-filial');
  mostrarErro('erro-filial', '');
  const id = document.getElementById('fi-id').value.trim();
  const nome = limparEspacos(document.getElementById('fi-nome').value);
  if (!id || !nome) {
    mostrarErro('erro-filial', 'Informe o código e o nome da filial.');
    return;
  }
  if (!filialEmEdicao && filiaisGestao.some(f => f.id === id)) {
    mostrarErro('erro-filial', `Já existe a filial ${id}. Use Editar nela.`);
    return;
  }
  let config = null;
  if (filialEmEdicao) {
    const texto = document.getElementById('fi-config').value.trim();
    if (texto !== JSON.stringify(filialEmEdicao.config || {}, null, 2)) {
      try {
        config = JSON.parse(texto || '{}');
      } catch (e) {
        mostrarErro('erro-filial', `A configuração não é um JSON válido: ${e.message}`);
        return;
      }
      if (!config || typeof config !== 'object' || Array.isArray(config)) {
        mostrarErro('erro-filial', 'A configuração precisa ser um objeto JSON ({ ... }).');
        return;
      }
    }
  }
  const marcadoKm = document.getElementById('fi-usa-km').checked;
  const baseKm = config || (filialEmEdicao
    ? (filialEmEdicao.config || {})
    : configDaFilial(document.getElementById('fi-copiar').value));
  const ajustadaKm = configComKm(baseKm, marcadoKm);
  if (ajustadaKm) config = ajustadaKm;
  botao.disabled = true;
  try {
    const { error } = await sb.rpc('gestao_salvar_filial', {
      p_id: id,
      p_nome: nome,
      p_config: config,
      p_copiar_de: filialEmEdicao ? null : (document.getElementById('fi-copiar').value || null),
      p_permissoes: lerPermissoesDaFilial(),
    });
    if (error) throw error;
    registrarUso('filial_salva', {
      filial: id, nova: !filialEmEdicao, config: !!config,
      permissoes: descreverPermissoes(lerPermissoesDaFilial()),
    });
    document.getElementById('dialogo-filial').close();
    avisar(`Filial ${id} salva.`);
    await carregarFiliais();
    renderizarUsuarios();
  } catch (e) {
    mostrarErro('erro-filial', textoDoErro(e));
  } finally {
    botao.disabled = false;
  }
}

function usuarioPorId(id) {
  return usuariosGestao.find(u => u.user_id === id);
}

async function iniciarPaginaGestao() {
  aplicarTema(temaInicial());
  if (temSessaoGuardada()) {
    adiantarLinksDoPapel();
    mostrarTela('pagina-admin');
  }
  try {
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      location.replace('index.html');
      return;
    }
    meuIdGestao = data.session.user.id;
    papelGestao = await lerPapelAdmin();
    if (!papelGestao) {
      mostrarTela('tela-negado');
      return;
    }
    if (modoObra() && papelGestao.permissoes?.usuarios !== true) {
      document.getElementById('texto-negado').textContent =
        `O ADMapp não liberou a gestão de usuários para a obra ${papelGestao.filial}. Fale com o gestor geral.`;
      mostrarTela('tela-negado');
      return;
    }
  } catch (e) {
    document.getElementById('texto-negado').textContent = 'Não foi possível confirmar o acesso: ' + e.message;
    mostrarTela('tela-negado');
    return;
  }
  prepararTelaDoPapel();
  mostrarTela('pagina-admin');
  await carregarFiliais();
  await carregarUsuarios();
}

function prepararTelaDoPapel() {
  const obra = modoObra();
  document.getElementById('titulo-gestao').textContent =
    obra ? `Gestão da obra ${papelGestao.filial}` : 'Gestão · ADMapp';
  document.title = `${obra ? `Gestão da obra ${papelGestao.filial}` : 'Gestão · ADMapp'} · Painel RDO cbm`;
  const aviso = document.getElementById('aviso-papel');
  aviso.hidden = false;
  aviso.textContent = obra
    ? descreverPerfilDaObra()
    : 'Usuário administrador geral (ADMapp), com acesso a todas as obras, podendo criar e configurar obras e definir as permissões de cada administrador de obra.';
  document.getElementById('campo-filtro-filial').hidden = obra;
  document.getElementById('link-dados').hidden = papelGestao.permissoes?.dados !== true;
  document.getElementById('botao-nova-filial').hidden = obra;
  document.getElementById('explicacao-filiais').textContent = obra
    ? 'A configuração da obra e as permissões do ADM da obra são definidas pelo ADMapp.'
    : 'Cada pessoa do app pertence a uma filial e só vê e grava dados dela. Gestor do painel sem filial vê todas. Em cada obra, você decide o que o ADM da obra pode fazer.';
  const opcaoAdmin = document.querySelector('#filtro-acesso-usuario option[value="admin"]');
  if (opcaoAdmin) opcaoAdmin.hidden = obra;
}

document.getElementById('busca-usuario').addEventListener('input', renderizarUsuarios);
document.getElementById('filtro-filial-usuario').addEventListener('change', renderizarUsuarios);
document.getElementById('filtro-acesso-usuario').addEventListener('change', renderizarUsuarios);
document.getElementById('botao-novo-usuario').addEventListener('click', abrirNovoUsuario);
document.getElementById('corpo-usuarios').addEventListener('click', (e) => {
  const botao = e.target.closest('button[data-acao]');
  if (!botao || botao.disabled) return;
  const u = usuarioPorId(botao.dataset.id);
  if (!u) return;
  if (botao.dataset.acao === 'editar') abrirEdicaoUsuario(u);
  else if (botao.dataset.acao === 'senha') pedirSenhaProvisoria(u);
  else if (botao.dataset.acao === 'bloquear') pedirBloqueio(u);
});
document.getElementById('us-app').addEventListener('change', atualizarCamposDeAcesso);
document.getElementById('us-painel').addEventListener('change', atualizarCamposDeAcesso);
document.getElementById('us-admin').addEventListener('change', atualizarCamposDeAcesso);
document.getElementById('salvar-usuario').addEventListener('click', salvarUsuario);
document.getElementById('form-usuario').addEventListener('submit', (e) => { e.preventDefault(); salvarUsuario(); });
document.getElementById('cancelar-usuario').addEventListener('click', () => document.getElementById('dialogo-usuario').close());
document.getElementById('copiar-senha').addEventListener('click', () =>
  copiarTexto(document.getElementById('senha-gerada').textContent, 'Senha'));
document.getElementById('copiar-mensagem').addEventListener('click', () =>
  copiarTexto(document.getElementById('mensagem-senha').value, 'Mensagem'));
document.getElementById('fechar-senha').addEventListener('click', () => document.getElementById('dialogo-senha').close());
document.getElementById('ok-confirmar').addEventListener('click', executarConfirmacao);
document.getElementById('cancelar-confirmar').addEventListener('click', () => document.getElementById('dialogo-confirmar').close());
document.getElementById('botao-nova-filial').addEventListener('click', abrirNovaFilial);
document.getElementById('lista-filiais').addEventListener('click', (e) => {
  const botao = e.target.closest('button[data-editar-filial]');
  if (!botao) return;
  const f = filiaisGestao.find(x => x.id === botao.dataset.editarFilial);
  if (f) abrirEdicaoFilial(f);
});
document.getElementById('salvar-filial').addEventListener('click', salvarFilial);
document.getElementById('form-filial').addEventListener('submit', (e) => { e.preventDefault(); salvarFilial(); });
document.getElementById('cancelar-filial').addEventListener('click', () => document.getElementById('dialogo-filial').close());
document.getElementById('fi-usa-km').addEventListener('change', aoMudarUsaKm);
document.getElementById('fi-config').addEventListener('input', aoEditarConfig);
document.getElementById('fi-copiar').addEventListener('change', (e) => {
  document.getElementById('fi-usa-km').checked = usaKm(configDaFilial(e.target.value));
});
document.getElementById('botao-tema').addEventListener('click', alternarTema);
document.getElementById('botao-sair').addEventListener('click', async () => {
  try { sessionStorage.removeItem('uso-acesso'); sessionStorage.removeItem('papel-admin'); } catch {}
  await sb.auth.signOut();
  location.replace('index.html');
});

iniciarPaginaGestao();
