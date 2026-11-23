/**
 * Perfil Assistente / Analista: vê as escalas da(s) revenda(s) × departamento(s) a que está vinculado
 * e propõe alterações. A proposta só vale depois que o supervisor do colaborador (ou o administrador) aprova.
 */

/** O analista só consulta e propõe; estas são as únicas ações liberadas para ele. */
var ANALISTA_OK_ = { carregar: 1, logout: 1, trocarSenha: 1, exportPdf: 1, feriasDados: 1, propor: 1, cancelarProposta: 1 };

function propostaPublica_(p) {
  return { id: p.id, matricula: p.matricula, tipo: p.tipo, dados: parse_(p.dados, {}), obs: p.obs, status: p.status,
    criadoPor: p.criadoPor, criadoPorNome: p.criadoPorNome, criadoEm: p.criadoEm, decididoPor: p.decididoPor, decididoEm: p.decididoEm, motivo: p.motivo };
}
/** Propostas que o usuário enxerga: o analista vê as dele; supervisor/admin veem as dos colaboradores que acessam. */
function propostasDoUsuario_(u, vis) {
  const limite = Utilities.formatDate(new Date(Date.now() - 45 * 864e5), TZ, 'yyyy-MM-dd');
  return ler_('Propostas').filter(function (p) {
    if (!vis[p.matricula]) return false;
    if (p.status !== 'PENDENTE' && String(p.decididoEm || p.criadoEm) < limite) return false;
    if (u.perfil === 'ANALISTA') return p.criadoPor === u.id;
    return u.perfil !== 'DP';
  }).map(propostaPublica_);
}

/** d = {matricula, tipo:'escala', vigencia, ate?, vigOrig?, dias, obs} ou {matricula, tipo:'ajuste', data, tipo_dia, ent, sai, int, obs} */
function propor_(u, d) {
  if (u.perfil !== 'ANALISTA') throw new Error('Só o perfil Assistente / Analista envia propostas.');
  const c = achaColab_(u, d.matricula), tipo = d.tipo === 'ajuste' ? 'ajuste' : 'escala';
  let dados;
  if (tipo === 'escala') {
    const vig = vigenciaOk_(d.vigencia), esc = { vigencia: vig, ate: ateOk_(d.ate, vig), dias: limpaDias_(d.dias) };
    const val = validarEscala(esc, { tele: c.teleatendimento === 'S', cfg: cfg_(), entrega: ehEntregaCampo(c) });
    if (val.status === 'ERRO') throw new Error('A proposta tem erro legal: ' + val.msgs.filter(function (m) { return m.nivel === 'erro'; }).map(function (m) { return m.texto; }).join(' '));
    dados = { vigencia: esc.vigencia, ate: esc.ate, dias: esc.dias, vigOrig: d.vigOrig ? String(d.vigOrig) : '' };
  } else {
    const td = String(d.tipoDia || '');
    if (td && td !== 'T' && td !== 'F') throw new Error('Tipo de dia inválido.');
    if (td === 'T' && (hmParaMin(d.ent) == null || hmParaMin(d.sai) == null)) throw new Error('Informe entrada e saída.');
    dados = { data: dataOk_(d.data, 'dia'), tipoDia: td, ent: td === 'T' ? d.ent : '', sai: td === 'T' ? d.sai : '', int: td === 'T' ? Math.max(0, parseInt(d.int, 10) || 0) : 0 };
  }
  return comLock_(function () {
    const lst = ler_('Propostas');
    // uma proposta pendente do mesmo tipo/alvo substitui a anterior do mesmo analista
    lst.forEach(function (p) {
      if (p.status === 'PENDENTE' && p.criadoPor === u.id && p.matricula === c.matricula && p.tipo === tipo &&
        (tipo === 'escala' || parse_(p.dados, {}).data === dados.data)) { p.status = 'SUBSTITUIDA'; p.decididoEm = agora_(); gravarLinha_('Propostas', p); }
    });
    const p = { id: Utilities.getUuid().slice(0, 8), matricula: c.matricula, tipo: tipo, dados: JSON.stringify(dados), obs: String(d.obs || '').slice(0, 500),
      status: 'PENDENTE', criadoPor: u.id, criadoPorNome: u.nome, criadoEm: agora_() };
    gravarLinha_('Propostas', p);
    log_(u, c.matricula, 'propôs alteração', tipo + (tipo === 'ajuste' ? ' ' + dados.data : ' a partir de ' + dados.vigencia));
    return propostaPublica_(p);
  });
}
function cancelarProposta_(u, d) {
  return comLock_(function () {
    const p = ler_('Propostas').filter(function (x) { return x.id === String(d.id); })[0];
    if (!p || p.criadoPor !== u.id) throw new Error('Proposta não encontrada.');
    if (p.status !== 'PENDENTE') throw new Error('Essa proposta já foi decidida.');
    p.status = 'CANCELADA'; p.decididoPor = u.nome; p.decididoEm = agora_(); gravarLinha_('Propostas', p);
    return propostaPublica_(p);
  });
}
/** Supervisor do colaborador (ou administrador) aprova: a alteração é gravada em nome de quem aprovou. */
function decidirProposta_(u, d) {
  if (u.perfil !== 'ADMIN' && u.perfil !== 'SUPERVISOR') throw new Error('Só o supervisor aprova propostas.');
  const p = ler_('Propostas').filter(function (x) { return x.id === String(d.id); })[0];
  if (!p) throw new Error('Proposta não encontrada.');
  if (p.status !== 'PENDENTE') throw new Error('Essa proposta já foi decidida.');
  achaColab_(u, p.matricula);
  const aprovar = !!d.aprovar, dd = parse_(p.dados, {});
  let resultado = null;
  if (aprovar) {
    if (p.tipo === 'escala') resultado = salvarEscala_(u, { matricula: p.matricula, vigencia: dd.vigencia, ate: dd.ate, dias: dd.dias, vigOrig: dd.vigOrig });
    else resultado = salvarAjuste_(u, { matricula: p.matricula, data: dd.data, tipo: dd.tipoDia, ent: dd.ent, sai: dd.sai, int: dd.int });
  } else if (!String(d.motivo || '').trim()) throw new Error('Informe o motivo da recusa.');
  return comLock_(function () {
    const q = ler_('Propostas').filter(function (x) { return x.id === p.id; })[0];
    q.status = aprovar ? 'APROVADA' : 'RECUSADA'; q.decididoPor = u.nome; q.decididoEm = agora_(); q.motivo = String(d.motivo || '').slice(0, 500);
    gravarLinha_('Propostas', q);
    log_(u, q.matricula, aprovar ? 'aprovou proposta' : 'recusou proposta', q.id + ' de ' + q.criadoPorNome + (q.motivo ? ' · ' + q.motivo : ''));
    return { proposta: propostaPublica_(q), resultado: resultado };
  });
}
