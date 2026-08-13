# Módulo Etiquetas (Fase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o card "Etiquetas e Ofertas" (hoje "Em breve") por um módulo real que permite reimprimir etiqueta de preço andando na loja (correção pontual) e imprimir filas de etiquetas montadas na retaguarda (lote), usando a impressora Bluetooth Urovo K329.

**Architecture:** Web Bluetooth (`navigator.bluetooth`) direto do PWA fala com o K329 em TSPL — sem código nativo Android. Uma API nova e isolada (`etiquetas-api.js`, processo Node/Express separado do `server.js` existente, mas no mesmo repositório e reaproveitando as mesmas dependências já instaladas) consulta o MySQL do ERP (somente leitura) por código de barras. Duas coleções... três coleções novas no Firestore, particionadas por `clientes/{clienteId}/...`. Duas telas dentro do FC360: retaguarda (Layout/Lotes/Histórico, admin+supervisor) e coleta (scan+impressão, todos os perfis operacionais).

**Tech Stack:** Vanilla JS sem bundler (mesmo padrão do resto do `app.js`), Firebase 8.x compat SDK, Web Bluetooth API, Node/Express + `mysql2` + `firebase-admin` (dependências já existentes no `package.json` do repo) para a API nova.

Não existe test runner neste projeto. Os passos de "teste" são verificação manual (navegador, Firestore Console, hardware físico) — não introduzir framework de teste novo.

## Global Constraints

- Toda leitura/escrita das 3 coleções novas passa por `clientes/{clienteId}/...` — nunca coleção solta no root do Firestore (regra da Fase 1).
- **Nunca fazer INSERT/UPDATE/DELETE no MySQL do ERP — a API só executa `SELECT`.** Regra permanente, sem exceção (mesmo em teste/debug).
- **Host do MySQL: sempre `192.168.2.254`, nunca `.252`, nem em teste/desenvolvimento local — decisão explícita do Tiago.** A investigação de schema deste plano só conseguiu conectar a partir de `192.168.2.252` (`.254` recusou conexão direta deste notebook de desenvolvimento), mas isso foi só pra descobrir a tabela/colunas certas — não é permissão para usar `.252` em nenhuma parte do código ou dos testes. A API usa `DB_HOST` via variável de ambiente (nunca hardcoded) fixado em `192.168.2.254`; a verificação de conexão real só é possível depois que a API estiver rodando dentro daquele servidor/rede (ver Task 4 Step 2).
- **Tabela/colunas confirmadas via `SELECT` real no MySQL (schema `supermercado`, tabela `itens`, chave primária `nInterno`):** `CodigoBarra` (varchar), `Descricao` (varchar), `preco` (decimal), `unvenda` (varchar, unidade de venda), `CodDesativado` (int, `0` = ativo/vendável). A tabela `central.itens` existe mas está com 100% dos preços zerados (base legada) — não usar.
- Sempre que `app.js`, `style.css` ou `index.html` mudar de conteúdo, incrementar `BUILD`/`?v=` nos 6 lugares de costume (Task 11).
- `etiquetas-api.js` é um processo separado de `server.js` — não modificar `server.js`.

---

### Task 1: Validar Web Bluetooth com o K329 (maior risco técnico do projeto)

**Files:**
- Create: `bluetooth-test.html`

**Interfaces:**
- Produces: confirmação registrada em comentário no próprio arquivo de qual UUID de serviço/característica funcionou de verdade com o K329 físico — consumido pela Task 8 (rotina de impressão real).

Não está confirmado que o K329 aceita comando bruto TSPL via Bluetooth sem exigir o SDK proprietário Android. A tela do app oficial do K329 (print no design spec) mostra "Gap distance", "Paper type: Gap paper", "Direct thermal" — termos que batem exatamente com comandos TSPL (`GAP`, `SIZE`), o que é um bom sinal, mas precisa ser testado com o hardware físico antes de construir o resto.

- [ ] **Step 1: Criar página de diagnóstico standalone**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Teste Bluetooth K329</title>
<style>
body{font-family:sans-serif;padding:20px;max-width:600px;margin:0 auto}
button{padding:12px 20px;font-size:15px;margin:6px 6px 6px 0;cursor:pointer}
#log{background:#111;color:#0f0;padding:12px;border-radius:8px;font-family:monospace;font-size:12px;white-space:pre-wrap;min-height:200px;margin-top:16px}
</style>
</head>
<body>
<h2>Teste Bluetooth — Urovo K329</h2>
<p>Precisa ser aberto em Chrome/Android (Web Bluetooth não existe em iOS Safari).</p>
<button onclick="conectar()">1. Conectar no K329</button>
<button onclick="enviarTeste()">2. Enviar comando de teste</button>
<div id="log"></div>

<script>
// UUIDs candidatos: o trio "ISSC transparent UART" é usado por uma faixa
// grande de impressoras Bluetooth baratas de etiqueta/recibo (o mesmo
// padrão usado por bibliotecas tipo flutter_blue_thermal_printer). Não há
// garantia de que o K329 use exatamente este — por isso o log abaixo lista
// TODOS os serviços/características encontrados, não só esses.
var CANDIDATOS = [
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC transparent UART (comum em impressoras BLE baratas)
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 style serial
  '000018f0-0000-1000-8000-00805f9b34fb', // outro padrão comum de impressora térmica BLE
  'generic_access'
];
var device, gattServer, writeChar;

function logar(msg) {
  document.getElementById('log').textContent += msg + '\n';
}

