// GERADO por tools/build.js a partir de src/. Edite em src/ e rode o build.

// ===================== Code.gs =====================
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
  Ferias: ['id', 'matricula', 'inicio', 'fim', 'obs', 'criadoPor', 'criadoEm'],
  Feriados: ['id', 'revenda', 'data', 'descricao', 'criadoPor', 'criadoEm', 'tipo', 'validacao', 'contaAlerta', 'obs', 'origem'],
  Ajustes: ['matricula', 'data', 'tipo', 'ent', 'sai', 'int', 'por', 'em'],
  Links: ['token', 'matricula', 'ativo', 'criadoPor', 'criadoEm', 'acessos', 'ultimoAcesso'],
  Historico: ['quando', 'usuario', 'matricula', 'acao', 'detalhe']
};

const CFG_PADRAO = [
  ['EMPRESA', 'Revalle', 'Nome no cabeçalho dos PDFs'],
  ['LINK_SISTEMA', 'https://revalle-logistica.github.io/escala-5x2/', 'Link enviado no e-mail de aprovação'],
  ['TURNOS_ARMAZEM', 'Turno 1,Turno 2,Turno 3,Administrativo', 'Opções de turno do armazém (separadas por vírgula)'],
  ['TIPOS_MOTORISTA', 'Rota,Puxador', 'Opções de tipo de motorista (separadas por vírgula)'],
  ['PONTOS_APOIO', '{}', 'Pontos de apoio por revenda (editados na tela Cadastro)'],
  ['DEPARTAMENTOS', '{}', 'Departamentos do relatório do DP e a visão de cada um (editado em Regras)'],
  ['REVENDAS_SIGLAS', '{}', 'Sigla do departamento no DP e o nome da revenda (editado em Regras)'],
  ['FUNCOES_GRUPO', '{}', 'Cargos do DP agrupados para os filtros (editado em Regras)'],
  ['DATA_INICIO_5X2', '2026-12-15', 'Início da nova jornada (EC 141/2026)'],
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
    [hmParaMin, minParaHm, calcDia, minutosCfg, ehEntregaCampo, parametrosRegra, validarEscala, semanaModelo, normTxt, turnoTag, areaSetor, papelEntrega, ehSede, pendenciasCadastro, visaoColaborador, codigoMatricula, isoMaisDias, diaSemanaIso, segundaDaSemana, diasDoMes, feriadoConta, diaEfetivo, semanaEfetiva, avisosSemana, validarSemanaReal].map(function (f) { return f.toString(); }).join('\n');
}

/** Rode uma vez no editor para criar a base e ver o link da planilha. */
function setup() { Logger.log('Base de dados: ' + ss_().getUrl()); }

