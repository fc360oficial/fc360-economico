// etiquetas-api.js — serviço isolado, processo separado de server.js.
// Só faz SELECT no MySQL do ERP (nunca INSERT/UPDATE/DELETE).
require('dotenv').config({ path: '.env.etiquetas-api' });
const express = require('express');
const admin = require('firebase-admin');
const mysql = require('mysql2/promise');

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
