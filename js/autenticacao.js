function mostrarErroLogin(msg) {
  const el = document.getElementById('erro-login');
  el.textContent = msg;
  el.style.display = 'block';
}

async function acessoDeGestor(user) {
  const { data, error } = await sb
    .from('gestores_painel')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { nome: data.nome || user.email, trocarSenha: data.trocar_senha === true };
}

async function tentarLogin(email, senha) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;

  const acesso = await acessoDeGestor(data.user);
  if (acesso === null) {
    await sb.auth.signOut();
    throw new Error('SEM_ACESSO');
  }
  return { ...data.user, nomeExibicao: acesso.nome, trocarSenha: acesso.trocarSenha };
}

function entrarNoPainel(user) {
  if (user.trocarSenha) mostrarTrocaSenha(user);
  else mostrarDashboard(user);
}

let usuarioTrocandoSenha = null;

function mostrarTrocaSenha(user) {
  usuarioTrocandoSenha = user;
  document.getElementById('tela-login').style.display = 'none';
  document.getElementById('tela-troca-senha').hidden = false;
  document.getElementById('troca-nome').textContent = user.nomeExibicao || user.email;
  document.getElementById('input-nova-senha').focus();
}

function regrasDaSenha(nova, confirmacao) {
  return {
    tamanho: nova.length >= 8,
    letra: /\p{L}/u.test(nova),
    numero: /\d/.test(nova),
    igual: nova.length > 0 && nova === confirmacao,
  };
}

async function concluirTrocaDeSenha(novaSenha) {
  const { error: erroSenha } = await sb.auth.updateUser({ password: novaSenha });
  if (erroSenha) throw erroSenha;

  const { error: erroMarca } = await sb.rpc('concluir_troca_de_senha');
  if (erroMarca) throw erroMarca;

  const user = { ...usuarioTrocandoSenha, trocarSenha: false };
  usuarioTrocandoSenha = null;
  document.getElementById('tela-troca-senha').hidden = true;
  mostrarDashboard(user);
}

function mensagemErroTroca(err) {
  if (err.code === 'same_password') return 'A nova senha precisa ser diferente da senha provisória.';
  if (err.code === 'weak_password') return 'Senha fraca demais. Use letras e números, com pelo menos 8 caracteres.';
  return 'Não foi possível trocar a senha: ' + err.message;
}

async function sair() {
  await sb.auth.signOut();
  location.reload();
}

async function restaurarSessao() {
  try {
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return;
    const acesso = await acessoDeGestor(user);
    if (acesso === null) {
      await sb.auth.signOut();
      return;
    }
    entrarNoPainel({ ...user, nomeExibicao: acesso.nome, trocarSenha: acesso.trocarSenha });
  } catch (e) {
    console.error('Não foi possível confirmar o acesso:', e);
  } finally {
    document.documentElement.classList.remove('verificando');
  }
}
