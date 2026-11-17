/**
 * Necessidade de QLP: quantas pessoas precisam estar trabalhando, por faixa de horário e dia da semana,
 * para cada revenda · departamento · ponto/turno/grupo · função. Datas especiais têm exceção.
 * faixas   = [{de:'06:00', ate:'08:00', q:[seg,ter,qua,qui,sex,sab,dom]}]
 * excecoes = [{data:'AAAA-MM-DD', q:[qtd por faixa], obs}]
 */
const QLP_AREAS = { entrega: 1, pux: 1, arm: 1, adm: 1 };

function qlpPublico_(r) {
  return { id: r.id, revenda: r.revenda, area: r.area, grupo: r.grupo, funcao: r.funcao,
    faixas: parse_(r.faixas, []), excecoes: parse_(r.excecoes, []), obs: r.obs, por: r.por, em: r.em };
}
/** Revendas em que o usuário tem colaboradores (admin: todas). */
function qlpRevendas_(u) {
  const cols = ler_('Colaboradores').filter(function (c) { return c.ativo !== 'N' && podeVer_(u, c); });
  return uniq_(cols.map(function (c) { return c.revenda; }));
}
function qlpLista_(u) {
  const revs = u.perfil === 'ADMIN' ? null : qlpRevendas_(u);
  return ler_('QLP').filter(function (r) { return !revs || revs.indexOf(r.revenda) >= 0; }).map(qlpPublico_);
}
function qlpLimpo_(d) {
  const hm = function (s) { const m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})$/); return m && +m[1] < 24 && +m[2] < 60 ? String(m[1]).padStart(2, '0') + ':' + m[2] : null; };
  const n = function (v) { v = Math.round(+v || 0); return v < 0 ? 0 : v > 999 ? 999 : v; };
  const faixas = (d.faixas || []).map(function (f) {
    const de = hm(f.de), ate = hm(f.ate);
    if (!de || !ate) throw new Error('Informe o horário de início e fim de cada faixa (ex.: 06:00 e 08:00).');
    if (de === ate) throw new Error('A faixa ' + de + ' precisa ter fim diferente do início.');
    const q = []; for (let i = 0; i < 7; i++) q.push(n((f.q || [])[i]));
    return { de: de, ate: ate, q: q };
  });
  if (!faixas.length) throw new Error('Cadastre pelo menos uma faixa de horário.');
  const vistos = {};
  const excecoes = (d.excecoes || []).filter(function (x) { return x && x.data; }).map(function (x) {
    const data = String(x.data).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Data de exceção inválida.');
    if (vistos[data]) throw new Error('A data ' + data.split('-').reverse().join('/') + ' está repetida nas exceções.');
    vistos[data] = 1;
    return { data: data, q: faixas.map(function (f, i) { return n((x.q || [])[i]); }), obs: String(x.obs || '').trim().slice(0, 80) };
  }).sort(function (a, b) { return a.data < b.data ? -1 : 1; });
  return { faixas: faixas, excecoes: excecoes };
}
function salvarQlp_(u, d) {
  const rev = String(d.revenda || '').trim(), area = String(d.area || ''), grupo = String(d.grupo || '').trim() || '*', funcao = String(d.funcao || '').trim() || '*';
  if (!rev) throw new Error('Informe a revenda.');
  if (!QLP_AREAS[area] && !/^p_[a-z0-9]+$/.test(area)) throw new Error('Informe o departamento.');
  if (u.perfil !== 'ADMIN' && qlpRevendas_(u).indexOf(rev) < 0) throw new Error('Você não tem colaboradores nesta revenda.');
  const L = qlpLimpo_(d);
  return comLock_(function () {
    const lst = ler_('QLP');
    if (lst.some(function (r) { return r.id !== d.id && r.revenda === rev && r.area === area && r.grupo === grupo && r.funcao === funcao; }))
      throw new Error('Já existe necessidade cadastrada para essa combinação. Edite a que já existe.');
    let r = d.id ? lst.filter(function (x) { return x.id === d.id; })[0] : null;
    if (d.id && !r) throw new Error('Necessidade não encontrada (pode ter sido removida). Recarregue a página.');
    if (r && u.perfil !== 'ADMIN' && qlpRevendas_(u).indexOf(r.revenda) < 0) throw new Error('Sem permissão para editar esta necessidade.');
    r = Object.assign(r || { id: Utilities.getUuid() }, { revenda: rev, area: area, grupo: grupo, funcao: funcao,
      faixas: JSON.stringify(L.faixas), excecoes: JSON.stringify(L.excecoes), obs: String(d.obs || '').trim().slice(0, 120), por: u.nome, em: agora_() });
    gravarLinha_('QLP', r);
    log_(u, '', 'necessidade QLP', rev + ' · ' + area + ' · ' + grupo + ' · ' + funcao + ' (' + L.faixas.length + ' faixas)');
    return qlpPublico_(r);
  });
}
function removerQlp_(u, d) {
  return comLock_(function () {
    const lst = ler_('QLP'), r = lst.filter(function (x) { return x.id === d.id; })[0];
    if (!r) throw new Error('Necessidade não encontrada.');
    if (u.perfil !== 'ADMIN' && qlpRevendas_(u).indexOf(r.revenda) < 0) throw new Error('Sem permissão para remover esta necessidade.');
    gravarTudo_('QLP', lst.filter(function (x) { return x.id !== d.id; }));
    log_(u, '', 'removeu necessidade QLP', r.revenda + ' · ' + r.area + ' · ' + r.grupo + ' · ' + r.funcao);
    return true;
  });
}
