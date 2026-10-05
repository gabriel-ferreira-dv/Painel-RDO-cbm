const TAMANHO_PAGINA = 1000;

async function buscarTodasAsLinhas(montarConsulta) {
  const linhas = [];
  while (linhas.length < LIMITE_LINHAS) {
    const de = linhas.length;
    const ate = Math.min(de + TAMANHO_PAGINA, LIMITE_LINHAS) - 1;
    const { data, error } = await montarConsulta().range(de, ate);
    if (error) throw error;
    linhas.push(...(data || []));
    if (!data || data.length < ate - de + 1) break;
  }
  return linhas;
}

async function carregarTudo() {
  const status = document.getElementById('status-atualizacao');
  status.textContent = 'Atualizando…';
  document.getElementById('lista-faltantes').innerHTML = '<div class="carregando">Carregando…</div>';

  const inicioStr = document.getElementById('filtro-inicio').value;
  const fimStr = document.getElementById('filtro-fim').value;
  const inicio = inicioDoDia(inicioStr ? new Date(inicioStr + 'T00:00:00') : new Date());
  const fim = fimDoDia(fimStr ? new Date(fimStr + 'T00:00:00') : new Date());

  const trintaDiasAtras = new Date(); trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

  try {
    const [registros, fotos, ativos] = await Promise.all([
      buscarTodasAsLinhas(() => sb
        .from('registros_app')
        .select('*')
        .gte('criado_em', inicio.toISOString())
        .lte('criado_em', fim.toISOString())
        .order('criado_em', { ascending: false })
        .order('id', { ascending: false })),
      buscarTodasAsLinhas(() => sb
        .from('fotos_app')
        .select('*')
        .gte('criado_em', inicio.toISOString())
        .lte('criado_em', fim.toISOString())
        .order('criado_em', { ascending: false })
        .order('id', { ascending: false })),
      buscarTodasAsLinhas(() => sb
        .from('registros_app')
        .select('usuario_nome, usuario_matricula, criado_em')
        .gte('criado_em', inicioDoDia(trintaDiasAtras).toISOString())
        .order('criado_em', { ascending: false })
        .order('id', { ascending: false })),
    ]);

    padronizarEncarregados([...registros, ...ativos]);

    cacheRegistros = registros.filter(r => r.excluido !== true);
    cacheFotos = fotos.filter(f => f.excluida !== true);
    periodoCarregado = { inicio, fim };

    popularSelectsDeFiltro();
    renderizarFaltantes(ativos);
    aplicarFiltrosLocais();

    status.textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
  } catch (err) {
    status.textContent = '';
    document.getElementById('lista-faltantes').innerHTML = '';
    alert('Falha ao carregar dados: ' + err.message);
    console.error(err);
  }
}

function renderizarFaltantes(ativos) {
  const listaEl = document.getElementById('lista-faltantes');
  const inicioHoje = inicioDoDia(new Date()).toISOString();
  const porPessoa = new Map();
  for (const r of ativos) {
    const existente = porPessoa.get(r.encarregado_chave);
    const apontouHoje = r.criado_em >= inicioHoje;
    if (!existente) {
      porPessoa.set(r.encarregado_chave, { nome: r.encarregado, ultimoRegistro: r.criado_em, apontouHoje });
    } else if (apontouHoje) {
      existente.apontouHoje = true;
    }
  }

  const faltantes = [...porPessoa.values()]
    .filter(p => !p.apontouHoje)
    .sort((a, b) => b.ultimoRegistro.localeCompare(a.ultimoRegistro));

  document.getElementById('kpi-faltantes').textContent = faltantes.length;
  document.getElementById('contagem-faltantes').textContent = `${faltantes.length} de ${porPessoa.size}`;

  if (faltantes.length === 0) {
    listaEl.innerHTML = '<div class="vazio-ok">✓ Todos os encarregados ativos já registraram hoje.</div>';
    return;
  }
  listaEl.innerHTML = '<ul class="lista-faltantes">' + faltantes.map(p => `
    <li>
      <span>${escaparHtml(p.nome)}</span>
      <span class="ult-registro">último: ${formatarDataHora(p.ultimoRegistro)}</span>
    </li>`).join('') + '</ul>';
}
