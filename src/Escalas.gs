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

function ateOk_(v, vig) {
  v = String(v || '').trim();
  if (!v) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Data final inválida.');
  if (v < vig) throw new Error('A data final não pode ser antes do início.');
  return v;
}
/**
 * Grava (ou recusa) um período de escala já validado. todas = todas as linhas da aba Escalas (alterada aqui).
 * O período novo vale inteiro de vigencia até ate; períodos da pessoa que se sobrepõem são cortados.
 * vigOrig: ao editar um período existente, ele sai antes de gravar o novo.
 */
function gravaEscala_(u, c, esc, cfg, todas, vigOrig) {
  const val = validarEscala({ vigencia: esc.vigencia, dias: esc.dias }, { tele: c.teleatendimento === 'S', cfg: cfg, entrega: ehEntregaCampo(c) });
  if (val.status === 'ERRO' && String(cfg.BLOQUEAR_ERRO).toUpperCase() === 'S') return { gravou: false, val: val };
  const o = {
    matricula: c.matricula, vigencia: esc.vigencia, ate: esc.ate || '', dias: JSON.stringify(esc.dias),
    status: val.status, total: val.total, msgs: JSON.stringify(val.msgs), atualizadoPor: u.nome, atualizadoEm: agora_()
  };
  let minhas = todas.filter(function (r) { return r.matricula === c.matricula; });
  if (vigOrig) minhas = minhas.filter(function (r) { return r.vigencia !== vigOrig; });
  const novas = aplicarPeriodo(minhas, o);
  for (let i = todas.length - 1; i >= 0; i--) if (todas[i].matricula === c.matricula) todas.splice(i, 1);
  novas.forEach(function (r) { todas.push(r); });
  return { gravou: true, val: val, linha: o, linhas: novas };
}

function salvarEscala_(u, d) {
  return comLock_(function () {
    const c = achaColab_(u, d.matricula), cfg = cfg_(), vig = vigenciaOk_(d.vigencia);
    const esc = { vigencia: vig, ate: ateOk_(d.ate, vig), dias: limpaDias_(d.dias) };
    const todas = ler_('Escalas');
    const r = gravaEscala_(u, c, esc, cfg, todas, d.vigOrig ? String(d.vigOrig) : '');
    if (!r.gravou) {
      const e = new Error('A escala não foi salva porque tem erro legal: ' + r.val.msgs.filter(function (m) { return m.nivel === 'erro'; }).map(function (m) { return m.texto; }).join(' '));
      throw e;
    }
    gravarTudo_('Escalas', todas);
    log_(u, c.matricula, 'salvou escala', esc.vigencia + (esc.ate ? ' a ' + esc.ate : ' (sem data final)') + ' · ' + r.val.status + ' · ' + minParaHm(r.val.total));
    return { escala: escalaObj_(r.linhas, esc.vigencia), val: r.val };
  });
}
/** Remove um período da escala de uma pessoa. */
function removerPeriodo_(u, d) {
  return comLock_(function () {
    const c = achaColab_(u, d.matricula), todas = ler_('Escalas');
    const resto = todas.filter(function (r) { return !(r.matricula === c.matricula && r.vigencia === String(d.vigencia)); });
    if (resto.length === todas.length) throw new Error('Período não encontrado.');
    gravarTudo_('Escalas', resto);
    log_(u, c.matricula, 'removeu período da escala', String(d.vigencia));
    return { escala: escalaObj_(resto.filter(function (r) { return r.matricula === c.matricula; }), String(d.vigencia)) };
  });
}

