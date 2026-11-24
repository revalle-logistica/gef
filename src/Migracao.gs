/**
 * Mudança para o Supabase.
 * 1) entrarManutencao()  → o sistema avisa "em atualização" e não aceita alterações (nada se perde no meio da cópia).
 * 2) migrarParaSupabase() → copia TODAS as abas da planilha + propriedades para o Supabase.
 * 3) ligarEncaminhamento() → este Apps Script passa a só repassar as chamadas para o Supabase
 *    (o link antigo, a Central de Demandas e quem estiver com a tela antiga aberta continuam funcionando).
 * Voltar atrás: desligarEncaminhamento() + sairManutencao().
 */
const SUPABASE_GEF = 'https://krlkencgakuaisyrxeho.supabase.co/functions/v1/gef';

function entrarManutencao() { PropertiesService.getScriptProperties().setProperty('MANUTENCAO', '1'); Logger.log('Em manutenção.'); }
function sairManutencao() { PropertiesService.getScriptProperties().deleteProperty('MANUTENCAO'); Logger.log('Fora de manutenção.'); }
function ligarEncaminhamento() { PropertiesService.getScriptProperties().setProperty('ENCAMINHAR_PARA', SUPABASE_GEF); Logger.log('Encaminhando para ' + SUPABASE_GEF); }
function desligarEncaminhamento() { PropertiesService.getScriptProperties().deleteProperty('ENCAMINHAR_PARA'); Logger.log('Encaminhamento desligado.'); }

/** Chamado no começo de api(): devolve a resposta do Supabase, o aviso de manutenção, ou null (segue normal). */
function desvio_(token, acao, dados) {
  const p = PropertiesService.getScriptProperties();
  const alvo = p.getProperty('ENCAMINHAR_PARA');
  if (alvo) {
    const r = UrlFetchApp.fetch(alvo, { method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify({ token: token, acao: acao, dados: dados || {} }), muteHttpExceptions: true });
    try { return JSON.parse(r.getContentText()); } catch (e) { return { ok: false, erro: 'Falha ao falar com o servidor novo. Tente de novo.' }; }
  }
  if (p.getProperty('MANUTENCAO')) return { ok: false, erro: 'O GEF está sendo atualizado agora. Volte em alguns minutos — nada do que já foi salvo se perde.' };
  return null;
}

function migrarParaSupabase() {
  const s = ss_(), abas = {};
  Object.keys(ABAS).forEach(function (n) {
    const sh = s.getSheetByName(n), h = ABAS[n];
    if (!sh || sh.getLastRow() < 2) { abas[n] = []; return; }
    abas[n] = sh.getRange(2, 1, sh.getLastRow() - 1, h.length).getDisplayValues()
      .filter(function (r) { return r.some(function (x) { return x !== ''; }); });
  });
  const props = PropertiesService.getScriptProperties().getProperties();
  ['MANUTENCAO', 'ENCAMINHAR_PARA'].forEach(function (k) { delete props[k]; });
  const r = UrlFetchApp.fetch(SUPABASE_GEF, { method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify({ acao: '__importar', abas: abas, props: props }), muteHttpExceptions: true });
  const resumo = {}; Object.keys(abas).forEach(function (n) { resumo[n] = abas[n].length; });
  Logger.log('Enviado: ' + JSON.stringify(resumo));
  Logger.log('Resposta: ' + r.getContentText());
  return r.getContentText();
}
