# Plano — Craque Manager Multiplayer

Contexto: hoje o `manager-futebol.html` é um arquivo único, 100% client-side — todo o `state`
(times, calendário, elenco, tudo) vive na memória do navegador e é salvo no `localStorage`
daquele navegador específico. Não existe nenhum servidor.

Objetivo: permitir que um grupo de amigos, cada um na sua casa, jogue a **mesma temporada**,
cada um controlando um clube, com um sistema de lobby onde todos dão "pronto" antes da rodada
rolar.

---

## 1. Ideia central

- O `state` do mundo deixa de viver só no navegador e passa a viver num **servidor** (uma
  máquina só, sempre a mesma, guardando a "verdade" do jogo).
- Cada navegador vira um **cliente burro**: manda ações (treinar, escalar, comprar jogador,
  ficar pronto) pro servidor, e recebe de volta o estado atualizado. Não simula nada sozinho
  a não ser a exibição.
- Rodada só acontece quando os clubes controlados por humanos estiverem todos **prontos** —
  os controlados por IA continuam decidindo sozinhos como já fazem hoje.

## 2. Hospedagem

Como cada amigo está numa casa diferente, precisa de algo acessível pela internet, não só
rede local. Duas opções, em ordem de recomendação:

1. **VPS barato sempre ligado** — Hetzner, DigitalOcean, Oracle Cloud (tem tier grátis
   permanente), ~R$25/mês ou grátis. Fica no ar 24/7, todo mundo entra pela mesma URL/IP
   quando quiser, sem depender do PC de ninguém estar ligado.
2. **Túnel a partir do PC de um amigo** — ngrok, Cloudflare Tunnel ou Tailscale. De graça,
   mas só funciona enquanto aquele PC estiver ligado, e a URL pode mudar a cada sessão
   (precisa reavisar o grupo toda vez).

Recomendação: começar com túnel pra validar se a galera curte jogar assim, migrar pro VPS
se pegar.

## 3. Stack sugerida

- **Servidor**: Node.js + Express (API HTTP) + Socket.io (tempo real — lobby, chat de
  eventos da partida, avisos).
- **Persistência**: começa simples — um arquivo `mundo.json` salvo em disco a cada mudança
  (mesma lógica do `salvar()`/`localStorage` de hoje, só que no servidor). Não precisa de
  banco de dados de verdade pro tamanho desse jogo. Se crescer muito, migra pra SQLite depois.
- **Cliente**: o HTML atual, adaptado — em vez de mutar `state` direto e chamar `salvar()`,
  manda a ação pro servidor via `fetch`/socket e espera a resposta atualizar a tela.
- **Login**: nada de senha de verdade — um código de sala (tipo "GALERA2026") + apelido já
  resolve pra um grupo de amigos. Quem entra primeiro em cada clube "reivindica" ele.

## 4. Mudanças no modelo de dados

- Cada time ganha um campo `controlador`: `null` (IA, como hoje) ou o nome/id do jogador
  humano dono dele.
- Novo objeto por rodada: `state.rodadaAtual = { status: 'lobby' | 'em_andamento' |
  'concluida', prontos: [idsDosTimesHumanosQueJaConfirmaram] }`.
- Sala/partida vira um conceito no servidor, não mais algo que só existe na memória de um
  navegador.

## 5. Fluxo da rodada (o coração do sistema)

```
1. Rodada abre em estado "lobby".
2. Cada jogador humano entra no seu clube, mexe em treino/escalação/mercado como hoje.
3. Quando termina, clica "Pronto". Servidor marca esse time como pronto e avisa
   todo mundo (via Socket.io) — tela de lobby mostra "3/5 prontos".
4. Quando todos os times humanos estão prontos (ou o host força depois de um
   tempo limite, pra não travar esperando alguém sumido), o servidor dispara a
   simulação da rodada:
   - Times de IA decidem sozinhos, como hoje.
   - Times humanos usam a escalação/tática que cada um deixou salva.
5. Partidas envolvendo dois times de humanos: transmitidas ao vivo pros dois
   lados (Socket.io manda cada evento do minuto assim que acontece, os dois
   clientes recebem o mesmo jogo em tempo real).
6. Partidas humano x IA: só interessam a um jogador — pode simular na hora e
   mostrar o resultado pronto (igual ao "pular pro fim" de hoje) ou, se quiser
   manter a imersão, também transmitir ao vivo só pra aquele jogador.
7. Rodada muda pra "concluida", state global atualiza (tabela, financeiro,
   lesões, etc — reaproveitando toda a lógica que já existe hoje), lobby da
   próxima rodada abre.
```

## 6. Pontas soltas que valem decidir cedo

- **Mercado de transferências simultâneo**: dois amigos tentando comprar o mesmo jogador ao
  mesmo tempo precisa de uma trava no servidor (primeira requisição que chegar vence, a
  segunda recebe erro "jogador não está mais disponível").
- **Jogador que sumiu**: definir um timeout (ex: 15 min) — se um time humano não ficar
  pronto, ou o host força o início (a IA assume as decisões daquela rodada pra aquele time)
  ou a rodada fica esperando. Recomendo timeout com IA assumindo, pra não travar o grupo.
- **Reconexão**: se alguém cair no meio de uma partida ao vivo, o cliente precisa conseguir
  reconectar e receber o estado atual da partida (não só eventos novos).
- **Trocar de clube / entrar depois**: já existe a mecânica de "trocar de clube" no jogo
  atual — no multiplayer, isso vira "reivindicar outro clube vago" dentro da mesma sala.

## 7. Plano de execução em fases (pra não virar um projeto gigante de uma vez)

**Fase 0 — Preparação (baixo risco)**
Separar a lógica de simulação (tudo que já é função pura hoje: `minuto`, `criarPartida`,
`tabela`, `escolherAutor`, etc) do resto do código, já pensando que essas funções vão rodar
no servidor, não no navegador. Isso é reorganização, não reescrita.

**Fase 1 — Servidor mínimo + 1 sala fixa**
Node + Express + Socket.io. Um único mundo compartilhado, sem lobby ainda — qualquer um
pode clicar "jogar rodada" e ela roda pra todo mundo (igual ao modelo mais simples que eu
sugeri antes). Serve pra validar a base de sincronização.

**Fase 2 — Lobby com "pronto"**
Adiciona o estado de rodada (`lobby`/`em_andamento`/`concluida`), a tela de lobby, e o
timeout/host-force.

**Fase 3 — Partidas humano x humano ao vivo**
Transmissão em tempo real via Socket.io pros confrontos entre dois jogadores reais.

**Fase 4 — Polimento**
Reconexão, trava no mercado, sala com código de convite, hospedagem definitiva (VPS).

---

## Próximos passos quando você voltar

1. Confirmar: quantos amigos, jogando com que frequência (isso define se vale VPS pago ou
   túnel grátis já resolve).
2. Decidir se começamos pela Fase 0 (organizar o código atual) ou já partimos direto pro
   servidor mínimo (Fase 1) num projeto separado, mantendo o `manager-futebol.html` atual
   intacto como versão solo.
3. Eu monto a estrutura de pastas do servidor e o primeiro endpoint (`POST /rodada/pronto`)
   como prova de conceito.
