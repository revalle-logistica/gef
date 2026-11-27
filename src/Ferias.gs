/**
 * Gestão de Férias: programação das férias por período aquisitivo, dentro da Gestão.
 *
 * Cada linha da aba FeriasPeriodos é um período aquisitivo de um empregado (chave: sigla-código-início aquisitivo).
 * Os períodos de TODOS os empregados ficam guardados; a tela só mostra os de quem está ativo na Gestão
 * (departamento ativado em Regras > Departamentos). Ao ativar um departamento, os períodos já aparecem.
 *
 * Plano e sugestão: JSON [{ini:'AAAA-MM-DD', dias:N}, ...] (até 2 períodos de gozo).
 * Férias confirmadas viram linhas na aba Ferias (id "PF|<período>|<n>") e entram nas escalas.
 */
const ORIGEM_PF = 'Programação de férias';

function pfLista_() { return ler_('FeriasPeriodos'); }
function pfChaveCol_(rev, cod) { return rev + '|' + String(cod).replace(/^0+/, ''); }
/** Colaboradores ativos da Gestão por revenda|código. */
function pfColsMapa_() {
  const m = {};
  ler_('Colaboradores').forEach(function (c) { if (c.ativo !== 'N') m[pfChaveCol_(c.revenda, codigoMatricula(c.matricula))] = c; });
  return m;
}
function pfPlano_(p) { const pl = parse_(p.plano, null); return pl === null || p.plano === '' ? parse_(p.sugestao, []) : pl; }
function pfVolume_() { return parse_(cfg_().VOLUME_FERIAS, {}); }

/** Dados da tela de férias: só os períodos de colaboradores que o usuário vê. */
function feriasDados_(u) {
  const cols = pfColsMapa_(), out = [], aguardando = {};
  pfLista_().forEach(function (p) {
    const c = cols[pfChaveCol_(p.revenda, p.codigo)];
    if (!c) { if (veTudo_(u) && p.origem !== 'gozado') { const k = p.revenda + ' · ' + (p.setorF || p.depto || 'Sem setor'); aguardando[k] = (aguardando[k] || 0) + 1; } return; }
    if (!podeVer_(u, c)) return;
    out.push({
      id: p.id, matricula: c.matricula, revenda: p.revenda, codigo: p.codigo, setorF: p.setorF, grupo: p.grupo, cargo: p.cargo,
      ativoDP: p.ativoDP, situacao: p.situacao, local: p.local, iniAq: p.iniAq, fimAq: p.fimAq, prazo: p.prazo,
      saldo: +p.saldo || 0, origem: p.origem, ano: p.ano, sugestao: parse_(p.sugestao, []), plano: p.plano === '' ? null : parse_(p.plano, null),
      conf: p.conf === 'S', por: p.por, em: p.em, acomp: parse_(p.acomp, null), ajuste: p.ajuste
    });
  });
  const anos = uniq_(pfLista_().map(function (p) { return p.ano; }));
  return { periodos: out, volume: pfVolume_(), anos: anos, aguardando: aguardando, migracao: parse_(PropertiesService.getScriptProperties().getProperty('FERIAS_MIGRACAO'), null) };
}

