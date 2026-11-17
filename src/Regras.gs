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

function parametrosRegra(cfg, vigencia) {
  var final = !!(vigencia && cfg.DATA_40H && String(vigencia) >= String(cfg.DATA_40H));
  return {
    semanal: (final ? +cfg.LIMITE_SEMANAL_FINAL : +cfg.LIMITE_SEMANAL_TRANSICAO) * 60,
    diario: (final ? +cfg.DIARIO_MAX_FINAL : +cfg.DIARIO_MAX_TRANSICAO) * 60,
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
  var P = parametrosRegra(cfg, esc.vigencia);
  var trab = 0, folgas = 0, total = 0, blocos = [], noturno = false;

  if (!esc.vigencia) add('erro', 'Informe a data de início da escala (vigência).');
  else if (cfg.DATA_INICIO_5X2 && String(esc.vigencia) < String(cfg.DATA_INICIO_5X2))
    add('alerta', 'A vigência começa antes de ' + String(cfg.DATA_INICIO_5X2).split('-').reverse().join('/') + ', data em que a nova jornada passa a valer.');
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
      add('erro', nome + ': ' + minParaHm(c.liquido) + ' passa do máximo diário de ' + minParaHm(P.diario) + ' (' + P.fase + ').');
    }
    if (c.inicio < 300 || c.inicio + c.bruto > 1320) noturno = true;
  }

  if (dias.length === 7 && (trab !== 5 || folgas !== 2))
    add('erro', 'A escala 5x2 precisa de 5 dias de trabalho e 2 folgas. Hoje: ' + trab + ' de trabalho e ' + folgas + ' de folga.');
  if (String(cfg.DOMINGO_FOLGA || 'S').toUpperCase() === 'S' && dias[6] && dias[6].tipo === 'T')
    add('erro', 'Domingo é folga fixa (regra da empresa).');

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

/** Monta uma semana padrão: folga no domingo + 1 dia escolhido (0 = segunda ... 5 = sábado). */
function semanaModelo(folga2, ent, sai, int) {
  var dias = [];
  for (var i = 0; i < 7; i++) {
    dias.push(i === 6 || i === +folga2 ? { tipo: 'F' } : { tipo: 'T', ent: ent, sai: sai, int: +int });
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
var VISOES = [['entrega', 'Entrega'], ['pux', 'Puxadores'], ['arm', 'Armazém'], ['adm', 'Administrativo']];
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
function visaoColaborador(c) {
  var a = areaSetor(c.setor), f = String(c.funcao || '').trim() || 'Sem função', fn = normTxt(f);
  var lot = String(c.lotacao || '').trim(), sede = ehSede(lot);
  var fo = (/^motorista/.test(fn) ? '0' : /^(ajudante|auxiliar)/.test(fn) ? '1' : /^conferente/.test(fn) ? '2' : '3') + fn;
  var adm = { area: 'adm', areaNome: 'Administrativo', grupo: 'Administrativo', ordem: '3', funcao: f, fordem: fo };
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
function codigoMatricula(m) { var s = String(m == null ? '' : m); var i = s.lastIndexOf('-'); return i >= 0 ? s.slice(i + 1) : s; }
