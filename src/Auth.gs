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
