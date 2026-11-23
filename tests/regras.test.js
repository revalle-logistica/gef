// Testes das regras legais: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ctxVm = {};
vm.createContext(ctxVm);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'Regras.gs'), 'utf8'), ctxVm);
const { validarEscala, semanaModelo, calcDia, assinaturaEscala, situacaoLiberacao } = ctxVm;

const cfg = {
  DATA_INICIO_5X2: '2026-12-15', LIMITE_SEMANAL_TRANSICAO: '42', DATA_40H: '2027-12-15',
  LIMITE_SEMANAL_FINAL: '40', DIARIO_MAX_TRANSICAO: '10', DIARIO_MAX_FINAL: '8',
  DOMINGO_FOLGA: 'S', TELE_DIARIO: '6', TELE_SEMANAL: '30'
};
const v = (dias, extra = {}) => validarEscala({ vigencia: '2026-12-16', dias, ...extra }, { cfg, tele: !!extra.tele });
const erros = r => r.msgs.filter(m => m.nivel === 'erro').map(m => m.texto).join(' | ');

test('padrão 8h24 seg-sex com 1h de intervalo é OK (42h)', () => {
  const r = v(semanaModelo(5, '07:00', '16:24', 60));
  assert.strictEqual(r.status, 'OK', erros(r));
  assert.strictEqual(r.total, 42 * 60);
});

test('acima de 42h na transição dá erro', () => {
  const r = v(semanaModelo(5, '07:00', '16:30', 60));
  assert.strictEqual(r.status, 'ERRO');
  assert.match(erros(r), /limite/);
});

test('na fase de 40h, 8h24/dia dá erro', () => {
  const r = validarEscala({ vigencia: '2028-01-03', dias: semanaModelo(5, '07:00', '16:24', 60) }, { cfg });
  assert.strictEqual(r.status, 'ERRO');
  assert.match(erros(r), /máximo diário/);
});

test('domingo trabalhado é permitido (só aviso de revezamento)', () => {
  const d = semanaModelo(2, '07:00', '15:00', 60); d[6] = { tipo: 'T', ent: '07:00', sai: '15:00', int: 60 }; d[5] = { tipo: 'F' };
  const r = v(d);
  assert.doesNotMatch(erros(r), /Domingo/);
  assert.ok(r.msgs.some(m => m.nivel === 'info' && /domingo/i.test(m.texto || m.msg || '')));
});

test('lote com folgas segunda e terça (domingo trabalhado)', () => {
  const d = semanaModelo(1, '07:00', '15:00', 60, 0);
  assert.strictEqual(d.map(x => x.tipo).join(''), 'FFTTTTT');
  assert.strictEqual(erros(v(d)), '');
});

test('6 dias de trabalho dá erro', () => {
  const d = semanaModelo(5, '07:00', '13:00', 15); d[5] = { tipo: 'T', ent: '07:00', sai: '13:00', int: 15 };
  assert.match(erros(v(d)), /5 dias de trabalho/);
});

test('intervalo menor que 1h acima de 6h dá erro', () => {
  assert.match(erros(v(semanaModelo(5, '07:00', '15:30', 30))), /art. 71/);
});

test('interjornada menor que 11h dá erro', () => {
  const d = semanaModelo(5, '14:00', '22:00', 60); d[1] = { tipo: 'T', ent: '06:00', sai: '14:00', int: 60 };
  assert.match(erros(v(d)), /11h/);
});

test('turno noturno atravessando a meia-noite calcula certo e avisa', () => {
  const r = v(semanaModelo(5, '22:00', '06:24', 60));
  assert.strictEqual(calcDia({ tipo: 'T', ent: '22:00', sai: '06:24', int: 60 }).liquido, 444);
  assert.ok(r.msgs.some(m => m.nivel === 'info' && /22h/.test(m.texto)));
});

test('teleatendimento: 6h/dia OK, 8h dá erro', () => {
  assert.strictEqual(v(semanaModelo(5, '08:00', '14:15', 15), { tele: true }).status, 'OK');
  assert.match(erros(v(semanaModelo(5, '08:00', '17:00', 60), { tele: true })), /teleatendimento/);
});

test('vigência antes de 15/12/2026 gera alerta', () => {
  const r = validarEscala({ vigencia: '2026-12-01', dias: semanaModelo(5, '07:00', '16:24', 60) }, { cfg });
  assert.strictEqual(r.status, 'ALERTA');
});

