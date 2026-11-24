/**
 * Gestão de Férias e Escala — férias e escalas 5x2 da Revalle.
 * Web app em Apps Script. A base de dados é uma Planilha Google criada automaticamente
 * no primeiro acesso (o ID fica em Propriedades do script: DB_ID).
 * Publicar como: Executar como "Eu" · Acesso "Qualquer pessoa".
 * O acesso ao sistema é por login e senha próprios, aprovados pelo administrador.
 */

/** Rode no editor se aparecer "não tem permissão para chamar UrlFetchApp": pede ao Google a autorização de acesso externo. */
function autorizarAcessoExterno() {
  const r = UrlFetchApp.fetch(String(cfg_().FERIAS_SISTEMA_URL || 'https://www.google.com'), { muteHttpExceptions: true });
  Logger.log('Acesso externo autorizado. Resposta: ' + r.getResponseCode());
}

const ABAS = {
  Config: ['chave', 'valor', 'descricao'],
  Usuarios: ['id', 'nome', 'login', 'telefone', 'senhaHash', 'salt', 'perfil', 'status', 'revendas', 'setores', 'criadoEm', 'aprovadoPor', 'aprovadoEm', 'ultimoAcesso', 'email'],
  Propostas: ['id', 'matricula', 'tipo', 'dados', 'obs', 'status', 'criadoPor', 'criadoPorNome', 'criadoEm', 'decididoPor', 'decididoEm', 'motivo'],
  Colaboradores: ['matricula', 'nome', 'funcao', 'revenda', 'setor', 'lotacao', 'turno', 'situacao', 'teleatendimento', 'ativo', 'atualizadoEm', 'tipoMot', 'supervisor', 'departamento', 'admissao'],
  Escalas: ['matricula', 'vigencia', 'dias', 'status', 'total', 'msgs', 'atualizadoPor', 'atualizadoEm', 'ate'],
  Ferias: ['id', 'matricula', 'inicio', 'fim', 'obs', 'criadoPor', 'criadoEm'],
  Feriados: ['id', 'revenda', 'data', 'descricao', 'criadoPor', 'criadoEm', 'tipo', 'validacao', 'contaAlerta', 'obs', 'origem'],
  Ajustes: ['matricula', 'data', 'tipo', 'ent', 'sai', 'int', 'por', 'em'],
  Links: ['token', 'matricula', 'ativo', 'criadoPor', 'criadoEm', 'acessos', 'ultimoAcesso'],
  FeriasPeriodos: ['id', 'revenda', 'sig', 'codigo', 'nome', 'depto', 'setorF', 'grupo', 'cargo', 'admissao', 'ativoDP', 'situacao', 'local', 'turno',
    'iniAq', 'fimAq', 'prazo', 'direito', 'abono', 'gozados', 'saldo', 'origem', 'ano', 'sugestao', 'plano', 'conf', 'por', 'em',
    'acomp', 'acompPor', 'acompEm', 'fonte', 'editadoGestao'],
  QLP: ['id', 'revenda', 'area', 'grupo', 'funcao', 'faixas', 'excecoes', 'obs', 'por', 'em'],
  LiberacoesDP: ['matricula', 'assinatura', 'liberadoPor', 'liberadoEm', 'vistoAssinatura', 'vistoPor', 'vistoEm', 'escala'],
  Historico: ['quando', 'usuario', 'matricula', 'acao', 'detalhe']
};

