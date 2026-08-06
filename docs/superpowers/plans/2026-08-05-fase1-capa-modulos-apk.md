# Fase 1 — Capa de Módulos (app) + Play Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the FC360 mobile app a real "app home screen" (grid of modules like the Shelf reference), publish it on the Play Store as a TWA with tenant-by-login, and put the not-yet-built modules in front of every admin as a visible roadmap/upsell.

**Architecture:** Single legacy vanilla-JS SPA (`app.js`, ~13.3k lines, string-concatenated HTML — no framework, no bundler). All new UI is a new `panel-capa` following the exact same conventions already in the file: a `.panel` div toggled by the existing `nav(page, el)` router, HTML built via string concatenation, styling via new rules appended to `style.css`. No new dependencies, no build step changes.

**Tech Stack:** Vanilla JS (ES5-style, matches existing code), Firebase Firestore/Auth (existing `db`, `firebase.auth()`), plain CSS. No test runner exists in this repo (`package.json` has no Jest/Mocha/Playwright) — verification is manual, in-browser, following the app's existing QA style.

## Global Constraints

- Follow existing code style exactly: `var` not `let/const`, string-concatenated HTML (no template literals used elsewhere in the file), `function name(){}` declarations, inline `onclick="..."` handlers — matching the surrounding code, not introducing a new pattern.
- No test framework exists. Every "verify" step is a manual action in the browser (DevTools console command or a click sequence) with an exact expected result — this replaces automated test run steps in this plan.
- Never create a new global Firestore collection or write outside the existing `clientes/{clienteId}` config document — this phase reads config only, per [[project_fc360-capa-apk-roadmap]] rule "nenhuma coleção nova fora do padrão".
- BUILD bump discipline: any task that ships must bump the 4 places (`app.js` `var BUILD`, `sw.js` `CACHE_NAME`, `index.html` `app.js?v=`, `version.json`) — done once, in Task 8, after all feature tasks land (bumping earlier would be wasted churn across every task).
- Deploy rule: only push to `origin` (Fluxo/dev remote). Never push to `economico` or `bardocachorro` remotes without an explicit request from Tiago — this plan does not include any deploy/push step.
- Desktop behavior must not change in this phase — every new landing-page/routing change is gated behind `window.innerWidth <= 768`.

---

### Task 1: Registro de módulos da capa (`CAPA_MODULOS`) + resolução de estado

**Files:**
- Modify: `app.js` — insert new code block right after `_moduloAtivo()` (currently `app.js:950-955`)

**Interfaces:**
- Produces: `CAPA_MODULOS` (array of module descriptors), `_capaEstado(mod)` → returns one of `'vivo' | 'em_breve' | 'cadeado' | 'oculto'`. Task 3's `renderCapa()` consumes both by name.
- Consumes: existing `_moduloAtivo(nome)` (`app.js:950`), existing `S` state object (`S.role`, `S.invsCache`).

- [ ] **Step 1: Add the module registry and state resolver**

Insert immediately after the closing `}` of `_moduloAtivo()` at `app.js:955`:

```js
// ── Capa de módulos (tela inicial mobile) ────────────────────────────────
// Cada item descreve um card da capa. "desenvolvido:false" = módulo ainda
// não existe (aparece sempre em breve). Para os desenvolvidos, roleOk()
// espelha a metade "papel" das condições já usadas em setupRole() (não
// reusamos a visibilidade dos nav-* porque lá papel+contrato ficam
// misturados num show() só — aqui precisamos separar os dois para poder
// distinguir "oculto" de "cadeado").
var CAPA_MODULOS = [
  { id:'checklist', label:'Checklist', desenvolvido:true, moduloChave:'checklist',
    roleOk: function(){ return S.role !== 'coletor'; },
    page: function(){ return 'checklist'; },
    icone:'<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>' },
  { id:'inventario', label:'Inventário', desenvolvido:true, moduloChave:'inventario',
    roleOk: function(){
      if (S.role === 'admin') return true;
      if (S.role === 'coletor') return (S.invsCache||[]).some(function(i){ return i.status==='aberto'; });
      return false;
    },
    page: function(){ return S.role === 'admin' ? 'inv' : 'inv-coleta'; },
    icone:'<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>' },
  { id:'plano', label:'Planos de Ação', desenvolvido:true, moduloChave:'planos_acao',
    roleOk: function(){ return S.role==='admin' || S.role==='supervisor' || S.role==='gerencia'; },
    page: function(){ return 'plano'; },
    icone:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>' },
  { id:'promotores', label:'Promotores', desenvolvido:false,
    icone:'<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>' },
  { id:'pesquisa', label:'Pesquisa Concorrentes', desenvolvido:false,
    icone:'<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' },
  { id:'recebimento', label:'Recebimento', desenvolvido:false,
    icone:'<rect x="1" y="7" width="15" height="13" rx="2"/><path d="M16 11h3l3 4v5h-6"/><circle cx="6" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/>' },
  { id:'validade', label:'Validade', desenvolvido:false,
    icone:'<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },
  { id:'etiquetas', label:'Etiquetas e Ofertas', desenvolvido:false,
    icone:'<path d="M20.59 13.41L11 3.83V3h.01L20.59 12.59a2 2 0 010 2.82z"/><path d="M11 3H4a1 1 0 00-1 1v7l9.59 9.59a2 2 0 002.82 0l6.18-6.18a2 2 0 000-2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/>' }
];

// Estado de um card da capa, nesta ordem de prioridade:
// 1. não desenvolvido → sempre "em_breve" (nunca oculta, é vitrine)
// 2. papel sem acesso → "oculto" (nem aparece)
// 3. desenvolvido + papel ok, mas módulo desligado no plano do cliente → "cadeado"
// 4. caso contrário → "vivo"
function _capaEstado(mod) {
  if (!mod.desenvolvido) return 'em_breve';
  if (!mod.roleOk()) return 'oculto';
  if (!_moduloAtivo(mod.moduloChave)) return 'cadeado';
  return 'vivo';
}
```

