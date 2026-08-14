# Módulo Etiquetas v2 (câmera, imprimir tudo, app shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar bipagem por câmera e impressão em lote automática ("imprimir tudo") ao fluxo mobile de Etiquetas, e trocar o chrome de `panel-etiquetas-coleta` (hoje sidebar+topbar de desktop encolhidos) por um app shell dedicado (topbar simples + tab bar fixa embaixo, sem bloqueio de acesso antes de conectar a impressora).

**Architecture:** Extensão pontual sobre o módulo Etiquetas v1 (já em produção). Toda a lógica de negócio existente (`imprimirEtiquetaBluetooth`, `parearImpressora`, escrita em `etiquetas_log`, resolução de preços do lote) é reaproveitada sem duplicação — as mudanças são de UI/navegação (Tasks 1-3), reaproveitamento de uma função de scan por câmera que já existe no projeto (Task 4), e um refactor pequeno do loop de impressão de lote pra suportar modo automático (Task 5).

**Tech Stack:** Vanilla JS sem bundler (mesmo padrão do resto do `app.js`), CSS puro (`style.css`), ZXing (`@zxing/library`, já carregado via CDN em `index.html:18` — nenhuma dependência nova).

Não existe test runner neste projeto (mesma decisão do plano v1). Os passos de "teste" são verificação manual (navegador, hardware físico).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-08-14-etiquetas-v2-design.md`.
- **Nunca usar `BarcodeDetector` nativo do navegador** — já tentado e abandonado neste projeto (`app.js:12057-12062`, comentário de `iniciarScanEAN`): no coletor físico real, a API "ou não existe, ou existe mas o device não tem o módulo de barcode do ML Kit instalado, e o `detect()` fica resolvendo vazio pra sempre sem erro nenhum". Usar sempre `iniciarScanEAN`/ZXing.
- O app shell (Tasks 1-3) é um piloto **só de `panel-etiquetas-coleta`** — não mexer em `panel-inv-coleta`, `panel-checklist` nem em nenhuma outra tela.
- Toda escrita em `etiquetas_log` e toda chamada a `imprimirEtiquetaBluetooth` devem seguir exatamente os mesmos campos/padrão já usados em `confirmarImpressaoPontual` e `imprimirProximoDaFila` (v1) — não inventar campos novos.
- Sempre que `app.js`, `style.css` ou `index.html` mudar de conteúdo, incrementar `BUILD`/`?v=` nos 6 lugares de costume (Task 7) — mesma regra do plano v1.
- Toda string de erro/nome de produto interpolada em HTML passa por `_escHtml()` (já definida em `app.js:4414`); toda string interpolada em comando TSPL passa por `_tsplTxt()` (já definida em `app.js:4531`) — não introduzir interpolação sem sanitização.
- Manter o guard `_etcImprimindo` (já existe, `app.js:4491`) como única trava contra impressão concorrente — não criar um segundo mecanismo de lock.

---

### Task 1: App shell — CSS dedicado

**Files:**
- Modify: `style.css:73` (logo após o bloco `/* PANELS */`)

**Interfaces:**
- Produces: classes `.etc-topbar`, `.etc-pill`/`.etc-pill-on`/`.etc-pill-off`, `.etc-body`, `.etc-aviso`, `.etc-tabbar`/`.etc-tabbar-item`/`.etc-tabbar-item.on` — consumidas pela Task 2 (markup).

- [ ] **Step 1: Adicionar o bloco de CSS do app shell**

Adicionar logo depois de `style.css:73` (`.panel{display:none}.panel.active{display:block}`):

```css

/* ETIQUETAS COLETA — app shell dedicado (piloto: tela cheia, sem sidebar/topbar) */
#panel-etiquetas-coleta.active{position:fixed;inset:0;z-index:150;background:var(--w);display:flex;flex-direction:column;padding:0}
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

Nota: `#panel-etiquetas-coleta.active` tem especificidade maior que `.panel.active` (ID+classe vs. duas classes), então sobrescreve `display:block` sem precisar de `!important`. `position:fixed;inset:0;z-index:150` tira o painel do fluxo normal de `.content` e cobre `.topbar` (z-index:100) — não precisa desligar sidebar/topbar globais em JS.

- [ ] **Step 2: Commit**