const CFG_PADRAO = [
  ['EMPRESA', 'Revalle', 'Nome no cabeçalho dos PDFs'],
  ['LINK_SISTEMA', 'https://revalle-logistica.github.io/gef/', 'Link enviado no e-mail de aprovação'],
  ['TURNOS_ARMAZEM', 'Turno 1,Turno 2,Turno 3,Administrativo', 'Opções de turno do armazém (separadas por vírgula)'],
  ['TIPOS_MOTORISTA', 'Rota,Puxador', 'Opções de tipo de motorista (separadas por vírgula)'],
  ['PONTOS_APOIO', '{}', 'Pontos de apoio por revenda (editados na tela Cadastro)'],
  ['DEPARTAMENTOS', '{}', 'Departamentos do relatório do DP e a visão de cada um (editado em Regras)'],
  ['REVENDAS_SIGLAS', '{}', 'Sigla do departamento no DP e o nome da revenda (editado em Regras)'],
  ['FUNCOES_GRUPO', '{}', 'Cargos do DP agrupados para os filtros (editado em Regras)'],
  ['FERIAS_SISTEMA_URL', 'https://ferias27-revalle.netlify.app/', 'Endereço do sistema de programação de férias (aba Férias)'],
  ['VOLUME_FERIAS', '{}', 'Volume OBZ por mês e revenda, usado no painel de férias (vem do sistema anterior)'],
  ['FERIAS_API_URL', 'https://script.google.com/macros/s/AKfycbz-weII57gIVYlcJOdiJeQXV3Zei_n-xqAaATOLKxxViKO_R50csjZ8IDXPqLlR34s24w/exec', 'Endereço de dados do sistema de férias (sincronização)'],
  ['DATA_INICIO_5X2', '2026-12-15', 'Início da nova jornada (EC 141/2026)'],
  ['DATA_INICIO_INTERNO', '2026-12-13', 'Início da escala 5x2 na Revalle (antecipado em relação ao oficial)'],
  ['LIMITE_SEMANAL_TRANSICAO', '42', 'Horas semanais máximas na transição'],
  ['DIARIO_MAX_TRANSICAO', '10:24', 'Jornada diária máxima na transição (hh:mm)'],
  ['DIARIO_MAX_ENTREGA', '12:24', 'Jornada diária máxima de motoristas e ajudantes de entrega (hh:mm)'],
  ['DATA_40H', '2027-12-15', 'A partir desta data valem 40h semanais e 8h diárias (confirmar com DP/jurídico)'],
  ['LIMITE_SEMANAL_FINAL', '40', 'Horas semanais máximas após a transição'],
  ['DIARIO_MAX_FINAL', '8', 'Horas diárias máximas após a transição'],
  ['DOMINGO_FOLGA', 'S', 'Domingo é folga fixa (S/N)'],
  ['TELE_DIARIO', '6', 'Teleatendimento: horas por dia (NR-17, Anexo II)'],
  ['TELE_SEMANAL', '30', 'Teleatendimento: horas por semana na 5x2'],
  ['BLOQUEAR_ERRO', 'S', 'Não salva escala com erro legal (S/N)'],
  ['PADRAO_ENTRADA', '07:00', 'Horário padrão sugerido: entrada'],
  ['PADRAO_SAIDA', '16:24', 'Horário padrão sugerido: saída'],
  ['PADRAO_INTERVALO', '60', 'Horário padrão sugerido: intervalo (min)']
];

const TZ = 'America/Bahia';

/* ---------------- web app ---------------- */
/**
 * GET normal: abre a tela direto no Apps Script.
 * GET ?raw=1: devolve o HTML puro para a página do GitHub Pages (index.html do repositório).
 * POST {token, acao, dados}: API usada pela página do GitHub Pages.
 */
function doGet(e) {
  const t = HtmlService.createTemplateFromFile('Index').evaluate();
  if (e && e.parameter && e.parameter.raw) return ContentService.createTextOutput(t.getContent()).setMimeType(ContentService.MimeType.TEXT);
  return t.setTitle('GEF - Gestão de Férias e Escala').setFaviconUrl('https://revalle-logistica.github.io/gef/favicon-32.png').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function doPost(e) {
  let r;
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    r = api(b.token, b.acao, b.dados);
  } catch (err) { r = { ok: false, erro: 'Requisição inválida.' }; }
  return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON);
}
function include(nome) { return HtmlService.createHtmlOutputFromFile(nome).getContent(); }
/** Envia as regras de Regras.gs para o navegador (mesma validação nos dois lados). */
function regrasFonte() {
  return 'var DIAS_SEMANA=' + JSON.stringify(DIAS_SEMANA) + ';var DIAS_CURTO=' + JSON.stringify(DIAS_CURTO) +
    ';var VISOES=' + JSON.stringify(VISOES) + ';var PREFIXO_DEPTO=' + JSON.stringify(PREFIXO_DEPTO) + ';var TURNOS_ORDEM=' + JSON.stringify(TURNOS_ORDEM) + ';var ORDEM_SEMANA=' + JSON.stringify(ORDEM_SEMANA) + ';\n' +
    [inicioSemana, diaDoOffset, inicioEscala, assinaturaEscala, situacaoLiberacao, hmParaMin, minParaHm, calcDia, minutosCfg, ehEntregaCampo, parametrosRegra, validarEscala, semanaModelo, periodosDe, periodoNaData, aplicarPeriodo, normTxt, turnoTag, deptoProprio, areaDeptoProprio, areaSetor, papelEntrega, ehSede, pendenciasCadastro, visaoColaborador, codigoMatricula, isoMaisDias, diaSemanaIso, segundaDaSemana, diasDoMes, feriadoConta, diaEfetivo, semanaEfetiva, avisosSemana, validarSemanaReal].map(function (f) { return f.toString(); }).join('\n');
}

