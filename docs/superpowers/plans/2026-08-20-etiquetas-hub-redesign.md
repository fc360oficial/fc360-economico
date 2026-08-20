# Etiquetas — Redesign em Hub (Avulsa + Lote + Consulta) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a tab bar atual do painel Etiquetas Coleta (Coleta/Lotes/Impressora) por um hub de 4 cards (Etiqueta Avulsa, Etiquetas em Lote, Consulta de Preços, Impressora) + lista "Últimas impressões", com paleta dourado FC360 (`#FFC600`) + branco, seguindo a estrutura visual dos mockups de referência do Tiago.

**Architecture:** Reescreve a navegação interna de `panel-etiquetas-coleta` (troca show/hide por aba → show/hide por "view" do hub) reaproveitando toda a lógica de negócio existente (`imprimirEtiquetaBluetooth`, `parearImpressora`, `renderFilaLote`/`imprimirProximoDaFila`/`imprimirTudoDaFila`, gravação em `etiquetas_log`). Etiqueta Avulsa ganha quantidade editável e uma tela de preview nova antes de imprimir. Etiquetas em Lote ganha um construtor de lote mobile (busca+filtro+checkbox) que roda **em paralelo** ao fluxo existente de consumir lotes pré-montados na retaguarda — não remove o antigo. Consulta de Preços é tela nova. Lote e Consulta usam um catálogo mockado (`ETC_MOCK_PRODUTOS`) para os campos que a `etiquetas-api` ainda não expõe (Departamento/Setor/Marca/Estoque/Preço anterior) — decisão explícita do Tiago (spec, Fora de escopo).

**Tech Stack:** Vanilla JS sem bundler (`app.js`), CSS puro (`style.css`), Firebase Firestore (`etiquetas_log`, `etiquetas_lote`), Web Bluetooth (`imprimirEtiquetaBluetooth`, já existe). Uma dependência nova via CDN: **JsBarcode** (`cdnjs`), pra renderizar o código de barras na tela de preview — mesmo padrão de carregamento que Chart.js/jsPDF/ZXing já usam no projeto (`<script src="https://cdnjs...">`, sem bundler).

Não existe test runner neste projeto (mesma decisão dos planos anteriores de Etiquetas). Os passos de "teste" são verificação manual (navegador, e quando aplicável, hardware físico — impressora K329).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-08-20-etiquetas-hub-redesign-design.md`.
- **Cor de destaque:** dourado `#FFC600` / `#e6b200` (tokens `--dk`/`--dk2` já existem em `style.css`) + branco. Nunca introduzir azul (cor do mockup original, fora de escopo).
- **Reaproveitar `.card`** (`style.css:103`) pra qualquer card de produto — não criar uma classe de card concorrente.
- **`iniciarScanEAN`** (`app.js:12345` na revisão atual) é reaproveitado tal como está em toda tela com bipagem (Avulsa, Consulta) — nunca usar `BarcodeDetector` nativo (já tentado e abandonado neste projeto, ver comentário em `iniciarScanEAN`).
- Toda escrita em `etiquetas_log` segue exatamente os mesmos campos já usados hoje (`codigoBarras, nomeProduto, precoImpresso, origem, loteId, operadorId, operadorNome, timestamp`) — não inventar campos novos.
- Toda string interpolada em HTML passa por `_escHtml()` (`app.js`, já existe); toda string interpolada em comando TSPL passa por `_tsplTxt()` (já existe, dentro de `montarComandoTSPL`).
- `_etcImprimindo` continua sendo a única trava contra impressão concorrente — não criar um segundo mecanismo de lock (inclusive no novo loop de impressão de N cópias da Avulsa, Task 6).
- `ETC_MOCK_PRODUTOS` (Task 7) é dado fixo, claramente comentado como temporário — nenhuma chamada de rede nova pra Lote/Consulta nesta rodada além do `GET /produto/:codigo` que Consulta já reaproveita.
- Sempre que `app.js`, `style.css` ou `index.html` mudar de conteúdo, incrementar `BUILD`/`?v=` nos 6 lugares de costume (Task 9, última task).

---

### Task 1: CSS do hub e das novas telas

**Files:**
- Modify: `style.css:77-88` (bloco atual `.etc-topbar` até `.etc-tabbar-item.on`)

**Interfaces:**
- Produces: classes `.etc-hub-grid`, `.etc-hub-card`, `.etc-hub-card-icon`, `.etc-hub-card-body/-title/-desc`, `.etc-hub-recent*`, `.etc-sub-topbar`, `.etc-stepper*`, `.etc-preview-label*`, `.etc-filter-row`, `.etc-check-item*`, `.etc-sticky-bar` — consumidas por todas as tasks seguintes.
- Remove: `.etc-tabbar`, `.etc-tabbar-item`, `.etc-tabbar-item .ic`, `.etc-tabbar-item.on` (mortas após o redesign — a tab bar deixa de existir).

- [ ] **Step 1: Substituir o bloco de CSS**

Trocar (`style.css:77-88`):
```css
.etc-topbar{display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:56px;border-bottom:1px solid var(--gray2);flex-shrink:0}
.etc-topbar-back{background:none;border:none;font-family:inherit;font-size:14px;font-weight:600;color:var(--t);cursor:pointer;padding:8px 4px}
.etc-pill{font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px}
.etc-pill-on{background:var(--g3);color:var(--g)}
.etc-pill-off{background:var(--gray);color:var(--t3)}
.etc-body{flex:1;overflow-y:auto;padding:16px}
.etc-aviso{background:var(--am2);color:var(--am);font-size:12.5px;padding:10px 14px;border-radius:10px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.etc-aviso a{color:var(--am);font-weight:700;text-decoration:underline;cursor:pointer}
.etc-tabbar{display:flex;border-top:1px solid var(--gray2);flex-shrink:0}
.etc-tabbar-item{flex:1;text-align:center;padding:8px 4px 10px;font-size:10.5px;color:var(--t3);cursor:pointer}
.etc-tabbar-item .ic{font-size:18px;display:block;margin-bottom:2px}
.etc-tabbar-item.on{color:var(--g);font-weight:700}
```
por:
```css
.etc-topbar{display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:56px;border-bottom:1px solid var(--gray2);flex-shrink:0}
.etc-topbar-back{background:none;border:none;font-family:inherit;font-size:14px;font-weight:600;color:var(--t);cursor:pointer;padding:8px 4px}
.etc-pill{font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px}
.etc-pill-on{background:var(--g3);color:var(--g)}
.etc-pill-off{background:var(--gray);color:var(--t3)}
.etc-body{flex:1;overflow-y:auto;padding:16px}
.etc-aviso{background:var(--am2);color:var(--am);font-size:12.5px;padding:10px 14px;border-radius:10px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.etc-aviso a{color:var(--am);font-weight:700;text-decoration:underline;cursor:pointer}

/* Hub "Etiquetas e Consulta" — 4 cards + últimas impressões */
.etc-hub-grid{display:flex;flex-direction:column;gap:12px}
.etc-hub-card{display:flex;align-items:center;gap:14px;text-align:left;padding:16px;background:var(--w);border:1px solid rgba(0,0,0,.06);border-radius:var(--r14);box-shadow:var(--sh);cursor:pointer}
.etc-hub-card-icon{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#FFC600,#e6b200);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:22px}
.etc-hub-card-body{flex:1;min-width:0}
.etc-hub-card-title{font-size:15px;font-weight:700;color:var(--t);margin-bottom:2px}
.etc-hub-card-desc{font-size:12.5px;color:var(--t3)}
.etc-hub-recent{margin-top:20px}
.etc-hub-recent-title{font-size:13px;font-weight:700;color:var(--t2);margin-bottom:10px}
.etc-hub-recent-item{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray2);font-size:13px}
.etc-hub-recent-item:last-child{border-bottom:none}
.etc-hub-recent-name{font-weight:600;color:var(--t)}
.etc-hub-recent-meta{color:var(--t3);font-size:11.5px}
.etc-hub-recent-qtd{font-weight:700;color:var(--t2)}

/* Sub-telas (Avulsa, Preview, Lote, Consulta, Impressora) */
.etc-sub-topbar{margin-bottom:14px}
.etc-stepper{display:flex;align-items:center;gap:14px;justify-content:center;margin:14px 0}
.etc-stepper button{width:38px;height:38px;border-radius:50%;border:1.5px solid var(--gray2);background:#fff;font-size:18px;font-weight:700;cursor:pointer;color:var(--t)}
.etc-stepper-val{font-size:20px;font-weight:800;min-width:28px;text-align:center}
.etc-preview-label{background:var(--gray);border-radius:12px;padding:20px;text-align:center;margin-bottom:16px}
.etc-preview-label-nome{font-size:15px;font-weight:700;margin-bottom:8px}
.etc-preview-label-preco{font-size:26px;font-weight:800;color:var(--t);margin-bottom:10px}
.etc-filter-row{display:flex;gap:8px;margin:12px 0;overflow-x:auto}
.etc-filter-row select{flex-shrink:0;padding:7px 10px;border:1.5px solid var(--gray2);border-radius:8px;font-size:12.5px;font-family:inherit}
.etc-check-item{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--gray2)}
.etc-check-item input[type=checkbox]{width:18px;height:18px;flex-shrink:0}
.etc-check-item-body{flex:1;min-width:0}
.etc-check-item-name{font-size:13.5px;font-weight:600;color:var(--t)}
.etc-check-item-meta{font-size:11.5px;color:var(--t3)}
.etc-check-item-qtd{width:50px;padding:6px;border:1.5px solid var(--gray2);border-radius:6px;text-align:center;font-size:13px}
.etc-sticky-bar{position:sticky;bottom:0;background:#fff;border-top:1px solid var(--gray2);padding:12px 0 0;margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:10px}
```

- [ ] **Step 2: Commit**

```bash
git add style.css
git commit -m "feat: CSS do hub e das novas telas de Etiquetas (Avulsa/Lote/Consulta/Impressora)"
```

---

