/**
 * Regras legais da escala 5x2.
 * Este arquivo roda no servidor (Apps Script) E no navegador: as funções abaixo
 * são enviadas para a tela via regrasFonte(), então a validação é a mesma nos dois lados.
 * Mantenha as funções "puras" (sem SpreadsheetApp, sem DOM).
 *
 * Base legal considerada:
 *  - EC 141/2026: 5 dias de trabalho e 2 folgas por semana; 42h semanais a partir de 15/12/2026
 *    (as 2h acima de 8h/dia distribuídas na semana) e 40h semanais / 8h diárias após a transição.
 *  - CLT art. 66: 11h entre duas jornadas.
 *  - CLT art. 67 + Súmula 110 TST: descanso semanal de 24h somado às 11h (35h seguidas).
 *  - CLT art. 71: intervalo de 1h (até 2h) acima de 6h; 15 min entre 4h e 6h.
 *  - CLT art. 73: trabalho entre 22h e 5h é noturno (hora reduzida e adicional — tratado pelo DP).
 *  - NR-17, Anexo II: teleatendimento com até 6h diárias.
 */
var DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
var DIAS_CURTO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function hmParaMin(s) {
  var m = String(s == null ? '' : s).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  var h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

function minParaHm(n) {
  if (n == null || isNaN(n)) return '–';
  n = Math.round(n);
  var neg = n < 0;
  n = Math.abs(n);
  var r = Math.floor(n / 60) + 'h' + (n % 60 ? String(n % 60).padStart(2, '0') : '');
  return (neg ? '-' : '') + r;
}

/** d = {tipo:'T'|'F', ent:'07:00', sai:'16:24', int:60} */
function calcDia(d) {
  if (!d || d.tipo !== 'T') return null;
  var e = hmParaMin(d.ent), s = hmParaMin(d.sai);
  if (e == null || s == null || e === s) return null;
  var bruto = s > e ? s - e : s + 1440 - e;
  var it = Math.max(0, parseInt(d.int, 10) || 0);
  return { inicio: e, bruto: bruto, intervalo: it, liquido: bruto - it };
}

/** Horas de um parâmetro em minutos: aceita "10:24", "10h24" ou "10" / "10,4". */
function minutosCfg(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase(), m = s.match(/^(\d{1,2})\s*[:h]\s*(\d{1,2})?$/);
  if (m) return +m[1] * 60 + (+m[2] || 0);
  var n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? 0 : Math.round(n * 60);
}
/** Motorista ou ajudante de entrega (setor Entrega): podem ter jornada diária maior (parâmetro DIARIO_MAX_ENTREGA). */
function ehEntregaCampo(c) { return !!c && areaSetor(c.setor) === 'ent' && papelEntrega(c.funcao) !== 'adm'; }

/** Data em que a escala 5x2 começa na Revalle: a interna (antecipada) ou, se não houver, a oficial. */
function inicioEscala(cfg) { return String((cfg && (cfg.DATA_INICIO_INTERNO || cfg.DATA_INICIO_5X2)) || ''); }

function parametrosRegra(cfg, vigencia, entrega) {
  var final = !!(vigencia && cfg.DATA_40H && String(vigencia) >= String(cfg.DATA_40H));
  var normal = minutosCfg(final ? cfg.DIARIO_MAX_FINAL : cfg.DIARIO_MAX_TRANSICAO), ent = minutosCfg(cfg.DIARIO_MAX_ENTREGA);
  return {
    semanal: (final ? +cfg.LIMITE_SEMANAL_FINAL : +cfg.LIMITE_SEMANAL_TRANSICAO) * 60,
    diario: entrega && ent > normal ? ent : normal,
    entrega: !!(entrega && ent > normal),
    fase: final ? 'fase de 40h' : 'transição de 42h'
  };
}

/**
 * esc = {vigencia:'2026-12-15', dias:[7 x {tipo, ent, sai, int}]}  (índice 0 = segunda, 6 = domingo)
 * ctx = {tele:boolean, cfg:{...}}
 * Retorna {status:'OK'|'ALERTA'|'ERRO', total, limite, trabalho, folgas, msgs:[{nivel,texto}]}
 */
function validarEscala(esc, ctx) {
  var cfg = ctx.cfg || {}, tele = !!ctx.tele, msgs = [];
  var add = function (n, t) { msgs.push({ nivel: n, texto: t }); };
  esc = esc || {};
  var dias = esc.dias || [];
  var P = parametrosRegra(cfg, esc.vigencia, ctx.entrega);
  var trab = 0, folgas = 0, total = 0, blocos = [], noturno = false;

  if (!esc.vigencia) add('erro', 'Informe a data de início da escala (vigência).');
  else if (inicioEscala(cfg) && String(esc.vigencia) < inicioEscala(cfg))
    add('alerta', 'A vigência começa antes de ' + inicioEscala(cfg).split('-').reverse().join('/') + ', data em que a escala 5x2 começa na Revalle.');
  if (dias.length !== 7) add('erro', 'A escala precisa ter os 7 dias da semana.');

  for (var i = 0; i < 7; i++) {
    var d = dias[i] || { tipo: 'F' }, nome = DIAS_SEMANA[i];
    if (d.tipo !== 'T') { folgas++; continue; }
    trab++;
    var c = calcDia(d);
    if (!c) { add('erro', nome + ': informe entrada e saída válidas (hh:mm).'); continue; }
    if (c.liquido <= 0) { add('erro', nome + ': o intervalo é maior que a jornada.'); continue; }
    total += c.liquido;
    blocos.push({ dia: i, ini: i * 1440 + c.inicio, fim: i * 1440 + c.inicio + c.bruto });
    if (c.liquido > 360 && c.intervalo < 60)
      add('erro', nome + ': jornada acima de 6h exige intervalo de no mínimo 1h (CLT, art. 71).');
    else if (c.liquido > 240 && c.liquido <= 360 && c.intervalo < 15)
      add('erro', nome + ': jornada entre 4h e 6h exige intervalo de 15 min (CLT, art. 71, §1º).');
    if (c.intervalo > 120) add('alerta', nome + ': intervalo acima de 2h só vale com acordo ou convenção coletiva.');
    if (tele) {
      if (c.liquido > (+cfg.TELE_DIARIO || 6) * 60)
        add('erro', nome + ': teleatendimento tem limite de ' + (cfg.TELE_DIARIO || 6) + 'h por dia (NR-17, Anexo II).');
    } else if (c.liquido > P.diario) {
      add('erro', nome + ': ' + minParaHm(c.liquido) + ' passa do máximo diário de ' + minParaHm(P.diario) + (P.entrega ? ' (motorista/ajudante de entrega).' : ' (' + P.fase + ').'));
    }
    if (c.inicio < 300 || c.inicio + c.bruto > 1320) noturno = true;
  }

  if (dias.length === 7 && (trab !== 5 || folgas !== 2))
    add('erro', 'A escala 5x2 precisa de 5 dias de trabalho e 2 folgas. Hoje: ' + trab + ' de trabalho e ' + folgas + ' de folga.');
  if (dias[6] && dias[6].tipo === 'T')
    add('info', 'Trabalha no domingo: o descanso precisa cair num domingo pelo menos 1 vez a cada 3 semanas (Lei 10.101/2000, art. 6º). O DP confere o revezamento.');

  var limite = tele ? Math.min(P.semanal, (+cfg.TELE_SEMANAL || 30) * 60) : P.semanal;
  if (total > limite) add('erro', 'Total semanal de ' + minParaHm(total) + ' passa do limite de ' + minParaHm(limite) + (tele ? ' (teleatendimento).' : ' (' + P.fase + ').'));

  if (blocos.length >= 2) {
    blocos.sort(function (a, b) { return a.ini - b.ini; });
    var maior = 0;
    for (var k = 0; k < blocos.length; k++) {
      var a = blocos[k], prox = blocos[(k + 1) % blocos.length];
      var iniProx = prox.ini + (k + 1 === blocos.length ? 7 * 1440 : 0);
      var gap = iniProx - a.fim;
      if (gap < 0) add('erro', DIAS_SEMANA[a.dia] + ' e ' + DIAS_SEMANA[prox.dia] + ': as jornadas se sobrepõem.');
      else if (gap < 660) add('erro', 'Entre ' + DIAS_SEMANA[a.dia] + ' e ' + DIAS_SEMANA[prox.dia] + ' há só ' + minParaHm(gap) + ' de descanso. O mínimo é 11h (CLT, art. 66).');
      if (gap > maior) maior = gap;
    }
    if (maior < 2100) add('erro', 'Falta um descanso semanal de 35h seguidas (24h + 11h, CLT art. 67 e Súmula 110 do TST).');
  }
  if (noturno) add('info', 'Há trabalho entre 22h e 5h: hora noturna reduzida e adicional noturno são calculados pelo DP.');
  if (tele) add('info', 'Teleatendimento: garantir as pausas da NR-17 (Anexo II) dentro da jornada.');

  var temErro = msgs.some(function (m) { return m.nivel === 'erro'; });
  var temAlerta = msgs.some(function (m) { return m.nivel === 'alerta'; });
  return {
    status: temErro ? 'ERRO' : temAlerta ? 'ALERTA' : 'OK',
    total: total, limite: limite, trabalho: trab, folgas: folgas, msgs: msgs
  };
}

/** Assinatura curta da escala (todos os períodos): muda sempre que o supervisor altera algo. */
function assinaturaEscala(esc) {
  if (!esc) return '';
  var t = (esc.periodos || [esc]).map(function (p) {
    return [p.vigencia, p.ate || '', (p.dias || []).map(function (d) { return d && d.tipo === 'T' ? [d.ent, d.sai, +d.int || 0].join('-') : 'F'; }).join(',')].join('|');
  }).sort().join(';');
  var h = 2166136261;
  for (var i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
}

/** Situação da liberação para o DP: SEM (sem escala), NAO (não liberada), OK (liberada e igual), PEND (alterada depois de liberar). */
function situacaoLiberacao(esc, lib) {
  if (!esc) return 'SEM';
  if (!lib || !lib.assinatura) return 'NAO';
  return assinaturaEscala(esc) === lib.assinatura ? 'OK' : 'PEND';
}

/** Monta uma semana padrão com 2 folgas (0 = segunda ... 6 = domingo). A 1ª folga é o domingo se não for informada. */
function semanaModelo(folga2, ent, sai, int, folga1) {
  var f1 = (folga1 === undefined || folga1 === null || folga1 === '') ? 6 : +folga1;
  var dias = [];
  for (var i = 0; i < 7; i++) {
    dias.push(i === f1 || i === +folga2 ? { tipo: 'F' } : { tipo: 'T', ent: ent, sai: sai, int: +int });
  }
  return dias;
}

/* ---------------- visões ----------------
 * Vêm dos campos preenchidos na tela Cadastro (parâmetros), não do relatório do DP:
 *  Armazém → Turno (Turno 1/2/3…); turno "Administrativo" vai para a lista Administrativo
 *  Entrega → papel pelo cargo: motorista, ajudante ou administrativo (qualquer outro cargo)
 *            motorista "Puxador" vai para Puxadores (da sede ou residente do ponto)
 *            motoristas de rota e ajudantes ficam em Entrega, por Sede / ponto de apoio
 */
var VISOES = [['entrega', 'Entrega'], ['pux', 'Puxadores'], ['arm', 'Armazém'], ['adm', 'Administrativo-Logística']];
var TURNOS_ORDEM = ['T1', 'T1/T2', 'T2', 'T2/T3', 'T3', 'T3/T1'];
function normTxt(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
function turnoTag(t) {
  var x = String(t || '').toUpperCase().replace(/\s+/g, '').replace(/-/g, '/');
  return /^T[123](\/T[123])?$/.test(x) ? x : '';
}
function areaSetor(setor) { var s = normTxt(setor); return s.indexOf('armaz') === 0 ? 'arm' : s.indexOf('entrega') === 0 ? 'ent' : 'outro'; }
/** Papel na entrega pelo cargo: 'mot' (motorista, exceto carreteiro), 'aj' (ajudante de entrega) ou 'adm'. */
function papelEntrega(cargo) {
  var n = normTxt(cargo);
  if (/^motorista/.test(n) && n.indexOf('carreteiro') < 0) return 'mot';
  if (/^(ajudante|auxiliar) de entrega/.test(n)) return 'aj';
  return 'adm';
}
function ehSede(lot) { var n = normTxt(lot); return !n || n === 'sede' || n === 'base'; }
/** O que falta preencher no cadastro do colaborador (lista vazia = completo). */
function pendenciasCadastro(c) {
  var p = [], a = areaSetor(c.setor);
  if (a === 'arm' && !String(c.turno || '').trim()) p.push('turno');
  if (a === 'ent') {
    var pe = papelEntrega(c.funcao);
    if (pe !== 'adm' && !String(c.lotacao || '').trim()) p.push('sede/ponto');
    if (pe === 'mot' && !String(c.tipoMot || '').trim()) p.push('rota/puxador');
  }
  if (!String(c.supervisor || '').trim()) p.push('supervisor');
  return p;
}
/** Departamento próprio (Regras > Departamentos): setor "Departamento · Nome" vira uma aba só dele. */
var PREFIXO_DEPTO = 'Departamento · ';
function deptoProprio(setor) { var s = String(setor || ''); return s.indexOf(PREFIXO_DEPTO) === 0 ? s.slice(PREFIXO_DEPTO.length).trim() || 'Outro' : ''; }
function areaDeptoProprio(nome) { return 'p_' + normTxt(nome).replace(/[^a-z0-9]+/g, ''); }
function visaoColaborador(c) {
  var dp = deptoProprio(c.setor);
  if (dp) { var ff = String(c.funcao || '').trim() || 'Sem função'; return { area: areaDeptoProprio(dp), areaNome: dp, grupo: dp, ordem: '4' + normTxt(dp), funcao: ff, fordem: '3' + normTxt(ff), proprio: true }; }
  var a = areaSetor(c.setor), f = String(c.funcao || '').trim() || 'Sem função', fn = normTxt(f);
  var lot = String(c.lotacao || '').trim(), sede = ehSede(lot);
  var fo = (/^motorista/.test(fn) ? '0' : /^(ajudante|auxiliar)/.test(fn) ? '1' : /^conferente/.test(fn) ? '2' : '3') + fn;
  var adm = { area: 'adm', areaNome: 'Administrativo-Logística', grupo: 'Administrativo-Logística', ordem: '3', funcao: f, fordem: fo };
  if (a === 'arm') {
    var t = String(c.turno || '').trim();
    if (normTxt(t) === 'administrativo') return adm;
    return { area: 'arm', areaNome: 'Armazém', grupo: t || 'Turno não informado', ordem: '2' + (t ? normTxt(t) : '~'), funcao: f, fordem: fo };
  }
  if (a === 'ent') {
    var pe = papelEntrega(f);
    if (pe === 'adm') return adm;
    if (pe === 'mot' && normTxt(c.tipoMot) === 'puxador')
      return { area: 'pux', areaNome: 'Puxadores', grupo: sede ? 'Puxadores da sede' : 'Residentes · ' + lot, ordem: '1' + (sede ? '0' : '1' + normTxt(lot)), funcao: f, fordem: fo };
    var g = !lot ? 'Sede/ponto não informado' : sede ? 'Sede' : lot;
    return { area: 'entrega', areaNome: 'Entrega', grupo: g, ordem: '0' + (!lot ? '9' : sede ? '0' : '1' + normTxt(lot)), funcao: f, fordem: fo };
  }
  return adm;
}

/** A chave interna é EMPRESA-CÓDIGO (as empresas do grupo repetem códigos). Para exibir, só o código. */
/** Chave do departamento (mesma do filtro em cascata): entrega, arm, adm ou p_<departamento próprio>. */
function departamentoChave(c) { var v = visaoColaborador(c); return v.proprio ? v.area : ({ arm: 'arm', ent: 'entrega' })[areaSetor(c.setor)] || 'adm'; }
function codigoMatricula(m) { var s = String(m == null ? '' : m); var i = s.lastIndexOf('-'); return i >= 0 ? s.slice(i + 1) : s; }

/* ---------------- dias reais: padrão + ajustes do dia + férias + feriados ---------------- */
function isoMaisDias(iso, n) {
  var p = String(iso).split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
/** 0 = segunda ... 6 = domingo */
function diaSemanaIso(iso) { var p = String(iso).split('-'); return (new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay() + 6) % 7; }
function segundaDaSemana(iso) { return isoMaisDias(iso, -diaSemanaIso(iso)); }
/** Na Revalle a semana vai de domingo (1º dia) a sábado (7º dia). */
function inicioSemana(iso) { return isoMaisDias(iso, -((diaSemanaIso(iso) + 1) % 7)); }
/** Dia da semana (0 = segunda … 6 = domingo) do i-ésimo dia de uma semana que começa no domingo. */
function diaDoOffset(i) { return (i + 6) % 7; }
/** Ordem de exibição dos dias do padrão semanal: domingo primeiro. */
var ORDEM_SEMANA = [6, 0, 1, 2, 3, 4, 5];
/** Datas ISO de um mês "AAAA-MM". */
function diasDoMes(ym) {
  var p = String(ym).split('-'), n = new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate(), out = [];
  for (var i = 1; i <= n; i++) out.push(p[0] + '-' + p[1] + '-' + String(i).padStart(2, '0'));
  return out;
}
/** Feriado conta no alerta, a não ser que "Conta no alerta" seja Não. */
function feriadoConta(f) { return !/^n/i.test(String(f && f.contaAlerta != null ? f.contaAlerta : 'S').trim()); }
/**
 * Um dia real do colaborador.
 * esc = padrão semanal {vigencia, dias}; ferias = [{inicio, fim}]; feriados = [{data, descricao, contaAlerta}];
 * ajustes = {"AAAA-MM-DD": {tipo:'T'|'F', ent, sai, int}} (troca só daquele dia).
 * tipo: 'T' trabalho, 'F' folga, 'FER' férias, 'N' sem escala vigente.
 */
/** Períodos da escala: [{vigencia, ate, dias}] (ate vazio = sem data final). Aceita o formato antigo {vigencia, dias}. */
function periodosDe(esc) {
  if (!esc) return [];
  if (esc.periodos && esc.periodos.length) return esc.periodos;
  return esc.vigencia ? [{ vigencia: esc.vigencia, ate: esc.ate || '', dias: esc.dias }] : [];
}
/** Período que vale numa data (o de vigência mais recente que cobre a data), ou null. */
function periodoNaData(esc, data) {
  var b = null;
  periodosDe(esc).forEach(function (p) { if (p.vigencia && p.vigencia <= data && (!p.ate || data <= p.ate) && (!b || p.vigencia > b.vigencia)) b = p; });
  return b;
}
/**
 * Encaixa um período novo {vigencia, ate} numa lista: o novo vale inteiro no seu intervalo.
 * Período anterior que invade é cortado na véspera; se ele ia além do fim do novo, continua no dia seguinte.
 */
function aplicarPeriodo(lista, novo) {
  var out = [], nv = novo.vigencia, na = novo.ate || '';
  (lista || []).forEach(function (p) {
    var pv = p.vigencia, pa = p.ate || '';
    if (!((!na || pv <= na) && (!pa || pa >= nv))) { out.push(p); return; }
    if (pv < nv) { var a = {}; for (var k in p) a[k] = p[k]; a.ate = isoMaisDias(nv, -1); out.push(a); }
    if (na && (!pa || pa > na)) { var c = {}; for (var k2 in p) c[k2] = p[k2]; c.vigencia = isoMaisDias(na, 1); c.ate = pa; delete c._row; out.push(c); }
  });
  out.push(novo);
  return out.sort(function (x, y) { return x.vigencia < y.vigencia ? -1 : x.vigencia > y.vigencia ? 1 : 0; });
}
function diaEfetivo(esc, data, ferias, feriados, ajustes) {
  var fer = (feriados || []).filter(function (f) { return f.data === data; })[0];
  var o = { data: data, feriado: fer ? (fer.descricao || 'Feriado') : '', feriadoConta: fer ? feriadoConta(fer) : false, ajuste: false };
  if ((ferias || []).some(function (f) { return f.inicio <= data && data <= f.fim; })) { o.tipo = 'FER'; return o; }
  var aj = ajustes && ajustes[data];
  if (aj) { o.ajuste = true; o.tipo = aj.tipo === 'T' ? 'T' : 'F'; if (o.tipo === 'T') { o.ent = aj.ent; o.sai = aj.sai; o.int = +aj.int || 0; } return o; }
  var per = periodoNaData(esc, data), base = per ? ((per.dias || [])[diaSemanaIso(data)] || { tipo: 'F' }) : null;
  if (!base) {
    o.tipo = 'N';
    var ps = periodosDe(esc), prox = ps.filter(function (p) { return p.vigencia > data; }).sort(function (a, b) { return a.vigencia < b.vigencia ? -1 : 1; })[0];
    if (prox) o.antes = prox.vigencia; else if (ps.length) o.depois = ps.reduce(function (m, p) { return p.ate > m ? p.ate : m; }, '');
    return o;
  }
  o.tipo = base.tipo === 'T' ? 'T' : 'F';
  if (o.tipo === 'T') { o.ent = base.ent; o.sai = base.sai; o.int = +base.int || 0; }
  return o;
}
function semanaEfetiva(esc, segunda, ferias, feriados, ajustes) {
  var out = [];
  for (var i = 0; i < 7; i++) out.push(diaEfetivo(esc, isoMaisDias(segunda, i), ferias, feriados, ajustes));
  return out;
}
/** Avisos da semana real (feriado trabalhado que conta no alerta). */
function avisosSemana(sem) {
  return sem.filter(function (d) { return d.tipo === 'T' && d.feriado && d.feriadoConta; }).map(function (d) {
    return 'Trabalha no feriado de ' + d.data.split('-').reverse().slice(0, 2).join('/') + ' (' + d.feriado + '): garantir folga compensatória na semana ou pagar em dobro (Lei 605/49).';
  });
}
/**
 * Confere uma semana real (já com ajustes) contra as regras. Semanas com férias ou sem escala não são
 * conferidas (retorna null). Feriado trabalhado entra como alerta.
 */
function validarSemanaReal(sem, ctx) {
  if (sem.some(function (d) { return d.tipo === 'FER' || d.tipo === 'N'; })) return null;
  var ord = sem.slice().sort(function (a, b) { return diaSemanaIso(a.data) - diaSemanaIso(b.data); });
  var esc = { vigencia: sem[0].data, dias: ord.map(function (d) { return d.tipo === 'T' ? { tipo: 'T', ent: d.ent, sai: d.sai, int: d.int } : { tipo: 'F' }; }) };
  var v = validarEscala(esc, { tele: ctx.tele, cfg: ctx.cfg, entrega: ctx.entrega });
  v.msgs = v.msgs.filter(function (m) { return m.texto.indexOf('vigência') < 0; })
    .concat(avisosSemana(sem).map(function (t) { return { nivel: 'alerta', texto: t }; }));
  var e = v.msgs.some(function (m) { return m.nivel === 'erro'; }), a = v.msgs.some(function (m) { return m.nivel === 'alerta'; });
  v.status = e ? 'ERRO' : a ? 'ALERTA' : 'OK';
  return v;
}
