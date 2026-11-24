// GEF - Gestão de Férias e Escala · servidor no Supabase.
// GET  ?raw=1 → a tela (o index.html do GitHub Pages carrega por aqui)
// POST {token, acao, dados} → API (mesmo formato do Apps Script)
import postgres from 'npm:postgres@3.4.5';
import * as XLSX from 'npm:xlsx@0.18.5';
import { Buffer } from 'node:buffer';
import * as crypto from 'node:crypto';
import { criarRunner, executar } from './runner.js';
import { bancoPg } from './banco.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 4, idle_timeout: 20 });
const banco = bancoPg(sql);
// Versão do sistema: commit do repositório revalle-logistica/gef (imutável). Para publicar, troque e reimplante.
const VERSAO = Deno.env.get('GEF_VERSAO') || '7c3d077d5928f3e3ef1229ad778e965786148007';
const BASE = 'https://raw.githubusercontent.com/revalle-logistica/gef/' + VERSAO + '/';
let runner: any = null, APP = '', pronto: Promise<void> | null = null;
function preparar() {
  pronto = pronto || (async () => {
    const [c, a] = await Promise.all([fetch(BASE + 'apps-script/Codigo.gs'), fetch(BASE + 'supabase/app.html')]);
    if (!c.ok || !a.ok) throw new Error('Não consegui baixar a versão ' + VERSAO);
    const CODE = await c.text(); APP = await a.text();
    runner = criarRunner({ CODE, crypto, XLSX, Buffer });
  })().catch((e) => { pronto = null; throw e; });
  return pronto;
}
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info' };
const resp = (corpo: string, tipo = 'application/json', status = 200) => new Response(corpo, { status, headers: { ...CORS, 'Content-Type': tipo + '; charset=utf-8', 'Cache-Control': 'no-store' } });
const buscar = async (u: string) => { const r = await fetch(u, { redirect: 'follow' }); return await r.text(); };

// E-mails: o Apps Script antigo (mesma conta Google que enviava antes) busca cada e-mail da fila uma única vez e envia.
const RELE_EMAIL = 'https://script.google.com/macros/s/AKfycbyeGlvF5tbICPZGpNLu6FOmSRj4k-5q9trZbEKekanPrRRjJ7Q0Zdmflh7yTIAb9M9H7g/exec';
async function chamarRele(id: string) {
  try {
    const r = await fetch(RELE_EMAIL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao: '__enviarEmail', dados: { id } }) });
    const t = await r.text();
    if (!/"ok":true/.test(t)) await sql`update gef.emails set erro = ${t.slice(0, 500)} where id = ${id}`;
  } catch (e) { await sql`update gef.emails set erro = ${String(e).slice(0, 500)} where id = ${id}`; }
}
const aoEnviarEmails = async (ids: string[]) => {
  const p = Promise.all(ids.map(chamarRele));
  // @ts-ignore EdgeRuntime existe no Supabase: envia sem segurar a resposta da tela
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(p); else await p;
};
/** Entrega o e-mail ao Apps Script uma única vez (depois disso o id não devolve mais nada). */
async function retirarEmail(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false };
  const [e] = await sql`update gef.emails set status = 'RETIRADO', retirado = now() where id = ${id} and status = 'PENDENTE' and criado > now() - interval '2 hours' returning para, assunto, html, nome`;
  return e ? { ok: true, email: e } : { ok: false };
}

/** Migração da planilha: só aceita enquanto gef.controle.migracao_aberta = '1' (liberado por SQL na hora da virada). */
async function importar(b: any) {
  const [ctl] = await sql`select v from gef.controle where k = 'migracao_aberta'`;
  if (!ctl || ctl.v !== '1') return { ok: false, erro: 'Migração fechada.' };
  const inst = runner.instanciar({ abas: {}, props: {}, cache: {}, urls: {} });
  const ABAS = inst.G.ABAS, CFG = inst.G.CFG_PADRAO;
  const abas = b.abas || {};
  const cfg = (abas.Config || []).map((r: any[]) => r.slice(0, 3));
  const tem = new Set(cfg.map((r: any[]) => r[0]));
  CFG.forEach((c: any[]) => { if (!tem.has(c[0])) cfg.push(c.map(String)); });
  abas.Config = cfg;
  const res: any = { abas: {}, historico: 0 };
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(52520)`;
    for (const n of Object.keys(ABAS)) {
      if (n === 'Historico') continue;
      const L = (abas[n] || []).map((r: any[]) => ABAS[n].map((_: any, j: number) => (r[j] == null ? '' : String(r[j]))));
      await tx`insert into gef.abas (nome, linhas, atualizado) values (${n}, ${tx.json(L)}, now()) on conflict (nome) do update set linhas = excluded.linhas, atualizado = now()`;
      res.abas[n] = L.length;
    }
    await tx`truncate gef.historico restart identity`;
    const H = (abas.Historico || []).map((h: any[]) => ({ quando: String(h[0] ?? ''), usuario: String(h[1] ?? ''), matricula: String(h[2] ?? ''), acao: String(h[3] ?? ''), detalhe: String(h[4] ?? '') }));
    for (let i = 0; i < H.length; i += 2000) await tx`insert into gef.historico ${tx(H.slice(i, i + 2000), 'quando', 'usuario', 'matricula', 'acao', 'detalhe')}`;
    res.historico = H.length;
    for (const [k, v] of Object.entries(b.props || {})) {
      if (['DB_ID', 'DB_VER', 'MIG_1024'].includes(k)) continue;
      await tx`insert into gef.props (k, v) values (${k}, ${String(v)}) on conflict (k) do update set v = excluded.v`;
    }
  });
  return { ok: true, data: res };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return resp('ok', 'text/plain');
  const url = new URL(req.url);
  try {
    await preparar();
    if (req.method === 'GET') {
      if (url.searchParams.get('raw')) return resp(APP, 'text/plain');
      if (url.searchParams.get('email')) return resp(JSON.stringify(await retirarEmail(String(url.searchParams.get('email')))));
      if (url.searchParams.get('cron') === 'ferias') return resp(JSON.stringify(await executar(runner, banco, { token: '', acao: '__sincAuto', dados: {} }, buscar)));
      return resp(JSON.stringify({ ok: true, sistema: 'GEF', versao: VERSAO }));
    }
    const b = JSON.parse((await req.text()) || '{}');
    if (b.acao === '__importar') return resp(JSON.stringify(await importar(b)));
    const r = await executar(runner, banco, { token: b.token, acao: String(b.acao || ''), dados: b.dados || {} }, buscar, aoEnviarEmails);
    return resp(JSON.stringify(r));
  } catch (e) {
    console.error(e);
    return resp(JSON.stringify({ ok: false, erro: 'Falha no servidor. Tente de novo em instantes.' }));
  }
});
