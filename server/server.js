/* ============================================================
   Servidor — Fase 2 do plano de multiplayer (lobby com "pronto").
   Guarda um único mundo compartilhado. Cada rodada abre em lobby;
   os clubes reivindicados por humanos marcam "pronto", e a rodada
   só roda quando todos estiverem prontos — ou quando alguém força
   (manualmente ou por timeout), com quem sumiu sendo coberto pela
   própria escalação/decisões já em vigor (equivalente à IA assumir).
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
    if (!mundo.rodadaEstado) mundo.rodadaEstado = rodadaEstadoPadrao();
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

// Motor.prepararRodada() só resolve (via resolverRodadasForaneas) as confederações
// diferentes da de "meuTime" — no jogo solo, a confederação do próprio jogador é simulada
// ao vivo na tela de partida, que este cliente de teste não tem. Aqui simulamos qualquer
// jogo da rodada que ainda não tenha placar, em qualquer confederação/divisão.
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

// Roda a rodada agora, prontos ou não — chamada quando todo mundo confirmou, quando
// alguém força manualmente, ou quando o timeout do lobby estoura.
function resolverRodadaAgora() {
  clearTimeout(timeoutHandle);
  if (mundo.fimTemporada || mundo.rodadaEstado.status !== 'lobby') return;
  const naoProntos = timesHumanos().filter(t => !mundo.rodadaEstado.prontos.includes(t.id));
  mundo.rodadaEstado.status = 'em_andamento';
  mundo.meuTime = timeDeReferencia();
  Motor.prepararRodada(mundo);
  simularRodadaCompleta();
  Motor.concluirRodada(mundo);
  if (naoProntos.length) {
    Motor.noticia(mundo, 'Rodada iniciada sem confirmação de: ' + naoProntos.map(t => t.nome).join(', ') + '.');
  }
  mundo.rodadaEstado = rodadaEstadoPadrao();
  salvar();
  io.emit('mundo', mundo);
  console.log('Rodada resolvida — agora em', mundo.rodada + 1, naoProntos.length ? `(${naoProntos.length} sem confirmar)` : '(todos prontos)');
  agendarTimeout();
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const servidorHttp = http.createServer(app);
const io = new Server(servidorHttp);

io.on('connection', socket => {
  console.log('Cliente conectado:', socket.id);
  socket.emit('mundo', mundo);

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