- [ ] **Step 2: Manual verification in browser console**

Open the app (already logged in as an admin user), open DevTools console, run:

```js
CAPA_MODULOS.map(function(m){ return m.id + ': ' + _capaEstado(m); }).join('\n')
```

Expected: a line per module, `checklist: vivo`, `inventario: vivo`, `plano: vivo` (for an admin whose client has all 3 contracted), and the 5 undeveloped ones all `em_breve`. No JS error thrown.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add capa module registry and state resolver"
```

---

### Task 2: HTML + CSS scaffold da capa

**Files:**
- Modify: `index.html:167-168` — insert new panel before the `<!-- DASHBOARD -->` panel
- Modify: `style.css` — append new rule block at end of file

**Interfaces:**
- Produces: DOM element `#capa-grid` inside `#panel-capa.panel`, CSS classes `.capa-grid`, `.capa-card`, `.capa-card-icon`, `.capa-card-label`, `.capa-card-inativo`, `.capa-pill`, `.capa-pill-cadeado`, `.capa-card-saida`. Task 3's `renderCapa()` consumes `#capa-grid` and these class names.
- Consumes: existing `.panel`/`.panel.active` toggle mechanics (`style.css:69`), existing CSS custom properties (`--w`, `--gray2`, `--sh`, `--r14`, `--t`, `--t2`, `--t3`).

- [ ] **Step 1: Insert the panel markup**

In `index.html`, right before line 168 (`<!-- DASHBOARD -->`), insert:

```html
      <!-- CAPA DE MÓDULOS (tela inicial mobile) -->
      <div id="panel-capa" class="panel">
        <div id="capa-grid" class="capa-grid"></div>
      </div>

```

- [ ] **Step 2: Append CSS**

At the end of `style.css` (after the last rule, the `.tend-btn-active` block), append:

```css

/* CAPA DE MÓDULOS (tela inicial mobile) */
.capa-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-width:520px;margin:0 auto}
.capa-card{position:relative;background:var(--w);border:1px solid rgba(0,0,0,.06);border-radius:var(--r14);box-shadow:var(--sh);padding:16px 8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;cursor:pointer;text-align:center;transition:transform .12s}
.capa-card:active{transform:scale(.96)}
.capa-card-icon{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#FFC600,#e6b200);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.capa-card-icon svg{width:20px;height:20px;color:#111}
.capa-card-label{font-size:11.5px;font-weight:600;line-height:1.25;color:var(--t)}
.capa-card-inativo{opacity:.55}
.capa-card-inativo .capa-card-icon{background:var(--gray2)}
.capa-card-inativo .capa-card-icon svg{color:var(--t3)}
.capa-pill{position:absolute;top:6px;right:6px;font-size:8.5px;font-weight:700;background:var(--gray2);color:var(--t2);padding:2px 6px;border-radius:20px;letter-spacing:.3px}
.capa-pill-cadeado{background:#fef3cd;color:#856404;font-size:11px;padding:2px 5px}
.capa-card-saida .capa-card-icon{background:linear-gradient(135deg,#f87171,#b91c1c)}
.capa-card-saida .capa-card-icon svg{color:#fff}

@media (max-width: 380px) {
  .capa-grid{grid-template-columns:repeat(2,1fr)}
}
```

- [ ] **Step 3: Manual verification**

Open the app in browser DevTools with a mobile viewport (Ctrl+Shift+M, e.g. 390×844), log in, run in console:

```js
document.getElementById('panel-capa').classList.add('active'); document.getElementById('panel-capa').style.display='block';
```