function pfAcha_(u, id, lst) {
  const p = (lst || pfLista_()).filter(function (x) { return x.id === String(id); })[0];
  if (!p) throw new Error('Período de férias não encontrado.');
  const c = pfColsMapa_()[pfChaveCol_(p.revenda, p.codigo)];
  if (!c) throw new Error('Este colaborador não está ativo na Gestão.');
  if (!podeVer_(u, c)) throw new Error('Você não tem acesso a este colaborador.');
  return { p: p, c: c };
}
function pfPlanoLimpo_(pl) {
  if (pl === null || pl === undefined) return null;
  if (!Array.isArray(pl) || pl.length > 2) throw new Error('Programação inválida.');
  return pl.map(function (x) {
    const ini = dataOk_(x.ini, 'início'), dias = parseInt(x.dias, 10);
    if (!(dias >= 1 && dias <= 30)) throw new Error('Quantidade de dias inválida.');
    return { ini: ini, dias: dias };
  }).sort(function (a, b) { return a.ini < b.ini ? -1 : 1; });
}
/** Reescreve na aba Ferias (usada pelas escalas) as férias confirmadas destes períodos. */
function pfEntradas_(periodos, cols) {
  cols = cols || pfColsMapa_();
  const ids = {}; periodos.forEach(function (p) { ids[p.id] = true; });
  const quando = agora_();
  let lst = ler_('Ferias').filter(function (f) { const m = String(f.id).match(/^PF\|(.+)\|\d+$/); return !(m && ids[m[1]]); });
  periodos.forEach(function (p) {
    if (p.conf !== 'S' || p.origem === 'gozado') return;
    const c = cols[pfChaveCol_(p.revenda, p.codigo)]; if (!c) return;
    pfPlano_(p).forEach(function (x, k) {
      lst.push({ id: 'PF|' + p.id + '|' + k, matricula: c.matricula, inicio: x.ini, fim: isoMaisDias(x.ini, x.dias - 1), obs: ORIGEM_PF + (p.por ? ' · confirmada por ' + p.por : ''), criadoPor: ORIGEM_PF, criadoEm: quando });
    });
  });
  gravarTudo_('Ferias', lst);
}

/** Salvar um período: plano (null = volta à sugestão), confirmar/desconfirmar. */
function feriasSalvar_(u, d) {
  return comLock_(function () {
    const lst = pfLista_(), a = pfAcha_(u, d.id, lst), p = a.p;
    if (d.reset) { p.plano = ''; p.conf = 'N'; }
    else {
      if (d.plano !== undefined) {
        const pl = pfPlanoLimpo_(d.plano);
        if (pl && !pl.length && String(p.prazo) <= p.ano + '-12-31') throw new Error('Não dá para deixar sem férias: o prazo (' + String(p.prazo).split('-').reverse().join('/') + ') vence em ' + p.ano + '.');
        p.plano = pl === null ? '' : JSON.stringify(pl);
      }
      if (d.conf !== undefined) p.conf = d.conf ? 'S' : 'N';
      if (d.saldo !== undefined) {
        if (u.perfil !== 'ADMIN') throw new Error('Só o administrador corrige o saldo de férias.');
        const s = Math.round(+d.saldo);
        if (!(s >= 0 && s <= 30)) throw new Error('Saldo deve ser de 0 a 30 dias.');
        p.saldo = String(s);
      }
    }
    p.por = u.nome; p.em = agora_(); p.editadoGestao = 'S';
    gravarLinha_('FeriasPeriodos', p);
    pfEntradas_([p]);
    log_(u, a.c.matricula, d.reset ? 'férias: voltou à sugestão' : 'férias: ' + (p.conf === 'S' ? 'confirmou' : 'ajustou'), p.plano || p.sugestao);
    return feriasUm_(p, a.c);
  });
}
function feriasUm_(p, c) {
  return { id: p.id, matricula: c.matricula, plano: p.plano === '' ? null : parse_(p.plano, null), conf: p.conf === 'S', por: p.por, em: p.em, acomp: parse_(p.acomp, null), saldo: +p.saldo || 0 };
}
/** Confirmar vários de uma vez, como estão. */
function feriasLote_(u, d) {
  const ids = d.ids || [];
  if (!ids.length) throw new Error('Nada selecionado.');
  return comLock_(function () {
    const lst = pfLista_(), cols = pfColsMapa_(), feitos = [], quando = agora_();
    lst.forEach(function (p) {
      if (ids.indexOf(p.id) < 0) return;
      const c = cols[pfChaveCol_(p.revenda, p.codigo)];
      if (!c || !podeVer_(u, c) || !pfPlano_(p).length) return;
      p.conf = 'S'; p.por = u.nome; p.em = quando; p.editadoGestao = 'S'; feitos.push(p);
    });
    if (feitos.length) { gravarTudo_('FeriasPeriodos', lst); pfEntradas_(feitos, cols); }
    log_(u, '', 'férias: confirmou em lote', String(feitos.length));
    return feitos.map(function (p) { return feriasUm_(p, cols[pfChaveCol_(p.revenda, p.codigo)]); });
  });
}
/** Acompanhamento: o que aconteceu com a férias planejada (saiu, trocou, desligado, afastado). */
function feriasAcomp_(u, d) {
  return comLock_(function () {
    const a = pfAcha_(u, d.id), p = a.p, s = String(d.s || ''), obs = String(d.obs || '').trim().slice(0, 200);
    if (['', 'ferias', 'trocou', 'deslig', 'afast'].indexOf(s) < 0) throw new Error('Situação inválida.');
    p.acomp = s || obs ? JSON.stringify({ s: s, obs: obs }) : ''; p.acompPor = u.nome; p.acompEm = agora_();
    gravarLinha_('FeriasPeriodos', p);
    return feriasUm_(p, a.c);
  });
}