```bash
git add style.css
git commit -m "feat: CSS do app shell dedicado pra Etiquetas Coleta"
```

---

### Task 2: App shell — markup (topbar, aba Impressora, tab bar)

**Files:**
- Modify: `index.html:1215-1230` (bloco `panel-etiquetas-coleta`)

**Interfaces:**
- Consumes: classes da Task 1.
- Produces: elementos `#etc-status-pill`, `#etc-aviso-sem-impressora`, `#etc-tab-impressora`, `.etc-tabbar-item` — consumidos pela Task 3.

- [ ] **Step 1: Substituir o bloco `panel-etiquetas-coleta`**

Trocar (`index.html:1214-1230`):
```html
      <!-- === FC360 ETIQUETAS — COLETA (mobile) === -->
      <div id="panel-etiquetas-coleta" class="panel">
        <div id="etc-pareamento" style="text-align:center;padding:20px">
          <p style="margin-bottom:12px;color:var(--t3);font-size:13px">Conecte na impressora antes de começar.</p>
          <button class="btn btn-p" onclick="parearImpressora()">Conectar na impressora</button>
          <div id="etc-status-conexao" style="margin-top:10px;font-size:13px"></div>
        </div>

        <div id="etc-operacional" style="display:none">
          <div class="tabs" id="etc-tabs" style="margin-bottom:16px">
            <div class="tab on" onclick="switchEtcTab('pontual',this)">Correção Pontual</div>
            <div class="tab" onclick="switchEtcTab('lotes',this)">Lotes Pendentes</div>
          </div>
          <div id="etc-tab-pontual"></div>
          <div id="etc-tab-lotes" style="display:none"></div>
        </div>
      </div><!-- /panel-etiquetas-coleta -->
```
por:
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

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: markup do app shell dedicado pra Etiquetas Coleta"
```

---

### Task 3: App shell — navegação, status de conexão e aba Impressora

**Files:**
- Modify: `app.js:4493-4525` (`parearImpressora`, `switchEtcTab`)
- Modify: `app.js:1877-1880` (rota `etiquetas-coleta` em `nav()`)

**Interfaces:**
- Consumes: markup da Task 2.
- Produces: `_etcAtualizarStatusUI()`, `renderEtcImpressora()`, `_etcTabAtual` — consumidos pela Task 5 (bloqueio de impressão).

- [ ] **Step 1: Substituir `parearImpressora` e `switchEtcTab`, adicionar `_etcAtualizarStatusUI` e `renderEtcImpressora`**

Trocar (`app.js:4493-4525`):
```js
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
    document.getElementById('etc-status-conexao').textContent = '✅ Conectado em ' + _etcDevice.name;
    document.getElementById('etc-pareamento').style.display = 'none';
    document.getElementById('etc-operacional').style.display = 'block';
    switchEtcTab('pontual', document.querySelector('#etc-tabs .tab'));
  }).catch(function(e) {
    document.getElementById('etc-status-conexao').textContent = '❌ Erro: ' + e.message;
  });
}

function switchEtcTab(tab, btn) {
  document.getElementById('etc-tab-pontual').style.display = tab === 'pontual' ? 'block' : 'none';
  document.getElementById('etc-tab-lotes').style.display = tab === 'lotes' ? 'block' : 'none';
  document.querySelectorAll('#etc-tabs .tab').forEach(function(t){t.classList.remove('on');});
  if (btn) btn.classList.add('on');
  if (tab === 'pontual') renderEtcPontual();
  if (tab === 'lotes') renderEtcLotes();
}
```
por:
```js
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
    if (status) status.textContent = '✅ Conectado em ' + _etcDevice.name;
    _etcAtualizarStatusUI();
  }).catch(function(e) {
    var status = document.getElementById('etc-status-conexao');
    if (status) status.textContent = '❌ Erro: ' + e.message;
  });
}

var _etcTabAtual = 'pontual';

