/* ============================================================
   Servidor — Fase 3 do plano de multiplayer (partidas humano x
   humano ao vivo). Guarda um único mundo compartilhado. Cada
   rodada abre em lobby; os clubes reivindicados por humanos marcam
   "pronto", e a rodada só roda quando todos estiverem prontos — ou
   quando alguém força (manualmente ou por timeout), com quem sumiu
   sendo coberto pela própria escalação/decisões já em vigor
   (equivalente à IA assumir).

   Ao rodar, qualquer confronto onde os DOIS lados são controlados
   por um humano vira uma partida ao vivo: minuto a minuto, via
   Motor.minuto() no mesmo ritmo do jogo solo, transmitida por
   socket.io (evento "partidasAoVivo") até os 90'. O resto da rodada
   (humano x IA, IA x IA) continua resolvido na hora, como na Fase 1.

   Simplificação consciente: pênaltis/faltas nessas partidas ao vivo
   resolvem sozinhos (sem hooks interativos) — dar a cada lado a
   chance de escolher batedor/tipo de cobrança em tempo real é
   trabalho de UI maior, fica pra depois.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const Motor = require('../motor.js');

const PORTA = 3000;
const ARQUIVO_MUNDO = path.join(__dirname, 'mundo.json');
const TIMEOUT_LOBBY_MS = 5 * 60 * 1000; // 5 min sem todo mundo pronto -> força sozinho

function rodadaEstadoPadrao() {
  return { status: 'lobby', prontos: [], timeoutAt: Date.now() + TIMEOUT_LOBBY_MS };
}

function carregarOuCriarMundo() {
  if (fs.existsSync(ARQUIVO_MUNDO)) {
    const mundo = JSON.parse(fs.readFileSync(ARQUIVO_MUNDO, 'utf8'));
    mundo.times.forEach(t => { if (t.controlador === undefined) t.controlador = null; });
    if (!mundo.rodadaEstado || mundo.rodadaEstado.status !== 'lobby') {
      // Se o servidor caiu no meio de uma rodada ao vivo, as partidas em memória se
      // perdem — mas os jogos que ainda não têm placar continuam com gc:null no
      // calendário, então a próxima resolução de rodada os recria e simula direitinho.
      mundo.rodadaEstado = rodadaEstadoPadrao();
    }
    console.log('Mundo carregado de mundo.json — temporada', mundo.temporada, 'rodada', mundo.rodada + 1);
    return mundo;
  }
  const mundo = Motor.novoJogo(0);
  mundo.times.forEach(t => { t.controlador = null; });
  mundo.rodadaEstado = rodadaEstadoPadrao();
  console.log('Nenhum mundo.json encontrado — mundo novo criado.');
  return mundo;
}

let mundo = carregarOuCriarMundo();
let timeoutHandle = null;

function salvar() {
  fs.writeFileSync(ARQUIVO_MUNDO, JSON.stringify(mundo));
}

function timesHumanos() {
  return mundo.times.filter(t => t.controlador !== null);
}

function agendarTimeout() {
  clearTimeout(timeoutHandle);
  if (mundo.fimTemporada) return;
  const restante = mundo.rodadaEstado.timeoutAt - Date.now();
  timeoutHandle = setTimeout(resolverRodadaAgora, Math.max(0, restante));
}

// Time de referência pra o que o motor ainda trata como "meuTime" (clássico, copas,
// eventos de vestiário/oferta recebida) — ver "Simplificação consciente" no plano da
// Fase 1. É o primeiro clube reivindicado; se ninguém reivindicou ainda, fica no clube 0.
function timeDeReferencia() {
  const reivindicado = mundo.times.find(t => t.controlador !== null);
  return reivindicado ? reivindicado.id : 0;
}

// Resolve na hora qualquer jogo da rodada que ainda não tenha placar, em qualquer
// confederação/divisão (o Motor.prepararRodada() só cobre as confederações diferentes
// da de "meuTime" — a dele é simulada ao vivo na tela solo, que este servidor não tem).
// Jogos humano x humano já foram tirados daqui antes (ver iniciarPartidasAoVivo).
function simularRodadaCompleta() {
  Motor.CONFEDERACOES.forEach(conf => {
    Object.keys(mundo.calendario[conf]).forEach(div => {
      mundo.calendario[conf][div][mundo.rodada].forEach(g => {
        if (g.gc === null) {
          const p = Motor.criarPartida(mundo, g);
          while (!p.fim) Motor.minuto(mundo, p);
        }
      });
    });
  });
}

const TICK_MS = 260; // mesmo ritmo do "Normal" no jogo solo
let partidasAoVivo = null; // array de partidas em andamento, ou null quando não há nenhuma
let tickHandle = null;
let naoProntosDaRodada = [];

function resumoPartida(p) {
  return { casaId: p.g.casa, foraId: p.g.fora, min: p.min, gc: p.gc, gf: p.gf, eventos: p.eventos, fim: p.fim };
}

// Acha os confrontos da rodada onde os dois lados são controlados por humanos e cria
// as partidas (sem simular nada ainda) — essas ficam de fora do simularRodadaCompleta().
function iniciarPartidasAoVivo() {
  const jogos = [];
  Motor.CONFEDERACOES.forEach(conf => {
    Object.keys(mundo.calendario[conf]).forEach(div => {
      mundo.calendario[conf][div][mundo.rodada].forEach(g => {
        if (g.gc === null && mundo.times[g.casa].controlador && mundo.times[g.fora].controlador) {
          jogos.push(Motor.criarPartida(mundo, g));
        }
      });
    });
  });
  return jogos;
}

function tickPartidasAoVivo() {
  partidasAoVivo.forEach(p => { if (!p.fim) Motor.minuto(mundo, p); });
  io.emit('partidasAoVivo', partidasAoVivo.map(resumoPartida));
  if (partidasAoVivo.every(p => p.fim)) {
    clearInterval(tickHandle);
    partidasAoVivo = null;
    io.emit('partidasAoVivo', []);
    finalizarRodada();
  }
}

// Roda a rodada agora, prontos ou não — chamada quando todo mundo confirmou, quando
// alguém força manualmente, ou quando o timeout do lobby estoura.
function resolverRodadaAgora() {
  clearTimeout(timeoutHandle);
  if (mundo.fimTemporada || mundo.rodadaEstado.status !== 'lobby') return;
  naoProntosDaRodada = timesHumanos().filter(t => !mundo.rodadaEstado.prontos.includes(t.id));
  mundo.rodadaEstado.status = 'em_andamento';
  mundo.meuTime = timeDeReferencia();
  Motor.prepararRodada(mundo);
  const aoVivo = iniciarPartidasAoVivo();
  salvar();
  io.emit('mundo', mundo); // avisa geral que a rodada saiu do lobby
  if (aoVivo.length) {
    partidasAoVivo = aoVivo;
    console.log(aoVivo.length, 'partida(s) humano x humano ao vivo começando...');
    tickHandle = setInterval(tickPartidasAoVivo, TICK_MS);
  } else {
    finalizarRodada();
  }
}

// Chamada depois que toda partida ao vivo (se houve alguma) já terminou — resolve o
// resto do mundo e reabre o lobby pra próxima rodada.
function finalizarRodada() {
  simularRodadaCompleta();
  Motor.concluirRodada(mundo);
  if (naoProntosDaRodada.length) {
    Motor.noticia(mundo, 'Rodada iniciada sem confirmação de: ' + naoProntosDaRodada.map(t => t.nome).join(', ') + '.');
  }
  mundo.rodadaEstado = rodadaEstadoPadrao();
  salvar();
  io.emit('mundo', mundo);
  console.log('Rodada resolvida — agora em', mundo.rodada + 1, naoProntosDaRodada.length ? `(${naoProntosDaRodada.length} sem confirmar)` : '(todos prontos)');
  naoProntosDaRodada = [];
  agendarTimeout();
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const servidorHttp = http.createServer(app);
const io = new Server(servidorHttp);

io.on('connection', socket => {
  console.log('Cliente conectado:', socket.id);
  socket.emit('mundo', mundo);
  if (partidasAoVivo) socket.emit('partidasAoVivo', partidasAoVivo.map(resumoPartida));

  socket.on('entrar', ({ clubeId, apelido }) => {
    const time = mundo.times[clubeId];
    if (!time) { socket.emit('erro', 'Clube não existe.'); return; }
    if (time.controlador !== null) { socket.emit('erro', 'Esse clube já foi reivindicado por ' + time.controlador.nome + '.'); return; }
    if (!apelido || !apelido.trim()) { socket.emit('erro', 'Escolha um apelido.'); return; }
    time.controlador = { nome: apelido.trim() };
    salvar();
    io.emit('mundo', mundo);
    console.log(apelido.trim(), 'reivindicou', time.nome);
  });

  socket.on('ficarPronto', ({ clubeId, pronto }) => {
    const time = mundo.times[clubeId];
    if (!time || time.controlador === null) { socket.emit('erro', 'Reivindique um clube antes de ficar pronto.'); return; }
    if (mundo.rodadaEstado.status !== 'lobby') { socket.emit('erro', 'A rodada já está rolando.'); return; }
    const prontos = mundo.rodadaEstado.prontos;
    const idx = prontos.indexOf(clubeId);
    if (pronto && idx < 0) prontos.push(clubeId);
    else if (!pronto && idx >= 0) prontos.splice(idx, 1);
    salvar();
    io.emit('mundo', mundo);
    const humanos = timesHumanos();
    if (humanos.length && humanos.every(t => prontos.includes(t.id))) {
      resolverRodadaAgora();
    }
  });

  socket.on('forcarInicio', () => resolverRodadaAgora());

  socket.on('disconnect', () => console.log('Cliente desconectado:', socket.id));
});

agendarTimeout();

servidorHttp.listen(PORTA, '0.0.0.0', () => {
  console.log(`Servidor no ar em http://localhost:${PORTA}/cliente-teste.html`);
  console.log('(na mesma rede Wi-Fi, dá pra acessar pelo IP desta máquina em vez de localhost)');
});