/** Rode uma vez no editor para criar a base e ver o link da planilha. */
function setup() { Logger.log('Base de dados: ' + ss_().getUrl()); }

/* ---------------- roteador ---------------- */
// rotas montadas na chamada (as funções ficam em outros arquivos .gs)
function rotas_() {
  return { PUBLICAS: { registrar: registrar_, login: login_, minhaEscala: minhaEscala_, centralFeed: centralFeed_ }, PRIVADAS: {
  gerarLink: { f: gerarLink_ },
  carregar: { f: carregar_ },
  logout: { f: logout_ },
  trocarSenha: { f: trocarSenha_ },
  salvarEscala: { f: salvarEscala_ },
  salvarLote: { f: salvarLote_ },
  removerPeriodo: { f: removerPeriodo_ },
  setTele: { f: setTele_ },
  exportPdf: { f: exportPdf_ },
  usuarios: { f: usuarios_, admin: true },
  aprovarUsuario: { f: aprovarUsuario_, admin: true },
  statusUsuario: { f: statusUsuario_, admin: true },
  resetSenha: { f: resetSenha_, admin: true },
  liberarDP: { f: liberarDP_ },
  vistoDP: { f: vistoDP_, admin: true, dp: true },
  importar: { f: importar_, admin: true, dp: true },
  atualizarDoDP: { f: atualizarDoDP_, admin: true, dp: true },
  sincFerias: { f: function (u) { return sincFerias_(u.nome); }, admin: true, dp: true },
  feriasDados: { f: feriasDados_ },
  feriasSalvar: { f: feriasSalvar_ },
  feriasLote: { f: feriasLote_ },
  feriasAcomp: { f: feriasAcomp_ },
  feriasMigrar: { f: feriasMigrar_, admin: true },
  feriasImportarDP: { f: feriasImportarDP_, admin: true, dp: true },
  classificar: { f: classificar_ },
  salvarPontos: { f: salvarPontos_ },
  salvarQlp: { f: salvarQlp_ },
  removerQlp: { f: removerQlp_ },
  removerColaboradores: { f: removerColaboradores_, admin: true, dp: true },
  salvarFerias: { f: salvarFerias_ },
  removerFerias: { f: removerFerias_ },
  salvarFeriado: { f: salvarFeriado_, admin: true },
  importarFeriados: { f: importarFeriados_, admin: true },
  importarFerias: { f: importarFerias_, admin: true, dp: true },
  salvarAjuste: { f: salvarAjuste_ },
  removerFeriado: { f: removerFeriado_, admin: true },
  converterPlanilha: { f: converterPlanilha_, admin: true, dp: true },
  salvarConfig: { f: salvarConfig_, admin: true, dp: true },
  propor: { f: propor_ },
  cancelarProposta: { f: cancelarProposta_ },
  decidirProposta: { f: decidirProposta_ }
  } };
}

function api(token, acao, dados) {
  try {
    if (acao === '__enviarEmail' && typeof enviarEmailFila_ === 'function') return enviarEmailFila_(dados || {});
    if (typeof desvio_ === 'function') { const dv = desvio_(token, acao, dados); if (dv) return dv; }
    dados = dados || {};
    const R = rotas_(), PUBLICAS = R.PUBLICAS, PRIVADAS = R.PRIVADAS;
    if (PUBLICAS[acao]) return { ok: true, data: PUBLICAS[acao](dados) };
    const u = usuarioDaSessao_(token);
    if (!u) return { ok: false, sessao: true, erro: 'Sua sessão expirou. Entre novamente.' };
    u._token = token;
    const a = PRIVADAS[acao];
    if (!a) throw new Error('Ação inválida.');
    if (a.admin && u.perfil !== 'ADMIN' && !(a.dp && u.perfil === 'DP')) throw new Error('Somente o administrador pode fazer isso.');
    if (u.perfil === 'DP' && SO_ADMIN_SUP_[acao]) throw new Error('O perfil DP só consulta escalas e férias (não altera).');
    if (u.perfil === 'ANALISTA' && !ANALISTA_OK_[acao]) throw new Error('O perfil Assistente / Analista só consulta e propõe alterações ao supervisor.');
    return { ok: true, data: a.f(u, dados) };
  } catch (e) {
    return { ok: false, erro: e && e.message ? e.message : String(e) };
  }
}

