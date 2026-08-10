# Módulo Promotores (Fase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o card "Promotores" (hoje "Em breve") por um módulo real de controle de visitas de promotores/repositores via check-in/check-out por QR code, sem exigir login do promotor.

**Architecture:** Duas coleções Firestore novas particionadas por cliente (`clientes/{clienteId}/fornecedores` e `.../promotor_visitas`). Uma página pública nova (`public/checkin.html`, fora do app principal) usa Firebase Auth anônimo pra escrever com segurança sem exigir login de verdade. Dentro do FC360, uma tela com duas abas (Fornecedores / Visitas) segue o padrão de abas já usado em "Central de Resultados".

**Tech Stack:** Vanilla JS (sem bundler), Firebase 8.x compat SDK (`firebase.firestore()`, `firebase.auth()` — mesmo padrão já usado em `app.js`), biblioteca vendorizada `qrcode-generator` (MIT, sem dependências) pra gerar os QR codes.

Não existe test runner neste projeto (SPA vanilla JS servida como arquivo estático, sem build step). Os passos de "teste" abaixo são verificação manual no navegador (console + Firestore), não testes automatizados — não introduzir um framework de teste novo, isso está fora de escopo.

## Global Constraints

- Toda leitura/escrita das duas coleções novas passa por `clientes/{clienteId}/...` — nunca criar coleção solta no root do Firestore (regra da Fase 1, ver `docs/superpowers/specs/2026-08-05-fase1-capa-modulos-apk-design.md`).
- `checkin.html` não pode exigir login real do promotor — só `signInAnonymously()`.
- Sempre que `app.js`, `style.css` ou `checkin.html` mudar de conteúdo, incrementar `BUILD`/`?v=` nos 4 lugares de costume (`app.js` linha 2, `sw.js` `CACHE_NAME`, `index.html` `app.js?v=` e `style.css?v=`, `version.json`) — ver `docs/superpowers/specs/2026-08-10-fase2-promotores-design.md` seção 6 e histórico de BUILD no projeto.
- GPS pode ser negado pelo navegador — nunca bloquear o check-in/check-out por causa disso, só gravar `null` no campo geo.

---

### Task 1: Firestore Security Rules para as duas coleções novas

**Files:**
- Create: `firestore.rules`

**Interfaces:**
- Produces: regras que exigem `request.auth != null` (aceita anônimo) pra criar/editar `promotor_visitas`, e leitura pública de `fornecedores` (necessária pra popular o select da página de check-in sem login).

Hoje não existe `firestore.rules` versionado no repo — as regras atuais só existem no Console do Firebase. Este arquivo passa a ser a fonte de verdade só para as duas coleções deste módulo; ele precisa ser colado manualmente no Console (Firestore → Regras) até o dia em que o projeto ganhar deploy automatizado de regras (fora de escopo aqui).

- [ ] **Step 1: Criar o arquivo de regras**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /clientes/{clienteId}/fornecedores/{fornecedorId} {
      // Leitura pública: a página de check-in (sem login) precisa listar
      // os fornecedores daquela loja pro select.
      allow read: if true;
      // Escrita só autenticado (usuários reais do FC360, checado na regra
      // geral do app — aqui só garantimos que não é totalmente aberto).
      allow write: if request.auth != null && request.auth.token.firebase.sign_in_provider != 'anonymous';
    }

    match /clientes/{clienteId}/promotor_visitas/{visitaId} {
      allow read: if request.auth != null;
      // Create: só o dono da sessão anônima pode criar, e só com os campos
      // esperados (sessionUid tem que bater com quem está autenticado).
      allow create: if request.auth != null
        && request.resource.data.sessionUid == request.auth.uid
        && request.resource.data.checkOutEm == null;
      // Update: só quem criou a visita (mesmo sessionUid) pode fechar o
      // check-out, e só o campo de check-out (não pode reescrever check-in).
      allow update: if request.auth != null
        && resource.data.sessionUid == request.auth.uid
        && resource.data.checkOutEm == null
        && request.resource.data.fornecedorId == resource.data.fornecedorId
        && request.resource.data.lojaId == resource.data.lojaId
        && request.resource.data.checkInEm == resource.data.checkInEm;
      allow delete: if false;
    }
  }
}
```

- [ ] **Step 2: Colar no Console do Firebase**

Abrir https://console.firebase.google.com/project/economico-gestao/firestore/rules , colar o bloco `match /clientes/{clienteId}/fornecedores/...` e `match /clientes/{clienteId}/promotor_visitas/...` dentro do `service cloud.firestore { match /databases/{database}/documents { ... } }` já existente (não substituir as regras de outras coleções, só adicionar estes dois blocos). Publicar.

- [ ] **Step 3: Verificar manualmente no Rules Playground**

No Console, aba "Regras" → "Simulador":
- Simular `get` em `/clientes/fluxocerto/fornecedores/x` sem autenticação → esperado: **Allow**.
- Simular `create` em `/clientes/fluxocerto/promotor_visitas/x` sem autenticação, com qualquer payload → esperado: **Deny**.
- Simular `create` autenticado (tipo "Firebase Authentication", uid `abc123`) com payload `{sessionUid: "abc123", checkOutEm: null}` → esperado: **Allow**.
- Simular o mesmo `create` com `sessionUid: "outro-uid"` → esperado: **Deny**.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat: regras Firestore para fornecedores e promotor_visitas (módulo Promotores)"
```

