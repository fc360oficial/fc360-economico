# Fase 4 — Módulo Etiquetas (design)

**Data:** 2026-08-13
**Contexto:** Fase 4 do roadmap FC360 ([[2026-08-05-fase1-capa-modulos-apk-design]]) traz o módulo Etiquetas, hoje listado como "em breve" na capa de módulos. Origem da ideia: impressora portátil Bluetooth Urovo K329 (72mm, térmica direta, 203dpi) usada por operador andando na loja para reimprimir etiqueta de preço na hora — mesmo modelo de fluxo usado por redes de varejo (foto de referência: funcionário com coletor + impressora na cintura corrigindo "preço errado ou faltando na gôndola").

Este documento cobre só o módulo Etiquetas. Não inclui migração de outros módulos nem mudanças em módulos existentes.

## 1. Objetivo

Permitir que um operador ande pela loja com um coletor Urovo K329 e:
1. Bipe o código de barras de um produto e reimprima a etiqueta de preço na hora (correção pontual).
2. Imprima uma fila de etiquetas pré-montada na retaguarda (lote — reabastecimento, produto novo, troca de tabela de preço).

O preço/dados do produto vêm de uma consulta nova ao ERP do cliente (v1: só Econômico, MySQL em `192.168.2.254`, somente leitura).

## 2. Escopo v1

**Dentro:**
- Módulo mobile "Etiquetas" na capa do FC360, com dois modos: correção pontual e lote.
- Impressão via Web Bluetooth (`navigator.bluetooth`) direto do PWA — sem código nativo Android.
- API nova, isolada, rodando no servidor `.254` (ao lado de CAHU Delivery e Econômico Relatórios, sem tocar nesses dois), que consulta o MySQL do ERP por código de barras e devolve nome/preço/unidade. Autenticada com o mesmo Firebase ID token do FC360.
- Retaguarda: configuração de layout da etiqueta (quais campos aparecem), montagem de listas de lote, histórico/log de impressões (pontual + lote no mesmo log).
- Modelo de dados em `clientes/{clienteId}/...` (subcoleção, já no padrão novo pós-blindagem — não usa coleção global).

**Fora (v2 ou não decidido):**
- Suporte a outro ERP além do MySQL do Econômico — v1 não tem camada de configuração/mapeamento por cliente; a consulta é escrita direto para o schema desse ERP. Generalizar para "qualquer ERP" fica para quando houver um segundo cliente real precisando.
- Suporte a outro modelo de impressora além do K329 (tamanho de etiqueta fixo em 72mm).
- Múltiplos layouts de etiqueta por produto/categoria — v1 é um layout único por cliente.
- Alertas automáticos de produtos sem etiqueta ou desatualizados — v1 é sempre iniciado manualmente pelo operador ou pela retaguarda.

## 3. Risco técnico e ordem de implementação

O maior risco do projeto é técnico, não de produto: **não está confirmado que o K329 aceita comando de impressão bruto (ESC-POS/TSPL) via Bluetooth sem exigir o SDK proprietário Android da Urovo.** Web Bluetooth só fala com dispositivos que expõem esse tipo de serviço GATT abertamente.

Por isso, a primeira etapa do plano de implementação deve ser um teste isolado — sem nenhuma dependência do resto do design — de conectar via `navigator.bluetooth.requestDevice()` no K329 e mandar um comando de impressão simples. Só depois de confirmar isso é que faz sentido construir a API, a retaguarda e o restante do fluxo mobile.

**Fallback caso Web Bluetooth não funcione:** ponte nativa Android dentro do wrapper TWA que já está no roadmap (Fase 1) — um `JavascriptInterface` exposto pro JS da PWA, que por trás fala com o SDK da Urovo. Não está detalhado neste documento; se o teste de Web Bluetooth falhar, esse fallback vira uma spec própria antes de continuar.

## 4. Arquitetura

```
[Coletor Urovo K329 com FC360 PWA/TWA]
        |
        |  1. Bipagem de código de barras (input focado, coletor injeta como teclado)
        |  2. fetch() HTTPS com Firebase ID token
        v
[API "Etiquetas" — servidor .254, serviço novo e isolado]
        |
        |  SELECT (somente leitura)
        v
[MySQL ERP Econômico — .254]

[FC360 PWA/TWA]
        |  3. navigator.bluetooth
        v
[Urovo K329] — imprime a etiqueta

[Firestore — clientes/{clienteId}/etiquetas_*]
        ↑ log de impressão, config de layout, listas de lote
        v
[Retaguarda FC360 — painel admin existente, nova seção]
```

## 5. Fluxo mobile — correção pontual