test('visões pelos campos de cadastro', () => {
  const { visaoColaborador: v, pendenciasCadastro: p } = ctxVm;
  assert.strictEqual(v({ setor: 'Armazém', funcao: 'CONFERENTE JR', turno: 'Turno 2' }).grupo, 'Turno 2');
  assert.strictEqual(v({ setor: 'Armazém', funcao: 'ASSISTENTE DE LOGISTICA JR', turno: 'Administrativo' }).area, 'adm');
  assert.strictEqual(v({ setor: 'Entrega', funcao: 'MOTORISTA', lotacao: 'Sede', tipoMot: 'Puxador' }).grupo, 'Puxadores da sede');
  assert.strictEqual(v({ setor: 'Entrega', funcao: 'MOTORISTA', lotacao: 'Irará', tipoMot: 'Puxador' }).grupo, 'Residentes · Irará');
  assert.strictEqual(v({ setor: 'Entrega', funcao: 'AJUDANTE DE ENTREGA', lotacao: 'Ouricangas' }).grupo, 'Ouricangas');
  assert.strictEqual(v({ setor: 'Entrega', funcao: 'SUPERVISOR DE DISTRIBUIÇÃO JR I' }).area, 'adm');
  assert.deepStrictEqual([...p({ setor: 'Entrega', funcao: 'MOTORISTA' })], ['sede/ponto', 'rota/puxador', 'supervisor']);
});

test('semana real: férias e feriado', () => {
  const { semanaEfetiva: se, avisosSemana: av, segundaDaSemana: sg } = ctxVm;
  assert.strictEqual(sg('2026-12-25'), '2026-12-21');
  const esc = { vigencia: '2026-12-15', dias: semanaModelo(5, '07:00', '16:24', 60) };
  const s = se(esc, '2026-12-21', [{ inicio: '2026-12-21', fim: '2026-12-22' }], [{ data: '2026-12-25', descricao: 'Natal' }]);
  assert.strictEqual(s.map(d => d.tipo).join(','), 'FER,FER,T,T,T,F,F');
  assert.strictEqual(av(s).length, 1);
  assert.strictEqual(se(esc, '2026-12-07', [], []).every(d => d.tipo === 'N'), true);
});

test('ajuste de um dia vale só naquele dia e entra na conferência', () => {
  const { semanaEfetiva: se, validarSemanaReal: vs } = ctxVm;
  const esc = { vigencia: '2026-12-15', dias: semanaModelo(5, '07:00', '16:24', 60) };
  const aj = { '2027-01-09': { tipo: 'T', ent: '07:00', sai: '16:24', int: 60 } };
  const s = se(esc, '2027-01-04', [], [], aj);
  assert.strictEqual(s.map(d => d.tipo).join(','), 'T,T,T,T,T,T,F');
  assert.strictEqual(vs(s, { cfg }).status, 'ERRO');
  aj['2027-01-08'] = { tipo: 'F' };
  assert.strictEqual(vs(se(esc, '2027-01-04', [], [], aj), { cfg }).status, 'OK');
  assert.strictEqual(se(esc, '2027-01-11', [], [], aj)[5].tipo, 'F');
});

test('máximo diário: 10h24 em geral e 12h24 para motorista/ajudante de entrega', () => {
  const cf = Object.assign({}, cfg, { DIARIO_MAX_TRANSICAO: '10:24', DIARIO_MAX_ENTREGA: '12:24', LIMITE_SEMANAL_TRANSICAO: 60 });
  const dia = (ent, sai) => ({ tipo: 'T', ent, sai, int: 60 });
  const esc = s => ({ vigencia: '2026-12-21', dias: [dia('06:00', s), dia('07:00', '16:24'), dia('07:00', '16:24'), dia('07:00', '16:24'), dia('07:00', '16:24'), { tipo: 'F' }, { tipo: 'F' }] });
  const errDia = v => v.msgs.filter(m => m.nivel === 'erro' && /máximo diário/.test(m.texto)).length;
  assert.strictEqual(errDia(ctxVm.validarEscala(esc('17:24'), { cfg: cf })), 0);            // 10h24 ok
  assert.strictEqual(errDia(ctxVm.validarEscala(esc('17:30'), { cfg: cf })), 1);            // 10h30 passa
  assert.strictEqual(errDia(ctxVm.validarEscala(esc('19:24'), { cfg: cf, entrega: true })), 0); // 12h24 ok entrega
  assert.strictEqual(errDia(ctxVm.validarEscala(esc('19:30'), { cfg: cf, entrega: true })), 1);
  assert.strictEqual(ctxVm.minutosCfg('10'), 600); assert.strictEqual(ctxVm.minutosCfg('10h24'), 624);
  assert.ok(ctxVm.ehEntregaCampo({ setor: 'ENTREGA', funcao: 'AJUDANTE DE ENTREGA' }));
  assert.ok(!ctxVm.ehEntregaCampo({ setor: 'ENTREGA', funcao: 'ASSISTENTE ADMINISTRATIVO' }));
});

