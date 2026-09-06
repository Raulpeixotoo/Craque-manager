/* ============================================================
   Servidor multiplayer — agora com vários mundos nomeados em vez de um
   único mundo fixo. Cada mundo é um arquivo em server/mundos/<slug>.json
   e ganha seu próprio socket.io namespace ("/mundo/<slug>"), com todo o
   estado (lobby, partidas ao vivo, timeouts) isolado por mundo — criar
   ou entrar num mundo não afeta os outros.

   Dentro de cada mundo, a lógica é a mesma da Fase 3: cada rodada abre
   em lobby; os clubes reivindicados por humanos marcam "pronto", e a
   rodada só roda quando todos estiverem prontos — ou quando alguém
   força (manualmente ou por timeout), com quem sumiu sendo coberto pela
   própria escalação/decisões já em vigor (equivalente à IA assumir).

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
const MUNDOS_DIR = path.join(__dirname, 'mundos');
if (!fs.existsSync(MUNDOS_DIR)) fs.mkdirSync(MUNDOS_DIR, { recursive: true });
const TIMEOUT_LOBBY_MS = 5 * 60 * 1000; // 5 min sem todo mundo pronto -> força sozinho
const TREINO_PONTOS_POR_RODADA = Motor.TREINO_PONTOS_POR_RODADA; // orçamento de treino de cada clube, renovado a cada rodada — mesma constante do solo
const TICK_MS = 1000; // multiplayer não tem seletor de velocidade — 90min de jogo em ~90s reais
const PAUSA_TIMEOUT_MS = 45 * 1000;

function rodadaEstadoPadrao() {
  return { status: 'lobby', prontos: [], timeoutAt: Date.now() + TIMEOUT_LOBBY_MS };
}

// Nome de exibição -> nome de arquivo seguro (sem acento, minúsculo, só a-z0-9-).
function slugify(nome) {
  return String(nome).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function caminhoMundo(slug) { return path.join(MUNDOS_DIR, slug + '.json'); }

function migrarMundo(mundo) {
  mundo.times.forEach(t => {
    if (t.controlador === undefined) t.controlador = null;
    if (t.pontosTreino === undefined) t.pontosTreino = TREINO_PONTOS_POR_RODADA;
    if (t.ofertaHumana === undefined) t.ofertaHumana = null;
    if (!t.setores) t.setores = Motor.criarSetoresIniciais(t.capacidade);
    if (!t.socios) t.socios = { ativos: Math.round(t.torcida * .1), mensalidade: 40 };
    if (t.patrocinioContrato === undefined) t.patrocinioContrato = t.patrocinio > 0 ? { empresa: Motor.pick(Motor.EMPRESAS_PATROCINIO), duracaoRestante: Motor.rnd(1, 3) } : null;
    // Financas era um log único do mundo inteiro (só do time de referência) — cada
    // clube passou a ter o próprio, senão todo humano via o extrato de outra pessoa
    // no "Movimento por rodada" da aba Finanças.
    if (!t.financas) t.financas = (t.id === mundo.meuTime && mundo.financas) ? mundo.financas : [];
  });
  Object.values(mundo.jogadores).forEach(j => {
    if (!j.dna) { j.personalidade = Motor.pickPersonalidade(); j.dna = Motor.gerarDNA(j.personalidade); }
    if (!j.carreira) j.carreira = { jogos: 0, gols: 0, assistencias: 0, titulos: 0, classicos: 0, temporadasClube: 0 };
    if (!j.historico) j.historico = [];
  });
  mundo.times.forEach(t => { if (!t.idolos) t.idolos = []; });
  if (!mundo.rodadaEstado || mundo.rodadaEstado.status !== 'lobby') {
    // Se o servidor caiu no meio de uma rodada ao vivo, as partidas em memória se
    // perdem — mas os jogos que ainda não têm placar continuam com gc:null no
    // calendário, então a próxima resolução de rodada os recria e simula direitinho.
    mundo.rodadaEstado = rodadaEstadoPadrao();
  }
  return mundo;
}

function listarMundosDisco() {
  if (!fs.existsSync(MUNDOS_DIR)) return [];
  return fs.readdirSync(MUNDOS_DIR).filter(f => f.endsWith('.json')).map(f => {
    const slug = f.replace(/\.json$/, '');
    try {
      const mundo = JSON.parse(fs.readFileSync(caminhoMundo(slug), 'utf8'));
      return {
        slug, nome: mundo.nomeMundo || slug, temporada: mundo.temporada,
        rodada: mundo.rodada + 1, fimTemporada: !!mundo.fimTemporada,
        humanos: mundo.times.filter(t => t.controlador).length,
      };
    } catch (e) { return null; }
  }).filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function criarMundoNovo(nomeExibicao) {
  const nome = String(nomeExibicao || '').trim().slice(0, 60);
  if (!nome) throw new Error('Escolha um nome para o mundo.');
  const slug = slugify(nome);
  if (!slug) throw new Error('Nome inválido — use letras ou números.');
  if (fs.existsSync(caminhoMundo(slug))) throw new Error('Já existe um mundo com esse nome.');
  const mundo = Motor.novoJogo(0);
  mundo.nomeMundo = nome;
  mundo.times.forEach(t => { t.controlador = null; t.pontosTreino = TREINO_PONTOS_POR_RODADA; });
  mundo.rodadaEstado = rodadaEstadoPadrao();
  fs.writeFileSync(caminhoMundo(slug), JSON.stringify(mundo));
  return slug;
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/motor.js', (req, res) => res.sendFile(path.join(__dirname, '..', 'motor.js')));
app.get('/manager-futebol.html', (req, res) => res.sendFile(path.join(__dirname, '..', 'manager-futebol.html')));
app.get('/api/mundos', (req, res) => res.json(listarMundosDisco()));
app.post('/api/mundos', (req, res) => {
  try {
    const slug = criarMundoNovo(req.body && req.body.nome);
    ativarMundo(slug);
    res.json({ slug });
  } catch (e) {
    res.status(400).json({ erro: e.message });
  }
});

const servidorHttp = http.createServer(app);
const io = new Server(servidorHttp);
const mundosAtivos = new Set(); // slugs cujo namespace/lógica já foi montado

// Monta toda a lógica de um mundo específico — lobby, rodadas, partidas ao vivo, ações —
// isolada num namespace próprio ("/mundo/<slug>"), com seu próprio estado em memória
// (mundo, partidasAoVivo, timeouts). Chamar de novo pro mesmo slug não faz nada (já ativo).
function ativarMundo(slug) {
  if (mundosAtivos.has(slug)) return;
  if (!fs.existsSync(caminhoMundo(slug))) throw new Error('Mundo não encontrado.');
  mundosAtivos.add(slug);

  let mundo = migrarMundo(JSON.parse(fs.readFileSync(caminhoMundo(slug), 'utf8')));
  let timeoutHandle = null;
  let partidasAoVivo = null; // array de partidas em andamento, ou null quando não há nenhuma
  let tickHandle = null;
  let naoProntosDaRodada = [];

  function salvar() {
    fs.writeFileSync(caminhoMundo(slug), JSON.stringify(mundo));
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

  function resumoPartida(p) {
    return {
      casaId: p.g.casa, foraId: p.g.fora, min: p.min, gc: p.gc, gf: p.gf, fc: p.fc, ff: p.ff,
      posse: p.posse, eventos: p.eventos, fim: p.fim,
      pausado: p.pausado, pausadoEm: p.pausadoEm, intervaloFeito: p.intervaloFeito,
      subsUsadas: p.subsUsadas, subForcada: p.subForcada,
      acresc1: p.acresc1, acresc2: p.acresc2, ataqueTotal: p.ataqueTotal,
    };
  }

  // Acha os confrontos da rodada onde PELO MENOS UM lado é controlado por um humano e cria
  // as partidas (sem simular nada ainda) — essas ficam de fora do simularRodadaCompleta().
  // subsUsadas/subForcada são por clube (chave = id do time) — cada lado tem seu próprio
  // limite de 5 substituições e sua própria pausa obrigatória por lesão, igual ao solo.
  function iniciarPartidasAoVivo() {
    const jogos = [];
    Motor.CONFEDERACOES.forEach(conf => {
      Object.keys(mundo.calendario[conf]).forEach(div => {
        mundo.calendario[conf][div][mundo.rodada].forEach(g => {
          if (g.gc === null && (mundo.times[g.casa].controlador || mundo.times[g.fora].controlador)) {
            const p = Motor.criarPartida(mundo, g);
            p.pausado = false; p.intervaloFeito = false; p.subsUsadas = {}; p.subForcada = {};
            jogos.push(p);
          }
        });
      });
    });
    return jogos;
  }

  // Acha a partida ao vivo de um clube específico (ou undefined se ele não tem nenhuma agora).
  function partidaDoClube(clubeId) {
    return partidasAoVivo && partidasAoVivo.find(p => p.g.casa === clubeId || p.g.fora === clubeId);
  }

  // Se uma partida fica pausada (intervalo, lesão, ou pausa manual) por tempo demais sem
  // ninguém resolver — desconectou, foi no banheiro, esqueceu — ela destrava sozinha, senão
  // a rodada (e o mundo inteiro, já que todo mundo espera a mesma rodada fechar) trava pra
  // sempre. Mesma filosofia do timeout do lobby, só que bem mais curto.
  function pausar(p) { p.pausado = true; p.pausadoEm = Date.now(); }

  function tickPartidasAoVivo() {
    const agora = Date.now();
    let mudou = false;
    partidasAoVivo.forEach(p => {
      if (p.fim) return;
      if (p.pausado) {
        if (agora - (p.pausadoEm || agora) < PAUSA_TIMEOUT_MS) return;
        p.pausado = false;
        [p.g.casa, p.g.fora].forEach(id => { p.subForcada[id] = null; });
        mudou = true;
      }
      Motor.minuto(mundo, p);
      mudou = true;
      // lesão em time humano pausa a partida pra esse lado pedir substituição — igual ao solo,
      // só que agora por lado, já que os dois times de uma partida podem ser humanos.
      [[p.g.casa, mundo.times[p.g.casa]], [p.g.fora, mundo.times[p.g.fora]]].forEach(([timeId, time]) => {
        if (!time.controlador || p.subForcada[timeId]) return;
        const lesionado = time.titulares.map(id => Motor.J(mundo, id)).find(j => j.lesao > 0);
        if (lesionado) { p.subForcada[timeId] = lesionado.id; pausar(p); }
      });
      if (p.min === 45 + (p.acresc1 || 0) && !p.intervaloFeito) { p.intervaloFeito = true; pausar(p); }
    });
    if (mudou) nsp.emit('partidasAoVivo', partidasAoVivo.map(resumoPartida));
    if (partidasAoVivo.every(p => p.fim)) {
      clearInterval(tickHandle);
      partidasAoVivo = null;
      nsp.emit('partidasAoVivo', []);
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
    nsp.emit('mundo', mundo); // avisa geral que a rodada saiu do lobby
    if (aoVivo.length) {
      partidasAoVivo = aoVivo;
      console.log('[' + slug + ']', aoVivo.length, 'partida(s) ao vivo começando...');
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
    nsp.emit('mundo', mundo);
    console.log('[' + slug + '] Rodada resolvida — agora em', mundo.rodada + 1, naoProntosDaRodada.length ? `(${naoProntosDaRodada.length} sem confirmar)` : '(todos prontos)');
    naoProntosDaRodada = [];
    agendarTimeout();
  }

  // Ações do cliente completo (jogo.html) fora de partida — treino e escalação, que só
  // mexem no clube de quem chamou, então podem virar Motor calls diretas sem trava de
  // concorrência.
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

  // Troca/substituição DURANTE uma partida ao vivo — mesma regra do solo (clicarPartida),
  // só que agora "sai/entra" e o limite de 5 subs são por clube (subsUsadas[clube.id]),
  // já que os dois lados de uma partida podem ser humanos com suas próprias trocas.
  function clicarPartida(clube, p, a, b) {
    const J = id => Motor.J(mundo, id);
    const ia = clube.titulares.indexOf(a), ib = clube.titulares.indexOf(b);
    if (ia >= 0 && ib >= 0) {
      if (J(a).suspenso || J(b).suspenso) throw new Error('Jogador expulso não pode trocar de posição — o time joga com um a menos.');
      clube.titulares[ia] = b; clube.titulares[ib] = a;
    } else if (ia >= 0 || ib >= 0) {
      const entra = ia >= 0 ? b : a, sai = ia >= 0 ? a : b;
      if (J(sai).suspenso) throw new Error('Jogador expulso não pode ser substituído — o time joga com um a menos.');
      if (J(entra).suspenso || J(entra).lesao || J(entra).selecao) throw new Error('Jogador indisponível.');
      if ((p.subsUsadas[clube.id] || 0) >= 5) throw new Error('Limite de 5 substituições atingido.');
      if (ia >= 0) clube.titulares[ia] = b; else clube.titulares[ib] = a;
      p.subsUsadas[clube.id] = (p.subsUsadas[clube.id] || 0) + 1;
      Motor.noticia(mundo, 'Substituição: ' + J(entra).nome + ' entra no lugar de ' + J(sai).nome + ' (' + clube.nome + ').');
      if (p.subForcada[clube.id] === sai) p.subForcada[clube.id] = null;
    } else {
      return; // nem a nem b sao titulares desse clube -- nada a fazer
    }
    const mandante = p.g.casa === clube.id;
    if (mandante) p.H = Motor.forcaTimeAoVivo(mundo, p, clube, true); else p.A = Motor.forcaTimeAoVivo(mundo, p, clube, false);
  }

  function mudarEstiloPartida(clube, p, estilo) {
    clube.estilo = estilo;
    const mandante = p.g.casa === clube.id;
    if (mandante) p.H = Motor.forcaTimeAoVivo(mundo, p, clube, true); else p.A = Motor.forcaTimeAoVivo(mundo, p, clube, false);
  }

  function ativarAtaqueTotal(clube, p) {
    if (!Motor.podeAtaqueTotal(p, clube)) throw new Error('Ataque total só pode ser ativado perdendo ou empatando, depois dos 80 minutos.');
    Motor.ativarAtaqueTotal(mundo, p, clube);
    Motor.noticia(mundo, '🔥 ' + clube.nome + ' vai com tudo pro ataque nos minutos finais!');
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
      const { custo, anos } = Motor.custoRenovacao(j);
      if (clube.caixa < custo) throw new Error('Caixa insuficiente para renovar.');
      clube.caixa -= custo; j.contrato += anos; j.salario = Math.round(j.salario * 1.1 / 1000) * 1000; j.moral = Motor.clamp(j.moral + 10, 0, 100);
      Motor.noticia(mundo, 'Contrato de ' + j.nome + ' renovado por ' + anos + ' anos (' + clube.nome + ').');
    },
    reformarSetor: (clube, p) => {
      const info = Motor.SETORES_ESTADIO[p.setor], s = clube.setores[p.setor];
      if (!info || !s) throw new Error('Setor inválido.');
      const inc = Math.max(100, Math.round(s.lugares * .12 / 100) * 100), custo = inc * 900;
      if (clube.caixa < custo) throw new Error('Caixa insuficiente para a reforma.');
      clube.caixa -= custo; s.lugares += inc; Motor.recalcularCapacidade(clube);
      Motor.noticia(mundo, clube.nome + ': setor ' + info.nome + ' ampliado, agora ' + s.lugares.toLocaleString('pt-BR') + ' lugares.');
    },
    ajustarPrecoSetor: (clube, p) => {
      const info = Motor.SETORES_ESTADIO[p.setor], s = clube.setores[p.setor];
      if (!info || !s) throw new Error('Setor inválido.');
      const min = Math.round(info.precoBase * .5), max = Math.round(info.precoBase * 3);
      s.preco = Motor.clamp(Math.round(Number(p.preco) || 0), min, max);
    },
    ajustarMensalidadeSocios: (clube, p) => {
      clube.socios.mensalidade = Motor.clamp(Math.round(Number(p.valor) || 0), 10, 150);
    },
    buscarPatrocinio: clube => {
      const oferta = Math.round((clube.torcida * .6 + Motor.rnd(5000, 20000)) / 1000) * 1000;
      const empresa = Motor.pick(Motor.EMPRESAS_PATROCINIO), duracao = Motor.rnd(2, 4);
      clube.patrocinio = oferta; clube.patrocinioContrato = { empresa, duracaoRestante: duracao };
      Motor.noticia(mundo, clube.nome + ' fechou novo patrocínio com ' + empresa + ': ' + Motor.fmt(oferta) + ' por rodada, por ' + duracao + ' temporada(s).');
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
    comprar: (clube, p) => {
      if (!mundo.janela.aberta) throw new Error('A janela de transferências está fechada.');
      const j = Motor.J(mundo, p.jogadorId);
      if (!j) throw new Error('Jogador não encontrado.');
      const de = mundo.times[j.time];
      if (de.id === clube.id) throw new Error('Esse jogador já é seu.');
      if (clube.jogadores.length >= 25) throw new Error('Elenco no limite de 25 jogadores.');
      if (de.jogadores.length <= 11) throw new Error(de.nome + ' não pode vender: ficaria sem jogadores suficientes para escalar um time.');
      const preco = Math.round(j.valor * 1.15 / 1e4) * 1e4;
      if (clube.caixa < preco) throw new Error('Caixa insuficiente para essa compra.');
      Motor.transferir(mundo, j, de, clube, preco);
      j.moral = 80;
      Motor.noticia(mundo, clube.nome + ' contratou ' + j.nome + ' (' + j.pos + ', força ' + j.forca + ') por ' + Motor.fmt(preco) + '.');
    },
    vender: (clube, p) => {
      if (!mundo.janela.aberta) throw new Error('A janela de transferências está fechada.');
      const j = Motor.J(mundo, p.jogadorId);
      if (!j || j.time !== clube.id) throw new Error('Esse jogador não é seu.');
      if (clube.titulares.includes(j.id)) throw new Error('Jogador titular precisa sair do time antes de ser vendido.');
      if (clube.jogadores.length <= 16) throw new Error('Elenco no mínimo de 16 jogadores.');
      const preco = Math.round(j.valor * .85 / 1e4) * 1e4;
      // Só vende pra clube controlado por IA — jogar um jogador pra dentro do elenco de outro
      // humano sem ele saber/aceitar seria o mesmo problema do proporOferta (ver abaixo).
      const candidatos = mundo.times.filter(t => t.id !== clube.id && !t.controlador && t.jogadores.length < 25);
      const para = Motor.pick(candidatos);
      if (!para) throw new Error('Nenhum clube disponível pra comprar esse jogador agora.');
      Motor.transferir(mundo, j, clube, para, preco);
      Motor.noticia(mundo, j.nome + ' vendido ao ' + para.nome + ' por ' + Motor.fmt(preco) + ' (' + clube.nome + ').');
    },
    proporOferta: (clube, p) => {
      if (!mundo.janela.aberta) throw new Error('A janela de transferências está fechada.');
      const j = Motor.J(mundo, p.jogadorId);
      if (!j) throw new Error('Jogador não encontrado.');
      const de = mundo.times[j.time];
      if (de.id === clube.id) throw new Error('Esse jogador já é seu.');
      if (clube.jogadores.length >= 25) throw new Error('Elenco no limite de 25 jogadores.');
      if (de.jogadores.length <= 11) throw new Error(de.nome + ' não pode vender: ficaria sem jogadores suficientes para escalar um time.');
      const oferta = Math.round(Number(p.oferta) / 1e4) * 1e4;
      if (!oferta || oferta <= 0) throw new Error('Valor de oferta inválido.');
      if (clube.caixa < oferta) throw new Error('Caixa insuficiente para essa proposta.');
      // Se o dono do jogador é outro humano, a proposta fica pendente pra ELE decidir — não dá
      // pra resolver sozinho com a mesma fórmula usada contra clubes de IA (era isso que fazia
      // o jogador do amigo mudar de mão sem ele ter a chance de aceitar ou recusar).
      if (de.controlador) {
        if (de.ofertaHumana) throw new Error(de.nome + ' já está analisando outra proposta agora.');
        de.ofertaHumana = { jogadorId: j.id, compradorId: clube.id, oferta };
        Motor.noticia(mundo, clube.nome + ' propôs ' + Motor.fmt(oferta) + ' por ' + j.nome + ' ao ' + de.nome + '.');
        return;
      }
      let minimo = j.valor;
      if (de.titulares.includes(j.id)) minimo *= 1.4;
      if (de.jogadores.length <= 17) minimo *= 1.25;
      if (de.caixa < 0) minimo *= .85;
      if (oferta >= minimo) {
        Motor.transferir(mundo, j, de, clube, oferta);
        j.moral = 80;
        Motor.noticia(mundo, 'Proposta aceita! ' + clube.nome + ' contratou ' + j.nome + ' do ' + de.nome + ' por ' + Motor.fmt(oferta) + '.');
      } else {
        throw new Error(de.nome + ' recusou a proposta. Eles pedem pelo menos ' + Motor.fmt(Math.round(minimo / 1e4) * 1e4) + '.');
      }
    },
    resolverOfertaHumana: (clube, p) => {
      const of = clube.ofertaHumana;
      if (!of) return;
      clube.ofertaHumana = null;
      const comprador = mundo.times[of.compradorId];
      const j = Motor.J(mundo, of.jogadorId);
      if (!j || j.time !== clube.id) return; // já não é mais do clube por outro motivo enquanto a proposta esperava
      if (!p.aceitar) { Motor.noticia(mundo, clube.nome + ' recusou a proposta de ' + Motor.fmt(of.oferta) + ' do ' + comprador.nome + ' por ' + j.nome + '.'); return; }
      if (clube.jogadores.length <= 11) { Motor.noticia(mundo, 'Proposta por ' + j.nome + ' caducou: ' + clube.nome + ' ficaria sem jogadores suficientes.'); return; }
      if (comprador.caixa < of.oferta) { Motor.noticia(mundo, 'Proposta por ' + j.nome + ' caducou: ' + comprador.nome + ' não tem mais caixa suficiente.'); return; }
      if (comprador.jogadores.length >= 25) { Motor.noticia(mundo, 'Proposta por ' + j.nome + ' caducou: elenco do ' + comprador.nome + ' está cheio.'); return; }
      Motor.transferir(mundo, j, clube, comprador, of.oferta);
      j.moral = 80;
      Motor.noticia(mundo, 'Negócio fechado! ' + comprador.nome + ' contratou ' + j.nome + ' do ' + clube.nome + ' por ' + Motor.fmt(of.oferta) + '.');
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
    nsp.emit('mundo', mundo);
    console.log('[' + slug + '] Temporada avançada — agora na temporada', mundo.temporada);
    agendarTimeout();
  }

  const nsp = io.of('/mundo/' + slug);
  nsp.on('connection', socket => {
    console.log('[' + slug + '] Cliente conectado:', socket.id);
    socket.emit('mundo', mundo);
    if (partidasAoVivo) socket.emit('partidasAoVivo', partidasAoVivo.map(resumoPartida));

    socket.on('entrar', ({ clubeId, apelido }) => {
      const time = mundo.times[clubeId];
      if (!time) { socket.emit('erro', 'Clube não existe.'); return; }
      if (time.controlador !== null) { socket.emit('erro', 'Esse clube já foi reivindicado por ' + time.controlador.nome + '.'); return; }
      if (!apelido || !apelido.trim()) { socket.emit('erro', 'Escolha um apelido.'); return; }
      time.controlador = { nome: apelido.trim() };
      salvar();
      nsp.emit('mundo', mundo);
      console.log('[' + slug + ']', apelido.trim(), 'reivindicou', time.nome);
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
      nsp.emit('mundo', mundo);
      const humanos = timesHumanos();
      if (humanos.length && humanos.every(t => prontos.includes(t.id))) {
        resolverRodadaAgora();
      }
    });

    socket.on('chatMensagem', ({ clubeId, msg }) => {
      const time = mundo.times[clubeId];
      if (!time || time.controlador === null) { socket.emit('erro', 'Reivindique um clube antes de falar no chat.'); return; }
      const texto = String(msg || '').trim().slice(0, 300);
      if (!texto) return;
      nsp.emit('chatMensagem', { nome: time.controlador.nome, msg: texto });
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
        nsp.emit('mundo', mundo);
      } catch (e) {
        socket.emit('erro', e.message);
      }
    });

    // Controles de partida ao vivo — pausar/retomar/substituir/mudar estilo, igual ao solo,
    // só que cada humano controla só o próprio lado (o outro pode ser IA ou outro humano).
    socket.on('partidaPausar', ({ clubeId }) => {
      const p = partidaDoClube(clubeId);
      if (!p) { socket.emit('erro', 'Você não tem partida ao vivo agora.'); return; }
      pausar(p);
      nsp.emit('partidasAoVivo', partidasAoVivo.map(resumoPartida));
    });

    socket.on('partidaRetomar', ({ clubeId }) => {
      const p = partidaDoClube(clubeId);
      if (!p) { socket.emit('erro', 'Você não tem partida ao vivo agora.'); return; }
      if (p.subForcada[clubeId]) { socket.emit('erro', 'Resolva a substituição obrigatória antes de continuar.'); return; }
      p.pausado = false;
      nsp.emit('partidasAoVivo', partidasAoVivo.map(resumoPartida));
    });

    socket.on('partidaSubstituir', ({ clubeId, a, b }) => {
      const clube = mundo.times[clubeId];
      const p = partidaDoClube(clubeId);
      if (!clube || !p) { socket.emit('erro', 'Você não tem partida ao vivo agora.'); return; }
      if (!p.pausado) { socket.emit('erro', 'Pause a partida antes de mexer no time.'); return; }
      try {
        clicarPartida(clube, p, a, b);
        salvar();
        nsp.emit('mundo', mundo);
        nsp.emit('partidasAoVivo', partidasAoVivo.map(resumoPartida));
      } catch (e) {
        socket.emit('erro', e.message);
      }
    });

    socket.on('partidaLiberarSemSubstituir', ({ clubeId }) => {
      const p = partidaDoClube(clubeId);
      if (!p) { socket.emit('erro', 'Você não tem partida ao vivo agora.'); return; }
      p.subForcada[clubeId] = null;
      nsp.emit('partidasAoVivo', partidasAoVivo.map(resumoPartida));
    });

    socket.on('partidaMudarEstilo', ({ clubeId, estilo }) => {
      const clube = mundo.times[clubeId];
      const p = partidaDoClube(clubeId);
      if (!clube || !p) { socket.emit('erro', 'Você não tem partida ao vivo agora.'); return; }
      mudarEstiloPartida(clube, p, estilo);
      salvar();
      nsp.emit('mundo', mundo);
      nsp.emit('partidasAoVivo', partidasAoVivo.map(resumoPartida));
    });

    socket.on('partidaAtaqueTotal', ({ clubeId }) => {
      const clube = mundo.times[clubeId];
      const p = partidaDoClube(clubeId);
      if (!clube || !p) { socket.emit('erro', 'Você não tem partida ao vivo agora.'); return; }
      try {
        ativarAtaqueTotal(clube, p);
        salvar();
        nsp.emit('mundo', mundo);
        nsp.emit('partidasAoVivo', partidasAoVivo.map(resumoPartida));
      } catch (e) {
        socket.emit('erro', e.message);
      }
    });

    socket.on('disconnect', () => console.log('[' + slug + '] Cliente desconectado:', socket.id));
  });

  agendarTimeout();
}

// Ativa todos os mundos que já existem em disco ao subir o servidor, pra lobbies/timeouts
// continuarem funcionando depois de um restart sem precisar de ninguém visitar a URL antes.
listarMundosDisco().forEach(m => {
  try { ativarMundo(m.slug); } catch (e) { console.error('Erro ativando mundo', m.slug, e); }
});

servidorHttp.listen(PORTA, '0.0.0.0', () => {
  console.log(`Servidor no ar em http://localhost:${PORTA}/`);
  console.log('(na mesma rede Wi-Fi, dá pra acessar pelo IP desta máquina em vez de localhost)');
});