### Task 2: Markup — hub + 6 sub-telas + dependência JsBarcode

**Files:**
- Modify: `index.html:18` (scripts CDN, logo após ZXing)
- Modify: `index.html:1217-1237` (bloco `panel-etiquetas-coleta`)

**Interfaces:**
- Consumes: classes da Task 1.
- Produces: elementos `#etc-view-hub`, `#etc-view-avulsa`, `#etc-view-preview`, `#etc-view-lote`, `#etc-view-consulta`, `#etc-view-impressora` — consumidos por todas as tasks seguintes.

- [ ] **Step 1: Adicionar o script do JsBarcode**

Trocar (`index.html:18`):
```html
<script src="https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/umd/index.min.js"></script>
```
por:
```html
<script src="https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/umd/index.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/JsBarcode/3.11.5/JsBarcode.all.min.js"></script>
```

- [ ] **Step 2: Substituir o bloco `panel-etiquetas-coleta`**

Trocar (`index.html:1217-1237`):
```html
      <!-- === FC360 ETIQUETAS — COLETA (mobile, app shell dedicado) === -->
      <div id="panel-etiquetas-coleta" class="panel">
        <div class="etc-topbar">
          <button class="etc-topbar-back" onclick="nav('capa', null)">← Etiquetas</button>
          <span id="etc-status-pill" class="etc-pill etc-pill-off">○ desconectado</span>
        </div>
        <div class="etc-body">
          <div id="etc-aviso-sem-impressora" class="etc-aviso" style="display:none">
            <span>Conecte a impressora antes de imprimir.</span>
            <a onclick="switchEtcTab('impressora', document.querySelectorAll('.etc-tabbar-item')[2])">Ir para Impressora</a>
          </div>
          <div id="etc-tab-pontual"></div>
          <div id="etc-tab-lotes" style="display:none"></div>
          <div id="etc-tab-impressora" style="display:none"></div>
        </div>
        <div class="etc-tabbar">
          <div class="etc-tabbar-item on" onclick="switchEtcTab('pontual',this)"><span class="ic">🏷️</span>Coleta</div>
          <div class="etc-tabbar-item" onclick="switchEtcTab('lotes',this)"><span class="ic">📋</span>Lotes</div>
          <div class="etc-tabbar-item" onclick="switchEtcTab('impressora',this)"><span class="ic">🔌</span>Impressora</div>
        </div>
      </div><!-- /panel-etiquetas-coleta -->
```
por:
```html
      <!-- === FC360 ETIQUETAS E CONSULTA — COLETA (mobile, hub de 4 cards) === -->
      <div id="panel-etiquetas-coleta" class="panel">
        <div class="etc-topbar">
          <button class="etc-topbar-back" onclick="nav('capa', null)">← Etiquetas</button>
        </div>
        <div class="etc-body">
          <div id="etc-view-hub"></div>
          <div id="etc-view-avulsa" style="display:none"></div>
          <div id="etc-view-preview" style="display:none"></div>
          <div id="etc-view-lote" style="display:none"></div>
          <div id="etc-view-consulta" style="display:none"></div>
          <div id="etc-view-impressora" style="display:none"></div>
        </div>
      </div><!-- /panel-etiquetas-coleta -->
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: markup do hub e das 6 sub-telas de Etiquetas (redesign)"
```

---

### Task 3: Navegação do hub (core) + renomeia o módulo na capa

**Files:**
- Modify: `app.js:1004` (`CAPA_MODULOS`, entrada `etiquetas`)
- Modify: `app.js:1890-1892` (rota `etiquetas-coleta` em `nav()`)
- Modify: `app.js:4498-4576` (state vars, `parearImpressora`, `switchEtcTab`, `renderEtcImpressora`)

**Interfaces:**
- Consumes: markup da Task 2.
- Produces: `abrirEtcHub(view)`, `abrirEtcPreview(produto, qtd)`, `_etcAtualizarStatusUI()`, `_etcCurrentView`, `renderEtcHub()` (só os 4 cards — Task 4 adiciona "Últimas impressões"), `renderEtcImpressora()` — consumidos por todas as tasks seguintes.
- Remove: `switchEtcTab` (substituída por `abrirEtcHub`).

- [ ] **Step 1: Renomear o card do módulo na capa**

Trocar (`app.js:1004`):
```js
  { id:'etiquetas', label:'Etiquetas', desenvolvido:true, moduloChave:'etiquetas',
```
por:
```js
  { id:'etiquetas', label:'Etiquetas e Consulta', desenvolvido:true, moduloChave:'etiquetas',
```

- [ ] **Step 2: Atualizar a rota `etiquetas-coleta` em `nav()`**

Trocar (`app.js:1890-1892`):
```js
  if (page === 'etiquetas-coleta') {
    switchEtcTab('pontual', document.querySelector('.etc-tabbar-item'));
  }
```
por:
```js
  if (page === 'etiquetas-coleta') {
    abrirEtcHub('hub');
  }
```

- [ ] **Step 3: Substituir `parearImpressora`, `switchEtcTab` e `renderEtcImpressora` pela navegação em hub**