---

### Task 2: Vendorizar biblioteca de QR code

**Files:**
- Create: `qrcode-generator.min.js`

**Interfaces:**
- Produces: função global `qrcode(typeNumber, errorCorrectionLevel)` retornando um objeto com `.addData(str)`, `.make()`, `.createSvgTag(cellSize, margin)`.

- [ ] **Step 1: Baixar a biblioteca**

Baixar o arquivo minificado de https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js e salvar em `qrcode-generator.min.js` na raiz do projeto (mesmo nível de `app.js`). É biblioteca MIT, sem dependências, ~15KB, não faz nenhuma chamada de rede em runtime (gera o QR todo client-side).

- [ ] **Step 2: Verificar que carrega sem erro**

Abrir `index.html` num navegador local, adicionar temporariamente `<script src="qrcode-generator.min.js"></script>` antes de `</body>`, abrir o console e rodar:

```js
var qr = qrcode(0, 'M');
qr.addData('teste');
qr.make();
document.body.innerHTML += qr.createSvgTag(4);
```

Esperado: aparece um QR code válido na página (escaneável com o celular, deve abrir/copiar o texto "teste"). Remover o `<script>` temporário depois de confirmar — ele volta definitivo na Task 5.

- [ ] **Step 3: Commit**

```bash
git add qrcode-generator.min.js
git commit -m "chore: vendoriza qrcode-generator pra gerar QR dos check-ins de promotor"
```

---

### Task 3: `checkin.html` — scaffold público + login anônimo + carregar loja/fornecedores

**Files:**
- Create: `public/checkin.html`

**Interfaces:**
- Consumes: Firestore `clientes/{clienteId}` (campo `nome`), `clientes/{clienteId}/fornecedores` (campos `nome`, `ativo`, `lojas`).
- Produces: variáveis globais `CLIENTE_ID`, `LOJA_ID` (lidas da URL) usadas pelas Tasks 4 e 5.

