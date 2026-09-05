# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Craque Manager" is a football/soccer management game, in Portuguese (pt-BR), playable two ways:

- **Singleplayer** — `manager-futebol.html`, a single self-contained file (no build step, no server). Opens directly in a browser or is served statically. Saves live in `localStorage`.
- **Multiplayer** — `server/`, a Node/Express/Socket.IO server. Multiple people each control a different club in a shared world, with live-ticked matches for any human-involved fixture.

Both share one simulation engine: `motor.js`.

There is no README; `multiplayer-plano.md` is the original (now largely historical/superseded) planning doc for the multiplayer effort, and `Sistema Dinamicos.txt` is a scratch file the project owner uses to drop future feature specs for Claude to read and implement — check it when asked about "novas" ideas or when told he updated it.

## Running it

No build step, no bundler, no linter, and **no automated test suite** — don't go looking for `npm test`.

- **Solo**: open `manager-futebol.html` directly in a browser (works via `file://`), or via the multiplayer server (see below).
- **Multiplayer server**:
  ```
  cd server
  npm install        # express, socket.io
  node server.js      # or: npm start
  ```
  Serves on `http://localhost:3000` (binds `0.0.0.0`, so it's also reachable over LAN by IP). `/` is the world picker/creator; `/jogo.html?m=<slug>` is a specific world.

### Verifying changes (no test framework — this is the de facto workflow)

- **Syntax-check a `.js` file**: `node --check motor.js` / `node --check server/server.js`.
- **Syntax-check an inline `<script>` in an `.html` file**: extract the contents between `<script>`/`</script>` to a temp `.js` file and run `node --check` on that (the files are large single-page apps with everything inline).
- **Game-logic changes in `motor.js`**: write a throwaway `node -e "..."` script that calls `Motor.novoJogo()`, drives `Motor.prepararRodada`/`Motor.criarPartida`/`Motor.minuto`/`Motor.concluirRodada` directly, and inspects the resulting `state` — much faster than going through a browser for verifying simulation/economy logic across many simulated rounds.
- **Server/multiplayer changes**: copy `server/server.js` + `server/public/` + `motor.js` (+ `manager-futebol.html` if needed) into an isolated temp directory on a different port (patch the `require('../motor.js')` and static-file paths and `PORTA` accordingly), run it there, and drive it with Playwright (a global/cached install is typically available even when the repo has no `playwright` dependency — try `playwright-core` pinned to the cached browser's version). **Never** test risky changes directly against the live server or the real world files in `server/mundos/`.
- Before restarting the **live** multiplayer server after a change, back up the world file(s) it holds (`server/mundos/<slug>.json`) — people's real, unrecoverable progress lives there.

## Architecture

### `motor.js` — the shared engine

Every function takes an explicit `state` object as its first argument — no implicit globals, no DOM, no `localStorage`. This is what makes it usable both in a browser (`window.Motor`) and in Node (`module.exports`); the file ends with a small dual-export shim. `state` holds everything: `times` (all ~240 clubs, most AI-controlled), `jogadores` (a flat id-keyed dict), `calendario`, live competitions (`copa`, `continentais`, `mundial`), `noticias`, `janela` (transfer window), etc.

Key entry points: `novoJogo(idMeu)` creates a fresh world; `prepararRodada` → `criarPartida`/`minuto` (called repeatedly to tick one match to completion) → `concluirRodada` is the per-round cycle; `novaTemporada` rolls a season over.

**Important architectural quirk**: much of this was written assuming a single human perspective, `state.meuTime` ("my club"). Things like the round-end news headline, clássico tracking, cup competition auto-advancement, the youth-academy prospect generator, and the vestiário/oferta-recebida random events are still keyed off `meuTime` specifically. Multiplayer designates whichever human club claimed a spot **first** as the reference (`timeDeReferencia()` in `server.js`) and layers extra logic on top (see below) to generalize the *visible* behavior to every human club — but a few things are still honestly reference-club-only (documented inline where relevant). Don't assume "per-club" just because multiple humans exist.

### Two front-ends, duplicated by design

`manager-futebol.html` and `server/public/jogo.html` share no code with each other — most UI functions (`telaElenco`, `telaEscalacao`, `telaFinancas`, `telaCalendario`, …) exist twice, once per file, because they mutate state differently:

- Solo mutates `state` directly in the browser and calls `salvar()` (writes to `localStorage`) after every action.
- Multiplayer never mutates shared state directly — the client sends a generic `{clubeId, tipo, params}` `acao` event over Socket.IO, the server validates/executes it against its own authoritative copy (`ACOES` table in `server.js`), then broadcasts the new `mundo`.

**When changing gameplay-facing UI or rules, check whether the same fix is needed in both files.** They intentionally drift in places multiplayer needs and solo doesn't (e.g. `jogo.html` has no `localStorage`, has a shared-world lobby, has per-club training budgets).

### `server/server.js` — multiple independent worlds

The server hosts any number of named, fully isolated worlds, not one global game:

- Each world is a file at `server/mundos/<slug>.json` and gets its own Socket.IO namespace, `/mundo/<slug>`.
- `ativarMundo(slug)` is a factory that loads (or migrates) a world's JSON and defines **all** of that world's logic and mutable runtime state (`mundo`, `partidasAoVivo`, `tickHandle`, `timeoutHandle`, `naoProntosDaRodada`) as closures local to that call — nothing about one world is reachable from another. On boot, every world already on disk gets `ativarMundo`'d automatically so lobbies/timeouts keep working across restarts.
- `GET/POST /api/mundos` list/create worlds; `server/public/index.html` is the picker/creator UI. `server/public/jogo.html` reads `?m=<slug>` from its URL to know which namespace to join.
- Old pre-multi-world saves live archived (not deleted) in `server/mundos-antigos/`.

**Round lifecycle** (per world): lobby (humans mark "pronto") → `resolverRodadaAgora()` (fires when everyone's ready, someone forces it, or the lobby timeout elapses) → any fixture with **at least one** human-controlled side goes live and is ticked minute-by-minute by `Motor.minuto` on a shared `setInterval` (`TICK_MS`); everything else resolves instantly (`simularRodadaCompleta`) → once every live match finishes, `finalizarRodada()` calls `Motor.concluirRodada` plus the reference-club-generalizing helpers (`noticiarPartidasDosHumanos`, `avancarCompeticoesEliminatorias`, `decairTreinoEDarPontos`) → back to lobby.

Live-match ticking only broadcasts `partidasAoVivo` when something actually changed (a deliberate perf/UX fix — broadcasting on every tick regardless used to force every connected client to re-render constantly, closing open dropdowns/interrupting clicks). A live match auto-pauses at halftime or on an injury to a human-controlled side, and auto-resumes after `PAUSA_TIMEOUT_MS` if nobody acts — this prevents one absent player from freezing the round for everyone else in the world.

### Save data

- Solo: `craque_manager_saves` (index of `{id, nome, criadoEm}`) + one `craque_manager_save_<id>` per save, all in `localStorage`. Starting a new game asks for a name first.
- Multiplayer: `server/mundos/<slug>.json` per world, created by naming it in the picker.

### Tuning knobs worth knowing about

`server/server.js`: `TICK_MS` (live-match simulation speed), `TIMEOUT_LOBBY_MS` (how long the lobby waits before auto-starting), `PAUSA_TIMEOUT_MS` (auto-resume after an unresolved pause). `motor.js`: `TREINO_PONTOS_POR_RODADA` (training actions per club per round), `SETORES_ESTADIO`/stadium-sector pricing, `NARRADORES`/`FRASES_*` (commentary variety for live-match events).

## Conventions

- Everything — UI copy, code comments, git commit messages — is written in **Portuguese**.
- Code style is dense/minified-looking on purpose (short names, one-linerish functions, arrow functions everywhere) to match the existing files; don't reformat unrelated code when touching a file.
- Git commit messages here are long-form and explain the *why*, not just the *what* (see recent commit history for the expected tone/depth), and end with a `Co-Authored-By` trailer.