Trocar (`app.js:4498-4576`, do comentário `// ── Etiquetas: coleta (mobile)...` até o fim de `renderEtcImpressora`):
```js
// ── Etiquetas: coleta (mobile) — pareamento Bluetooth + impressão ──
var _etcDevice = null, _etcGattServer = null, _etcWriteChar = null;
// Trava contra impressão duplicada: um duplo-toque no botão de imprimir
// (plausível em coletor com lag de UI) dispararia duas chamadas concorrentes
// de imprimirEtiquetaBluetooth e imprimiria a etiqueta física duas vezes.
var _etcImprimindo = false;

function parearImpressora() {
  var CANDIDATOS = ['49535343-fe7d-4ae5-8fa9-9fafd205e455'];
  navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: CANDIDATOS
  }).then(function(d) {
    _etcDevice = d;
    return d.gatt.connect();
  }).then(function(server) {
    _etcGattServer = server;
    return server.getPrimaryServices();
  }).then(function(services) {
    return services[0].getCharacteristics();
  }).then(function(chars) {
    _etcWriteChar = chars.filter(function(c){ return c.properties.write || c.properties.writeWithoutResponse; })[0];
    if (!_etcWriteChar) throw new Error('Nenhuma característica de escrita encontrada.');
    var status = document.getElementById('etc-status-conexao');
    if (status) status.textContent = '✅ Conectado em ' + (_etcDevice.name || 'impressora');
    _etcAtualizarStatusUI();
    _etcDevice.addEventListener('gattserverdisconnected', function() {
      _etcWriteChar = null;
      _etcModoImprimirTudo = false;
      _etcAtualizarStatusUI();
      if (_etcTabAtual === 'lotes' && _loteAtualFila.length) renderFilaLote();
    });
  }).catch(function(e) {
    var status = document.getElementById('etc-status-conexao');
    if (status) status.textContent = '❌ Erro: ' + e.message;
  });
}

var _etcTabAtual = 'pontual';

function switchEtcTab(tab, btn) {
  if (_etcTabAtual === 'lotes' && tab !== 'lotes' && _etcModoImprimirTudo) {
    _etcModoImprimirTudo = false;
  }
  _etcTabAtual = tab;
  document.getElementById('etc-tab-pontual').style.display = tab === 'pontual' ? 'block' : 'none';
  document.getElementById('etc-tab-lotes').style.display = tab === 'lotes' ? 'block' : 'none';
  document.getElementById('etc-tab-impressora').style.display = tab === 'impressora' ? 'block' : 'none';
  document.querySelectorAll('.etc-tabbar-item').forEach(function(t){t.classList.remove('on');});
  if (btn) btn.classList.add('on');
  _etcAtualizarStatusUI();
  if (tab === 'pontual') renderEtcPontual();
  if (tab === 'lotes') renderEtcLotes();
  if (tab === 'impressora') renderEtcImpressora();
}

// Atualiza o pill de status no topbar e a faixa de aviso "conecte a impressora"
// (só aparece nas abas Coleta/Lotes — na própria aba Impressora seria redundante).
function _etcAtualizarStatusUI() {
  var pill = document.getElementById('etc-status-pill');
  if (pill) {
    pill.textContent = _etcWriteChar ? '● conectado' : '○ desconectado';
    pill.className = 'etc-pill ' + (_etcWriteChar ? 'etc-pill-on' : 'etc-pill-off');
  }
  var aviso = document.getElementById('etc-aviso-sem-impressora');
  if (aviso) {
    aviso.style.display = (!_etcWriteChar && (_etcTabAtual === 'pontual' || _etcTabAtual === 'lotes')) ? 'flex' : 'none';
  }
}

function renderEtcImpressora() {
  var wrap = document.getElementById('etc-tab-impressora');
  wrap.innerHTML =
    '<div style="text-align:center;padding:20px 0">' +
      '<p style="margin-bottom:12px;color:var(--t3);font-size:13px">' + (_etcWriteChar ? 'Impressora conectada.' : 'Conecte na impressora pra poder imprimir.') + '</p>' +
      '<button class="btn btn-p" onclick="parearImpressora()">' + (_etcWriteChar ? 'Conectar em outra impressora' : 'Conectar na impressora') + '</button>' +
      '<div id="etc-status-conexao" style="margin-top:10px;font-size:13px"></div>' +
    '</div>';
}
```
por:
```js
// ── Etiquetas: coleta (mobile) — pareamento Bluetooth + impressão ──
var _etcDevice = null, _etcGattServer = null, _etcWriteChar = null;
// Trava contra impressão duplicada: um duplo-toque no botão de imprimir
// (plausível em coletor com lag de UI) dispararia duas chamadas concorrentes
// de imprimirEtiquetaBluetooth e imprimiria a etiqueta física duas vezes.
var _etcImprimindo = false;

var _etcCurrentView = 'hub'; // hub | avulsa | preview | lote | consulta | impressora
var _etcPreviewProduto = null, _etcPreviewQtd = 1; // estado da tela de preview (Task 6)

var ETC_HUB_VIEWS = ['hub', 'avulsa', 'preview', 'lote', 'consulta', 'impressora'];

// Navega entre o hub e as sub-telas com destino fixo (sem parâmetros). A
// tela de preview usa abrirEtcPreview (precisa de produto+qtd) em vez desta.
function abrirEtcHub(view) {
  _etcCurrentView = view;
  ETC_HUB_VIEWS.forEach(function(v) {
    var el = document.getElementById('etc-view-' + v);
    if (el) el.style.display = (v === view) ? 'block' : 'none';
  });
  if (view === 'hub') renderEtcHub();
  if (view === 'avulsa') renderEtcAvulsa();
  if (view === 'lote') renderEtcLotes();
  if (view === 'consulta') renderEtcConsulta();
  if (view === 'impressora') renderEtcImpressora();
}

function abrirEtcPreview(produto, qtd) {
  _etcCurrentView = 'preview';
  ETC_HUB_VIEWS.forEach(function(v) {
    var el = document.getElementById('etc-view-' + v);
    if (el) el.style.display = (v === 'preview') ? 'block' : 'none';
  });
  renderEtcPreview(produto, qtd);
}

function parearImpressora() {
  var CANDIDATOS = ['49535343-fe7d-4ae5-8fa9-9fafd205e455'];
  navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: CANDIDATOS
  }).then(function(d) {
    _etcDevice = d;
    return d.gatt.connect();
  }).then(function(server) {
    _etcGattServer = server;
    return server.getPrimaryServices();
  }).then(function(services) {
    return services[0].getCharacteristics();
  }).then(function(chars) {
    _etcWriteChar = chars.filter(function(c){ return c.properties.write || c.properties.writeWithoutResponse; })[0];
    if (!_etcWriteChar) throw new Error('Nenhuma característica de escrita encontrada.');
    var status = document.getElementById('etc-status-conexao');
    if (status) status.textContent = '✅ Conectado em ' + (_etcDevice.name || 'impressora');
    _etcAtualizarStatusUI();
    _etcDevice.addEventListener('gattserverdisconnected', function() {
      _etcWriteChar = null;
      _etcModoImprimirTudo = false;
      _etcAtualizarStatusUI();
      if (_etcCurrentView === 'lote' && _loteAtualFila.length) renderFilaLote();
    });
  }).catch(function(e) {
    var status = document.getElementById('etc-status-conexao');
    if (status) status.textContent = '❌ Erro: ' + e.message;
  });
}

// Re-renderiza a view atual quando o estado da impressora muda (conectou,
// desconectou) — cada view decide sozinha o que fazer com _etcWriteChar
// (desabilitar botão, mostrar aviso, etc.), esta função só dispara o redraw.
function _etcAtualizarStatusUI() {
  if (_etcCurrentView === 'hub') renderEtcHub();
  else if (_etcCurrentView === 'avulsa') renderEtcAvulsa();
  else if (_etcCurrentView === 'lote') renderEtcLotes();
  else if (_etcCurrentView === 'impressora') renderEtcImpressora();
  else if (_etcCurrentView === 'preview' && _etcPreviewProduto) renderEtcPreview(_etcPreviewProduto, _etcPreviewQtd);
}

function renderEtcImpressora() {
  var wrap = document.getElementById('etc-view-impressora');
  wrap.innerHTML =
    '<div class="etc-sub-topbar"><button class="etc-topbar-back" onclick="abrirEtcHub(\'hub\')">← Etiquetas e Consulta</button></div>' +
    '<div class="card" style="padding:20px;text-align:center">' +
      '<p style="margin-bottom:12px;color:var(--t3);font-size:13px">' + (_etcWriteChar ? ('Conectada: ' + _escHtml(_etcDevice ? _etcDevice.name : '')) : 'Conecte na impressora pra poder imprimir.') + '</p>' +
      '<button class="btn btn-p" onclick="parearImpressora()">' + (_etcWriteChar ? 'Conectar em outra impressora' : 'Conectar na impressora') + '</button>' +
      '<div id="etc-status-conexao" style="margin-top:10px;font-size:13px"></div>' +
    '</div>' +
    '<p style="margin-top:14px;font-size:12px;color:var(--t3);text-align:center">Mantenha a impressora ligada e próxima ao dispositivo para garantir a conexão.</p>';
}

// Renderiza só os 4 cards do hub. Task 4 substitui esta função inteira pra
// adicionar a lista "Últimas impressões" logo abaixo.
function renderEtcHub() {
  var wrap = document.getElementById('etc-view-hub');
  var statusImpressora = _etcWriteChar ? '● Conectada' : '○ Desconectada';
  var statusCls = _etcWriteChar ? 'etc-pill-on' : 'etc-pill-off';
  wrap.innerHTML =
    '<div class="etc-hub-grid">' +
      '<div class="etc-hub-card" onclick="abrirEtcHub(\'avulsa\')">' +
        '<div class="etc-hub-card-icon">🏷️</div>' +
        '<div class="etc-hub-card-body"><div class="etc-hub-card-title">Etiqueta Avulsa</div><div class="etc-hub-card-desc">Imprima uma etiqueta de um produto específico</div></div>' +
      '</div>' +
      '<div class="etc-hub-card" onclick="abrirEtcHub(\'lote\')">' +
        '<div class="etc-hub-card-icon">📋</div>' +
        '<div class="etc-hub-card-body"><div class="etc-hub-card-title">Etiquetas em Lote</div><div class="etc-hub-card-desc">Selecione vários produtos e imprima em lote</div></div>' +
      '</div>' +
      '<div class="etc-hub-card" onclick="abrirEtcHub(\'consulta\')">' +
        '<div class="etc-hub-card-icon">🔍</div>' +
        '<div class="etc-hub-card-body"><div class="etc-hub-card-title">Consulta de Preços</div><div class="etc-hub-card-desc">Consulte informações e preços dos produtos</div></div>' +
      '</div>' +
      '<div class="etc-hub-card" onclick="abrirEtcHub(\'impressora\')">' +
        '<div class="etc-hub-card-icon">🔌</div>' +
        '<div class="etc-hub-card-body"><div class="etc-hub-card-title">Impressora</div><div class="etc-hub-card-desc">Conecte e gerencie a impressora Bluetooth</div></div>' +
        '<span class="etc-pill ' + statusCls + '">' + statusImpressora + '</span>' +
      '</div>' +
    '</div>';
}
```

Nota: `renderEtcAvulsa`, `renderEtcLotes` e `renderEtcConsulta` ainda não existem neste ponto do plano — só existirão a partir das Tasks 6, 7 e 8. Isso é esperado: o passo de verificação manual abaixo só cobre o hub e o card Impressora, que já funcionam de ponta a ponta.

- [ ] **Step 4: Verificar manualmente**

Abrir Etiquetas ("Etiquetas e Consulta" na capa) como operador não-admin/supervisor. Confirmar: (a) cai direto no hub com 4 cards; (b) card Impressora mostra "○ Desconectada"; (c) tocar no card Impressora abre a tela de pareamento com botão "← Etiquetas e Consulta" funcionando; (d) conectar a impressora física (K329) e voltar ao hub — card mostra "● Conectada"; (e) tocar nos cards Avulsa/Lote/Consulta não quebra a página (tela em branco é esperado, ainda sem `renderEtc*` — só confirmar que não lança erro de JS que impeça voltar ao hub).

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: navegação em hub de Etiquetas (substitui a tab bar), renomeia card na capa"
```

---

### Task 4: Hub — lista "Últimas impressões"

**Files:**
- Modify: `app.js` (função `renderEtcHub`, criada na Task 3)

**Interfaces:**
- Consumes: coleção `etiquetas_log` (já gravada por `confirmarImpressaoAvulsa`/`imprimirProximoDaFila`).
- Produces: `_etcFormatarRelativo(data)`.

- [ ] **Step 1: Substituir `renderEtcHub` para incluir a lista de últimas impressões**

Trocar a função `renderEtcHub` inteira (criada na Task 3) por:
```js
function renderEtcHub() {
  var wrap = document.getElementById('etc-view-hub');
  var statusImpressora = _etcWriteChar ? '● Conectada' : '○ Desconectada';
  var statusCls = _etcWriteChar ? 'etc-pill-on' : 'etc-pill-off';
  wrap.innerHTML =
    '<div class="etc-hub-grid">' +
      '<div class="etc-hub-card" onclick="abrirEtcHub(\'avulsa\')">' +
        '<div class="etc-hub-card-icon">🏷️</div>' +
        '<div class="etc-hub-card-body"><div class="etc-hub-card-title">Etiqueta Avulsa</div><div class="etc-hub-card-desc">Imprima uma etiqueta de um produto específico</div></div>' +
      '</div>' +
      '<div class="etc-hub-card" onclick="abrirEtcHub(\'lote\')">' +
        '<div class="etc-hub-card-icon">📋</div>' +
        '<div class="etc-hub-card-body"><div class="etc-hub-card-title">Etiquetas em Lote</div><div class="etc-hub-card-desc">Selecione vários produtos e imprima em lote</div></div>' +
      '</div>' +
      '<div class="etc-hub-card" onclick="abrirEtcHub(\'consulta\')">' +
        '<div class="etc-hub-card-icon">🔍</div>' +
        '<div class="etc-hub-card-body"><div class="etc-hub-card-title">Consulta de Preços</div><div class="etc-hub-card-desc">Consulte informações e preços dos produtos</div></div>' +
      '</div>' +
      '<div class="etc-hub-card" onclick="abrirEtcHub(\'impressora\')">' +
        '<div class="etc-hub-card-icon">🔌</div>' +
        '<div class="etc-hub-card-body"><div class="etc-hub-card-title">Impressora</div><div class="etc-hub-card-desc">Conecte e gerencie a impressora Bluetooth</div></div>' +
        '<span class="etc-pill ' + statusCls + '">' + statusImpressora + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="etc-hub-recent"><div class="etc-hub-recent-title">Últimas impressões</div><div id="etc-hub-recent-list"><div class="empty">Carregando...</div></div></div>';
  db.collection('clientes').doc(S.clienteConfig.id).collection('etiquetas_log')
    .orderBy('timestamp', 'desc').limit(30).get().then(function(snap) {
      var listWrap = document.getElementById('etc-hub-recent-list');
      if (!listWrap) return;
      if (snap.empty) { listWrap.innerHTML = '<div class="empty">Nenhuma impressão registrada ainda.</div>'; return; }
      // Agrupa entradas consecutivas do mesmo produto + mesma origem (lote
      // ou pontual) em um "evento de impressão" com contagem — cada etiqueta
      // física gera 1 doc em etiquetas_log, então imprimir 20 cópias de uma
      // vez gera 20 docs seguidos que devem aparecer como uma linha só "20".
      var grupos = [];
      snap.docs.forEach(function(d) {
        var l = d.data();
        var chave = (l.loteId || 'pontual') + '|' + l.nomeProduto;
        var ultimo = grupos[grupos.length - 1];
        if (ultimo && ultimo.chave === chave) {
          ultimo.qtd++;
        } else {
          grupos.push({chave: chave, nome: l.nomeProduto, timestamp: l.timestamp, qtd: 1});
        }
      });
      listWrap.innerHTML = grupos.slice(0, 5).map(function(g) {
        var quando = g.timestamp ? _etcFormatarRelativo(g.timestamp.toDate()) : '-';
        return '<div class="etc-hub-recent-item">' +
          '<div><div class="etc-hub-recent-name">' + _escHtml(g.nome) + '</div><div class="etc-hub-recent-meta">' + quando + '</div></div>' +
          '<div class="etc-hub-recent-qtd">' + g.qtd + '</div>' +
        '</div>';
      }).join('');
    }).catch(function(e) {
      var listWrap = document.getElementById('etc-hub-recent-list');
      if (listWrap) listWrap.innerHTML = '<div class="empty">Erro ao carregar: ' + _escHtml(e.message) + '</div>';
    });
}

