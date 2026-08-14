# Módulo Etiquetas v2 — Design

**Contexto:** o módulo Etiquetas (Fase 4, ver `docs/superpowers/specs/2026-08-13-fase4-etiquetas-design.md` e `docs/superpowers/plans/2026-08-13-fase4-etiquetas.md`) está com v1 completo e publicado no Econômico. Esta rodada (v2) trata de 3 pedidos que ficaram de fora do v1 por serem escopo novo, não bugs.

**Fora de escopo desta rodada** (decisão explícita, registrada aqui pra não reabrir sem querer):
- "Imprimir avulso" — esclarecido que é a mesma coisa que Correção Pontual (já existe no v1). Nenhuma feature nova.
- Aplicar o redesign de chrome em Inventário Coleta ou Checklist — só Etiquetas Coleta nesta rodada, como piloto.
- Referência de formatos do Emissor Etiquetas legado (F1-F11, toggles de promoção/preço reduzido/etc.) — vira um projeto separado de layout avançado, não entra aqui.

---

## Parte 1 — Bipagem por câmera

**Objetivo:** hoje `#etc-input-codigo` (aba Coleta/Correção Pontual) só aceita entrada via teclado (coletor físico ou digitação manual). Adicionar leitura por câmera do celular como caminho alternativo, sem tirar o que já existe.

**Componente:** botão ícone de câmera ao lado do input. Ao tocar, abre um modal fullscreen com `<video>` da câmera traseira (`getUserMedia({video:{facingMode:'environment'}})`) e um loop `requestAnimationFrame` chamando `BarcodeDetector.detect(videoFrame)`.

**Decisão técnica:** `BarcodeDetector` nativo do Chrome/Android, sem lib externa — mantém o padrão "vanilla JS sem bundler" já usado no resto do projeto, e aceita a mesma restrição de plataforma que o Web Bluetooth já impõe (só Chrome/Android; iOS Safari não suporta nenhum dos dois). Se `'BarcodeDetector' in window` for falso, o botão de câmera fica oculto — mesmo padrão de degradação já usado hoje.

**Fluxo:**
1. Toca no botão de câmera → abre modal, pede permissão de câmera.
2. Permissão negada → mostra erro dentro do próprio modal, sem travar a tela de trás.
3. Código detectado → para o loop, `track.stop()` no stream, fecha o modal, preenche `#etc-input-codigo` e chama `buscarProdutoPontual(codigo)` diretamente (reaproveita a função de busca existente — nenhuma duplicação de lógica).
4. Botão "Cancelar" no modal fecha tudo sem preencher nada.

**Escopo:** só na aba Coleta mobile (Correção Pontual). A busca de item pra montar lote na retaguarda (`buscarProdutoParaLote`, tipicamente usada de desktop) continua só com input de texto.

---

## Parte 2 — Imprimir tudo de uma vez

**Objetivo:** hoje a fila de lote (`renderFilaLote` / `imprimirProximoDaFila`) só imprime item a item, um clique por etiqueta. Adicionar um modo automático.

**Componente:** botão "Imprimir tudo" ao lado do "Imprimir próxima" já existente.

**Fluxo:**
1. Clique desabilita os dois botões (evita fila dupla concorrente — mesma preocupação já tratada no v1 pra impressão duplicada).
2. Loop `await imprimirEtiquetaBluetooth(produto)` + grava `etiquetas_log` por item, com ~300ms de intervalo entre impressões (evita sobrecarregar o buffer do K329).
3. Contador de progresso visível ("Imprimindo 3 de 12...") no lugar onde a fila já é mostrada.
4. **Erro no meio:** para o loop imediatamente, mantém os itens não impressos na fila (mesmo padrão do item-a-item hoje — o item que falhou fica no topo pra nova tentativa), reabilita os botões, mostra a mensagem de erro.
5. Fila esvaziada com sucesso: mesmo comportamento final de hoje (`status:'concluido'` no lote, toast, volta pra lista de lotes).

**Reaproveita:** `imprimirEtiquetaBluetooth`, escrita em `etiquetas_log`, atualização de status do lote — tudo já existe no v1. Só muda quem controla o avanço do loop (manual vs. automático).

---

## Parte 3 — Redesign "app shell" (piloto: só Etiquetas Coleta)

**Objetivo:** hoje `panel-etiquetas-coleta` usa o mesmo chrome responsivo de desktop (sidebar + topbar, só encolhidos) que todo o resto do FC360. Tiago quer que as telas operacionais tenham visual de app mobile dedicado ("vendável"). Esta rodada aplica isso só em Etiquetas Coleta, como piloto — Inventário Coleta e Checklist ficam pra depois, se der certo.

**Estrutura decidida (validada com mockup visual):**
- **Topbar:** `← Etiquetas` + indicador de status da impressora (pill "●conectado" verde / "○desconectado" cinza). Tocar em "← Etiquetas" volta pra capa (grade de módulos) — sai do modo app dedicado.
- **Tab bar fixa embaixo, 3 abas:**
  - 🏷️ **Coleta** — renomeia a atual "Correção Pontual" (Parte 1 se aplica aqui).
  - 📋 **Lotes** — fluxo de lote existente (Parte 2 se aplica aqui).
  - 🔌 **Impressora** — hospeda o fluxo de pareamento que hoje é uma tela bloqueante (`parearImpressora`, `#etc-pareamento`).
- **Impressora deixa de bloquear o acesso:** operador entra direto em Coleta ou Lotes mesmo sem parear ainda (diferença do v1, que exigia conectar primeiro).
- **Bloqueio de impressão sem conexão:** faixa de aviso fixa no topo de Coleta/Lotes ("Conecte a impressora antes de imprimir", com atalho pra aba Impressora) + botão de imprimir desabilitado enquanto `_etcWriteChar` for `null`.

**Reaproveita:** toda a lógica de negócio do v1 (`renderEtcPontual`, `renderFilaLote`, `parearImpressora`, `imprimirEtiquetaBluetooth`, `switchEtcTab`) — é troca de HTML/CSS/navegação, não de lógica.

**Não muda:** Inventário Coleta, Checklist e a retaguarda de Etiquetas (desktop) continuam exatamente como estão.

---

## Erros e casos de borda

- **BarcodeDetector indisponível** (iOS, Chrome antigo): botão de câmera oculto, sem erro visível — mesmo padrão do Bluetooth.
- **Permissão de câmera negada:** erro dentro do modal, sem travar o resto da tela.
- **Bluetooth cai no meio do "imprimir tudo":** loop para, fila mantém os itens restantes, erro mostrado, botões reabilitados.
- **Tentativa de imprimir sem impressora conectada** (Coleta ou Lotes, incluindo "imprimir tudo"): bloqueado na UI (botão desabilitado + faixa de aviso), não chega a tentar `imprimirEtiquetaBluetooth`.

## Testes

Sem test runner no projeto (mesma decisão do v1) — verificação manual:
- Câmera: testar em Android/Chrome real, permissão negada e concedida, leitura de código real, cancelar sem preencher.
- Imprimir tudo: lote com 3+ itens, sucesso completo, e interrupção forçada (desligar o Bluetooth no meio) pra confirmar que a fila não perde itens.
- App shell: navegar entre as 3 abas sem impressora conectada, confirmar bloqueio de impressão e desbloqueio após parear na aba Impressora, confirmar que "← Etiquetas" volta pra capa.