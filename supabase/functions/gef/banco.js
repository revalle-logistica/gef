// Persistência no Postgres (schema gef). Funciona com postgres.js (Deno: npm:postgres).
export function bancoPg(sql) {
  const de = (q) => ({
    async carregar() {
      const [abas, props, cache] = await Promise.all([
        q`select nome, linhas from gef.abas`,
        q`select k, v from gef.props`,
        q`select k, v, extract(epoch from expira) * 1000 as exp from gef.cache where expira > now()`,
      ]);
      return {
        abas: Object.fromEntries(abas.map((r) => [r.nome, r.linhas])),
        props: Object.fromEntries(props.map((r) => [r.k, r.v])),
        cache: Object.fromEntries(cache.map((r) => [r.k, { v: r.v, exp: +r.exp }])),
      };
    },
    async gravarCache(m) {
      for (const [k, x] of Object.entries(m || {})) {
        if (x == null) await q`delete from gef.cache where k = ${k}`;
        else await q`insert into gef.cache (k, v, expira) values (${k}, ${x.v}, to_timestamp(${x.exp / 1000})) on conflict (k) do update set v = excluded.v, expira = excluded.expira`;
      }
    },
    async gravarEmails(lista) {
      const linhas = lista.map((e) => ({ para: String(e.to || ''), assunto: String(e.subject || ''), html: String(e.htmlBody || e.body || ''), nome: String(e.name || '') }));
      const r = await q`insert into gef.emails ${q(linhas, 'para', 'assunto', 'html', 'nome')} returning id`;
      return r.map((x) => x.id);
    },
    async gravar(estado, inst) {
      for (const n of inst.sujas) {
        await q`insert into gef.abas (nome, linhas, atualizado) values (${n}, ${q.json(estado.abas[n])}, now()) on conflict (nome) do update set linhas = excluded.linhas, atualizado = now()`;
      }
      if (inst.historico.length) {
        const linhas = inst.historico.map((h) => ({ quando: h[0], usuario: h[1], matricula: h[2], acao: h[3], detalhe: h[4] }));
        await q`insert into gef.historico ${q(linhas, 'quando', 'usuario', 'matricula', 'acao', 'detalhe')}`;
      }
      for (const [k, v] of Object.entries(inst.propsMud)) {
        if (v == null) await q`delete from gef.props where k = ${k}`;
        else await q`insert into gef.props (k, v) values (${k}, ${v}) on conflict (k) do update set v = excluded.v`;
      }
    },
  });
  const b = de(sql);
  b.travado = (fn) => sql.begin(async (tx) => { await tx`select pg_advisory_xact_lock(52520)`; return fn(de(tx)); });
  return b;
}
