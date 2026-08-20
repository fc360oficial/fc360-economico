# Etiquetas — Redesign em Hub (Avulsa + Lote + Consulta) — Design

**Contexto:** Tiago mandou 2 sets de mockups de referência externa (telas "FLUXO ERP"/"FLUXO CLOUD ERP") mostrando um fluxo "Etiquetas & Consulta": hub com cards grandes, tela de bipagem/busca com card de resultado, seleção em lote com filtros, preview da etiqueta antes de imprimir, e tela de status da impressora. Pediu pra seguir essa estrutura de layout, com as cores do FC360.

Hoje (v1+v2 publicados, ver `2026-08-13-fase4-etiquetas-design.md` e `2026-08-14-etiquetas-v2-design.md`) a Coleta é um app shell dedicado com topbar + tab bar fixa de 3 abas (Coleta/Lotes/Impressora), acessado direto da capa. Esta rodada substitui essa tab bar por um hub de cards, adiciona uma 4ª área (Consulta de Preços) e uma tela de preview antes de imprimir.

**Fora de escopo desta rodada** (decisão explícita, registrada aqui pra não reabrir sem querer):
- **Cores do mockup (azul):** substituídas pela paleta do FC360 — dourado `#FFC600` (`--dk`) + branco, igual ao resto do app (login, marca). Não usar azul.
- **Bottom nav global do mockup** (Início/Estoque/Etiquetas/Operações/Mais): não existe aqui — o FC360 já tem sua própria navegação (capa de módulos). O hub desta rodada não leva bottom nav nenhuma, só um botão voltar no topbar.
- **Backend/conexão real dos dados novos:** os filtros de Etiquetas em Lote (Departamento/Setor/Marca) e os campos extras de Consulta de Preços (estoque disponível, preço anterior) dependem de schema do ERP (`supermercado.itens` + tabelas de grupo/marca, ver `reference_erp-mysql`) que **não foi confirmado** — sem acesso à rede da Central no momento desta sessão para investigar. O layout dessas telas está desenhado aqui, mas a query/endpoint real (`etiquetas-api.js`) é dependência técnica a resolver antes de qualquer uma das duas funcionar de ponta a ponta. Tratar como projeto de implementação separado, depois deste spec de layout — decisão explícita do Tiago ("primeiro layout, depois vemos a conexão").
- **Hospedagem em produção da `etiquetas-api`:** hoje só roda via túnel Cloudflare temporário rodado manualmente de uma máquina dentro (ou fora, com timeout) da rede da Central. Resolver isso é outro projeto à parte, não deste spec.
- **Seletor de tamanho de etiqueta por impressão:** continua fixo pelo layout salvo na retaguarda. Só quantidade é editável nesta rodada (decisão explícita: reduz risco de mexer no `montarComandoTSPL` sem testar múltiplos tamanhos físicos no K329).

---

## Parte 1 — Hub "Etiquetas e Consulta"

**Objetivo:** troca a entrada direta na tab bar (Coleta) por uma tela intermediária com 4 opções, mais parecida com o mockup.

**Mudança na capa:** o card do módulo que hoje abre direto em `nav('etiquetas-coleta')` (`index.html:600`, "📱 Abrir modo coleta") passa a se chamar **"Etiquetas e Consulta"** e continua abrindo `etiquetas-coleta` — mas o conteúdo inicial desse painel muda de "aba Coleta" pra "hub".

**Estrutura da tela (dentro do `panel-etiquetas-coleta` existente, reaproveitando `etc-topbar`):**
- Topbar: `← Etiquetas` (volta pra capa) — sem indicador de status da impressora aqui (esse indicador migra pro card "Impressora", Parte 5).
- 4 cards em coluna, estilo `.card` já existente (fundo branco, sombra, borda sutil) com ícone num quadrado dourado claro (`#FFC600` a ~15% opacidade) + ícone dourado sólido:
  1. 🏷️ **Etiqueta Avulsa** — "Imprima uma etiqueta de um produto específico" → abre Parte 2.
  2. 📋 **Etiquetas em Lote** — "Selecione vários produtos e imprima em lote" → abre Parte 3.
  3. 🔍 **Consulta de Preços** — "Consulte informações e preços dos produtos" → abre Parte 4.
  4. 🔌 **Impressora** — mostra status atual (`● Conectada` / `○ Desconectada`) → abre Parte 5.
