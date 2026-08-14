// etiquetas-api.js — serviço isolado, processo separado de server.js.
// Só faz SELECT no MySQL do ERP (nunca INSERT/UPDATE/DELETE).
require('dotenv').config({ path: '.env.etiquetas-api' });
const express = require('express');
const cors = require('cors');
// firebase-admin ^14 usa a API modular (sem o namespace admin.auth()/
// admin.firestore()/admin.credential.cert() das versões antigas).
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const mysql = require('mysql2/promise');

initializeApp({
  credential: cert(require(process.env.GOOGLE_APPLICATION_CREDENTIALS))
});
const firestore = getFirestore();

const app = express();

// O FC360 PWA é servido do GitHub Pages (fc360oficial.github.io), origem
// diferente desta API — o browser manda preflight OPTIONS em toda chamada
// autenticada (header Authorization), e sem CORS o Express responde 404,
// quebrando o fetch() no app. ALLOWED_ORIGIN deve ser configurado por
// deploy com a(s) origem(ns) real(is) do FC360 em produção — NUNCA usar
// origin:'*' aqui porque o endpoint é autenticado. Aceita uma lista
// separada por vírgula para suportar múltiplas origens (ex.: produção +
// homologação).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || 'https://fc360oficial.github.io')
  .split(',').map(function(o) { return o.trim(); }).filter(Boolean);
app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET'],
  allowedHeaders: ['Authorization', 'Content-Type']
}));

// Verifica o Firebase ID token do operador já logado no FC360, e resolve
// o clienteId do usuário consultando a mesma coleção `usuarios` que o
// app.js usa (finalizarLogin, app.js:1285) — não existe custom claim de
// clienteId no token ainda, então a busca é por e-mail, igual ao app.
// v1 deste módulo é escopo único-tenant (Econômico) — ver spec §9: extrai
// clienteId do usuário para evitar expor consulta de preço do ERP sem
// controle. Por isso não há fallback silencioso para 'economico': um
// clienteId ausente/desconhecido é rejeitado, não tratado como Econômico.
async function verificarToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    const decoded = await getAuth().verifyIdToken(token);
    const snap = await firestore.collection('usuarios')
      .where('email', '==', (decoded.email || '').toLowerCase())
      .limit(1).get();
    if (snap.empty) return res.status(403).json({ error: 'Usuário não encontrado' });
    req.clienteId = snap.docs[0].data().clienteId;
    if (req.clienteId !== 'economico') {
      return res.status(403).json({ error: 'Módulo não habilitado para este cliente' });
    }
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token inválido: ' + e.message });
  }
}

app.get('/health', (req, res) => res.json({ ok: true }));

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

const PORT = process.env.PORT || 3011;
app.listen(PORT, () => console.log('etiquetas-api rodando na porta ' + PORT));

module.exports = { app, verificarToken };
