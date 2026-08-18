# Polish visual da tela Correção Pontual (Etiquetas Coleta) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar mais hierarquia visual à aba Coleta do módulo Etiquetas (input de bipagem, botão de câmera, card de produto, estado vazio inicial), reaproveitando os tokens de design já existentes no app — sem mudar nenhuma lógica.

**Architecture:** Mudança pontual de CSS/HTML sobre o app shell do Etiquetas v2 (já em produção). Três novas classes CSS reaproveitando tokens existentes (`var(--g)`, `var(--g2)`, `var(--sh)`, `var(--gray2)`, `var(--t3)`) e duas correções em `app.js`: troca de classes inline por essas novas classes em `renderEtcPontual`, e correção de uma variável CSS inexistente (`var(--pri)` → `var(--g)`) em `buscarProdutoPontual`. Nenhuma função nova, nenhuma mudança de fluxo/comportamento.

**Tech Stack:** Vanilla JS sem bundler (`app.js`), CSS puro (`style.css`), mesmo padrão de todo o resto do módulo.

Não existe test runner neste projeto (mesma decisão dos planos anteriores do Etiquetas). Os passos de "teste" são verificação manual no navegador.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-08-18-etiquetas-coleta-polish-design.md`.
- Escopo é só a aba Coleta (`#etc-tab-pontual`, funções `renderEtcPontual`/`buscarProdutoPontual`) — não mexer em Lotes, Impressora, nem no app shell (topbar/tab bar).
- Toda string de nome de produto interpolada em HTML continua passando por `_escHtml()` — não alterar essa parte da lógica existente.
- `.empty` está sendo definida pela primeira vez neste plano (nunca existiu em `style.css`, apesar de usada em 17 lugares no `app.js`) — é uma adição pura, não pode alterar comportamento de nenhum uso existente.
- Sempre que `app.js`, `style.css` ou `index.html` mudar de conteúdo, incrementar `BUILD`/`?v=` nos 6 lugares de costume (Task 4) — mesma regra dos planos anteriores.

---

### Task 1: CSS — novas classes de input, botão de câmera e estado vazio

**Files:**
- Modify: `style.css:87` (logo após `.etc-tabbar-item.on{color:var(--g);font-weight:700}`, último item do bloco "ETIQUETAS COLETA")

**Interfaces:**
- Produces: classes `.etc-input`, `.etc-btn-cam`, `.empty` — consumidas pela Task 2 e Task 3.

- [ ] **Step 1: Adicionar o bloco de CSS**

Adicionar logo depois de `style.css:87` (`.etc-tabbar-item.on{color:var(--g);font-weight:700}`):

```css
.etc-input{width:100%;padding:14px 16px;border:1.5px solid var(--gray2);border-radius:9px;font-size:16px;font-family:inherit;color:var(--t);background:#fff;transition:border .15s}
.etc-input:focus{outline:none;border-color:var(--g2)}
.etc-btn-cam{flex-shrink:0;width:48px;height:48px;border-radius:50%;background:var(--g);border:none;box-shadow:var(--sh);font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:background .15s}
.etc-btn-cam:hover{background:#156040}
.empty{padding:24px 16px;text-align:center;color:var(--t3);font-size:13px;line-height:1.6}
```

Nota: `.etc-input` reaproveita a mesma receita visual de `.lf input` (`style.css:24`, o input de login) — borda 1.5px, `border-radius:9px`, foco com `var(--g2)`. `.etc-btn-cam` usa `var(--g)` (verde primário, mesmo de `.btn-p`) e `var(--sh)` (sombra padrão do app, mesma de `.card`). `.empty` é a primeira definição dessa classe em todo o projeto — hoje ela é usada em 17 lugares no `app.js` sem nenhum estilo aplicado (renderiza como texto solto); esta regra passa a estilizar todos esses usos de uma vez, não só o da Etiquetas.

- [ ] **Step 2: Commit**

```bash
git add style.css
git commit -m "feat: estiliza input/botão de câmera da Coleta e define a classe .empty"
```

---

### Task 2: `renderEtcPontual` — aplicar as novas classes e o estado vazio inicial

**Files:**
- Modify: `app.js:4598-4628` (`renderEtcPontual`)

**Interfaces:**
- Consumes: classes `.etc-input`, `.etc-btn-cam`, `.empty` (Task 1).

- [ ] **Step 1: Substituir `renderEtcPontual`**

