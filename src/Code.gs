/**
 * Escala 5x2 — sistema de escalas da Revalle.
 * Web app em Apps Script. A base de dados é uma Planilha Google criada automaticamente
 * no primeiro acesso (o ID fica em Propriedades do script: DB_ID).
 * Publicar como: Executar como "Eu" · Acesso "Qualquer pessoa".
 * O acesso ao sistema é por login e senha próprios, aprovados pelo administrador.
 */

const ABAS = {
  Config: ['chave', 'valor', 'descricao'],
  Usuarios: ['id', 'nome', 'login', 'telefone', 'senhaHash', 'salt', 'perfil', 'status', 'revendas', 'setores', 'criadoEm', 'aprovadoPor', 'aprovadoEm', 'ultimoAcesso', 'email'],
  Colaboradores: ['matricula', 'nome', 'funcao', 'revenda', 'setor', 'lotacao', 'turno', 'situacao', 'teleatendimento', 'ativo', 'atualizadoEm', 'tipoMot', 'supervisor', 'departamento', 'admissao'],
  Escalas: ['matricula', 'vigencia', 'dias', 'status', 'total', 'msgs', 'atualizadoPor', 'atualizadoEm'],
  Historico: ['quando', 'usuario', 'matricula', 'acao', 'detalhe']
};

const CFG_PADRAO = [
  ['EMPRESA', 'Revalle', 'Nome no cabeçalho dos PDFs'],
  ['LINK_SISTEMA', 'https://revalle-logistica.github.io/escala-5x2/', 'Link enviado no e-mail de aprovação'],
  ['TURNOS_ARMAZEM', 'Turno 1,Turno 2,Turno 3,Administrativo', 'Opções de turno do armazém (separadas por vírgula)'],
  ['TIPOS_MOTORISTA', 'Rota,Puxador', 'Opções de tipo de motorista (separadas por vírgula)'],
  ['PONTOS_APOIO', '{}', 'Pontos de apoio por revenda (editados na tela Cadastro)'],
  ['DATA_INICIO_5X2', '2026-12-15', 'Início da nova jornada (EC 141/2026)'],
  ['LIMITE_SEMANAL_TRANSICAO', '42', 'Horas semanais máximas na transição'],
  ['DIARIO_MAX_TRANSICAO', '10', 'Horas diárias máximas na transição (8h + até 2h distribuídas na semana)'],
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
  return t.setTitle('Escala 5x2 · Revalle').addMetaTag('viewport', 'width=device-width, initial-scale=1');
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
    ';var VISOES=' + JSON.stringify(VISOES) + ';var TURNOS_ORDEM=' + JSON.stringify(TURNOS_ORDEM) + ';\n' +
    [hmParaMin, minParaHm, calcDia, parametrosRegra, validarEscala, semanaModelo, normTxt, turnoTag, areaSetor, papelEntrega, ehSede, pendenciasCadastro, visaoColaborador, codigoMatricula].map(function (f) { return f.toString(); }).join('\n');
}

/** Rode uma vez no editor para criar a base e ver o link da planilha. */
function setup() { Logger.log('Base de dados: ' + ss_().getUrl()); }

/* ---------------- roteador ---------------- */
// rotas montadas na chamada (as funções ficam em outros arquivos .gs)
function rotas_() {
  return { PUBLICAS: { registrar: registrar_, login: login_ }, PRIVADAS: {
  carregar: { f: carregar_ },
  logout: { f: logout_ },
  trocarSenha: { f: trocarSenha_ },
  salvarEscala: { f: salvarEscala_ },
  salvarLote: { f: salvarLote_ },
  setTele: { f: setTele_ },
  exportPdf: { f: exportPdf_ },
  usuarios: { f: usuarios_, admin: true },
  aprovarUsuario: { f: aprovarUsuario_, admin: true },
  statusUsuario: { f: statusUsuario_, admin: true },
  resetSenha: { f: resetSenha_, admin: true },
  importar: { f: importar_, admin: true },
  classificar: { f: classificar_, admin: true },
  converterPlanilha: { f: converterPlanilha_, admin: true },
  salvarConfig: { f: salvarConfig_, admin: true }
  } };
}

function api(token, acao, dados) {
  try {
    dados = dados || {};
    const R = rotas_(), PUBLICAS = R.PUBLICAS, PRIVADAS = R.PRIVADAS;
    if (PUBLICAS[acao]) return { ok: true, data: PUBLICAS[acao](dados) };
    const u = usuarioDaSessao_(token);
    if (!u) return { ok: false, sessao: true, erro: 'Sua sessão expirou. Entre novamente.' };
    u._token = token;
    const a = PRIVADAS[acao];
    if (!a) throw new Error('Ação inválida.');
    if (a.admin && u.perfil !== 'ADMIN') throw new Error('Somente o administrador pode fazer isso.');
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
  if (id) { try { SS_CACHE = SpreadsheetApp.openById(id); prepararBase_(SS_CACHE); return SS_CACHE; } catch (e) { /* recria abaixo */ } }
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
function podeVer_(u, c) {
  if (u.perfil === 'ADMIN') return true;
  return !!c.supervisor && c.supervisor === u.id;
}
function parse_(s, def) { try { return s ? JSON.parse(s) : def; } catch (e) { return def; } }

/* ---------------- carga inicial da tela ---------------- */
function carregar_(u) {
  const cfg = cfg_();
  const esc = {};
  ler_('Escalas').forEach(function (e) { esc[e.matricula] = e; });
  const todos = ler_('Colaboradores').filter(function (c) { return c.ativo !== 'N'; });
  const cols = todos.filter(function (c) { return podeVer_(u, c); }).map(function (c) {
    const e = esc[c.matricula];
    return {
      matricula: c.matricula, nome: c.nome, funcao: c.funcao, revenda: c.revenda, setor: c.setor,
      lotacao: c.lotacao, turno: c.turno, tipoMot: c.tipoMot, supervisor: c.supervisor, departamento: c.departamento,
      situacao: c.situacao, tele: c.teleatendimento === 'S',
      escala: e ? { vigencia: e.vigencia, dias: parse_(e.dias, []), por: e.atualizadoPor, em: e.atualizadoEm } : null
    };
  });
  const r = { usuario: publico_(u), cfg: cfg, colaboradores: cols };
  if (u.perfil === 'ADMIN') {
    r.pendentes = ler_('Usuarios').filter(function (x) { return x.status === 'PENDENTE'; }).length;
    r.todasRevendas = uniq_(todos.map(function (c) { return c.revenda; }));
    r.todosSetores = uniq_(todos.map(function (c) { return c.setor; }));
    r.supervisores = ler_('Usuarios').filter(function (x) { return x.status === 'ATIVO'; })
      .map(function (x) { return { id: x.id, nome: x.nome, perfil: x.perfil, revendas: lista_(x.revendas) }; })
      .sort(function (a, b) { return a.nome.localeCompare(b.nome); });
  }
  return r;
}
