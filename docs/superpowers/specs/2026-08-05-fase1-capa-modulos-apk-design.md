# Fase 1 — Capa de Módulos (app) + Play Store + Blindagem Multi-Tenant

**Data:** 2026-08-05
**Status:** Aprovado em conversa (Tiago) — aguardando revisão da spec escrita
**Referência visual:** print do app concorrente "Shelf" (grade de módulos com cards, sininho de notificações, módulos indisponíveis em cinza, card de Saída)

## 1. Contexto e objetivo

O FC360 é um PWA multi-tenant. A retaguarda (desktop) funciona bem, mas a experiência mobile que o cliente final usa é "o site espremido no celular" — visual amador e sem presença na Play Store, as duas dores apontadas pelo Tiago.

Objetivo da Fase 1: transformar o FC360 mobile num produto com cara de app e presença na Play Store, **sem reescrever nada em nativo**:

1. Nova tela inicial mobile em grade de módulos (estilo Shelf).
2. Publicação na Play Store como TWA ("Fluxo Certo 360"), com tenant resolvido pelo login.
3. Sidebar da retaguarda mostrando também os módulos futuros (vitrine de upsell).
4. Blindagem do Firestore para venda em escala (trilho paralelo obrigatório).

Conceito de produto que orienta tudo: **o app executa, a retaguarda avalia.** Relatórios e Central de Resultados NÃO entram na capa do app — são retaguarda.

## 2. Escopo

### Dentro
- Capa de módulos mobile (pós-login) com estados vivo / em breve / cadeado.
- Sininho de notificações no topo da capa.
- Card de Saída (logout) na capa.
- Itens "em breve" no sidebar da retaguarda desktop.
- Modo de entrada universal (tenant por login) para o APK único.
- Empacotamento TWA + publicação na Play Store.
- Esteira white label premium (1 TWA por cliente premium, apontando pro deploy dele).
- Blindagem Firestore: subcoleções por cliente + Security Rules (trilho paralelo, plano de implementação próprio).

### Fora (fases seguintes)
- Fase 2: migração dos módulos do Fluxo Radar (Promotores, Pesquisa Concorrentes) para dentro do FC360.
- Fase 3: módulo Recebimento (conferência de nota na doca, uso com coletor Android).
- Fase 4: módulo Validade; depois Etiquetas e Ofertas.
- Qualquer reescrita nativa (Capacitor/Flutter) — descartada enquanto não houver dor de scanner/offline.

## 3. Capa de módulos (mobile)

### Quando aparece
- Tela inicial pós-login em viewport mobile (largura < 768px), para todos os perfis operacionais (`admin`, `gerencia`, `supervisor`, `operator`, `coletor`).
- Desktop mantém o dashboard + sidebar atuais (a capa é mobile-first; desktop não muda de navegação nesta fase).
- `superadmin` não vê a capa — continua caindo direto no painel de clientes.

### Layout
- Topo: logo Fluxo Certo 360 (ou logo do cliente no white label), sininho de notificações à direita com badge de contagem.
- Grade de cards 3 colunas (2 em telas muito estreitas), ícone + nome curto, mesmo padrão visual do print do Shelf adaptado à identidade Fluxo.
- Último card da grade: **Saída** (logout com confirmação).

### Cards e estados

| Card | Estado no lançamento | Chave de módulo |
|---|---|---|
| Checklist | vivo | `checklist` |
| Inventário | vivo | `inventario` |
| Planos de Ação | vivo | `planos_acao` |
| Promotores | em breve | `promotores` (novo) |
| Pesquisa Concorrentes | em breve | `pesquisa_concorrentes` (novo) |
| Recebimento | em breve | `recebimento` (novo) |
| Validade | em breve | `validade` (novo) |
| Etiquetas e Ofertas | em breve | `etiquetas_ofertas` (novo) |
| Saída | sempre visível | — |

Regras de estado, avaliadas nesta ordem:
1. **Role sem acesso** ao módulo (mesma matriz do `setupRole()` atual) → card **não aparece**. Ex.: `coletor` vê só Inventário + Saída.
2. **Não desenvolvido** (lista fixa em código: os 5 "em breve") → card cinza com selo "Em breve"; toque mostra aviso "Módulo em desenvolvimento".
3. **Desenvolvido mas não contratado** (`clienteConfig.modulos[m] === false`) → card cinza com cadeado; toque abre modal de upgrade ("Fale com a Fluxo para ativar este módulo" + contato). É o upsell automático.
4. Caso contrário → card **vivo**, toque navega para a tela do módulo já existente.

### Sininho de notificações
- Badge com contagem de alertas não lidos do cliente (reaproveita o módulo `alertas` existente; se o cliente não tem `alertas` ativo, sininho aparece sem badge).
- Toque abre painel/lista de notificações. Nesta fase é leitura simples do que o módulo de alertas já produz — sem push notification (push fica pra quando houver demanda; TWA suporta Web Push depois).

## 4. Sidebar da retaguarda (desktop)

