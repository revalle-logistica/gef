// GEF no Supabase: roda o MESMO código do Apps Script (Codigo.gs) com os serviços do Google trocados por
// equivalentes em memória. Cada requisição carrega a base, executa a ação e grava só o que mudou.
// Este arquivo funciona no Deno (Supabase Edge Function) e no Node (testes).

const TZ_PADRAO = 'America/Bahia';
const FUNCOES_EXPOSTAS = ['api', 'sincFeriasAuto', 'regrasFonte'];

// Substitui a camada de dados (planilha) por uma base em memória; o resto do código fica idêntico.
const SOBRESCRITAS = `
function ss_() { return { getUrl: function () { return 'supabase'; } }; }
function prepararBase_() {}
function aba_(n) { throw new Error('Acesso direto à planilha não existe mais (' + n + ').'); }
function ler_(n) { return __DB.ler(n); }
function gravarTudo_(n, objs) { __DB.tudo(n, objs.map(function (o) { return linha_(n, o); })); }
function gravarLinha_(n, o) { o._row = __DB.linha(n, o._row, linha_(n, o)); }
function log_(u, mat, acao, det) { __DB.historico([agora_(), u ? u.login : '', mat || '', acao, det || '']); }
function comLock_(fn) { return fn(); }
function desvio_() { return null; }
function converterPlanilha_(u, d) { return __XLSX_ABAS(d); }
`;

function bytesAssinados(buf) { return Array.from(buf, (b) => (b > 127 ? b - 256 : b)); }
function semSinal(arr) { return Uint8Array.from(arr, (b) => (b < 0 ? b + 256 : b)); }

function formatarData(d, tz, f) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz || TZ_PADRAO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
}

export function criarRunner({ CODE, ABAS_DE_FORA = ['Historico'], crypto, XLSX, Buffer }) {
  const NOMES = ['SpreadsheetApp', 'PropertiesService', 'CacheService', 'LockService', 'Logger', 'Utilities', 'HtmlService', 'ContentService',
    'UrlFetchApp', 'MailApp', 'GmailApp', 'ScriptApp', 'Drive', 'DriveApp', '__DB', '__XLSX_ABAS'];
  const fabrica = new Function(...NOMES, CODE + '\n' + SOBRESCRITAS + '\nreturn {' + FUNCOES_EXPOSTAS.map((f) => `${f}: typeof ${f} === 'function' ? ${f} : null`).join(',') + ', ABAS: ABAS, CFG_PADRAO: CFG_PADRAO };');

  /** estado = {abas:{nome:[[...]]}, props:{k:v}, cache:{k:{v,exp}}, urls:{url:texto}} */
  function instanciar(estado) {
    const sujas = new Set(), historico = [], cacheMud = {}, propsMud = {}, emails = [];
    const __DB = {
      ler(n) {
        if (ABAS_DE_FORA.includes(n)) return [];
        const h = ABAS[n]; const L = estado.abas[n] || [];
        return L.map((r, i) => { const o = { _row: i + 2 }; h.forEach((k, j) => { o[k] = r[j] == null ? '' : String(r[j]); }); return o; });
      },
      tudo(n, linhas) { estado.abas[n] = linhas; sujas.add(n); },
      linha(n, row, linha) {
        const L = estado.abas[n] = estado.abas[n] || [];
        const i = row ? row - 2 : L.length;
        while (L.length < i) L.push(ABAS[n].map(() => ''));
        L[i] = linha; sujas.add(n); return i + 2;
      },
      historico(l) { historico.push(l.map(String)); },
    };
    const Utilities = {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => bytesAssinados(crypto.createHash(alg).update(s, 'utf8').digest()),
      base64Encode: (b) => Buffer.from(typeof b === 'string' ? b : semSinal(b)).toString('base64'),
      base64Decode: (s) => bytesAssinados(Buffer.from(s, 'base64')),
      formatDate: formatarData,
      newBlob: (dados, tipo, nome) => {
        const txt = typeof dados === 'string' ? dados : null;
        return { getAs: () => ({ getBytes: () => bytesAssinados(Buffer.from(txt || '')), __html: txt }), getBytes: () => (txt != null ? bytesAssinados(Buffer.from(txt)) : dados), getDataAsString: () => txt };
      },
      sleep() {},
    };
    const props = {
      getProperty: (k) => (k in propsMud ? propsMud[k] : estado.props[k] != null ? estado.props[k] : null),
      setProperty: (k, v) => { propsMud[k] = String(v); return props; },
      deleteProperty: (k) => { propsMud[k] = null; return props; },
      getProperties: () => Object.assign({}, estado.props, propsMud),
    };
    const agoraMs = Date.now();
    const cacheGet = (k) => { const x = k in cacheMud ? cacheMud[k] : estado.cache[k]; return x && x.exp > agoraMs ? x.v : null; };
    const cache = {
      get: cacheGet,
      put: (k, v, seg) => { cacheMud[k] = { v: String(v), exp: agoraMs + 1000 * Math.min(+seg || 600, 21600) }; },
      remove: (k) => { cacheMud[k] = null; },
    };
    const semGoogle = (o) => () => { throw new Error(o + ' não está disponível nesta versão do sistema.'); };
    const UrlFetchApp = {
      fetch(url) {
        const chave = String(url).replace(/([?&])t=\d+&?/, '$1').replace(/[?&]$/, '');
        const txt = estado.urls[chave] != null ? estado.urls[chave] : estado.urls[url];
        if (txt == null) throw new Error('Endereço externo não carregado: ' + chave);
        return { getContentText: () => txt, getResponseCode: () => 200, getContent: () => bytesAssinados(Buffer.from(txt)) };
      },
    };
    const MailApp = { sendEmail: (o) => { emails.push(o); }, getRemainingDailyQuota: () => 100 };
    const ScriptApp = { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ create() {} }), everyMinutes: () => ({ create() {} }) }) }) };
    const xlsxAbas = (d) => {
      if (!d.base64) throw new Error('Arquivo vazio.');
      const wb = XLSX.read(Buffer.from(d.base64, 'base64'), { type: 'buffer', raw: false, cellDates: false });
      return wb.SheetNames.map((n) => ({ nome: n, valores: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }).map((r) => r.map((x) => (x == null ? '' : String(x)))) }));
    };
    const G = fabrica(
      { openById: semGoogle('SpreadsheetApp'), create: semGoogle('SpreadsheetApp') },
      { getScriptProperties: () => props }, { getScriptCache: () => cache },
      { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
      { log: (...a) => console.log(...a) }, Utilities,
      { createTemplateFromFile: semGoogle('HtmlService'), createHtmlOutputFromFile: semGoogle('HtmlService') },
      { createTextOutput: semGoogle('ContentService'), MimeType: {} },
      UrlFetchApp, MailApp, MailApp, ScriptApp, { Files: { create: semGoogle('Drive'), remove() {} } }, { getFileById: semGoogle('DriveApp') },
      __DB, xlsxAbas);
    ABAS = G.ABAS;
    return { G, sujas, historico, cacheMud, propsMud, emails };
  }
  let ABAS = null;
  return {
    instanciar,
    abas: () => ABAS,
  };
}

