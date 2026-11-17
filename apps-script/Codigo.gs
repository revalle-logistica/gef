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
  Colaboradores: ['matricula', 'nome', 'funcao', 'revenda', 'setor', 'lotacao', 'turno', 'situacao', 'teleatendimento', 'ativo', 'atualizadoEm'],
  Escalas: ['matricula', 'vigencia', 'dias', 'status', 'total', 'msgs', 'atualizadoPor', 'atualizadoEm'],
  Historico: ['quando', 'usuario', 'matricula', 'acao', 'detalhe']
};

const CFG_PADRAO = [
  ['EMPRESA', 'Revalle', 'Nome no cabeçalho dos PDFs'],
  ['LINK_SISTEMA', 'https://revalle-logistica.github.io/escala-5x2/', 'Link enviado no e-mail de aprovação'],
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
    [hmParaMin, minParaHm, calcDia, parametrosRegra, validarEscala, semanaModelo, normTxt, turnoTag, visaoColaborador].map(function (f) { return f.toString(); }).join('\n');
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
function podeVer_(u, c) {
  if (u.perfil === 'ADMIN') return true;
  const rv = lista_(u.revendas), st = lista_(u.setores);
  return (rv.indexOf('*') >= 0 || rv.indexOf(c.revenda) >= 0) && (st.indexOf('*') >= 0 || st.indexOf(c.setor) >= 0);
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
      lotacao: c.lotacao || 'Base', turno: c.turno, situacao: c.situacao, tele: c.teleatendimento === 'S',
      escala: e ? { vigencia: e.vigencia, dias: parse_(e.dias, []), por: e.atualizadoPor, em: e.atualizadoEm } : null
    };
  });
  const r = { usuario: publico_(u), cfg: cfg, colaboradores: cols };
  if (u.perfil === 'ADMIN') {
    r.pendentes = ler_('Usuarios').filter(function (x) { return x.status === 'PENDENTE'; }).length;
    r.todasRevendas = uniq_(todos.map(function (c) { return c.revenda; }));
    r.todosSetores = uniq_(todos.map(function (c) { return c.setor; }));
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
  const nome = String(d.nome || '').trim(), login = normLogin_(d.login), senha = String(d.senha || '');
  if (nome.length < 3) throw new Error('Informe seu nome completo.');
  if (!/^[a-z0-9._@+-]{3,60}$/.test(login)) throw new Error('Login: use seu e-mail ou um nome sem espaços (letras, números, ponto, hífen).');
  if (senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  const email = String(d.email || (login.indexOf('@') > 0 ? login : '')).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido: é por ele que você recebe o aviso de aprovação.');
  return comLock_(function () {
    const us = ler_('Usuarios');
    if (us.some(function (u) { return u.login === login; })) throw new Error('Esse login já existe. Escolha outro.');
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
    throw new Error('Login ou senha incorretos.');
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
    const rv = (d.revendas || []).map(String), st = (d.setores || []).map(String);
    if (perfil === 'SUPERVISOR' && (!rv.length || !st.length)) throw new Error('Escolha ao menos uma revenda e um setor para o supervisor.');
    u.perfil = perfil;
    u.revendas = perfil === 'ADMIN' ? '*' : rv.join(',');
    u.setores = perfil === 'ADMIN' ? '*' : st.join(',');
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
    (u.perfil === 'ADMIN' ? 'Perfil: <b>Administrador</b>' : 'Revendas: <b>' + h(lst(u.revendas)) + '</b><br>Setores: <b>' + h(lst(u.setores)) + '</b>') + '</p>' +
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
  const val = validarEscala(esc, { tele: c.teleatendimento === 'S', cfg: cfg });
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
 * Importa a planilha do DP já lida no navegador.
 * d.rows = [{matricula, nome, funcao, revenda, setor, lotacao, turno, situacao}]
 * Colaboradores das revendas importadas que não vierem no arquivo ficam inativos.
 */
function importar_(u, d) {
  const rows = d.rows || [];
  if (!rows.length) throw new Error('Nenhum colaborador no arquivo.');
  return comLock_(function () {
    const atual = ler_('Colaboradores'), mapa = {};
    atual.forEach(function (c) { mapa[c.matricula] = c; });
    const revs = uniq_(rows.map(function (r) { return String(r.revenda || '').trim(); }));
    const vistos = {}, res = { novos: 0, atualizados: 0, inativados: 0, desligados: 0 };
    const quando = agora_();
    rows.forEach(function (r) {
      const m = String(r.matricula || '').trim();
      if (!m || !String(r.nome || '').trim()) return;
      const deslig = /demit|deslig|rescis/i.test(String(r.situacao || ''));
      if (deslig) res.desligados++;
      const c = mapa[m] || { matricula: m, teleatendimento: 'N' };
      if (!mapa[m]) { if (!deslig) res.novos++; } else res.atualizados++;
      c.nome = String(r.nome).trim();
      c.funcao = String(r.funcao || '').trim();
      c.revenda = String(r.revenda || '').trim();
      c.setor = String(r.setor || '').trim();
      c.lotacao = String(r.lotacao || '').trim() || 'Base';
      c.turno = String(r.turno || '').trim();
      c.situacao = String(r.situacao || '').trim();
      c.ativo = deslig ? 'N' : 'S';
      c.atualizadoEm = quando;
      mapa[m] = c;
      vistos[m] = true;
    });
    Object.keys(mapa).forEach(function (m) {
      const c = mapa[m];
      if (!vistos[m] && revs.indexOf(c.revenda) >= 0 && c.ativo !== 'N') { c.ativo = 'N'; c.atualizadoEm = quando; res.inativados++; }
    });
    const tudo = Object.keys(mapa).map(function (k) { return mapa[k]; })
      .sort(function (a, b) { return (a.revenda + a.nome).localeCompare(b.revenda + b.nome); });
    gravarTudo_('Colaboradores', tudo);
    log_(u, '', 'importou planilha do DP', revs.join(', ') + ' · ' + JSON.stringify(res));
    res.revendas = revs;
    return res;
  });
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
  '.q td.n{text-align:left}.q td.f{background:#fdf0d8;color:#9a5800;font-weight:bold}.q tr.g td{background:#e3eafb;color:#0b2a6b;font-weight:bold;text-align:left;font-size:9px}';

function textoDia_(d) {
  const c = calcDia(d);
  return c ? { ent: d.ent, sai: d.sai, int: d.int ? minParaHm(+d.int) : '—', horas: minParaHm(c.liquido) } : null;
}

function fichaPdf_(c, e, cfg, ultima) {
  const tele = c.teleatendimento === 'S';
  let corpo;
  if (!e) {
    corpo = '<p style="margin:30px 0;font-size:14px;color:#b42318"><b>Escala ainda não cadastrada.</b></p>';
  } else {
    const esc = { vigencia: e.vigencia, dias: parse_(e.dias, []) };
    const val = validarEscala(esc, { tele: tele, cfg: cfg });
    const linhas = DIAS_SEMANA.map(function (nome, i) {
      const d = esc.dias[i] || { tipo: 'F' }, t = d.tipo === 'T' ? textoDia_(d) : null;
      return t ? '<tr><td class="d">' + nome + '</td><td>Trabalho</td><td>' + h_(t.ent) + '</td><td>' + h_(t.sai) + '</td><td>' + t.int + '</td><td><b>' + t.horas + '</b></td></tr>'
        : '<tr class="f"><td class="d">' + nome + '</td><td colspan="5">FOLGA</td></tr>';
    }).join('');
    corpo = '<table class="esc" style="margin-top:12px"><tr><th style="text-align:left">Dia</th><th>Situação</th><th>Entrada</th><th>Saída</th><th>Intervalo</th><th>Horas</th></tr>' + linhas + '</table>' +
      '<p class="tot">Total semanal: <b>' + minParaHm(val.total) + '</b> de ' + minParaHm(val.limite) + ' permitidas &nbsp; <span class="st ' + val.status + '">' +
      ({ OK: 'Dentro das regras', ALERTA: 'Com alerta', ERRO: 'Com erro legal' })[val.status] + '</span></p>' +
      val.msgs.filter(function (m) { return m.nivel !== 'info'; }).map(function (m) { return '<p class="msg">• ' + h_(m.texto) + '</p>'; }).join('');
  }
  return '<div class="pg' + (ultima ? ' ult' : '') + '">' +
    '<div class="top"><span>Escala 5x2 · EC 141/2026</span><b>' + h_(cfg.EMPRESA) + ' · Escala de trabalho</b></div>' +
    '<table class="inf" style="margin-top:10px">' +
    '<tr><td class="k">Colaborador</td><td colspan="3"><b>' + h_(c.nome) + '</b></td><td class="k">Matrícula</td><td>' + h_(c.matricula) + '</td></tr>' +
    '<tr><td class="k">Função</td><td>' + h_(c.funcao) + (tele ? ' (teleatendimento)' : '') + '</td><td class="k">Revenda</td><td>' + h_(c.revenda) + '</td><td class="k">Setor</td><td>' + h_(c.setor) + '</td></tr>' +
    '<tr><td class="k">Lotação</td><td>' + h_(c.lotacao || 'Base') + '</td><td class="k">Turno</td><td>' + h_(c.turno || '—') + '</td><td class="k">Vigência a partir de</td><td><b>' + dataBr_(e && e.vigencia) + '</b></td></tr>' +
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
function quadroPdf_(cols, esc, cfg) {
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
      const val = e ? validarEscala({ vigencia: e.vigencia, dias: dias }, { tele: c.teleatendimento === 'S', cfg: cfg }) : null;
      rows += '<tr><td class="n"><b>' + h_(c.nome) + '</b><br>' + h_(c.matricula) + '</td><td class="n">' + h_(c.funcao) + '</td><td class="n">' + h_(c.lotacao || 'Base') + '</td>' +
        DIAS_CURTO.map(function (_, i) {
          if (!e) return '<td>—</td>';
          const d = dias[i] || { tipo: 'F' };
          return d.tipo === 'T' ? '<td>' + h_(d.ent) + '<br>' + h_(d.sai) + '</td>' : '<td class="f">FOLGA</td>';
        }).join('') +
        '<td><b>' + (val ? minParaHm(val.total) : '—') + '</b></td><td>' + (val ? '<span class="st ' + val.status + '">' + val.status + '</span>' : 'SEM') + '</td></tr>';
    });
  });
  return '<div class="pg ult"><div class="top"><span>Gerado em ' + agora_().split(' ')[0].split('-').reverse().join('/') + '</span><b>' + h_(cfg.EMPRESA) + ' · Quadro de escalas 5x2</b></div>' +
    '<table class="q" style="margin-top:8px"><tr><th>Colaborador</th><th>Função</th><th>Lotação</th>' +
    DIAS_CURTO.map(function (d) { return '<th>' + d + '</th>'; }).join('') + '<th>Total</th><th>Status</th></tr>' + rows + '</table></div>';
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
  const corpo = d.modo === 'quadro' ? quadroPdf_(cols, esc, cfg)
    : cols.map(function (c, i) { return fichaPdf_(c, esc[c.matricula], cfg, i === cols.length - 1); }).join('');
  const html = '<html><head><meta charset="utf-8"><style>' + CSS_PDF + '</style></head><body>' + corpo + '</body></html>';
  const pdf = Utilities.newBlob(html, 'text/html', 'escala.html').getAs('application/pdf');
  const hoje = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const nome = cols.length === 1 && d.modo !== 'quadro'
    ? 'Escala_' + slug_(cols[0].matricula) + '_' + slug_(cols[0].nome) + '.pdf'
    : 'Escalas_5x2_' + (d.modo === 'quadro' ? 'Quadro_' : 'Fichas_') + cols.length + '_colab_' + hoje + '.pdf';
  log_(u, cols.length === 1 ? cols[0].matricula : '', 'exportou PDF', (d.modo || 'fichas') + ' · ' + cols.length);
  return { nome: nome, base64: Utilities.base64Encode(pdf.getBytes()) };
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

/* ---------------- visões (mesma regra do QLP) ----------------
 * Centro de custo "Armazém…"  → Armazém, agrupado por turno (Turno/Tipo = T1, T2, T3 ou T1/T2…)
 * Centro de custo "Entrega…"  → Turno/Tipo começando com "Puxador" vai para Puxadores
 *                               (residente quando o tipo diz "residente" e há ponto de apoio);
 *                               os demais ficam em Entrega, agrupados por ponto de apoio (vazio = Base)
 * Qualquer outro centro de custo → Administrativo, numa lista só
 */
var VISOES = [['entrega', 'Entrega'], ['pux', 'Puxadores'], ['arm', 'Armazém'], ['adm', 'Administrativo']];
var TURNOS_ORDEM = ['T1', 'T1/T2', 'T2', 'T2/T3', 'T3', 'T3/T1'];
function normTxt(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
function turnoTag(t) {
  var x = String(t || '').toUpperCase().replace(/\s+/g, '').replace(/-/g, '/');
  return /^T[123](\/T[123])?$/.test(x) ? x : '';
}
function visaoColaborador(c) {
  var s = normTxt(c.setor), tt = normTxt(c.turno), lot = String(c.lotacao || '').trim() || 'Base';
  var f = String(c.funcao || '').trim() || 'Sem função', fn = normTxt(f), base = normTxt(lot) === 'base';
  var fo = (/^motorista/.test(fn) ? '0' : /^(ajudante|auxiliar)/.test(fn) ? '1' : /^conferente/.test(fn) ? '2' : '3') + fn;
  if (s.indexOf('armaz') === 0) {
    var t = turnoTag(c.turno), i = TURNOS_ORDEM.indexOf(t);
    return { area: 'arm', areaNome: 'Armazém', grupo: t ? 'Turno ' + t : 'Sem turno informado', ordem: '2' + (t ? ('0' + i).slice(-2) : '99'), funcao: f, fordem: fo };
  }
  if (s.indexOf('entrega') === 0) {
    if (/^pux/.test(tt)) {
      var res = /resid/.test(tt) && !base;
      return { area: 'pux', areaNome: 'Puxadores', grupo: res ? 'Residentes · ' + lot : 'Puxadores da base', ordem: '1' + (res ? '1' + normTxt(lot) : '0'), funcao: f, fordem: fo };
    }
    return { area: 'entrega', areaNome: 'Entrega', grupo: base ? 'Base' : lot, ordem: '0' + (base ? '0' : '1' + normTxt(lot)), funcao: f, fordem: fo };
  }
  return { area: 'adm', areaNome: 'Administrativo', grupo: 'Administrativo', ordem: '3', funcao: f, fordem: fo };
}
