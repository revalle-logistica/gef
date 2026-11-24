/**
 * Alertas dos prazos de liberação ao DP: largada (PRAZO_LIBERACAO_DP) e mensal (todo dia PRAZO_DIA_MES, escalas do mês seguinte).
 * Roda uma vez por dia (agendado no Supabase). Faltando 15, 7 e 1 dia, manda a cada supervisor um e-mail com o que
 * ainda falta na equipe dele. Cada marco é enviado uma única vez (se um dia falhar, o próximo dia cobre).
 */
const PRT_TXT_ = { SEM: 'Sem escala montada', ERRO: 'Com erro nas regras', NAOLIB: 'Montada, mas não liberada ao DP', REENV: 'Alterada depois de liberada · falta reenviar ao DP' };

function alertasPrazoDP_() {
  const cfg = cfg_(), hoje = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), props = PropertiesService.getScriptProperties();
  const prazos = prazosLiberacao(cfg, hoje).filter(function (p) { return p.data >= hoje; });
  if (!prazos.length) return { enviado: 0, motivo: 'sem prazo a vencer' };
  const res = [];
  prazos.forEach(function (p) {
    const dias = Math.round((Date.parse(p.data) - Date.parse(hoje)) / 864e5);
    const devidos = [15, 7, 1].filter(function (m) { return dias >= 1 && dias <= m; });
    if (!devidos.length) { res.push({ prazo: p.data, dias: dias }); return; }
    const marco = Math.min.apply(null, devidos);
    if (props.getProperty('ALERTA_PRAZO_' + p.data + '_' + marco)) { res.push({ prazo: p.data, dias: dias, ja: true }); return; }
    const r = enviarAlertasPrazo_(cfg, p, dias);
    devidos.forEach(function (m) { props.setProperty('ALERTA_PRAZO_' + p.data + '_' + m, agora_()); });
    log_(null, '', 'alerta do prazo ao DP', p.rotulo + ' · prazo ' + p.data + ' · ' + dias + ' dias · ' + r.enviados + ' supervisores avisados');
    res.push({ prazo: p.data, dias: dias, enviado: r.enviados });
  });
  return { prazos: res, enviado: res.reduce(function (s, x) { return s + (x.enviado || 0); }, 0) };
}

/** Agrupa por supervisor a situação de cada colaborador ativo na data ref. {sid: {total, prontos, pend:{SEM:[..],..}}} */
function gruposPendencias_(cfg, ref) {
  const esc = escalasPorMatricula_(), libs = {}, grupos = {};
  ler_('LiberacoesDP').forEach(function (l) { libs[l.matricula] = { assinatura: l.assinatura, visto: l.vistoAssinatura }; });
  ler_('Colaboradores').filter(function (c) { return c.ativo !== 'N' && c.supervisor && contaNaProntidao(c.situacao); }).forEach(function (c) {
    const s = prontidaoColab(esc[c.matricula] || null, libs[c.matricula] || null, ref, { tele: c.teleatendimento === 'S', cfg: cfg, entrega: ehEntregaCampo(c) });
    const g = grupos[c.supervisor] = grupos[c.supervisor] || { total: 0, prontos: 0, pend: {} };
    g.total++;
    if (s === 'LIB' || s === 'VISTA') g.prontos++; else (g.pend[s] = g.pend[s] || []).push(c);
  });
  return grupos;
}
function emailDe_(u) { return u ? String(u.email || (/@/.test(u.login) ? u.login : '')).trim() : ''; }

