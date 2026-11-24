/**
 * PDF das escalas (individual, lote com 1 página por colaborador, ou quadro geral).
 * O Excel é gerado no navegador.
 */
function h_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function dataBr_(iso) { return iso ? String(iso).split('-').reverse().join('/') : '—'; }
function dataHoraBr_(s) { const p = String(s || '').split(' '); return dataBr_(p[0]) + (p[1] ? ' ' + p[1] : ''); }
function slug_(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

const CSS_PDF = 'body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#0c1a33;margin:0}' +
  '.pg{page-break-after:always;padding:6px 4px}.pg.ult{page-break-after:auto}' +
  '.top{background:#0b2a6b;color:#fff;padding:10px 12px}.top b{font-size:16px}.top span{float:right;font-size:11px}' +
  'table{border-collapse:collapse;width:100%}' +
  '.inf td{padding:5px 6px;border:1px solid #dbe2ee;font-size:11px}.inf td.k{background:#eef2f9;color:#44526b;font-weight:bold;width:16%}' +
  '.esc th{background:#1446c8;color:#fff;padding:6px;font-size:11px;text-align:center;border:1px solid #1446c8}' +
  '.esc td{padding:7px 6px;border:1px solid #dbe2ee;text-align:center;font-size:12px}' +
  '.esc td.d{text-align:left;font-weight:bold}.esc tr.f td{background:#fdf0d8;color:#9a5800;font-weight:bold}' +
  '.tot{margin-top:8px;font-size:12px}.tot b{font-size:14px}' +
  '.st{display:inline-block;padding:2px 8px;border-radius:8px;font-weight:bold}.OK{background:#e1f3ea;color:#0f7b4a}.ALERTA{background:#fdf0d8;color:#9a5800}.ERRO{background:#fde6e3;color:#b42318}' +
  '.msg{font-size:10px;color:#44526b;margin:2px 0}.leg{font-size:9.5px;color:#44526b;margin-top:10px;border-top:1px solid #dbe2ee;padding-top:6px}' +
  '.ass td{border:0;padding-top:46px;text-align:center;font-size:11px;width:50%}.ass span{display:block;border-top:1px solid #0c1a33;margin:0 18px;padding-top:4px}' +
  '.q th{background:#0b2a6b;color:#fff;font-size:8px;padding:4px 3px;border:1px solid #0b2a6b}.q td{font-size:8px;padding:3px;border:1px solid #dbe2ee;text-align:center}' +
  '.qm th,.qm td{font-size:6.5px;padding:2px 1px;line-height:1.25}.qm td{white-space:nowrap}.qm td.n{font-size:7px;min-width:120px}.q td.n{text-align:left}.q td.f{background:#fdf0d8;color:#9a5800;font-weight:bold}.q tr.g td{background:#e3eafb;color:#0b2a6b;font-weight:bold;text-align:left;font-size:9px}';

function textoDia_(d) {
  const c = calcDia(d);
  return c ? { ent: d.ent, sai: d.sai, int: d.int ? minParaHm(+d.int) : '—', horas: minParaHm(c.liquido) } : null;
}

function fichaPdf_(c, e, cfg, ultima, ctx) {
  const tele = c.teleatendimento === 'S';
  let corpo;
  if (!e) {
    corpo = '<p style="margin:30px 0;font-size:14px;color:#b42318"><b>Escala ainda não cadastrada.</b></p>';
  } else {
    const esc = e;
    const val = validarEscala(esc, { tele: tele, cfg: cfg, entrega: ehEntregaCampo(c) });
    const sem = ctx && ctx.semana ? semanaEfetiva(esc, ctx.semana, ctx.ferias[c.matricula], ctx.feriados[c.revenda], ctx.ajustes[c.matricula]) : null;
    const linhas = DIAS_SEMANA.map(function (nome, i) {
      const sd = sem ? sem[i] : null, rot = (sd ? DIAS_SEMANA[diaSemanaIso(sd.data)] : nome) + (sd ? ' ' + sd.data.split('-').reverse().slice(0, 2).join('/') : '') + (sd && sd.feriado ? '<br><small style="color:#b42318">Feriado: ' + h_(sd.feriado) + '</small>' : '');
      if (sd && sd.tipo === 'FER') return '<tr class="f"><td class="d">' + rot + '</td><td colspan="5" style="background:#ece6fd;color:#6d3fd8">FÉRIAS</td></tr>';
      const d = sd ? (sd.tipo === 'T' ? { tipo: 'T', ent: sd.ent, sai: sd.sai, int: sd.int } : { tipo: 'F' }) : (esc.dias[i] || { tipo: 'F' }), t = d.tipo === 'T' ? textoDia_(d) : null;
      return t ? '<tr><td class="d">' + rot + '</td><td>Trabalho</td><td>' + h_(t.ent) + '</td><td>' + h_(t.sai) + '</td><td>' + t.int + '</td><td><b>' + t.horas + '</b></td></tr>'
        : '<tr class="f"><td class="d">' + rot + '</td><td colspan="5">FOLGA</td></tr>';
    }).join('') + (sem ? avisosSemana(sem).map(function (a) { return '<tr><td colspan="6" style="color:#9a5800;font-size:10px;text-align:left">⚑ ' + h_(a) + '</td></tr>'; }).join('') : '');
    corpo = '<table class="esc" style="margin-top:12px"><tr><th style="text-align:left">Dia</th><th>Situação</th><th>Entrada</th><th>Saída</th><th>Intervalo</th><th>Horas</th></tr>' + linhas + '</table>' +
      '<p class="tot">Total semanal: <b>' + minParaHm(val.total) + '</b> de ' + minParaHm(val.limite) + ' permitidas &nbsp; <span class="st ' + val.status + '">' +
      ({ OK: 'Dentro das regras', ALERTA: 'Com alerta', ERRO: 'Com erro legal' })[val.status] + '</span></p>' +
      val.msgs.filter(function (m) { return m.nivel !== 'info'; }).map(function (m) { return '<p class="msg">• ' + h_(m.texto) + '</p>'; }).join('');
  }
  return '<div class="pg' + (ultima ? ' ult' : '') + '">' +
    '<div class="top"><span>' + (ctx && ctx.semana ? 'Semana de ' + dataBr_(ctx.semana) + ' a ' + dataBr_(isoMaisDias(ctx.semana, 6)) : 'Escala 5x2 · EC 141/2026') + '</span><b>' + h_(cfg.EMPRESA) + ' · Escala de trabalho</b></div>' +
    '<table class="inf" style="margin-top:10px">' +
    '<tr><td class="k">Colaborador</td><td colspan="3"><b>' + h_(c.nome) + '</b></td><td class="k">Matrícula</td><td>' + h_(codigoMatricula(c.matricula)) + '</td></tr>' +
    '<tr><td class="k">Função</td><td>' + h_(c.funcao) + (tele ? ' (teleatendimento)' : '') + '</td><td class="k">Revenda</td><td>' + h_(c.revenda) + '</td><td class="k">Setor</td><td>' + h_(c.setor) + '</td></tr>' +
    '<tr><td class="k">' + (areaSetor(c.setor) === 'arm' ? 'Turno' : 'Sede / ponto') + '</td><td>' + h_(areaSetor(c.setor) === 'arm' ? (c.turno || '—') : (c.lotacao || '—') + (c.tipoMot ? ' · ' + c.tipoMot : '')) + '</td><td class="k">Departamento</td><td>' + h_(c.departamento || '—') + '</td><td class="k">Vigência a partir de</td><td><b>' + dataBr_(e && e.vigencia) + '</b></td></tr>' +
    '</table>' + corpo +
    '<p class="leg">Escala 5x2: 5 dias de trabalho e 2 folgas por semana, com domingo de folga. Jornada conforme a Emenda Constitucional nº 141/2026 e a CLT. ' +
    (e ? 'Última alteração por ' + h_(e.atualizadoPor) + ' em ' + h_(dataHoraBr_(e.atualizadoEm)) + '.' : '') + '</p>' +
    '<table class="ass"><tr><td><span>Colaborador</span></td><td><span>Supervisor</span></td></tr></table>' +
    '<p style="text-align:center;font-size:10px;margin-top:14px">Data: ____/____/________</p></div>';
}

function ordemVisao_(a, b) {
  const va = visaoColaborador(a), vb = visaoColaborador(b);
  return (a.revenda || '').localeCompare(b.revenda || '') || va.ordem.localeCompare(vb.ordem) || va.fordem.localeCompare(vb.fordem) || a.nome.localeCompare(b.nome);
}
function quadroPdf_(cols, esc, cfg, ctx) {
  const grupos = {}, ordem = [];
  cols.forEach(function (c) {
    const v = visaoColaborador(c), k = c.revenda + ' · ' + v.areaNome + (v.area === 'adm' || v.proprio ? '' : ' · ' + v.grupo);
    if (!grupos[k]) { grupos[k] = []; ordem.push(k); }
    grupos[k].push(c);
  });
  let rows = '';
  ordem.forEach(function (g) {
    rows += '<tr class="g"><td colspan="12">' + h_(g) + ' (' + grupos[g].length + ')</td></tr>';
    grupos[g].forEach(function (c) {
      const e = esc[c.matricula], dias = e ? e.dias : [];
      const val = e ? validarEscala({ vigencia: e.vigencia, dias: dias }, { tele: c.teleatendimento === 'S', cfg: cfg, entrega: ehEntregaCampo(c) }) : null;
      rows += '<tr><td class="n"><b>' + h_(c.nome) + '</b><br>' + h_(codigoMatricula(c.matricula)) + '</td><td class="n">' + h_(c.funcao) + '</td><td class="n">' + h_(areaSetor(c.setor) === 'arm' ? (c.turno || '—') : (c.lotacao || '—') + (c.tipoMot ? ' · ' + c.tipoMot : '')) + '</td>' +
        (function () {
          const sem = ctx && ctx.semana ? semanaEfetiva(e || null, ctx.semana, ctx.ferias[c.matricula], ctx.feriados[c.revenda], ctx.ajustes[c.matricula]) : null;
          return DIAS_CURTO.map(function (_, i) {
            if (sem && sem[i].tipo === 'FER') return '<td style="background:#ece6fd;color:#6d3fd8;font-weight:bold">FÉRIAS</td>';
            if (!e || (sem && sem[i].tipo === 'N')) return '<td>—</td>';
            const d = sem ? sem[i] : (dias[i] || { tipo: 'F' }), fer = sem && sem[i].feriado;
            return d.tipo === 'T' ? '<td' + (fer ? ' style="background:#fde6e3"' : '') + '>' + h_(d.ent) + '<br>' + h_(d.sai) + (fer ? '<br><b>feriado</b>' : '') + '</td>' : '<td class="f">FOLGA</td>';
          }).join('');
        })() +
        '<td><b>' + (val ? minParaHm(val.total) : '—') + '</b></td><td>' + (val ? '<span class="st ' + val.status + '">' + val.status + '</span>' : 'SEM') + '</td></tr>';
    });
  });
  return '<div class="pg ult"><div class="top"><span>Gerado em ' + agora_().split(' ')[0].split('-').reverse().join('/') + '</span><b>' + h_(cfg.EMPRESA) + ' · Quadro de escalas 5x2</b></div>' +
    '<table class="q" style="margin-top:8px"><tr><th>Colaborador</th><th>Função</th><th>Turno / sede-ponto</th>' +
    DIAS_CURTO.map(function (d, i) {
      if (!(ctx && ctx.semana)) return '<th>' + d + '</th>';
      d = DIAS_CURTO[diaDoOffset(i)];
      const dt = isoMaisDias(ctx.semana, i), fs = Object.keys(ctx.feriados).filter(function (r) { return ctx.feriados[r].some(function (f) { return f.data === dt; }); });
      return '<th>' + d + '<br>' + dt.split('-').reverse().slice(0, 2).join('/') + (fs.length ? '<br>feriado' : '') + '</th>';
    }).join('') + '<th>Total</th><th>Status</th></tr>' + rows + '</table>' +
    (ctx && ctx.semana ? '<p style="font-size:9px;color:#44526b">Semana de ' + dataBr_(ctx.semana) + ' a ' + dataBr_(isoMaisDias(ctx.semana, 6)) + '. FÉRIAS conforme cadastro; células em vermelho = trabalho em feriado (folga compensatória ou pagamento em dobro).</p>' : '') + '</div>';
}

/** d = {matriculas:[...], modo:'fichas'|'quadro'} → {nome, base64} */
function exportPdf_(u, d) {
  const mats = (d.matriculas || []).map(String);
  if (!mats.length) throw new Error('Nenhum colaborador selecionado.');
  if (mats.length > 500) throw new Error('Gere no máximo 500 colaboradores por arquivo.');
  const cfg = cfg_(), esc = escalasParaUsuario_(u, /^\d{4}-\d{2}-\d{2}$/.test(String(d.semana || '')) ? d.semana : /^\d{4}-\d{2}$/.test(String(d.mes || '')) ? d.mes + '-01' : null);
  const cols = ler_('Colaboradores')
    .filter(function (c) { return mats.indexOf(c.matricula) >= 0 && c.ativo !== 'N' && podeVer_(u, c); })
    .sort(ordemVisao_);
  if (!cols.length) throw new Error('Nenhum colaborador disponível.');
  let ctx = null;
  const temSemana = /^\d{4}-\d{2}-\d{2}$/.test(String(d.semana || '')), temMes = /^\d{4}-\d{2}$/.test(String(d.mes || ''));
  if (temSemana || temMes) {
    ctx = { semana: temSemana ? inicioSemana(d.semana) : '', mes: temMes ? d.mes : '', ferias: {}, feriados: {}, ajustes: {} };
    ler_('Ferias').forEach(function (f) { (ctx.ferias[f.matricula] = ctx.ferias[f.matricula] || []).push(f); });
    ler_('Feriados').forEach(function (f) { (ctx.feriados[f.revenda] = ctx.feriados[f.revenda] || []).push(f); });
    ler_('Ajustes').forEach(function (a) { (ctx.ajustes[a.matricula] = ctx.ajustes[a.matricula] || {})[a.data] = a; });
  }
  const corpo = temMes ? (d.modo === 'quadro' ? quadroMesPdf_(cols, esc, cfg, ctx) : cols.map(function (c, i) { return fichaMesPdf_(c, esc[c.matricula], cfg, i === cols.length - 1, ctx); }).join(''))
    : d.modo === 'quadro' ? quadroPdf_(cols, esc, cfg, ctx)
    : cols.map(function (c, i) { return fichaPdf_(c, esc[c.matricula], cfg, i === cols.length - 1, ctx); }).join('');
  const html = '<html><head><meta charset="utf-8"><style>' + CSS_PDF + '</style></head><body>' + corpo + '</body></html>';
  const pdf = Utilities.newBlob(html, 'text/html', 'escala.html').getAs('application/pdf');
  const hoje = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const nome = temMes ? 'Escala_' + d.mes + '_' + (cols.length === 1 && d.modo !== 'quadro' ? slug_(codigoMatricula(cols[0].matricula)) + '_' + slug_(cols[0].nome) : (d.modo === 'quadro' ? 'Quadro_' : 'Fichas_') + cols.length + '_colab') + '.pdf'
    : cols.length === 1 && d.modo !== 'quadro'
    ? 'Escala_' + slug_(codigoMatricula(cols[0].matricula)) + '_' + slug_(cols[0].nome) + '.pdf'
    : 'Escalas_5x2_' + (d.modo === 'quadro' ? 'Quadro_' : 'Fichas_') + cols.length + '_colab_' + hoje + '.pdf';
  log_(u, cols.length === 1 ? cols[0].matricula : '', 'exportou PDF', (d.modo || 'fichas') + ' · ' + cols.length);
  // fora do Google (Supabase) o PDF é montado no navegador a partir do mesmo HTML
  if (pdf.__html) return { nome: nome, html: pdf.__html };
  return { nome: nome, base64: Utilities.base64Encode(pdf.getBytes()) };
}

/* ---------------- PDF do mês ---------------- */
const MESES_ = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function nomeMes_(ym) { const p = ym.split('-'); return MESES_[+p[1] - 1] + ' de ' + p[0]; }
function diasMesColab_(c, e, ctx) {
  const esc = e || null;
  return diasDoMes(ctx.mes).map(function (dt) { return diaEfetivo(esc, dt, ctx.ferias[c.matricula], ctx.feriados[c.revenda], ctx.ajustes[c.matricula]); });
}
function fichaMesPdf_(c, e, cfg, ultima, ctx) {
  const dias = diasMesColab_(c, e, ctx), cel = {};
  dias.forEach(function (d) { cel[d.data] = d; });
  const ini = inicioSemana(dias[0].data), fim = dias[dias.length - 1].data;
  let linhas = '', total = 0, avisos = [];
  for (let s = ini; s <= fim; s = isoMaisDias(s, 7)) {
    linhas += '<tr>' + [0, 1, 2, 3, 4, 5, 6].map(function (i) {
      const dt = isoMaisDias(s, i), d = cel[dt];
      if (!d) return '<td style="background:#f6f8fc"></td>';
      const dia = '<b>' + (+dt.slice(8)) + '</b>' + (d.feriado ? ' <span style="color:#b42318;font-size:8px">' + h_(d.feriado) + '</span>' : '');
      if (d.tipo === 'FER') return '<td style="background:#ece6fd;color:#6d3fd8">' + dia + '<br>FÉRIAS</td>';
      if (d.tipo === 'N') return '<td>' + dia + '<br>—</td>';
      if (d.tipo === 'F') return '<td style="background:#fdf0d8;color:#9a5800">' + dia + '<br>FOLGA' + (d.ajuste ? ' *' : '') + '</td>';
      const cd = calcDia(d); if (cd) total += cd.liquido;
      if (d.feriado && d.feriadoConta) avisos.push(dt);
      return '<td' + (d.feriado ? ' style="background:#fde6e3"' : '') + '>' + dia + '<br>' + h_(d.ent) + '–' + h_(d.sai) + (d.ajuste ? ' *' : '') + '</td>';
    }).join('') + '</tr>';
  }
  return '<div class="pg' + (ultima ? ' ult' : '') + '">' +
    '<div class="top"><span>' + h_(nomeMes_(ctx.mes)) + '</span><b>' + h_(cfg.EMPRESA) + ' · Escala do mês</b></div>' +
    '<table class="inf" style="margin-top:10px"><tr><td class="k">Colaborador</td><td colspan="3"><b>' + h_(c.nome) + '</b></td><td class="k">Matrícula</td><td>' + h_(codigoMatricula(c.matricula)) + '</td></tr>' +
    '<tr><td class="k">Função</td><td>' + h_(c.funcao) + '</td><td class="k">Revenda</td><td>' + h_(c.revenda) + '</td><td class="k">' + (areaSetor(c.setor) === 'arm' ? 'Turno' : 'Sede / ponto') + '</td><td>' + h_(areaSetor(c.setor) === 'arm' ? (c.turno || '—') : (c.lotacao || '—') + (c.tipoMot ? ' · ' + c.tipoMot : '')) + '</td></tr></table>' +
    '<table class="esc" style="margin-top:10px"><tr>' + ORDEM_SEMANA.map(function (i) { return '<th>' + DIAS_SEMANA[i] + '</th>'; }).join('') + '</tr>' + linhas + '</table>' +
    '<p class="tot">Horas no mês: <b>' + minParaHm(total) + '</b>' + (avisos.length ? ' &nbsp; <span class="st ALERTA">Feriado trabalhado: ' + avisos.map(function (x) { return x.split('-').reverse().slice(0, 2).join('/'); }).join(', ') + '</span>' : '') + '</p>' +
    '<p class="leg">* dia alterado em relação ao padrão semanal. Escala 5x2 conforme a EC nº 141/2026 e a CLT; feriado trabalhado exige folga compensatória na semana ou pagamento em dobro (Lei 605/49).</p>' +
    '<table class="ass"><tr><td><span>Colaborador</span></td><td><span>Supervisor</span></td></tr></table></div>';
}
function quadroMesPdf_(cols, esc, cfg, ctx) {
  const datas = diasDoMes(ctx.mes), ini = DIAS_CURTO.map(function (d) { return d.charAt(0); });
  const ferAll = {}; Object.keys(ctx.feriados).forEach(function (r) { ctx.feriados[r].forEach(function (f) { ferAll[f.data] = true; }); });
  const grupos = {}, ordem = [];
  cols.forEach(function (c) {
    const v = visaoColaborador(c), k = c.revenda + ' · ' + v.areaNome + (v.area === 'adm' || v.proprio ? '' : ' · ' + v.grupo);
    if (!grupos[k]) { grupos[k] = []; ordem.push(k); }
    grupos[k].push(c);
  });
  let rows = '';
  ordem.forEach(function (g) {
    rows += '<tr class="g"><td colspan="' + (datas.length + 2) + '">' + h_(g) + ' (' + grupos[g].length + ')</td></tr>';
    grupos[g].forEach(function (c) {
      const dias = diasMesColab_(c, esc[c.matricula], ctx);
      let tot = 0;
      rows += '<tr><td class="n"><b>' + h_(c.nome) + '</b><br>' + h_(codigoMatricula(c.matricula)) + ' · ' + h_(c.funcao) + '</td>' + dias.map(function (d) {
        if (d.tipo === 'FER') return '<td style="background:#ece6fd;color:#6d3fd8">V</td>';
        if (d.tipo === 'N') return '<td>·</td>';
        if (d.tipo === 'F') return '<td class="f">F</td>';
        const cd = calcDia(d); if (cd) tot += cd.liquido;
        return '<td' + (d.feriado ? ' style="background:#fde6e3"' : '') + '>' + h_(d.ent) + '<br>' + h_(d.sai) + '</td>';
      }).join('') + '<td><b>' + minParaHm(tot) + '</b></td></tr>';
    });
  });
  return '<div class="pg ult"><div class="top"><span>' + h_(nomeMes_(ctx.mes)) + '</span><b>' + h_(cfg.EMPRESA) + ' · Quadro de escalas do mês</b></div>' +
    '<table class="q qm" style="margin-top:8px"><tr><th>Colaborador</th>' + datas.map(function (dt) {
      return '<th' + (ferAll[dt] ? ' style="background:#b42318"' : '') + '>' + (+dt.slice(8)) + '<br>' + ini[diaSemanaIso(dt)] + '</th>';
    }).join('') + '<th>Horas</th></tr>' + rows + '</table>' +
    '<p style="font-size:8px;color:#44526b">Horário = entrada e saída · F = folga · V = férias · vermelho = feriado. Cada colaborador tem a ficha do mês com os horários completos.</p></div>';
}
