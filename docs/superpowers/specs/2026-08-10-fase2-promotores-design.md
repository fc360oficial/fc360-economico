# Fase 2 — Módulo Promotores (design)

**Data:** 2026-08-10
**Contexto:** Fase 2 do roadmap FC360 ([[2026-08-05-fase1-capa-modulos-apk-design]]) migra Promotores e Pesquisa Concorrentes do Fluxo Radar (React/Vite + Supabase, `C:\Users\tiago\OneDrive\Documentos\fluxo radar`) para dentro do FC360 (vanilla JS + Firebase, `C:\Users\tiago\OneDrive\Documentos\claude_code_`). Este documento cobre só **Promotores**. Pesquisa Concorrentes e a blindagem Firestore geral (fora das duas coleções deste módulo) ficam para specs próprias.

Não é um port de código — Radar usa Postgres/Supabase Auth, FC360 usa Firestore/Firebase Auth com particionamento por `clienteId`. Só a lógica de produto é reaproveitada, e mesmo essa parcialmente: o Radar deixou a função de check-in incompleta (link de QR morto, sem página de destino) e com uma pequena inconsistência de modelo — as funções `checkIn(id)`/`checkOut(id)` do Radar atualizam uma visita pré-agendada por id, mas o Radar nunca chegou a construir o fluxo de agendamento nem a tela pública que chamaria isso. O FC360 não repete esse modelo: aqui o próprio promotor cria a visita na hora do check-in (ver seção 3).

## 1. Objetivo

Controlar visitas de promotores/repositores (funcionários de fornecedores, não usuários do FC360) às lojas, via check-in/check-out por QR code, sem exigir login do promotor.

## 2. Escopo v1

**Dentro:**
- Cadastro de fornecedores esperados por loja (nome, lojas atendidas, dias da semana esperados).
- Geração de QR code por loja (aponta para a página pública de check-in).
- Check-in/check-out público: promotor escaneia o QR, escolhe o fornecedor numa lista (só os cadastrados para aquela loja), digita o nome, e o check-in é registrado com GPS. Escaneia de novo no fim da visita para dar check-out (mesma sessão do navegador identifica que já tem visita em aberto).
- Lista/histórico de visitas por loja, com filtro por fornecedor/data — visível para Admin e Supervisor.

**Fora (v2 ou não decidido):**
- Rankings (compliance por fornecedor, por loja, pontualidade do promotor).
- Notificação de atraso/ausência.
- Edição ou exclusão de visita já fechada.
- Modelo de visita pré-agendada (o Radar sugeria isso mas nunca implementou; ficou descartado — ver seção 3).

## 3. Modelo de dados (Firestore)

Nasce direto no padrão novo de particionamento por cliente, conforme decisão da Fase 1:

```
clientes/{clienteId}/
  fornecedores/{fornecedorId}
    nome: string
    ativo: boolean
    lojas: string[]           // ids das lojas atendidas
    diasSemana: number[]      // 0-6, dias esperados de visita (informativo, sem alerta automático em v1)

  promotor_visitas/{visitaId}
    fornecedorId: string
    fornecedorNome: string     // cópia, evita join na leitura pública
    lojaId: string
    lojaNome: string
    promotorNome: string       // texto digitado no check-in, sem cadastro prévio da pessoa
    sessionUid: string         // uid do Firebase Auth anônimo da sessão que fez o check-in
    checkInEm: timestamp
    checkInGeo: {lat: number, lng: number} | null
    checkOutEm: timestamp | null
    checkOutGeo: {lat: number, lng: number} | null
```

A visita é criada pelo próprio check-in (não existe pré-agendamento em v1). "Em aberto" = `checkOutEm == null`.

## 4. Autenticação do check-in público

A página de check-in (`checkin.html`) não pede login, mas também não deixa a escrita totalmente anônima e sem controle:

- Ao carregar, chama `firebase.auth().signInAnonymously()` de forma transparente (sem UI), obtendo um `uid` temporário.
- Security Rules exigem `request.auth != null` (aceita anônimo) para `create`/`update` em `promotor_visitas`, e validam que `sessionUid` do documento bate com `request.auth.uid`.
- Check-out: a página consulta `promotor_visitas` filtrando por `sessionUid == auth.currentUser.uid AND checkOutEm == null`. Se achar, mostra a tela de saída em vez do formulário de entrada — funciona porque o Firebase persiste a sessão anônima no mesmo navegador/celular entre uma visita e outra.
- Sem custo extra (login anônimo é gratuito, não exige plano Blaze do Firebase — diferente da alternativa de Cloud Function, que foi descartada por isso).

## 5. Telas

**Dentro do FC360 (logado):**
- Card "Promotores" sai de "Em breve" (`desenvolvido:true`) na capa mobile, visível para Admin e Supervisor (mesmo padrão de `roleOk` já usado pelos outros módulos).
- Tela com duas abas:
  - **Fornecedores**: lista + formulário (nome, lojas, dias esperados) + botão para gerar/baixar/imprimir o QR de cada loja.
  - **Visitas**: lista/histórico com filtro por loja, fornecedor e data; mostra check-in, check-out (ou "em aberto") e duração.

**Página pública (`checkin.html`, fora do app principal — sem sidebar, sem exigir login):**
- URL: `checkin.html?c={clienteId}&l={lojaId}`.
- Mostra o nome da loja (lido via `clientes/{clienteId}` e `lojaId`).
- Sem visita em aberto nessa sessão: formulário com select de fornecedor (só os cadastrados para essa loja) + campo nome + botão "Registrar entrada" (captura GPS ao enviar).
- Com visita em aberto: "Você está em: {loja} desde {hora}" + botão "Registrar saída".

## 6. Riscos e observações

- GPS pode ser negado pelo navegador do promotor — o check-in não deve travar por isso, só grava `null` no campo geo e segue.
- `sessionUid` amarrado ao navegador quebra o check-out se o promotor trocar de celular/navegador no meio da visita (ex: limpou dados do Chrome) — aceito como limitação de v1, contorno manual seria o Admin fechar a visita manualmente na aba Visitas (não coberto ainda, avaliar se vira parte do v1 ou v2 durante o plano de implementação).
- Como é o primeiro módulo a nascer no padrão `clientes/{clienteId}/...`, as Security Rules dessas duas coleções são o primeiro exemplar real da blindagem Firestore da Fase 1 — vale revisar com atenção redobrada por ser precedente.
