/* ============================================================
   Servidor mínimo — Fase 1 do plano de multiplayer.
   Guarda um único mundo compartilhado, sem lobby ainda: qualquer
   cliente conectado pode reivindicar um clube livre e qualquer um
   pode clicar "jogar rodada" — ela roda pra todo mundo.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const Motor = require('../motor.js');

const PORTA = 3000;
const ARQUIVO_MUNDO = path.join(__dirname, 'mundo.json');

function carregarOuCriarMundo() {
  if (fs.existsSync(ARQUIVO_MUNDO)) {
    const mundo = JSON.parse(fs.readFileSync(ARQUIVO_MUNDO, 'utf8'));
    mundo.times.forEach(t => { if (t.controlador === undefined) t.controlador = null; });
    console.log('Mundo carregado de mundo.json — temporada', mundo.temporada, 'rodada', mundo.rodada + 1);
    return mundo;
  }
  const mundo = Motor.novoJogo(0);
  mundo.times.forEach(t => { t.controlador = null; });
  console.log('Nenhum mundo.json encontrado — mundo novo criado.');
  return mundo;
}

let mundo = carregarOuCriarMundo();

function salvar() {
  fs.writeFileSync(ARQUIVO_MUNDO, JSON.stringify(mundo));
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

  socket.on('jogarRodada', () => {
    if (mundo.fimTemporada) { socket.emit('erro', 'Temporada encerrada — ainda não dá pra iniciar a próxima por aqui.'); return; }
    mundo.meuTime = timeDeReferencia();
    Motor.prepararRodada(mundo);
    simularRodadaCompleta();
    Motor.concluirRodada(mundo);
    salvar();
    io.emit('mundo', mundo);
    console.log('Rodada resolvida — agora em', mundo.rodada + 1);
  });

  socket.on('disconnect', () => console.log('Cliente desconectado:', socket.id));
});

servidorHttp.listen(PORTA, '0.0.0.0', () => {
  console.log(`Servidor no ar em http://localhost:${PORTA}/cliente-teste.html`);
  console.log('(na mesma rede Wi-Fi, dá pra acessar pelo IP desta máquina em vez de localhost)');
});