/* ---------------- roteador ---------------- */
// rotas montadas na chamada (as funções ficam em outros arquivos .gs)
function rotas_() {
  return { PUBLICAS: { registrar: registrar_, login: login_, minhaEscala: minhaEscala_ }, PRIVADAS: {
  gerarLink: { f: gerarLink_ },
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
  atualizarDoDP: { f: atualizarDoDP_, admin: true },
  classificar: { f: classificar_ },
  salvarPontos: { f: salvarPontos_ },
  removerColaboradores: { f: removerColaboradores_, admin: true },
  salvarFerias: { f: salvarFerias_ },
  removerFerias: { f: removerFerias_ },
  salvarFeriado: { f: salvarFeriado_, admin: true },
  importarFeriados: { f: importarFeriados_, admin: true },
  importarFerias: { f: importarFerias_, admin: true },
  salvarAjuste: { f: salvarAjuste_ },
  removerFeriado: { f: removerFeriado_, admin: true },
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
  const vis = {}; cols.forEach(function (c) { vis[c.matricula] = true; });
  const comLink = {}; ler_('Links').forEach(function (l) { if (l.ativo === 'S' && vis[l.matricula]) comLink[l.matricula] = { token: l.token, criadoEm: l.criadoEm, criadoPor: l.criadoPor, acessos: +l.acessos || 0, ultimoAcesso: l.ultimoAcesso }; });
  cols.forEach(function (c) { c.link = comLink[c.matricula] || null; c.temLink = !!c.link; });
  const ferias = ler_('Ferias').filter(function (f) { return vis[f.matricula]; }).map(function (f) { return { id: f.id, matricula: f.matricula, inicio: f.inicio, fim: f.fim, obs: f.obs }; });
  const feriados = ler_('Feriados').map(function (f) { return { id: f.id, revenda: f.revenda, data: f.data, descricao: f.descricao, tipo: f.tipo, validacao: f.validacao, contaAlerta: f.contaAlerta || 'S', obs: f.obs, origem: f.origem }; });
  const desde = Utilities.formatDate(new Date(Date.now() - 120 * 864e5), TZ, 'yyyy-MM-dd');
  const ajustes = ler_('Ajustes').filter(function (a) { return vis[a.matricula] && a.data >= desde; }).map(function (a) { return { matricula: a.matricula, data: a.data, tipo: a.tipo, ent: a.ent, sai: a.sai, int: +a.int || 0 }; });
  const r = { usuario: publico_(u), cfg: cfg, colaboradores: cols, ferias: ferias, feriados: feriados, ajustes: ajustes };
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


// ===================== Auth.gs =====================
/**
 * Acesso por login e senha próprios (sem conta Google).
 * - Qualquer pessoa cria o cadastro; ele fica PENDENTE até o administrador aprovar.
 * - O primeiro cadastro do sistema vira ADMINISTRADOR já aprovado.
 * - Senha guardada só como hash (SHA-256 com sal, repetido), nunca em texto.
 * - Sessão de 6h guardada no cache do script.
 */
const SESSAO_SEG = 6 * 60 * 60;

function hash_(senha, salt) {
  let v = salt + '|' + senha;
  for (let i = 0; i < 300; i++) {
    v = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, v + salt, Utilities.Charset.UTF_8));
  }
  return v;
}
function novoSalt_() { return Utilities.getUuid().replace(/-/g, ''); }
function normLogin_(l) { return String(l || '').trim().toLowerCase(); }
function publico_(u) {
  return { id: u.id, nome: u.nome, login: u.login, email: u.email, perfil: u.perfil, status: u.status, revendas: lista_(u.revendas), setores: lista_(u.setores), telefone: u.telefone, criadoEm: u.criadoEm, ultimoAcesso: u.ultimoAcesso };
}

function registrar_(d) {
  const nome = String(d.nome || '').trim(), senha = String(d.senha || '');
  const email = normLogin_(d.email || d.login), login = email; // o login é sempre o e-mail
  if (nome.length < 3) throw new Error('Informe seu nome completo.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido: ele será o seu login.');
  if (senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  return comLock_(function () {
    const us = ler_('Usuarios');
    if (us.some(function (u) { return u.login === login; })) throw new Error('Esse e-mail já tem cadastro. Use Entrar ou peça uma nova senha ao administrador.');
    const primeiro = us.length === 0, salt = novoSalt_();
    const u = {
      id: Utilities.getUuid(), nome: nome, login: login, telefone: String(d.telefone || '').trim(), email: email,
      senhaHash: hash_(senha, salt), salt: salt,
      perfil: primeiro ? 'ADMIN' : 'SUPERVISOR', status: primeiro ? 'ATIVO' : 'PENDENTE',
      revendas: primeiro ? '*' : '', setores: primeiro ? '*' : '', criadoEm: agora_(),
      aprovadoPor: primeiro ? 'sistema' : '', aprovadoEm: primeiro ? agora_() : '', ultimoAcesso: ''
    };
    gravarLinha_('Usuarios', u);
    log_(u, '', 'cadastro', u.perfil);
    return { status: u.status, perfil: u.perfil, primeiro: primeiro };
  });
}

function login_(d) {
  const login = normLogin_(d.login), senha = String(d.senha || '');
  const cache = CacheService.getScriptCache(), kf = 'falha_' + login;
  const falhas = +(cache.get(kf) || 0);
  if (falhas >= 6) throw new Error('Muitas tentativas. Aguarde 15 minutos e tente de novo.');
  const u = ler_('Usuarios').filter(function (x) { return x.login === login; })[0];
  if (!u || hash_(senha, u.salt) !== u.senhaHash) {
    cache.put(kf, String(falhas + 1), 900);
    throw new Error('E-mail ou senha incorretos.');
  }
  cache.remove(kf);
  if (u.status === 'PENDENTE') throw new Error('Seu cadastro está aguardando a aprovação do administrador.');
  if (u.status !== 'ATIVO') throw new Error('Seu acesso está bloqueado. Fale com o administrador.');
  const token = Utilities.getUuid() + novoSalt_();
  cache.put('s_' + token, u.id, SESSAO_SEG);
  u.ultimoAcesso = agora_();
  gravarLinha_('Usuarios', u);
  return { token: token, usuario: publico_(u) };
}

function usuarioDaSessao_(token) {
  if (!token) return null;
  const cache = CacheService.getScriptCache();
  const id = cache.get('s_' + token);
  if (!id) return null;
  const u = ler_('Usuarios').filter(function (x) { return x.id === id; })[0];
  if (!u || u.status !== 'ATIVO') { cache.remove('s_' + token); return null; }
  cache.put('s_' + token, id, SESSAO_SEG); // renova a cada uso
  return u;
}

function logout_(u) { CacheService.getScriptCache().remove('s_' + u._token); return true; }

function trocarSenha_(u, d) {
  if (hash_(String(d.atual || ''), u.salt) !== u.senhaHash) throw new Error('A senha atual não confere.');
  if (String(d.nova || '').length < 6) throw new Error('A nova senha precisa ter pelo menos 6 caracteres.');
  u.salt = novoSalt_();
  u.senhaHash = hash_(String(d.nova), u.salt);
  gravarLinha_('Usuarios', u);
  log_(u, '', 'trocou senha', '');
  return true;
}

/* ---------------- administração de usuários ---------------- */
function usuarios_() {
  const ordem = { PENDENTE: 0, ATIVO: 1, BLOQUEADO: 2 };
  return ler_('Usuarios').map(publico_).sort(function (a, b) { return (ordem[a.status] - ordem[b.status]) || a.nome.localeCompare(b.nome); });
}
function achaUsuario_(id) {
  const u = ler_('Usuarios').filter(function (x) { return x.id === id; })[0];
  if (!u) throw new Error('Usuário não encontrado.');
  return u;
}
function aprovarUsuario_(adm, d) {
  return comLock_(function () {
    const u = achaUsuario_(d.id);
    const perfil = d.perfil === 'ADMIN' ? 'ADMIN' : 'SUPERVISOR';
    const rv = (d.revendas || []).map(String);
    if (perfil === 'SUPERVISOR' && !rv.length) throw new Error('Escolha ao menos uma revenda para o supervisor.');
    u.perfil = perfil;
    u.revendas = perfil === 'ADMIN' ? '*' : rv.join(',');
    u.setores = '*';
    const novo = u.status === 'PENDENTE';
    if (novo) { u.status = 'ATIVO'; u.aprovadoPor = adm.login; u.aprovadoEm = agora_(); }
    gravarLinha_('Usuarios', u);
    if (novo) u._email = avisarAprovacao_(u, adm);
    log_(adm, '', 'aprovou/editou usuário', u.login + ' · ' + u.perfil + ' · ' + u.revendas + ' · ' + u.setores);
    const r = publico_(u);
    r.emailEnviado = u._email || '';
    return r;
  });
}
/** E-mail ao supervisor quando o acesso é aprovado. Retorna o endereço usado ou '' se não enviou. */
function avisarAprovacao_(u, adm) {
  if (!u.email) return '';
  const cfg = cfg_(), link = cfg.LINK_SISTEMA, h = h_;
  const lst = s => { const a = lista_(s); return a.indexOf('*') >= 0 ? 'todas' : a.join(', '); };
  const html = '<div style="font-family:Arial,sans-serif;max-width:520px;color:#0c1a33">' +
    '<div style="background:#0b2a6b;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0"><b style="font-size:18px">Escala 5x2 · ' + h(cfg.EMPRESA) + '</b></div>' +
    '<div style="border:1px solid #dbe2ee;border-top:0;border-radius:0 0 12px 12px;padding:20px">' +
    '<p>Olá, <b>' + h(u.nome.split(' ')[0]) + '</b>!</p>' +
    '<p>Seu acesso ao sistema de escalas 5x2 foi <b style="color:#0f7b4a">aprovado</b>' + (adm && adm.nome ? ' por ' + h(adm.nome) : '') + '.</p>' +
    '<p style="background:#eef2f9;border-radius:8px;padding:10px 12px;font-size:14px">Login: <b>' + h(u.login) + '</b><br>' +
    (u.perfil === 'ADMIN' ? 'Perfil: <b>Administrador</b>' : 'Revenda: <b>' + h(lst(u.revendas)) + '</b><br>Você vai ver os colaboradores vinculados a você.') + '</p>' +
    '<p style="text-align:center;margin:22px 0"><a href="' + h(link) + '" style="background:#1446c8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">Abrir a Escala 5x2</a></p>' +
    '<p style="font-size:12px;color:#44526b">Use a senha que você criou no cadastro. Se esqueceu, peça uma nova ao administrador.</p></div></div>';
  try {
    MailApp.sendEmail({ to: u.email, subject: 'Seu acesso à Escala 5x2 foi aprovado', htmlBody: html, name: 'Escala 5x2 · ' + cfg.EMPRESA });
    log_(adm, '', 'e-mail de aprovação', u.email);
    return u.email;
  } catch (e) {
    log_(adm, '', 'falha no e-mail de aprovação', u.email + ' · ' + e.message);
    return '';
  }
}
function statusUsuario_(adm, d) {
  if (d.id === adm.id) throw new Error('Você não pode bloquear o próprio acesso.');
  const u = achaUsuario_(d.id);
  if (['ATIVO', 'BLOQUEADO'].indexOf(d.status) < 0) throw new Error('Status inválido.');
  u.status = d.status;
  gravarLinha_('Usuarios', u);
  log_(adm, '', d.status === 'BLOQUEADO' ? 'bloqueou usuário' : 'reativou usuário', u.login);
  return publico_(u);
}
function resetSenha_(adm, d) {
  const u = achaUsuario_(d.id);
  const temp = String(Math.floor(100000 + Math.random() * 900000));
  u.salt = novoSalt_();
  u.senhaHash = hash_(temp, u.salt);
  gravarLinha_('Usuarios', u);
  log_(adm, '', 'redefiniu senha', u.login);
  return { login: u.login, senhaTemporaria: temp };
}


// ===================== Escalas.gs =====================
/**
 * Colaboradores (importação da planilha do DP) e escalas.
 */

function achaColab_(u, mat) {
  const c = ler_('Colaboradores').filter(function (x) { return x.matricula === String(mat); })[0];
  if (!c || c.ativo === 'N') throw new Error('Colaborador ' + mat + ' não encontrado.');
  if (!podeVer_(u, c)) throw new Error('Você não tem acesso a este colaborador.');
  return c;
}
function limpaDias_(dias) {
  if (!Array.isArray(dias) || dias.length !== 7) throw new Error('Escala inválida.');
  return dias.map(function (d) {
    return d && d.tipo === 'T'
      ? { tipo: 'T', ent: String(d.ent || ''), sai: String(d.sai || ''), int: Math.max(0, parseInt(d.int, 10) || 0) }
      : { tipo: 'F' };
  });
}
function vigenciaOk_(v) {
  v = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Data de vigência inválida.');
  return v;
}

/** Grava (ou recusa) uma escala já validada. Retorna o resultado da validação. */
function gravaEscala_(u, c, esc, cfg, mapa) {
  const val = validarEscala(esc, { tele: c.teleatendimento === 'S', cfg: cfg, entrega: ehEntregaCampo(c) });
  if (val.status === 'ERRO' && String(cfg.BLOQUEAR_ERRO).toUpperCase() === 'S') return { gravou: false, val: val };
  const atual = mapa[c.matricula] || {};
  const o = {
    _row: atual._row, matricula: c.matricula, vigencia: esc.vigencia, dias: JSON.stringify(esc.dias),
    status: val.status, total: val.total, msgs: JSON.stringify(val.msgs), atualizadoPor: u.nome, atualizadoEm: agora_()
  };
  mapa[c.matricula] = o;
  return { gravou: true, val: val, linha: o };
}

function salvarEscala_(u, d) {
  return comLock_(function () {
    const c = achaColab_(u, d.matricula), cfg = cfg_();
    const esc = { vigencia: vigenciaOk_(d.vigencia), dias: limpaDias_(d.dias) };
    const mapa = {};
    ler_('Escalas').forEach(function (e) { mapa[e.matricula] = e; });
    const r = gravaEscala_(u, c, esc, cfg, mapa);
    if (!r.gravou) {
      const e = new Error('A escala não foi salva porque tem erro legal: ' + r.val.msgs.filter(function (m) { return m.nivel === 'erro'; }).map(function (m) { return m.texto; }).join(' '));
      throw e;
    }
    gravarLinha_('Escalas', r.linha);
    log_(u, c.matricula, 'salvou escala', esc.vigencia + ' · ' + r.val.status + ' · ' + minParaHm(r.val.total));
    return { escala: { vigencia: esc.vigencia, dias: esc.dias, por: u.nome, em: r.linha.atualizadoEm }, val: r.val };
  });
}

/** Aplica um mesmo horário a vários colaboradores. d = {matriculas, vigencia, folga2, ent, sai, int} */
function salvarLote_(u, d) {
  const mats = (d.matriculas || []).map(String);
  if (!mats.length) throw new Error('Selecione ao menos um colaborador.');
  return comLock_(function () {
    const cfg = cfg_(), vig = vigenciaOk_(d.vigencia);
    const dias = limpaDias_(semanaModelo(+d.folga2, d.ent, d.sai, d.int));
    const cols = {};
    ler_('Colaboradores').forEach(function (c) { cols[c.matricula] = c; });
    const lista = ler_('Escalas'), mapa = {};
    lista.forEach(function (e) { mapa[e.matricula] = e; });
    const res = { salvos: 0, falhas: [] };
    mats.forEach(function (m) {
      const c = cols[m];
      if (!c || c.ativo === 'N' || !podeVer_(u, c)) { res.falhas.push({ matricula: m, nome: c ? c.nome : m, motivo: 'Sem acesso ou inativo.' }); return; }
      const r = gravaEscala_(u, c, { vigencia: vig, dias: dias }, cfg, mapa);
      if (r.gravou) res.salvos++;
      else res.falhas.push({ matricula: m, nome: c.nome, motivo: r.val.msgs.filter(function (x) { return x.nivel === 'erro'; }).map(function (x) { return x.texto; }).join(' ') });
    });
    gravarTudo_('Escalas', Object.keys(mapa).map(function (k) { return mapa[k]; }));
    log_(u, '', 'escala em lote', res.salvos + ' salvos · ' + res.falhas.length + ' não salvos · folga ' + DIAS_CURTO[+d.folga2] + ' ' + d.ent + '-' + d.sai);
    return res;
  });
}

/** Marca/desmarca o colaborador como teleatendimento (6h/dia). */
function setTele_(u, d) {
  return comLock_(function () {
    const c = achaColab_(u, d.matricula);
    c.teleatendimento = d.valor ? 'S' : 'N';
    gravarLinha_('Colaboradores', c);
    log_(u, c.matricula, d.valor ? 'marcou teleatendimento' : 'desmarcou teleatendimento', '');
    return true;
  });
}

/**
 * Importa o relatório do DP já lido no navegador.
 * d.rows = [{matricula, nome, funcao, revenda, setor, departamento, situacao, admissao}]
 * Só INCLUI colaboradores novos: quem já foi importado antes não é alterado (nem quem foi removido).
 * A exclusão é manual, na tela Cadastro.
 */
function importar_(u, d) {
  const rows = d.rows || [];
  if (!rows.length) throw new Error('Nenhum colaborador no arquivo.');
  return comLock_(function () {
    const atual = ler_('Colaboradores'), mapa = {};
    atual.forEach(function (c) { mapa[c.matricula] = c; });
    const grupos = uniq_(rows.map(function (r) { return String(r.revenda || '').trim() + '|' + areaSetor(r.setor); }));
    const vistos = {}, res = { novos: 0, jaExistiam: 0, desligados: 0 };
    const quando = agora_();
    rows.forEach(function (r) {
      const m = String(r.matricula || '').trim();
      if (!m || !String(r.nome || '').trim() || vistos[m]) return;
      vistos[m] = true;
      if (mapa[m]) { res.jaExistiam++; return; } // já importado antes: não altera (exclusão é manual)
      if (/demit|deslig|rescis/i.test(String(r.situacao || ''))) { res.desligados++; return; }
      mapa[m] = {
        matricula: m, nome: String(r.nome).trim(), funcao: String(r.funcao || '').trim(), revenda: String(r.revenda || '').trim(),
        setor: String(r.setor || '').trim(), departamento: String(r.departamento || '').trim(), admissao: String(r.admissao || '').trim(),
        situacao: String(r.situacao || '').trim(), lotacao: '', turno: '', tipoMot: '', supervisor: '', teleatendimento: 'N', ativo: 'S', atualizadoEm: quando
      };
      res.novos++;
    });
    const tudo = Object.keys(mapa).map(function (k) { return mapa[k]; })
      .sort(function (a, b) { return (a.revenda + a.setor + a.nome).localeCompare(b.revenda + b.setor + b.nome); });
    gravarTudo_('Colaboradores', tudo);
    log_(u, '', 'importou relatório do DP', grupos.join(', ') + ' · ' + JSON.stringify(res));
    res.revendas = uniq_(rows.map(function (r) { return r.revenda; }));
    return res;
  });
}

/** Remove (inativa) colaboradores manualmente. A escala e o histórico ficam guardados. */
function removerColaboradores_(u, d) {
  const mats = (d.matriculas || []).map(String);
  if (!mats.length) throw new Error('Selecione ao menos um colaborador.');
  return comLock_(function () {
    const todos = ler_('Colaboradores'), quando = agora_();
    let n = 0;
    todos.forEach(function (c) { if (mats.indexOf(c.matricula) >= 0 && c.ativo !== 'N') { c.ativo = 'N'; c.atualizadoEm = quando; n++; } });
    gravarTudo_('Colaboradores', todos);
    log_(u, mats.length === 1 ? mats[0] : '', 'removeu colaboradores', n + ': ' + mats.join(', '));
    return { removidos: n };
  });
}

/* ---------------- férias e feriados ---------------- */
function dataOk_(v, nome) { v = String(v || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Data inválida: ' + nome + '.'); return v; }
function salvarFerias_(u, d) {
  const c = achaColab_(u, d.matricula), ini = dataOk_(d.inicio, 'início'), fim = dataOk_(d.fim, 'fim');
  if (fim < ini) throw new Error('O fim das férias é antes do início.');
  return comLock_(function () {
    const choque = ler_('Ferias').filter(function (f) { return f.matricula === c.matricula && f.inicio <= fim && ini <= f.fim; })[0];
    if (choque) throw new Error('Já existe férias nesse período (' + dataBr_(choque.inicio) + ' a ' + dataBr_(choque.fim) + ').');
    const f = { id: Utilities.getUuid(), matricula: c.matricula, inicio: ini, fim: fim, obs: String(d.obs || '').trim().slice(0, 120), criadoPor: u.nome, criadoEm: agora_() };
    gravarLinha_('Ferias', f);
    log_(u, c.matricula, 'cadastrou férias', ini + ' a ' + fim);
    return { id: f.id, matricula: f.matricula, inicio: ini, fim: fim, obs: f.obs };
  });
}
function removerFerias_(u, d) {
  return comLock_(function () {
    const lst = ler_('Ferias'), f = lst.filter(function (x) { return x.id === d.id; })[0];
    if (!f) throw new Error('Férias não encontradas.');
    achaColab_(u, f.matricula);
    gravarTudo_('Ferias', lst.filter(function (x) { return x.id !== d.id; }));
    log_(u, f.matricula, 'removeu férias', f.inicio + ' a ' + f.fim);
    return true;
  });
}
/** Importa a planilha de programação de férias do DP: inclui os períodos novos, ignora os já cadastrados e avisa os que se sobrepõem. */
function importarFerias_(u, d) {
  const itens = d.itens || [];
  if (!itens.length) throw new Error('Nenhum período de férias com data na planilha.');
  const cols = {}; ler_('Colaboradores').forEach(function (c) { if (c.ativo !== 'N') cols[c.matricula] = c; });
  return comLock_(function () {
    const lst = ler_('Ferias'), res = { novos: 0, iguais: 0, conflitos: [] }, quando = agora_();
    itens.forEach(function (it) {
      const c = cols[String(it.matricula)];
      if (!c) { res.conflitos.push(it.matricula + ': colaborador não encontrado'); return; }
      const ini = dataOk_(it.inicio, 'início'), fim = dataOk_(it.fim, 'fim');
      if (fim < ini) { res.conflitos.push(c.nome + ': fim antes do início'); return; }
      if (lst.some(function (f) { return f.matricula === c.matricula && f.inicio === ini && f.fim === fim; })) { res.iguais++; return; }
      const choque = lst.filter(function (f) { return f.matricula === c.matricula && f.inicio <= fim && ini <= f.fim; })[0];
      if (choque) { res.conflitos.push(c.nome + ': choca com ' + dataBr_(choque.inicio) + ' a ' + dataBr_(choque.fim)); return; }
      lst.push({ id: Utilities.getUuid(), matricula: c.matricula, inicio: ini, fim: fim, obs: String(it.obs || '').trim().slice(0, 120), criadoPor: u.nome, criadoEm: quando });
      res.novos++;
    });
    if (res.novos) gravarTudo_('Ferias', lst);
    log_(u, '', 'importou férias', JSON.stringify({ novos: res.novos, iguais: res.iguais, conflitos: res.conflitos.length }));
    return res;
  });
}
function feriadoLimpo_(d) {
  const data = dataOk_(d.data, 'feriado'), desc = String(d.descricao || '').trim().slice(0, 80);
  if (!desc) throw new Error('Informe o nome do feriado de ' + dataBr_(data) + '.');
  return { data: data, descricao: desc, tipo: String(d.tipo || '').trim().slice(0, 20), validacao: String(d.validacao || '').trim().slice(0, 40),
    contaAlerta: /^n/i.test(String(d.contaAlerta || 'S').trim()) ? 'N' : 'S', obs: String(d.obs || '').trim().slice(0, 120) };
}
function salvarFeriado_(u, d) {
  const rev = String(d.revenda || '').trim(), f0 = feriadoLimpo_(d);
  if (!rev) throw new Error('Informe a unidade.');
  return comLock_(function () {
    if (ler_('Feriados').some(function (f) { return f.revenda === rev && f.data === f0.data; })) throw new Error('Já existe feriado nessa data para ' + rev + '.');
    const f = Object.assign({ id: Utilities.getUuid(), revenda: rev, criadoPor: u.nome, criadoEm: agora_(), origem: 'manual' }, f0);
    gravarLinha_('Feriados', f);
    log_(u, '', 'cadastrou feriado', rev + ' ' + f.data + ' ' + f.descricao);
    return { id: f.id, revenda: rev, data: f.data, descricao: f.descricao, tipo: f.tipo, validacao: f.validacao, contaAlerta: f.contaAlerta, obs: f.obs, origem: f.origem };
  });
}
/** Importa a planilha de feriados de uma unidade: inclui datas novas e atualiza as que já existem. */
function importarFeriados_(u, d) {
  const rev = String(d.revenda || '').trim(), itens = (d.itens || []).map(feriadoLimpo_);
  if (!rev) throw new Error('Informe a unidade.');
  if (!itens.length) throw new Error('Nenhum feriado na planilha.');
  return comLock_(function () {
    const lst = ler_('Feriados'), res = { novos: 0, atualizados: 0 }, quando = agora_();
    itens.forEach(function (it) {
      const f = lst.filter(function (x) { return x.revenda === rev && x.data === it.data; })[0];
      if (f) { Object.assign(f, it); f.origem = 'importado'; res.atualizados++; }
      else { lst.push(Object.assign({ id: Utilities.getUuid(), revenda: rev, criadoPor: u.nome, criadoEm: quando, origem: 'importado' }, it)); res.novos++; }
    });
    gravarTudo_('Feriados', lst);
    log_(u, '', 'importou feriados', rev + ' · ' + JSON.stringify(res));
    return res;
  });
}
/** Troca só um dia do colaborador (trabalho/folga/horário). tipo vazio = volta ao padrão. */
function salvarAjuste_(u, d) {
  const c = achaColab_(u, d.matricula), data = dataOk_(d.data, 'dia'), tipo = String(d.tipo || '');
  if (tipo && tipo !== 'T' && tipo !== 'F') throw new Error('Tipo de dia inválido.');
  if (tipo === 'T' && (hmParaMin(d.ent) == null || hmParaMin(d.sai) == null)) throw new Error('Informe entrada e saída.');
  return comLock_(function () {
    const lst = ler_('Ajustes').filter(function (a) { return !(a.matricula === c.matricula && a.data === data); });
    let novo = null;
    if (tipo) {
      novo = { matricula: c.matricula, data: data, tipo: tipo, ent: tipo === 'T' ? d.ent : '', sai: tipo === 'T' ? d.sai : '', int: tipo === 'T' ? Math.max(0, parseInt(d.int, 10) || 0) : '', por: u.nome, em: agora_() };
      lst.push(novo);
    }
    gravarTudo_('Ajustes', lst);
    log_(u, c.matricula, tipo ? 'ajustou dia' : 'voltou dia ao padrão', data + (tipo ? ' · ' + tipo + (tipo === 'T' ? ' ' + d.ent + '-' + d.sai : '') : ''));
    return novo ? { matricula: novo.matricula, data: data, tipo: tipo, ent: novo.ent, sai: novo.sai, int: +novo.int || 0 } : null;
  });
}
function removerFeriado_(u, d) {
  return comLock_(function () {
    const lst = ler_('Feriados'), f = lst.filter(function (x) { return x.id === d.id; })[0];
    if (!f) throw new Error('Feriado não encontrado.');
    gravarTudo_('Feriados', lst.filter(function (x) { return x.id !== d.id; }));
    log_(u, '', 'removeu feriado', f.revenda + ' ' + f.data);
    return true;
  });
}

/** Preenche os campos de cadastro em lote. d = {matriculas:[...], campos:{turno?, lotacao?, tipoMot?, supervisor?}} */
function classificar_(u, d) {
  const mats = (d.matriculas || []).map(String), campos = d.campos || {};
  const ok = ['turno', 'lotacao', 'tipoMot', 'supervisor'].filter(function (k) { return Object.prototype.hasOwnProperty.call(campos, k); });
  if (!mats.length || !ok.length) throw new Error('Nada para salvar.');
  const adm = u.perfil === 'ADMIN';
  if (!adm && ok.indexOf('supervisor') >= 0) throw new Error('Só o administrador vincula o supervisor ao colaborador.');
  if (campos.supervisor) {
    const s = ler_('Usuarios').filter(function (x) { return x.id === campos.supervisor && x.status === 'ATIVO'; })[0];
    if (!s) throw new Error('Supervisor não encontrado ou sem acesso ativo.');
  }
  return comLock_(function () {
    const todos = ler_('Colaboradores');
    let n = 0;
    todos.forEach(function (c) {
      if (mats.indexOf(c.matricula) < 0 || !podeVer_(u, c)) return;
      ok.forEach(function (k) { c[k] = String(campos[k] == null ? '' : campos[k]).trim(); });
      n++;
    });
    gravarTudo_('Colaboradores', todos);
    log_(u, mats.length === 1 ? mats[0] : '', 'cadastro em lote', n + ' colaboradores · ' + JSON.stringify(campos));
    return { atualizados: n };
  });
}

/** Lista de pontos de apoio de uma revenda. Admin: qualquer revenda; supervisor: revendas dos seus colaboradores. */
function salvarPontos_(u, d) {
  const rev = String(d.revenda || '').trim(), lista = (d.lista || []).map(function (x) { return String(x).trim().slice(0, 40); }).filter(String);
  if (!rev) throw new Error('Informe a revenda.');
  if (u.perfil !== 'ADMIN' && !ler_('Colaboradores').some(function (c) { return c.revenda === rev && c.ativo !== 'N' && podeVer_(u, c); }))
    throw new Error('Você não tem colaboradores nesta revenda.');
  return comLock_(function () {
    const l = ler_('Config').filter(function (x) { return x.chave === 'PONTOS_APOIO'; })[0];
    let o = {}; try { o = JSON.parse((l && l.valor) || '{}'); } catch (e) { o = {}; }
    o[rev] = lista;
    if (l) { l.valor = JSON.stringify(o); gravarLinha_('Config', l); }
    log_(u, '', 'pontos de apoio', rev + ': ' + lista.join(', '));
    return o;
  });
}
/**
 * Aplica as mudanças do DP que o admin marcou na prévia da importação (cargo, departamento, situação, demissão).
 * Supervisor e escala ficam. Se a pessoa mudar de área (ex.: Armazém -> Entrega), turno/ponto/rota voltam a ficar pendentes.
 */
function atualizarDoDP_(u, d) {
  const itens = d.itens || [];
  if (!itens.length) throw new Error('Nenhuma mudança marcada.');
  return comLock_(function () {
    const todos = ler_('Colaboradores'), mapa = {}, res = { atualizados: 0, desligados: 0, mudouArea: 0 }, quando = agora_();
    todos.forEach(function (c) { mapa[c.matricula] = c; });
    itens.forEach(function (it) {
      const c = mapa[String(it.matricula)];
      if (!c) return;
      if (it.desligar) { c.ativo = 'N'; c.situacao = String(it.situacao || c.situacao); c.atualizadoEm = quando; res.desligados++; log_(u, c.matricula, 'demitido no DP', c.situacao); return; }
      const antes = c.funcao + ' / ' + c.departamento;
      if (it.setor && areaSetor(it.setor) !== areaSetor(c.setor)) { c.turno = ''; c.lotacao = ''; c.tipoMot = ''; res.mudouArea++; }
      ['funcao', 'departamento', 'setor', 'situacao'].forEach(function (k) { if (it[k] != null && String(it[k]).trim()) c[k] = String(it[k]).trim(); });
      c.atualizadoEm = quando; res.atualizados++;
      log_(u, c.matricula, 'mudança do DP', antes + ' -> ' + c.funcao + ' / ' + c.departamento);
    });
    gravarTudo_('Colaboradores', todos);
    return res;
  });
}
/**
 * Converte um .xls/.xlsx que o navegador não conseguiu ler (o relatório do sistema de folha sai num .xls
 * que alguns leitores não abrem). Usa o conversor do Google Drive e devolve as células como texto.
 * Requer o serviço avançado "Drive API" (v3) ativado no projeto.
 */
function converterPlanilha_(u, d) {
  if (!d.base64) throw new Error('Arquivo vazio.');
  const blob = Utilities.newBlob(Utilities.base64Decode(d.base64), d.tipo || 'application/vnd.ms-excel', d.nome || 'planilha.xls');
  const f = Drive.Files.create({ name: 'tmp-escala-5x2-' + Date.now(), mimeType: 'application/vnd.google-apps.spreadsheet' }, blob);
  try {
    const ss = SpreadsheetApp.openById(f.id);
    return ss.getSheets().map(function (sh) { return { nome: sh.getName(), valores: sh.getDataRange().getDisplayValues() }; });
  } finally {
    try { Drive.Files.remove(f.id); } catch (e) { DriveApp.getFileById(f.id).setTrashed(true); }
  }
}

function salvarConfig_(u, d) {
  return comLock_(function () {
    const linhas = ler_('Config');
    Object.keys(d || {}).forEach(function (k) {
      const l = linhas.filter(function (x) { return x.chave === k; })[0];
      if (!l) return;
      l.valor = String(d[k]).trim();
      gravarLinha_('Config', l);
    });
    log_(u, '', 'alterou regras', JSON.stringify(d));
    return cfg_();
  });
}

/* ---------------- link individual do colaborador (só leitura) ---------------- */
/** Supervisor do colaborador ou admin: devolve o link ativo (ou cria). novo=true cancela o anterior e gera outro. */
function gerarLink_(u, d) {
  const c = achaColab_(u, d.matricula), cfg = cfg_();
  return comLock_(function () {
    const lst = ler_('Links'), quando = agora_();
    let at = lst.filter(function (l) { return l.matricula === c.matricula && l.ativo === 'S'; });
    if (d.cancelar) {
      at.forEach(function (l) { l.ativo = 'N'; gravarLinha_('Links', l); });
      log_(u, c.matricula, 'cancelou link do colaborador', '');
      return { cancelado: true };
    }
    if (d.novo) { at.forEach(function (l) { l.ativo = 'N'; gravarLinha_('Links', l); }); at = []; log_(u, c.matricula, 'cancelou link do colaborador', ''); }
    let l = at[0];
    if (!l) {
      l = { token: (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''), matricula: c.matricula, ativo: 'S', criadoPor: u.nome, criadoEm: quando, acessos: '0', ultimoAcesso: '' };
      gravarLinha_('Links', l);
      log_(u, c.matricula, 'gerou link do colaborador', '');
    }
    const base = String(cfg.LINK_SISTEMA || '').replace(/[?#].*$/, '');
    return { token: l.token, link: base + (base.indexOf('?') < 0 ? '?' : '&') + 'e=' + l.token, criadoEm: l.criadoEm, criadoPor: l.criadoPor, acessos: +l.acessos || 0, ultimoAcesso: l.ultimoAcesso };
  });
}
/** Público: a escala de um colaborador a partir do link (sem login, só leitura). */
function minhaEscala_(d) {
  const tk = String(d.token || '');
  if (!/^[0-9a-f]{64}$/.test(tk)) throw new Error('Link inválido.');
  const l = ler_('Links').filter(function (x) { return x.token === tk; })[0];
  if (!l || l.ativo !== 'S') throw new Error('Este link não está mais ativo. Peça um novo ao seu supervisor.');
  const c = ler_('Colaboradores').filter(function (x) { return x.matricula === l.matricula; })[0];
  if (!c || c.ativo === 'N') throw new Error('Este link não está mais ativo. Peça um novo ao seu supervisor.');
  try { l.acessos = String((+l.acessos || 0) + 1); l.ultimoAcesso = agora_(); gravarLinha_('Links', l); } catch (e) { /* contador é só informativo */ }
  const e = ler_('Escalas').filter(function (x) { return x.matricula === c.matricula; })[0];
  const desde = Utilities.formatDate(new Date(Date.now() - 70 * 864e5), TZ, 'yyyy-MM-dd');
  return {
    nome: c.nome, funcao: c.funcao, revenda: c.revenda, empresa: cfg_().EMPRESA,
    escala: e ? { vigencia: e.vigencia, dias: parse_(e.dias, []), em: e.atualizadoEm } : null,
    ferias: ler_('Ferias').filter(function (f) { return f.matricula === c.matricula; }).map(function (f) { return { inicio: f.inicio, fim: f.fim }; }),
    feriados: ler_('Feriados').filter(function (f) { return f.revenda === c.revenda; }).map(function (f) { return { data: f.data, descricao: f.descricao, tipo: f.tipo, contaAlerta: f.contaAlerta }; }),
    ajustes: ler_('Ajustes').filter(function (a) { return a.matricula === c.matricula && a.data >= desde; }).map(function (a) { return { data: a.data, tipo: a.tipo, ent: a.ent, sai: a.sai, int: a.int }; })
  };
}


// ===================== Export.gs =====================
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
  '.qm th,.qm td{font-size:6.5px;padding:2px 1px}.qm td.n{font-size:7px;min-width:120px}.q td.n{text-align:left}.q td.f{background:#fdf0d8;color:#9a5800;font-weight:bold}.q tr.g td{background:#e3eafb;color:#0b2a6b;font-weight:bold;text-align:left;font-size:9px}';

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
    const esc = { vigencia: e.vigencia, dias: parse_(e.dias, []) };
    const val = validarEscala(esc, { tele: tele, cfg: cfg, entrega: ehEntregaCampo(c) });
    const sem = ctx && ctx.semana ? semanaEfetiva(esc, ctx.semana, ctx.ferias[c.matricula], ctx.feriados[c.revenda], ctx.ajustes[c.matricula]) : null;
    const linhas = DIAS_SEMANA.map(function (nome, i) {
      const sd = sem ? sem[i] : null, rot = nome + (sd ? ' ' + sd.data.split('-').reverse().slice(0, 2).join('/') : '') + (sd && sd.feriado ? '<br><small style="color:#b42318">Feriado: ' + h_(sd.feriado) + '</small>' : '');
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
    const v = visaoColaborador(c), k = c.revenda + ' · ' + v.areaNome + (v.area === 'adm' ? '' : ' · ' + v.grupo);
    if (!grupos[k]) { grupos[k] = []; ordem.push(k); }
    grupos[k].push(c);
  });
  let rows = '';
  ordem.forEach(function (g) {
    rows += '<tr class="g"><td colspan="12">' + h_(g) + ' (' + grupos[g].length + ')</td></tr>';
    grupos[g].forEach(function (c) {
      const e = esc[c.matricula], dias = e ? parse_(e.dias, []) : [];
      const val = e ? validarEscala({ vigencia: e.vigencia, dias: dias }, { tele: c.teleatendimento === 'S', cfg: cfg, entrega: ehEntregaCampo(c) }) : null;
      rows += '<tr><td class="n"><b>' + h_(c.nome) + '</b><br>' + h_(codigoMatricula(c.matricula)) + '</td><td class="n">' + h_(c.funcao) + '</td><td class="n">' + h_(areaSetor(c.setor) === 'arm' ? (c.turno || '—') : (c.lotacao || '—') + (c.tipoMot ? ' · ' + c.tipoMot : '')) + '</td>' +
        (function () {
          const sem = ctx && ctx.semana ? semanaEfetiva(e ? { vigencia: e.vigencia, dias: dias } : null, ctx.semana, ctx.ferias[c.matricula], ctx.feriados[c.revenda], ctx.ajustes[c.matricula]) : null;
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
  const cfg = cfg_(), esc = {};
  ler_('Escalas').forEach(function (e) { esc[e.matricula] = e; });
  const cols = ler_('Colaboradores')
    .filter(function (c) { return mats.indexOf(c.matricula) >= 0 && c.ativo !== 'N' && podeVer_(u, c); })
    .sort(ordemVisao_);
  if (!cols.length) throw new Error('Nenhum colaborador disponível.');
  let ctx = null;
  const temSemana = /^\d{4}-\d{2}-\d{2}$/.test(String(d.semana || '')), temMes = /^\d{4}-\d{2}$/.test(String(d.mes || ''));
  if (temSemana || temMes) {
    ctx = { semana: temSemana ? segundaDaSemana(d.semana) : '', mes: temMes ? d.mes : '', ferias: {}, feriados: {}, ajustes: {} };
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
  return { nome: nome, base64: Utilities.base64Encode(pdf.getBytes()) };
}

/* ---------------- PDF do mês ---------------- */
const MESES_ = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function nomeMes_(ym) { const p = ym.split('-'); return MESES_[+p[1] - 1] + ' de ' + p[0]; }
function diasMesColab_(c, e, ctx) {
  const esc = e ? { vigencia: e.vigencia, dias: parse_(e.dias, []) } : null;
  return diasDoMes(ctx.mes).map(function (dt) { return diaEfetivo(esc, dt, ctx.ferias[c.matricula], ctx.feriados[c.revenda], ctx.ajustes[c.matricula]); });
}
function fichaMesPdf_(c, e, cfg, ultima, ctx) {
  const dias = diasMesColab_(c, e, ctx), cel = {};
  dias.forEach(function (d) { cel[d.data] = d; });
  const ini = segundaDaSemana(dias[0].data), fim = dias[dias.length - 1].data;
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
    '<table class="esc" style="margin-top:10px"><tr>' + DIAS_SEMANA.map(function (d) { return '<th>' + d + '</th>'; }).join('') + '</tr>' + linhas + '</table>' +
    '<p class="tot">Horas no mês: <b>' + minParaHm(total) + '</b>' + (avisos.length ? ' &nbsp; <span class="st ALERTA">Feriado trabalhado: ' + avisos.map(function (x) { return x.split('-').reverse().slice(0, 2).join('/'); }).join(', ') + '</span>' : '') + '</p>' +
    '<p class="leg">* dia alterado em relação ao padrão semanal. Escala 5x2 conforme a EC nº 141/2026 e a CLT; feriado trabalhado exige folga compensatória na semana ou pagamento em dobro (Lei 605/49).</p>' +
    '<table class="ass"><tr><td><span>Colaborador</span></td><td><span>Supervisor</span></td></tr></table></div>';
}
function quadroMesPdf_(cols, esc, cfg, ctx) {
  const datas = diasDoMes(ctx.mes), ini = DIAS_CURTO.map(function (d) { return d.charAt(0); });
  const ferAll = {}; Object.keys(ctx.feriados).forEach(function (r) { ctx.feriados[r].forEach(function (f) { ferAll[f.data] = true; }); });
  const grupos = {}, ordem = [];
  cols.forEach(function (c) {
    const v = visaoColaborador(c), k = c.revenda + ' · ' + v.areaNome + (v.area === 'adm' ? '' : ' · ' + v.grupo);
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
        return '<td' + (d.feriado ? ' style="background:#fde6e3"' : '') + '>' + h_(String(d.ent).slice(0, 2)) + '</td>';
      }).join('') + '<td><b>' + minParaHm(tot) + '</b></td></tr>';
    });
  });
  return '<div class="pg ult"><div class="top"><span>' + h_(nomeMes_(ctx.mes)) + '</span><b>' + h_(cfg.EMPRESA) + ' · Quadro de escalas do mês</b></div>' +
    '<table class="q qm" style="margin-top:8px"><tr><th>Colaborador</th>' + datas.map(function (dt) {
      return '<th' + (ferAll[dt] ? ' style="background:#b42318"' : '') + '>' + (+dt.slice(8)) + '<br>' + ini[diaSemanaIso(dt)] + '</th>';
    }).join('') + '<th>Horas</th></tr>' + rows + '</table>' +
    '<p style="font-size:8px;color:#44526b">Número = hora de entrada · F = folga · V = férias · vermelho = feriado. Cada colaborador tem a ficha do mês com os horários completos.</p></div>';
}


// ===================== Regras.gs =====================
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
      add('erro', nome + ': ' + minParaHm(c.liquido) + ' passa do máximo diário de ' + minParaHm(P.diario) + (P.entrega ? ' (motorista/ajudante de entrega).' : ' (' + P.fase + ').'));
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

/* ---------------- dias reais: padrão + ajustes do dia + férias + feriados ---------------- */
function isoMaisDias(iso, n) {
  var p = String(iso).split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
/** 0 = segunda ... 6 = domingo */
function diaSemanaIso(iso) { var p = String(iso).split('-'); return (new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay() + 6) % 7; }
function segundaDaSemana(iso) { return isoMaisDias(iso, -diaSemanaIso(iso)); }
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
function diaEfetivo(esc, data, ferias, feriados, ajustes) {
  var fer = (feriados || []).filter(function (f) { return f.data === data; })[0];
  var o = { data: data, feriado: fer ? (fer.descricao || 'Feriado') : '', feriadoConta: fer ? feriadoConta(fer) : false, ajuste: false };
  if ((ferias || []).some(function (f) { return f.inicio <= data && data <= f.fim; })) { o.tipo = 'FER'; return o; }
  var aj = ajustes && ajustes[data];
  if (aj) { o.ajuste = true; o.tipo = aj.tipo === 'T' ? 'T' : 'F'; if (o.tipo === 'T') { o.ent = aj.ent; o.sai = aj.sai; o.int = +aj.int || 0; } return o; }
  var base = esc && esc.vigencia && data >= esc.vigencia ? (esc.dias[diaSemanaIso(data)] || { tipo: 'F' }) : null;
  if (!base) { o.tipo = 'N'; return o; }
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
  var esc = { vigencia: sem[0].data, dias: sem.map(function (d) { return d.tipo === 'T' ? { tipo: 'T', ent: d.ent, sai: d.sai, int: d.int } : { tipo: 'F' }; }) };
  var v = validarEscala(esc, { tele: ctx.tele, cfg: ctx.cfg, entrega: ctx.entrega });
  v.msgs = v.msgs.filter(function (m) { return m.texto.indexOf('vigência') < 0; })
    .concat(avisosSemana(sem).map(function (t) { return { nivel: 'alerta', texto: t }; }));
  var e = v.msgs.some(function (m) { return m.nivel === 'erro'; }), a = v.msgs.some(function (m) { return m.nivel === 'alerta'; });
  v.status = e ? 'ERRO' : a ? 'ALERTA' : 'OK';
  return v;
}