function switchEtcTab(tab, btn) {
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

- [ ] **Step 2: Atualizar a rota `etiquetas-coleta` em `nav()`**

Trocar (`app.js:1877-1880`):
```js
  if (page === 'etiquetas-coleta') {
    // Nada a carregar aqui: o próprio botão "Conectar na impressora"
    // (Task 8) dispara o resto do fluxo depois que o operador conecta.
  }
```
por:
```js
  if (page === 'etiquetas-coleta') {
    switchEtcTab('pontual', document.querySelector('.etc-tabbar-item'));
  }
```

- [ ] **Step 3: Verificar manualmente**

Logar como operador não-admin/supervisor (rota pra `etiquetas-coleta`), abrir Etiquetas. Confirmar: (a) painel cobre a tela inteira, sem sidebar/topbar de desktop visível; (b) pill mostra "○ desconectado"; (c) as 3 abas (Coleta/Lotes/Impressora) funcionam e trocam de conteúdo; (d) aba Impressora mostra botão "Conectar na impressora"; (e) ao conectar com sucesso, o pill muda pra "● conectado" (verde) sem sair da aba atual; (f) botão "← Etiquetas" volta pra capa.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: navegação do app shell (3 abas, status de conexão, aba Impressora)"
```

---

### Task 4: Bipagem por câmera (reaproveitando `iniciarScanEAN`)

**Files:**
- Modify: `app.js:4559-4570` (`renderEtcPontual`)

**Interfaces:**
- Consumes: `iniciarScanEAN(inputId)` (já existe, `app.js:12065` — não modificar).

- [ ] **Step 1: Adicionar o botão de câmera e o listener de Enter**

Trocar (`app.js:4559-4570`):
```js
function renderEtcPontual() {
  var wrap = document.getElementById('etc-tab-pontual');
  wrap.innerHTML =
    '<input id="etc-input-codigo" placeholder="Bipe o código de barras" autofocus style="width:100%;padding:14px;font-size:16px;margin-bottom:12px">' +
    '<div id="etc-preview"></div>';
  var input = document.getElementById('etc-input-codigo');
  var timer = null;
  input.addEventListener('input', function() {
    clearTimeout(timer);
    timer = setTimeout(function() { buscarProdutoPontual(input.value.trim()); }, 1000);
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

- [ ] **Step 2: Verificar manualmente**

Em Android/Chrome real, abrir a aba Coleta, confirmar que o botão 📷 aparece (ZXing carregado). Tocar nele, permitir câmera, apontar pra um código de barras real — confirmar que o overlay do `iniciarScanEAN` fecha sozinho e a prévia do produto aparece na tela de Coleta (mesmo comportamento de bipar manualmente + Enter). Testar também digitar um código manualmente e apertar Enter (sem esperar o debounce de 1s) — confirmar busca imediata. Testar cancelar o scan pelo botão "✕ Cancelar" do overlay — confirmar que nada é preenchido.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: bipagem por câmera na Correção Pontual (reaproveita iniciarScanEAN)"
```

---

### Task 5: Bloqueio de impressão sem impressora conectada

**Files:**
- Modify: `app.js:4584-4590` (preview de `buscarProdutoPontual`)
- Modify: `app.js:4682-4690` (`renderFilaLote`)

**Interfaces:**
- Consumes: `_etcWriteChar`, `_etcAtualizarStatusUI` (Task 3).
- Produces: markup do botão "Imprimir tudo" em `renderFilaLote`, consumido pela Task 6 (`imprimirTudoDaFila`, ainda não existe nesta task — o botão só chama a função, que será criada na Task 6).

- [ ] **Step 1: Desabilitar o botão de imprimir na prévia da Correção Pontual**

Trocar em `buscarProdutoPontual` (`app.js:4584-4590`):
```js
  }).then(function(produto) {
    preview.innerHTML =
      '<div class="card" style="padding:16px">' +
        '<div style="font-weight:700;margin-bottom:4px">' + _escHtml(produto.nome) + '</div>' +
        '<div style="font-size:20px;color:var(--pri);font-weight:800;margin-bottom:12px">R$ ' + produto.preco.toFixed(2) + '</div>' +
        '<button class="btn btn-p" style="width:100%" onclick="confirmarImpressaoPontual(' + _escHtml(JSON.stringify(produto)) + ')">Imprimir etiqueta</button>' +
      '</div>';
  }).catch(function(e) {
```
por:
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

- [ ] **Step 2: Desabilitar os botões da fila de lote e adicionar "Imprimir tudo"**

Trocar `renderFilaLote` (`app.js:4682-4690`):
```js
function renderFilaLote() {
  var wrap = document.getElementById('etc-tab-lotes');
  if (!_loteAtualFila.length) {
    wrap.innerHTML = '<div class="empty">Fila vazia ou todos os produtos falharam ao resolver.</div><button class="btn btn-s btn-sm" onclick="renderEtcLotes()">Voltar</button>';
    return;
  }
  wrap.innerHTML = '<div style="margin-bottom:10px">Restam ' + _loteAtualFila.length + ' etiquetas.</div>' +
    '<button class="btn btn-p" style="width:100%" onclick="imprimirProximoDaFila()">Imprimir próxima</button>';
}
```
por:
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

Nota: `imprimirTudoDaFila` ainda não existe — será criada na Task 6. Até lá o botão "Imprimir tudo" fica no DOM mas sem função (a Task 6 conclui o fluxo antes de qualquer verificação manual desta parte).

- [ ] **Step 3: Verificar manualmente (parte 1 — só bloqueio)**

Sem conectar a impressora, abrir Coleta, buscar um produto real — confirmar que o botão "Imprimir etiqueta" aparece desabilitado (cinza, sem clique) e a faixa de aviso amarela aparece no topo com o link "Ir para Impressora". Repetir em Lotes com um lote pendente — confirmar que "Imprimir próxima" também aparece desabilitado. Conectar a impressora (aba Impressora) e voltar pras abas Coleta/Lotes — confirmar que os botões ficam habilitados e a faixa de aviso some.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: bloqueia impressão na UI quando a impressora não está conectada"
```

---

### Task 6: Imprimir tudo de uma vez

**Files:**
- Modify: `app.js:4653` (declaração de `_loteAtualId, _loteAtualFila`)
- Modify: `app.js:4714-4758` (`imprimirProximoDaFila`)

**Interfaces:**
- Consumes: `_avancarFilaLoteAposImpressao()`, `imprimirEtiquetaBluetooth()`, `renderFilaLote()` (todas já existem).
- Produces: `imprimirTudoDaFila()`.

- [ ] **Step 1: Adicionar as variáveis de controle do modo automático**

Trocar (`app.js:4653`):
```js
var _loteAtualId = null, _loteAtualFila = [];
```
por:
```js
var _loteAtualId = null, _loteAtualFila = [];
var _etcModoImprimirTudo = false; // true durante o loop automático de "Imprimir tudo"
var _etcFilaTotal = 0; // tamanho da fila no início do "Imprimir tudo", pro contador "X de Y"
```

- [ ] **Step 2: Adicionar `imprimirTudoDaFila` e ajustar `imprimirProximoDaFila` pra suportar o loop**

Trocar (`app.js:4714-4758`):
```js
function imprimirProximoDaFila() {
  if (!_loteAtualFila.length) return;
  if (_etcImprimindo) return;
  _etcImprimindo = true;
  var btn = document.querySelector('#etc-tab-lotes button.btn-p');
  if (btn) btn.disabled = true;
  var produto = _loteAtualFila[0];
  imprimirEtiquetaBluetooth(produto).then(function() {
    return db.collection('clientes').doc(S.clienteConfig.id).collection('etiquetas_log').add({
      codigoBarras: produto.codigoBarras,
      nomeProduto: produto.nome,
      precoImpresso: produto.preco,
      origem: 'lote',
      loteId: _loteAtualId,
      operadorId: S.currentUser ? S.currentUser.id : null,
      operadorNome: S.currentUser ? S.currentUser.nome : '-',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function() {
      // Impressão e log OK: avança a fila normalmente.
      return _avancarFilaLoteAposImpressao();
    }, function(e) {
      // A etiqueta já saiu da impressora — não reimprimir. Avança a fila mesmo
      // com o log falhando, só avisando o operador (mesmo padrão de confirmarImpressaoPontual).
      // Usa o 2º argumento de .then() (em vez de um .catch() encadeado) para que
      // este handler só reaja a falhas do próprio etiquetas_log.add() — um
      // .catch() encadeado depois do .then() acima também capturaria o marcador
      // _loggedAlready lançado por _avancarFilaLoteAposImpressao() no caminho de
      // sucesso (quando só a conclusão do lote falha), gerando um segundo toast
      // enganoso ("erro ao registrar o log: undefined") e uma segunda chamada a
      // _avancarFilaLoteAposImpressao() reprocessando a fila já vazia.
      showToast('⚠️ Etiqueta impressa, mas houve erro ao registrar o log: ' + e.message);
      return _avancarFilaLoteAposImpressao().then(function() {
        throw { _loggedAlready: true };
      });
    });
  }).catch(function(e) {
    if (e && e._loggedAlready) return;
    showToast('❌ Erro ao imprimir: ' + e.message + ' (fila mantida, tente de novo)');
  }).then(function() {
    // Roda sempre (sucesso ou erro tratado acima) — equivalente a um "finally"
    // nesta cadeia baseada em .then()/.catch() sem async/await.
    _etcImprimindo = false;
    if (btn) btn.disabled = false;
  });
}
```
por:
```js
// Imprime UM item da fila. Se _etcModoImprimirTudo estiver ativo e a
// impressão desse item for bem-sucedida, se reagenda automaticamente pro
// próximo item (com um pequeno intervalo, pra não sobrecarregar o buffer do
// K329) — é o mesmo código usado tanto pro clique manual "Imprimir próxima"
// quanto pelo loop automático de "Imprimir tudo".
function imprimirProximoDaFila() {
  if (!_loteAtualFila.length) { _etcModoImprimirTudo = false; return; }
  if (_etcImprimindo) return;
  _etcImprimindo = true;
  var btns = document.querySelectorAll('#etc-tab-lotes .btn-row .btn');
  btns.forEach(function(b){ b.disabled = true; });
  if (_etcModoImprimirTudo) {
    var progresso = document.getElementById('etc-fila-progresso');
    if (progresso) progresso.textContent = 'Imprimindo ' + (_etcFilaTotal - _loteAtualFila.length + 1) + ' de ' + _etcFilaTotal + '...';
  }
  var produto = _loteAtualFila[0];
  var erroReal = false;
  imprimirEtiquetaBluetooth(produto).then(function() {
    return db.collection('clientes').doc(S.clienteConfig.id).collection('etiquetas_log').add({
      codigoBarras: produto.codigoBarras,
      nomeProduto: produto.nome,
      precoImpresso: produto.preco,
      origem: 'lote',
      loteId: _loteAtualId,
      operadorId: S.currentUser ? S.currentUser.id : null,
      operadorNome: S.currentUser ? S.currentUser.nome : '-',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function() {
      // Impressão e log OK: avança a fila normalmente.
      return _avancarFilaLoteAposImpressao();
    }, function(e) {
      // A etiqueta já saiu da impressora — não reimprimir. Avança a fila mesmo
      // com o log falhando, só avisando o operador (mesmo padrão de confirmarImpressaoPontual).
      // Usa o 2º argumento de .then() (em vez de um .catch() encadeado) para que
      // este handler só reaja a falhas do próprio etiquetas_log.add() — um
      // .catch() encadeado depois do .then() acima também capturaria o marcador
      // _loggedAlready lançado por _avancarFilaLoteAposImpressao() no caminho de
      // sucesso (quando só a conclusão do lote falha), gerando um segundo toast
      // enganoso ("erro ao registrar o log: undefined") e uma segunda chamada a
      // _avancarFilaLoteAposImpressao() reprocessando a fila já vazia.
      showToast('⚠️ Etiqueta impressa, mas houve erro ao registrar o log: ' + e.message);
      return _avancarFilaLoteAposImpressao().then(function() {
        throw { _loggedAlready: true };
      });
    });
  }).catch(function(e) {
    if (e && e._loggedAlready) return;
    erroReal = true;
    showToast('❌ Erro ao imprimir: ' + e.message + ' (fila mantida, tente de novo)');
  }).then(function() {
    // Roda sempre (sucesso ou erro tratado acima) — equivalente a um "finally"
    // nesta cadeia baseada em .then()/.catch() sem async/await.
    _etcImprimindo = false;
    if (erroReal) {
      // Erro real de impressão: para o loop (se houver) e reabilita os
      // botões — como _avancarFilaLoteAposImpressao() não rodou, a fila
      // continua com os mesmos itens (nenhum foi consumido).
      _etcModoImprimirTudo = false;
      renderFilaLote();
      return;
    }
    if (_etcModoImprimirTudo && _loteAtualFila.length) {
      setTimeout(imprimirProximoDaFila, 300);
    } else {
      _etcModoImprimirTudo = false;
    }
  });
}

// Dispara a impressão de toda a fila do lote, um item por vez, com um
// pequeno intervalo entre eles. Reaproveita imprimirProximoDaFila (só liga
// o modo automático antes de disparar o primeiro item).
function imprimirTudoDaFila() {
  if (!_loteAtualFila.length || _etcImprimindo) return;
  _etcModoImprimirTudo = true;
  _etcFilaTotal = _loteAtualFila.length;
  imprimirProximoDaFila();
}
```

- [ ] **Step 3: Verificar manualmente**

Com um lote de 3+ itens e a impressora conectada, abrir a fila e clicar "Imprimir tudo". Confirmar: (a) os dois botões ficam desabilitados durante a impressão; (b) o contador mostra "Imprimindo 1 de 3...", "2 de 3...", etc.; (c) cada etiqueta sai da impressora com ~300ms de intervalo; (d) ao terminar, o lote muda pra "Concluído" (aba retaguarda) e todas as entradas aparecem em `etiquetas_log` com `origem:'lote'`. Repetir desligando o Bluetooth da impressora no meio da fila — confirmar que o loop para no item que falhou, a fila mantém os itens restantes (incluindo o que falhou), o toast de erro aparece, e os botões voltam a ficar clicáveis pra tentar de novo (manual ou "Imprimir tudo" de novo).

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: imprimir toda a fila do lote de uma vez, com progresso e parada no erro"
```

---

### Task 7: Bump de BUILD

**Files:**
- Modify: `app.js:2`, `sw.js:3`, `sw.js:11-12`, `index.html:20,1979`, `version.json`

- [ ] **Step 1: Bump de BUILD nos 6 lugares**

```js
// app.js linha 2
var BUILD = '308';
```
```js
// sw.js linha 3
var CACHE_NAME = 'cahu360-v308';
```
```js
// sw.js linhas 11-12
'./app.js?v=308',
'./style.css?v=308',
```
```html
<!-- index.html linha 20 -->
<link rel="stylesheet" href="style.css?v=308"/>
<!-- index.html linha 1979 -->
<script src="app.js?v=308" defer></script>
```
```json
{"build":"308"}
```

- [ ] **Step 2: Verificação final de ponta a ponta**

Logar como operador (não-admin/supervisor), abrir Etiquetas. Confirmar: app shell cobre a tela inteira; conectar impressora pela aba Impressora; bipar por câmera na aba Coleta e imprimir uma etiqueta pontual; criar um lote na retaguarda (desktop, como admin) e imprimir tudo de uma vez pela aba Lotes no mobile; conferir as 3 impressões (1 pontual + N do lote) em Histórico na retaguarda.

- [ ] **Step 3: Commit**

```bash
git add app.js sw.js index.html version.json
git commit -m "chore: bump de BUILD pro módulo Etiquetas v2"
```

---

## Self-review notes

- Cobertura da spec: Parte 1 (câmera) → Task 4; Parte 2 (imprimir tudo) → Task 6 (+ markup do botão na Task 5); Parte 3 (app shell) → Tasks 1-3 + bloqueio de impressão (Task 5); Erros e casos de borda → tratados inline em cada task (ZXing/permissão já cobertos por `iniciarScanEAN` reaproveitado, erro real de impressão vs. log em Task 6, bloqueio de UI em Task 5); Testes → passo de verificação manual em cada task + verificação de ponta a ponta na Task 7.
- Decisão técnica corrigida durante o planejamento (registrada na spec e nas Global Constraints): trocado `BarcodeDetector` nativo por reaproveitamento de `iniciarScanEAN`/ZXing, depois de achar que o próprio projeto já tinha tentado e abandonado `BarcodeDetector` por não funcionar no coletor físico real.
- Escopo explicitamente fora deste plano (decisão do Tiago durante o brainstorm): "imprimir avulso" (já coberto pela Correção Pontual existente), redesign de chrome em Inventário Coleta/Checklist, e formatos de etiqueta do Emissor legado — nenhum destes tem task aqui.