- Os 5 módulos "em breve" aparecem no sidebar em cinza, seção "Em breve", não clicáveis (ou clique mostra o mesmo aviso).
- Módulos desenvolvidos mas não contratados aparecem com cadeado e abrem o modal de upgrade.
- Relatórios e Central de Resultados permanecem como estão — retaguarda avalia o que o app executa.

## 5. Play Store — TWA e entrada universal

### APK único "Fluxo Certo 360"
- Empacotar via Bubblewrap/PWABuilder como TWA (AAB para a Play Store). Conta de desenvolvedor Google: US$ 25 (uma vez).
- O TWA aponta para uma **URL de entrada universal** onde o tenant é resolvido pelo login, não pela URL.

### Entrada universal (tenant por login)
- Hoje: tenant = `window.FC360_CLIENT_ID` fixado por deploy (`client.js`). Isso continua valendo para os deploys por cliente.
- Novo modo: quando `FC360_CLIENT_ID === 'universal'` (novo deploy/repo `fc360-app`), o fluxo é: login → lê `clienteId` do usuário → carrega `clientes/{clienteId}` → segue como se fosse o deploy daquele cliente.
- A checagem anti-vazamento do `finalizarLogin()` (que hoje bloqueia login com `clienteId` divergente do deploy) é adaptada: no modo universal ela não bloqueia — ela **define** o tenant da sessão.
- `superadmin` no modo universal cai no painel de clientes, como hoje.

### assetlinks.json (requisito do TWA)
- Precisa ser servido em `https://fc360oficial.github.io/.well-known/assetlinks.json` (raiz do origin, não do subpath).
- Solução: criar o repo `fc360oficial/fc360oficial.github.io` só para servir esse arquivo. Um único origin cobre todos os deploys por path — o mesmo arquivo lista os fingerprints de todos os APKs publicados (FC360 único + white labels).

### White label premium
- Cliente premium ganha app próprio na Play Store: mesmo processo TWA apontando pro deploy dele (`fc360oficial.github.io/fc360-<cliente>/`), com nome, ícone e splash do cliente.
- Esforço marginal por cliente: gerar AAB + ficha na Play Store + adicionar fingerprint no assetlinks.json. Vira item de tabela de preço.

## 6. Blindagem Firestore (trilho paralelo — pré-requisito para escalar vendas)

Motivação: as coleções atuais são globais com filtro `clienteId` feito **no código do app**. Os bugs dos BUILDs 271/276 (vazamento e delete cross-tenant) mostram que basta um filtro esquecido em código novo para vazar dados entre clientes. Com dezenas de clientes pagantes isso é risco jurídico e de reputação.

Decisões:
1. **Estrutura nova: subcoleções por cliente** — `clientes/{clienteId}/<colecao>/{doc}` (checklists, resultados, inventarios, bipagens, usuarios_perfil etc.). Vazamento passa a ser estruturalmente impossível.
2. **Security Rules no servidor**: usuário só lê/escreve dentro de `clientes/{seuClienteId}/**`. O `clienteId` do usuário logado entra no token como **custom claim** do Firebase Auth, setado por Cloud Function no onCreate do usuário (e script de backfill para os existentes). *Nota de custo:* Cloud Functions exige plano Blaze (pay-as-you-go; custo ~zero neste volume) — decisão a confirmar com o Tiago no plano de implementação; alternativa sem Blaze é rule com `get()` no doc do usuário (mais leituras cobradas, sem infra nova).
3. **Sem big bang**: todo módulo novo (Fase 2 em diante) já nasce na estrutura nova; coleções existentes migram uma a uma, com script de migração e período de convivência. A Fase 1 (capa/TWA) não depende da migração — depende apenas de nada novo ser criado no padrão antigo a partir de agora.

Este trilho gera plano de implementação próprio, separado do plano da capa/TWA.

## 7. Critérios de sucesso da Fase 1

- Cliente instala "Fluxo Certo 360" pela Play Store, loga e cai na capa de módulos do tenant dele.
- Capa mobile com 3 módulos vivos funcionando (Checklist, Inventário, Planos de Ação), 5 em breve, sininho e Saída.
- Card cadeado abre modal de upgrade (testável desativando um módulo no `clienteConfig`).
- Deploys por cliente existentes continuam funcionando sem mudança.
- PWA testado no coletor Android do Tiago (bipagem como teclado) — modelo a confirmar.
- Nenhuma coleção nova criada fora do padrão `clientes/{clienteId}/...`.

## 8. Riscos e observações

- **Revisão da Play Store**: primeira publicação pode levar dias e pedir política de privacidade (página simples a publicar). Prever isso no cronograma.
- **Sessão/SW**: os bugs já corrigidos de sessionStorage por origin e cache do service worker (BUILDs 266-269) se aplicam ao deploy universal novo — conferir que as correções valem lá.
- **Sistema de BUILD**: o deploy universal entra na mesma disciplina de bump em 4 arquivos (app.js, sw.js, index.html, version.json).
- **Deploy**: seguir a regra de publicar só no Fluxo (dev) automaticamente; Econômico/Bar do Cachorro só com pedido explícito do Tiago.