/* ---------------- base de dados (planilha) ---------------- */
let SS_CACHE = null;
function ss_() {
  if (SS_CACHE) return SS_CACHE;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('DB_ID');
  if (id) {
    let s = null;
    try { s = SpreadsheetApp.openById(id); } catch (e) { s = null; /* base apagada: recria abaixo */ }
    if (s) {
      SS_CACHE = s;
      // a estrutura só é conferida quando muda (versão nova do código), não a cada chamada
      const ver = JSON.stringify([ABAS, CFG_PADRAO.map(function (c) { return c[0]; })]);
      if (props.getProperty('DB_VER') !== ver) { prepararBase_(s); props.setProperty('DB_VER', ver); }
      return s;
    }
  }
  SS_CACHE = SpreadsheetApp.create('Escala 5x2 – Base do sistema');
  props.setProperty('DB_ID', SS_CACHE.getId());
  prepararBase_(SS_CACHE);
  return SS_CACHE;
}
function prepararBase_(s) {
  Object.keys(ABAS).forEach(function (n) {
    let sh = s.getSheetByName(n);
    if (!sh) {
      sh = s.insertSheet(n);
      sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
      sh.getRange(1, 1, 1, ABAS[n].length).setValues([ABAS[n]]).setFontWeight('bold').setBackground('#0b2a6b').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    } else if (sh.getLastColumn() < ABAS[n].length) {
      sh.getRange(1, 1, sh.getMaxRows(), ABAS[n].length).setNumberFormat('@');
      sh.getRange(1, 1, 1, ABAS[n].length).setValues([ABAS[n]]).setFontWeight('bold').setBackground('#0b2a6b').setFontColor('#ffffff');
    }
  });
  ['Sheet1', 'Página1', 'Planilha1'].forEach(function (n) { const d = s.getSheetByName(n); if (d && s.getSheets().length > 1) s.deleteSheet(d); });
  const c = s.getSheetByName('Config');
  const tem = c.getLastRow() > 1 ? c.getRange(2, 1, c.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return r[0]; }) : [];
  const faltam = CFG_PADRAO.filter(function (x) { return tem.indexOf(x[0]) < 0; });
  if (faltam.length) c.getRange(c.getLastRow() + 1, 1, faltam.length, 3).setNumberFormat('@').setValues(faltam);
  // uma vez: máximo diário da transição passou de 10h para 10h24
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('MIG_1024')) {
    const lin = c.getRange(2, 1, Math.max(1, c.getLastRow() - 1), 2).getDisplayValues();
    lin.forEach(function (r, i) { if (r[0] === 'DIARIO_MAX_TRANSICAO' && String(r[1]).trim() === '10') c.getRange(i + 2, 2).setNumberFormat('@').setValue('10:24'); });
    props.setProperty('MIG_1024', '1');
  }
}
function aba_(n) { return ss_().getSheetByName(n); }
function ler_(n) {
  const sh = aba_(n), h = ABAS[n], lr = sh.getLastRow();
  if (lr < 2) return [];
  return sh.getRange(2, 1, lr - 1, h.length).getDisplayValues().map(function (r, i) {
    const o = { _row: i + 2 };
    h.forEach(function (k, j) { o[k] = r[j]; });
    return o;
  });
}
function linha_(n, o) { return ABAS[n].map(function (k) { return o[k] == null ? '' : String(o[k]); }); }
function gravarTudo_(n, objs) {
  const sh = aba_(n), h = ABAS[n], lr = sh.getLastRow();
  if (lr > 1) sh.getRange(2, 1, lr - 1, h.length).clearContent();
  if (!objs.length) return;
  sh.getRange(2, 1, objs.length, h.length).setNumberFormat('@').setValues(objs.map(function (o) { return linha_(n, o); }));
}
function gravarLinha_(n, o) {
  const sh = aba_(n);
  const row = o._row || sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, ABAS[n].length).setNumberFormat('@').setValues([linha_(n, o)]);
  o._row = row;
}
function log_(u, mat, acao, det) {
  const sh = aba_('Historico');
  sh.getRange(sh.getLastRow() + 1, 1, 1, 5).setNumberFormat('@').setValues([[agora_(), u ? u.login : '', mat || '', acao, det || '']]);
}
function agora_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
function cfg_() {
  const o = {};
  ler_('Config').forEach(function (r) { o[r.chave] = r.valor; });
  CFG_PADRAO.forEach(function (c) { if (o[c[0]] === undefined || o[c[0]] === '') o[c[0]] = c[1]; });
  return o;
}
function comLock_(fn) {
  const l = LockService.getScriptLock();
  l.waitLock(25000);
  try { return fn(); } finally { l.releaseLock(); }
}
function lista_(s) { return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(String); }
function uniq_(a) { return Array.from(new Set(a.filter(String))).sort(); }
/** Administrador vê todos; supervisor vê só os colaboradores vinculados a ele na tela Cadastro. */
/** Administrador e DP veem todos os colaboradores. */
function veTudo_(u) { return u.perfil === 'ADMIN' || u.perfil === 'DP'; }
/** Ações de escala/férias/QLP que o DP não faz (ele só consulta). */
var SO_ADMIN_SUP_ = { liberarDP: 1, salvarEscala: 1, salvarLote: 1, removerPeriodo: 1, setTele: 1, salvarAjuste: 1, salvarQlp: 1, removerQlp: 1, salvarPontos: 1, salvarFerias: 1, removerFerias: 1, feriasSalvar: 1, feriasLote: 1, feriasAcomp: 1, feriasMigrar: 1 };
function podeVer_(u, c) {
  if (veTudo_(u)) return true;
  if (u.perfil === 'ANALISTA') {
    const rv = lista_(u.revendas), dp = lista_(u.setores);
    return (rv.indexOf('*') >= 0 || rv.indexOf(c.revenda) >= 0) && (dp.indexOf('*') >= 0 || dp.indexOf(departamentoChave(c)) >= 0);
  }
  return !!c.supervisor && c.supervisor === u.id;
}
function parse_(s, def) { try { return s ? JSON.parse(s) : def; } catch (e) { return def; } }