function conectar() {
  navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: CANDIDATOS
  }).then(function(d) {
    device = d;
    logar('Dispositivo selecionado: ' + d.name + ' (' + d.id + ')');
    return d.gatt.connect();
  }).then(function(server) {
    gattServer = server;
    logar('GATT conectado. Buscando serviços...');
    return server.getPrimaryServices();
  }).then(function(services) {
    logar('Serviços encontrados: ' + services.length);
    services.forEach(function(svc) {
      logar('  Serviço: ' + svc.uuid);
      svc.getCharacteristics().then(function(chars) {
        chars.forEach(function(c) {
          var props = Object.keys(c.properties).filter(function(k){return c.properties[k];}).join(',');
          logar('    Característica: ' + c.uuid + ' [' + props + ']');
          if (c.properties.write || c.properties.writeWithoutResponse) {
            writeChar = c;
            logar('    ^ marcada como writeChar (candidata a envio de comando)');
          }
        });
      });
    });
  }).catch(function(e) {
    logar('ERRO: ' + e.message);
  });
}

function enviarTeste() {
  if (!writeChar) { logar('Nenhuma característica de escrita encontrada ainda — rode "Conectar" primeiro.'); return; }
  var tspl = 'SIZE 72 mm,40 mm\r\nGAP 2 mm,0\r\nCLS\r\nTEXT 20,20,"3",0,1,1,"TESTE K329"\r\nPRINT 1,1\r\n';
  var bytes = new TextEncoder().encode(tspl);
  writeChar.writeValue(bytes).then(function() {
    logar('Comando TSPL enviado (' + bytes.length + ' bytes). Verifique se a etiqueta saiu.');
  }).catch(function(e) {
    logar('ERRO ao enviar: ' + e.message);
  });
}
</script>
</body>
</html>
```

- [ ] **Step 2: Testar com o K329 físico**

Publicar o arquivo (mesmo processo estático já usado nas sessões anteriores) e abrir `bluetooth-test.html` num Android com Chrome, K329 ligado e pareável. Clicar "1. Conectar", selecionar o K329 na lista, e observar o log: deve listar os serviços/características do dispositivo. Clicar "2. Enviar comando de teste" — se uma etiqueta física sair da impressora com o texto "TESTE K329", o caminho Web Bluetooth + TSPL funciona.

**Se funcionar:** anotar no arquivo (comentário) qual UUID de serviço/característica respondeu, para reuso na Task 8.

**Se não funcionar:** nenhum serviço aparecer, ou nenhuma característica aceitar `writeValue`, ou a etiqueta não sair — o caminho Web Bluetooth direto não é viável com este hardware. Isso vira um bloqueio de design, não deste plano — pausar aqui e voltar pro brainstorming pra desenhar o fallback (ponte nativa Android via TWA, mencionado na spec seção 3) antes de continuar pras próximas tasks.

- [ ] **Step 3: Commit**

```bash
git add bluetooth-test.html
git commit -m "chore: página de diagnóstico Web Bluetooth para validar impressão no K329"
```

---

### Task 2: Firestore Security Rules para as três coleções novas

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Produces: regras que exigem `request.auth != null` para todas as operações nas 3 coleções novas de Etiquetas.

- [ ] **Step 1: Adicionar os três blocos `match` novos**

Adicionar dentro do `match /databases/{database}/documents { ... }` já existente (depois do bloco `promotor_visitas`, antes do `}` de fechamento em `firestore.rules:31`):

```
    match /clientes/{clienteId}/etiquetas_layout/{layoutId} {
      allow read, write: if request.auth != null;
    }

    match /clientes/{clienteId}/etiquetas_lote/{loteId} {
      allow read, write: if request.auth != null;
    }

    match /clientes/{clienteId}/etiquetas_log/{logId} {
      allow read, write: if request.auth != null;
    }
```

- [ ] **Step 2: Colar no Console do Firebase**

Abrir https://console.firebase.google.com/project/economico-gestao/firestore/rules , colar os três blocos novos dentro do `service cloud.firestore { match /databases/{database}/documents { ... } }` já existente (não substituir as regras de `fornecedores`/`promotor_visitas`, só adicionar). Publicar.

- [ ] **Step 3: Verificar manualmente no Rules Playground**

No Console, aba "Regras" → "Simulador": simular `create` em `/clientes/fluxocerto/etiquetas_log/x` sem autenticação → esperado **Deny**; o mesmo autenticado (uid qualquer) → esperado **Allow**.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat: regras Firestore para etiquetas_layout, etiquetas_lote e etiquetas_log"
```

---

### Task 3: Nova API "Etiquetas" — scaffold + autenticação Firebase

**Files:**
- Create: `etiquetas-api.js`
- Create: `.env.etiquetas-api.example`

**Interfaces:**
- Consumes: `firebase-admin`, `express`, `mysql2` (já em `package.json`).
- Produces: middleware `verificarToken(req, res, next)` que popula `req.clienteId`, usado pela Task 4.

O projeto Firebase é `economico-gestao` (mesmo `projectId` usado em `public/checkin.html`). Pra `firebase-admin` verificar tokens, precisa de uma service account key baixada do Console (Configurações do Projeto → Contas de Serviço → Gerar nova chave privada) — arquivo JSON que **não pode ir pro git** (já coberto por `*.env`/`.env*` no `.gitignore`, mas o JSON da service account não é um `.env` — precisa de uma entrada própria).

- [ ] **Step 1: Adicionar o arquivo de service account ao `.gitignore`**

Adicionar ao `.gitignore` (fim do arquivo):
```
firebase-service-account.json
```

- [ ] **Step 2: Criar o template de variáveis de ambiente**

```
# etiquetas-api.js — variáveis de ambiente (copiar para .env.etiquetas-api e preencher)
PORT=3011
DB_HOST=192.168.2.254
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json
```

- [ ] **Step 3: Criar o scaffold da API com autenticação**