Trocar (`app.js:4598-4628`):
```js
function renderEtcPontual() {
  var wrap = document.getElementById('etc-tab-pontual');
  // Reaproveita iniciarScanEAN (app.js:12065) — já resolve leitura de câmera
  // via ZXing no coletor real. Não usar BarcodeDetector nativo (ver Global
  // Constraints: já tentado e abandonado neste projeto).
  var btnCamera = (typeof ZXing !== 'undefined')
    ? '<button class="btn btn-s" style="flex-shrink:0" onclick="iniciarScanEAN(\'etc-input-codigo\')" title="Bipar com a câmera">📷</button>'
    : '';
  wrap.innerHTML =
    '<div style="display:flex;gap:8px;margin-bottom:12px">' +
      '<input id="etc-input-codigo" placeholder="Bipe o código de barras" autofocus style="flex:1;padding:14px;font-size:16px">' +
      btnCamera +
    '</div>' +
    '<div id="etc-preview"></div>';
  var input = document.getElementById('etc-input-codigo');
  var timer = null;
  input.addEventListener('input', function() {
    clearTimeout(timer);
    timer = setTimeout(function() { buscarProdutoPontual(input.value.trim()); }, 1000);
  });
  // iniciarScanEAN preenche o input e dispara um keydown de Enter (não um
  // evento "input") — sem este listener a busca nunca dispararia após ler
  // pela câmera. Também beneficia coletores físicos configurados pra enviar
  // Enter após o código, e digitação manual com Enter.
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      clearTimeout(timer);
      buscarProdutoPontual(input.value.trim());
    }
  });
}
```
por:
```js
function renderEtcPontual() {
  var wrap = document.getElementById('etc-tab-pontual');
  // Reaproveita iniciarScanEAN (app.js:12065) — já resolve leitura de câmera
  // via ZXing no coletor real. Não usar BarcodeDetector nativo (ver Global
  // Constraints: já tentado e abandonado neste projeto).
  var btnCamera = (typeof ZXing !== 'undefined')
    ? '<button class="etc-btn-cam" onclick="iniciarScanEAN(\'etc-input-codigo\')" title="Bipar com a câmera">📷</button>'
    : '';
  wrap.innerHTML =
    '<div style="display:flex;gap:8px;margin-bottom:12px">' +
      '<input id="etc-input-codigo" class="etc-input" placeholder="Bipe o código de barras" autofocus style="flex:1">' +
      btnCamera +
    '</div>' +
    '<div id="etc-preview"><div class="empty">🏷️<br>Bipe um código pra começar</div></div>';
  var input = document.getElementById('etc-input-codigo');
  var timer = null;
  input.addEventListener('input', function() {
    clearTimeout(timer);
    timer = setTimeout(function() { buscarProdutoPontual(input.value.trim()); }, 1000);
  });
  // iniciarScanEAN preenche o input e dispara um keydown de Enter (não um
  // evento "input") — sem este listener a busca nunca dispararia após ler
  // pela câmera. Também beneficia coletores físicos configurados pra enviar
  // Enter após o código, e digitação manual com Enter.
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      clearTimeout(timer);
      buscarProdutoPontual(input.value.trim());
    }
  });
}
```

Nota: `#etc-preview` continua sendo um container simples (sem classe própria) — quem aplica `.empty` é sempre o `<div>` filho, tanto aqui (estado inicial) quanto em `buscarProdutoPontual` (Buscando/erro). Isso evita aninhar `.empty` dentro de `.empty` quando `buscarProdutoPontual` sobrescreve o `innerHTML`.

- [ ] **Step 2: Verificar manualmente**