- [ ] **Step 1: Criar o arquivo com Firebase init + leitura da URL**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Check-in de Visita</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',sans-serif}
body{background:#F5F6F8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border-radius:16px;padding:28px 24px;max-width:400px;width:100%;box-shadow:0 4px 20px rgba(0,0,0,.08)}
.loja-nome{font-size:20px;font-weight:800;margin-bottom:4px}
.sub{font-size:13px;color:#6b7280;margin-bottom:20px}
label{display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px}
select,input{width:100%;padding:12px;border:1px solid #d1d5db;border-radius:10px;font-size:15px;margin-bottom:16px}
button{width:100%;padding:14px;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;background:#FFC600;color:#111}
button:disabled{opacity:.5;cursor:not-allowed}
.msg{font-size:13px;padding:12px;border-radius:10px;margin-bottom:16px;display:none}
.msg-err{background:#fee2e2;color:#991b1b}
.msg-ok{background:#dcfce7;color:#166534}
.aberto{background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px;margin-bottom:16px}
.aberto b{display:block;font-size:16px;margin-bottom:4px}
</style>
</head>
<body>
<div class="card" id="card">
  <div class="loja-nome" id="loja-nome">Carregando...</div>
  <div class="sub" id="loja-sub"></div>
  <div class="msg msg-err" id="msg-err"></div>
</div>

<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js"></script>
<script>
firebase.initializeApp({
  apiKey: "AIzaSyAIOroUpio0sSBzTuhUqyJxz5bV7PX4KLw",
  authDomain: "economico-gestao.firebaseapp.com",
  projectId: "economico-gestao",
  storageBucket: "economico-gestao.firebasestorage.app",
  messagingSenderId: "650620659681",
  appId: "1:650620659681:web:4ca84bdb330d028e9f14a0"
});
var db = firebase.firestore();

var params = new URLSearchParams(location.search);
var CLIENTE_ID = params.get('c') || '';
var LOJA_ID = params.get('l') || '';
var currentUid = null;
var fornecedoresDaLoja = [];

function mostrarErro(msg) {
  var el = document.getElementById('msg-err');
  el.textContent = msg;
  el.style.display = 'block';
}

function iniciar() {
  if (!CLIENTE_ID || !LOJA_ID) { mostrarErro('Link inválido — faltam parâmetros na URL.'); return; }
  firebase.auth().signInAnonymously().then(function(cred) {
    currentUid = cred.user.uid;
    carregarLoja();
  }).catch(function(e) {
    mostrarErro('Erro ao iniciar sessão: ' + e.code);
  });
}

function carregarLoja() {
  db.collection('clientes').doc(CLIENTE_ID).get().then(function(doc) {
    var nome = doc.exists ? (doc.data().nome || CLIENTE_ID) : CLIENTE_ID;
    document.getElementById('loja-nome').textContent = nome;
    document.getElementById('loja-sub').textContent = 'Loja: ' + LOJA_ID;
    return db.collection('clientes').doc(CLIENTE_ID).collection('fornecedores')
      .where('lojas', 'array-contains', LOJA_ID)
      .where('ativo', '==', true).get();
  }).then(function(snap) {
    fornecedoresDaLoja = snap.docs.map(function(d){ return Object.assign({id: d.id}, d.data()); });
    verificarVisitaAberta();
  }).catch(function(e) {
    mostrarErro('Erro ao carregar dados da loja: ' + e.message);
  });
}

iniciar();
</script>
</body>
</html>
```

- [ ] **Step 2: Verificar manualmente**

Publicar o arquivo (ou servir localmente — ver os scripts `iniciar-servidor.bat`/servidor estático já usados nas sessões anteriores deste projeto) e abrir `checkin.html?c=fluxocerto&l=1` no navegador. Abrir o DevTools → Console: não deve ter erro. Aba Application → verificar que existe um usuário anônimo logado (ou checar no Console do Firebase → Authentication → deve aparecer um novo usuário "Anônimo"). O título deve mudar de "Carregando..." pro nome do cliente/loja.

- [ ] **Step 3: Commit**

```bash
git add public/checkin.html
git commit -m "feat: scaffold da página pública de check-in (login anônimo + carrega loja/fornecedores)"
```

---

### Task 4: `checkin.html` — formulário de check-in

**Files:**
- Modify: `public/checkin.html`

**Interfaces:**
- Consumes: `fornecedoresDaLoja` (array, de Task 3), `CLIENTE_ID`, `LOJA_ID`, `currentUid`.
- Produces: função `renderFormCheckin()`, escreve documento em `clientes/{CLIENTE_ID}/promotor_visitas`.

- [ ] **Step 1: Adicionar a função de renderizar o formulário**

Adicionar antes de `iniciar();` no final do `<script>`:

```js
function renderFormCheckin() {
  var card = document.getElementById('card');
  var opcoes = fornecedoresDaLoja.map(function(f) {
    return '<option value="' + f.id + '">' + f.nome + '</option>';
  }).join('');
  if (!opcoes) {
    card.innerHTML += '<div class="msg msg-err" style="display:block">Nenhum fornecedor cadastrado pra essa loja ainda. Fale com o administrador.</div>';
    return;
  }
  card.innerHTML +=
    '<label>Fornecedor</label>' +
    '<select id="ci-fornecedor"><option value="">Selecione...</option>' + opcoes + '</select>' +
    '<label>Seu nome</label>' +
    '<input id="ci-nome" placeholder="Nome completo">' +
    '<div class="msg msg-err" id="ci-erro"></div>' +
    '<button id="ci-btn" onclick="fazerCheckin()">Registrar entrada</button>';
}

function fazerCheckin() {
  var fornecedorId = document.getElementById('ci-fornecedor').value;
  var nome = document.getElementById('ci-nome').value.trim();
  var erroEl = document.getElementById('ci-erro');
  erroEl.style.display = 'none';
  if (!fornecedorId) { erroEl.textContent = 'Selecione o fornecedor.'; erroEl.style.display = 'block'; return; }
  if (!nome) { erroEl.textContent = 'Informe seu nome.'; erroEl.style.display = 'block'; return; }

  var fornecedor = fornecedoresDaLoja.filter(function(f){ return f.id === fornecedorId; })[0];
  var btn = document.getElementById('ci-btn');
  btn.disabled = true; btn.textContent = 'Registrando...';

  function gravar(geo) {
    db.collection('clientes').doc(CLIENTE_ID).collection('promotor_visitas').add({
      fornecedorId: fornecedorId,
      fornecedorNome: fornecedor.nome,
      lojaId: LOJA_ID,
      lojaNome: document.getElementById('loja-sub').textContent.replace('Loja: ', ''),
      promotorNome: nome,
      sessionUid: currentUid,
      checkInEm: firebase.firestore.FieldValue.serverTimestamp(),
      checkInGeo: geo,
      checkOutEm: null,
      checkOutGeo: null
    }).then(function() {
      verificarVisitaAberta();
    }).catch(function(e) {
      btn.disabled = false; btn.textContent = 'Registrar entrada';
      erroEl.textContent = 'Erro ao registrar: ' + e.message;
      erroEl.style.display = 'block';
    });
  }

  if (!navigator.geolocation) { gravar(null); return; }
  navigator.geolocation.getCurrentPosition(
    function(pos) { gravar({lat: pos.coords.latitude, lng: pos.coords.longitude}); },
    function() { gravar(null); },
    {timeout: 5000}
  );
}
```

- [ ] **Step 2: Ligar no fluxo (placeholder de `verificarVisitaAberta`)**

Por enquanto, pra testar só o check-in isoladamente, adicionar uma versão provisória de `verificarVisitaAberta` (será substituída de verdade na Task 5):

```js
function verificarVisitaAberta() {
  renderFormCheckin();
}
```

- [ ] **Step 3: Verificar manualmente**

Abrir `checkin.html?c=fluxocerto&l=1` (precisa ter pelo menos 1 fornecedor cadastrado com `lojas: ["1"]` e `ativo: true` no Firestore — criar um doc de teste manualmente no Console se a Task 6 ainda não estiver pronta). Selecionar fornecedor, digitar nome, clicar "Registrar entrada". O navegador deve pedir permissão de localização. Depois de confirmar, checar no Console do Firebase que um documento novo apareceu em `clientes/fluxocerto/promotor_visitas` com os campos certos e `checkOutEm: null`.

- [ ] **Step 4: Commit**

```bash
git add public/checkin.html
git commit -m "feat: formulário de check-in com captura de GPS"
```

---

### Task 5: `checkin.html` — detectar visita aberta e formulário de check-out

**Files:**
- Modify: `public/checkin.html`

**Interfaces:**
- Consumes: `currentUid`, `CLIENTE_ID`.
- Produces: substitui a `verificarVisitaAberta()` provisória da Task 4 pela versão real.

- [ ] **Step 1: Substituir `verificarVisitaAberta` pela versão real**

Trocar a função provisória do Step 2 da Task 4 por:

```js
var visitaAbertaId = null;

function verificarVisitaAberta() {
  db.collection('clientes').doc(CLIENTE_ID).collection('promotor_visitas')
    .where('sessionUid', '==', currentUid)
    .where('checkOutEm', '==', null)
    .limit(1).get().then(function(snap) {
      if (snap.empty) { renderFormCheckin(); return; }
      var doc = snap.docs[0];
      visitaAbertaId = doc.id;
      renderFormCheckout(doc.data());
    }).catch(function(e) {
      mostrarErro('Erro ao verificar visita: ' + e.message);
    });
}

function renderFormCheckout(visita) {
  var card = document.getElementById('card');
  var hora = visita.checkInEm && visita.checkInEm.toDate ? visita.checkInEm.toDate().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) : '';
  card.innerHTML +=
    '<div class="aberto"><b>Você está em: ' + visita.lojaNome + '</b>Fornecedor: ' + visita.fornecedorNome + '<br>Entrada às ' + hora + '</div>' +
    '<div class="msg msg-err" id="co-erro"></div>' +
    '<button id="co-btn" onclick="fazerCheckout()">Registrar saída</button>';
}

function fazerCheckout() {
  var btn = document.getElementById('co-btn');
  btn.disabled = true; btn.textContent = 'Registrando...';

  function gravar(geo) {
    db.collection('clientes').doc(CLIENTE_ID).collection('promotor_visitas').doc(visitaAbertaId).update({
      checkOutEm: firebase.firestore.FieldValue.serverTimestamp(),
      checkOutGeo: geo
    }).then(function() {
      document.getElementById('card').innerHTML =
        '<div class="loja-nome">✅ Saída registrada</div><div class="sub">Obrigado! Você já pode fechar essa página.</div>';
    }).catch(function(e) {
      btn.disabled = false; btn.textContent = 'Registrar saída';
      var erroEl = document.getElementById('co-erro');
      erroEl.textContent = 'Erro ao registrar: ' + e.message;
      erroEl.style.display = 'block';
    });
  }

  if (!navigator.geolocation) { gravar(null); return; }
  navigator.geolocation.getCurrentPosition(
    function(pos) { gravar({lat: pos.coords.latitude, lng: pos.coords.longitude}); },
    function() { gravar(null); },
    {timeout: 5000}
  );
}
```

- [ ] **Step 2: Verificar manualmente**

Repetir o check-in da Task 4 e, sem fechar o navegador, recarregar `checkin.html?c=fluxocerto&l=1` — deve pular direto pra tela "Você está em: ..." em vez do formulário. Clicar "Registrar saída", confirmar no Console do Firebase que o mesmo documento ganhou `checkOutEm` preenchido. Recarregar a página de novo — deve voltar a mostrar o formulário de check-in (visita já fechada).

- [ ] **Step 3: Commit**

```bash
git add public/checkin.html
git commit -m "feat: detecta visita em aberto e implementa check-out"
```

---

### Task 6: Tela de Fornecedores dentro do FC360 (CRUD + QR)

**Files:**
- Modify: `index.html:98-113` (trocar o stub `nav-embreve-promotores` por um item de nav real; adicionar `panel-promotores` com abas)
- Modify: `app.js` (funções `renderFornecedores`, `abrirModalFornecedor`, `salvarFornecedor`, `excluirFornecedor`, `abrirQrFornecedor`)

**Interfaces:**
- Consumes: `qrcode-generator.min.js` (Task 2), padrão `nav()`/nav de abas já usado em `switchCentralTab` (referência de estilo).
- Produces: `switchPromotoresTab(tab, btn)`, usado pela Task 7.

- [ ] **Step 1: Trocar o item de sidebar em `index.html`**

Localizar (por volta da linha 99):
```html
      <div class="sb-item sb-item-embreve" id="nav-embreve-promotores" style="display:none" onclick="_avisoEmBreve('Promotores')">
```
(bloco completo do item, incluindo o `</div>` de fechamento) e **remover** esse bloco inteiro — Promotores sai da seção "Em breve" porque agora é um módulo real.

Adicionar, junto dos outros itens reais de sidebar (perto de `id="nav-central"`, por volta da linha 85):
```html
      <div class="sb-item" id="nav-promotores" style="display:none" onclick="nav('promotores',this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
        Promotores
      </div>
```

- [ ] **Step 2: Adicionar o painel com abas em `index.html`**

Adicionar depois do `</div>` de fechamento de `panel-central` (por volta da linha 553, mesmo padrão da Task de leitura anterior):

```html
      <div id="panel-promotores" class="panel">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div><div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:18px;font-weight:700">Promotores</div><div style="font-size:13px;color:var(--t3);margin-top:2px">Fornecedores e visitas por loja</div></div>
        </div>
        <div class="tabs" id="promotores-tabs" style="margin-bottom:16px">
          <div class="tab on" onclick="switchPromotoresTab('fornecedores',this)">Fornecedores</div>
          <div class="tab" onclick="switchPromotoresTab('visitas',this)">Visitas</div>
        </div>

        <div id="promotores-tab-fornecedores">
          <button class="btn btn-p btn-sm" style="margin-bottom:14px" onclick="abrirModalFornecedor()">+ Novo Fornecedor</button>
          <div id="fornecedores-lista"></div>
        </div>

        <div id="promotores-tab-visitas" style="display:none">
          <div id="visitas-lista"></div>
        </div>
      </div>

      <div class="modal-bg" id="modal-fornecedor" style="display:none">
        <div class="modal-box" style="width:420px">
          <div class="modal-title">Fornecedor</div>
          <input type="hidden" id="forn-id">
          <label>Nome</label>
          <input id="forn-nome" placeholder="Nome do fornecedor">
          <label style="margin-top:12px">Lojas atendidas (IDs separados por vírgula)</label>
          <input id="forn-lojas" placeholder="1,2,3">
          <div class="btn-row" style="margin-top:16px">
            <button class="btn btn-p" onclick="salvarFornecedor()">Salvar</button>
            <button class="btn btn-s" onclick="document.getElementById('modal-fornecedor').style.display='none'">Cancelar</button>
          </div>
        </div>
      </div>

      <div class="modal-bg" id="modal-qr" style="display:none">
        <div class="modal-box" style="width:340px;text-align:center">
          <div class="modal-title">QR Code da loja</div>
          <div id="qr-container" style="margin:16px 0"></div>
          <button class="btn btn-s" style="width:100%" onclick="document.getElementById('modal-qr').style.display='none'">Fechar</button>
        </div>
      </div>
```

- [ ] **Step 3: Adicionar `switchPromotoresTab` em `app.js`**

```js
function switchPromotoresTab(tab, btn) {
  document.getElementById('promotores-tab-fornecedores').style.display = tab === 'fornecedores' ? 'block' : 'none';
  document.getElementById('promotores-tab-visitas').style.display = tab === 'visitas' ? 'block' : 'none';
  document.querySelectorAll('#promotores-tabs .tab').forEach(function(t){t.classList.remove('on');});
  if (btn) btn.classList.add('on');
  if (tab === 'visitas') renderVisitasPromotor();
}
```

- [ ] **Step 4: Adicionar CRUD de fornecedores em `app.js`**

```js
function fornecedoresCol() {
  return db.collection('clientes').doc(S.clienteConfig.id).collection('fornecedores');
}

function renderFornecedores() {
  var wrap = document.getElementById('fornecedores-lista');
  wrap.innerHTML = '<div class="empty">Carregando...</div>';
  fornecedoresCol().get().then(function(snap) {
    if (snap.empty) { wrap.innerHTML = '<div class="empty">Nenhum fornecedor cadastrado ainda.</div>'; return; }
    wrap.innerHTML = snap.docs.map(function(d) {
      var f = d.data();
      return '<div class="card" style="display:flex;align-items:center;justify-content:space-between;padding:14px;margin-bottom:8px">'
        + '<div><strong>' + f.nome + '</strong><div style="font-size:12px;color:var(--t3)">Lojas: ' + (f.lojas||[]).join(', ') + '</div></div>'
        + '<div style="display:flex;gap:6px">'
        + '<button class="btn btn-s btn-sm" onclick="abrirQrFornecedor(\'' + (f.lojas && f.lojas[0] || '') + '\')">QR</button>'
        + '<button class="btn btn-s btn-sm" onclick="abrirModalFornecedor(\'' + d.id + '\')">Editar</button>'
        + '<button class="btn btn-d btn-sm" onclick="excluirFornecedor(\'' + d.id + '\')">Excluir</button>'
        + '</div></div>';
    }).join('');
  });
}

function abrirModalFornecedor(id) {
  document.getElementById('forn-id').value = id || '';
  document.getElementById('forn-nome').value = '';
  document.getElementById('forn-lojas').value = '';
  document.getElementById('modal-fornecedor').style.display = 'flex';
  if (id) {
    fornecedoresCol().doc(id).get().then(function(doc) {
      var f = doc.data();
      document.getElementById('forn-nome').value = f.nome;
      document.getElementById('forn-lojas').value = (f.lojas||[]).join(',');
    });
  }
}

function salvarFornecedor() {
  var id = document.getElementById('forn-id').value;
  var nome = document.getElementById('forn-nome').value.trim();
  var lojas = document.getElementById('forn-lojas').value.split(',').map(function(s){return s.trim();}).filter(Boolean);
  if (!nome || !lojas.length) { showToast('Preencha nome e ao menos uma loja.'); return; }
  var dados = {nome: nome, lojas: lojas, ativo: true};
  var op = id ? fornecedoresCol().doc(id).update(dados) : fornecedoresCol().add(dados);
  op.then(function() {
    document.getElementById('modal-fornecedor').style.display = 'none';
    renderFornecedores();
  });
}

function excluirFornecedor(id) {
  if (!confirm('Excluir este fornecedor?')) return;
  fornecedoresCol().doc(id).delete().then(renderFornecedores);
}

function abrirQrFornecedor(lojaId) {
  if (!lojaId) { showToast('Esse fornecedor não tem loja cadastrada.'); return; }
  var url = location.origin + '/checkin.html?c=' + S.clienteConfig.id + '&l=' + lojaId;
  var qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  document.getElementById('qr-container').innerHTML = qr.createSvgTag(5) + '<div style="font-size:11px;color:var(--t3);margin-top:8px;word-break:break-all">' + url + '</div>';
  document.getElementById('modal-qr').style.display = 'flex';
}
```

- [ ] **Step 5: Incluir a lib de QR em `index.html`**

Adicionar `<script src="qrcode-generator.min.js"></script>` antes de `<script src="app.js?v=306" defer></script>` (sem `defer`, precisa estar pronta antes do app.js usar `qrcode(...)`).

- [ ] **Step 6: Verificar manualmente**

Abrir o app logado como admin, ir em Promotores (depois que a Task 7 ligar a navegação — se testar antes, chamar `nav('promotores')` manualmente pelo console). Cadastrar um fornecedor com loja "1", confirmar que aparece na lista. Clicar "QR", confirmar que aparece um QR code válido apontando pra `checkin.html?c=...&l=1` (escanear com o celular pra conferir). Editar o fornecedor, confirmar que os dados persistem. Excluir, confirmar que some da lista e do Firestore.

- [ ] **Step 7: Commit**

```bash
git add index.html app.js
git commit -m "feat: CRUD de fornecedores e geração de QR code por loja"
```

---

### Task 7: Tela de Visitas (histórico) dentro do FC360

**Files:**
- Modify: `app.js` (função `renderVisitasPromotor`)

**Interfaces:**
- Consumes: `switchPromotoresTab` (Task 6), coleção `promotor_visitas`.

- [ ] **Step 1: Adicionar a função de listar visitas**

```js
function renderVisitasPromotor() {
  var wrap = document.getElementById('visitas-lista');
  wrap.innerHTML = '<div class="empty">Carregando...</div>';
  db.collection('clientes').doc(S.clienteConfig.id).collection('promotor_visitas')
    .orderBy('checkInEm', 'desc').limit(100).get().then(function(snap) {
      if (snap.empty) { wrap.innerHTML = '<div class="empty">Nenhuma visita registrada ainda.</div>'; return; }
      wrap.innerHTML = '<table class="tbl"><thead><tr><th>Loja</th><th>Fornecedor</th><th>Promotor</th><th>Entrada</th><th>Saída</th></tr></thead><tbody>'
        + snap.docs.map(function(d) {
          var v = d.data();
          var ci = v.checkInEm && v.checkInEm.toDate ? v.checkInEm.toDate().toLocaleString('pt-BR') : '-';
          var co = v.checkOutEm && v.checkOutEm.toDate ? v.checkOutEm.toDate().toLocaleString('pt-BR') : '<span class="st st-warn">Em aberto</span>';
          return '<tr><td>' + v.lojaNome + '</td><td>' + v.fornecedorNome + '</td><td>' + v.promotorNome + '</td><td>' + ci + '</td><td>' + co + '</td></tr>';
        }).join('')
        + '</tbody></table>';
    }).catch(function(e) {
      wrap.innerHTML = '<div class="empty">Erro ao carregar: ' + e.message + '</div>';
    });
}
```

- [ ] **Step 2: Verificar manualmente**

Fazer um check-in + check-out completo via `checkin.html` (Tasks 4/5), depois abrir a aba "Visitas" dentro do FC360 — a visita deve aparecer na lista com horário de entrada e saída formatados. Fazer só um check-in (sem check-out) e confirmar que aparece "Em aberto" na coluna Saída.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: histórico de visitas de promotores"
```

---

### Task 8: Ligar o card na capa, roles e BUILD

**Files:**
- Modify: `app.js:964-1005` (array `CAPA_MODULOS`)
- Modify: `app.js` (`setupRole`, função por volta da linha 1710-1730)
- Modify: `app.js:2`, `sw.js:3`, `sw.js:11-12`, `index.html` (`app.js?v=`, `style.css?v=`), `version.json`

**Interfaces:**
- Consumes: `_capaEstado`, `roleOk` (padrão já existente, ver módulo `central` no mesmo array).

- [ ] **Step 1: Atualizar a entrada `promotores` em `CAPA_MODULOS`**

Trocar:
```js
  { id:'promotores', label:'Promotores', desenvolvido:false,
    icone:'<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>' },
```
por:
```js
  { id:'promotores', label:'Promotores', desenvolvido:true, moduloChave:'promotores',
    roleOk: function(){ return S.role==='admin' || S.role==='supervisor'; },
    page: function(){ return 'promotores'; },
    icone:'<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>' },
```

- [ ] **Step 2: Ligar a visibilidade do item de sidebar em `setupRole`**

Adicionar perto de `show('nav-central', ...)` (linha ~1711):
```js
  show('nav-promotores', (isAdmin || isSup) && !isColetor && _moduloAtivo('promotores'));
```

E remover a linha `show('nav-embreve-promotores', mostrarEmBreve);` (linha ~1728), já que o stub de sidebar foi removido na Task 6.

- [ ] **Step 3: Adicionar `promotores` no roteamento de `nav()`**

Perto do bloco `if (page==='central') { ... }` dentro de `nav()`, adicionar:
```js
  if (page === 'promotores') {
    renderFornecedores();
  }
```

- [ ] **Step 4: Adicionar `promotores` no mapa de módulos do cliente**

Em `_moduloAtivo`/`MODS_LABEL` (linhas ~7830 e ~7887), adicionar `promotores:'Promotores'` junto dos outros módulos, e no cadastro de planos de cliente (painel superadmin, `clienteConfig.modulos`) garantir que o tenant `fluxocerto` tenha `promotores: true` (editar manualmente pelo painel "Editar Cliente" depois do deploy, não precisa de código extra — `_moduloAtivo` já trata "não definido = ativo").

- [ ] **Step 5: Bump de BUILD nos 4 lugares**

```js
// app.js linha 2
var BUILD = '307';
```
```js
// sw.js linha 3
var CACHE_NAME = 'cahu360-v307';
```
```js
// sw.js linhas 11-12
'./app.js?v=307',
'./style.css?v=307',
```
```html
<!-- index.html -->
<script src="app.js?v=307" defer></script>
<link rel="stylesheet" href="style.css?v=307"/>
```
```json
{"build":"307"}
```

- [ ] **Step 6: Verificar manualmente**

Logar como admin no tenant `fluxocerto`, confirmar que o card "Promotores" na capa aparece amarelo (não mais "Em breve") e clicando nele abre a tela com as abas Fornecedores/Visitas. Logar como Gerência ou Coletor, confirmar que o card aparece cinza "Restrito" (por causa do `roleOk` já corrigido na Fase 1 anterior).

- [ ] **Step 7: Commit**

```bash
git add app.js sw.js index.html version.json
git commit -m "feat: ativa o módulo Promotores na capa e faz bump de BUILD"
```

---

## Self-review notes

- Cobertura da spec: seção 2 (escopo v1) → Tasks 3-7; seção 3 (schema) → Task 1 (rules) + Tasks 4/6 (escrita real dos campos); seção 4 (auth anônima) → Tasks 3/5; seção 5 (telas) → Tasks 3-7; seção 6 (riscos GPS) → tratado em Tasks 4/5 (fallback `null`). O risco de troca de celular/navegador (seção 6) fica sem mitigação nesta primeira versão — é um risco aceito no design, não uma lacuna do plano.
- Rankings (fora do escopo v1) não têm task — correto, spec exclui explicitamente.