/** HTML do e-mail de pendências. intro = parágrafo de abertura (HTML). */
function htmlPendencias_(cfg, u, g, intro) {
  const h = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); };
  const link = cfg.LINK_SISTEMA || 'https://revalle-logistica.github.io/gef/';
  const nPend = g.total - g.prontos, pc = Math.round(g.prontos / g.total * 100);
  const blocos = ['SEM', 'ERRO', 'NAOLIB', 'REENV'].filter(function (k) { return g.pend[k]; }).map(function (k) {
    const L = g.pend[k].slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    return '<p style="margin:16px 0 6px;font-weight:bold;color:#0b2a6b">' + PRT_TXT_[k] + ' (' + L.length + ')</p><ul style="margin:0;padding-left:20px;font-size:13px;color:#0c1a33">' +
      L.map(function (c) { return '<li>' + h(c.nome) + ' <span style="color:#44526b">· ' + h(c.funcao) + '</span></li>'; }).join('') + '</ul>';
  }).join('');
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;color:#0c1a33">' +
    '<div style="background:#0b2a6b;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0"><b style="font-size:18px">GEF · escalas a liberar ao DP</b></div>' +
    '<div style="border:1px solid #dbe2ee;border-top:0;border-radius:0 0 12px 12px;padding:20px">' +
    '<p>Olá, <b>' + h(String(u.nome || '').split(' ')[0]) + '</b>!</p>' + intro +
    '<div style="background:#eef2f9;border-radius:10px;padding:12px 14px;margin:14px 0"><b style="font-size:22px;color:#0b2a6b">' + pc + '%</b> da sua equipe pronta · ' + g.prontos + ' de ' + g.total + ' pessoas<br><span style="font-size:13px;color:#44526b">Falta resolver <b>' + nPend + '</b>:</span></div>' +
    blocos +
    '<p style="text-align:center;margin:24px 0 8px"><a href="' + h(link) + '" style="background:#1446c8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">Abrir o GEF e finalizar</a></p>' +
    '<p style="font-size:12px;color:#44526b">Pronto = escala montada, dentro das regras e liberada ao DP (botão "Liberar para o DP").</p></div></div>';
}
const brData_ = function (d) { return String(d).split('-').reverse().join('/'); };

function enviarAlertasPrazo_(cfg, pz, dias) {
  const grupos = gruposPendencias_(cfg, pz.ref), users = {};
  ler_('Usuarios').forEach(function (u) { users[u.id] = u; });
  let enviados = 0;
  Object.keys(grupos).forEach(function (sid) {
    const g = grupos[sid], u = users[sid], para = u && u.status === 'ATIVO' ? emailDe_(u) : '';
    if (!para || g.total === g.prontos) return;
    const intro = '<p>' + (dias === 1 ? '<b style="color:#b42318">Amanhã</b> termina' : 'Faltam <b>' + dias + ' dias</b> para terminar') + ' o prazo para liberar ao DP as <b>' + pz.rotulo + '</b>: <b>' + brData_(pz.data) + '</b>.</p>';
    try {
      MailApp.sendEmail({ to: para, subject: 'GEF · prazo ' + brData_(pz.data) + ': liberar ao DP as ' + pz.rotulo + ' · ' + (dias === 1 ? 'termina amanhã' : 'faltam ' + dias + ' dias'), htmlBody: htmlPendencias_(cfg, u, g, intro), name: 'GEF · ' + (cfg.EMPRESA || 'Revalle') });
      enviados++;
    } catch (e) { log_(null, '', 'falha no alerta de prazo', para + ' · ' + e.message); }
  });
  return { enviados: enviados };
}

