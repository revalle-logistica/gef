// Junta o código em 2 arquivos para colar no editor do Apps Script:
//   apps-script/Codigo.gs   (todo o servidor)
//   apps-script/Index.html  (tela completa)
// Uso: node tools/build.js
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'src'), out = path.join(__dirname, '..', 'apps-script');
fs.mkdirSync(out, { recursive: true });
const gs = ['Code.gs', 'Auth.gs', 'Escalas.gs', 'Export.gs', 'Regras.gs']
  .map(f => `// ===================== ${f} =====================\n` + fs.readFileSync(path.join(src, f), 'utf8')).join('\n\n');
fs.writeFileSync(path.join(out, 'Codigo.gs'), '// GERADO por tools/build.js a partir de src/. Edite em src/ e rode o build.\n\n' + gs);
let html = fs.readFileSync(path.join(src, 'Index.html'), 'utf8')
  .replace("<?!= include('Styles') ?>", () => fs.readFileSync(path.join(src, 'Styles.html'), 'utf8'))
  .replace("<?!= include('App') ?>", () => fs.readFileSync(path.join(src, 'App.html'), 'utf8'));
fs.writeFileSync(path.join(out, 'Index.html'), html);
fs.copyFileSync(path.join(src, 'appsscript.json'), path.join(out, 'appsscript.json'));
console.log('apps-script/ atualizado:', fs.readdirSync(out).join(', '));
