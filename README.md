# Playwright + Jev: triagem automática de testes falhados

Projeto pequeno, feito para aprender, que junta uma suite **Playwright + TypeScript** com o **Jev**, o modelo System One da [TypeSafe](https://docs.typesafe.ai). Depois de cada execução, o Jev classifica cada teste falhado como `bug`, `flaky` ou `environment` e devolve a probabilidade de cada opção. O pipeline só falha quando existe um **bug** real.

## O que o projeto demonstra

- Uma app web mínima e local (`app/`), levantada pelo `webServer` do Playwright, sem depender de sites externos.
- 8 testes. 5 passam e 3 falham de propósito:

  | Teste | Tipo de falha | Como é provocada |
  |---|---|---|
  | `desconto de 10% é aplicado ao total` | 🐞 **bug** | A app aplica o desconto duas vezes (`app/public/index.html`) |
  | `o relatório carrega em menos de 1 segundo` | 🎲 **flaky** | `/api/report` responde com um atraso aleatório entre 0 e `FLAKY_MAX_DELAY_MS`, mas o teste só espera 1 s |
  | `o stock dos produtos é apresentado` | 🔌 **environment** | `/api/inventory` devolve 503 quando `FAKE_ENV_DOWN=1` |

- Triagem com o Jev (`triage/`): lê o relatório JSON do Playwright e faz uma pergunta `choice` por falha. Se o `confidence` ficar abaixo de um limiar, a falha passa a `needs_review`.
- **Histórico por teste**: o Jev recebe os resultados das execuções anteriores do mesmo teste. É o que lhe permite distinguir "falha sempre" (bug) de "falha às vezes" (flaky).
- **Allure 3** com a análise do Jev: categorias por veredicto, labels `jev_verdict`/`jev_confidence`, um resumo na descrição e um anexo com o state enviado ao Jev.
- Relatório Markdown em `triage-output/triage-report.md`, também escrito no **GitHub Step Summary**, e tudo publicado no **GitHub Pages**.
- Fallback: sem `TYPESAFE_API_KEY` não há chamadas à API, tudo fica `unclassified` e o pipeline continua.

## Onde o Jev entra no fluxo

```mermaid
flowchart LR
    A[npm test<br/>Playwright + Chromium] -->|test-results/results.json| B[report-parser.ts<br/>extrai falhas:<br/>nome, erro, stack, tentativas]
    P[(history.json<br/>execuções anteriores)] --> E
    B --> C{TYPESAFE_API_KEY?}
    C -- não --> D[unclassified<br/>sem chamadas à API]
    C -- sim --> E[★ jev-classifier.ts<br/>client.systemOne<br/>state = factos da falha<br/>choice: bug / flaky / environment]
    E --> F{confidence &ge; limiar?}
    F -- sim --> G[bug / flaky / environment]
    F -- não --> H[needs_review]
    D --> I[markdown.ts<br/>triage-report.md<br/>+ GITHUB_STEP_SUMMARY]
    G --> I
    H --> I
    G --> X[allure.ts<br/>labels + descrição + anexo<br/>em allure-results]
    H --> X
    X --> Y[Allure 3<br/>categorias por veredicto]
    I --> J{veredicto em<br/>TRIAGE_FAIL_ON?}
    J -- sim --> K[❌ job falha]
    J -- não --> L[✅ job passa<br/>com avisos]
```

O ficheiro mais importante para aprender é [`triage/jev-classifier.ts`](triage/jev-classifier.ts), que está comentado passo a passo:

1. **A pergunta**: uma `choice` com três opções. Cada opção é descrita com `what`, `signals` e `not_for`, porque as categorias confundem-se com facilidade.
2. **O state**: só factos observados, como o título, a mensagem de erro, um excerto do stack e a duração de cada tentativa. Inclui também `failure.history`, com os resultados das últimas execuções do mesmo teste. Os testes correm **sem retries** (`retries: 0`), por isso o histórico é o que separa um bug de um teste flaky (ver abaixo).
3. **A chamada**: `client.systemOne({ state, questions })`. A resposta vem tipada, com `choice`, `probabilities` e `confidence`.
4. **A política fica no nosso código**: se `confidence < limiar`, o veredicto é `needs_review`. O que faz o job falhar é decidido por `TRIAGE_FAIL_ON`.

O Jev não gera texto nem explicações. Devolve uma decisão estruturada e calibrada, e o código decide o que fazer com ela.

### Porque é que o histórico importa

Numa única execução, o teste flaky falha assim: "esperei 1 s e o texto nunca apareceu". Sem mais contexto, isto parece um bug. Foi o que aconteceu antes de haver histórico:

| Teste flaky | State enviado ao Jev | Resultado |
|---|---|---|
| sem histórico | só o erro desta execução | 🐞 bug (95%) |
| com histórico | erro + `❌❌❌❌❌✅✅✅✅` | 🎲 flaky (98%) |

O código não mudou a pergunta, só deu mais evidência ao Jev. Melhorar o **state** costuma valer mais do que afinar a pergunta.

- O histórico fica em [`triage/history.ts`](triage/history.ts): até 20 execuções por teste (`TRIAGE_HISTORY_SIZE`), incluindo as que passaram.
- Localmente vive em `.triage-history/history.json`. No CI é descarregado do GitHub Pages antes da triagem e republicado no deploy seguinte.
- O Jev vê só as execuções **anteriores**. A atual é acrescentada ao histórico depois da classificação.
- Nas primeiras execuções não há histórico, por isso a classificação do flaky depende da sorte. O histórico só acumula em push para `master` (os PRs leem-no, mas não o publicam).

## Allure 3

A triagem acrescenta a análise do Jev aos resultados do [`allure-playwright`](https://allurereport.org/docs/playwright/) ([`triage/allure.ts`](triage/allure.ts)):

- **Labels** `jev_verdict`, `jev_confidence` e uma tag `jev:<veredicto>`. Podes filtrar por eles no relatório.
- **Categorias** definidas em [`allurerc.mjs`](allurerc.mjs), uma por veredicto (🐞 Bug, 🎲 Flaky, 🔌 Environment, 👀 Needs review), através de matchers sobre o label `jev_verdict`.
- **Descrição** do teste com o veredicto e as probabilidades.
- **Anexo "Jev triage"** com o state exato que foi enviado ao Jev e a resposta. É a melhor forma de perceber porque é que o Jev decidiu o que decidiu.

O Allure guarda o seu próprio histórico (`.allure-history/history.jsonl`) para os trends e para a deteção de flaky do próprio Allure. No CI, esse ficheiro é persistido no Pages da mesma forma que o histórico da triagem.

```bash
npm run test:triage   # testes + triagem (enriquece allure-results)
npm run allure        # gera allure-report/
npm run allure:open   # serve o relatório no browser
```

## Correr localmente

Requisitos: Node 22.15 ou superior (recomendado: 24 LTS).

```bash
npm ci
npx playwright install chromium
cp .env.example .env        # FAKE_ENV_DOWN=1 já vem ligado
```

### Sem chave (fallback)

Deixa `TYPESAFE_API_KEY` vazio no `.env`:

```bash
npm run test:triage   # testes + triagem
npm run triage        # só a triagem sobre o último relatório
```

Todas as falhas aparecem como `unclassified` e o exit code é 0.

### Com chave

1. Cria uma chave em [console.typesafe.ai](https://console.typesafe.ai).
2. Coloca-a no `.env`:
   ```
   TYPESAFE_API_KEY=ts_...
   ```
3. Corre `npm run test:triage` e abre `triage-output/triage-report.md`.

O exit code passa a ser 1 se alguma falha for classificada como `bug`.

### Scripts

| Script | O que faz |
|---|---|
| `npm test` | Corre a suite Playwright (apenas Chromium) |
| `npm run triage` | Corre só a triagem sobre `test-results/results.json` |
| `npm run test:triage` | Corre os testes e depois a triagem, mesmo que haja testes a falhar |
| `npm run allure` | Gera o relatório Allure 3 em `allure-report/` (corre depois da triagem) |
| `npm run allure:open` | Serve o relatório Allure no browser |
| `npm run typecheck` | `tsc` sem gerar ficheiros |
| `npm start` | Arranca a app em http://localhost:3000 para a explorares à mão |

### Variáveis de ambiente

| Variável | Default | Para quê |
|---|---|---|
| `TYPESAFE_API_KEY` | – | Chave da API. Sem ela, a triagem corre em fallback |
| `TYPESAFE_DEFAULT_MODEL` | `jev-latest` | Modelo. Fixa uma versão (ex.: `jev-1.13.0`) depois de afinares o limiar |
| `TRIAGE_CONFIDENCE_THRESHOLD` | `0.6` | Abaixo deste valor, a falha fica `needs_review` |
| `TRIAGE_FAIL_ON` | `bug` | Veredictos que fazem o job falhar, separados por vírgula (ex.: `bug,needs_review`) |
| `TRIAGE_HISTORY_PATH` | `.triage-history/history.json` | Onde fica o histórico de execuções |
| `TRIAGE_HISTORY_SIZE` | `20` | Quantas execuções guardar por teste |
| `FAKE_ENV_DOWN` | – | `1` faz `/api/inventory` devolver 503 |
| `FLAKY_MAX_DELAY_MS` | `2000` | Atraso máximo de `/api/report`. Quanto maior, mais vezes o teste flaky falha |

> O teste flaky é aleatório de propósito: há execuções em que passa à primeira e não aparece na triagem. Para o forçares a falhar com mais frequência, aumenta `FLAKY_MAX_DELAY_MS` (ex.: `3000`).

## Pipeline (GitHub Actions)

O workflow [`.github/workflows/e2e-triage.yml`](.github/workflows/e2e-triage.yml) corre em `push` e `pull_request`:

1. `npm ci` e instalação do Chromium.
2. `npm test` com `continue-on-error`: os testes vermelhos não decidem sozinhos o resultado do job.
3. Descarrega do GitHub Pages o histórico da triagem (`history.json`) e o do Allure (`allure-history.jsonl`).
4. `npm run triage` com `if: always()`. Este passo decide o resultado: falha só se houver veredictos em `TRIAGE_FAIL_ON`. Os restantes aparecem como avisos no summary e como anotações.
5. `npm run allure` gera o relatório Allure 3, já com a análise do Jev.
6. Publica como artifacts o `playwright-report`, o `allure-report` e o `triage-results` (Markdown, JSON e o relatório JSON do Playwright).
7. Em push para `master`, publica no **GitHub Pages** a página da triagem (`/`), o Allure (`/allure/`), o relatório do Playwright (`/playwright-report/`) e os dois históricos. A página é publicada mesmo quando o job falha por causa de um bug.

Página: **https://brlorena.github.io/jev_test/**

> Para ativares o Pages num fork: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

### Configurar o secret

1. No GitHub, abre o repositório e vai a **Settings → Secrets and variables → Actions**.
2. Em **Secrets**, clica em **New repository secret**, com nome `TYPESAFE_API_KEY` e a tua chave como valor.
3. (Opcional) Em **Variables**, cria `TRIAGE_FAIL_ON` (ex.: `bug,needs_review`) e/ou `TRIAGE_CONFIDENCE_THRESHOLD` para mudar as regras sem editar o workflow.

Sem o secret, o pipeline corre em fallback e passa. O mesmo acontece em pull requests vindos de forks, porque o GitHub não lhes passa secrets.

### Custos

A app corre dentro do runner, por isso não há alojamento. Em repositórios públicos, o GitHub Actions é gratuito nos runners normais. O único custo é a API do Jev, cobrada por token de entrada; cada falha usa algumas centenas de tokens.

## Estrutura

```
app/            servidor Node (http nativo) + página HTML
tests/          testes Playwright (shop, report = flaky, inventory = environment)
allurerc.mjs    configuração do Allure 3 (categorias por veredicto do Jev, histórico)
triage/
  config.ts           variáveis de ambiente
  report-parser.ts    lê o relatório JSON do Playwright
  history.ts          histórico de execuções por teste
  jev-classifier.ts   ★ integração com o Jev
  allure.ts           acrescenta a análise do Jev aos resultados Allure
  markdown.ts         relatório Markdown
  html.ts             página HTML do GitHub Pages
  triage.ts           ponto de entrada + exit code
```

## Notas para aprender mais

- Os limiares (`0.6`) são um ponto de partida. A documentação da TypeSafe recomenda afiná-los com dados reais. Guarda os `triage-results.json` de várias execuções e compara-os com a classificação feita por uma pessoa.
- `confidence` mede o quão concentradas estão as probabilidades. Não é uma garantia de que a resposta está certa. Ver [Confidence](https://docs.typesafe.ai/confidence).
- Ideias para evoluir: registar no state os tempos de resposta da rede durante o teste, incluir o excerto do código do teste, ou acrescentar uma pergunta `noul` ("a falha está no código do teste e não na app?") no mesmo pedido, sem custo extra de latência ([fan-out](https://docs.typesafe.ai/patterns/fan-out)).
