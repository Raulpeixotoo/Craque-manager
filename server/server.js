/* ============================================================
   Servidor — Fase 3 do plano de multiplayer (partidas humano x
   humano ao vivo). Guarda um único mundo compartilhado. Cada
   rodada abre em lobby; os clubes reivindicados por humanos marcam
   "pronto", e a rodada só roda quando todos estiverem prontos — ou
   quando alguém força (manualmente ou por timeout), com quem sumiu
   sendo coberto pela própria escalação/decisões já em vigor
   (equivalente à IA assumir).

   Ao rodar, qualquer confronto onde PELO MENOS UM lado é controlado
   por um humano vira uma partida ao vivo: minuto a minuto, via
   Motor.minuto() no mesmo ritmo do jogo solo, transmitida por
   socket.io (evento "partidasAoVivo") até os 90'. Só jogos IA x IA
   continuam resolvidos na hora (ninguém precisa ver a bola rolar
   num jogo que não envolve nenhum humano).

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
const TREINO_PONTOS_POR_RODADA = 10; // orçamento de treino de cada clube, renovado a cada rodada

function rodadaEstadoPadrao() {
  return { status: 'lobby', prontos: [], timeoutAt: Date.now() + TIMEOUT_LOBBY_MS };
}

function carregarOuCriarMundo() {
  if (fs.existsSync(ARQUIVO_MUNDO)) {
    const mundo = JSON.parse(fs.readFileSync(ARQUIVO_MUNDO, 'utf8'));
    mundo.times.forEach(t => { if (t.controlador === undefined) t.controlador = null; if (t.pontosTreino === undefined) t.pontosTreino = TREINO_PONTOS_POR_RODADA; });
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
  mundo.times.forEach(t => { t.controlador = null; t.pontosTreino = TREINO_PONTOS_POR_RODADA; });
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
  return { casaId: p.g.casa, foraId: p.g.fora, min: p.min, gc: p.gc, gf: p.gf, fc: p.fc, ff: p.ff, posse: p.posse, eventos: p.eventos, fim: p.fim };
}

// Acha os confrontos da rodada onde PELO MENOS UM lado é controlado por um humano e cria
// as partidas (sem simular nada ainda) — essas ficam de fora do simularRodadaCompleta().
// Antes só virava "ao vivo" quando os dois lados eram humanos; times de IA resolviam na
// hora sem transmitir nada, o que ficava estranho pra quem só quer ver o próprio jogo
// rolando bola. Agora todo humano vê a própria partida ao vivo, seja o adversário quem for.
function iniciarPartidasAoVivo() {
  const jogos = [];
  Motor.CONFEDERACOES.forEach(conf => {
    Object.keys(mundo.calendario[conf]).forEach(div => {
      mundo.calendario[conf][div][mundo.rodada].forEach(g => {
        if (g.gc === null && (mundo.times[g.casa].controlador || mundo.times[g.fora].controlador)) {
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

// Motor.concluirRodada() só noticia o jogo de "meuTime" (o time de referência) — no
// solo só existe um time humano, então faz sentido; aqui pode ter vários, e cada um
// merece ver o resultado do próprio jogo na notícia, não só quem virou referência.
function jogoNaRodada(t, rodada) {
  return mundo.calendario[t.conf][t.div][rodada].find(g => g.casa === t.id || g.fora === t.id);
}
function noticiarPartidasDosHumanos(rodadaJogada) {
  const jaNoticiado = new Set();
  const jogoRef = jogoNaRodada(mundo.times[mundo.meuTime], rodadaJogada);
  jaNoticiado.add(jogoRef.casa + '-' + jogoRef.fora); // esse já foi noticiado pelo Motor.concluirRodada
  timesHumanos().forEach(t => {
    if (t.id === mundo.meuTime) return; // esse já foi noticiado pelo Motor.concluirRodada
    const jogo = jogoNaRodada(t, rodadaJogada);
    const chave = jogo.casa + '-' + jogo.fora;
    if (jaNoticiado.has(chave)) return; // evita duplicar quando os dois lados são humanos
    jaNoticiado.add(chave);
    const H = mundo.times[jogo.casa], A = mundo.times[jogo.fora];
    const comExpulsao = jogo.eventos.some(e => e.tipo === 'vermelho');
    Motor.noticia(mundo, H.nome + ' ' + jogo.gc + ' x ' + jogo.gf + ' ' + A.nome + (comExpulsao ? ' (com expulsão)' : ''));
  });
}

// Motor.concluirRodada() já avança os continentais de toda confederação DIFERENTE da
// de "meuTime" (a dele fica pro botão de "jogar copa ao vivo" do solo, que este cliente
// não tem) e dispara o Mundial quando todos tiverem campeão. Só faltam dois casos:
// o continental da PRÓPRIA confederação de referência, e a Copa Nacional (bracket único,
// nunca tocado por concluirRodada). Resolvendo esses dois aqui, antes, o check de
// "todo mundo já tem campeão continental" do próprio concluirRodada já enxerga certo.
function avancarCompeticoesEliminatorias() {
  const contRef = mundo.continentais[mundo.times[mundo.meuTime].conf];
  if (contRef && contRef.campeao == null && contRef.jogos.length && mundo.rodada >= contRef.rodadaAlvo) {
    Motor.jogarFaseMataMata(mundo, contRef);
  }
  const copa = mundo.copa;
  if (copa && copa.campeao == null && copa.jogos.length && mundo.rodada >= copa.rodadaAlvo) {
    Motor.jogarFaseMataMata(mundo, copa);
  }
}

// Motor.concluirRodada() só decai o treino (pra 40%, toda rodada) do time de referência —
// no solo só existe um time treinando. Aqui, todo clube humano treina, então todo clube
// humano precisa decair — e todo mundo ganha de volta o orçamento de pontos pra próxima.
function decairTreinoEDarPontos() {
  timesHumanos().forEach(t => {
    if (t.id !== mundo.meuTime) {
      t.treino = {
        passe: Math.round(t.treino.passe * .4),
        falta: Math.round(t.treino.falta * .4),
        penalti: Math.round(t.treino.penalti * .4),
        fisico: Math.round(t.treino.fisico * .4),
      };
    }
    t.pontosTreino = TREINO_PONTOS_POR_RODADA;
  });
}

// Chamada depois que toda partida ao vivo (se houve alguma) já terminou — resolve o
// resto do mundo e reabre o lobby pra próxima rodada.
function finalizarRodada() {
  const rodadaJogada = mundo.rodada;
  simularRodadaCompleta();
  avancarCompeticoesEliminatorias();
  Motor.concluirRodada(mundo); // aqui dentro mundo.rodada já avança pra próxima
  decairTreinoEDarPontos();
  const rodadaSeguinte = mundo.rodada;
  mundo.rodada = rodadaJogada; // Motor.noticia() rotula com mundo.rodada — volta pro valor certo
  noticiarPartidasDosHumanos(rodadaJogada);
  mundo.rodada = rodadaSeguinte;
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

// Ações do cliente completo (jogo.html) fora de partida — treino e escalação, que só
// mexem no clube de quem chamou, então podem virar Motor calls diretas sem trava de
// concorrência. Mercado fica de fora por enquanto (ver plano da Fase 5).
function escalarTrocar(clube, a, b) {
  const J = id => Motor.J(mundo, id);
  const ia = clube.titulares.indexOf(a), ib = clube.titulares.indexOf(b);
  if (ia >= 0 && ib >= 0) { clube.titulares[ia] = b; clube.titulares[ib] = a; return; }
  if (ia >= 0) {
    if (J(b).suspenso || J(b).lesao || J(b).selecao) throw new Error('Jogador suspenso, lesionado ou convocado não pode entrar.');
    clube.titulares[ia] = b; return;
  }
  if (ib >= 0) {
    if (J(a).suspenso || J(a).lesao || J(a).selecao) throw new Error('Jogador suspenso, lesionado ou convocado não pode entrar.');
    clube.titulares[ib] = a; return;
  }
}
const ACOES = {
  mudarFormacao: (clube, p) => { clube.formacao = p.formacao; Motor.autoEscalar(mundo, clube); },
  mudarEstilo: (clube, p) => { clube.estilo = p.estilo; },
  autoEscalar: clube => Motor.autoEscalar(mundo, clube),
  escalarTrocar: (clube, p) => escalarTrocar(clube, p.a, p.b),
  treinar: (clube, p) => {
    if (mundo.fimTemporada) throw new Error('Temporada encerrada.');
    if ((clube.pontosTreino || 0) <= 0) throw new Error('Sem pontos de treino sobrando nesta rodada.');
    clube.pontosTreino--;
    Motor.treinar(mundo, clube.id, p.tipo);
  },
  renovar: (clube, p) => {
    const j = Motor.J(mundo, p.jogadorId);
    const custo = Math.round(j.valor * .15 / 1e4) * 1e4, anos = Motor.rnd(2, 4);
    if (clube.caixa < custo) throw new Error('Caixa insuficiente para renovar.');
    clube.caixa -= custo; j.contrato += anos; j.salario = Math.round(j.salario * 1.1 / 1000) * 1000; j.moral = Motor.clamp(j.moral + 10, 0, 100);
    Motor.noticia(mundo, 'Contrato de ' + j.nome + ' renovado por ' + anos + ' anos (' + clube.nome + ').');
  },
  reformarEstadio: clube => {
    const inc = Math.round(clube.capacidade * .12 / 500) * 500, custo = inc * 900;
    if (clube.caixa < custo) throw new Error('Caixa insuficiente para a reforma.');
    clube.caixa -= custo; clube.capacidade += inc;
    Motor.noticia(mundo, clube.nome + ': estádio reformado, capacidade agora é ' + clube.capacidade.toLocaleString('pt-BR') + ' lugares.');
  },
  buscarPatrocinio: (clube, p) => {
    clube.patrocinio = p.oferta;
    Motor.noticia(mundo, clube.nome + ' fechou novo patrocínio: ' + Motor.fmt(p.oferta) + ' por rodada.');
  },
  investirBase: clube => {
    if (clube.baseNivel >= 3) throw new Error('Nível máximo já investido.');
    const custo = (clube.baseNivel + 1) * 1.2e6;
    if (clube.caixa < custo) throw new Error('Caixa insuficiente.');
    clube.caixa -= custo; clube.baseNivel++;
    Motor.noticia(mundo, clube.nome + ': categoria de base reforçada, agora nível ' + clube.baseNivel + '.');
  },
  contratarStaff: (clube, p) => {
    const nivel = clube.staff[p.area];
    if (nivel >= 3) throw new Error('Nível máximo já contratado.');
    const custo = (nivel + 1) * 1.5e6;
    if (clube.caixa < custo) throw new Error('Caixa insuficiente.');
    clube.caixa -= custo; clube.staff[p.area]++;
    Motor.noticia(mundo, clube.nome + ': comissão técnica reforçada (' + p.area + ' nível ' + clube.staff[p.area] + ').');
  },
  resolverPedido: (clube, p) => {
    if (clube.id !== mundo.meuTime || !mundo.pedidoPendente) return;
    const ped = mundo.pedidoPendente, j = Motor.J(mundo, ped.jogadorId);
    if (p.aceitar) { j.salario += ped.aumento; j.moral = Motor.clamp(j.moral + 20, 0, 100); Motor.noticia(mundo, clube.nome + ' aceitou o pedido de aumento de ' + j.nome + '.'); }
    else { j.moral = Motor.clamp(j.moral - 15, 0, 100); Motor.noticia(mundo, j.nome + ' ficou insatisfeito após a recusa do pedido de aumento (' + clube.nome + ').'); }
    mundo.pedidoPendente = null;
  },
  resolverOferta: (clube, p) => {
    if (clube.id !== mundo.meuTime || !mundo.ofertaPendente) return;
    const of = mundo.ofertaPendente, j = Motor.J(mundo, of.jogadorId), comp = mundo.times[of.compradorId];
    if (p.aceitar) { Motor.transferir(mundo, j, clube, comp, of.oferta); Motor.noticia(mundo, j.nome + ' vendido ao ' + comp.nome + ' por ' + Motor.fmt(of.oferta) + ' (oferta recebida).'); }
    else Motor.noticia(mundo, clube.nome + ' recusou a oferta de ' + Motor.fmt(of.oferta) + ' do ' + comp.nome + ' por ' + j.nome + '.');
    mundo.ofertaPendente = null;
  },
};

// Motor.novaTemporada() já atualiza o mundo inteiro corretamente pra todo mundo (acesso e
// rebaixamento em todas as divisões, elenco de todos os times envelhecendo) — só a
// notícia de título/torcida e a base de categoria são específicas do time de referência
// (ver memória do projeto). Isso ainda não está 100% por perspectiva, mas destrava todo
// mundo pra seguir jogando em vez de ficar preso na tela de fim de temporada.
function avancarTemporada() {
  const divAntes = {};
  timesHumanos().forEach(t => { divAntes[t.id] = t.div; });
  Motor.novaTemporada(mundo);
  const ordem = ['A', 'B', 'C', 'D'];
  timesHumanos().forEach(t => {
    if (t.id === mundo.meuTime) return; // esse já foi noticiado pelo próprio Motor.novaTemporada
    if (t.div !== divAntes[t.id]) {
      const subiu = ordem.indexOf(t.div) < ordem.indexOf(divAntes[t.id]);
      Motor.noticia(mundo, t.nome + (subiu ? ' subiu' : ' caiu') + ' pra Série ' + t.div + '.');
    }
  });
  mundo.rodadaEstado = rodadaEstadoPadrao();
  salvar();
  io.emit('mundo', mundo);
  console.log('Temporada avançada — agora na temporada', mundo.temporada);
  agendarTimeout();
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/motor.js', (req, res) => res.sendFile(path.join(__dirname, '..', 'motor.js')));
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

  socket.on('avancarTemporada', () => {
    if (!mundo.fimTemporada) { socket.emit('erro', 'A temporada ainda não terminou.'); return; }
    avancarTemporada();
  });

  socket.on('acao', ({ clubeId, tipo, params }) => {
    const clube = mundo.times[clubeId];
    if (!clube || clube.controlador === null) { socket.emit('erro', 'Reivindique um clube antes.'); return; }
    const handler = ACOES[tipo];
    if (!handler) { socket.emit('erro', 'Ação desconhecida: ' + tipo); return; }
    try {
      handler(clube, params || {});
      salvar();
      io.emit('mundo', mundo);
    } catch (e) {
      socket.emit('erro', e.message);
    }
  });

  socket.on('disconnect', () => console.log('Cliente desconectado:', socket.id));
});

agendarTimeout();

servidorHttp.listen(PORTA, '0.0.0.0', () => {
  console.log(`Servidor no ar em http://localhost:${PORTA}/cliente-teste.html`);
  console.log('(na mesma rede Wi-Fi, dá pra acessar pelo IP desta máquina em vez de localhost)');
});