Expected: an empty area appears in the content zone (grid has no cards yet — that's Task 3), no layout break, no console error. Then run `document.getElementById('panel-capa').classList.remove('active')` to restore normal state.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "feat: add capa panel HTML scaffold and CSS"
```

---

### Task 3: `renderCapa()` + ações dos cards (cadeado / em breve / saída)

**Files:**
- Modify: `app.js` — insert new functions right after the `_capaEstado()` function added in Task 1

**Interfaces:**
- Consumes: `CAPA_MODULOS`, `_capaEstado()` (Task 1), `showToast()` (`app.js:8375`), `doLogout()` (`app.js:1461`), existing `.modal-bg`/`.modal-box`/`.btn`/`.btn-p`/`.btn-s` CSS classes (`style.css:130-145`).
- Produces: `renderCapa()`, `abrirModalUpgrade(nomeModulo)`, `_avisoEmBreve(nomeModulo)` — all three referenced by name in Task 4's `nav()` wiring.

- [ ] **Step 1: Add the three functions**

Insert after `_capaEstado()`:

```js
function _avisoEmBreve(nomeModulo) {
  showToast('🚧 ' + nomeModulo + ' está em desenvolvimento. Em breve na sua loja!');
}

function abrirModalUpgrade(nomeModulo) {
  var existing = document.getElementById('modal-upgrade-modulo');
  if (existing) existing.remove();
  var html =
    '<div id="modal-upgrade-modulo" class="modal-bg" style="display:flex" onclick="if(event.target===this)this.remove()">'+
      '<div class="modal-box" style="width:340px;text-align:center">'+
        '<div style="font-size:40px;margin-bottom:10px">🔒</div>'+
        '<div class="modal-title" style="margin-bottom:8px">'+nomeModulo+'</div>'+
        '<div style="font-size:13px;color:var(--t2);margin-bottom:20px;line-height:1.5">Este módulo não está incluído no seu plano atual. Fale com a Fluxo Certo para ativar.</div>'+
        '<a href="mailto:suporte@fluxocerto.com.br?subject=Quero%20ativar%20'+encodeURIComponent(nomeModulo)+'" class="btn btn-p" style="display:block;text-decoration:none;margin-bottom:8px">Falar com a Fluxo</a>'+
        '<button class="btn btn-s" style="width:100%" onclick="document.getElementById(\'modal-upgrade-modulo\').remove()">Fechar</button>'+
      '</div>'+
    '</div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

function renderCapa() {
  var grid = document.getElementById('capa-grid');
  if (!grid) return;
  var html = CAPA_MODULOS.map(function(mod) {
    var estado = _capaEstado(mod);
    if (estado === 'oculto') return '';
    var cls = 'capa-card' + (estado==='vivo' ? '' : ' capa-card-inativo');
    var pill = estado==='em_breve' ? '<span class="capa-pill">Em breve</span>'
             : estado==='cadeado' ? '<span class="capa-pill capa-pill-cadeado">🔒</span>' : '';
    var labelEsc = mod.label.replace(/'/g, "\\'");
    var onclick = estado==='vivo' ? "nav('"+mod.page()+"',this)"
                : estado==='cadeado' ? "abrirModalUpgrade('"+labelEsc+"')"
                : "_avisoEmBreve('"+labelEsc+"')";
    return '<div class="'+cls+'" onclick="'+onclick+'">'
      + '<div class="capa-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">'+mod.icone+'</svg></div>'
      + '<div class="capa-card-label">'+mod.label+'</div>'
      + pill
      + '</div>';
  }).join('');
  html += '<div class="capa-card capa-card-saida" onclick="if(confirm(\'Deseja realmente sair?\'))doLogout()">'
    + '<div class="capa-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></div>'
    + '<div class="capa-card-label">Saída</div>'
    + '</div>';
  grid.innerHTML = html;
}
```

- [ ] **Step 2: Manual verification**

In the browser console (still logged in as admin):

```js
renderCapa();
document.getElementById('panel-capa').classList.add('active');
document.querySelectorAll('.panel').forEach(function(p){ if(p.id!=='panel-capa') p.classList.remove('active'); });
```

Expected: grid shows 3 full-color cards (Checklist, Inventário, Planos de Ação) + 5 dimmed cards each with an "Em breve" pill + a red "Saída" card, 9 cards total. Click "Checklist" → navigates to the Checklist screen (existing `nav()` still works, capa disappears). Click a dimmed card → yellow toast "🚧 ... em desenvolvimento" appears at the bottom. Click "Saída" → confirm dialog appears; cancel it to stay logged in for the rest of testing.

To test the cadeado state without a real disabled client, temporarily run `S.clienteConfig.modulos = {planos_acao:false}; renderCapa();` — the Planos de Ação card should turn dim with a 🔒 pill; clicking it opens the upgrade modal with a working "Falar com a Fluxo" mailto link. Reload the page afterward to discard this temporary override.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: render capa cards with vivo/em-breve/cadeado states and click actions"
```

---

### Task 4: Roteamento — capa como tela inicial mobile + item "Início" na sidebar

**Files:**
- Modify: `app.js:1614-1631` (`nav()` function) — add capa render trigger
- Modify: `app.js:1358-1383` (routing decision inside `iniciarApp()`, nested inside `finalizarLogin()`) — mobile lands on capa
- Modify: `index.html:70` — add `nav-capa` sidebar item before the `FC360 Checklist` section header
- Modify: `app.js:1514-1519` (superadmin hide-list inside `setupRole()`) — hide `nav-capa` for superadmin
- Modify: `app.js:1543` (`setupRole()`, right after `show('nav-inv-coleta', false);`) — show `nav-capa` for everyone else
- Modify: `style.css` — hide `#nav-capa` on desktop by default, show on mobile

**Interfaces:**
- Consumes: `renderCapa()` (Task 3), existing `nav(page, el)`, existing `show(id, v)` helper (`app.js:1593`).

- [ ] **Step 1: Wire `renderCapa()` into `nav()`**

In `app.js`, inside `nav(page, el)`, find this existing block (around line 1632):

```js
  document.getElementById('pageTitle').textContent = PAGE_TITLES[page]||page;
  if (page==='relatorios') {
```

Change to (add the `capa` branch right before the existing `relatorios` branch):

```js
  document.getElementById('pageTitle').textContent = PAGE_TITLES[page]||page;
  if (page==='capa') {
    renderCapa();
  }
  if (page==='relatorios') {
```

- [ ] **Step 2: Mobile lands on capa**

In `app.js`, inside the nested `iniciarApp()` function (inside `finalizarLogin()`), find (around line 1358-1360):

```js
    var lastPage = sessionStorage.getItem('eco_last_page') || localStorage.getItem('eco_last_page');
    // Super Admin: vai direto para painel de clientes
    if (S.role === 'superadmin') {
      nav('clientes', document.getElementById('nav-clientes'));
      renderPainelClientes();
      return;
    }
```

Insert a new mobile check right after that superadmin block, before the `var pagesForRole = {...}` line:

```js
    var lastPage = sessionStorage.getItem('eco_last_page') || localStorage.getItem('eco_last_page');
    // Super Admin: vai direto para painel de clientes
    if (S.role === 'superadmin') {
      nav('clientes', document.getElementById('nav-clientes'));
      renderPainelClientes();
      return;
    }
    // Mobile: a capa de módulos é sempre a tela inicial (não retoma lastPage) —
    // navegar entre módulos usa nav() normalmente; "Início" na sidebar volta pra cá.
    if (window.innerWidth <= 768) {
      nav('capa', document.getElementById('nav-capa'));
      return;
    }
```

- [ ] **Step 3: Add sidebar "Início" item**

In `index.html`, right before line 70 (`<div class="sb-sec" id="nav-sec-checklist">FC360 Checklist</div>`), insert:

```html
      <div class="sb-item" id="nav-capa" onclick="nav('capa',this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>Início
      </div>
```

- [ ] **Step 4: Hide for superadmin, show for everyone else**

In `app.js`, inside `setupRole()`, find the superadmin hide-list (around line 1514-1517):

```js
    ['sb-adm-sec','tab-gerenciar','nav-dashboard','nav-central','nav-relat',
     'nav-assistente','nav-monitor','nav-token','btn-zerar-dados','nav-users','nav-alertas',
     'nav-plano','nav-checklist','nav-sec-checklist','sb-inv-sec','nav-inv-gestao','nav-inv-coleta'
    ].forEach(function(id){ show(id, false); });
```

Add `'nav-capa'` to that array:

```js
    ['sb-adm-sec','tab-gerenciar','nav-dashboard','nav-central','nav-relat',
     'nav-assistente','nav-monitor','nav-token','btn-zerar-dados','nav-users','nav-alertas',
     'nav-plano','nav-checklist','nav-sec-checklist','sb-inv-sec','nav-inv-gestao','nav-inv-coleta','nav-capa'
    ].forEach(function(id){ show(id, false); });
```

Then, still in `setupRole()`, find line 1543 (`show('nav-inv-coleta', false);`) and add right after it:

```js
  show('nav-inv-coleta', false);
  show('nav-capa', true);
```

- [ ] **Step 5: CSS — desktop hides "Início", mobile shows it**

In `style.css`, add near the sidebar rules (after `.sb-item-sub` at line 48):

```css
#nav-capa{display:none}
```

Inside the existing `@media (max-width: 768px) { ... }` block (`style.css:153-263`), add near the other mobile sidebar overrides (right after the `.sb.open{left:0;}` rule):

```css
  #nav-capa { display: flex; }
```

- [ ] **Step 6: Manual verification**

Resize DevTools to mobile width, log out and log back in as a non-superadmin user. Expected: app lands directly on the capa grid (not dashboard), page title reads "Início" or whatever `PAGE_TITLES['capa']` falls back to (fine if it shows the raw id `capa` — cosmetic, not required for this phase). Open the hamburger menu → "Início" item is visible and, when clicked from inside a module, returns to the capa grid. Resize to desktop width and reload: app lands on dashboard as before (unchanged behavior), and "Início" is not visible in the (now static) sidebar.

- [ ] **Step 7: Commit**

```bash
git add app.js index.html style.css
git commit -m "feat: route mobile login to capa home screen, add Início sidebar item"
```

---

### Task 5: Sininho de notificações (pendências de Planos de Ação)

**Files:**
- Modify: `index.html:129` (topbar, right before `topbar-user-wrap`) — bell button markup
- Modify: `app.js` — insert new functions after `_prazoInfo()` (`app.js:7137-7154`)
- Modify: `app.js:1614` (`nav()`) — refresh badge on every navigation
- Modify: `app.js:1479` (`setupRole()`) — refresh badge after role/config changes

**Interfaces:**
- Consumes: `getPlanos()` (`app.js:6734`), `_prazoInfo(p)` (`app.js:7137`), `_moduloAtivo()` (`app.js:950`), `S.currentUser`, `S.role`.
- Produces: `_contarPendenciasNotificacao()` → `{total, vencidos, urgentes}`; `_atualizarBadgeNotificacoes()`; `abrirPainelNotificacoes()`. Referenced by the new `#capa-bell` button's `onclick`.

- [ ] **Step 1: Add the bell button to the topbar**

In `index.html`, right before line 129 (`<div style="position:relative" id="topbar-user-wrap">`), insert:

```html
        <button id="capa-bell" onclick="abrirPainelNotificacoes()" style="display:none;position:relative;background:none;border:none;cursor:pointer;padding:6px;font-size:18px;line-height:1;margin-right:2px" title="Pendências">
          🔔<span id="capa-bell-badge" style="display:none;position:absolute;top:0;right:0;background:#e67e22;color:#fff;border-radius:50%;min-width:16px;height:16px;font-size:9px;font-weight:700;align-items:center;justify-content:center;line-height:1;padding:0 3px">0</span>
        </button>
```

- [ ] **Step 2: Add the counting, badge-refresh and panel functions**

In `app.js`, insert after `_prazoInfo()` (line 7154):

```js
// ── Sininho de notificações (capa) ────────────────────────────────────────
// Mesmo filtro de "precisa de atenção" já usado em renderAlertaPlanos()
// (app.js ~7178) — mantido separado dela de propósito porque aquela função
// escreve direto num banner de DOM específico da tela de Planos de Ação;
// aqui precisamos só da contagem, chamável de qualquer tela.
function _contarPendenciasNotificacao() {
  if (!_moduloAtivo('planos_acao')) return { total:0, vencidos:[], urgentes:[] };
  var uLoja = S.currentUser ? (S.currentUser.loja||'').toLowerCase() : '';
  var agora = Date.now();
  var planos = getPlanos().filter(function(p) {
    if (p.status === 'resolvido') return false;
    if (uLoja && (p.loja||'').toLowerCase() !== uLoja) return false;
    return true;
  });
  var vencidos = planos.filter(function(p){ return p.prazoFim && new Date(p.prazoFim).getTime() < agora; });
  var urgentes = planos.filter(function(p){
    if (!p.prazoFim) return false;
    var fim = new Date(p.prazoFim).getTime();
    return fim > agora && fim < agora + 24*3600000;
  });
  return { total: vencidos.length + urgentes.length, vencidos: vencidos, urgentes: urgentes };
}

function _atualizarBadgeNotificacoes() {
  var btn = document.getElementById('capa-bell');
  var badge = document.getElementById('capa-bell-badge');
  if (!btn || !badge) return;
  var podeVer = S.role==='admin' || S.role==='gerencia' || S.role==='supervisor';
  if (!podeVer || !_moduloAtivo('planos_acao')) { btn.style.display = 'none'; return; }
  btn.style.display = 'flex';
  var info = _contarPendenciasNotificacao();
  if (info.total > 0) {
    badge.textContent = info.total > 9 ? '9+' : String(info.total);
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function abrirPainelNotificacoes() {
  var info = _contarPendenciasNotificacao();
  var itens = info.vencidos.concat(info.urgentes);
  var listaHtml = itens.length
    ? itens.map(function(p) {
        var inf = _prazoInfo(p);
        return '<div style="padding:10px 12px;border-bottom:1px solid var(--gray2);font-size:13px">'
          + '<strong>'+p.desc+'</strong><br>'
          + '<span style="color:'+(inf?inf.cor:'var(--t2)')+';font-size:12px">'+(inf?inf.texto:'')+'</span>'
          + '</div>';
      }).join('')
    : '<div style="padding:20px;text-align:center;color:var(--t3);font-size:13px">Nenhuma pendência no momento 🎉</div>';
  var existing = document.getElementById('modal-notificacoes');
  if (existing) existing.remove();
  var html =
    '<div id="modal-notificacoes" class="modal-bg" style="display:flex" onclick="if(event.target===this)this.remove()">'+
      '<div class="modal-box" style="width:360px;max-height:70vh;padding:0;overflow:hidden;display:flex;flex-direction:column">'+
        '<div style="padding:18px 20px 12px;border-bottom:1px solid var(--gray2)"><div class="modal-title" style="margin:0">🔔 Pendências</div></div>'+
        '<div style="overflow-y:auto">'+listaHtml+'</div>'+
        '<div style="padding:12px 20px"><button class="btn btn-s" style="width:100%" onclick="document.getElementById(\'modal-notificacoes\').remove()">Fechar</button></div>'+
      '</div>'+
    '</div>';
  document.body.insertAdjacentHTML('beforeend', html);
}
```

- [ ] **Step 3: Call the badge refresh from `nav()` and `setupRole()`**

In `app.js`, inside `nav(page, el)`, add the call as the very first line of the function body (before the existing `sessionStorage.setItem('eco_last_page', page);` at line 1615):

```js
function nav(page, el) {
  _atualizarBadgeNotificacoes();
  sessionStorage.setItem('eco_last_page', page);
```

In `app.js`, inside `setupRole()`, add the call as the last line of the function (after the closing of the `if (isAdmOrGer || isSup) {...}` block, i.e. right before the function's final `}` at line 1548):

```js
  if (isAdmOrGer || isSup) {
    pedirPermissaoNotificacao();
    setTimeout(iniciarVerificacaoPeriodica, 3000);
  }
  _atualizarBadgeNotificacoes();
}
```

- [ ] **Step 4: Manual verification**

Log in as admin on a client with `planos_acao` active and at least one overdue plan (or create one via the existing Plano de Ação screen with a past `prazoFim`). Expected: 🔔 appears in the topbar with an orange badge showing the count. Click it → modal lists the overdue/urgent plans with their existing color-coded time text (reusing `_prazoInfo`). Log in as `operator` → bell is not shown (role gate). Temporarily set `S.clienteConfig.modulos = {planos_acao:false}; _atualizarBadgeNotificacoes();` in console → bell disappears; reload to discard the override.

- [ ] **Step 5: Commit**

```bash
git add app.js index.html
git commit -m "feat: add notification bell for overdue/urgent action plans"
```

---

### Task 6: Sidebar da retaguarda — seção "Em Breve"

**Files:**
- Modify: `index.html` — insert 6 new elements (1 section header + 5 items) after line 92 (end of the existing, already-hidden "Módulos futuros" placeholder block), before line 94 (`<div class="sb-sec" id="sb-inv-sec"...`)
- Modify: `app.js` (`setupRole()`) — visibility wiring
- Modify: `style.css` — dimmed sidebar item style

**Note (informational, not a task):** `index.html:90-92` already has one orphaned hidden nav item for "Lançar Perdas" left over from before the module was discontinued (Tiago: "perdas não tenho mais"), and `app.js` still has a live `atualizarNavColeta()` defined twice (`app.js:9155` and `app.js:12302` — the second definition silently wins in JS and is the one actually running). Neither is touched by this plan — flagging them here so nobody "fixes" the wrong one later.

**Interfaces:**
- Consumes: existing `show(id, v)` helper, existing `_avisoEmBreve()` (Task 3).

- [ ] **Step 1: Insert the sidebar items**

In `index.html`, right after line 92 (the closing `</div>` of the existing hidden "Lançar Perdas" item) and before line 94, insert:

```html

      <!-- Módulos em breve (vitrine/upsell para quem decide compra) -->
      <div class="sb-sec" id="sb-embreve-sec" style="display:none">Em Breve</div>
      <div class="sb-item sb-item-embreve" id="nav-embreve-promotores" style="display:none" onclick="_avisoEmBreve('Promotores')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>Promotores<span class="sb-item-embreve-pill">EM BREVE</span>
      </div>
      <div class="sb-item sb-item-embreve" id="nav-embreve-pesquisa" style="display:none" onclick="_avisoEmBreve('Pesquisa Concorrentes')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Pesquisa Concorrentes<span class="sb-item-embreve-pill">EM BREVE</span>
      </div>
      <div class="sb-item sb-item-embreve" id="nav-embreve-recebimento" style="display:none" onclick="_avisoEmBreve('Recebimento')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="1" y="7" width="15" height="13" rx="2"/><path d="M16 11h3l3 4v5h-6"/><circle cx="6" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/></svg>Recebimento<span class="sb-item-embreve-pill">EM BREVE</span>
      </div>
      <div class="sb-item sb-item-embreve" id="nav-embreve-validade" style="display:none" onclick="_avisoEmBreve('Validade')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Validade<span class="sb-item-embreve-pill">EM BREVE</span>
      </div>
      <div class="sb-item sb-item-embreve" id="nav-embreve-etiquetas" style="display:none" onclick="_avisoEmBreve('Etiquetas e Ofertas')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M20.59 13.41L11 3.83V3h.01L20.59 12.59a2 2 0 010 2.82z"/><path d="M11 3H4a1 1 0 00-1 1v7l9.59 9.59a2 2 0 002.82 0l6.18-6.18a2 2 0 000-2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>Etiquetas e Ofertas<span class="sb-item-embreve-pill">EM BREVE</span>
      </div>
```

- [ ] **Step 2: CSS for the dimmed style**

In `style.css`, add right after the `.sb-item-sub` rules (line 48):

```css
.sb-item-embreve{opacity:.5}
.sb-item-embreve:hover{opacity:.75}
.sb-item-embreve-pill{margin-left:auto;font-size:8px;font-weight:700;background:rgba(0,0,0,.12);color:rgba(0,0,0,.55);padding:2px 6px;border-radius:20px;letter-spacing:.3px;flex-shrink:0}
```

- [ ] **Step 3: Visibility wiring in `setupRole()`**

In `app.js`, inside `setupRole()`, right after the `show('nav-capa', true);` line added in Task 4 Step 4, add:

```js
  var mostrarEmBreve = isAdmin || r==='gerencia' || isSup;
  show('sb-embreve-sec', mostrarEmBreve);
  show('nav-embreve-promotores', mostrarEmBreve);
  show('nav-embreve-pesquisa', mostrarEmBreve);
  show('nav-embreve-recebimento', mostrarEmBreve);
  show('nav-embreve-validade', mostrarEmBreve);
  show('nav-embreve-etiquetas', mostrarEmBreve);
```

(`isAdmin`, `r` and `isSup` are already local variables in `setupRole()` at this point — no new declarations needed.)

- [ ] **Step 4: Manual verification**

Log in as `admin` on desktop width: sidebar now shows an "Em Breve" section with 5 dimmed items below "Relatórios". Click one → yellow toast "🚧 ... em desenvolvimento" (same as the capa card). Log in as `operator`: section is not visible. Log in as `admin` on mobile width, open the hamburger drawer: same section appears there too (it's the same sidebar DOM, just repositioned by the existing mobile CSS).

- [ ] **Step 5: Commit**

```bash
git add app.js index.html style.css
git commit -m "feat: add Em Breve section to retaguarda sidebar as upsell showcase"
```

---

### Task 7: Modo de entrada universal (tenant por login)

**Files:**
- Create: `client.universal.js` (repo root — reference file for the future `fc360-app` universal deploy, not wired into this deploy's `index.html`)
- Modify: `app.js:957-969` (`carregarClienteConfig()`)
- Modify: `app.js:1206-1227` (`finalizarLogin()` tenant guard)

**Interfaces:**
- Consumes: `window.FC360_CLIENT_ID` (set by whichever `client.js`-style file the deploy loads).
- Produces: deploys with `FC360_CLIENT_ID === 'universal'` resolve tenant from `found.clienteId` at login time instead of blocking on mismatch.

- [ ] **Step 1: Create the reference client file for the future universal deploy**

Create `client.universal.js`:

```js
window.FC360_CLIENT_ID = 'universal';
```

- [ ] **Step 2: Treat `'universal'` as "no fixed tenant" in `carregarClienteConfig()`**

In `app.js`, replace (lines 958-961):

```js
function carregarClienteConfig(cb) {
  // client.js do deploy tem prioridade; fallback para clienteId do usuário
  var clienteId = (window.FC360_CLIENT_ID && window.FC360_CLIENT_ID.trim())
    || (S.currentUser && S.currentUser.clienteId)
    || '';
```

With:

```js
function carregarClienteConfig(cb) {
  // client.js do deploy tem prioridade; fallback para clienteId do usuário.
  // No deploy universal (FC360_CLIENT_ID === 'universal', usado pelo app único
  // da Play Store) não há tenant fixo — o clienteId vem sempre do usuário logado.
  var deployId = (window.FC360_CLIENT_ID && window.FC360_CLIENT_ID.trim()) || '';
  var clienteId = (deployId && deployId !== 'universal' ? deployId : '')
    || (S.currentUser && S.currentUser.clienteId)
    || '';
```

- [ ] **Step 3: Skip the tenant-mismatch block on the universal deploy**

In `app.js`, inside `finalizarLogin()`, replace (lines 1210-1227):

```js
  var deployClient = (window.FC360_CLIENT_ID || '').trim();
  var userClient = found.clienteId || '';
  // Superadmin não pertence a nenhum cliente — o roteamento dele já é 100% por
  // role (vai direto pro painel de clientes, ver S.role==='superadmin' abaixo),
  // então fica isento da checagem de deploy pra poder gerenciar clientes de qualquer URL.
  // Sessão de impersonação (entrarComoCliente) também é isenta: é o superadmin
  // operando de propósito como outro cliente, não um vazamento entre contas.
  if (found.perfil !== 'superadmin' && !found._impersonadoPorSuperadmin && userClient !== deployClient) {
```

With:

```js
  var deployClient = (window.FC360_CLIENT_ID || '').trim();
  var userClient = found.clienteId || '';
  // Deploy universal (app único da Play Store, FC360_CLIENT_ID='universal'):
  // não existe tenant fixo pra comparar — é o login que DEFINE o tenant da
  // sessão (carregarClienteConfig() já trata 'universal' como ausente e usa
  // userClient). Nos deploys por cliente (client.js normal) a checagem abaixo
  // continua bloqueando login cruzado, sem mudança de comportamento.
  var isDeployUniversal = deployClient === 'universal';
  // Superadmin não pertence a nenhum cliente — o roteamento dele já é 100% por
  // role (vai direto pro painel de clientes, ver S.role==='superadmin' abaixo),
  // então fica isento da checagem de deploy pra poder gerenciar clientes de qualquer URL.
  // Sessão de impersonação (entrarComoCliente) também é isenta: é o superadmin
  // operando de propósito como outro cliente, não um vazamento entre contas.
  if (!isDeployUniversal && found.perfil !== 'superadmin' && !found._impersonadoPorSuperadmin && userClient !== deployClient) {
```

- [ ] **Step 4: Manual verification**

This deploy's own `client.js` still says `window.FC360_CLIENT_ID = 'fluxocerto';`, so first confirm nothing broke: log in normally as an existing `fluxocerto` user — works exactly as before; log in (or simulate) as a user with a *different* `clienteId` — still blocked with "Este usuário não pertence a este endereço." (unchanged regression check).

Then simulate the universal deploy without touching the live `client.js`: in DevTools console, before logging in, run `window.FC360_CLIENT_ID = 'universal';`, then log in with any valid user from any client. Expected: login succeeds (no "não pertence a este endereço" error) and `S.clienteConfig.id` after load equals that user's own `clienteId` (check with `S.clienteConfig.id` in console) — i.e., the tenant was picked up from the login, not blocked. Reload the page afterward (this in-memory override doesn't persist, so a normal reload restores the real `fluxocerto` deploy for further testing).

- [ ] **Step 5: Commit**

```bash
git add client.universal.js app.js
git commit -m "feat: support universal deploy mode where login defines the tenant"
```

---

### Task 8: BUILD bump + checklist de QA manual completo

**Files:**
- Modify: `app.js` (`var BUILD = '...'`)
- Modify: `sw.js` (`CACHE_NAME`)
- Modify: `index.html` (`app.js?v=...`)
- Modify: `version.json`

**Interfaces:** none (no new code — this is the release-discipline task).

- [ ] **Step 1: Read the current BUILD number**

```bash
grep "var BUILD" app.js
```

Note the number (was `303` as of 2026-08-05 — read it fresh, don't assume, since other work may have bumped it since). Call this number `N`; the new build is `N+1`.

- [ ] **Step 2: Bump all 4 locations**

- `app.js`: change `var BUILD = '<N>';` to `var BUILD = '<N+1>';`
- `sw.js` line 3: change `var CACHE_NAME = 'cahu360-v<N>';` to `var CACHE_NAME = 'cahu360-v<N+1>';`
- `index.html`: change `app.js?v=<N>` to `app.js?v=<N+1>` (also bump `style.css?v=` the same way if it shares the counter — check `index.html:20` for the current `style.css?v=` number and bump it too, matching whatever convention the surrounding recent commits used)
- `version.json`: change `{"build":"<N>"}` to `{"build":"<N+1>"}`

- [ ] **Step 3: Full manual QA checklist**

Run through all of these in order, in a real mobile-width browser session (or the coletor device if available):

1. **Capa states by role** — log in as `admin`: capa shows Checklist, Inventário (→ `inv` Gestão), Planos de Ação all vivo, 5 dimmed "em breve" cards, Saída. Log in as `coletor` with no open inventory: only Saída card (Inventário hidden — no open inventory), rest hidden per role. Log in as `coletor` with an open inventory assigned: Inventário card appears (→ `inv-coleta`).
2. **Cadeado real** — using the Bar do Cachorro client config (plano básico, só inventário ativo, per [[project_fc360-pwa]]), log in as its admin: Checklist and Planos de Ação cards show 🔒 and open the upgrade modal on click; Inventário stays vivo.
3. **Sininho** — admin/gerencia/supervisor with an overdue plan see the bell with a badge; clicking lists it; `operator`/`coletor` never see the bell.
4. **Sidebar Em Breve** — visible for admin/gerencia/supervisor (mobile drawer and desktop), hidden for operator/coletor/prevencao.
5. **Universal login** (per Task 7's console simulation) — still works after the BUILD bump.
6. **Existing deploy still blocks cross-tenant** — a user from a different `clienteId` still can't log into this `fluxocerto` deploy.
7. **Desktop unaffected** — full desktop click-through of dashboard, checklist, planos, relatórios still behaves exactly as before this plan.
8. **Service worker updates** — after deploy, confirm the app picks up BUILD `N+1` without a stuck cache (this exercises the fix from BUILD 269, `sw.js` network-first on `/` — don't reintroduce that bug).

- [ ] **Step 4: Commit**

```bash
git add app.js sw.js index.html version.json
git commit -m "chore: bump BUILD for Fase 1 capa/TWA release"
```

---

### Task 9 (runbook, não-código): Empacotamento TWA + Play Store + white label

This task is infrastructure/operations outside this repository's code — it needs a Google Play Console account, a second GitHub repo, and (for signing) a keystore that must be kept safe long-term. It is **not** end-to-end executable by an agent without those credentials in hand; documented here as the exact runbook so whoever has the accounts (Tiago, or an agent once granted access) can execute it without re-deriving the steps.

- [ ] **Step 1: Create the universal deploy repo**

Create `fc360oficial/fc360-app` on GitHub (same pattern as `fc360-economico`/`fc360-bardocachorro` in [[project_fc360-pwa]]), sync it from the base repo the same way `deploy-cliente.bat` does for other clients, but with `client.universal.js` (Task 7) copied in as its `client.js`. Enable GitHub Pages on it, same as the other client repos.

- [ ] **Step 2: Serve `assetlinks.json` at the Pages root**

Create `fc360oficial/fc360oficial.github.io` (a repo named exactly as the GitHub Pages user/org root — this makes it serve at the bare `fc360oficial.github.io` origin, which is required because Android's Digital Asset Links verification for a TWA fetches `/.well-known/assetlinks.json` from the **origin root**, not from a repo subpath like `/fc360-app/`). Add `.well-known/assetlinks.json` with an empty array `[]` for now — it gets one entry per published APK's SHA-256 signing fingerprint (added in Step 4).

- [ ] **Step 3: Generate the TWA with PWABuilder or Bubblewrap**

Point PWABuilder (https://www.pwabuilder.com) or the Bubblewrap CLI at `https://fc360oficial.github.io/fc360-app/`. It reads `manifest.json` (already present, `manifest.json:1-25`) to prefill name/icons/theme color. Generate an Android App Bundle (`.aab`) — this creates/uses a signing keystore; **back up the keystore file and its passwords somewhere durable (not just this machine)** — losing it means losing the ability to ever update this app on the Play Store again.

- [ ] **Step 4: Wire the signing fingerprint into `assetlinks.json`**

The TWA generator step prints (or lets you re-derive via `keytool -list -v`) the SHA-256 fingerprint of the signing key. Add it as an entry in `fc360oficial.github.io/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "<package id chosen during TWA generation>",
    "sha256_cert_fingerprints": ["<fingerprint from step 3>"]
  }
}]
```

Without this, Android shows the browser URL bar instead of true full-screen app mode.

- [ ] **Step 5: Google Play Console listing**

Create a Google Play Developer account (US$25 one-time, if not already done). Create the app listing "Fluxo Certo 360", upload the `.aab`, fill store listing (screenshots, description, icon — reuse `icon-192.png`/`icon-512.png` already in the repo). Play Console requires a **privacy policy URL** — needs a simple static page published somewhere (can live in the `fc360oficial.github.io` repo created in Step 2, e.g. `/privacidade.html`) before the listing can be submitted for review. Submit for review (can take from hours to a few days).

- [ ] **Step 6: White label premium — per-client repeat**

For each premium client: their existing client repo (e.g. `fc360-economico`) already serves at its own URL — repeat Steps 3-4 pointing PWABuilder at that client's URL instead, with that client's name/icon in `manifest.json` for that deploy, and add its fingerprint as one more entry in the same shared `assetlinks.json` array from Step 2 (one file, one entry per app). Each is a separate Play Console listing.

- [ ] **No commit for this task** — it produces external accounts, a keystore, and two new GitHub repos, not a commit to this repo.

---

## Self-Review Notes

- **Spec coverage:** every numbered section of the design spec maps to a task — §3 capa layout/states → Tasks 1-3, §3 sininho → Task 5, §4 sidebar → Task 6, §5 TWA/entrada universal/white label → Tasks 7 & 9, §7 success criteria → Task 8's QA checklist. §6 (Firestore subcoleções/Security Rules) is explicitly out of scope for this plan per the spec's own §2 ("gera plano de implementação próprio, separado") — not included here on purpose.
- **Placeholder scan:** no TBD/TODO left; Task 9 is intentionally a runbook (not code) because it requires external accounts this session doesn't have — that's stated explicitly, not hidden.
- **Type/name consistency checked:** `CAPA_MODULOS`/`_capaEstado` (Task 1) → consumed by `renderCapa` (Task 3) → consumed by `nav()` (Task 4) → bell functions (Task 5) are all called with the exact names defined where they're introduced.
- **Known pre-existing landmine flagged, not fixed:** the duplicate `atualizarNavColeta()` declaration (`app.js:9155` and `app.js:12302`) — Task 6 leaves a note about it since Task 1's `roleOk()` for Inventário had to be written to match the *second* (actually running) definition instead of the first.