- Abaixo dos cards: **"Últimas impressões"** — lista das últimas ~5 entradas de `etiquetas_log` (reaproveita a coleção já gravada por `confirmarImpressaoPontual` e pela fila de lote), mostrando nome do produto, quando (relativo: "Hoje, 08:45" / "Ontem, 17:22") e quantidade. Link "Ver todas" fica fora de escopo (não existe tela de histórico completo ainda) — se cliente tocar, só não faz nada por enquanto ou o link nem aparece nesta rodada.

**Navegação interna:** cada card chama uma função tipo `abrirEtcHub(view)` que troca o conteúdo do `etc-body` — mesmo padrão de show/hide de `switchEtcTab` hoje, só que partindo do hub em vez de entre as 3 abas antigas. Cada sub-tela (Avulsa/Lote/Consulta/Impressora) ganha seu próprio botão "← Etiquetas e Consulta" no topo pra voltar ao hub (não pra capa — sair de vez continua sendo o `← Etiquetas` do topbar).

**Reaproveita:** `panel-etiquetas-coleta`, `etc-topbar`, `etc-body`, coleção `etiquetas_log`, toda a lógica de negócio das Partes 2 e 5 abaixo.

---

## Parte 2 — Etiqueta Avulsa

**Objetivo:** mesma função de hoje (Correção Pontual), com visual do mockup + quantidade editável + preview antes de imprimir.

**Fluxo:**
1. Bipar (câmera, reaproveita `iniciarScanEAN`) ou digitar código — mesmo input/comportamento de hoje (`buscarProdutoPontual`).
2. Card de resultado, estilo mockup: nome do produto, código, marca/departamento (**se o schema permitir** — ver ressalva de escopo; se não vier do backend, esses dois campos simplesmente não aparecem no card, sem quebrar o layout), preço atual, última atualização.
3. **Novo:** stepper de quantidade (− 1 +) abaixo do card, começando em 1.
4. Botão "Ver Etiqueta" (troca o atual "Imprimir etiqueta") → abre a tela de preview.

**Tela de preview (nova):**
- Renderização visual da etiqueta como vai sair fisicamente: nome, preço em destaque, código de barras (gerado com a mesma lib já usada em algum lugar do app pra barcode visual, ou um `<canvas>`/SVG simples — a implementação escolhe na hora, não é decisão de design), data/hora.
- Mostra também: status da impressora conectada (nome do dispositivo) e o stepper de quantidade (editável ainda aqui, igual ao mockup).
- Botão "Imprimir Agora" → chama `imprimirEtiquetaBluetooth` **N vezes** (uma por unidade do stepper), gravando `etiquetas_log` uma vez por etiqueta impressa (mesmo padrão de intervalo ~300ms usado no "imprimir tudo" do lote, pra não sobrecarregar o buffer do K329).
- Erro no meio da impressão de N cópias: mesmo padrão do "imprimir tudo" — para no primeiro erro, mostra quantas já saíram, não perde o que já foi impresso.

**Reaproveita:** `buscarProdutoPontual`, `imprimirEtiquetaBluetooth`, `montarComandoTSPL`, gravação em `etiquetas_log`, `_etcWriteChar`/`_etcImprimindo`.

---

## Parte 3 — Etiquetas em Lote

**Objetivo:** hoje "Lotes" só consome lotes pré-montados na retaguarda (desktop). O mockup mostra montagem do lote **dentro da Coleta**: busca + filtros + checkbox + quantidade por item. Esta é a maior mudança de escopo do redesign.

**Tela de seleção:**
- Campo de busca por nome/código.
- 3 selects de filtro: Departamento, Setor, Marca (populados a partir do backend — **dependência técnica não resolvida nesta rodada**, ver seção de fora de escopo).
- Lista de produtos com checkbox + nome + código + preço + campo de quantidade (habilitado só quando marcado).
- Barra fixa embaixo: "N produtos selecionados" + "Limpar seleção" + botão "Gerar Etiquetas (N produtos)".

**Ao gerar:** monta a fila de impressão em memória (equivalente ao que `abrirLoteParaImpressao` faz hoje a partir de um lote salvo no Firestore — aqui a fila nasce direto da seleção, sem precisar gravar um documento `etiquetas_lote` primeiro, **a menos que a implementação prefira manter esse registro pra histórico/auditoria** — decisão técnica, não de layout) e abre a mesma tela de fila/progresso que já existe (`renderFilaLote`, "Imprimir próxima" / "Imprimir tudo").

**Reaproveita:** `renderFilaLote`, `imprimirProximoDaFila`, `imprimirTudoDaFila`, toda a lógica de fila e gravação de log do v1/v2.

