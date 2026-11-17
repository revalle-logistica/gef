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