/** Ações que só leem (rodam sem trava; se por acaso gravarem algo, rodam de novo com a trava). */
export const LEITURAS = new Set(['carregar', 'feriasDados', 'usuarios', 'minhaEscala', 'centralFeed', 'converterPlanilha']);
/** Ações que leem endereços externos (sistema de férias anterior). */
export const COM_URLS = new Set(['sincFerias', 'feriasMigrar', 'sincFeriasAuto', '__sincAuto', 'feriasImportarDP']);

export function urlsDoSistemaFerias(cfgLinhas) {
  const cfg = {}; (cfgLinhas || []).forEach((r) => { cfg[r[0]] = r[1]; });
  const sis = String(cfg.FERIAS_SISTEMA_URL || '').trim(), api = String(cfg.FERIAS_API_URL || '').trim();
  const out = [];
  if (sis) out.push(sis);
  if (api) out.push(api + (api.indexOf('?') < 0 ? '?' : '&') + 'api=get');
  return out;
}

/**
 * Executa uma chamada da API. `banco` faz a persistência:
 *  banco.carregar() -> estado; banco.gravar(estado, mudancas) ; banco.travado(fn) roda fn dentro de transação com trava.
 */
export async function executar(runner, banco, { token, acao, dados }, buscar) {
  const rodar = async (b) => {
    const estado = await b.carregar();
    estado.urls = {};
    if (COM_URLS.has(acao)) {
      for (const u of urlsDoSistemaFerias(estado.abas.Config)) {
        try { estado.urls[u] = await buscar(u); } catch (e) { /* o próprio código mostra o erro */ }
      }
    }
    const inst = runner.instanciar(estado);
    const r = acao === '__sincAuto' ? (inst.G.sincFeriasAuto && inst.G.sincFeriasAuto(), { ok: true }) : inst.G.api(token, acao, dados);
    return { r, inst, estado };
  };
  if (LEITURAS.has(acao)) {
    const x = await rodar(banco);
    const mudou = x.inst.sujas.size || x.inst.historico.length || Object.keys(x.inst.propsMud).length;
    if (!mudou) { await banco.gravarCache(x.inst.cacheMud); return x.r; }
  }
  return banco.travado(async (tx) => {
    const x = await rodar(tx);
    await tx.gravarCache(x.inst.cacheMud);
    if (x.r && x.r.ok !== false) await tx.gravar(x.estado, x.inst);
    return x.r;
  });
}
