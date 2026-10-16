let registroEmEdicao = null;

const CAMPOS_EDITAVEIS = [
  ['trecho', 'ed-trecho'],
  ['via', 'ed-via'],
  ['km', 'ed-km'],
  ['km_final', 'ed-km-final'],
  ['estaca_inicial', 'ed-estaca-inicial'],
  ['estaca_final', 'ed-estaca-final'],
  ['atividade', 'ed-atividade'],
  ['servico_notavel', 'ed-servico'],
  ['servico_notavel_detalhe', 'ed-passo'],
  ['quantidade', 'ed-quantidade'],
  ['unidade', 'ed-unidade'],
  ['descricao', 'ed-descricao'],
];

const NOMES_DOS_CAMPOS = {
  trecho: 'trecho', via: 'via', km: 'KM', km_final: 'KM final',
  estaca_inicial: 'estaca inicial', estaca_final: 'estaca final',
  atividade: 'atividade', servico_notavel: 'serviço', servico_notavel_detalhe: 'passo',
  quantidade: 'medição', unidade: 'unidade', descricao: 'descrição',
};

function preencherSugestoes(id, valores) {
  document.getElementById(id).innerHTML = [...new Set(valores.map(v => String(v || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map(v => `<option value="${escaparHtml(v)}"></option>`).join('');
}

function quantidadeParaTexto(q) {
  return q == null || q === '' ? '' : formatarQuantidade(Number(q));
}

function abrirEdicaoDeRegistro(r) {
  if (!ehAdminPainel || !r) return;
  registroEmEdicao = r;
  for (const [campo, id] of CAMPOS_EDITAVEIS) {
    document.getElementById(id).value = campo === 'quantidade' ? quantidadeParaTexto(r.quantidade) : String(r[campo] ?? '');
  }
  preencherSugestoes('lista-ed-trecho', cacheRegistros.map(x => x.trecho));
  preencherSugestoes('lista-ed-via', cacheRegistros.map(x => x.via));
  preencherSugestoes('lista-ed-atividade', cacheRegistros.map(x => x.atividade));
  preencherSugestoes('lista-ed-servico', cacheRegistros.map(x => x.servico_notavel));
  preencherSugestoes('lista-ed-passo', cacheRegistros.map(x => x.servico_notavel_detalhe));
  preencherSugestoes('lista-ed-unidade', cacheRegistros.map(x => x.unidade).concat(['m³', 'm²', 'm', 'un', 't']));
  const qtdFotos = cacheFotos.filter(f => f.dispositivo_id === r.dispositivo_id && f.registro_id_local === r.id_local).length;
  document.getElementById('info-editar-registro').innerHTML =
    `${escaparHtml(r.encarregado)} · ${formatarDataHora(r.criado_em)}`
    + (qtdFotos ? ` · ${qtdFotos} foto(s)` : '')
    + (r.editado_em ? `<br>Última correção: ${formatarDataHora(r.editado_em)}${r.editado_por_matricula ? ` por ${escaparHtml(r.editado_por_matricula)}` : ''}` : '');
  document.getElementById('erro-editar-registro').hidden = true;
  const botao = document.getElementById('salvar-editar-registro');
  botao.disabled = false;
  botao.textContent = 'Salvar correção';
  document.getElementById('dialogo-editar-registro').showModal();
}

function abrirEdicaoDaFotoAtual() {
  if (indiceLightbox < 0) return;
  abrirEdicaoDeRegistro(galeria.itens[indiceLightbox]?.registro);
}

function lerFormularioDeEdicao() {
  const campos = {};
  for (const [campo, id] of CAMPOS_EDITAVEIS) {
    const bruto = document.getElementById(id).value.trim();
    if (campo === 'quantidade') {
      if (!bruto) { campos.quantidade = null; continue; }
      const n = Number(bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto);
      if (!Number.isFinite(n) || n < 0) throw new Error('Medição inválida. Use só números, por exemplo 120,5.');
      campos.quantidade = n;
    } else {
      campos[campo] = bruto;
    }
  }
  if (!campos.trecho || !campos.km || !campos.atividade || !campos.servico_notavel) {
    throw new Error('Trecho, KM, atividade e serviço são obrigatórios.');
  }
  if (campos.quantidade != null && !campos.unidade) throw new Error('Informe a unidade da medição.');
  return campos;
}

function camposAlterados(r, campos) {
  const alterados = {};
  for (const [campo, valor] of Object.entries(campos)) {
    const atual = campo === 'quantidade'
      ? (r.quantidade == null ? null : Number(r.quantidade))
      : String(r[campo] ?? '').trim();
    if (atual !== valor) alterados[campo] = valor;
  }
  return alterados;
}

async function salvarEdicaoDeRegistro() {
  const r = registroEmEdicao;
  if (!r) return;
  const erroEl = document.getElementById('erro-editar-registro');
  const botao = document.getElementById('salvar-editar-registro');
  erroEl.hidden = true;
  let alterados;
  try {
    alterados = camposAlterados(r, lerFormularioDeEdicao());
  } catch (e) {
    erroEl.textContent = e.message;
    erroEl.hidden = false;
    return;
  }
  if (Object.keys(alterados).length === 0) {
    erroEl.textContent = 'Nada foi alterado.';
    erroEl.hidden = false;
    return;
  }
  botao.disabled = true;
  botao.textContent = 'Salvando…';
  const { data, error } = await sb.from('registros_app')
    .update(alterados)
    .eq('dispositivo_id', r.dispositivo_id)
    .eq('id_local', r.id_local)
    .select('id, editado_em, editado_por_matricula');
  botao.disabled = false;
  botao.textContent = 'Salvar correção';
  if (error || !data || data.length === 0) {
    erroEl.textContent = error
      ? 'Não foi possível salvar: ' + error.message
      : 'Sem permissão para corrigir este registro. Confira se o admin_corrige_registros.sql foi rodado no Supabase.';
    erroEl.hidden = false;
    return;
  }
  Object.assign(r, alterados, {
    editado_em: data[0].editado_em || new Date().toISOString(),
    editado_por_matricula: data[0].editado_por_matricula || r.editado_por_matricula || '',
  });
  registroEmEdicao = null;
  document.getElementById('dialogo-editar-registro').close();
  registrarUso('registro_editado', {
    registro_id: r.id,
    campos: Object.keys(alterados).map(c => NOMES_DOS_CAMPOS[c] || c),
  });
  popularSelectsDeFiltro();
  aplicarFiltrosLocais();
  mostrarAvisoFlutuante('Registro corrigido. O carimbo das fotos será refeito pelo celular de quem as tirou, na próxima sincronização.');
}