Abrir a aba Coleta (sem ter bipado nada ainda). Confirmar: (a) o input tem borda visível e arredondada, fica com borda verde ao focar; (b) o botão de câmera é um círculo verde com sombra, não um quadrado cinza; (c) abaixo do input aparece "🏷️ Bipe um código pra começar" centralizado, em cinza — não uma área em branco.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: aplica o polish visual (input, botão de câmera, estado vazio) na Coleta"
```

---

### Task 3: `buscarProdutoPontual` — corrigir a cor do preço e o padding do card

**Files:**
- Modify: `app.js:4642-4649` (bloco `.then(function(produto) {...})` dentro de `buscarProdutoPontual`)

**Interfaces:**
- Consumes: nenhuma classe nova (usa `.card`/`.btn-p` já existentes).

- [ ] **Step 1: Corrigir o card do produto encontrado**

Trocar (`app.js:4642-4649`):
```js
  }).then(function(produto) {
    var disabledAttr = _etcWriteChar ? '' : 'disabled title="Conecte a impressora primeiro"';
    preview.innerHTML =
      '<div class="card" style="padding:16px">' +
        '<div style="font-weight:700;margin-bottom:4px">' + _escHtml(produto.nome) + '</div>' +
        '<div style="font-size:20px;color:var(--pri);font-weight:800;margin-bottom:12px">R$ ' + produto.preco.toFixed(2) + '</div>' +
        '<button class="btn btn-p" style="width:100%" ' + disabledAttr + ' onclick="confirmarImpressaoPontual(' + _escHtml(JSON.stringify(produto)) + ')">Imprimir etiqueta</button>' +
      '</div>';
  }).catch(function(e) {
```
por:
```js
  }).then(function(produto) {
    var disabledAttr = _etcWriteChar ? '' : 'disabled title="Conecte a impressora primeiro"';
    preview.innerHTML =
      '<div class="card">' +
        '<div style="font-weight:700;margin-bottom:4px">' + _escHtml(produto.nome) + '</div>' +
        '<div style="font-size:22px;color:var(--g);font-weight:800;margin-bottom:14px">R$ ' + produto.preco.toFixed(2) + '</div>' +
        '<button class="btn btn-p" style="width:100%" ' + disabledAttr + ' onclick="confirmarImpressaoPontual(' + _escHtml(JSON.stringify(produto)) + ')">Imprimir etiqueta</button>' +
      '</div>';
  }).catch(function(e) {
```

Nota: `var(--pri)` não existe em nenhum lugar de `style.css` — era a única ocorrência em todo o `app.js`, então o preço nunca teve cor (caía no preto padrão herdado). Troca pra `var(--g)`, a cor primária real do app (mesma usada em `.btn-p`). Remove o `style="padding:16px"` inline pra usar o padding padrão de `.card` (20px, já definido em `style.css:103`) — o card fica menos apertado. `Buscando...`/erros (bloco `.catch`, não alterado nesta task) já usam `class="empty"`, que passa a ter estilo de graça a partir da Task 1.

- [ ] **Step 2: Verificar manualmente**

Bipar um código real (com a impressora conectada). Confirmar: (a) o preço aparece em verde, maior que antes; (b) o card tem mais respiro (padding) que antes; (c) o botão "Imprimir etiqueta" continua funcionando normalmente. Testar também um código inexistente — confirmar que "Produto não encontrado." aparece centralizado e em cinza (não mais texto cru no canto esquerdo).

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "fix: corrige cor do preço (var(--pri) inexistente) e padding do card na Coleta"
```

---

### Task 4: Bump de BUILD

**Files:**
- Modify: `app.js:2`, `sw.js:3`, `sw.js:11-12`, `index.html:20,1984`, `version.json`

- [ ] **Step 1: Bump de BUILD nos 6 lugares**

```js
// app.js linha 2
var BUILD = '311';
```
```js
// sw.js linha 3
var CACHE_NAME = 'cahu360-v311';
```
```js
// sw.js linhas 11-12
'./app.js?v=311',
'./style.css?v=311',
```
```html
<!-- index.html linha 20 -->
<link rel="stylesheet" href="style.css?v=311"/>
<!-- index.html linha 1984 -->
<script src="app.js?v=311" defer></script>
```
```json
{"build":"311"}
```

- [ ] **Step 2: Verificação final**

Abrir a aba Coleta do zero (F5, cache limpo): estado vazio inicial estilizado, bipar/buscar um produto real e conferir o card verde com padding maior, testar foco no input (borda verde), testar hover/clique no botão de câmera (círculo verde). Nenhum comportamento de bipagem, busca ou impressão deve ter mudado — só o visual.

- [ ] **Step 3: Commit**

```bash
git add app.js sw.js index.html version.json
git commit -m "chore: bump de BUILD pro polish visual da Coleta"
```

---

## Self-review notes

- Cobertura da spec: item 1 (input) → Task 2; item 2 (botão câmera) → Task 2; item 3 (cor do preço + padding do card) → Task 3; item 4 (classe `.empty`) → Task 1; item 5 (estado vazio inicial) → Task 2. Todos os 5 itens da spec têm task correspondente.
- Fora de escopo (confirmado na spec): imagem do produto, histórico de sessão, contador, mudanças em Lotes/Impressora, redesign do app shell — nenhum destes tem task aqui.
- Consistência de nomes: `.etc-input`, `.etc-btn-cam`, `.empty` são definidos na Task 1 e usados exatamente com esses nomes nas Tasks 2 e 3 — conferido.
