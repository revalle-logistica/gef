# Escala 5x2 · Revalle

**No ar:** https://revalle-logistica.github.io/gef/
O projeto Apps Script se chama "Escala 5x2" e fica na conta Log Agreste. A base de dados é a planilha "Escala 5x2 – Base do sistema", no Drive da mesma conta.

Sistema web para os supervisores montarem a escala semanal 5x2 de cada colaborador (5 dias de trabalho e 2 folgas, com domingo de folga), conferindo as regras da nova jornada. O sistema roda em **Google Apps Script**, com a página publicada no **GitHub Pages**, e os dados ficam numa **Planilha Google** da sua conta. Não é preciso importar nem juntar arquivos dos supervisores: todo mundo grava na mesma base.

## O que o sistema faz

| Quem | O que faz |
|---|---|
| **Administrador** | Importa a planilha do DP, aprova os cadastros dos supervisores e define quais revendas e setores cada um vê, acompanha o painel e ajusta os parâmetros legais. |
| **Supervisor** | Cria o próprio login e senha, espera a aprovação e monta as escalas da sua equipe (uma a uma ou em lote). |
| **Todos** | Exportam em **Excel** e **PDF**, por colaborador ou em lote. |

- **Acesso sem conta Google:** cada pessoa cria login e senha, e o administrador aprova. O **primeiro cadastro** feito no sistema vira administrador automaticamente. O login pode ser o e-mail da pessoa. Quando o acesso é aprovado, a pessoa recebe um **e-mail de aviso**, enviado pela conta dona do Apps Script, com o link do sistema e as revendas e setores liberados.
- **Base de colaboradores:** a mesma planilha de empregados do DP usada no QLP (aba *Empregados*). O sistema lê as colunas Código/Matrícula, Nome, Cargo/Função, Revenda, Centro de custo, Turno/Tipo, Ponto de apoio e Situação. Os nomes das colunas não precisam ser exatos. Quem está desligado não entra. Se o arquivo não tiver a coluna Revenda, o sistema sugere a revenda pelo nome do arquivo (AL, SE, PA, RP, JZ, BF, PE, BR) e você confirma.
- **Teleatendimento:** é só marcar o colaborador. A partir daí, valem 6h por dia e 30h por semana.
- **Visões:** a lista, o painel, o Excel e o PDF quadro são organizados em quatro visões. **Entrega** fica por ponto de apoio e função, e quem não tem ponto de apoio fica na Base. **Puxadores** separa os da base dos residentes de cada ponto. **Armazém** fica por turno (T1, T2, T3 e intermediários) e função. **Administrativo** junta todo o resto numa lista só. Para classificar, o sistema usa a mesma regra do QLP: Centro de custo, Turno/Tipo e Ponto de apoio. Em cada função aparece quantas pessoas trabalham em cada dia da semana.
- **Painel:** mostra o andamento por revenda e por setor, quantas pessoas trabalham em cada dia por função e a lista de pendências.

## Regras conferidas

Ficam em `src/Regras.gs`, com testes em `tests/regras.test.js`. A mesma regra roda na tela e no servidor.

| Regra | Base |
|---|---|
| 5 dias de trabalho e 2 folgas por semana | EC 141/2026 |
| Domingo de folga (parâmetro `DOMINGO_FOLGA`) | regra da empresa |
| Até 42h por semana a partir de 15/12/2026; 40h e 8h por dia depois da transição (`DATA_40H`) | EC 141/2026 |
| Na transição, até 10h por dia (8h + as 2h distribuídas) | EC 141/2026 |
| Intervalo de 1h a 2h acima de 6h; 15 min entre 4h e 6h | CLT, art. 71 |
| 11h entre duas jornadas | CLT, art. 66 |
| 35h seguidas de descanso na semana (24h + 11h) | CLT, art. 67, e Súmula 110 do TST |
| Teleatendimento: 6h por dia | NR-17, Anexo II |
| Aviso de trabalho noturno (22h às 5h) | CLT, art. 73 |

A escala com erro fica vermelha e, com `BLOQUEAR_ERRO = S`, não pode ser salva. **Confirme com o DP e o jurídico** a data da fase de 40h e qualquer regime diferente previsto em acordo ou convenção coletiva. Os dois são parâmetros na aba *Regras*.

## Instalação (mesmo modelo da Central de Demandas)

A página fica no **GitHub Pages** (`index.html` na raiz). Ela carrega a tela e conversa com o **Apps Script** pelo link `/exec`.

### 1. Apps Script
1. Em https://script.google.com, crie um **Novo projeto** com o nome "Escala 5x2".
2. Apague o conteúdo de `Código.gs` e cole o arquivo **`apps-script/Codigo.gs`**.
3. Crie um arquivo HTML com o nome **`Index`** (exatamente assim) e cole **`apps-script/Index.html`**.
4. Em ⚙️ Configurações do projeto, defina o fuso como **America/Bahia**.
5. Vá em **Implantar → Nova implantação → App da Web**, com Executar como **Eu** e Quem pode acessar **Qualquer pessoa**. Autorize e copie o link que termina em **`/exec`**.

