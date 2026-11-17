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
function salvarFeriado_(u, d) {
  const rev = String(d.revenda || '').trim(), data = dataOk_(d.data, 'feriado'), desc = String(d.descricao || '').trim().slice(0, 60);
  if (!rev) throw new Error('Informe a unidade.');
  if (!desc) throw new Error('Informe o nome do feriado.');
  return comLock_(function () {
    if (ler_('Feriados').some(function (f) { return f.revenda === rev && f.data === data; })) throw new Error('Já existe feriado nessa data para ' + rev + '.');
    const f = { id: Utilities.getUuid(), revenda: rev, data: data, descricao: desc, criadoPor: u.nome, criadoEm: agora_() };
    gravarLinha_('Feriados', f);
    log_(u, '', 'cadastrou feriado', rev + ' ' + data + ' ' + desc);
    return { id: f.id, revenda: rev, data: data, descricao: desc };
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
  if (campos.supervisor) {
    const s = ler_('Usuarios').filter(function (x) { return x.id === campos.supervisor && x.status === 'ATIVO'; })[0];
    if (!s) throw new Error('Supervisor não encontrado ou sem acesso ativo.');
  }
  return comLock_(function () {
    const todos = ler_('Colaboradores');
    let n = 0;
    todos.forEach(function (c) {
      if (mats.indexOf(c.matricula) < 0) return;
      ok.forEach(function (k) { c[k] = String(campos[k] == null ? '' : campos[k]).trim(); });
      n++;
    });
    gravarTudo_('Colaboradores', todos);
    log_(u, mats.length === 1 ? mats[0] : '', 'cadastro em lote', n + ' colaboradores · ' + JSON.stringify(campos));
    return { atualizados: n };
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