function _etcFormatarRelativo(data) {
  var hoje = new Date(); hoje.setHours(0,0,0,0);
  var ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
  var d = new Date(data); d.setHours(0,0,0,0);
  var hora = data.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
  if (d.getTime() === hoje.getTime()) return 'Hoje, ' + hora;
  if (d.getTime() === ontem.getTime()) return 'Ontem, ' + hora;
  return data.toLocaleDateString('pt-BR') + ', ' + hora;
}
```

- [ ] **Step 2: Verificar manualmente**

Com pelo menos uma entrada existente em `etiquetas_log` (se não houver, imprimir será possível só depois da Task 6 — nesse caso, voltar e confirmar este passo depois). Abrir o hub, confirmar que "Últimas impressões" mostra nome do produto, "Hoje/Ontem, HH:MM" e a contagem correta quando várias etiquetas do mesmo produto foram impressas em sequência (mesma origem).

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: lista Últimas impressões no hub de Etiquetas"
```

---

### Task 5: Etiqueta Avulsa — quantidade editável + botão "Ver Etiqueta"

**Files:**
- Modify: `app.js:4610-4665` (`renderEtcPontual`, `buscarProdutoPontual`)

**Interfaces:**
- Consumes: `iniciarScanEAN`, `abrirEtcHub`, `abrirEtcPreview` (Task 3/6).
- Produces: `renderEtcAvulsa()`, `buscarProdutoAvulsa(codigo)`, `_etcRenderAvulsaCard(produto)`, `_etcAvulsaQtd`.
- Remove: `renderEtcPontual`, `buscarProdutoPontual` (renomeadas/substituídas).

- [ ] **Step 1: Substituir `renderEtcPontual` e `buscarProdutoPontual`**

Trocar (`app.js:4610-4665`, do comentário `// ── Etiquetas: correção pontual...` até o fim de `buscarProdutoPontual`):
```js
// ── Etiquetas: correção pontual (mobile) — scan, prévia, impressão, log ──
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

function buscarProdutoPontual(codigo) {
  if (!codigo) return;
  var preview = document.getElementById('etc-preview');
  preview.innerHTML = '<div class="empty">Buscando...</div>';
  firebase.auth().currentUser.getIdToken().then(function(token) {
    return fetch(ETIQUETAS_API_URL + '/produto/' + encodeURIComponent(codigo), {
      headers: {Authorization: 'Bearer ' + token}
    });
  }).then(function(resp) {
    if (resp.status === 404) throw new Error('Produto não encontrado.');
    if (!resp.ok) throw new Error('Erro ao consultar o ERP.');
    return resp.json();
  }).then(function(produto) {
    var disabledAttr = _etcWriteChar ? '' : 'disabled title="Conecte a impressora primeiro"';
    preview.innerHTML =
      '<div class="card" style="padding:16px">' +
        '<div style="font-weight:700;margin-bottom:4px">' + _escHtml(produto.nome) + '</div>' +
        '<div style="font-size:20px;color:var(--pri);font-weight:800;margin-bottom:12px">R$ ' + produto.preco.toFixed(2) + '</div>' +
        '<button class="btn btn-p" style="width:100%" ' + disabledAttr + ' onclick="confirmarImpressaoPontual(' + _escHtml(JSON.stringify(produto)) + ')">Imprimir etiqueta</button>' +
      '</div>';
  }).catch(function(e) {
    preview.innerHTML = '<div class="empty">' + _escHtml(e.message) + '</div>';
  });
}
```
por:
```js
// ── Etiquetas: Etiqueta Avulsa (mobile) — scan, prévia, quantidade ──
var _etcAvulsaQtd = 1;

function renderEtcAvulsa() {
  var wrap = document.getElementById('etc-view-avulsa');
  // Reaproveita iniciarScanEAN (já resolve leitura de câmera via ZXing no
  // coletor real). Não usar BarcodeDetector nativo (ver Global Constraints).
  var btnCamera = (typeof ZXing !== 'undefined')
    ? '<button class="btn btn-s" style="flex-shrink:0" onclick="iniciarScanEAN(\'etc-input-codigo\')" title="Bipar com a câmera">📷</button>'
    : '';
  wrap.innerHTML =
    '<div class="etc-sub-topbar"><button class="etc-topbar-back" onclick="abrirEtcHub(\'hub\')">← Etiquetas e Consulta</button></div>' +
    (!_etcWriteChar ? '<div class="etc-aviso"><span>Conecte a impressora antes de imprimir.</span><a onclick="abrirEtcHub(\'impressora\')">Ir para Impressora</a></div>' : '') +
    '<div style="display:flex;gap:8px;margin-bottom:12px">' +
      '<input id="etc-input-codigo" placeholder="Bipe o código de barras" autofocus style="flex:1;padding:14px;font-size:16px">' +
      btnCamera +
    '</div>' +
    '<div id="etc-avulsa-preview"></div>';
  var input = document.getElementById('etc-input-codigo');
  var timer = null;
  input.addEventListener('input', function() {
    clearTimeout(timer);
    timer = setTimeout(function() { buscarProdutoAvulsa(input.value.trim()); }, 1000);
  });
  // iniciarScanEAN preenche o input e dispara um keydown de Enter (não um
  // evento "input") — sem este listener a busca nunca dispararia após ler
  // pela câmera. Também beneficia coletores físicos configurados pra enviar
  // Enter após o código, e digitação manual com Enter.
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      clearTimeout(timer);
      buscarProdutoAvulsa(input.value.trim());
    }
  });
}

function buscarProdutoAvulsa(codigo) {
  if (!codigo) return;
  _etcAvulsaQtd = 1;
  var preview = document.getElementById('etc-avulsa-preview');
  preview.innerHTML = '<div class="empty">Buscando...</div>';
  firebase.auth().currentUser.getIdToken().then(function(token) {
    return fetch(ETIQUETAS_API_URL + '/produto/' + encodeURIComponent(codigo), {
      headers: {Authorization: 'Bearer ' + token}
    });
  }).then(function(resp) {
    if (resp.status === 404) throw new Error('Produto não encontrado.');
    if (!resp.ok) throw new Error('Erro ao consultar o ERP.');
    return resp.json();
  }).then(function(produto) {
    _etcRenderAvulsaCard(produto);
  }).catch(function(e) {
    preview.innerHTML = '<div class="empty">' + _escHtml(e.message) + '</div>';
  });
}

// Card do produto com stepper de quantidade — chamada de novo a cada +/-
// (re-render simples, sem estado por-elemento; o projeto já usa esse padrão
// em outras telas do módulo).
function _etcRenderAvulsaCard(produto) {
  var preview = document.getElementById('etc-avulsa-preview');
  var produtoJson = _escHtml(JSON.stringify(produto));
  preview.innerHTML =
    '<div class="card" style="padding:16px">' +
      '<div style="font-weight:700;margin-bottom:4px">' + _escHtml(produto.nome) + '</div>' +
      '<div style="font-size:11.5px;color:var(--t3);margin-bottom:8px">Código: ' + _escHtml(produto.codigoBarras) + '</div>' +
      '<div style="font-size:20px;color:var(--dk2);font-weight:800;margin-bottom:4px">R$ ' + produto.preco.toFixed(2) + '</div>' +
      '<div class="etc-stepper">' +
        '<button onclick="_etcAvulsaQtd=Math.max(1,_etcAvulsaQtd-1);_etcRenderAvulsaCard(' + produtoJson + ')">−</button>' +
        '<div class="etc-stepper-val">' + _etcAvulsaQtd + '</div>' +
        '<button onclick="_etcAvulsaQtd++;_etcRenderAvulsaCard(' + produtoJson + ')">+</button>' +
      '</div>' +
      '<button class="btn btn-p" style="width:100%" onclick="abrirEtcPreview(' + produtoJson + ', _etcAvulsaQtd)">Ver Etiqueta</button>' +
    '</div>';
}
```

Nota sobre o bug herdado: a versão antiga usava `var(--pri)`, token que nunca foi definido em `style.css` (preço aparecia sem cor). A versão nova usa `var(--dk2)` (`#e6b200`, dourado escuro — já existe e contrasta bem em fundo branco), corrigindo o bug de passagem.

