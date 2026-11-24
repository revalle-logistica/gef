/**
 * Alertas do prazo de liberação ao DP (parâmetro PRAZO_LIBERACAO_DP).
 * Roda uma vez por dia (agendado no Supabase). Faltando 15, 7 e 1 dia, manda a cada supervisor um e-mail com o que
 * ainda falta na equipe dele. Cada marco é enviado uma única vez (se um dia falhar, o próximo dia cobre).
 */
const PRT_TXT_ = { SEM: 'Sem escala na data de início', ERRO: 'Com erro nas regras', NAOLIB: 'Montada, mas não liberada ao DP', REENV: 'Alterada depois de liberada · falta reenviar ao DP' };

function alertasPrazoDP_() {
  const cfg = cfg_(), prazo = String(cfg.PRAZO_LIBERACAO_DP || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo)) return { enviado: 0, motivo: 'sem prazo cadastrado' };
  const hoje = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const dias = Math.round((Date.parse(prazo) - Date.parse(hoje)) / 864e5);
  const devidos = [15, 7, 1].filter(function (m) { return dias >= 1 && dias <= m; });
  if (!devidos.length) return { enviado: 0, dias: dias };
  const marco = Math.min.apply(null, devidos), props = PropertiesService.getScriptProperties();
  if (props.getProperty('ALERTA_PRAZO_' + prazo + '_' + marco)) return { enviado: 0, dias: dias, ja: true };
  const res = enviarAlertasPrazo_(cfg, prazo, dias);
  devidos.forEach(function (m) { props.setProperty('ALERTA_PRAZO_' + prazo + '_' + m, agora_()); });
  log_(null, '', 'alerta do prazo ao DP', dias + ' dias · ' + res.enviados + ' supervisores avisados');
  return { enviado: res.enviados, dias: dias };
}

function enviarAlertasPrazo_(cfg, prazo, dias) {
  const ini = inicioEscala(cfg), esc = escalasPorMatricula_(), libs = {};
  ler_('LiberacoesDP').forEach(function (l) { libs[l.matricula] = { assinatura: l.assinatura, visto: l.vistoAssinatura }; });
  const users = {}; ler_('Usuarios').forEach(function (u) { users[u.id] = u; });
  const grupos = {};
  ler_('Colaboradores').filter(function (c) { return c.ativo !== 'N' && c.supervisor; }).forEach(function (c) {
    const s = prontidaoColab(esc[c.matricula] || null, libs[c.matricula] || null, ini, { tele: c.teleatendimento === 'S', cfg: cfg, entrega: ehEntregaCampo(c) });
    const g = grupos[c.supervisor] = grupos[c.supervisor] || { total: 0, prontos: 0, pend: {} };
    g.total++;
    if (s === 'LIB' || s === 'VISTA') g.prontos++; else (g.pend[s] = g.pend[s] || []).push(c);
  });
  const h = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); };
  const br = function (d) { return d.split('-').reverse().join('/'); };
  const link = cfg.LINK_SISTEMA || 'https://revalle-logistica.github.io/gef/';
  let enviados = 0;
  Object.keys(grupos).forEach(function (sid) {
    const g = grupos[sid], u = users[sid];
    const para = u && u.status === 'ATIVO' ? (u.email || (/@/.test(u.login) ? u.login : '')) : '';
    const nPend = g.total - g.prontos;
    if (!para || !nPend) return;
    const blocos = ['SEM', 'ERRO', 'NAOLIB', 'REENV'].filter(function (k) { return g.pend[k]; }).map(function (k) {
      const L = g.pend[k].sort(function (a, b) { return a.nome.localeCompare(b.nome); });
      return '<p style="margin:16px 0 6px;font-weight:bold;color:#0b2a6b">' + PRT_TXT_[k] + ' (' + L.length + ')</p><ul style="margin:0;padding-left:20px;font-size:13px;color:#0c1a33">' +
        L.map(function (c) { return '<li>' + h(c.nome) + ' <span style="color:#44526b">· ' + h(c.funcao) + '</span></li>'; }).join('') + '</ul>';
    }).join('');
    const pc = Math.round(g.prontos / g.total * 100);
    const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;color:#0c1a33">' +
      '<div style="background:#0b2a6b;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0"><b style="font-size:18px">GEF · prazo para liberar as escalas ao DP</b></div>' +
      '<div style="border:1px solid #dbe2ee;border-top:0;border-radius:0 0 12px 12px;padding:20px">' +
      '<p>Olá, <b>' + h(String(u.nome || '').split(' ')[0]) + '</b>!</p>' +
      '<p>' + (dias === 1 ? '<b style="color:#b42318">Amanhã</b> termina' : 'Faltam <b>' + dias + ' dias</b> para terminar') + ' o prazo para liberar as escalas ao DP (<b>' + br(prazo) + '</b>). A escala 5x2 começa em <b>' + br(ini) + '</b>.</p>' +
      '<div style="background:#eef2f9;border-radius:10px;padding:12px 14px;margin:14px 0"><b style="font-size:22px;color:#0b2a6b">' + pc + '%</b> da sua equipe pronta · ' + g.prontos + ' de ' + g.total + ' pessoas<br><span style="font-size:13px;color:#44526b">Falta resolver <b>' + nPend + '</b>:</span></div>' +
      blocos +
      '<p style="text-align:center;margin:24px 0 8px"><a href="' + h(link) + '" style="background:#1446c8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">Abrir o GEF e finalizar</a></p>' +
      '<p style="font-size:12px;color:#44526b">Pronto = escala montada, dentro das regras e liberada ao DP (botão "Liberar para o DP").</p></div></div>';
    try {
      MailApp.sendEmail({ to: para, subject: 'GEF · ' + (dias === 1 ? 'amanhã termina' : 'faltam ' + dias + ' dias para') + ' o prazo de liberar as escalas ao DP (' + br(prazo) + ')', htmlBody: html, name: 'GEF · ' + (cfg.EMPRESA || 'Revalle') });
      enviados++;
    } catch (e) { log_(null, '', 'falha no alerta de prazo', para + ' · ' + e.message); }
  });
  return { enviados: enviados };
}