/* ---------- migração do sistema anterior (Férias 2027) ---------- */
/**
 * Traz do sistema anterior todos os períodos (559 empregados), as confirmações, os ajustes, o acompanhamento,
 * os feriados e o volume. Pode rodar de novo: atualiza só o que ainda não foi mexido na Gestão.
 * Desliga a sincronização de hora em hora (a Gestão passa a ser a dona das férias).
 */
function feriasMigrar_(u) {
  const cfg = cfg_(), urlSis = String(cfg.FERIAS_SISTEMA_URL || '').trim(), urlApi = String(cfg.FERIAS_API_URL || '').trim();
  if (!urlSis || !urlApi) throw new Error('Informe os endereços do sistema anterior em Regras > Parâmetros.');
  const html = UrlFetchApp.fetch(urlSis, { muteHttpExceptions: true }).getContentText();
  const mb = html.match(/<script[^>]*id=["']base["'][^>]*>([\s\S]*?)<\/script>/);
  if (!mb) throw new Error('Não encontrei a base no sistema anterior.');
  const BASE = JSON.parse(mb[1]);
  const EDITS = JSON.parse(UrlFetchApp.fetch(urlApi + (urlApi.indexOf('?') < 0 ? '?' : '&') + 'api=get&t=' + Date.now(), { muteHttpExceptions: true }).getContentText() || '{}');
  const ano = anoDoSistema_(html), dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const dois = function (n) { return String(n).padStart(2, '0'); };
  const pIso = function (pl) { return (pl || []).filter(function (x) { return x && x.m && x.dias; }).map(function (x) { return { ini: ano + '-' + dois(x.m) + '-' + dois(Math.min(x.d || 1, dim[x.m - 1])), dias: +x.dias }; }); };
  const ORIG = { '2026': 'ref', sem_ref: 'sem_ref', '2028': 'opc', gozado: 'gozado' };
  // feriados por unidade (os da Gestão + os do sistema anterior) para ajustar as sugestões como o sistema anterior fazia na tela
  const FER = {}; ler_('Feriados').forEach(function (f) { if (f.contaAlerta === 'N') return; (FER[f.revenda] = FER[f.revenda] || {})[f.data] = f.descricao; });
  (BASE.units || []).forEach(function (un) { const F = (BASE.fer || {})[un.sig] || {}; FER[un.nome] = FER[un.nome] || {}; Object.keys(F).forEach(function (d) { if (!FER[un.nome][d]) FER[un.nome][d] = F[d]; }); });
  const ajusta = function (pl, rev, fimAq) {
    return pl.map(function (x) {
      let ini = diaBomPerto_(x.ini, FER[rev] || {});
      if (ini <= fimAq) { const t = inicioBom_(isoMaisDias(fimAq, 1), FER[rev] || {}); if (t.slice(0, 4) === ano) ini = t; }
      return { ini: ini, dias: x.dias };
    });
  };
  return comLock_(function () {
    const lst = pfLista_(), porId = {}, quando = agora_(), res = { novos: 0, atualizados: 0, preservados: 0, confirmadas: 0, feriados: 0, ano: ano };
    lst.forEach(function (p) { porId[p.id] = p; });
    (BASE.units || []).forEach(function (un) {
      const emp = {}; (un.emps || []).forEach(function (e) { emp[e.cod] = e; });
      (un.rows || []).forEach(function (r) {
        const e = emp[r.cod] || {}, id = un.sig + '-' + r.cod + '-' + r.ini_aq, E = EDITS[r.id] || {}, AC = EDITS['ac:' + r.id], LOC = EDITS['loc:' + un.sig + r.cod];
        let p = porId[id];
        if (p && p.editadoGestao === 'S') { res.preservados++; return; }
        const novo = !p;
        if (novo) { p = { id: id }; lst.push(p); porId[id] = p; }
        Object.assign(p, {
          revenda: un.nome, sig: un.sig, codigo: String(r.cod), nome: e.nome || '', depto: e.f || '', setorF: e.f || '', grupo: e.g || '', cargo: e.cargo || '',
          admissao: e.adm || '', ativoDP: e.ativo === false ? 'N' : 'S', situacao: e.sit || '', local: (LOC && typeof LOC.p === 'string') ? LOC.p : (e.pa || ''), turno: e.tu || '',
          iniAq: r.ini_aq, fimAq: r.fim_aq, prazo: r.prazo, direito: '30', abono: '', gozados: String(r.taken26 || ''), saldo: String(r.saldo), origem: ORIG[r.o] || r.o, ano: ano,
          sugestao: JSON.stringify(ajusta(pIso(r.p), un.nome, r.fim_aq)), plano: E.p !== undefined ? JSON.stringify(pIso(E.p)) : '', conf: E.c ? 'S' : 'N', por: E.por || '', em: E.em || '',
          acomp: AC && AC.p && typeof AC.p === 'object' ? JSON.stringify(AC.p) : '', acompPor: AC ? AC.por || '' : '', acompEm: AC ? AC.em || '' : '',
          fonte: 'sistema anterior', editadoGestao: ''
        });
        if (p.conf === 'S') res.confirmadas++;
        novo ? res.novos++ : res.atualizados++;
      });
    });
    gravarTudo_('FeriasPeriodos', lst);
    // feriados que o sistema anterior tinha e a Gestão ainda não
    const fer = ler_('Feriados'), tem = {}; fer.forEach(function (f) { tem[f.revenda + '|' + f.data] = true; });
    (BASE.units || []).forEach(function (un) {
      const F = (BASE.fer || {})[un.sig] || {};
      Object.keys(F).forEach(function (iso) {
        if (tem[un.nome + '|' + iso]) return;
        fer.push({ id: Utilities.getUuid(), revenda: un.nome, data: iso, descricao: F[iso], criadoPor: 'Sistema de férias', criadoEm: quando, tipo: '', validacao: '', contaAlerta: 'S', obs: '', origem: 'sistema anterior' });
        tem[un.nome + '|' + iso] = true; res.feriados++;
      });
    });
    if (res.feriados) gravarTudo_('Feriados', fer);
    // volume OBZ (ano programado) e do ano anterior, por revenda
    const vol = pfVolume_(); vol[ano] = vol[ano] || {};
    Object.keys(BASE.vol || {}).forEach(function (rev) { const v = BASE.vol[rev]; vol[ano][rev] = { obz: v.obz, ref: v.v26 }; });
    salvaCfg_('VOLUME_FERIAS', JSON.stringify(vol));
    // férias das escalas: tira as da sincronização antiga e grava as confirmadas
    const semSinc = ler_('Ferias').filter(function (f) { return f.criadoPor !== ORIGEM_SINC; });
    gravarTudo_('Ferias', semSinc);
    pfEntradas_(lst);
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sincFeriasAuto') ScriptApp.deleteTrigger(t); });
    res.em = quando; res.por = u.nome;
    PropertiesService.getScriptProperties().setProperty('FERIAS_MIGRACAO', JSON.stringify(res));
    log_(u, '', 'férias: migrou do sistema anterior', JSON.stringify(res));
    return res;
  });
}
function salvaCfg_(k, v) {
  const l = ler_('Config').filter(function (x) { return x.chave === k; })[0];
  if (l) { l.valor = v; gravarLinha_('Config', l); }
  else gravarLinha_('Config', { chave: k, valor: v, descricao: '' });
}

/* ---------- planilha de programação do DP (um ano novo) ---------- */
/**
 * Recebe as linhas lidas da planilha "Programação de férias" de uma unidade e cria/atualiza os períodos do ano.
 * Sugestão: o mesmo período do ano anterior (se houver), senão logo que completar o aquisitivo.
 * O que o DP já programou na planilha entra como confirmado.
 */
function feriasImportarDP_(u, d) {
  const rev = String(d.revenda || ''), ano = String(d.ano || ''), linhas = d.linhas || [];
  if (!rev || !/^20\d\d$/.test(ano)) throw new Error('Informe a unidade e o ano.');
  if (!linhas.length) throw new Error('A planilha não tem linhas.');
  const fer = {}; ler_('Feriados').forEach(function (f) { if (f.revenda === rev && f.contaAlerta !== 'N') fer[f.data] = f.descricao; });
  const sig = (Object.keys(SIGLAS_PADRAO).filter(function (k) { return SIGLAS_PADRAO[k] === rev; })[0]) || rev.slice(0, 2).toUpperCase();
  return comLock_(function () {
    const lst = pfLista_(), porId = {}, quando = agora_(), res = { novos: 0, atualizados: 0, preservados: 0 };
    lst.forEach(function (p) { porId[p.id] = p; });
    // plano do ano anterior por código (para sugerir o mesmo período)
    const ant = {}; lst.forEach(function (p) { if (p.revenda === rev && String(+p.ano + 1) === ano) { const pl = pfPlano_(p); if (pl.length) ant[p.codigo] = pl; } });
    linhas.forEach(function (l) {
      const cod = String(l.codigo).replace(/^0+/, ''), iniAq = dataOk_(l.iniAq, 'início aquisitivo'), fimAq = dataOk_(l.fimAq, 'fim aquisitivo');
      const id = sig + '-' + cod + '-' + iniAq, prazo = l.prazo ? dataOk_(l.prazo, 'prazo') : isoMaisDias(fimAq, 365);
      const direito = +l.direito || 30, abono = /^s/i.test(l.abono || ''), gozados = +l.gozados || 0;
      const saldo = Math.max(0, direito - (abono ? Math.round(direito / 3) : 0) - gozados);
      let p = porId[id];
      if (p && p.editadoGestao === 'S') { res.preservados++; return; }
      const novo = !p; if (novo) { p = { id: id }; lst.push(p); porId[id] = p; }
      const origem = saldo <= 0 ? 'gozado' : prazo > ano + '-12-31' ? 'opc' : ant[cod] ? 'ref' : 'sem_ref';
      let sug = [];
      if (origem !== 'gozado') {
        if (ant[cod]) sug = ant[cod].map(function (x) { return { ini: inicioBom_(String(+x.ini.slice(0, 4) + 1) + x.ini.slice(4), fer), dias: x.dias }; });
        else { let ini = isoMaisDias(fimAq, 1); if (ini < ano + '-01-01') ini = ano + '-01-01'; sug = [{ ini: inicioBom_(ini, fer), dias: Math.min(30, Math.max(5, saldo)) }]; }
        sug = sug.map(function (x) { return x.ini <= fimAq ? { ini: inicioBom_(isoMaisDias(fimAq, 1), fer), dias: x.dias } : x; });
      }
      const dp = [l.p1, l.p2].filter(function (x) { return x && x.ini && x.dias; }).map(function (x) { return { ini: dataOk_(x.ini, 'início'), dias: +x.dias }; });
      Object.assign(p, {
        revenda: rev, sig: sig, codigo: cod, nome: String(l.nome || p.nome || ''), depto: String(l.depto || p.depto || ''), setorF: p.setorF || String(l.depto || ''),
        admissao: l.admissao || p.admissao || '', iniAq: iniAq, fimAq: fimAq, prazo: prazo, direito: String(direito), abono: abono ? 'S' : '', gozados: String(gozados),
        saldo: String(saldo), origem: origem, ano: ano, sugestao: JSON.stringify(sug), fonte: 'planilha do DP', editadoGestao: ''
      });
      if (dp.length) { p.plano = JSON.stringify(dp); p.conf = 'S'; p.por = 'Planilha do DP'; p.em = quando; }
      else if (novo) { p.plano = ''; p.conf = 'N'; }
      novo ? res.novos++ : res.atualizados++;
    });
    gravarTudo_('FeriasPeriodos', lst);
    pfEntradas_(lst.filter(function (p) { return p.revenda === rev; }));
    log_(u, '', 'férias: importou planilha do DP', rev + ' ' + ano + ' ' + JSON.stringify(res));
    return res;
  });
}
/** Primeiro dia a partir de iso em que as férias podem começar (não domingo, não sex/sáb, sem feriado no dia ou nos 2 seguintes). */
function inicioBom_(iso, fer) {
  for (let k = 0; k < 20; k++) {
    const d = isoMaisDias(iso, k), w = diaSemanaIso(d);
    if (w >= 4) continue; // sexta (4), sábado (5), domingo (6): a folga é no domingo
    if (fer[d] || fer[isoMaisDias(d, 1)] || fer[isoMaisDias(d, 2)]) continue;
    return d;
  }
  return iso;
}

/** Dia mais perto (no mesmo mês) em que as férias podem começar. */
function diaBomPerto_(iso, fer) {
  const ruim = function (d) { const w = diaSemanaIso(d); return w >= 4 || !!fer[d] || !!fer[isoMaisDias(d, 1)] || !!fer[isoMaisDias(d, 2)]; };
  if (!ruim(iso)) return iso;
  for (let k = 1; k < 31; k++) for (const s of [-k, k]) { const d = isoMaisDias(iso, s); if (d.slice(0, 7) === iso.slice(0, 7) && !ruim(d)) return d; }
  return iso;
}


/**
 * Correção pontual (rota liberada uma vez pela prop AJUSTE_FERIAS_MATS = 'MAT1,MAT2' ou '*2027' = todos daquele ano):
 * férias lançadas à mão pela escala passam para o módulo Férias. Regras:
 *  - só manual (sem férias do módulo no ano): as datas manuais viram o plano confirmado do período do módulo;
 *  - manual igual/sobreposta às do módulo: a manual sai (o módulo já tem);
 *  - manual diferente das do módulo, mais de um período no ano ou mais de 2 lançamentos: não mexe, vai para conferência.
 * Devolve uma linha por colaborador para a conferência dos supervisores.
 */
function ajusteFeriasManuais_() {
  const props = PropertiesService.getScriptProperties(), arg = String(props.getProperty('AJUSTE_FERIAS_MATS') || '').trim();
  if (!arg) throw new Error('Ajuste não liberado.');
  props.deleteProperty('AJUSTE_FERIAS_MATS');
  const todosAno = /^\*\d{4}$/.test(arg) ? arg.slice(1) : '';
  return comLock_(function () {
    const cols = pfColsMapa_(), porMat = {}; Object.keys(cols).forEach(function (k) { porMat[cols[k].matricula] = k; });
    const usu = {}; ler_('Usuarios').forEach(function (x) { usu[x.id] = x.nome; });
    const colM = {}; ler_('Colaboradores').forEach(function (c) { colM[c.matricula] = c; });
    const lst = pfLista_(), fer = ler_('Ferias'), feitos = [], out = [], tirar = {};
    const dd = function (iso) { return String(iso).split('-').reverse().join('/'); };
    const dias = function (f) { return Math.round((Date.parse(f.fim) - Date.parse(f.inicio)) / 864e5) + 1; };
    let alvo = [];
    if (todosAno) {
      const vistos = {}; fer.forEach(function (f) { if (!/^PF\|/.test(String(f.id)) && f.inicio.slice(0, 4) === todosAno && porMat[f.matricula] && !vistos[f.matricula]) { vistos[f.matricula] = 1; alvo.push([f.matricula, todosAno]); } });
    } else arg.split(',').map(function (x) { return x.trim(); }).filter(String).forEach(function (m) {
      const f = fer.filter(function (x) { return x.matricula === m && !/^PF\|/.test(String(x.id)); })[0]; if (f) alvo.push([m, f.inicio.slice(0, 4)]);
    });
    alvo.forEach(function (a) {
      const m = a[0], ano = a[1], c = colM[m] || {}, chave = porMat[m];
      const man = fer.filter(function (f) { return f.matricula === m && !/^PF\|/.test(String(f.id)) && f.inicio.slice(0, 4) === ano; }).sort(function (x, y) { return x.inicio < y.inicio ? -1 : 1; });
      const pf = fer.filter(function (f) { return f.matricula === m && /^PF\|/.test(String(f.id)) && f.inicio.slice(0, 4) === ano; });
      const pers = lst.filter(function (x) { return pfChaveCol_(x.revenda, x.codigo) === chave && x.ano === ano && x.origem !== 'gozado'; });
      const lin = { matricula: m, nome: c.nome || '', supervisor: usu[c.supervisor] || '', revenda: c.revenda || '', funcao: c.funcao || '',
        lancadoPor: man.map(function (f) { return f.criadoPor; }).filter(function (v, i, arr) { return v && arr.indexOf(v) === i; }).join(', '),
        escala: man.map(function (f) { return dd(f.inicio) + ' a ' + dd(f.fim); }).join(' + '),
        modulo: pf.map(function (f) { return dd(f.inicio) + ' a ' + dd(f.fim); }).join(' + '), ficou: '', acao: '', obs: '' };
      const sobre = function (f) { return pf.some(function (g) { return g.inicio <= f.fim && f.inicio <= g.fim; }); };
      if (!pers.length) { lin.acao = 'Não mexido'; lin.obs = 'sem período deste ano no módulo Férias'; lin.ficou = lin.escala; out.push(lin); return; }
      if (pf.length) {
        if (man.every(sobre)) { man.forEach(function (f) { tirar[f.id] = 1; }); lin.acao = 'Duplicada removida'; lin.ficou = lin.modulo; lin.obs = 'a escala tinha a mesma férias lançada duas vezes; ficou a do módulo'; }
        else { lin.acao = 'Conferir'; lin.ficou = lin.modulo + ' (módulo) e ' + lin.escala + ' (escala)'; lin.obs = 'datas da escala diferentes das do módulo: dizer qual vale'; }
        out.push(lin); return;
      }
      if (pers.length > 1 || man.length > 2) { lin.acao = 'Conferir'; lin.ficou = lin.escala; lin.obs = pers.length > 1 ? 'tem ' + pers.length + ' períodos aquisitivos no ano: dizer a qual pertence' : 'mais de 2 lançamentos no ano'; out.push(lin); return; }
      const p = pers[0], pl = man.map(function (f) { return { ini: f.inicio, dias: Math.min(30, dias(f)) }; });
      const tot = pl.reduce(function (t, x) { return t + x.dias; }, 0);
      p.plano = JSON.stringify(pl); p.conf = 'S'; p.por = man[0].criadoPor || p.por; p.em = man[0].criadoEm || agora_(); p.editadoGestao = 'S';
      man.forEach(function (f) { tirar[f.id] = 1; }); feitos.push(p);
      lin.acao = 'Passada para o módulo'; lin.ficou = pl.map(function (x) { return dd(x.ini) + ' a ' + dd(isoMaisDias(x.ini, x.dias - 1)); }).join(' + ');
      const obs = []; if (man.some(function (f) { return dias(f) > 30; })) obs.push('lançamento com mais de 30 dias: ficou com 30');
      if (tot !== (+p.saldo || 30)) obs.push('total ' + tot + ' dias, saldo do período ' + (+p.saldo || 30));
      lin.obs = obs.join('; '); out.push(lin);
    });
    if (feitos.length) gravarTudo_('FeriasPeriodos', lst);
    if (Object.keys(tirar).length) gravarTudo_('Ferias', fer.filter(function (f) { return !tirar[f.id]; }));
    if (feitos.length) pfEntradas_(feitos, cols);
    log_({ nome: 'ajuste', login: 'ajuste' }, '', 'férias: escala → módulo Férias', out.length + ' colaborador(es): ' + out.map(function (l) { return l.matricula + ' ' + l.acao; }).join(' · '));
    return out;
  });
}


/**
 * Abre um ano novo na programação: para cada empregado, cria o período aquisitivo seguinte ao último que existe
 * (aquisitivo = o ano seguinte ao último; prazo com a mesma folga do último), quando ele cai no ano pedido.
 * Sugestão: os mesmos meses do plano do último período; sem plano, logo que completar o aquisitivo.
 * Ninguém sai confirmado. Se o DP importar a planilha desse ano depois, os mesmos períodos são atualizados (mesmo id).
 */
function feriasAbrirAno_(u, d) {
  const ano = String(d.ano || '');
  if (!/^20\d\d$/.test(ano)) throw new Error('Informe o ano.');
  return comLock_(function () {
    const lst = pfLista_(), porId = {}, ult = {}, quando = agora_(), fer = {}, res = { ano: ano, novos: 0, jaTinha: 0 };
    ler_('Feriados').forEach(function (f) { if (f.contaAlerta !== 'N') (fer[f.revenda] = fer[f.revenda] || {})[f.data] = f.descricao; });
    lst.forEach(function (p) { porId[p.id] = p; const k = p.revenda + '|' + p.codigo; if (!ult[k] || p.fimAq > ult[k].fimAq) ult[k] = p; });
    const anoMais = function (iso, n) { const y = +iso.slice(0, 4) + n, md = iso.slice(5) === '02-29' ? '02-28' : iso.slice(5); return y + '-' + md; };
    Object.keys(ult).forEach(function (k) {
      let b = ult[k];
      if (b.ativoDP === 'N') return;
      const folga = Math.round((Date.parse(b.prazo) - Date.parse(b.fimAq)) / 864e5) || 335;
      let iniAq = isoMaisDias(b.fimAq, 1), fimAq = isoMaisDias(anoMais(iniAq, 1), -1);
      while (+fimAq.slice(0, 4) + 1 < +ano) { iniAq = isoMaisDias(fimAq, 1); fimAq = isoMaisDias(anoMais(iniAq, 1), -1); }
      if (String(+fimAq.slice(0, 4) + 1) !== ano) return;
      const id = b.sig + '-' + b.codigo + '-' + iniAq;
      if (porId[id]) { res.jaTinha++; return; }
      const prazo = isoMaisDias(fimAq, folga), F = fer[b.revenda] || {}, pl = pfPlano_(b);
      let sug = pl.length ? pl.map(function (x) { return { ini: inicioBom_(ano + x.ini.slice(4), F), dias: x.dias }; })
        : [{ ini: inicioBom_(isoMaisDias(fimAq, 1) < ano + '-01-01' ? ano + '-01-01' : isoMaisDias(fimAq, 1), F), dias: 30 }];
      sug = sug.map(function (x) { return x.ini <= fimAq ? { ini: inicioBom_(isoMaisDias(fimAq, 1), F), dias: x.dias } : x; });
      const p = {};
      Object.keys(b).forEach(function (c) { p[c] = ''; });
      Object.assign(p, { id: id, revenda: b.revenda, sig: b.sig, codigo: b.codigo, nome: b.nome, depto: b.depto, setorF: b.setorF, grupo: b.grupo, cargo: b.cargo,
        admissao: b.admissao, ativoDP: b.ativoDP, situacao: b.situacao, local: b.local, turno: b.turno, iniAq: iniAq, fimAq: fimAq, prazo: prazo,
        direito: '30', abono: '', gozados: '0', saldo: '30', origem: prazo > ano + '-12-31' ? 'opc' : pl.length ? 'ref' : 'sem_ref', ano: ano,
        sugestao: JSON.stringify(sug), plano: '', conf: 'N', fonte: 'projetado (ano aberto em ' + quando + ')', editadoGestao: '' });
      lst.push(p); porId[id] = p; res.novos++;
    });
    if (res.novos) gravarTudo_('FeriasPeriodos', lst);
    log_(u, '', 'férias: abriu o ano', JSON.stringify(res));
    return res;
  });
}
function feriasAbrirAnoAuto_() {
  const props = PropertiesService.getScriptProperties(), ano = String(props.getProperty('ABRIR_ANO_FERIAS') || '');
  if (!/^20\d\d$/.test(ano)) throw new Error('Não liberado.');
  props.deleteProperty('ABRIR_ANO_FERIAS');
  return feriasAbrirAno_({ nome: 'Sistema', login: 'sistema' }, { ano: ano });
}