- [ ] **Step 2: Verificar manualmente**

No hub, tocar em "Etiqueta Avulsa". Bipar/digitar `7891021001885` (EAN já validado com dado real do ERP). Confirmar: (a) card mostra nome, código e preço em dourado; (b) stepper começa em 1 e os botões +/− funcionam; (c) botão "Ver Etiqueta" leva pra tela de preview (ainda vazia/quebrada até a Task 6 — só confirmar que não há erro de JS e que dá pra voltar pelo botão "← Etiquetas e Consulta").

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: Etiqueta Avulsa com quantidade editável (corrige --pri inexistente de passagem)"
```

---

### Task 6: Tela de preview + impressão de N cópias

**Files:**
- Modify: `app.js` (adicionar `renderEtcPreview`, `confirmarImpressaoAvulsa`; remover `confirmarImpressaoPontual`, `app.js:4667-4703`)

**Interfaces:**
- Consumes: `imprimirEtiquetaBluetooth`, `_etcPreviewProduto`/`_etcPreviewQtd` (Task 3), `JsBarcode` (Task 2), `abrirEtcHub`.
- Produces: `renderEtcPreview(produto, qtd)`, `confirmarImpressaoAvulsa(produto, qtdTotal)`.
- Remove: `confirmarImpressaoPontual` (substituída — a impressão agora acontece na tela de preview, não mais direto no card).

- [ ] **Step 1: Remover `confirmarImpressaoPontual` e adicionar `renderEtcPreview` + `confirmarImpressaoAvulsa`**

Remover (`app.js:4667-4703`):
```js
function confirmarImpressaoPontual(produto) {
  if (_etcImprimindo) return;
  _etcImprimindo = true;
  var btn = document.querySelector('#etc-preview button.btn-p');
  if (btn) btn.disabled = true;
  imprimirEtiquetaBluetooth(produto).then(function() {
    return db.collection('clientes').doc(S.clienteConfig.id).collection('etiquetas_log').add({
      codigoBarras: produto.codigoBarras,
      nomeProduto: produto.nome,
      precoImpresso: produto.preco,
      origem: 'pontual',
      loteId: null,
      operadorId: S.currentUser ? S.currentUser.id : null,
      operadorNome: S.currentUser ? S.currentUser.nome : '-',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function(e) {
      showToast('⚠️ Etiqueta impressa, mas houve erro ao registrar o log: ' + e.message);
      document.getElementById('etc-input-codigo').value = '';
      document.getElementById('etc-preview').innerHTML = '';
      document.getElementById('etc-input-codigo').focus();
      throw { _loggedAlready: true };
    });
  }).then(function() {
    showToast('✅ Etiqueta impressa!');
    document.getElementById('etc-input-codigo').value = '';
    document.getElementById('etc-preview').innerHTML = '';
    document.getElementById('etc-input-codigo').focus();
  }).catch(function(e) {
    if (e && e._loggedAlready) return;
    showToast('❌ Erro ao imprimir: ' + e.message);
  }).then(function() {
    // Roda sempre (sucesso ou erro tratado acima) — equivalente a um "finally"
    // nesta cadeia baseada em .then()/.catch() sem async/await.
    _etcImprimindo = false;
    if (btn) btn.disabled = false;
  });
}
```

Adicionar no lugar:
```js
// ── Etiquetas: preview antes de imprimir (mobile) ──
function renderEtcPreview(produto, qtd) {
  _etcPreviewProduto = produto;
  _etcPreviewQtd = qtd;
  var wrap = document.getElementById('etc-view-preview');
  var disabledAttr = _etcWriteChar ? '' : 'disabled title="Conecte a impressora primeiro"';
  wrap.innerHTML =
    '<div class="etc-sub-topbar"><button class="etc-topbar-back" onclick="abrirEtcHub(\'avulsa\')">← Voltar</button></div>' +
    '<div class="etc-preview-label">' +
      '<div class="etc-preview-label-nome">' + _escHtml(produto.nome) + '</div>' +
      '<div class="etc-preview-label-preco">R$ ' + produto.preco.toFixed(2) + '</div>' +
      '<svg id="etc-preview-barcode-svg"></svg>' +
      '<div style="font-size:11px;color:var(--t3);margin-top:6px">' + new Date().toLocaleDateString('pt-BR') + '</div>' +
    '</div>' +
    (!_etcWriteChar
      ? '<div class="etc-aviso"><span>Conecte a impressora antes de imprimir.</span><a onclick="abrirEtcHub(\'impressora\')">Ir para Impressora</a></div>'
      : '<div style="text-align:center;font-size:12.5px;color:var(--t3);margin-bottom:6px">Impressora: ' + _escHtml(_etcDevice ? _etcDevice.name : '') + '</div>') +
    '<div class="etc-stepper">' +
      '<button onclick="renderEtcPreview(_etcPreviewProduto, Math.max(1,_etcPreviewQtd-1))">−</button>' +
      '<div class="etc-stepper-val">' + qtd + '</div>' +
      '<button onclick="renderEtcPreview(_etcPreviewProduto, _etcPreviewQtd+1)">+</button>' +
    '</div>' +
    '<button class="btn btn-p" style="width:100%" ' + disabledAttr + ' onclick="confirmarImpressaoAvulsa(_etcPreviewProduto, _etcPreviewQtd)">Imprimir Agora</button>' +
    '<div id="etc-preview-progresso" style="text-align:center;margin-top:8px;font-size:12.5px;color:var(--t3)"></div>';
  try {
    if (typeof JsBarcode !== 'undefined') {
      JsBarcode('#etc-preview-barcode-svg', produto.codigoBarras, {format:'CODE128', width:2, height:44, displayValue:true, fontSize:12, margin:4});
    }
  } catch (e) {
    console.error('[etiquetas] erro ao renderizar barcode de preview:', e.message);
  }
}

// Imprime qtdTotal cópias em sequência, com ~300ms de intervalo (mesmo
// padrão de imprimirTudoDaFila, pra não sobrecarregar o buffer do K329).
// Para no primeiro erro real, mantendo o contador do que já saiu.
function confirmarImpressaoAvulsa(produto, qtdTotal) {
  if (_etcImprimindo) return;
  _etcImprimindo = true;
  var impressas = 0;
  var btn = document.querySelector('#etc-view-preview .btn-p');
  if (btn) btn.disabled = true;

  function imprimirUma() {
    imprimirEtiquetaBluetooth(produto).then(function() {
      return db.collection('clientes').doc(S.clienteConfig.id).collection('etiquetas_log').add({
        codigoBarras: produto.codigoBarras,
        nomeProduto: produto.nome,
        precoImpresso: produto.preco,
        origem: 'pontual',
        loteId: null,
        operadorId: S.currentUser ? S.currentUser.id : null,
        operadorNome: S.currentUser ? S.currentUser.nome : '-',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function(e) {
        showToast('⚠️ Etiqueta impressa, mas houve erro ao registrar o log: ' + e.message);
      });
    }).then(function() {
      impressas++;
      var progresso = document.getElementById('etc-preview-progresso');
      if (progresso && qtdTotal > 1) progresso.textContent = 'Impressas ' + impressas + ' de ' + qtdTotal + '...';
      if (impressas < qtdTotal) {
        setTimeout(imprimirUma, 300);
      } else {
        _etcImprimindo = false;
        showToast('✅ ' + (qtdTotal > 1 ? (qtdTotal + ' etiquetas impressas!') : 'Etiqueta impressa!'));
        abrirEtcHub('hub');
      }
    }).catch(function(e) {
      _etcImprimindo = false;
      showToast('❌ Erro ao imprimir (' + impressas + ' de ' + qtdTotal + ' já impressas): ' + e.message);
      if (btn) btn.disabled = false;
    });
  }
  imprimirUma();
}
```

- [ ] **Step 2: Verificar manualmente (ponta a ponta, com hardware físico)**

Com a impressora K329 conectada: hub → Etiqueta Avulsa → bipar `7891021001885` → aumentar quantidade pra 3 → "Ver Etiqueta" → confirmar que o preview mostra nome, preço, código de barras renderizado (JsBarcode) e data → "Imprimir Agora". Confirmar: (a) contador "Impressas 1 de 3...", "2 de 3...", "3 de 3" aparece; (b) 3 etiquetas físicas saem da impressora; (c) volta pro hub automaticamente ao terminar; (d) "Últimas impressões" no hub mostra a linha agrupada com quantidade 3. Repetir com quantidade 1 (sem impressora conectada) — confirmar botão "Imprimir Agora" desabilitado e aviso visível.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: tela de preview da etiqueta com código de barras e impressão de N cópias"
```

---

### Task 7: Etiquetas em Lote — catálogo mockado (busca + filtro + checkbox)

**Files:**
- Modify: `app.js:4706-4722` (`renderEtcLotes`)
- Modify: `app.js:4728-4753` (`abrirLoteParaImpressao`) — só troca de `#etc-tab-lotes` pra `#etc-view-lote`
- Modify: `app.js:4755-4768` (`renderFilaLote`) — só troca de `#etc-tab-lotes` pra `#etc-view-lote`
- Modify: `app.js:4770-4790` (`_avancarFilaLoteAposImpressao`) — suporta lote sem `_loteAtualId` (mockado)
- Modify: `app.js:4797-4866` (`imprimirProximoDaFila`) — só troca o seletor `#etc-tab-lotes .btn-row .btn` pra `#etc-view-lote .btn-row .btn`

**Interfaces:**
- Produces: `ETC_MOCK_PRODUTOS`, `renderEtcMontarLote()`, `_etcGerarLoteMock()` — `ETC_MOCK_PRODUTOS` também consumido pela Task 8 (Consulta).
- Consumes: `_loteAtualId`, `_loteAtualFila`, `renderFilaLote` (já existem).

- [ ] **Step 1: Substituir `renderEtcLotes` e adicionar o catálogo mockado + construtor de lote**

Trocar (`app.js:4706-4722`):
```js
// ── Etiquetas: fluxo de lote (mobile) — resolver preços, fila, conclusão ──
function renderEtcLotes() {
  var wrap = document.getElementById('etc-tab-lotes');
  wrap.innerHTML = '<div class="empty">Carregando...</div>';
  db.collection('clientes').doc(S.clienteConfig.id).collection('etiquetas_lote')
    .where('status', '==', 'pendente').get().then(function(snap) {
      if (snap.empty) { wrap.innerHTML = '<div class="empty">Nenhum lote pendente.</div>'; return; }
      wrap.innerHTML = snap.docs.map(function(d) {
        var l = d.data();
        return '<div class="card" style="padding:14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">' +
          '<div>' + l.itens.length + ' itens</div>' +
          '<button class="btn btn-p btn-sm" onclick="abrirLoteParaImpressao(\'' + d.id + '\')">Abrir</button>' +
          '</div>';
      }).join('');
    }).catch(function(e) {
      wrap.innerHTML = '<div class="empty">Erro ao carregar: ' + _escHtml(e.message) + '</div>';
    });
}
```
por:
```js
// ── Etiquetas: fluxo de lote (mobile) — resolver preços, fila, conclusão ──
// Lista os lotes montados na retaguarda (desktop, fluxo existente desde o
// v1) e oferece "+ Montar novo lote" como caminho alternativo mobile (novo
// nesta rodada) — os dois convivem, nenhum substitui o outro.
function renderEtcLotes() {
  var wrap = document.getElementById('etc-view-lote');
  wrap.innerHTML =
    '<div class="etc-sub-topbar"><button class="etc-topbar-back" onclick="abrirEtcHub(\'hub\')">← Etiquetas e Consulta</button></div>' +
    (!_etcWriteChar ? '<div class="etc-aviso"><span>Conecte a impressora antes de imprimir.</span><a onclick="abrirEtcHub(\'impressora\')">Ir para Impressora</a></div>' : '') +
    '<button class="btn btn-p" style="width:100%;margin-bottom:16px" onclick="renderEtcMontarLote()">+ Montar novo lote</button>' +
    '<div id="etc-lotes-pendentes"><div class="empty">Carregando lotes pendentes...</div></div>';
  db.collection('clientes').doc(S.clienteConfig.id).collection('etiquetas_lote')
    .where('status', '==', 'pendente').get().then(function(snap) {
      var listWrap = document.getElementById('etc-lotes-pendentes');
      if (!listWrap) return;
      if (snap.empty) { listWrap.innerHTML = '<div class="empty">Nenhum lote pendente da retaguarda.</div>'; return; }
      listWrap.innerHTML = snap.docs.map(function(d) {
        var l = d.data();
        return '<div class="card" style="padding:14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">' +
          '<div>' + l.itens.length + ' itens</div>' +
          '<button class="btn btn-p btn-sm" onclick="abrirLoteParaImpressao(\'' + d.id + '\')">Abrir</button>' +
          '</div>';
      }).join('');
    }).catch(function(e) {
      var listWrap = document.getElementById('etc-lotes-pendentes');
      if (listWrap) listWrap.innerHTML = '<div class="empty">Erro ao carregar: ' + _escHtml(e.message) + '</div>';
    });
}

// Catálogo temporário — a etiquetas-api hoje só expõe GET /produto/:codigo
// (busca exata), sem endpoint de busca/filtro por Departamento/Setor/Marca.
// Investigar o schema real do ERP (supermercado.itens + tabelas de grupo)
// depende de acesso à rede da Central, indisponível nesta sessão — decisão
// explícita do Tiago (spec 2026-08-20, Fora de escopo). Quando o endpoint
// real existir, troca-se esta lista fixa por uma chamada de rede.
var ETC_MOCK_PRODUTOS = [
  {codigoBarras:'7891021001885', nome:'Melitta Filtro Papel 102', preco:5.69, departamento:'Mercearia', setor:'Café e Filtros', marca:'Melitta', estoque:24, precoAnterior:5.29},
  {codigoBarras:'7891000100103', nome:'Arroz Tipo 1 5kg', preco:24.90, departamento:'Mercearia', setor:'Grãos', marca:'Tio João', estoque:40, precoAnterior:23.90},
  {codigoBarras:'7896004004501', nome:'Feijão Carioca 1kg', preco:8.99, departamento:'Mercearia', setor:'Grãos', marca:'Camil', estoque:35, precoAnterior:8.49},
  {codigoBarras:'7891910000197', nome:'Açúcar Cristal 1kg', preco:4.79, departamento:'Mercearia', setor:'Açúcar e Adoçante', marca:'União', estoque:60, precoAnterior:4.59},
  {codigoBarras:'7896336010012', nome:'Café Extra Forte 500g', preco:16.90, departamento:'Mercearia', setor:'Café e Filtros', marca:'3 Corações', estoque:18, precoAnterior:15.90},
  {codigoBarras:'7891000053001', nome:'Leite Integral 1L', preco:5.49, departamento:'Laticínios', setor:'Leites', marca:'Piracanjuba', estoque:50, precoAnterior:5.29}
];

var _etcLoteSelecionados = {}; // codigoBarras -> {produto, qtd}

function _etcFiltrosUnicos(campo) {
  var vistos = {}, out = [];
  ETC_MOCK_PRODUTOS.forEach(function(p) { if (!vistos[p[campo]]) { vistos[p[campo]] = true; out.push(p[campo]); } });
  return out.sort();
}

function renderEtcMontarLote() {
  _etcLoteSelecionados = {};
  var wrap = document.getElementById('etc-view-lote');
  wrap.innerHTML =
    '<div class="etc-sub-topbar"><button class="etc-topbar-back" onclick="renderEtcLotes()">← Lotes pendentes</button></div>' +
    '<input id="etc-lote-busca" placeholder="Buscar produtos..." style="width:100%;padding:12px;font-size:14px;margin-bottom:10px" oninput="_etcRenderListaLote()">' +
    '<div class="etc-filter-row">' +
      '<select id="etc-lote-filtro-depto" onchange="_etcRenderListaLote()"><option value="">Departamento</option>' + _etcFiltrosUnicos('departamento').map(function(v){return '<option value="'+_escHtml(v)+'">'+_escHtml(v)+'</option>';}).join('') + '</select>' +
      '<select id="etc-lote-filtro-setor" onchange="_etcRenderListaLote()"><option value="">Setor</option>' + _etcFiltrosUnicos('setor').map(function(v){return '<option value="'+_escHtml(v)+'">'+_escHtml(v)+'</option>';}).join('') + '</select>' +
      '<select id="etc-lote-filtro-marca" onchange="_etcRenderListaLote()"><option value="">Marca</option>' + _etcFiltrosUnicos('marca').map(function(v){return '<option value="'+_escHtml(v)+'">'+_escHtml(v)+'</option>';}).join('') + '</select>' +
    '</div>' +
    '<div id="etc-lote-lista"></div>' +
    '<div class="etc-sticky-bar">' +
      '<span id="etc-lote-contagem" style="font-size:12.5px;color:var(--t3)">0 produtos selecionados</span>' +
      '<button class="btn btn-p" id="etc-lote-gerar-btn" disabled onclick="_etcGerarLoteMock()">Gerar Etiquetas</button>' +
    '</div>';
  _etcRenderListaLote();
}

function _etcRenderListaLote() {
  var busca = (document.getElementById('etc-lote-busca').value || '').toLowerCase();
  var depto = document.getElementById('etc-lote-filtro-depto').value;
  var setor = document.getElementById('etc-lote-filtro-setor').value;
  var marca = document.getElementById('etc-lote-filtro-marca').value;
  var filtrados = ETC_MOCK_PRODUTOS.filter(function(p) {
    if (busca && p.nome.toLowerCase().indexOf(busca) === -1 && p.codigoBarras.indexOf(busca) === -1) return false;
    if (depto && p.departamento !== depto) return false;
    if (setor && p.setor !== setor) return false;
    if (marca && p.marca !== marca) return false;
    return true;
  });
  var lista = document.getElementById('etc-lote-lista');
  if (!filtrados.length) { lista.innerHTML = '<div class="empty">Nenhum produto encontrado.</div>'; return; }
  lista.innerHTML = filtrados.map(function(p) {
    var sel = _etcLoteSelecionados[p.codigoBarras];
    var checked = sel ? 'checked' : '';
    var qtd = sel ? sel.qtd : 1;
    return '<div class="etc-check-item">' +
      '<input type="checkbox" ' + checked + ' onchange="_etcToggleLoteItem(' + _escHtml(JSON.stringify(p)) + ', this.checked)">' +
      '<div class="etc-check-item-body">' +
        '<div class="etc-check-item-name">' + _escHtml(p.nome) + '</div>' +
        '<div class="etc-check-item-meta">Código: ' + _escHtml(p.codigoBarras) + ' · R$ ' + p.preco.toFixed(2) + '</div>' +
      '</div>' +
      '<input type="number" class="etc-check-item-qtd" min="1" value="' + qtd + '" ' + (sel ? '' : 'disabled') + ' onchange="_etcAtualizarQtdLoteItem(\'' + p.codigoBarras + '\', this.value)">' +
    '</div>';
  }).join('');
}

function _etcToggleLoteItem(produto, marcado) {
  if (marcado) {
    _etcLoteSelecionados[produto.codigoBarras] = {produto: produto, qtd: 1};
  } else {
    delete _etcLoteSelecionados[produto.codigoBarras];
  }
  _etcAtualizarBarraLote();
  _etcRenderListaLote();
}

function _etcAtualizarQtdLoteItem(codigo, valor) {
  var qtd = Math.max(1, parseInt(valor, 10) || 1);
  if (_etcLoteSelecionados[codigo]) _etcLoteSelecionados[codigo].qtd = qtd;
  _etcAtualizarBarraLote();
}

function _etcAtualizarBarraLote() {
  var n = Object.keys(_etcLoteSelecionados).length;
  var contagem = document.getElementById('etc-lote-contagem');
  var btn = document.getElementById('etc-lote-gerar-btn');
  if (contagem) contagem.textContent = n + (n === 1 ? ' produto selecionado' : ' produtos selecionados');
  if (btn) { btn.disabled = n === 0; btn.textContent = 'Gerar Etiquetas' + (n ? ' (' + n + ')' : ''); }
}

// Monta a fila de impressão direto da seleção mockada, sem gravar um
// documento etiquetas_lote — fluxo mobile paralelo ao de retaguarda (que
// continua gravando o documento normalmente via abrirLoteParaImpressao).
function _etcGerarLoteMock() {
  var itens = Object.keys(_etcLoteSelecionados).map(function(k) { return _etcLoteSelecionados[k]; });
  if (!itens.length) return;
  _loteAtualId = null;
  _loteAtualFila = [];
  itens.forEach(function(it) {
    for (var i = 0; i < it.qtd; i++) _loteAtualFila.push(it.produto);
  });
  renderFilaLote();
}
```

- [ ] **Step 2: Renomear o container de `#etc-tab-lotes` pra `#etc-view-lote` em `abrirLoteParaImpressao`, `renderFilaLote` e `imprimirProximoDaFila`**

Trocar `abrirLoteParaImpressao` (`app.js:4728-4753`):
```js
var _loteAtualId = null, _loteAtualFila = [];
var _etcModoImprimirTudo = false; // true durante o loop automático de "Imprimir tudo"
var _etcFilaTotal = 0; // tamanho da fila no início do "Imprimir tudo", pro contador "X de Y"

function abrirLoteParaImpressao(loteId) {
  _loteAtualId = loteId;
  var wrap = document.getElementById('etc-tab-lotes');
  wrap.innerHTML = '<div class="empty">Resolvendo preços...</div>';
  db.collection('clientes').doc(S.clienteConfig.id).collection('etiquetas_lote').doc(loteId).get()
    .then(function(doc) {
      var itens = doc.data().itens;
      return firebase.auth().currentUser.getIdToken().then(function(token) {
        return Promise.all(itens.map(function(item) {
          return fetch(ETIQUETAS_API_URL + '/produto/' + encodeURIComponent(item.codigoBarras), {
            headers: {Authorization: 'Bearer ' + token}
          }).then(function(resp) { return resp.ok ? resp.json() : null; })
            .then(function(produto) { return {item: item, produto: produto}; });
        }));
      });
    }).then(function(resolvidos) {
      _loteAtualFila = [];
      resolvidos.forEach(function(r) {
        if (!r.produto) return;
        for (var i = 0; i < r.item.qtdEtiquetas; i++) _loteAtualFila.push(r.produto);
      });
      renderFilaLote();
    }).catch(function(e) {
      wrap.innerHTML = '<div class="empty">Erro ao carregar: ' + _escHtml(e.message) + '</div>';
    });
}
```
por:
```js
var _loteAtualId = null, _loteAtualFila = [];
var _etcModoImprimirTudo = false; // true durante o loop automático de "Imprimir tudo"
var _etcFilaTotal = 0; // tamanho da fila no início do "Imprimir tudo", pro contador "X de Y"

function abrirLoteParaImpressao(loteId) {
  _loteAtualId = loteId;
  var wrap = document.getElementById('etc-view-lote');
  wrap.innerHTML = '<div class="empty">Resolvendo preços...</div>';
  db.collection('clientes').doc(S.clienteConfig.id).collection('etiquetas_lote').doc(loteId).get()
    .then(function(doc) {
      var itens = doc.data().itens;
      return firebase.auth().currentUser.getIdToken().then(function(token) {
        return Promise.all(itens.map(function(item) {
          return fetch(ETIQUETAS_API_URL + '/produto/' + encodeURIComponent(item.codigoBarras), {
            headers: {Authorization: 'Bearer ' + token}
          }).then(function(resp) { return resp.ok ? resp.json() : null; })
            .then(function(produto) { return {item: item, produto: produto}; });
        }));
      });
    }).then(function(resolvidos) {
      _loteAtualFila = [];
      resolvidos.forEach(function(r) {
        if (!r.produto) return;
        for (var i = 0; i < r.item.qtdEtiquetas; i++) _loteAtualFila.push(r.produto);
      });
      renderFilaLote();
    }).catch(function(e) {
      wrap.innerHTML = '<div class="empty">Erro ao carregar: ' + _escHtml(e.message) + '</div>';
    });
}
```

Trocar `renderFilaLote` (`app.js:4755-4768`):
```js
function renderFilaLote() {
  var wrap = document.getElementById('etc-tab-lotes');
  if (!_loteAtualFila.length) {
    wrap.innerHTML = '<div class="empty">Fila vazia ou todos os produtos falharam ao resolver.</div><button class="btn btn-s btn-sm" onclick="renderEtcLotes()">Voltar</button>';
    return;
  }
  var disabledAttr = _etcWriteChar ? '' : 'disabled title="Conecte a impressora primeiro"';
  wrap.innerHTML = '<div style="margin-bottom:10px">Restam ' + _loteAtualFila.length + ' etiquetas.</div>' +
    '<div class="btn-row">' +
      '<button class="btn btn-p" style="flex:1" ' + disabledAttr + ' onclick="imprimirProximoDaFila()">Imprimir próxima</button>' +
      '<button class="btn btn-s" style="flex:1" ' + disabledAttr + ' onclick="imprimirTudoDaFila()">Imprimir tudo</button>' +
    '</div>' +
    '<div id="etc-fila-progresso" style="margin-top:10px;font-size:12.5px;color:var(--t3)"></div>';
}
```
por:
```js
function renderFilaLote() {
  var wrap = document.getElementById('etc-view-lote');
  if (!_loteAtualFila.length) {
    wrap.innerHTML = '<div class="empty">Fila vazia ou todos os produtos falharam ao resolver.</div><button class="btn btn-s btn-sm" onclick="renderEtcLotes()">Voltar</button>';
    return;
  }
  var disabledAttr = _etcWriteChar ? '' : 'disabled title="Conecte a impressora primeiro"';
  wrap.innerHTML = '<div style="margin-bottom:10px">Restam ' + _loteAtualFila.length + ' etiquetas.</div>' +
    '<div class="btn-row">' +
      '<button class="btn btn-p" style="flex:1" ' + disabledAttr + ' onclick="imprimirProximoDaFila()">Imprimir próxima</button>' +
      '<button class="btn btn-s" style="flex:1" ' + disabledAttr + ' onclick="imprimirTudoDaFila()">Imprimir tudo</button>' +
    '</div>' +
    '<div id="etc-fila-progresso" style="margin-top:10px;font-size:12.5px;color:var(--t3)"></div>';
}
```

Em `imprimirProximoDaFila` (`app.js:4797-4866`), trocar as duas ocorrências de:
```js
  var btns = document.querySelectorAll('#etc-tab-lotes .btn-row .btn');
```
```js
      var btnsAgain = document.querySelectorAll('#etc-tab-lotes .btn-row .btn');
```
por, respectivamente:
```js
  var btns = document.querySelectorAll('#etc-view-lote .btn-row .btn');
```
```js
      var btnsAgain = document.querySelectorAll('#etc-view-lote .btn-row .btn');
```
(único trecho da função que muda — todo o resto de `imprimirProximoDaFila`, incluindo o tratamento de erro e o loop de "Imprimir tudo", permanece exatamente igual ao já existente.)

- [ ] **Step 3: Suportar lote sem `_loteAtualId` (mockado) em `_avancarFilaLoteAposImpressao`**

Trocar (`app.js:4770-4790`):
```js
// Avança a fila (item já foi fisicamente impresso, o log pode ou não ter sido gravado)
// e conclui o lote quando a fila esvaziar. Retorna uma promise.
function _avancarFilaLoteAposImpressao() {
  _loteAtualFila.shift();
  if (!_loteAtualFila.length) {
    return db.collection('clientes').doc(S.clienteConfig.id).collection('etiquetas_lote').doc(_loteAtualId)
      .update({status: 'concluido'}).then(function() {
        showToast('✅ Lote concluído!');
        renderEtcLotes();
      }).catch(function(e) {
        // A fila já terminou de imprimir; só a atualização do status do lote falhou.
        // Não deixa isso virar o erro genérico de imprimirProximoDaFila (mesmo padrão
        // do marcador _loggedAlready usado no catch de log acima).
        showToast('⚠️ Etiquetas impressas, mas não foi possível concluir o lote automaticamente: ' + e.message + '. Não reabra este lote sem verificar no histórico quais itens já foram impressos.');
        renderEtcLotes();
        throw { _loggedAlready: true };
      });
  }
  renderFilaLote();
  return Promise.resolve();
}
```
por:
```js
// Avança a fila (item já foi fisicamente impresso, o log pode ou não ter sido gravado)
// e conclui o lote quando a fila esvaziar. Retorna uma promise.
function _avancarFilaLoteAposImpressao() {
  _loteAtualFila.shift();
  if (!_loteAtualFila.length) {
    if (!_loteAtualId) {
      // Lote mockado (montado na Coleta via _etcGerarLoteMock, Task 7) —
      // não existe documento etiquetas_lote pra atualizar.
      showToast('✅ Lote concluído!');
      renderEtcLotes();
      return Promise.resolve();
    }
    return db.collection('clientes').doc(S.clienteConfig.id).collection('etiquetas_lote').doc(_loteAtualId)
      .update({status: 'concluido'}).then(function() {
        showToast('✅ Lote concluído!');
        renderEtcLotes();
      }).catch(function(e) {
        // A fila já terminou de imprimir; só a atualização do status do lote falhou.
        // Não deixa isso virar o erro genérico de imprimirProximoDaFila (mesmo padrão
        // do marcador _loggedAlready usado no catch de log acima).
        showToast('⚠️ Etiquetas impressas, mas não foi possível concluir o lote automaticamente: ' + e.message + '. Não reabra este lote sem verificar no histórico quais itens já foram impressos.');
        renderEtcLotes();
        throw { _loggedAlready: true };
      });
  }
  renderFilaLote();
  return Promise.resolve();
}
```

- [ ] **Step 4: Verificar manualmente**

Hub → Etiquetas em Lote. Confirmar que a lista de lotes pendentes da retaguarda (se houver algum criado por um admin) continua funcionando exatamente como antes (Abrir → resolve preços → fila → Imprimir tudo). Depois, tocar "+ Montar novo lote": buscar "café", confirmar que só aparecem os 2 produtos mockados com "café" no nome/setor; limpar a busca e filtrar por Departamento "Laticínios", confirmar que só aparece o Leite; marcar 2 produtos, ajustar quantidade de um deles pra 3, confirmar que o botão mostra "Gerar Etiquetas (2)" e a contagem "2 produtos selecionados"; tocar "Gerar Etiquetas" e confirmar que abre a fila de impressão com o total certo de etiquetas (soma das quantidades); com a impressora conectada, "Imprimir tudo" e confirmar que ao concluir volta pra lista de lotes sem tentar atualizar nenhum documento no Firestore (sem erro no console).

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: construtor de lote mobile (busca/filtro/checkbox) com catálogo mockado"
```

---

### Task 8: Consulta de Preços

**Files:**
- Modify: `app.js` (adicionar `renderEtcConsulta`, `buscarProdutoConsulta`)

**Interfaces:**
- Consumes: `ETIQUETAS_API_URL`, `ETC_MOCK_PRODUTOS` (Task 7), `iniciarScanEAN`, `_escHtml`.
- Produces: `renderEtcConsulta()`, `buscarProdutoConsulta(codigo)`.

- [ ] **Step 1: Adicionar `renderEtcConsulta` e `buscarProdutoConsulta`**

Adicionar em `app.js`, logo após o bloco de Etiquetas em Lote (Task 7):
```js
// ── Etiquetas: Consulta de Preços (mobile) — só visualização, sem imprimir ──
function renderEtcConsulta() {
  var wrap = document.getElementById('etc-view-consulta');
  var btnCamera = (typeof ZXing !== 'undefined')
    ? '<button class="btn btn-s" style="flex-shrink:0" onclick="iniciarScanEAN(\'etc-consulta-input\')" title="Bipar com a câmera">📷</button>'
    : '';
  wrap.innerHTML =
    '<div class="etc-sub-topbar"><button class="etc-topbar-back" onclick="abrirEtcHub(\'hub\')">← Etiquetas e Consulta</button></div>' +
    '<div style="display:flex;gap:8px;margin-bottom:12px">' +
      '<input id="etc-consulta-input" placeholder="Bipe ou digite o código" autofocus style="flex:1;padding:14px;font-size:16px">' +
      btnCamera +
    '</div>' +
    '<div id="etc-consulta-preview"></div>';
  var input = document.getElementById('etc-consulta-input');
  var timer = null;
  input.addEventListener('input', function() {
    clearTimeout(timer);
    timer = setTimeout(function() { buscarProdutoConsulta(input.value.trim()); }, 1000);
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      clearTimeout(timer);
      buscarProdutoConsulta(input.value.trim());
    }
  });
}

// Nome/preço/código vêm da etiquetas-api real (mesmo endpoint que Etiqueta
// Avulsa já usa). Estoque/preço anterior/marca/departamento ainda não
// existem na API real — só aparecem quando o código bipado bate com um item
// do catálogo mockado (ETC_MOCK_PRODUTOS, Task 7); pra qualquer outro código
// real, o card mostra "—" em vez de inventar valor. Ver spec 2026-08-20, Parte 4.
function buscarProdutoConsulta(codigo) {
  if (!codigo) return;
  var preview = document.getElementById('etc-consulta-preview');
  preview.innerHTML = '<div class="empty">Buscando...</div>';
  firebase.auth().currentUser.getIdToken().then(function(token) {
    return fetch(ETIQUETAS_API_URL + '/produto/' + encodeURIComponent(codigo), {
      headers: {Authorization: 'Bearer ' + token}
    });
  }).then(function(resp) {
    if (resp.status === 404) throw new Error('Produto não encontrado.');
    if (!resp.ok) throw new Error('Erro ao consultar o ERP.');
    return resp.json();
  }).then(function(produto) {
    var mock = ETC_MOCK_PRODUTOS.filter(function(p) { return p.codigoBarras === produto.codigoBarras; })[0];
    preview.innerHTML =
      '<div class="card" style="padding:16px">' +
        '<div style="font-weight:700;margin-bottom:4px">' + _escHtml(produto.nome) + '</div>' +
        (mock ? '<div style="font-size:11.5px;color:var(--t3);margin-bottom:8px">' + _escHtml(mock.marca) + ' · ' + _escHtml(mock.departamento) + '</div>' : '') +
        '<div style="font-size:20px;color:var(--dk2);font-weight:800;margin-bottom:10px">R$ ' + produto.preco.toFixed(2) + '</div>' +
        '<div style="display:flex;gap:16px;font-size:12.5px;color:var(--t2)">' +
          '<div>Estoque: ' + (mock ? (mock.estoque + ' un.') : '—') + '</div>' +
          '<div>Preço anterior: ' + (mock && mock.precoAnterior ? ('R$ ' + mock.precoAnterior.toFixed(2)) : '—') + '</div>' +
        '</div>' +
      '</div>';
  }).catch(function(e) {
    preview.innerHTML = '<div class="empty">' + _escHtml(e.message) + '</div>';
  });
}
```

- [ ] **Step 2: Verificar manualmente**

Hub → Consulta de Preços. Bipar/digitar `7891021001885` (está no catálogo mockado) — confirmar que mostra marca "Melitta", departamento "Mercearia", preço real do ERP, estoque "24 un." e preço anterior "R$ 5,29". Bipar um código real qualquer que não esteja no catálogo mockado — confirmar que mostra nome/preço reais e "—" em estoque/preço anterior, sem quebrar. Confirmar que não existe nenhum botão de imprimir nesta tela.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: tela Consulta de Preços (dados reais + campos mockados quando disponíveis)"
```

---

### Task 9: Bump de BUILD e verificação final de ponta a ponta

**Files:**
- Modify: `app.js:2`, `sw.js:3`, `sw.js:11-12`, `index.html:20,1986`, `version.json`

- [ ] **Step 1: Bump de BUILD nos 6 lugares**

```js
// app.js linha 2
var BUILD = '317';
```
```js
// sw.js linha 3
var CACHE_NAME = 'cahu360-v317';
```
```js
// sw.js linhas 11-12
'./app.js?v=317',
'./style.css?v=317',
```
```html
<!-- index.html linha 20 -->
<link rel="stylesheet" href="style.css?v=317"/>
<!-- index.html linha 1986 -->
<script src="app.js?v=317" defer></script>
```
```json
{"build":"317"}
```

- [ ] **Step 2: Verificação final de ponta a ponta**

Logar como operador (não-admin/supervisor), abrir "Etiquetas e Consulta" na capa. Percorrer o fluxo completo:
1. Hub carrega com 4 cards + Últimas impressões.
2. Impressora: conectar no K329 físico, confirmar pill "● Conectada" no card do hub.
3. Etiqueta Avulsa: bipar produto real, ajustar quantidade, ver preview com barcode, imprimir 2 cópias, confirmar 2 etiquetas físicas e volta ao hub.
4. Etiquetas em Lote: abrir um lote pendente da retaguarda (se existir) e confirmar que imprime normalmente; depois "+ Montar novo lote", selecionar 2 produtos mockados, gerar e imprimir a fila completa.
5. Consulta de Preços: bipar o EAN mockado e um EAN real qualquer, confirmar os dois casos (com e sem dados extras).
6. Conferir no Firestore (`etiquetas_log`) que todas as impressões desta sessão de teste foram gravadas com os campos corretos.

- [ ] **Step 3: Commit**

```bash
git add app.js sw.js index.html version.json
git commit -m "chore: bump de BUILD pro redesign em hub de Etiquetas"
```

---

## Self-review notes

- **Cobertura da spec:** Parte 1 (Hub) → Tasks 3-4; Parte 2 (Avulsa + preview) → Tasks 5-6; Parte 3 (Lote) → Task 7; Parte 4 (Consulta) → Task 8; Parte 5 (Impressora) → Task 3; Paleta/componentes visuais → Task 1 (CSS) + correção do bug `--pri` → Task 5; Erros e casos de borda → tratados inline em cada task (campo mockado ausente exibe "—", bloqueio de impressão sem impressora em Avulsa/Lote/Preview, erro real de impressão para o loop mantendo contador); Testes → passo de verificação manual em cada task + verificação de ponta a ponta na Task 9.
- **Decisão de escopo confirmada com o Tiago durante o writing-plans:** as 4 telas entram nesta rodada, com Lote/Consulta usando `ETC_MOCK_PRODUTOS` até o endpoint real de busca/filtro existir na `etiquetas-api` (dependência de investigação de schema do ERP, fora de alcance nesta sessão por falta de acesso à rede da Central).
- **Consistência de tipos/nomes verificada:** `_etcCurrentView` (não `_etcTabAtual`, removido) é referenciado de forma consistente em `parearImpressora` (Task 3), `_etcAtualizarStatusUI` (Task 3) e nos comentários das tasks seguintes. `ETC_MOCK_PRODUTOS` é declarado uma única vez (Task 7) e consumido sem redeclaração pela Task 8. IDs de elemento (`etc-view-hub/avulsa/preview/lote/consulta/impressora`) são consistentes entre Task 2 (markup) e `abrirEtcHub`/`abrirEtcPreview` (Task 3).
- **Risco conhecido, não resolvido neste plano:** a `etiquetas-api` só roda localmente via túnel Cloudflare temporário nesta sessão — a Task 9 (verificação final) só é executável de fato quando a API estiver acessível (rede da Central ou túnel ativo). Isso é infraestrutura, não faz parte deste plano (ver spec, Fora de escopo).