1. Operador abre **Etiquetas** na capa de módulos (visível quando `modulos.etiquetas` está ativo no `clienteConfig`, mesmo padrão dos outros módulos).
2. Pareamento com o K329 via `navigator.bluetooth.requestDevice()`; device salvo em `localStorage` pra não repetir o pareamento a cada sessão.
3. Operador bipa o código de barras num `<input>` focado.
4. App chama `GET /produto/:codigoBarras` na API nova.
5. Prévia da etiqueta na tela (nome + preço formatado) antes de imprimir.
6. Operador confirma → app monta o comando ESC-POS/TSPL e envia via Bluetooth.
7. Grava `etiquetas_log` (produto, preço impresso, operador, timestamp, origem "pontual").

## 6. Fluxo mobile — lote

1. Retaguarda cria `etiquetas_lote/{loteId}` com lista de itens (código de barras + quantidade de etiquetas), status `pendente`.
2. FC360 mobile lista lotes pendentes do cliente logado (Firestore em tempo real).
3. Operador abre um lote → app resolve os preços atuais via API (uma consulta por item) e monta a fila de impressão.
4. Operador imprime item a item ou tudo de uma vez, mesma rotina de impressão do fluxo pontual.
5. Ao concluir, lote muda para `concluido`; cada item impresso vira uma entrada em `etiquetas_log` (origem "lote", com `loteId`).

## 7. Modelo de dados (Firestore)

```
clientes/{clienteId}/
  etiquetas_layout/{layoutId}
    campos: { nome: boolean, preco: boolean, codigoBarras: boolean, unidade: boolean }
    tamanhoEtiqueta: "72mm"     // fixo em v1, único modelo suportado
    ativo: boolean

  etiquetas_lote/{loteId}
    criadoPor: string
    criadoEm: timestamp
    status: "pendente" | "concluido"
    itens: [{ codigoBarras: string, nomeProduto: string, qtdEtiquetas: number }]

  etiquetas_log/{logId}
    codigoBarras: string
    nomeProduto: string
    precoImpresso: number       // snapshot do momento da impressão, não referência ao preço atual
    origem: "pontual" | "lote"
    loteId: string | null
    operadorId: string
    operadorNome: string
    timestamp: timestamp
```

Preço fica gravado como snapshot no log porque o preço no ERP muda com o tempo — o histórico precisa refletir o que foi impresso naquele momento, não o preço atual do produto.

## 8. Retaguarda (painel admin)

Nova seção "Etiquetas" no menu, visibilidade controlada pelo `setupRole()`/`_moduloAtivo('etiquetas')` já existentes:

- **Config de layout:** formulário simples pra ativar/desativar campos da etiqueta. Um layout único por cliente em v1.
- **Montagem de lote:** buscar produto por código de barras ou nome (mesma API de consulta), montar lista com quantidade por item, salvar como `etiquetas_lote` com status `pendente`.
- **Histórico:** tabela paginada de `etiquetas_log`, filtro por data/operador — serve também como indicador de quais produtos mais precisam de correção recorrente na gôndola.

## 9. API nova — autenticação e erros

**Endpoint:** `GET /produto/:codigoBarras`, header `Authorization: Bearer <firebaseIdToken>`.
Resposta: `{ nome, preco, unidade, codigoBarras }` ou `404`.

**Autenticação:** valida o Firebase ID token do operador já logado no FC360 (Firebase Admin SDK no backend), extrai `clienteId` do usuário — evita expor consulta de preço do ERP sem controle, já que o serviço fica num domínio público no `.254`.

**Erros e casos de borda:**
- Código de barras não cadastrado → `404`, app mostra "produto não encontrado" sem travar o fluxo.
- MySQL fora do ar → `503`, app mostra erro e permite tentar de novo (nunca cacheia preço antigo como se fosse atual).
- Bluetooth cai no meio de um lote → pausa e mostra qual item falhou; a fila persiste em Firestore, não se perde no fechamento do app.
- Bipagem duplicada rápida → debounce de ~1s no input antes de disparar a consulta.
- Web Bluetooth só existe em Chrome/Android — não funciona em iOS Safari. Sem impacto prático porque o coletor é um Android dedicado, mas o módulo não deve ser anunciado como funcionando em iPhone.

## 10. Testes

- Teste manual isolado de Web Bluetooth com o K329 físico — primeiro passo do plano, antes de qualquer outra peça (ver seção 3).
- API: testes de integração para produto encontrado, não encontrado, MySQL indisponível, token inválido/de outro `clienteId`.
- Retaguarda: teste manual do fluxo montar lote → aparecer no mobile → imprimir → virar log, no tenant `fluxocerto` (ambiente de teste já existente).
- Mobile: teste manual em loja real (Econômico) com o coletor físico, cobrindo scan → prévia → impressão e a fila de lote completa.