```js
// etiquetas-api.js — serviço isolado, processo separado de server.js.
// Só faz SELECT no MySQL do ERP (nunca INSERT/UPDATE/DELETE).
require('dotenv').config({ path: '.env.etiquetas-api' });
const express = require('express');
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert(require(process.env.GOOGLE_APPLICATION_CREDENTIALS))
});
const firestore = admin.firestore();

const app = express();

// Verifica o Firebase ID token do operador já logado no FC360, e resolve
// o clienteId do usuário consultando a mesma coleção `usuarios` que o
// app.js usa (finalizarLogin, app.js:1285) — não existe custom claim de
// clienteId no token ainda, então a busca é por e-mail, igual ao app.
async function verificarToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const snap = await firestore.collection('usuarios')
      .where('email', '==', (decoded.email || '').toLowerCase())
      .limit(1).get();
    if (snap.empty) return res.status(403).json({ error: 'Usuário não encontrado' });
    req.clienteId = snap.docs[0].data().clienteId || 'economico';
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token inválido: ' + e.message });
  }
}

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3011;
app.listen(PORT, () => console.log('etiquetas-api rodando na porta ' + PORT));

module.exports = { app, verificarToken };
```

- [ ] **Step 4: Instalar `dotenv` (única dependência nova)**

```bash
npm install dotenv
```

- [ ] **Step 5: Verificar manualmente**