/** Escalas de cada pessoa com todos os períodos; os campos de cima são do período que vale em ref (ou o mais próximo). */
function escalaObj_(rows, ref) {
  if (!rows || !rows.length) return null;
  const ps = rows.map(function (e) { return { vigencia: e.vigencia, ate: e.ate || '', dias: parse_(e.dias, []), por: e.atualizadoPor, em: e.atualizadoEm }; })
    .sort(function (a, b) { return a.vigencia < b.vigencia ? -1 : 1; });
  const o = { periodos: ps };
  const p = periodoNaData(o, ref) || ps.filter(function (x) { return x.vigencia > ref; })[0] || ps[ps.length - 1];
  return { vigencia: p.vigencia, ate: p.ate, dias: p.dias, por: p.por, em: p.em, atualizadoPor: p.por, atualizadoEm: p.em, periodos: ps };
}
/** O DP só enxerga a escala que foi liberada (a versão enviada); os demais veem a atual. */
function escalasParaUsuario_(u, ref) {
  const atual = escalasPorMatricula_(ref);
  if (!u || u.perfil !== 'DP') return atual;
  ref = ref || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const out = {};
  ler_('LiberacoesDP').forEach(function (l) {
    if (!l.assinatura) return;
    const ps = parse_(l.escala, null);
    out[l.matricula] = ps && ps.length ? escalaObj_(ps.map(function (p) { return { vigencia: p.vigencia, ate: p.ate || '', dias: JSON.stringify(p.dias || []), atualizadoPor: p.por, atualizadoEm: p.em }; }), ref) : (atual[l.matricula] || null);
  });
  return out;
}
function escalasPorMatricula_(ref) {
  const g = {}, out = {};
  ler_('Escalas').forEach(function (e) { (g[e.matricula] = g[e.matricula] || []).push(e); });
  ref = ref || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  Object.keys(g).forEach(function (m) { out[m] = escalaObj_(g[m], ref); });
  return out;
}