**Não reaproveita (é novo):** a tela de seleção com busca/filtro/checkbox não existe hoje — hoje o lote já chega pronto (montado na retaguarda). Este redesign não remove a montagem via retaguarda desktop (continua existindo pra quem preferir montar de lá); adiciona a montagem via mobile como caminho alternativo.

---

## Parte 4 — Consulta de Preços

**Objetivo:** tela nova — ver informação de produto sem imprimir. Não existe em nenhuma forma hoje.

**Fluxo:**
1. Bipar ou buscar (mesmo padrão de input das outras telas).
2. Card de resultado: nome, código, marca/departamento, preço atual, estoque disponível, preço anterior, última atualização.
3. Sem botão de imprimir — é só consulta. (Se o usuário quiser imprimir depois de consultar, volta ao hub e entra em Etiqueta Avulsa — não faz sentido duplicar o fluxo de impressão aqui.)

**Ressalva:** estoque disponível e preço anterior são os dois campos mais incertos — **dependem de colunas/tabelas que ainda não foram confirmadas no ERP** (ver fora de escopo). Se não existirem, a tela mostra só nome/código/preço/última atualização, sem quebrar.

---

## Parte 5 — Impressora

**Objetivo:** tela dedicada de pareamento, substituindo a aba fixa "Impressora" de hoje. Mesma lógica (`parearImpressora`), visual novo.

**Estrutura:**
- Card grande mostrando status: nome/modelo do dispositivo conectado (ex.: "Urovo K329") + selo "✅ Conectada" ou botão "Conectar na impressora" se desconectada.
- Dica fixa abaixo: "Mantenha a impressora ligada e próxima ao dispositivo para garantir a conexão."
- Card no hub (Parte 1) reflete o mesmo status em tempo real (mesmo estado `_etcWriteChar`).

**Mudança de comportamento:** deixa de ser aba sempre visível — agora só se acessa entrando pelo card do hub, ou sendo redirecionado automaticamente se tentar imprimir (Avulsa ou Lote) sem estar conectado (mesmo padrão de bloqueio que já existe hoje: faixa de aviso + botão desabilitado, só que agora leva de volta pro hub → card Impressora em vez de trocar de aba).

**Reaproveita:** `parearImpressora`, `_etcWriteChar`, `_etcDevice`, evento `gattserverdisconnected`.

---

## Paleta e componentes visuais

- **Cor de destaque:** `#FFC600` (`--dk` já existe em `style.css`) + branco. Não introduzir azul do mockup.
- **Cards:** reaproveitar `.card` (`style.css:103`) — sem CSS novo de estrutura, só ajustes de conteúdo interno (ícone, layout de texto).
- **Bug herdado a corrigir de passagem:** `app.js:4659` usa `var(--pri)`, token que nunca existiu em `style.css` (preço aparece sem cor, herda a cor padrão do texto). Trocar por `--dk` (dourado) ou `--t` (texto padrão escuro) — decisão de implementação, mas precisa ser corrigido junto já que essa tela está sendo tocada de qualquer forma.
- **Ícones:** manter o estilo emoji já usado no app (🏷️📋🔍🔌), não introduzir ícone SVG novo — consistente com o resto do FC360 hoje.

---

## Erros e casos de borda

- **Campo do backend ausente** (marca/departamento/estoque/preço anterior): card renderiza sem o campo, sem erro visual, sem placeholder tipo "N/D" a menos que a implementação decida que faz sentido.
- **Tentativa de imprimir (Avulsa ou Lote) sem impressora conectada:** mesmo padrão de bloqueio de hoje, redireciona pro card/tela Impressora dentro do hub.
- **Erro ao gerar etiquetas em lote (algum produto não resolve):** mesmo padrão do v1/v2 — item que falha não entra na fila, resto segue normalmente.
- **Voltar no meio de qualquer sub-tela:** sempre volta pro hub, nunca perde o estado de conexão da impressora (estado é global ao painel, não por sub-tela).

## Testes

Sem test runner no projeto (mesma decisão dos specs anteriores) — verificação manual:
- Navegar hub → cada uma das 4 telas → voltar, confirmar que o estado da impressora persiste entre elas.
- Avulsa: bipar produto real, alterar quantidade, ver preview, imprimir N cópias, confirmar N entradas no `etiquetas_log`.
- Lote (quando backend estiver pronto): buscar, filtrar, selecionar, gerar, imprimir fila completa e parcial (interrompida).
- Consulta: bipar produto, confirmar que tela não tem botão de imprimir.
- Campos ausentes do backend (marca/departamento/estoque/preço anterior): confirmar que os cards não quebram visualmente quando esses campos vêm `undefined`.