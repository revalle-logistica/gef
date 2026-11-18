/**
 * Integração com a Central de Demandas · Roteirização.
 * A Central consulta, com uma chave secreta, quem está de folga ou de férias em cada dia.
 * Só motoristas e ajudantes de entrega; só matrícula, nome, função e a situação de cada dia (sem outros dados pessoais).
 * Para ligar: rode configurarCentral() uma vez no editor e copie a chave do registro para a Central.
 */
function configurarCentral() {
  const p = PropertiesService.getScriptProperties();
  let k = p.getProperty('CENTRAL_CHAVE');
  if (!k) { k = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8); p.setProperty('CENTRAL_CHAVE', k); }
  Logger.log('Chave da Central (cole na Central de Demandas): ' + k);
  return k;
}
/**
 * Dados: {chave, revenda, de, ate} (datas yyyy-MM-dd, até 120 dias).
 * Resposta: {revenda, de, ate, em, pessoas:[{m, n, f, d}]}. Em d, um caractere por dia a partir de "de":
 * T trabalha, F folga, E férias, N sem escala cadastrada para o dia.
 */
function centralFeed_(d) {
  d = d || {};
  const chave = PropertiesService.getScriptProperties().getProperty('CENTRAL_CHAVE');
  if (!chave || String(d.chave || '') !== chave) throw new Error('Chave da Central inválida.');
  const rev = String(d.revenda || '').trim();
  const de = dataOk_(d.de, 'início'), ate = dataOk_(d.ate, 'fim');
  if (ate < de) throw new Error('Período inválido.');
  const n = Math.round((Date.parse(ate) - Date.parse(de)) / 864e5) + 1;
  if (n > 120) throw new Error('Período maior que 120 dias.');
  const cols = ler_('Colaboradores').filter(function (c) { return c.ativo !== 'N' && c.revenda === rev && ehEntregaCampo(c); });
  const vis = {}; cols.forEach(function (c) { vis[c.matricula] = true; });
  const esc = escalasPorMatricula_(de);
  const fer = {}; ler_('Ferias').forEach(function (f) { if (vis[f.matricula]) (fer[f.matricula] = fer[f.matricula] || []).push({ inicio: f.inicio, fim: f.fim }); });
  const aj = {}; ler_('Ajustes').forEach(function (a) { if (vis[a.matricula] && a.data >= de && a.data <= ate) (aj[a.matricula] = aj[a.matricula] || {})[a.data] = { tipo: a.tipo }; });
  const dias = []; for (let i = 0; i < n; i++) dias.push(isoMaisDias(de, i));
  const pessoas = cols.map(function (c) {
    const e = esc[c.matricula] || { periodos: [] };
    const s = dias.map(function (dt) { const x = diaEfetivo(e, dt, fer[c.matricula], [], aj[c.matricula]); return x.tipo === 'FER' ? 'E' : x.tipo === 'T' ? 'T' : x.tipo === 'F' ? 'F' : 'N'; }).join('');
    return { m: c.matricula, n: c.nome, f: papelEntrega(c.funcao), d: s };
  });
  return { revenda: rev, de: de, ate: ate, em: agora_(), pessoas: pessoas };
}