Preencher `.env.etiquetas-api` (copiado do exemplo, com a senha real do MySQL — mesma já usada em `server.js`'s `dbConfig`, `server.js:274-280`) e a service account JSON baixada do Console. Rodar `node etiquetas-api.js`, confirmar no terminal a mensagem "etiquetas-api rodando na porta 3011", e testar `curl http://localhost:3011/health` → espera `{"ok":true}`.

- [ ] **Step 6: Commit**

```bash
git add etiquetas-api.js .env.etiquetas-api.example .gitignore package.json package-lock.json
git commit -m "feat: scaffold da API Etiquetas com autenticação por Firebase ID token"
```

---

### Task 4: API — endpoint de consulta de produto por código de barras

**Files:**
- Modify: `etiquetas-api.js`

**Interfaces:**
- Consumes: `verificarToken` (Task 3).
- Produces: `GET /produto/:codigoBarras` — usado pelas Tasks 6, 9 e 10.

- [ ] **Step 1: Adicionar a conexão MySQL e o endpoint**

Adicionar antes de `app.listen(...)`:

```js
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectTimeout: 15000
};

// Tabela confirmada via investigação de schema (supermercado.itens, chave
// nInterno) — é a que tem preço real e atualizado; central.itens existe
// mas está com 100% dos preços zerados (base legada), não usar.
app.get('/produto/:codigoBarras', verificarToken, async function(req, res) {
  var conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    var [rows] = await conn.query(
      'SELECT CodigoBarra, Descricao, preco, unvenda FROM supermercado.itens WHERE CodigoBarra = ? AND CodDesativado = 0 LIMIT 1',
      [req.params.codigoBarras]
    );
    if (!rows.length) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json({
      codigoBarras: rows[0].CodigoBarra,
      nome: rows[0].Descricao,
      preco: Number(rows[0].preco),
      unidade: rows[0].unvenda
    });
  } catch (e) {
    console.error('[etiquetas-api] erro MySQL:', e.code || e.message);
    res.status(503).json({ error: 'Erro ao consultar o ERP' });
  } finally {
    if (conn) await conn.end().catch(function(){});
  }
});
```

- [ ] **Step 2: Verificar manualmente**

Com a API rodando (Task 3 Step 5) e um token válido em mãos (pegar do DevTools do FC360 logado: `firebase.auth().currentUser.getIdToken().then(console.log)`), rodar:
```bash
curl -H "Authorization: Bearer SEU_TOKEN_AQUI" http://localhost:3011/produto/7891021001885
```
Esperado: `{"codigoBarras":"7891021001885","nome":"MELITTA FILTRO PAPEL 102","preco":5.69,"unidade":"UN"}` (valores confirmados reais na investigação de schema deste plano). Testar também com um código de barras inexistente → espera `404`, e sem header `Authorization` → espera `401`.

**Nota:** este teste só roda de verdade depois que a API estiver publicada dentro do servidor `.254` — não usar `.252` em nenhuma hipótese, nem pra teste local (decisão explícita do Tiago). `DB_HOST` fica sempre `192.168.2.254` no `.env.etiquetas-api`, inclusive em desenvolvimento; até lá, este step fica pendente de verificação (a Task 3 Step 5/Task 4 Step 1 já rodam sem erro de sintaxe, só a chamada real ao MySQL depende do deploy).

- [ ] **Step 3: Commit**

```bash
git add etiquetas-api.js
git commit -m "feat: endpoint de consulta de produto por código de barras"
```

---

### Task 5: Retaguarda — painel Etiquetas (scaffold + aba Layout)

**Files:**
- Modify: `index.html` (novo item de sidebar + `panel-etiquetas` com abas)
- Modify: `app.js` (`switchEtiquetasTab`, CRUD de `etiquetas_layout`)

**Interfaces:**
- Produces: `switchEtiquetasTab(tab, btn)`, usado pelas Tasks 6 e 7.

- [ ] **Step 1: Adicionar o item de sidebar em `index.html`**

Adicionar perto de `id="nav-central"` (`index.html:85-87`):
```html
      <div class="sb-item" id="nav-etiquetas" style="display:none" onclick="nav('etiquetas',this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M20.59 13.41L11 3.83V3h.01L20.59 12.59a2 2 0 010 2.82z"/><path d="M11 3H4a1 1 0 00-1 1v7l9.59 9.59a2 2 0 002.82 0l6.18-6.18a2 2 0 000-2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>
        Etiquetas
      </div>
```

- [ ] **Step 2: Remover o stub "Em breve" de Etiquetas**

Remover o bloco inteiro em `index.html:112-114`:
```html
      <div class="sb-item sb-item-embreve" id="nav-embreve-etiquetas" style="display:none" onclick="_avisoEmBreve('Etiquetas e Ofertas')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M20.59 13.41L11 3.83V3h.01L20.59 12.59a2 2 0 010 2.82z"/><path d="M11 3H4a1 1 0 00-1 1v7l9.59 9.59a2 2 0 002.82 0l6.18-6.18a2 2 0 000-2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>Etiquetas e Ofertas<span class="sb-item-embreve-pill">EM BREVE</span>
      </div>
```

- [ ] **Step 3: Adicionar o painel com abas em `index.html`**

Adicionar depois do fechamento do `modal-qr` de Promotores (depois de `index.html:590`, antes do comentário `<!-- RELATÓRIOS -->`):

```html
      <div id="panel-etiquetas" class="panel">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div><div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:18px;font-weight:700">Etiquetas</div><div style="font-size:13px;color:var(--t3);margin-top:2px">Layout, lotes e histórico de impressão</div></div>
        </div>
        <div class="tabs" id="etiquetas-tabs" style="margin-bottom:16px">
          <div class="tab on" onclick="switchEtiquetasTab('layout',this)">Layout</div>
          <div class="tab" onclick="switchEtiquetasTab('lotes',this)">Lotes</div>
          <div class="tab" onclick="switchEtiquetasTab('historico',this)">Histórico</div>
        </div>

        <div id="etiquetas-tab-layout">
          <div class="card" style="padding:16px;max-width:360px">
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><input type="checkbox" id="etl-campo-nome"> Nome do produto</label>
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><input type="checkbox" id="etl-campo-preco"> Preço</label>
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><input type="checkbox" id="etl-campo-codigoBarras"> Código de barras</label>
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:16px"><input type="checkbox" id="etl-campo-unidade"> Unidade</label>
            <button class="btn btn-p btn-sm" onclick="salvarEtiquetasLayout()">Salvar layout</button>
          </div>
        </div>

        <div id="etiquetas-tab-lotes" style="display:none">
          <div id="etiquetas-lotes-lista"></div>
        </div>

        <div id="etiquetas-tab-historico" style="display:none">
          <div id="etiquetas-historico-lista"></div>
        </div>
      </div>

```

- [ ] **Step 4: Adicionar `switchEtiquetasTab` e o CRUD de layout em `app.js`**

```js
function etiquetasLayoutDoc() {
  return db.collection('clientes').doc(S.clienteConfig.id).collection('etiquetas_layout').doc('padrao');
}

function switchEtiquetasTab(tab, btn) {
  document.getElementById('etiquetas-tab-layout').style.display = tab === 'layout' ? 'block' : 'none';
  document.getElementById('etiquetas-tab-lotes').style.display = tab === 'lotes' ? 'block' : 'none';
  document.getElementById('etiquetas-tab-historico').style.display = tab === 'historico' ? 'block' : 'none';
  document.querySelectorAll('#etiquetas-tabs .tab').forEach(function(t){t.classList.remove('on');});
  if (btn) btn.classList.add('on');
  if (tab === 'layout') carregarEtiquetasLayout();
  if (tab === 'lotes') renderEtiquetasLotes();
  if (tab === 'historico') renderEtiquetasHistorico();
}

function carregarEtiquetasLayout() {
  etiquetasLayoutDoc().get().then(function(doc) {
    var campos = (doc.exists && doc.data().campos) || {nome:true, preco:true, codigoBarras:true, unidade:false};
    ['nome','preco','codigoBarras','unidade'].forEach(function(c) {
      document.getElementById('etl-campo-'+c).checked = !!campos[c];
    });
  });
}

function salvarEtiquetasLayout() {
  var campos = {};
  ['nome','preco','codigoBarras','unidade'].forEach(function(c) {
    campos[c] = document.getElementById('etl-campo-'+c).checked;
  });
  etiquetasLayoutDoc().set({campos: campos, tamanhoEtiqueta: '72mm', ativo: true}).then(function() {
    showToast('✅ Layout salvo!');
  });
}
```

- [ ] **Step 5: Adicionar a rota em `nav()`**

Adicionar dentro de `nav()` (`app.js`, perto do bloco `if (page==='central') { ... }`):
```js
  if (page === 'etiquetas') {
    switchEtiquetasTab('layout', document.querySelector('#etiquetas-tabs .tab'));
  }
```

- [ ] **Step 6: Adicionar `etiquetas` em `PAGE_TITLES`**

Em `app.js:1817-1823`, adicionar `etiquetas:'Etiquetas',` à lista.

- [ ] **Step 7: Verificar manualmente**

Chamar `nav('etiquetas')` pelo console (a navegação pela capa só liga na Task 11). Marcar/desmarcar campos, salvar, recarregar a página e reabrir a aba Layout — os checkboxes devem manter o estado salvo. Confirmar no Firestore Console que o doc `clientes/fluxocerto/etiquetas_layout/padrao` foi criado com o campo `campos`.

- [ ] **Step 8: Commit**

```bash
git add index.html app.js
git commit -m "feat: painel Etiquetas com aba de configuração de layout"
```

---

### Task 6: Retaguarda — aba Lotes

**Files:**
- Modify: `index.html` (modal de montagem de lote)
- Modify: `app.js` (`renderEtiquetasLotes`, `abrirModalNovoLote`, funções de busca/adicionar item, `salvarLote`)

**Interfaces:**
- Consumes: `switchEtiquetasTab` (Task 5), `GET /produto/:codigoBarras` (Task 4).
- Produces: coleção `etiquetas_lote`, consumida pela Task 10 (fluxo mobile).

- [ ] **Step 1: Adicionar o modal de montagem de lote em `index.html`**

Adicionar depois do fechamento de `panel-etiquetas` (final da Task 5 Step 3):

```html
      <div class="modal-bg" id="modal-lote" style="display:none">
        <div class="modal-box" style="width:460px">
          <div class="modal-title">Novo lote de etiquetas</div>
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <input id="lote-busca-codigo" placeholder="Código de barras" style="flex:1">
            <button class="btn btn-s btn-sm" onclick="buscarProdutoParaLote()">Buscar</button>
          </div>
          <div id="lote-busca-erro" style="color:#b91c1c;font-size:12px;margin-bottom:8px;display:none"></div>
          <div id="lote-itens-lista" style="max-height:240px;overflow-y:auto;margin-bottom:12px"></div>
          <div class="btn-row">
            <button class="btn btn-p" onclick="salvarLote()">Salvar lote</button>
            <button class="btn btn-s" onclick="document.getElementById('modal-lote').style.display='none'">Cancelar</button>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Adicionar as funções em `app.js`**

```js
var _loteItensAtual = [];

function etiquetasLoteCol() {
  return db.collection('clientes').doc(S.clienteConfig.id).collection('etiquetas_lote');
}

function abrirModalNovoLote() {
  _loteItensAtual = [];
  document.getElementById('lote-busca-codigo').value = '';
  document.getElementById('lote-busca-erro').style.display = 'none';
  renderLoteItensLista();
  document.getElementById('modal-lote').style.display = 'flex';
}

function buscarProdutoParaLote() {
  var codigo = document.getElementById('lote-busca-codigo').value.trim();
  var erroEl = document.getElementById('lote-busca-erro');
  erroEl.style.display = 'none';
  if (!codigo) return;
  firebase.auth().currentUser.getIdToken().then(function(token) {
    return fetch(ETIQUETAS_API_URL + '/produto/' + encodeURIComponent(codigo), {
      headers: {Authorization: 'Bearer ' + token}
    });
  }).then(function(resp) {
    if (resp.status === 404) throw new Error('Produto não encontrado.');
    if (!resp.ok) throw new Error('Erro ao consultar o ERP.');
    return resp.json();
  }).then(function(produto) {
    _loteItensAtual.push({codigoBarras: produto.codigoBarras, nomeProduto: produto.nome, qtdEtiquetas: 1});
    document.getElementById('lote-busca-codigo').value = '';
    renderLoteItensLista();
  }).catch(function(e) {
    erroEl.textContent = e.message;
    erroEl.style.display = 'block';
  });
}

function renderLoteItensLista() {
  var wrap = document.getElementById('lote-itens-lista');
  if (!_loteItensAtual.length) { wrap.innerHTML = '<div class="empty">Nenhum item adicionado ainda.</div>'; return; }
  wrap.innerHTML = _loteItensAtual.map(function(item, i) {
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--bd)">'
      + '<div style="flex:1;font-size:13px">' + item.nomeProduto + '</div>'
      + '<input type="number" min="1" value="' + item.qtdEtiquetas + '" style="width:60px" onchange="_loteItensAtual[' + i + '].qtdEtiquetas=parseInt(this.value)||1">'
      + '<button class="btn btn-d btn-sm" onclick="_loteItensAtual.splice(' + i + ',1);renderLoteItensLista()">Remover</button>'
      + '</div>';
  }).join('');
}

