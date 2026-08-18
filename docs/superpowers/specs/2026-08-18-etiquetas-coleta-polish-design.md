# Polish visual da tela Correção Pontual (Etiquetas Coleta) — Design

**Contexto:** o app shell do módulo Etiquetas v2 (topbar, tab bar, navegação) já está implementado e publicado. O conteúdo interno da aba Coleta manteve o visual mínimo do v1 — Tiago reportou que a tela "está muito simples" depois de testar com o K329 físico. Feedback específico: falta hierarquia visual/capricho (input genérico, botão de câmera genérico, sem cor).

**Escopo:** só CSS/HTML da aba Coleta (`renderEtcPontual`/`buscarProdutoPontual` em `app.js`) + duas correções pontuais no `style.css` que afetam essa tela. Nenhuma mudança de lógica/comportamento.

## O que muda

**1. Input de bipagem** — hoje é um `<input>` com estilo inline mínimo (`padding:14px;font-size:16px`, sem borda visível além do padrão do navegador). Passa a usar o mesmo tratamento visual do input de login (`.lf input` em `style.css:24`): borda de 1.5px, `border-radius:9px`, foco com borda verde (`var(--g2)`). Consistência com o resto do app, não um componente novo.

**2. Botão de câmera** — hoje é `class="btn btn-s"` (cinza, quadrado, com emoji 📷) ao lado do input. Vira um botão circular verde (`var(--g)`), ícone branco, com a sombra padrão do app (`var(--sh)`) — fica com cara de ação, não de elemento esquecido.

**3. Card do produto encontrado** — já usa `.card`, mas o preço usa `color:var(--pri)`, uma variável CSS **que não existe** no projeto (não está definida em `style.css`, usada só essa vez em todo o `app.js`) — o preço nunca teve cor, caiu no preto padrão por acidente. Corrige pra `var(--g)` (a cor primária real do app, mesma usada em `.btn-p`). Aumenta um pouco o tamanho do preço e o padding do card pra não parecer apertado.

**4. Classe `.empty`** — usada em 17 lugares no `app.js` (estados "Buscando...", "Produto não encontrado", erros de rede) mas **nunca foi definida** em `style.css` — hoje renderiza como texto solto sem estilo nenhum (é o que apareceu como "Failed to fetch" cru no print do Tiago). Define uma regra simples: padding, texto centralizado, cor `var(--t3)` (cinza secundário já usado no resto do app). Como a classe nunca teve estilo, essa é uma adição pura — não pode quebrar nenhum uso existente nas outras 16 telas, só melhora todas de graça.

**5. Estado vazio inicial** — antes de bipar qualquer coisa, a área abaixo do input fica em branco. `renderEtcPontual` passa a colocar um placeholder simples ali (ícone 🏷️ + texto "Bipe um código pra começar"), usando a própria classe `.empty` da Task 4 — sai assim que o primeiro código é buscado (mesmo fluxo atual de `buscarProdutoPontual` sobrescrevendo `#etc-preview`).

## Fora de escopo
- Imagem do produto, histórico da sessão, contador — Tiago descartou explicitamente (perguntei, ele confirmou que o problema é hierarquia visual, não falta de informação).
- Qualquer mudança em Lotes/Impressora — só a aba Coleta foi mencionada.
- Redesign do app shell (topbar/tab bar) — já está pronto, não é o alvo aqui.

## Risco
Baixo — mudanças de CSS/HTML isoladas numa tela já em teste, mais duas correções de "adição pura" (`--pri`→`var(--g)`, `.empty` nunca existiu). Segue o padrão de bump de `BUILD` já estabelecido no projeto.