Nas próximas versões, cole os dois arquivos de novo e use **Implantar → Gerenciar implantações → Editar → Nova versão**. Assim o link `/exec` continua o mesmo.

### 2. GitHub Pages
1. No `index.html`, troque `COLE_AQUI_O_LINK_EXEC` pelo link `/exec`.
2. Em Settings → Pages, escolha **Deploy from a branch → main → / (root)**.
3. O link para os supervisores fica `https://revalle-logistica.github.io/gef/`.

### 3. Primeiro acesso
Abra o link e clique em **Criar acesso**. Esse primeiro cadastro já entra como **administrador**. A planilha *Escala 5x2 – Base do sistema* é criada sozinha no seu Drive.

Depois, importe a planilha do DP em **Importar DP** e mande o link aos supervisores. Eles se cadastram, e você aprova em **Usuários**.

### Para quem mexe no código
O código é editado em `src/`. Depois rode `node tools/build.js`, que gera os dois arquivos de `apps-script/`. O GitHub Actions roda os testes das regras e confere se `apps-script/` está em dia.

## Estrutura
```
src/
  Code.gs        roteador, base de dados (planilha) e carga da tela
  Auth.gs        cadastro, login, sessão, aprovação de usuários
  Escalas.gs     importação do DP, salvar escala, lote, teleatendimento, parâmetros
  Export.gs      PDF (ficha por colaborador e quadro geral)
  Regras.gs      validação legal (usada no servidor e na tela)
  Index.html, Styles.html, App.html   interface
apps-script/     os 2 arquivos para colar no editor (gerados pelo build)
index.html       página do GitHub Pages
tools/build.js
tests/regras.test.js
```

## Dados e segurança
- As senhas ficam guardadas só como hash (SHA-256 com sal). Depois de 6 tentativas erradas, o login fica bloqueado por 15 minutos. A sessão dura 6h.
- O supervisor só recebe do servidor os colaboradores das revendas e dos setores liberados para ele.
- Toda alteração fica registrada na aba *Historico* da planilha (quem, quando e o quê).
- Planilhas de empregados (`*.xlsx`) estão no `.gitignore`, para não ir dado pessoal para o GitHub.

## Cadastro e vínculo com supervisor
1. **Importar DP:** envie o relatório "Relação de Empregados" de cada revenda. Só entram os departamentos de Armazém e Entrega, e só os colaboradores **novos**: quem já foi importado não muda. A exclusão é manual, pelo botão **Remover** na tela Cadastro. A chave de cada pessoa é empresa + código (por exemplo, AGRESTE-288), porque as empresas do grupo repetem códigos. Quando o navegador não consegue abrir o `.xls`, o arquivo é convertido pelo Google Drive (serviço avançado **Drive API v3** ativado no projeto).
2. **Cadastro:** para cada revenda, preencha:
   - **Armazém:** turno (lista no parâmetro `TURNOS_ARMAZEM`) e supervisor.
   - **Entrega:** sede ou ponto de apoio (cada revenda tem a sua lista de pontos, editada na própria tela) e supervisor. Para motorista, também rota ou puxador (`TIPOS_MOTORISTA`). Quem não é motorista nem ajudante fica como Administrativo.
   - Dá para preencher em lote, selecionando vários colaboradores. Os campos são mantidos quando um relatório novo é importado.
3. **Supervisor:** vê só os colaboradores vinculados a ele.

## Férias e feriados
- **Férias:** cadastradas por colaborador, no editor da escala, com início e fim. Quem está de férias aparece como FÉRIAS na semana e não conta na cobertura do dia.
- **Feriados:** cadastrados por unidade (revenda), na tela Cadastro. Dá para cadastrar à mão (com tipo e a opção "conta no alerta") ou **importar a planilha** com as colunas Data, Dia da semana, Feriado, Tipo, Validação, Conta no alerta e Observação. A unidade é lida do título "Feriados — Alagoinhas (AL)". Datas novas são incluídas e as que já existem são atualizadas. Quem tem trabalho num feriado recebe o alerta "folga compensatória na semana ou pagamento em dobro" (Lei 605/49).
- A lista de escalas, o painel, o Excel e os PDFs mostram a **semana escolhida**, com as datas.

## Visão do mês
Na aba **Mês**, o supervisor escolhe o mês e vê a grade de cada colaborador, dia a dia: padrão semanal, trocas feitas em datas específicas, férias e feriados.
- Clicar num dia permite trocar **só aquela data** (trabalho, folga ou horário). A troca é conferida na hora contra as regras da semana.
- Clicar no nome abre o padrão semanal.
- Cada semana do mês ganha um ponto de status (dentro das regras, com alerta ou com erro).
- Dá para exportar o **Excel do mês**, o **PDF do mês por colaborador** (em formato de calendário) e o **PDF quadro do mês**.
