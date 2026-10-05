function compararTexto(a, b) {
  return String(a).localeCompare(String(b), 'pt-BR');
}

function descreverRegistroPorTrecho(r) {
  const passo = String(r.servico_notavel_detalhe || '').trim();
  const estaca = r.estaca_inicial ? descreverEstaca(r) : '';
  const via = String(r.via || '').trim();
  return `${passo || r.servico_notavel}`
    + `, KM ${descreverKm(r)}`
    + `${estaca ? `, estaca ${estaca}` : ''}`
    + `${via ? `, via ${via}` : ''}.`;
}

function linhasSemRepetir(registros) {
  return [...new Set(registros.map(descreverRegistroPorTrecho))];
}

function faixaDeEstacas(registros) {
  const valores = registros.flatMap(r => [r.estaca_inicial, r.estaca_final])
    .filter(e => !Number.isNaN(estacaEmNumero(e)))
    .sort((a, b) => estacaEmNumero(a) - estacaEmNumero(b));
  if (valores.length === 0) return '';
  const ini = String(valores[0]).trim();
  const fim = String(valores[valores.length - 1]).trim();
  return ini === fim ? `estaca ${ini}` : `estacas ${ini} a ${fim}`;
}

function resumoPorServico(registros) {
  const porServico = new Map();
  for (const r of registros) {
    if (!porServico.has(r.servico_notavel)) porServico.set(r.servico_notavel, []);
    porServico.get(r.servico_notavel).push(r);
  }
  return [...porServico]
    .sort((a, b) => b[1].length - a[1].length || compararTexto(a[0], b[0]))
    .map(([servico, regs]) => {
      const passos = [...new Set(regs.map(r => String(r.servico_notavel_detalhe || '').trim()).filter(Boolean))];
      const estacas = faixaDeEstacas(regs);
      return [servico + (passos.length ? `: ${passos.join(', ')}` : ''), estacas].filter(Boolean).join(' · ');
    });
}

function faixaDeKmDoTrecho(registros) {
  const kms = registros.flatMap(r => [r.km, r.km_final]).map(k => Number(String(k || '').trim())).filter(k => k > 0);
  if (kms.length === 0) return '';
  const min = Math.min(...kms), max = Math.max(...kms);
  return min === max ? `KM ${min}` : `KM ${min} a ${max}`;
}

function pdfBarraAtividade(texto) {
  return {
    table: {
      widths: ['*'],
      body: [[{ text: texto, color: '#ffffff', bold: true, fontSize: 11.5, fillColor: '#4a4a4a', margin: [8, 4, 8, 4] }]],
    },
    layout: 'noBorders',
  };
}

function pdfBarraServico(texto) {
  return {
    table: {
      widths: ['*'],
      body: [[{ text: texto, bold: true, fontSize: 10.5, color: '#1c2530', fillColor: '#e3e6ea', margin: [8, 3, 8, 3] }]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i) => (i === 0 ? 3 : 0),
      vLineColor: () => '#e8842c',
    },
    margin: [0, 0, 0, 4],
  };
}