function salvarLote() {
  if (!_loteItensAtual.length) { showToast('Adicione ao menos um item.'); return; }
  etiquetasLoteCol().add({
    criadoPor: S.currentUser ? S.currentUser.nome : '-',
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    status: 'pendente',
    itens: _loteItensAtual
  }).then(function() {
    document.getElementById('modal-lote').style.display = 'none';
    renderEtiquetasLotes();
    showToast('✅ Lote criado!');
  });
}

function renderEtiquetasLotes() {
  var wrap = document.getElementById('etiquetas-lotes-lista');
  wrap.innerHTML = '<button class="btn btn-p btn-sm" style="margin-bottom:14px" onclick="abrirModalNovoLote()">+ Novo Lote</button><div id="etiquetas-lotes-tabela"><div class="empty">Carregando...</div></div>';
  etiquetasLoteCol().orderBy('criadoEm', 'desc').limit(50).get().then(function(snap) {
    var tabela = document.getElementById('etiquetas-lotes-tabela');
    if (snap.empty) { tabela.innerHTML = '<div class="empty">Nenhum lote criado ainda.</div>'; return; }
    tabela.innerHTML = '<table class="tbl"><thead><tr><th>Criado em</th><th>Itens</th><th>Status</th></tr></thead><tbody>'
      + snap.docs.map(function(d) {
        var l = d.data();
        var dt = l.criadoEm && l.criadoEm.toDate ? l.criadoEm.toDate().toLocaleString('pt-BR') : '-';
        var st = l.status === 'concluido' ? '<span class="st st-ok">Concluído</span>' : '<span class="st st-warn">Pendente</span>';
        return '<tr><td>' + dt + '</td><td>' + (l.itens||[]).length + '</td><td>' + st + '</td></tr>';
      }).join('')
      + '</tbody></table>';
  });
}
```

- [ ] **Step 3: Declarar a URL da API**

Adicionar perto do topo de `app.js` (junto de outras constantes globais, logo após `var BUILD = '306';`):
```js
var ETIQUETAS_API_URL = 'https://etiquetas-api.SEU-DOMINIO-AQUI.com'; // ajustar quando a API estiver publicada no .254
```

- [ ] **Step 4: Verificar manualmente**

Com a API da Task 4 rodando localmente (ajustar `ETIQUETAS_API_URL` para `http://localhost:3011` durante o teste), abrir a aba Lotes, clicar "+ Novo Lote", buscar um código de barras real (ex: `7891021001885`), confirmar que aparece na lista com nome do produto, ajustar quantidade, salvar. Confirmar que o lote aparece na tabela com status "Pendente" e no Firestore em `clientes/fluxocerto/etiquetas_lote`.