test('departamento próprio vira aba separada; administrativo da logística mantém a aba adm', () => {
  const v = ctxVm.visaoColaborador({ setor: 'Departamento · Vendas', funcao: 'VENDEDOR' });
  assert.strictEqual(v.area, 'p_vendas'); assert.strictEqual(v.areaNome, 'Vendas'); assert.ok(v.proprio);
  assert.strictEqual(ctxVm.visaoColaborador({ setor: 'Departamento · Puxada', funcao: 'X' }).area, 'p_puxada');
  const a = ctxVm.visaoColaborador({ setor: 'Administrativo · Logistica', funcao: 'ASSISTENTE' });
  assert.strictEqual(a.area, 'adm'); assert.strictEqual(a.areaNome, 'Administrativo-Logística');
  assert.strictEqual(ctxVm.pendenciasCadastro({ setor: 'Departamento · Vendas', funcao: 'VENDEDOR', supervisor: 's' }).length, 0);
});

test('escala por período: data a data, sobreposição e volta ao padrão anterior', () => {
  const A = ctxVm.semanaModelo(5, '07:00', '16:24', 60), B = ctxVm.semanaModelo(2, '06:00', '15:24', 60);
  let L = [{ vigencia: '2026-12-14', ate: '', dias: A }];
  L = ctxVm.aplicarPeriodo(L, { vigencia: '2027-01-04', ate: '2027-02-28', dias: B });
  assert.strictEqual(JSON.stringify(L.map(p => [p.vigencia, p.ate])), JSON.stringify([['2026-12-14', '2027-01-03'], ['2027-01-04', '2027-02-28'], ['2027-03-01', '']]));
  const esc = { periodos: L };
  assert.strictEqual(ctxVm.periodoNaData(esc, '2027-02-10').vigencia, '2027-01-04');
  assert.strictEqual(ctxVm.periodoNaData(esc, '2027-03-02').dias, A);
  // quarta 06/01/2027 é folga no padrão B (folga na quarta)
  assert.strictEqual(ctxVm.diaEfetivo(esc, '2027-01-06', [], [], {}).tipo, 'F');
  assert.strictEqual(ctxVm.diaEfetivo(esc, '2027-01-07', [], [], {}).ent, '06:00');
  // só um período com fim: depois dele fica sem escala
  const so = { periodos: [{ vigencia: '2027-01-04', ate: '2027-01-31', dias: B }] };
  const d = ctxVm.diaEfetivo(so, '2027-02-02', [], [], {});
  assert.strictEqual(d.tipo, 'N'); assert.strictEqual(d.depois, '2027-01-31');
  assert.strictEqual(ctxVm.diaEfetivo(so, '2027-01-01', [], [], {}).antes, '2027-01-04');
  // formato antigo continua valendo
  assert.strictEqual(ctxVm.diaEfetivo({ vigencia: '2026-12-14', dias: A }, '2027-05-04', [], [], {}).tipo, 'T');
});

test('assinatura e situação da liberação para o DP', () => {
  const e = { periodos: [{ vigencia: '2026-12-14', ate: '', dias: semanaModelo(5, '07:00', '15:20', 60) }] };
  const a = assinaturaEscala(e);
  assert.ok(a);
  assert.strictEqual(situacaoLiberacao(null, null), 'SEM');
  assert.strictEqual(situacaoLiberacao(e, null), 'NAO');
  assert.strictEqual(situacaoLiberacao(e, { assinatura: a }), 'OK');
  const e2 = JSON.parse(JSON.stringify(e)); e2.periodos[0].dias[0].ent = '08:00';
  assert.notStrictEqual(assinaturaEscala(e2), a);
  assert.strictEqual(situacaoLiberacao(e2, { assinatura: a }), 'PEND');
});

test('semana de domingo a sábado: folga dom + qui, trabalha o resto é OK', () => {
  const { inicioSemana, semanaEfetiva, validarSemanaReal, diaSemanaIso } = ctxVm;
  assert.strictEqual(inicioSemana('2026-12-24'), '2026-12-20');
  assert.strictEqual(inicioSemana('2026-12-20'), '2026-12-20');
  assert.strictEqual(inicioSemana('2026-12-26'), '2026-12-20');
  const T = { tipo: 'T', ent: '07:00', sai: '15:20', int: 60 }, F = { tipo: 'F' };
  // padrão seg..dom: folga quinta e domingo
  const esc = { periodos: [{ vigencia: '2026-12-13', dias: [T, T, T, F, T, T, F] }], vigencia: '2026-12-13', dias: [T, T, T, F, T, T, F] };
  const sem = semanaEfetiva(esc, inicioSemana('2026-12-22'), [], [], {});
  assert.strictEqual(sem[0].data, '2026-12-20');
  assert.strictEqual(diaSemanaIso(sem[0].data), 6);
  const r = validarSemanaReal(sem, { cfg });
  assert.ok(r, 'semana conferida');
  assert.notStrictEqual(r.status, 'ERRO', JSON.stringify(r.msgs));
});