/** Botão "Cobrar" (administrador ou DP): e-mail ao supervisor com as pendências, com cópia para quem cobrou. */
function cobrarSupervisor_(u, d) {
  const cfg = cfg_(), sid = String(d.supervisor || '');
  const sup = ler_('Usuarios').filter(function (x) { return x.id === sid; })[0];
  if (!sup || sup.status !== 'ATIVO') throw new Error('Supervisor não encontrado ou sem acesso ativo.');
  const para = emailDe_(sup), cc = emailDe_(u);
  if (!para) throw new Error(sup.nome + ' não tem e-mail no cadastro.');
  const hoje = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), pa = prazoAtual(cfg, hoje), ref = pa ? pa.ref : inicioEscala(cfg);
  const g = gruposPendencias_(cfg, ref)[sid];
  if (!g || g.total === g.prontos) throw new Error('A equipe de ' + sup.nome + ' já está com tudo liberado ao DP.');
  const h = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); };
  const dias = pa ? Math.round((Date.parse(pa.data) - Date.parse(hoje)) / 864e5) : null;
  const quando = !pa ? '' : dias > 1 ? ' Faltam <b>' + dias + ' dias</b>.' : dias === 1 ? ' <b style="color:#b42318">Termina amanhã.</b>' : dias === 0 ? ' <b style="color:#b42318">Termina hoje.</b>' : ' <b style="color:#b42318">O prazo já venceu.</b>';
  const intro = '<p><b>' + h(u.nome) + '</b>' + (u.perfil === 'DP' ? ' (DP)' : '') + ' está cobrando a liberação das escalas da sua equipe ao DP' +
    (pa ? ': o prazo para as <b>' + pa.rotulo + '</b> é <b>' + brData_(pa.data) + '</b>.' + quando : ' (escala a partir de <b>' + brData_(ref) + '</b>).') + '</p>' +
    (d.obs ? '<p style="background:#fff7e6;border-left:4px solid #e8a317;padding:8px 12px;border-radius:6px"><b>Recado:</b> ' + h(String(d.obs).slice(0, 500)) + '</p>' : '');
  MailApp.sendEmail({ to: para, cc: cc && cc !== para ? cc : undefined, replyTo: cc || undefined, subject: 'GEF · cobrança: liberar ao DP as escalas da sua equipe' + (pa ? ' (prazo ' + brData_(pa.data) + ')' : ''), htmlBody: htmlPendencias_(cfg, sup, g, intro), name: 'GEF · ' + (cfg.EMPRESA || 'Revalle') });
  log_(u, '', 'cobrou supervisor', sup.nome + ' · ' + (g.total - g.prontos) + ' pendências' + (cc ? ' · cópia ' + cc : ''));
  return { para: para, cc: cc, pendencias: g.total - g.prontos };
}

/** Diagnóstico da prontidão de um supervisor (uso interno, liberado uma vez pela propriedade DIAG_SUP = parte do nome). */
function diagProntidao_() {
  const props = PropertiesService.getScriptProperties(), alvo = String(props.getProperty('DIAG_SUP') || '').toLowerCase();
  if (!alvo) throw new Error('Diagnóstico não liberado.');
  props.deleteProperty('DIAG_SUP');
  const cfg = cfg_(), hoje = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), pa = prazoAtual(cfg, hoje), ref = pa ? pa.ref : inicioEscala(cfg);
  const sup = ler_('Usuarios').filter(function (x) { return String(x.nome).toLowerCase().indexOf(alvo) >= 0; })[0];
  if (!sup) throw new Error('Supervisor não encontrado.');
  const esc = escalasPorMatricula_(), libs = {};
  ler_('LiberacoesDP').forEach(function (l) { libs[l.matricula] = l; });
  const out = { supervisor: sup.nome, ref: ref, prazo: pa, cat: {}, exemplos: {} };
  ler_('Colaboradores').filter(function (c) { return c.ativo !== 'N' && c.supervisor === sup.id && contaNaProntidao(c.situacao); }).forEach(function (c) {
    const l = libs[c.matricula], e = esc[c.matricula];
    const s = prontidaoColab(e || null, l ? { assinatura: l.assinatura, visto: l.vistoAssinatura } : null, ref, { tele: c.teleatendimento === 'S', cfg: cfg, entrega: ehEntregaCampo(c) });
    out.cat[s] = (out.cat[s] || 0) + 1;
    const ex = out.exemplos[s] = out.exemplos[s] || [];
    if (ex.length < 4) {
      const p = e ? periodoNaData(e, ref) : null;
      ex.push({ m: c.matricula, periodos: e ? e.periodos.map(function (x) { return x.vigencia + (x.ate ? '>' + x.ate : ''); }).join(' | ') : '',
        liberadoEm: l ? l.liberadoEm : '', snapshot: l ? parse_(l.escala, []).map(function (x) { return x.vigencia; }).join(' | ') : '',
        assinaturaAtual: e ? assinaturaEscala(e) : '', assinaturaLiberada: l ? l.assinatura : '',
        msgs: p ? validarEscala(p, { tele: c.teleatendimento === 'S', cfg: cfg, entrega: ehEntregaCampo(c) }).msgs.filter(function (x) { return x.nivel === 'erro'; }).map(function (x) { return x.texto; }) : [] });
    }
  });
  return out;
}