- [ ] **Step 5: Commit**

```bash
git add index.html app.js
git commit -m "feat: montagem de lotes de etiquetas na retaguarda"
```

---

### Task 7: Retaguarda — aba Histórico

**Files:**
- Modify: `app.js` (`renderEtiquetasHistorico`)

**Interfaces:**
- Consumes: coleção `etiquetas_log` (escrita pelas Tasks 9 e 10).

- [ ] **Step 1: Adicionar a função de listagem**

```js
function renderEtiquetasHistorico() {
  var wrap = document.getElementById('etiquetas-historico-lista');
  wrap.innerHTML = '<div class="empty">Carregando...</div>';
  db.collection('clientes').doc(S.clienteConfig.id).collection('etiquetas_log')
    .orderBy('timestamp', 'desc').limit(100).get().then(function(snap) {
      if (snap.empty) { wrap.innerHTML = '<div class="empty">Nenhuma impressão registrada ainda.</div>'; return; }
      wrap.innerHTML = '<table class="tbl"><thead><tr><th>Produto</th><th>Preço impresso</th><th>Origem</th><th>Operador</th><th>Data</th></tr></thead><tbody>'
        + snap.docs.map(function(d) {
          var l = d.data();
          var dt = l.timestamp && l.timestamp.toDate ? l.timestamp.toDate().toLocaleString('pt-BR') : '-';
          return '<tr><td>' + l.nomeProduto + '</td><td>R$ ' + Number(l.precoImpresso).toFixed(2) + '</td><td>' + (l.origem === 'lote' ? 'Lote' : 'Pontual') + '</td><td>' + l.operadorNome + '</td><td>' + dt + '</td></tr>';
        }).join('')
        + '</tbody></table>';
    }).catch(function(e) {
      wrap.innerHTML = '<div class="empty">Erro ao carregar: ' + e.message + '</div>';
    });
}
```

- [ ] **Step 2: Verificar manualmente**

Só é possível testar de ponta a ponta depois da Task 9 (que grava em `etiquetas_log`) — por enquanto, criar manualmente um doc de teste em `clientes/fluxocerto/etiquetas_log` pelo Console do Firebase com os campos esperados (`nomeProduto`, `precoImpresso`, `origem`, `operadorNome`, `timestamp`) e confirmar que aparece formatado corretamente na aba Histórico.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: histórico de impressões de etiquetas"
```

---

### Task 8: Mobile — página Etiquetas (coleta): scaffold + pareamento + rotina de impressão

**Files:**
- Modify: `index.html` (`panel-etiquetas-coleta`)
- Modify: `app.js` (pareamento Bluetooth, `montarComandoTSPL`, `imprimirEtiquetaBluetooth`)

**Interfaces:**
- Consumes: UUID de serviço/característica confirmado na Task 1.
- Produces: `imprimirEtiquetaBluetooth(produto)` (Promise), usado pelas Tasks 9 e 10.

**Antes de começar esta task:** substituir os UUIDs candidatos abaixo pelo UUID real confirmado na Task 1 Step 2. O código abaixo assume que o candidato `49535343-fe7d-4ae5-8fa9-9fafd205e455` (ISSC transparent UART) funcionou — se a Task 1 confirmar um UUID diferente, usar esse.

- [ ] **Step 1: Adicionar o painel em `index.html`**

Adicionar no mesmo bloco de páginas mobile (perto de `panel-inv-coleta`):

```html
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
      </div>
```

- [ ] **Step 2: Adicionar pareamento e rotina de impressão em `app.js`**

```js
var _etcDevice = null, _etcGattServer = null, _etcWriteChar = null;

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
}

// Monta o comando TSPL de acordo com o layout salvo pelo cliente (Task 5).
function montarComandoTSPL(produto, layout) {
  var campos = (layout && layout.campos) || {nome:true, preco:true, codigoBarras:true, unidade:false};
  var y = 20;
  var linhas = ['SIZE 72 mm,40 mm', 'GAP 2 mm,0', 'CLS'];
  if (campos.nome) { linhas.push('TEXT 20,' + y + ',"3",0,1,1,"' + produto.nome.substring(0,32) + '"'); y += 40; }
  if (campos.preco) { linhas.push('TEXT 20,' + y + ',"4",0,1,1,"R$ ' + Number(produto.preco).toFixed(2) + '"'); y += 50; }
  if (campos.codigoBarras) { linhas.push('BARCODE 20,' + y + ',"128",60,1,0,2,2,"' + produto.codigoBarras + '"'); y += 80; }
  if (campos.unidade) { linhas.push('TEXT 20,' + y + ',"2",0,1,1,"UN: ' + produto.unidade + '"'); }
  linhas.push('PRINT 1,1');
  return linhas.join('\r\n') + '\r\n';
}