async function gerarDefinicaoPorTrecho(logo, incluirFotos, incluirMapa, aoProgredir) {
  const registros = [...recorteAtual.registros].sort((a, b) => a.criado_em.localeCompare(b.criado_em));

  const porTrecho = new Map();
  for (const r of registros) {
    const trecho = r.trecho || '(sem trecho)';
    if (!porTrecho.has(trecho)) porTrecho.set(trecho, new Map());
    const atividades = porTrecho.get(trecho);
    const atividade = r.atividade || '(sem atividade)';
    if (!atividades.has(atividade)) atividades.set(atividade, []);
    atividades.get(atividade).push(r);
  }
  const trechos = [...porTrecho.keys()].sort(compararTexto);

  const fotosPorRegistro = new Map();
  if (incluirFotos) {
    const registroPorChave = new Map(registros.map(r => [`${r.dispositivo_id}|${r.id_local}`, r]));
    for (const f of [...recorteAtual.fotos].sort((a, b) => a.criado_em.localeCompare(b.criado_em))) {
      const chave = `${f.dispositivo_id}|${f.registro_id_local}`;
      const r = registroPorChave.get(chave);
      if (!r) continue;
      const descricao = String(r.descricao || '').trim();
      const legenda = [
        descricao || descreverServico(r),
        r.estaca_inicial ? `Estaca ${descreverEstaca(r)}` : '',
      ].filter(Boolean).join(' - ') + '.';
      if (!fotosPorRegistro.has(chave)) fotosPorRegistro.set(chave, []);
      fotosPorRegistro.get(chave).push({ caminho: f.caminho_storage, criadoEm: f.criado_em, legenda });
    }
    await baixarImagensDasFotos([...fotosPorRegistro.values()].flat(), aoProgredir);
  }

  const mapas = new Map();
  if (incluirMapa) {
    const pedidos = trechos.flatMap(trecho =>
      [...porTrecho.get(trecho).keys()].map(atividade => ({ trecho, atividade })));
    for (const [i, { trecho, atividade }] of pedidos.entries()) {
      if (exportacaoPdf.cancelada) throw new Error('CANCELADO');
      const rotulo = `Mapa ${i + 1} de ${pedidos.length} (${trecho} · ${atividade})`;
      aoProgredir(`${rotulo}…`);
      try {
        const mapa = await montarMapaDasAtividadesPdf(porTrecho.get(trecho).get(atividade), (t, f) =>
          aoProgredir(`${rotulo}: ${t.replace(/^Montando o mapa: /, '')}`, f));
        if (mapa) mapas.set(`${trecho}|${atividade}`, mapa);
      } catch (e) {
        console.warn('Relatório por trecho: mapa não montado', trecho, atividade, e);
      }
    }
  }
  if (exportacaoPdf.cancelada) throw new Error('CANCELADO');

  const inicio = chaveDia(periodoCarregado.inicio);
  const fim = chaveDia(periodoCarregado.fim);
  const periodo = inicio === fim ? dataBr(inicio) : `${dataBr(inicio)} a ${dataBr(fim)}`;
  const usuario = document.getElementById('nome-usuario').textContent || '';
  const filtros = descreverFiltrosAtivos();
  const conteudo = [
    pdfCabecalho(logo, usuario, periodo, 'Relatório por Trecho e Atividade'),
    filtros ? { text: `Filtros aplicados: ${filtros}`, fontSize: 9, color: '#424242', margin: [0, 6, 0, 0] } : null,
    { text: '', margin: [0, 0, 0, 14] },
  ].filter(Boolean);

  if (registros.length === 0) {
    conteudo.push({ text: 'Nenhum registro no período e filtros selecionados.', italics: true, alignment: 'center', margin: [0, 20, 0, 0] });
  }

  let numeroFoto = 0;
  trechos.forEach((trecho, iTrecho) => {
    const atividades = porTrecho.get(trecho);
    const doTrecho = [...atividades.values()].flat();
    const nomesAtividades = [...atividades.keys()].sort((a, b) =>
      atividades.get(b).length - atividades.get(a).length || compararTexto(a, b));
    const faixa = faixaDeKmDoTrecho(doTrecho);

    conteudo.push({
      stack: [
        pdfBarra(`Trecho: ${trecho}`, { centro: true, tamanho: 14 }),
        faixa
          ? { text: faixa, fontSize: 10, alignment: 'center', color: '#424242', margin: [0, 5, 0, 12] }
          : { text: '', margin: [0, 0, 0, 12] },
      ],
      pageBreak: iTrecho > 0 ? 'before' : undefined,
    });

    for (const atividade of nomesAtividades) {
      const regs = atividades.get(atividade);
      conteudo.push({
        stack: [
          pdfBarraAtividade(atividade),
          { ...pdfLista('Resumo da atividade', resumoPorServico(regs), ''), margin: [0, 6, 0, 0] },
        ],
        unbreakable: true,
        margin: [0, 0, 0, 10],
      });

      const mapa = mapas.get(`${trecho}|${atividade}`);
      if (mapa) conteudo.push({ ...pdfMapa(mapa, `Mapa de ${atividade} · ${trecho}`), margin: [0, 0, 0, 14] });

      const porServico = new Map();
      for (const r of regs) {
        if (!porServico.has(r.servico_notavel)) porServico.set(r.servico_notavel, []);
        porServico.get(r.servico_notavel).push(r);
      }
      const servicos = [...porServico.keys()].sort((a, b) =>
        porServico.get(b).length - porServico.get(a).length || compararTexto(a, b));

      for (const servico of servicos) {
        const doServico = porServico.get(servico);
        conteudo.push({
          stack: [
            pdfBarraServico(servico),
            ...linhasSemRepetir(doServico).map(t => ({ text: `-  ${t}`, fontSize: 10, margin: [0, 1, 0, 0] })),
          ],
          margin: [0, 0, 0, 6],
        });

        const fotos = doServico.flatMap(r => fotosPorRegistro.get(`${r.dispositivo_id}|${r.id_local}`) || []);
        for (let i = 0; i < fotos.length; i += 2) {
          const par = fotos.slice(i, i + 2).map(f => pdfFoto(f, ++numeroFoto, { semHora: true }));
          if (par.length === 1) par.push({ width: PDF_LARGURA_FOTO, text: '' });
          conteudo.push({ columns: par, columnGap: PDF_ESPACO_FOTOS, unbreakable: true, margin: [0, 2, 0, 10] });
        }
        conteudo.push({ text: '', margin: [0, 0, 0, 8] });
      }
      conteudo.push({ text: '', margin: [0, 0, 0, 14] });
    }
  });

  return {
    registros: registros.length,
    definicao: {
      pageSize: 'A4',
      pageMargins: [PDF_MARGEM, PDF_MARGEM, PDF_MARGEM, 24],
      info: { title: `Relatório por Trecho e Atividade - ${periodo}`, author: usuario, creator: 'Painel RDO cbm' },
      defaultStyle: { fontSize: 10 },
      footer: (atual, total) => ({ text: `${atual} / ${total}`, alignment: 'right', fontSize: 9, margin: [0, 6, PDF_MARGEM, 0] }),
      content: conteudo,
    },
  };
}