/* ---------------- carga inicial da tela ---------------- */
function carregar_(u) {
  const cfg = cfg_();
  const esc = escalasParaUsuario_(u);
  const todos = ler_('Colaboradores').filter(function (c) { return c.ativo !== 'N'; });
  const cols = todos.filter(function (c) { return podeVer_(u, c); }).map(function (c) {
    const e = esc[c.matricula];
    return {
      matricula: c.matricula, nome: c.nome, funcao: c.funcao, revenda: c.revenda, setor: c.setor,
      lotacao: c.lotacao, turno: c.turno, tipoMot: c.tipoMot, supervisor: c.supervisor, departamento: c.departamento,
      situacao: c.situacao, admissao: c.admissao, tele: c.teleatendimento === 'S',
      escala: e || null
    };
  });
  const vis = {}; cols.forEach(function (c) { vis[c.matricula] = true; });
  const comLink = {}; ler_('Links').forEach(function (l) { if (l.ativo === 'S' && vis[l.matricula]) comLink[l.matricula] = { token: l.token, criadoEm: l.criadoEm, criadoPor: l.criadoPor, acessos: +l.acessos || 0, ultimoAcesso: l.ultimoAcesso }; });
  cols.forEach(function (c) { c.link = comLink[c.matricula] || null; c.temLink = !!c.link; });
  const libs = {}; ler_('LiberacoesDP').forEach(function (l) { if (vis[l.matricula]) libs[l.matricula] = { assinatura: l.assinatura, por: l.liberadoPor, em: l.liberadoEm, visto: l.vistoAssinatura, vistoPor: l.vistoPor, vistoEm: l.vistoEm }; });
  cols.forEach(function (c) { c.lib = libs[c.matricula] || null; });
  const ferias = ler_('Ferias').filter(function (f) { return vis[f.matricula]; }).map(function (f) { return { id: f.id, matricula: f.matricula, inicio: f.inicio, fim: f.fim, obs: f.obs }; });
  const feriados = ler_('Feriados').map(function (f) { return { id: f.id, revenda: f.revenda, data: f.data, descricao: f.descricao, tipo: f.tipo, validacao: f.validacao, contaAlerta: f.contaAlerta || 'S', obs: f.obs, origem: f.origem }; });
  const desde = Utilities.formatDate(new Date(Date.now() - 120 * 864e5), TZ, 'yyyy-MM-dd');
  const ajustes = ler_('Ajustes').filter(function (a) { return vis[a.matricula] && a.data >= desde; }).map(function (a) { return { matricula: a.matricula, data: a.data, tipo: a.tipo, ent: a.ent, sai: a.sai, int: +a.int || 0 }; });
  const revsU = uniq_(cols.map(function (c) { return c.revenda; }));
  const qlp = ler_('QLP').filter(function (q) { return veTudo_(u) || revsU.indexOf(q.revenda) >= 0; }).map(qlpPublico_);
  const r = { usuario: publico_(u), cfg: cfg, colaboradores: cols, ferias: ferias, feriados: feriados, ajustes: ajustes, qlp: qlp, propostas: propostasDoUsuario_(u, vis) };
  if (u.perfil === 'ANALISTA') { const ids = {}; cols.forEach(function (c) { if (c.supervisor) ids[c.supervisor] = 1; }); r.supervisores = ler_('Usuarios').filter(function (x) { return ids[x.id]; }).map(function (x) { return { id: x.id, nome: x.nome, perfil: x.perfil, revendas: [] }; }); }
  if (veTudo_(u)) {
    r.sincFerias = parse_(PropertiesService.getScriptProperties().getProperty('FERIAS_SINC'), null);
    r.pendentes = ler_('Usuarios').filter(function (x) { return x.status === 'PENDENTE'; }).length;
    r.todasRevendas = uniq_(todos.map(function (c) { return c.revenda; }));
    r.todosSetores = uniq_(todos.map(function (c) { return c.setor; }));
    r.supervisores = ler_('Usuarios').filter(function (x) { return x.status === 'ATIVO'; })
      .map(function (x) { return { id: x.id, nome: x.nome, perfil: x.perfil, revendas: lista_(x.revendas) }; })
      .sort(function (a, b) { return a.nome.localeCompare(b.nome); });
  }
  return r;
}