function imprimirEtiquetaBluetooth(produto) {
  if (!_etcWriteChar) return Promise.reject(new Error('Impressora não conectada.'));
  return etiquetasLayoutDoc().get().then(function(doc) {
    var layout = doc.exists ? doc.data() : null;
    var tspl = montarComandoTSPL(produto, layout);
    var bytes = new TextEncoder().encode(tspl);
    return _etcWriteChar.writeValue(bytes);
  });
}
```

- [ ] **Step 3: Verificar manualmente**

Com o K329 ligado, abrir a página (`nav('etiquetas-coleta')` pelo console, já que a capa só liga na Task 11), clicar "Conectar na impressora", confirmar que o status muda pra "✅ Conectado". No console do navegador, rodar `imprimirEtiquetaBluetooth({nome:'TESTE', preco:9.9, codigoBarras:'123', unidade:'UN'})` e confirmar que uma etiqueta sai da impressora com os dados corretos.

- [ ] **Step 4: Commit**

```bash
git add index.html app.js
git commit -m "feat: pareamento Bluetooth e rotina de impressão TSPL para o K329"
```

---

### Task 9: Mobile — fluxo correção pontual

**Files:**
- Modify: `index.html` (`etc-tab-pontual` scaffold, movido pra dentro de `switchEtcTab`)
- Modify: `app.js` (`renderEtcPontual`, busca por código, prévia, confirmação de impressão)

**Interfaces:**
- Consumes: `imprimirEtiquetaBluetooth` (Task 8), `GET /produto/:codigoBarras` (Task 4).
- Produces: escreve em `etiquetas_log` com `origem:'pontual'`.

- [ ] **Step 1: Adicionar `renderEtcPontual` em `app.js`**

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
    preview.innerHTML =
      '<div class="card" style="padding:16px">' +
        '<div style="font-weight:700;margin-bottom:4px">' + produto.nome + '</div>' +
        '<div style="font-size:20px;color:var(--pri);font-weight:800;margin-bottom:12px">R$ ' + produto.preco.toFixed(2) + '</div>' +
        '<button class="btn btn-p" style="width:100%" onclick="confirmarImpressaoPontual(' + JSON.stringify(produto).replace(/"/g,'&quot;') + ')">Imprimir etiqueta</button>' +
      '</div>';
  }).catch(function(e) {
    preview.innerHTML = '<div class="empty">' + e.message + '</div>';
  });
}

function confirmarImpressaoPontual(produto) {
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
    });
  }).then(function() {
    showToast('✅ Etiqueta impressa!');
    document.getElementById('etc-input-codigo').value = '';
    document.getElementById('etc-preview').innerHTML = '';
    document.getElementById('etc-input-codigo').focus();
  }).catch(function(e) {
    showToast('❌ Erro ao imprimir: ' + e.message);
  });
}
```

- [ ] **Step 2: Ligar em `switchEtcTab`**

Em `app.js`, dentro de `switchEtcTab` (Task 8 Step 2), adicionar ao final da função:
```js
  if (tab === 'pontual') renderEtcPontual();
```

- [ ] **Step 3: Verificar manualmente**

Com impressora conectada (Task 8), abrir a aba "Correção Pontual", digitar/bipar um código de barras real (ex: `7891021001885`), aguardar ~1s, confirmar que a prévia mostra nome e preço corretos. Clicar "Imprimir etiqueta", confirmar que a etiqueta sai da impressora e que um novo documento aparece em `etiquetas_log` com `origem:'pontual'`. Testar também com código inexistente → mensagem "Produto não encontrado" sem travar a tela.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: fluxo de correção pontual (scan, prévia, impressão, log)"
```

---

### Task 10: Mobile — fluxo lote

**Files:**
- Modify: `app.js` (`renderEtcLotes`, resolver preços, fila de impressão)

**Interfaces:**
- Consumes: `etiquetas_lote` (Task 6), `imprimirEtiquetaBluetooth` (Task 8).
- Produces: atualiza `etiquetas_lote.status` para `concluido`, escreve em `etiquetas_log` com `origem:'lote'`.

- [ ] **Step 1: Adicionar `renderEtcLotes`**

```js
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
    });
}

var _loteAtualId = null, _loteAtualFila = [];

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
    });
}

function renderFilaLote() {
  var wrap = document.getElementById('etc-tab-lotes');
  if (!_loteAtualFila.length) {
    wrap.innerHTML = '<div class="empty">Fila vazia ou todos os produtos falharam ao resolver.</div><button class="btn btn-s btn-sm" onclick="renderEtcLotes()">Voltar</button>';
    return;
  }
  wrap.innerHTML = '<div style="margin-bottom:10px">Restam ' + _loteAtualFila.length + ' etiquetas.</div>' +
    '<button class="btn btn-p" style="width:100%" onclick="imprimirProximoDaFila()">Imprimir próxima</button>';
}

function imprimirProximoDaFila() {
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
    });
  }).then(function() {
    _loteAtualFila.shift();
    if (!_loteAtualFila.length) {
      return db.collection('clientes').doc(S.clienteConfig.id).collection('etiquetas_lote').doc(_loteAtualId)
        .update({status: 'concluido'}).then(function() {
          showToast('✅ Lote concluído!');
          renderEtcLotes();
        });
    }
    renderFilaLote();
  }).catch(function(e) {
    showToast('❌ Erro ao imprimir: ' + e.message + ' (fila mantida, tente de novo)');
  });
}
```

- [ ] **Step 2: Ligar em `switchEtcTab`**

Em `app.js`, dentro de `switchEtcTab` (Task 8 Step 2), adicionar:
```js
  if (tab === 'lotes') renderEtcLotes();
```

- [ ] **Step 3: Verificar manualmente**

Com um lote pendente criado na Task 6, abrir a aba "Lotes Pendentes", confirmar que aparece com a contagem certa de itens. Clicar "Abrir", confirmar que resolve os preços e mostra a fila. Imprimir item a item até esvaziar a fila, confirmar que o lote muda para "Concluído" na retaguarda (Task 6) e que cada etiqueta impressa virou uma entrada em `etiquetas_log` com `origem:'lote'` e o `loteId` certo (Task 7). Desconectar o Bluetooth no meio da fila (desligar a impressora) e confirmar que a fila não perde os itens restantes — só mostra o erro e mantém a mesma quantidade pra tentar de novo.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: fluxo de impressão em lote (resolver preços, fila, conclusão)"
```

---

### Task 11: Ligar card na capa, roles, MODS e BUILD

**Files:**
- Modify: `app.js:1003-1004` (entrada `etiquetas` em `CAPA_MODULOS`)
- Modify: `app.js` (`setupRole`, perto de `app.js:1711` e `app.js:1732`)
- Modify: `app.js:7761-7762,7938-7939,7975,7995-7996,8026` (arrays `MODS`/`MODS_LABEL`)
- Modify: `app.js:2`, `sw.js:3`, `sw.js:11-12`, `index.html:20,1914`, `version.json`

