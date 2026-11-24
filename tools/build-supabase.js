// Gera a Edge Function do Supabase a partir de apps-script/ (rode depois de tools/build.js).
// supabase/functions/gef/codigo.js = Codigo.gs como texto; app.js = a tela (Index.html já com as regras embutidas).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const raiz = path.join(__dirname, '..'), dest = path.join(raiz, 'supabase/functions/gef');
const CODE = fs.readFileSync(path.join(raiz, 'apps-script/Codigo.gs'), 'utf8');
(async () => {
  const { criarRunner } = await import(path.join(dest, 'runner.js'));
  const r = criarRunner({ CODE, crypto, XLSX: null, Buffer });
  const inst = r.instanciar({ abas: {}, props: {}, cache: {}, urls: {} });
  let html = fs.readFileSync(path.join(raiz, 'apps-script/Index.html'), 'utf8');
  html = html.replace('<?!= regrasFonte() ?>', () => inst.G.regrasFonte());
  if (/<\?/.test(html)) throw new Error('Sobrou scriptlet no Index.html');
  html = html.replace('<head>', '<head>\n<title>GEF - Gestão de Férias e Escala</title><link rel="icon" href="https://revalle-logistica.github.io/gef/favicon-32.png"><meta name="viewport" content="width=device-width, initial-scale=1">');
  fs.writeFileSync(path.join(raiz, 'supabase/app.html'), html);
  console.log('supabase/app.html (' + html.length + ') — a função lê apps-script/Codigo.gs e supabase/app.html do GitHub, na versão (commit) fixada em index.ts');
})().catch((e) => { console.error(e); process.exit(1); });
