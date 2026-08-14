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

**Decisão técnica (corrigida durante o planejamento):** a decisão original era `BarcodeDetector` nativo do Chrome/Android, sem lib externa. Descartada ao descobrir que o próprio projeto já tentou exatamente isso pra leitura de EAN no Inventário (`iniciarScanEAN`, `app.js:12065`) e abandonou — comentário no código (`app.js:12057-12062`) documenta que no coletor físico real (o mesmo hardware usado em Etiquetas) o `BarcodeDetector` "ou não existe, ou existe mas o device não tem o módulo de barcode do ML Kit instalado, e o `detect()` fica resolvendo vazio pra sempre sem erro nenhum — a câmera abre mas nunca lê". A correção: usar **ZXing** (`@zxing/library`, já carregado via CDN em `index.html:18`), reaproveitando o mesmo padrão de `iniciarScanEAN` (que já funciona em produção no coletor real), em vez de duplicar o problema já resolvido.

**Fluxo (reaproveitamento total, sem código de câmera novo):**
1. Botão de câmera chama `iniciarScanEAN('etc-input-codigo')` diretamente — a mesma função já usada no Inventário, sem nenhuma duplicação.
2. `iniciarScanEAN` já cuida de tudo: checa `typeof ZXing`, abre o overlay fullscreen, lê o código, e ao detectar preenche o input e dispara um evento `keydown` de Enter nele.
3. Único ponto novo: `#etc-input-codigo` precisa de um listener de `keydown` (Enter) que dispara `buscarProdutoPontual` imediatamente — hoje só existe o listener de `input` com debounce de 1s, que não é acionado por um `dispatchEvent` de `keydown`. Esse listener de Enter também beneficia quem bipa com coletor físico configurado pra enviar Enter após o código (comum em leitores HID) ou digita e aperta Enter manualmente — busca imediata em vez de esperar o debounce.
4. Câmera indisponível/permissão negada/ZXing não carregou: tratado pelo `iniciarScanEAN` existente (toast), sem necessidade de tratamento próprio.

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

- **ZXing não carregou / permissão negada / câmera indisponível:** já tratado pelo `iniciarScanEAN` reaproveitado — nenhum tratamento novo necessário.
- **Bluetooth cai no meio do "imprimir tudo":** loop para, fila mantém os itens restantes, erro mostrado, botões reabilitados.
- **Tentativa de imprimir sem impressora conectada** (Coleta ou Lotes, incluindo "imprimir tudo"): bloqueado na UI (botão desabilitado + faixa de aviso), não chega a tentar `imprimirEtiquetaBluetooth`.

## Testes

Sem test runner no projeto (mesma decisão do v1) — verificação manual:
- Câmera: testar em Android/Chrome real, permissão negada e concedida, leitura de código real, cancelar sem preencher.
- Imprimir tudo: lote com 3+ itens, sucesso completo, e interrupção forçada (desligar o Bluetooth no meio) pra confirmar que a fila não perde itens.
- App shell: navegar entre as 3 abas sem impressora conectada, confirmar bloqueio de impressão e desbloqueio após parear na aba Impressora, confirmar que "← Etiquetas" volta pra capa.