**Interfaces:**
- Consumes: `_capaEstado`, `roleOk` (padrão já existente).

- [ ] **Step 1: Atualizar a entrada `etiquetas` em `CAPA_MODULOS`**

Trocar (`app.js:1003-1004`):
```js
  { id:'etiquetas', label:'Etiquetas e Ofertas', desenvolvido:false,
    icone:'<path d="M20.59 13.41L11 3.83V3h.01L20.59 12.59a2 2 0 010 2.82z"/><path d="M11 3H4a1 1 0 00-1 1v7l9.59 9.59a2 2 0 002.82 0l6.18-6.18a2 2 0 000-2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/>' }
```
por:
```js
  { id:'etiquetas', label:'Etiquetas', desenvolvido:true, moduloChave:'etiquetas',
    // Correção pontual/lote é um fluxo de chão de loja: aberto pra qualquer
    // perfil operacional, não só admin/supervisor (diferente de 'central').
    roleOk: function(){ return true; },
    page: function(){ return (S.role==='admin' || S.role==='supervisor') ? 'etiquetas' : 'etiquetas-coleta'; },
    icone:'<path d="M20.59 13.41L11 3.83V3h.01L20.59 12.59a2 2 0 010 2.82z"/><path d="M11 3H4a1 1 0 00-1 1v7l9.59 9.59a2 2 0 002.82 0l6.18-6.18a2 2 0 000-2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/>' }
```

- [ ] **Step 2: Ligar visibilidade do item de sidebar em `setupRole`**

Adicionar perto de `show('nav-central', ...)` (`app.js:1711`):
```js
  show('nav-etiquetas', (isAdmin || isSup) && !isColetor && _moduloAtivo('etiquetas'));
```

Remover a linha `show('nav-embreve-etiquetas', mostrarEmBreve);` (`app.js:1732`), já que o stub foi removido na Task 5.

- [ ] **Step 3: Adicionar `etiquetas`/`etiquetas-coleta` no roteamento de `nav()`**

Perto do bloco `if (page==='central') { ... }`, adicionar (a rota `etiquetas` já foi adicionada na Task 5 Step 5 — só falta a de coleta):
```js
  if (page === 'etiquetas-coleta') {
    // Nada a carregar aqui: o próprio botão "Conectar na impressora"
    // (Task 8) dispara o resto do fluxo depois que o operador conecta.
  }
```

- [ ] **Step 4: Adicionar `etiquetas` no mapa de módulos do cliente**

Em cada um dos 5 arrays `MODS`/`MODS_LABEL` (`app.js:7761-7762`, `7938-7939`, `7975`, `7995-7996`, `8026`), adicionar `'etiquetas'` à lista `MODS` e `etiquetas:'Etiquetas'` aos `MODS_LABEL` correspondentes. Exemplo pra `app.js:7761-7762`:
```js
  var MODS = ['checklist','inventario','planos_acao','relatorios','central','monitor','assistente_ia','etiquetas'];
  var MODS_LABEL = {checklist:'Checklist',inventario:'Inventário',planos_acao:'Planos',alertas:'Alertas',relatorios:'Relatórios',central:'Central',monitor:'Monitor',assistente_ia:'IA',etiquetas:'Etiquetas'};
```
Aplicar o mesmo padrão (adicionar `'etiquetas'`/`etiquetas:'Etiquetas'`) nos outros 4 pontos. Depois do deploy, ativar manualmente `etiquetas: true` no plano do tenant `fluxocerto` pelo painel "Editar Cliente" (não precisa de código extra — `_moduloAtivo` já trata "não definido" como ativo).

- [ ] **Step 5: Bump de BUILD nos 6 lugares**

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
<!-- index.html linha 20 -->
<link rel="stylesheet" href="style.css?v=307"/>
<!-- index.html linha 1914 -->
<script src="app.js?v=307" defer></script>
```
```json
{"build":"307"}
```

- [ ] **Step 6: Verificar manualmente**

Logar como admin no tenant `fluxocerto`, confirmar que o card "Etiquetas" na capa aparece amarelo (não mais "Em breve") e abre o painel retaguarda (Layout/Lotes/Histórico). Logar como Operador (ou outro perfil não-admin/supervisor), confirmar que o mesmo card abre a tela de coleta (pareamento + scan) em vez da retaguarda.

- [ ] **Step 7: Commit**

```bash
git add app.js sw.js index.html version.json
git commit -m "feat: ativa o módulo Etiquetas na capa e faz bump de BUILD"
```

---

## Self-review notes

- Cobertura da spec: §1/§2 (objetivo/escopo) → Tasks 8-10; §3 (risco Bluetooth) → Task 1, referenciada como pré-requisito da Task 8; §4 (arquitetura) → Tasks 3-4 (API) + Tasks 8-10 (Bluetooth); §5/§6 (fluxos mobile) → Tasks 8-10; §7 (modelo de dados) → Task 2 (rules) + Tasks 5-7/9-10 (escrita real dos campos); §8 (retaguarda) → Tasks 5-7; §9 (API/auth/erros) → Tasks 3-4 (404/503/token tratados; debounce de bipagem tratado na Task 9 Step 1 com `setTimeout` de 1s); §10 (testes) → passo de verificação manual em cada task.
- Divergência descoberta durante o plano (não estava na spec original): host do MySQL e tabela real de produto/preço — documentada nas Global Constraints, spec não precisa ser reaberta porque a divergência é de infraestrutura/schema, não de arquitetura de produto.
- Fallback nativo Android (TWA) citado na spec §3 não tem task própria aqui — só entra em jogo se a Task 1 falhar, e nesse caso vira uma spec nova antes de continuar (conforme já decidido no design).