/** Aplica um mesmo horário a vários colaboradores. d = {matriculas, vigencia, ate?, folga1?, folga2, ent, sai, int} */
function salvarLote_(u, d) {
  const mats = (d.matriculas || []).map(String);
  if (!mats.length) throw new Error('Selecione ao menos um colaborador.');
  return comLock_(function () {
    const cfg = cfg_(), vig = vigenciaOk_(d.vigencia), ate = ateOk_(d.ate, vig);
    const dias = limpaDias_(semanaModelo(+d.folga2, d.ent, d.sai, d.int, d.folga1));
    const cols = {};
    ler_('Colaboradores').forEach(function (c) { cols[c.matricula] = c; });
    const todas = ler_('Escalas');
    const res = { salvos: 0, falhas: [] };
    mats.forEach(function (m) {
      const c = cols[m];
      if (!c || c.ativo === 'N' || !podeVer_(u, c)) { res.falhas.push({ matricula: m, nome: c ? c.nome : m, motivo: 'Sem acesso ou inativo.' }); return; }
      const r = gravaEscala_(u, c, { vigencia: vig, ate: ate, dias: dias }, cfg, todas, '');
      if (r.gravou) res.salvos++;
      else res.falhas.push({ matricula: m, nome: c.nome, motivo: r.val.msgs.filter(function (x) { return x.nivel === 'erro'; }).map(function (x) { return x.texto; }).join(' ') });
    });
    gravarTudo_('Escalas', todas);
    log_(u, '', 'escala em lote', res.salvos + ' salvos · ' + res.falhas.length + ' não salvos · ' + vig + (ate ? ' a ' + ate : '') + ' · folgas ' + DIAS_CURTO[d.folga1 === undefined || d.folga1 === '' ? 6 : +d.folga1] + '/' + DIAS_CURTO[+d.folga2] + ' ' + d.ent + '-' + d.sai);
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
  const e = escalaObj_(ler_('Escalas').filter(function (x) { return x.matricula === c.matricula; }), Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'));
  const desde = Utilities.formatDate(new Date(Date.now() - 70 * 864e5), TZ, 'yyyy-MM-dd');
  return {
    nome: c.nome, funcao: c.funcao, revenda: c.revenda, empresa: cfg_().EMPRESA,
    escala: e,
    ferias: ler_('Ferias').filter(function (f) { return f.matricula === c.matricula; }).map(function (f) { return { inicio: f.inicio, fim: f.fim }; }),
    feriados: ler_('Feriados').filter(function (f) { return f.revenda === c.revenda; }).map(function (f) { return { data: f.data, descricao: f.descricao, tipo: f.tipo, contaAlerta: f.contaAlerta }; }),
    ajustes: ler_('Ajustes').filter(function (a) { return a.matricula === c.matricula && a.data >= desde; }).map(function (a) { return { data: a.data, tipo: a.tipo, ent: a.ent, sai: a.sai, int: a.int }; })
  };
}

/* ---------------- sincronização com o sistema de programação de férias ---------------- */
const SIGLAS_PADRAO = { AL: 'Alagoinhas', SE: 'Serrinha', PA: 'Paulo Afonso', RP: 'Ribeira do Pombal', JZ: 'Juazeiro', BF: 'Bonfim', PE: 'Petrolina', PT: 'Petrolina', BR: 'Beira Rio' };
const ORIGEM_SINC = 'Sincronização (sistema de férias)';
/**
 * Traz as férias CONFIRMADAS do sistema de programação de férias: inclui as novas, ignora as que já existem e
 * tira as que vieram dele e deixaram de estar confirmadas (ou mudaram de data). Férias lançadas à mão ou por
 * planilha não são tocadas. Não grava nada no sistema de férias.
 */
function sincFerias_(quem) {
  const cfg = cfg_(), urlSis = String(cfg.FERIAS_SISTEMA_URL || '').trim(), urlApi = String(cfg.FERIAS_API_URL || '').trim();
  if (!urlSis || !urlApi) throw new Error('Informe os endereços do sistema de férias em Regras > Parâmetros.');
  const html = UrlFetchApp.fetch(urlSis, { muteHttpExceptions: true }).getContentText();
  const mb = html.match(/<script[^>]*id=["']base["'][^>]*>([\s\S]*?)<\/script>/);
  if (!mb) throw new Error('Não encontrei a base de colaboradores no sistema de férias.');
  const BASE = JSON.parse(mb[1]);
  const EDITS = JSON.parse(UrlFetchApp.fetch(urlApi + (urlApi.indexOf('?') < 0 ? '?' : '&') + 'api=get&t=' + Date.now(), { muteHttpExceptions: true }).getContentText() || '{}');
  if (EDITS && EDITS.erro) throw new Error('Sistema de férias: ' + EDITS.erro);
  const ano = String(BASE.ano || '').trim() || anoDoSistema_(html);
  let sig = {}; try { sig = JSON.parse(cfg.REVENDAS_SIGLAS || '{}') || {}; } catch (e) { sig = {}; }
  const SIG = {}; Object.keys(SIGLAS_PADRAO).forEach(function (k) { SIG[k] = SIGLAS_PADRAO[k]; }); Object.keys(sig).forEach(function (k) { if (sig[k]) SIG[k.toUpperCase()] = sig[k]; });
  const cols = {}; ler_('Colaboradores').forEach(function (c) { if (c.ativo !== 'N') cols[c.revenda + '|' + codigoMatricula(c.matricula)] = c; });
  const dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], dois = function (n) { return String(n).padStart(2, '0'); };
  const desejados = {}, res = { em: agora_(), por: quem || 'automática', confirmadas: 0, novos: 0, iguais: 0, removidos: 0, conflitos: [], naoAchados: 0, ano: ano };
  (BASE.units || []).forEach(function (un) {
    const rev = SIG[String(un.sig || '').toUpperCase()] || un.nome;
    (un.rows || []).forEach(function (r) {
      const E = EDITS[r.id];
      if (!E || !E.c) return;
      res.confirmadas++;
      const c = cols[rev + '|' + String(r.cod)];
      if (!c) { res.naoAchados++; return; }
      const pl = E.p !== undefined ? E.p : r.p;
      (pl || []).forEach(function (p) {
        if (!p || !p.m || !p.dias) return;
        const ini = ano + '-' + dois(p.m) + '-' + dois(Math.min(p.d || 1, dim[p.m - 1]));
        const fim = isoMaisDias(ini, +p.dias - 1);
        desejados[c.matricula + '|' + ini + '|' + fim] = { matricula: c.matricula, inicio: ini, fim: fim, por: E.por || '' };
      });
    });
  });
  return comLock_(function () {
    let lst = ler_('Ferias');
    const antes = lst.length;
    lst = lst.filter(function (f) { return f.criadoPor !== ORIGEM_SINC || desejados[f.matricula + '|' + f.inicio + '|' + f.fim]; });
    res.removidos = antes - lst.length;
    Object.keys(desejados).forEach(function (k) {
      const it = desejados[k];
      if (lst.some(function (f) { return f.matricula === it.matricula && f.inicio === it.inicio && f.fim === it.fim; })) { res.iguais++; return; }
      const choque = lst.filter(function (f) { return f.matricula === it.matricula && f.inicio <= it.fim && it.inicio <= f.fim; })[0];
      if (choque) { res.conflitos.push(it.matricula + ': ' + dataBr_(it.inicio) + ' a ' + dataBr_(it.fim) + ' choca com ' + dataBr_(choque.inicio) + ' a ' + dataBr_(choque.fim)); return; }
      lst.push({ id: Utilities.getUuid(), matricula: it.matricula, inicio: it.inicio, fim: it.fim, obs: 'Programação de férias' + (it.por ? ' · confirmada por ' + it.por : ''), criadoPor: ORIGEM_SINC, criadoEm: res.em });
      res.novos++;
    });
    if (res.novos || res.removidos) gravarTudo_('Ferias', lst);
    res.conflitos = res.conflitos.slice(0, 30);
    PropertiesService.getScriptProperties().setProperty('FERIAS_SINC', JSON.stringify(res));
    log_({ login: res.por }, '', 'sincronizou férias', JSON.stringify({ novos: res.novos, removidos: res.removidos, conflitos: res.conflitos.length }));
    return res;
  });
}
/** O sistema de férias monta as datas com o ano fixo no código ("2027-..."): lê de lá. */
function anoDoSistema_(html) { const m = html.match(/function isoOf\(m,d\)\{return '(20\d\d)-'/); return m ? m[1] : String(new Date().getFullYear() + 1); }
/** Gatilho de hora em hora (instalado por configurarSincronizacao). */
function sincFeriasAuto() { try { sincFerias_('automática'); } catch (e) { PropertiesService.getScriptProperties().setProperty('FERIAS_SINC', JSON.stringify({ em: agora_(), por: 'automática', erro: e.message })); } }
/** Rode UMA vez no editor: autoriza o acesso ao sistema de férias, liga a sincronização de hora em hora e já sincroniza. */
function configurarSincronizacao() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sincFeriasAuto') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sincFeriasAuto').timeBased().everyHours(1).create();
  const r = sincFerias_('configuração');
  Logger.log('Sincronização ligada. ' + JSON.stringify(r));
}
