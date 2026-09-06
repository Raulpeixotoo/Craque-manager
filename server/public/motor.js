/* ============================================================
   MOTOR — dados do mundo, geração, simulação e economia do
   Craque Manager. Sem DOM, sem localStorage, sem alert/confirm/
   prompt, sem referência a "ui" ou "render()". Toda função que
   precisa do estado do jogo recebe `state` como primeiro
   argumento explícito — é assim que o servidor (Fase 1 do plano
   de multiplayer) vai chamar essas mesmas funções.

   Funciona tanto num <script> de navegador (vira window.Motor, como sempre) quanto num
   require() do Node (servidor da Fase 1) — a casca abaixo só decide onde pendurar o
   resultado; nenhuma linha de lógica do motor muda entre os dois ambientes.
   ============================================================ */
(function(){
const Motor = (function(){

/* ============ UTILIDADES ============ */
const rnd=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const pick=a=>a[Math.floor(Math.random()*a.length)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const preencher=(frase,subs)=>Object.entries(subs).reduce((f,[k,v])=>f.replace('{'+k+'}',v),frase);
const fmt=v=>{const s=v<0?'-':'';v=Math.abs(v);return 'R$ '+s+(v>=1e6?(v/1e6).toFixed(1).replace('.',',')+'M':Math.round(v/1e3)+'k');};

/* ============ DADOS BASE (fictícios) ============ */
const NOMES=['Rafael','Lucas','Gabriel','Matheus','Bruno','Diego','Thiago','Felipe','Caio','Vitor','André','Pedro','João','Luan','Igor','Danilo','Renan','Éder','Wesley','Jonas','Marcos','Alan','Fábio','Hugo','Nathan','Otávio','Paulo','Raul','Samuel','Tales','Yuri','Wagner','Léo','Everton','Gustavo','Henrique','Kaio','Murilo','Rodrigo','Cauã','Enzo','Davi','Ícaro','Jefferson','Maicon','Nilton','Ramon','Sandro','Vinícius','Zé'];
const SOBRENOMES=['Silva','Santos','Oliveira','Souza','Lima','Pereira','Costa','Ribeiro','Almeida','Nunes','Carvalho','Araújo','Barbosa','Rocha','Dias','Moreira','Teixeira','Correia','Cardoso','Vieira','Monteiro','Freitas','Ramos','Batista','Xavier','Duarte','Peixoto','Guedes','Farias','Lopes','Mendes','Cunha','Pinto','Tavares','Brito','Amaral','Bezerra','Sales','Neves','Quaresma'];
const APELIDOS=['Tico','Bibi','Dudu','Juninho','Nenê','Pipoca','Zico','Cacá','Bahia','Careca','Magrão','Índio','Paulão','Pintinho','Gaúcho','Mineiro','Baiano','Cearense','Paraense','Capixaba'];
const POSICOES=['GOL','ZAG','LAT','VOL','MEI','ATA'];
const ELENCO_BASE=[['GOL',2],['ZAG',4],['LAT',3],['VOL',3],['MEI',5],['ATA',5]];
const TIMES_BASE=[
 // Série A
 {nome:'Atlântico FC',cidade:'Recife',cor1:'#c8102e',cor2:'#ffffff',forca:80,torcida:42000,div:'A'},
 {nome:'Serrano EC',cidade:'Petrópolis',cor1:'#1a1a1a',cor2:'#ffffff',forca:78,torcida:38000,div:'A'},
 {nome:'Marítimo AC',cidade:'Salvador',cor1:'#005baa',cor2:'#ffffff',forca:76,torcida:45000,div:'A'},
 {nome:'Cruzada FC',cidade:'Belo Horizonte',cor1:'#1e3a8a',cor2:'#ffffff',forca:77,torcida:40000,div:'A'},
 {nome:'Estrela do Norte',cidade:'Belém',cor1:'#0a7d3c',cor2:'#ffffff',forca:74,torcida:36000,div:'A'},
 {nome:'Vale Verde',cidade:'Caxias do Sul',cor1:'#0f6b3a',cor2:'#f5c518',forca:73,torcida:22000,div:'A'},
 {nome:'União Litoral',cidade:'Santos',cor1:'#ffffff',cor2:'#000000',forca:75,torcida:30000,div:'A'},
 {nome:'Sertão FC',cidade:'Campina Grande',cor1:'#e05a00',cor2:'#000000',forca:71,torcida:24000,div:'A'},
 {nome:'Caravelas AC',cidade:'Porto Seguro',cor1:'#7b1fa2',cor2:'#ffffff',forca:72,torcida:20000,div:'A'},
 {nome:'Pampa EC',cidade:'Pelotas',cor1:'#b71c1c',cor2:'#1a237e',forca:73,torcida:26000,div:'A'},
 {nome:'Cerrado SC',cidade:'Goiânia',cor1:'#2e7d32',cor2:'#ffffff',forca:70,torcida:21000,div:'A'},
 {nome:'Lagoa Azul',cidade:'Florianópolis',cor1:'#0288d1',cor2:'#ffffff',forca:71,torcida:19000,div:'A'},
 // Série B
 {nome:'Planalto FC',cidade:'Brasília',cor1:'#f5c518',cor2:'#1a237e',forca:68,torcida:18000,div:'B'},
 {nome:'Cachoeira EC',cidade:'Blumenau',cor1:'#00695c',cor2:'#ffffff',forca:66,torcida:14000,div:'B'},
 {nome:'Baía Real',cidade:'Vitória',cor1:'#0d47a1',cor2:'#f5c518',forca:67,torcida:16000,div:'B'},
 {nome:'Mineração FC',cidade:'Ouro Preto',cor1:'#212121',cor2:'#f5c518',forca:65,torcida:12000,div:'B'},
 {nome:'Pantanal EC',cidade:'Cuiabá',cor1:'#fdd835',cor2:'#2e7d32',forca:64,torcida:11000,div:'B'},
 {nome:'Ferrovia do Vale',cidade:'Juiz de Fora',cor1:'#8d6e63',cor2:'#ffffff',forca:66,torcida:13000,div:'B'},
 {nome:'Chapada AC',cidade:'Lençóis',cor1:'#bf360c',cor2:'#ffffff',forca:63,torcida:9000,div:'B'},
 {nome:'Mangue FC',cidade:'Olinda',cor1:'#004d40',cor2:'#ff7043',forca:65,torcida:15000,div:'B'},
 {nome:'Porto Seco',cidade:'Uberlândia',cor1:'#37474f',cor2:'#ff5252',forca:62,torcida:10000,div:'B'},
 {nome:'Araucária EC',cidade:'Curitiba',cor1:'#1b5e20',cor2:'#ffffff',forca:67,torcida:17000,div:'B'},
 {nome:'Delta FC',cidade:'Parnaíba',cor1:'#01579b',cor2:'#ffffff',forca:61,torcida:8000,div:'B'},
 {nome:'Colinas SC',cidade:'Jundiaí',cor1:'#ad1457',cor2:'#ffffff',forca:64,torcida:12000,div:'B'},
];
/* ============ MUNDO (confederações, geradas) ============ */
const CONFEDERACOES=['SA','EU','AF','AS','NA'];
const CONF_NOME={SA:'América do Sul',EU:'Europa',AF:'África',AS:'Ásia',NA:'América do Norte'};
const CIDADES_MUNDO={
  SA:['Manaus','São Luís','Aracaju','Teresina','Natal','Maceió','João Pessoa','Palmas','Boa Vista','Macapá','Rio Branco','Porto Velho','Vitória da Conquista','Feira de Santana','Ilhéus','Uberaba','Londrina','Maringá','Ribeirão Preto','Sorocaba','Piracicaba','Bauru','Marília','Franca'],
  EU:['Madrid','Barcelona','Milão','Roma','Turim','Munique','Berlim','Londres','Manchester','Liverpool','Paris','Lyon','Marselha','Lisboa','Porto','Amsterdã','Roterdã','Bruxelas','Viena','Zurique','Praga','Varsóvia','Atenas','Estocolmo'],
  AF:['Cairo','Lagos','Joanesburgo','Casablanca','Acra','Túnis','Argel','Nairóbi','Adis Abeba','Dakar','Abidjan','Kinshasa','Rabat','Trípoli','Luanda','Maputo','Kampala','Lusaka','Harare','Bamako','Cotonou','Yaoundé','Douala','Conacri'],
  AS:['Tóquio','Seul','Xangai','Pequim','Bangkok','Jacarta','Riade','Doha','Dubai','Teerã','Mumbai','Nova Deli','Manila','Hanói','Cantão','Osaka','Busan','Taipei','Cingapura','Kuala Lumpur','Abu Dhabi','Amã','Bagdá','Tashkent'],
  NA:['Nova York','Los Angeles','Chicago','Toronto','Vancouver','Cidade do México','Guadalajara','Monterrey','Miami','Houston','Atlanta','Seattle','Boston','Montreal','Dallas','San Francisco','Denver','Orlando','Portland','Kansas City','Columbus','Nashville','Salt Lake City','Cincinnati'],
};
const SUFIXOS_POR_CONF={
  SA:['EC','FC','AC','SC','AA'],
  EU:['FC','United','City','Athletic','SC','Real','Rovers','Town'],
  AF:['FC','SC','AC','United','City','Sporting'],
  AS:['FC','SC','AC','United','City','Athletic'],
  NA:['FC','SC','United','City','Athletic','Town'],
};
function gerarClubesConfederacao(conf,cidades,forcaBase,tiers){
  const sufixos=SUFIXOS_POR_CONF[conf];
  const cores=['#c8102e','#1a1a1a','#005baa','#1e3a8a','#0a7d3c','#0f6b3a','#e05a00','#7b1fa2','#b71c1c','#2e7d32','#0288d1','#f5c518','#00695c','#0d47a1','#212121','#fdd835','#8d6e63','#bf360c','#004d40','#37474f','#1b5e20','#01579b','#ad1457','#6a1b9a'];
  const porCidade=Math.round((tiers.length*12)/cidades.length),times=[];
  cidades.forEach((cidade,i)=>{
    for(let k=0;k<porCidade;k++){
      const idx=i*porCidade+k,tierIdx=Math.min(tiers.length-1,Math.floor(idx/12)),div=tiers[tierIdx];
      const nome=cidade+' '+sufixos[(i+k)%sufixos.length];
      const cor1=cores[idx%cores.length],cor2=idx%2?'#ffffff':'#000000';
      const forca=clamp(forcaBase-tierIdx*7+rnd(-4,4),42,90);
      const torcida=Math.max(3000,Math.round(forcaBase*380-tierIdx*3500+rnd(-2000,2000)));
      times.push({nome,cidade,cor1,cor2,forca,torcida,div,conf});
    }
  });
  return times;
}
function garantirNomesClubes(times){
  const usados=new Map();
  times.forEach(t=>{
    const chave=(t.conf||'SA')+'|'+t.div+'|'+t.nome;
    const n=(usados.get(chave)||0)+1;usados.set(chave,n);
    if(n>1)t.nome+=' '+String.fromCharCode(64+n);
  });
  return times;
}
const TIMES_MUNDO=gerarClubesConfederacao('SA',CIDADES_MUNDO.SA,55,['C','D'])
  .concat(gerarClubesConfederacao('EU',CIDADES_MUNDO.EU,76,['A','B','C','D']))
  .concat(gerarClubesConfederacao('AF',CIDADES_MUNDO.AF,66,['A','B','C','D']))
  .concat(gerarClubesConfederacao('AS',CIDADES_MUNDO.AS,68,['A','B','C','D']))
  .concat(gerarClubesConfederacao('NA',CIDADES_MUNDO.NA,70,['A','B','C','D']));
const RODADAS_TEMPORADA=(12-1)*2;
const DIAS_ENTRE_RODADAS=4;
const TREINO_PONTOS_POR_RODADA=10;
function diaDaRodada(r){return (r+1)*(DIAS_ENTRE_RODADAS+1);}
const CAIXA_TIER={A:[18,40],B:[8,18],C:[3,7],D:[1,3]};
const CAIXA_BONUS_TEMPORADA={A:5e6,B:2e6,C:1e6,D:.4e6};
const TITULO_PREMIO={A:8e6,B:4e6,C:2e6,D:1e6};
const VICE_PREMIO={A:4e6,B:2e6,C:1e6,D:.5e6};
const BONUS_VITORIA=250000;
const FORMACOES={
 '4-4-2':['GOL','LAT','ZAG','ZAG','LAT','MEI','VOL','VOL','MEI','ATA','ATA'],
 '4-3-3':['GOL','LAT','ZAG','ZAG','LAT','VOL','MEI','MEI','ATA','ATA','ATA'],
 '3-5-2':['GOL','ZAG','ZAG','ZAG','LAT','VOL','MEI','VOL','LAT','ATA','ATA'],
 '4-2-3-1':['GOL','LAT','ZAG','ZAG','LAT','VOL','VOL','MEI','MEI','MEI','ATA'],
 '5-3-2':['GOL','LAT','ZAG','ZAG','ZAG','LAT','VOL','MEI','MEI','ATA','ATA'],
};
const FORMAS_ESCUDO={classico:'M10 3H90V48L50 96L10 48Z',moderno:'M8 5H92V42L50 92L8 42Z',circular:'M50 3A47 47 0 1 1 50 97A47 47 0 1 1 50 3Z',hexagonal:'M50 3L92 25V70L50 94L8 70V25Z',italiano:'M15 3H85V40L50 94L15 40Z'};
const PADROES_ESCUDO={liso:'solid',listras:'stripes',diagonal:'diagonal',metade:'half',quadriculado:'checkered'};
const PALETAS_ESCUDO=[['#c8102e','#111827','#f5c518'],['#005baa','#f2f5ee','#c8102e'],['#0a7d3c','#f5c518','#f2f5ee'],['#212121','#b71c1c','#f2f5ee'],['#7b1fa2','#fdd835','#f2f5ee']];
function escudoSeed(nome){return String(nome).split('').reduce((h,c)=>(h*31+c.charCodeAt(0))|0,7)>>>0;}
function gerarEscudo(time){
  if(time.escudo)return time.escudo;const seed=escudoSeed(time.nome),formas=Object.keys(FORMAS_ESCUDO),padroes=Object.keys(PADROES_ESCUDO),pal=PALETAS_ESCUDO[seed%PALETAS_ESCUDO.length];
  return time.escudo={forma:formas[seed%formas.length],padrao:padroes[Math.floor(seed/7)%padroes.length],cores:{primaria:pal[0],secundaria:pal[1],destaque:pal[2]},elemento:seed%3===0?'estrela':seed%3===1?'bola':null};
}
function renderEscudo(time,tamanho=34){
  const e=gerarEscudo(time),id='escudo-'+(time.id??time.i??escudoSeed(time.nome)),forma=FORMAS_ESCUDO[e.forma]||FORMAS_ESCUDO.classico,c=e.cores||{primaria:time.cor1||'#666',secundaria:time.cor2||'#fff',destaque:'#f5c518'};
  let fundo=`<path d="${forma}" fill="${c.primaria}"/>`;
  if(e.padrao==='stripes')fundo+=`<path d="${forma}" fill="none" stroke="${c.secundaria}" stroke-width="16" stroke-dasharray="10 14" opacity=".55"/>`;
  if(e.padrao==='diagonal')fundo+=`<path d="${forma}" fill="none" stroke="${c.secundaria}" stroke-width="18" transform="rotate(35 50 50)" opacity=".5"/>`;
  if(e.padrao==='half')fundo+=`<path d="M0 0H50V100H0Z" fill="${c.secundaria}" opacity=".45" clip-path="url(#${id})"/>`;
  if(e.padrao==='checkered')fundo+=`<path d="${forma}" fill="none" stroke="${c.secundaria}" stroke-width="12" stroke-dasharray="8 8" opacity=".45"/>`;
  const deco=e.elemento==='estrela'?`<path d="M50 18L56 36H75L60 47L66 65L50 54L34 65L40 47L25 36H44Z" fill="${c.destaque}"/>`:e.elemento==='bola'?`<circle cx="50" cy="43" r="17" fill="none" stroke="${c.destaque}" stroke-width="4"/>`:'';
  return `<span class="escudo-svg" style="width:${tamanho}px;height:${tamanho}px"><svg width="${tamanho}" height="${tamanho}" viewBox="0 0 100 100" aria-label="Escudo do ${String(time.nome).replace(/[<>&\"']/g,'')}"><defs><clipPath id="${id}"><path d="${forma}"/></clipPath></defs>${fundo}${deco}<path d="${forma}" fill="none" stroke="${c.secundaria}" stroke-width="4"/><text x="50" y="86" text-anchor="middle" font-size="14" font-weight="700" fill="${c.destaque}">${String(time.nome).charAt(0).toUpperCase()}</text></svg></span>`;
}
const ATRIBUTOS_BASE=['velocidade','forca','resistencia','agilidade','passe','finalizacao','drible','cabeca','chuteLongo','posicionamento','visao','decisao','lideranca'];
const ATRIBUTOS_POSICAO={GOL:['reflexos','saidaDeGol','jogoComPes','defesaPenaltis','defesaUmContraUm','reposicaoRapida'],ZAG:['marcacao','desarme','antecipacao','bolaAerea','saidaDeBola','posicionamentoDefensivo','cobertura'],LAT:['marcacao','desarme','cruzamento','velocidadeOfensiva','sobreposicao','recomposicao'],VOL:['desarme','interceptacao','passeLongo','coberturaDefensiva','leituraDeJogo','quebraDeLinhas','finalizacaoMedia'],MEI:['visaoDeJogo','passePreciso','dribleHabilidade','criatividade','finalizacaoLonga','bolaParada','pressaoAlta'],ATA:['posicionamentoAtacante','velocidadeExplosiva','dribleCurto','cabecaArea','chuteColocado','movimentacaoSemBola','finalizacaoPrimeiroToque']};
const CARACTERISTICAS_ESPECIAIS={GOL_REFLEXOS_FELINOS:{nome:'Reflexos Felinos',desc:'Reações rápidas em finalizações inesperadas.',tipo:'GOL',bonus:{reflexos:10}},GOL_JOGO_COM_PES:{nome:'Boa saída de bola',desc:'Inicia ataques com passes precisos.',tipo:'GOL',bonus:{jogoComPes:15}},ZAG_MURO:{nome:'Muro Impenetrável',desc:'Excelente no corpo a corpo.',tipo:'ZAG',bonus:{marcacao:12,desarme:8}},LAT_CRUZADOR:{nome:'Cruza na medida',desc:'Cruzamentos precisos.',tipo:'LAT',bonus:{cruzamento:18}},VOL_REGISTA:{nome:'Regista',desc:'Organiza o jogo com passes longos.',tipo:'VOL',bonus:{passeLongo:15,leituraDeJogo:12}},MEI_CRAQUE:{nome:'Maestro',desc:'Enxerga passes geniais.',tipo:'MEI',bonus:{visaoDeJogo:18,criatividade:15}},ATA_MATADOR:{nome:'Matador',desc:'Alta precisão na frente do gol.',tipo:'ATA',bonus:{finalizacao:15,posicionamentoAtacante:10}},UNIVERSAL_LIDER:{nome:'Líder nato',desc:'Motiva o time em momentos difíceis.',tipo:'universal',bonus:{lideranca:20}},UNIVERSAL_VERSATIL:{nome:'Versátil',desc:'Adapta-se a várias posições.',tipo:'universal',bonus:{posicionamento:10,decisao:10}}};
const ESTILOS={ofensivo:{ata:1.12,def:.9,nome:'Ofensivo'},equilibrado:{ata:1,def:1,nome:'Equilibrado'},defensivo:{ata:.9,def:1.12,nome:'Defensivo'}};
const COMPAT={ZAG:{LAT:.9,VOL:.85},LAT:{ZAG:.9,MEI:.85,VOL:.85},VOL:{ZAG:.85,MEI:.9,LAT:.85},MEI:{VOL:.9,ATA:.85,LAT:.85},ATA:{MEI:.85}};
const TV={A:900000,B:400000,C:180000,D:80000};
const NARRADORES=[
  {nome:'Galvão Bueno',bordoes:['Pode comemorar!','Que jogada!']},
  {nome:'Clóvis Rocha',bordoes:['Olha ele aí!','Na ponta dos pés!']},
  {nome:'Lúcia Silva',bordoes:['Precisão cirúrgica.','Visão de jogo extraordinária.']},
  {nome:'Jorge Caldeira',bordoes:['Que golaço!','Inacreditável!']},
];
const FRASES_GOL=['Gol de {jogador}','{jogador} não perdoa e marca','{jogador} balança as redes','{jogador} coloca no fundo da rede','Que finalização de {jogador}! Gol'];
const FRASES_GOL_QUENTE=['GOOOOOOOL de {jogador}','Golaço! {jogador} acerta um golaço de placa','INACREDITÁVEL! {jogador} faz um golaço','Que pintura! {jogador} caprichou'];
const FRASES_AMARELO=['Amarelo para {jogador}','O árbitro mostra o cartão amarelo para {jogador}','Falta dura de {jogador}, amarelo'];
const FRASES_VERMELHO=['Cartão vermelho para {jogador}','Expulso! {jogador} vê o vermelho','Direto pro chuveiro: {jogador} está expulso'];
const FRASES_LESAO=['{jogador} sentiu e deixou o gramado','{jogador} não aguentou e precisou sair','Preocupação: {jogador} pede substituição'];
const FRASES_FINALIZACAO_FORA=['{jogador} finaliza, mas a bola sai pela linha de fundo','Que chance! {jogador} manda para fora','Por pouco! {jogador} desperdiça a oportunidade'];
const FRASES_FINALIZACAO_CIMA=['{jogador} chuta, a bola vai alta','Que exagero! {jogador} manda a bola para as nuvens','A bola sobe, sobe... e vai para fora'];
const FRASES_DEFESA=['Grande defesa do goleiro do {time}','Defesão! Que reflexo do goleiro do {time}','A bola ia entrando, mas o goleiro do {time} está atento'];
const FRASES_TRAVE=['Que azar! A bola bate na trave','A bola explode no travessão! Que susto para o {time}','Por centímetros! A trave salva o {time}'];
const FRASES_ESCANTEIO=['Escanteio para o {time}','Bola pela linha de fundo, escanteio para o {time}'];
const FRASES_IMPEDIMENTO=['Impedimento! {jogador} estava na frente','A bandeirinha marca o impedimento de {jogador}'];
const FRASES_INICIO=['A bola rola! {time} recebe o {adversario}','Começa a partida entre {time} e {adversario}','Tudo pronto para {time} x {adversario}'];
const FRASES_FIM=['Fim de jogo: {time} {gc} x {gf} {adversario}','Apita o árbitro! {time} {gc} x {gf} {adversario}','Termina a partida: {time} {gc} x {gf} {adversario}'];
const SETORES_ESTADIO={
  geral:{nome:'Geral',pct:.55,precoBase:40},
  cadeiras:{nome:'Cadeiras',pct:.28,precoBase:100},
  vip:{nome:'VIP',pct:.12,precoBase:280},
  camarotes:{nome:'Camarotes',pct:.05,precoBase:650},
};
const EMPRESAS_PATROCINIO=['TecnoBank','Vale Motors','AgroSul','Conecta Telecom','Estrela Seguros','Litoral Bebidas','Serra Energia','Aurora Varejo','NorteCom','Ponta Alimentos'];
const TREINOS={passe:'Passes',falta:'Faltas',penalti:'Pênaltis',fisico:'Físico'};
const STAFF_NOMES={fisico:'Preparador físico',goleiro:'Treinador de goleiros',olheiro:'Olheiro-chefe'};
const STAFF_DESC={fisico:'Reduz o risco de lesão em treinos e partidas.',goleiro:'Reforça a defesa da equipe em campo.',olheiro:'Revela o potencial oculto dos jovens do elenco.'};
const FASES_COPA={8:'Oitavas de final',4:'Quartas de final',2:'Semifinal',1:'Final'};
const CLASSICOS=[[0,19],[2,8],[5,9],[3,15],[17,20],[11,13],[6,23]];
function rivalDe(id){const par=CLASSICOS.find(p=>p.includes(id));return par?par.find(x=>x!==id):null;}
function gerarClassicos(times){
  const pares=[];const grupos={};
  times.forEach(t=>{const chave=(t.conf||'SA')+'|'+t.div;(grupos[chave]||(grupos[chave]=[])).push(t.id);});
  Object.values(grupos).forEach(ids=>{ids.sort((a,b)=>a-b);for(let i=0;i+1<ids.length;i+=2)pares.push([ids[i],ids[i+1]]);});
  return pares;
}
function rivalDoEstado(state,id){
  const pares=state.classicos||[];const par=pares.find(x=>x.includes(id));
  return par?par.find(x=>x!==id):rivalDe(id);
}
const TIPOS_FALTA={
  barreira:{nome:'Por cima da barreira',desc:'Chute de efeito clássico por cima da barreira.',chance:.34,
    golTxt:'X cavou a barreira e acertou um chute de efeito por cima — GOOOL!',forTxt:'X mandou por cima do travessão.'},
  rasteira:{nome:'Rasteira com curva',desc:'Batida rasteira e curvada rente ao chão, difícil pro goleiro reagir.',chance:.30,
    golTxt:'X surpreendeu com uma cobrança rasteira e curvada, no cantinho — GOL!',forTxt:'O goleiro se esticou todo e defendeu a cobrança rasteira de X.'},
  cruzamento:{nome:'Cruzar na área',desc:'Não é chute a gol: cruza pra cabeça de um companheiro.',chance:.24,
    golTxt:'X cruzou na área e é CABEÇADA de gol!',forTxt:'X cruzou, mas a zaga adversária afastou o perigo.'},
  ensaiada:{nome:'Jogada ensaiada',desc:'Triangulação rápida antes do chute — risco maior, mas pega o goleiro de surpresa.',chance:.32,
    golTxt:'Jogada ensaiada, o goleiro nem viu — X mandou pra rede. GOLAÇO!',forTxt:'A jogada ensaiada de X não saiu como no treino e a bola sobrou pra defesa.'}
};
const TIPOS_PENALTI={
  esquerdo:{nome:'Canto esquerdo, forte',desc:'Cobrança forte e colocada no canto esquerdo.',chance:.79},
  direito:{nome:'Canto direito, forte',desc:'Cobrança forte e colocada no canto direito.',chance:.79},
  cavadinha:{nome:'Cavadinha no meio',desc:'Toque suave no meio do gol — arriscado se o goleiro não pular.',chance:.72},
  forte:{nome:'Pancada seca no meio',desc:'Chute seco e forte, sem enganar ninguém.',chance:.75}
};
/* Personalidade + DNA oculto (Banco de Ideias, itens 01/03). Personalidade é o traço
   visível na UI; DNA fica só por baixo dos panos, influenciando variação de desempenho,
   moral e negociação — ver gerarForma/treinar/eventoVestiario/custoRenovacao. */
const PERSONALIDADES={
  equilibrado:{nome:'Equilibrado',emoji:'😐',desc:'Sem traço marcante — nem melhora nem atrapalha.',peso:30},
  lider:{nome:'Líder',emoji:'🧭',desc:'Puxa o vestiário; ajuda a moral do elenco quando está em campo.',peso:6},
  temperamental:{nome:'Temperamental',emoji:'🔥',desc:'Reage forte a tudo — moral sobe e desce mais que o normal.',peso:8},
  frio:{nome:'Frio',emoji:'🧊',desc:'Não se abala — joga igual em jogo qualquer e em clássico decisivo.',peso:8},
  mercenario:{nome:'Mercenário',emoji:'💰',desc:'Pouco apegado ao clube — renovações saem mais caras.',peso:7},
  leal:{nome:'Leal',emoji:'🤝',desc:'Vestido com a camisa — renovações saem mais baratas.',peso:8},
  caseiro:{nome:'Caseiro',emoji:'🏠',desc:'Prefere ficar onde está, sem grandes ambições de sair.',peso:6},
  ambicioso:{nome:'Ambicioso',emoji:'📈',desc:'Quer sempre mais — cobra caro pra renovar contrato.',peso:6},
  estrela:{nome:'Estrela',emoji:'⭐',desc:'Rende mais sob pressão, mas fica insatisfeito se sobrar no banco.',peso:5},
  promessa:{nome:'Promessa',emoji:'🌱',desc:'Jovem talento com adaptabilidade acima da média.',peso:6},
  fragil:{nome:'Frágil',emoji:'🍃',desc:'Sente mais a pressão de jogos decisivos.',peso:6},
  inteligente:{nome:'Inteligente',emoji:'🧠',desc:'Profissional e se adapta bem a qualquer sistema tático.',peso:6},
  brincalhao:{nome:'Brincalhão',emoji:'🎭',desc:'Descontraído — ajuda o clima do grupo sem ser um líder de fato.',peso:6},
  timido:{nome:'Tímido',emoji:'🙈',desc:'Reage pouco a incentivo e sofre mais em clássicos.',peso:6}
};
function pickPersonalidade(){
  const chaves=Object.keys(PERSONALIDADES);
  const total=chaves.reduce((s,k)=>s+PERSONALIDADES[k].peso,0);
  let r=Math.random()*total;
  for(const k of chaves){r-=PERSONALIDADES[k].peso;if(r<=0)return k;}
  return 'equilibrado';
}
function gerarDNA(personalidade){
  const dna={consistencia:rnd(30,85),ambicao:rnd(30,85),lealdade:rnd(30,85),pressao:rnd(30,85),profissionalismo:rnd(30,85),adaptabilidade:rnd(30,85)};
  const nudge=(chave,delta)=>dna[chave]=clamp(dna[chave]+delta,10,95);
  switch(personalidade){
    case 'lider':nudge('lealdade',15);nudge('pressao',10);break;
    case 'temperamental':nudge('pressao',-20);nudge('consistencia',-10);break;
    case 'frio':nudge('pressao',20);nudge('consistencia',10);break;
    case 'mercenario':nudge('lealdade',-25);nudge('ambicao',20);break;
    case 'leal':nudge('lealdade',25);nudge('ambicao',-10);break;
    case 'caseiro':nudge('ambicao',-20);nudge('lealdade',10);break;
    case 'ambicioso':nudge('ambicao',25);break;
    case 'estrela':nudge('pressao',15);nudge('ambicao',10);break;
    case 'promessa':nudge('adaptabilidade',20);break;
    case 'fragil':nudge('pressao',-20);break;
    case 'inteligente':nudge('adaptabilidade',15);nudge('profissionalismo',15);break;
    case 'timido':nudge('pressao',-15);nudge('consistencia',-5);break;
  }
  return dna;
}

/* ============ HELPERS INTERNOS DE ESTADO ============ */
const meu=state=>state.times[state.meuTime];
const J=(state,id)=>state.jogadores[id];
function formacaoDoClube(state,t){
  if(t.formacao&&t.formacao.startsWith('custom:')){
    const custom=(t.formacoesCustom||[]).find(f=>f.id===t.formacao.slice(7));
    if(custom)return custom.slots;
  }
  return FORMACOES[t.formacao]||FORMACOES['4-4-2'];
}
function ladoDoSlot(state,t,index){
  const custom=t.formacao&&t.formacao.startsWith('custom:')&&(t.formacoesCustom||[]).find(f=>f.id===t.formacao.slice(7));
  if(custom&&custom.coords&&custom.coords[index])return custom.coords[index].x<45?'E':custom.coords[index].x>55?'D':null;
  const linhas=(t.formacao||'4-4-2').split('-').map(Number);let cursor=1;
  for(const total of linhas){if(index<cursor+total){const ordem=index-cursor;const x=100/(total+1)*(ordem+1);return x<45?'E':x>55?'D':null;}cursor+=total;}
  return null;
}
function bonusPerna(j,pos,lado){if(!lado||!j.perna)return 0;const relevante=pos==='LAT'||pos==='MEI'||pos==='ATA'||pos==='ZAG';return relevante?(j.perna===lado?2.5:-1.5):0;}
function parseValorEntrada(valor){
  let s=String(valor??'').toLowerCase().trim().replace(/r\$|\s/g,'');if(!s)return 0;
  const milhao=/mi|milh/.test(s);s=s.replace(/milh(ões|ao|oes)?|mi/g,'');
  if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
  else if(s.includes(','))s=s.replace(',','.');
  else if((s.match(/\./g)||[]).length>1||/\.\d{3}$/.test(s))s=s.replace(/\./g,'');
  const n=Number(s);if(!Number.isFinite(n))return 0;return Math.round((milhao||n<10000?n*1e6:n)/1e4)*1e4;
}
function salvarFormacaoPersonalizada(state,t,formacao){
  if(!formacao||!formacao.id||!formacao.nome||!Array.isArray(formacao.slots)||formacao.slots.length!==11)return false;
  if(!t.formacoesCustom)t.formacoesCustom=[];
  const existente=t.formacoesCustom.findIndex(f=>f.id===formacao.id);
  const valor={id:formacao.id,nome:String(formacao.nome).slice(0,30),slots:formacao.slots.slice(),coords:(formacao.coords||[]).slice(0,11)};
  if(existente>=0)t.formacoesCustom[existente]=valor;else t.formacoesCustom.push(valor);
  t.formacao='custom:'+valor.id;autoEscalar(state,t);return true;
}
function criarCarreiraTecnico(nome){return{nome:nome||'Treinador',reputacao:50,status:'empregado',historico:[],conquistas:[],temporadas:0,clubes:[],jogos:0,vitorias:0,empates:0,derrotas:0,golsPro:0,golsContra:0,titulos:0,trofeus:[]};}
function registrarConquistaTecnico(tecnico,chave,titulo,descricao,temporada){
  if(!tecnico.conquistas)tecnico.conquistas=[];
  if(tecnico.conquistas.some(x=>x.chave===chave))return;
  tecnico.conquistas.push({chave,titulo,descricao,temporada});
}
function registrarPartidaTecnico(tecnico,venceu,empatou,golsPro,golsContra){
  if(!tecnico)return;
  tecnico.jogos=(tecnico.jogos||0)+1;tecnico.golsPro=(tecnico.golsPro||0)+golsPro;tecnico.golsContra=(tecnico.golsContra||0)+golsContra;
  if(venceu)tecnico.vitorias=(tecnico.vitorias||0)+1;else if(empatou)tecnico.empates=(tecnico.empates||0)+1;else tecnico.derrotas=(tecnico.derrotas||0)+1;
}
function reconstruirEstatisticasTecnico(state,tecnico,clubeId){
  if(!tecnico||tecnico.jogos>0||!state.calendario)return;
  Object.values(state.calendario).forEach(conf=>Object.values(conf).forEach(rodadas=>rodadas.forEach(rodada=>rodada.forEach(jogo=>{
    if(jogo.gc===null||(jogo.casa!==clubeId&&jogo.fora!==clubeId))return;
    const casa=jogo.casa===clubeId,pro=casa?jogo.gc:jogo.gf,contra=casa?jogo.gf:jogo.gc;
    registrarPartidaTecnico(tecnico,pro>contra,pro===contra,pro,contra);
  }))));
}
function gerarOfertasEmprego(state){
  const m=meu(state),rep=state.tecnico.reputacao;
  return state.times.filter(t=>t.id!==m.id).map(t=>{
    const dificuldade=t.div<m.div?18:t.div===m.div?8:-8;
    const exigencia=clamp(35+(t.forca-m.forca)*1.5+dificuldade,25,90);
    const disponivel=rep>=exigencia;
    return{clubeId:t.id,exigencia,disponivel,salario:Math.round((t.forca*18000+t.caixa*.0008)/1000)*1000};
  }).filter(o=>o.disponivel).sort((a,b)=>b.salario-a.salario).slice(0,5);
}
function atualizarCarreiraTecnico(state,m,foiCampeao,posFinal,tecnico){
  tecnico=tecnico||state.tecnico;
  if(!tecnico)tecnico=state.tecnico=criarCarreiraTecnico();
  if(!tecnico.conquistas)tecnico.conquistas=[];
  if(!tecnico.clubes)tecnico.clubes=[];
  if(!tecnico.clubes.includes(m.id))tecnico.clubes.push(m.id);
  tecnico.temporadas=(tecnico.temporadas||0)+1;
  const variacao=foiCampeao?14:posFinal<=4?8:posFinal<=8?3:-4;
  tecnico.reputacao=clamp((tecnico.reputacao||50)+variacao,0,100);
  tecnico.historico.unshift({temporada:state.temporada,clubeId:m.id,clubeNome:m.nome,posicao:posFinal,variacao});
  tecnico.historico=tecnico.historico.slice(0,12);
  if(foiCampeao){
    tecnico.titulos=(tecnico.titulos||0)+1;
    if(!tecnico.trofeus)tecnico.trofeus=[];
    tecnico.trofeus.unshift({nome:'Série '+m.div,clubeNome:m.nome,temporada:state.temporada,competicao:CONF_NOME[m.conf]});
    registrarConquistaTecnico(tecnico,'primeiro-titulo','Primeiro título','Conquistou seu primeiro campeonato como técnico.',state.temporada);
    registrarConquistaTecnico(tecnico,'campeao-'+m.conf+'-'+m.div,'Campeão da Série '+m.div,'Levou o '+m.nome+' ao título da '+CONF_NOME[m.conf]+' Série '+m.div+'.',state.temporada);
  }
  if(posFinal<=4)registrarConquistaTecnico(tecnico,'top-4-'+m.conf,'Entre os melhores','Terminou uma temporada entre os quatro primeiros.',state.temporada);
  if(tecnico.clubes.length>=2)registrarConquistaTecnico(tecnico,'viajante','Técnico viajante','Comandou pelo menos dois clubes diferentes.',state.temporada);
  if(tecnico===state.tecnico)state.ofertasEmprego=gerarOfertasEmprego(state);
}
function assumirClube(state,novoId){
  const antigo=state.meuTime,novo=state.times[novoId];
  if(!novo||novoId===antigo)return false;
  if(!state.tecnico)state.tecnico=criarCarreiraTecnico();
  state.meuTime=novoId;state.rivalId=rivalDoEstado(state,novoId);state.classico={v:0,e:0,d:0};
  state.tecnico.status='empregado';state.ofertasEmprego=[];
  state.tecnico.historico.unshift({temporada:state.temporada,clubeId:novoId,clubeNome:novo.nome,troca:true,clubeAnteriorId:antigo});
  state.tecnico.historico=state.tecnico.historico.slice(0,12);
  return true;
}

function valorJogador(f,idade){let v=Math.pow(f/10,3)*32000;if(idade<23)v*=1.25;else if(idade>31)v*=.6;return Math.round(v/10000)*10000;}
/* Custo de renovar contrato, usado tanto no solo quanto no ACOES.renovar do servidor
   (fonte única em vez de duplicar a fórmula em cada lugar) — leal sai mais barato,
   mercenário/ambicioso saem mais caros, escalado pelo DNA de ambição. */
function custoRenovacao(j,sortearAnos=true){
  let mult=1;
  if(j.personalidade==='leal')mult=.8;
  else if(j.personalidade==='mercenario')mult=1.3;
  else if(j.personalidade==='ambicioso')mult=1+((j.dna&&j.dna.ambicao)||50)/500;
  return {custo:Math.round(j.valor*.15*mult/1e4)*1e4,anos:sortearAnos?rnd(2,4):null};
}
/* História individual + memória (Banco de Ideias, itens 02/21). historico é um log curto
   (máx. 15) de acontecimentos marcantes da carreira; carreira acumula totais que NUNCA
   resetam entre temporadas (ao contrário de j.gols/j.assistencias, que zeram em
   novaTemporada) — é o que alimenta a reputação (item 05) e o museu de ídolos. */
function pushHistorico(state,j,tipo,txt){
  if(!j.historico)j.historico=[];
  j.historico.push({temporada:state.temporada,rodada:state.rodada+1,tipo,txt});
  if(j.historico.length>15)j.historico.shift();
}
function registrarGolCarreira(j){
  j.gols++;
  if(!j.carreira)j.carreira={jogos:0,gols:0,assistencias:0,titulos:0,classicos:0,temporadasClube:0};
  j.carreira.gols++;
}
function registrarAssistCarreira(j){
  j.assistencias++;
  if(!j.carreira)j.carreira={jogos:0,gols:0,assistencias:0,titulos:0,classicos:0,temporadasClube:0};
  j.carreira.assistencias++;
}
/* Reputação histórica (item 05) — usada tanto pra destacar os ídolos atuais do elenco
   quanto pro corte de quem entra pro museu (t.idolos) na aposentadoria. Pesos calibrados
   pra um título valer bem mais que uma temporada inteira de jogos. */
function reputacaoJogador(j){
  const c=j.carreira||{};
  return (c.jogos||0)*1+(c.gols||0)*4+(c.assistencias||0)*2+(c.titulos||0)*40+(c.classicos||0)*15;
}
function gerarAtributos(pos,base){
  const attrs={};ATRIBUTOS_BASE.concat(ATRIBUTOS_POSICAO[pos]||[]).forEach((nome,i)=>{if(attrs[nome]!==undefined)return;attrs[nome]=clamp(base+rnd(-12,10)+(i%3===0?rnd(0,5):0),30,95);});return attrs;
}
function gerarCaracteristicas(pos){
  const disponiveis=Object.entries(CARACTERISTICAS_ESPECIAIS).filter(([,c])=>c.tipo===pos||c.tipo==='universal');
  const qtd=Math.random()<.18?2:Math.random()<.5?1:0,ret=[];
  while(ret.length<qtd&&disponiveis.length){const i=rnd(0,disponiveis.length-1),id=disponiveis.splice(i,1)[0][0];ret.push(id);}return ret;
}
function garantirLaterais(state,t){
  const laterais=t.jogadores.map(id=>J(state,id)).filter(j=>j&&j.pos==='LAT');
  if(!laterais.length){const j=gerarJogador(state,'LAT',t.forca-5);j.time=t.id;state.jogadores[j.id]=j;t.jogadores.push(j.id);laterais.push(j);}
  if(!laterais.some(j=>j.perna==='D'))laterais[0].perna='D';
  if(!laterais.some(j=>j.perna==='L')){if(laterais.length<2){const j=gerarJogador(state,'LAT',t.forca-5);j.time=t.id;j.perna='L';state.jogadores[j.id]=j;t.jogadores.push(j.id);}else laterais.find(j=>j.perna==='D').perna='L';}
}
function valorAtributo(j,nome){let v=j.atributos&&j.atributos[nome]||j.forca;for(const id of j.caracteristicas||[]){const c=CARACTERISTICAS_ESPECIAIS[id];if(c&&c.bonus[nome])v+=c.bonus[nome];}return clamp(v,1,99);}
function notaJogador(j){return j.notaAtual==null?'-':j.notaAtual.toFixed(1);}
function gerarJogador(state,pos,base){
  const idade=rnd(17,35);let f=base+rnd(-9,7);if(idade<21)f-=rnd(3,9);if(idade>32)f-=rnd(1,5);f=clamp(f,40,94);
  if(Math.random()<.006)f=clamp(f+rnd(8,16),93,99);
  const nome=Math.random()<.2?pick(APELIDOS):pick(NOMES)+' '+pick(SOBRENOMES);
  const valor=valorJogador(f,idade);
  const personalidade=pickPersonalidade();
  return {id:++state.seq,nome,pos,idade,forca:f,potencial:idade<=23?clamp(f+rnd(5,25),40,99):f,moral:rnd(60,85),energia:100,perna:Math.random()<.72?'D':'L',atributos:gerarAtributos(pos,f),caracteristicas:gerarCaracteristicas(pos),notaAtual:null,notasTemporada:{soma:0,jogos:0},notas:[],valor,salario:Math.round(valor*.004/1000)*1000,gols:0,assistencias:0,cartoes:0,suspenso:0,lesao:0,lesaoTipo:'',lesoesTotal:0,fragil:false,contrato:rnd(1,4),selecao:0,personalidade,dna:gerarDNA(personalidade),
    historico:[],carreira:{jogos:0,gols:0,assistencias:0,titulos:0,classicos:0,temporadasClube:0}};
}
/* Subida automática da base (item de saúde do elenco): todo fim de temporada, garante 2 a
   4 garotos de 18 anos novos no elenco do clube de referência — independente do gerador de
   prospectos lento (m.prospectos) — pra compensar jogadores que saem por fim de contrato
   sem reposição manual. Chance baixa de vir promessa/estrela, refletindo um olheiro raro
   descobrindo algo acima da média da base. */
function gerarJovemBase(state,t){
  const j=gerarJogador(state,pick(POSICOES),t.forca-14);
  j.idade=18;j.time=t.id;
  let tag=null;const sorte=Math.random();
  if(sorte<.015){j.forca=clamp(j.forca+rnd(10,18),55,90);j.potencial=clamp(j.forca+rnd(15,30),j.forca,99);tag='estrela';}
  else if(sorte<.09){j.potencial=clamp(j.potencial+rnd(10,20),j.forca,98);tag='promessa';}
  j.valor=valorJogador(j.forca,j.idade);j.valor=Math.round(j.valor/1e4)*1e4;j.salario=Math.round(j.valor*.004/1000)*1000;
  state.jogadores[j.id]=j;t.jogadores.push(j.id);
  return{j,tag};
}
function criarSetoresIniciais(capacidadeTotal){
  const setores={};
  Object.entries(SETORES_ESTADIO).forEach(([k,info])=>{
    setores[k]={lugares:Math.max(100,Math.round(capacidadeTotal*info.pct/100)*100),preco:info.precoBase,ocupacao:.6};
  });
  return setores;
}
function recalcularCapacidade(t){t.capacidade=Object.values(t.setores).reduce((s,x)=>s+x.lugares,0);}
function novoJogo(idMeu){
  const state={versaoMundo:2,seq:0,temporada:1,rodada:0,dia:0,jogadores:{},times:[],meuTime:idMeu,tecnico:criarCarreiraTecnico(),ofertasEmprego:[],noticias:[],fimTemporada:false,titulos:[],diasParaJogo:DIAS_ENTRE_RODADAS,rivalId:null,classicos:[],classico:{v:0,e:0,d:0},pedidoPendente:null,ofertaPendente:null,janela:{aberta:true,dias:10,meioAberta:false},premiosTemporada:[]};
  garantirNomesClubes(TIMES_BASE.concat(TIMES_MUNDO)).forEach((b,i)=>{
    const conf=b.conf||'SA',faixa=CAIXA_TIER[b.div];
    const t={...b,id:i,conf,escudo:gerarEscudo({id:i,nome:b.nome,cor1:b.cor1,cor2:b.cor2}),formacao:pick(Object.keys(FORMACOES)),formacoesCustom:[],estilo:'equilibrado',jogadores:[],titulares:[],moral:70,pontosTreino:TREINO_PONTOS_POR_RODADA,ofertaHumana:null,
      treino:{passe:0,falta:0,penalti:0,fisico:0},staff:{fisico:0,goleiro:0,olheiro:0},setores:criarSetoresIniciais(Math.round(b.torcida*1.15)),capacidade:Math.round(b.torcida*1.15),
      socios:{ativos:Math.round(b.torcida*.1),mensalidade:40},patrocinio:0,patrocinioContrato:null,baseNivel:0,prospectos:[],financas:[],
      caixa:rnd(faixa[0],faixa[1])*1e6};
    ELENCO_BASE.forEach(([pos,n])=>{for(let k=0;k<n;k++){const j=gerarJogador(state,pos,b.forca);j.time=i;state.jogadores[j.id]=j;t.jogadores.push(j.id);}});
    state.times.push(t);
  });
  state.times.forEach(t=>garantirLaterais(state,t));
  state.classicos=gerarClassicos(state.times);state.rivalId=rivalDoEstado(state,idMeu);
  state.times.forEach(t=>autoEscalar(state,t));
  gerarTemporada(state);gerarCopa(state);gerarTorneiosContinentais(state);
  noticia(state,'Bem-vindo ao '+state.times[idMeu].nome+'! A temporada começa agora.');
  return state;
}
function gerarCalendario(ids){
  const n=ids.length,arr=ids.slice(),rodadas=[];
  for(let r=0;r<n-1;r++){const jogos=[];for(let i=0;i<n/2;i++){const a=arr[i],b=arr[n-1-i];jogos.push(r%2?{casa:a,fora:b}:{casa:b,fora:a});}rodadas.push(jogos);arr.splice(1,0,arr.pop());}
  const volta=rodadas.map(r=>r.map(j=>({casa:j.fora,fora:j.casa})));
  return rodadas.concat(volta).map(r=>r.map(g=>({...g,gc:null,gf:null,eventos:[]})));
}
function gerarTemporada(state){
  state.calendario={};
  CONFEDERACOES.forEach(conf=>{
    state.calendario[conf]={};
    ['A','B','C','D'].forEach(d=>state.calendario[conf][d]=gerarCalendario(state.times.filter(t=>t.conf===conf&&t.div===d).map(t=>t.id)));
  });
  state.rodada=0;state.fimTemporada=false;
}
function noticia(state,txt){state.noticias.unshift({r:state.rodada,t:state.temporada,txt});state.noticias=state.noticias.slice(0,40);}
function criarTorneioMataMata(ids,fase0,rodadaAlvo){
  const embaralhado=ids.slice();
  for(let i=embaralhado.length-1;i>0;i--){const j=rnd(0,i);[embaralhado[i],embaralhado[j]]=[embaralhado[j],embaralhado[i]];}
  const jogos=[];for(let i=0;i<embaralhado.length;i+=2)jogos.push({a:embaralhado[i],b:embaralhado[i+1]});
  return {jogos,fase:fase0,rodadaAlvo,campeao:null,historico:[]};
}
function simularJogoCopa(state,a,b){
  const p=criarPartida(state,{casa:a,fora:b,gc:null,gf:null,eventos:[]});
  while(!p.fim)minuto(state,p);
  let vencedor,penaltis=null;
  if(p.gc===p.gf){
    vencedor=Math.random()<p.H.ata/(p.H.ata+p.A.ata)?a:b;
    const pv=rnd(3,5),pp=rnd(Math.max(0,pv-3),pv-1);
    penaltis=vencedor===a?(pv+'x'+pp):(pp+'x'+pv);
  }else vencedor=p.gc>p.gf?a:b;
  return {a,b,gc:p.gc,gf:p.gf,vencedor,penaltis};
}
function jogarFaseMataMata(state,torneio){
  if(!torneio||(torneio.campeao!==null&&torneio.campeao!==undefined)||!torneio.jogos.length)return null;
  const resultados=torneio.jogos.map(g=>simularJogoCopa(state,g.a,g.b));
  torneio.historico.push({fase:torneio.fase,rodada:state.rodada+1,resultados});
  const vencedores=resultados.map(r=>r.vencedor);
  if(vencedores.length===1){torneio.campeao=vencedores[0];torneio.jogos=[];}
  else{
    const prox=[];for(let i=0;i<vencedores.length;i+=2)prox.push({a:vencedores[i],b:vencedores[i+1]});
    torneio.jogos=prox;torneio.fase=FASES_COPA[prox.length]||'Fase final';torneio.rodadaAlvo=Math.min(state.rodada+4,RODADAS_TEMPORADA-1);
  }
  return resultados;
}
function gerarCopa(state){
  const ids=state.times.filter(t=>t.conf===meu(state).conf).map(t=>t.id).sort((a,b)=>state.times[b].forca-state.times[a].forca).slice(0,16);
  state.copa=criarTorneioMataMata(ids,'Oitavas de final',state.rodada+4);
}
function gerarTorneiosContinentais(state){
  state.continentais={};
  CONFEDERACOES.forEach(conf=>{
    const ids=state.times.filter(t=>t.conf===conf&&t.div==='A').map(t=>t.id).sort((a,b)=>state.times[b].forca-state.times[a].forca).slice(0,8);
    state.continentais[conf]=criarTorneioMataMata(ids,'Quartas de final',state.rodada+3);
  });
  state.mundial=null;
}
function jogarTorneio(state,torneio,premio,tituloNome){
  const m=meu(state);
  const faseAntes=torneio.fase;
  const resultados=jogarFaseMataMata(state,torneio);
  if(!resultados)return;
  resultados.forEach(r=>{
    const placar=r.gc+' x '+r.gf+(r.penaltis?' (pên. '+r.penaltis+')':'');
    if(r.a===m.id||r.b===m.id)noticia(state,(r.vencedor===m.id?'Você avançou! ':'Você foi eliminado. ')+'['+tituloNome+'] '+state.times[r.a].nome+' '+placar+' '+state.times[r.b].nome+'.');
    else if(state.times[r.a].conf===m.conf||state.times[r.b].conf===m.conf)noticia(state,'['+tituloNome+'] '+faseAntes+': '+state.times[r.a].nome+' '+placar+' '+state.times[r.b].nome+'.');
  });
  if(torneio.campeao!==null&&torneio.campeao!==undefined&&torneio.campeao===m.id){
    m.caixa+=premio;state.titulos.push(tituloNome+' '+state.temporada);noticia(state,'🏆 CAMPEÃO — '+tituloNome+'! Prêmio de '+fmt(premio)+' creditado.');
  }
}
function gerarMundial(state){
  const participantes=CONFEDERACOES.map(c=>state.continentais[c].campeao);
  const jogos=[];
  for(let i=0;i<participantes.length;i++)for(let j=i+1;j<participantes.length;j++)jogos.push({a:participantes[i],b:participantes[j],gc:null,gf:null});
  state.mundial={participantes,jogos,campeao:null};
}
function jogarMundial(state){
  const md=state.mundial;if(!md||(md.campeao!==null&&md.campeao!==undefined))return;
  md.jogos.forEach(g=>{const p=criarPartida(state,{casa:g.a,fora:g.b,gc:null,gf:null,eventos:[]});while(!p.fim)minuto(state,p);g.gc=p.gc;g.gf=p.gf;});
  const pts={};md.participantes.forEach(id=>pts[id]={id,pts:0,sg:0});
  md.jogos.forEach(g=>{
    pts[g.a].sg+=g.gc-g.gf;pts[g.b].sg+=g.gf-g.gc;
    if(g.gc>g.gf)pts[g.a].pts+=3;else if(g.gc<g.gf)pts[g.b].pts+=3;else{pts[g.a].pts++;pts[g.b].pts++;}
  });
  md.tabela=Object.values(pts).sort((a,b)=>b.pts-a.pts||b.sg-a.sg);
  md.campeao=md.tabela[0].id;
  const m=meu(state);
  if(md.campeao===m.id){m.caixa+=15e6;state.titulos.push('Mundial de Clubes '+state.temporada);noticia(state,'🌍🏆 CAMPEÃO MUNDIAL! O '+m.nome+' é o melhor clube do planeta! Prêmio de '+fmt(15e6)+'.');}
  else noticia(state,'🌍 Mundial de Clubes decidido: '+state.times[md.campeao].nome+' é o campeão mundial da temporada.');
}

/* ============ ESCALAÇÃO ============ */
function rating(j,pos,lado){let base=j.pos===pos?j.forca:(pos==='GOL'||j.pos==='GOL'?j.forca*.4:j.forca*((COMPAT[pos]||{})[j.pos]||.75));const foco=(pos==='GOL'?['reflexos','posicionamento']:pos==='ATA'?['finalizacao','posicionamentoAtacante']:pos==='MEI'?['passe','visaoDeJogo']:['marcacao','desarme','posicionamento']);if(j.atributos)base=base*.72+foco.reduce((s,n)=>s+valorAtributo(j,n),0)/foco.length*.28;return (base+bonusPerna(j,pos,lado))*(.7+.3*(j.energia==null?100:j.energia)/100);}
function autoEscalar(state,t){
  const slots=formacaoDoClube(state,t);const usados=new Set();t.titulares=[];
  const disp=t.jogadores.map(id=>J(state,id)).filter(j=>!j.suspenso&&!j.lesao&&!j.selecao&&(j.energia==null||j.energia>=25));
  slots.forEach((pos,i)=>{let best=null,bv=-1;disp.forEach(j=>{if(usados.has(j.id))return;const v=rating(j,pos,ladoDoSlot(state,t,i));if(v>bv){bv=v;best=j;}});
    if(!best)best=t.jogadores.map(id=>J(state,id)).find(j=>!usados.has(j.id));
    if(!best)return; // elenco com menos jogadores que posições da formação — não dá pra preencher, deixa o slot vazio em vez de travar
    usados.add(best.id);t.titulares.push(best.id);});
}
/* Troca só quem ficou indisponível (suspenso/lesionado/convocado), mantendo o resto da
   escalação exatamente como estava — ao contrário de autoEscalar(), que reconstrói o time
   inteiro do zero (jogava fora qualquer ajuste manual feito na aba Escalação toda vez que
   UM jogador qualquer ficava indisponível). Retorna true se trocou alguém. */
function substituirIndisponiveis(state,t){
  const slots=formacaoDoClube(state,t);
  let trocou=false;
  t.titulares.forEach((id,i)=>{
    const j=J(state,id);
    if(!(j.suspenso>0||j.lesao>0||j.selecao>0))return;
    const usados=new Set(t.titulares);
    const disp=t.jogadores.map(x=>J(state,x)).filter(x=>!usados.has(x.id)&&!x.suspenso&&!x.lesao&&!x.selecao&&(x.energia==null||x.energia>=25));
    if(!disp.length)return;
    let best=disp[0],bv=rating(best,slots[i],ladoDoSlot(state,t,i));
    disp.forEach(x=>{const v=rating(x,slots[i],ladoDoSlot(state,t,i));if(v>bv){bv=v;best=x;}});
    t.titulares[i]=best.id;trocou=true;
  });
  return trocou;
}
/* `forma` (opcional) é um mapa jogadorId→multiplicador, sorteado uma vez por partida em
   gerarForma() a partir do DNA de cada titular (consistência = amplitude da variação;
   pressão = efeito extra em clássico). Sem `forma`, o cálculo é o determinístico de
   sempre — é o que as telas de "força do time" fora de partida (Elenco, Finanças) usam. */
function forcaTime(state,t,mando,forma){
  const slots=formacaoDoClube(state,t),est=ESTILOS[t.estilo];let ata=0,na=0,def=0,nd=0;
  t.titulares.forEach((id,i)=>{const j=J(state,id),pos=slots[i],r=rating(j,pos,ladoDoSlot(state,t,i))*((forma&&forma[id])||1);
    if(pos==='ATA'||pos==='MEI'){ata+=r;na++;}else if(pos==='VOL'){ata+=r*.4;na+=.4;def+=r*.6;nd+=.6;}else{def+=r;nd++;}});
  const mf=.93+(t.moral/100)*.14;
  const tr=t.treino||{passe:0,falta:0,penalti:0,fisico:0};
  const bAta=1+tr.passe/500,bGoleiro=1+(t.staff?t.staff.goleiro:0)*.025,bDef=(1+tr.fisico/500)*bGoleiro;
  return {ata:(ata/na)*est.ata*mf*bAta*(mando?1.05:.97),def:(def/nd)*est.def*mf*bDef*(mando?1.05:.97)};
}
/* Sorteado uma vez em criarPartida e guardado em p.forma — não é re-sorteado a cada
   recálculo no meio do jogo (substituição, troca de estilo, ataque total), senão a
   variação de "dia bom/dia ruim" mudaria a cada clique em vez de valer pra partida
   inteira. Consistência baixa = oscila mais; em clássico, pressão soma um ajuste extra
   pelo sinal da personalidade (estrela/frio/líder se saem melhor sob pressão). */
const SINAL_PRESSAO={estrela:1,frio:1,lider:.5,inteligente:.3,temperamental:-1,timido:-.7,fragil:-.6};
function gerarForma(state,H,A,classico){
  const forma={};
  H.titulares.concat(A.titulares).forEach(id=>{
    const j=J(state,id),dna=j.dna||{consistencia:60,pressao:60};
    let mult=1+(rnd(-10,10)/100)*(1-dna.consistencia/100)*1.5;
    if(classico){const sinal=SINAL_PRESSAO[j.personalidade]||0;mult+=sinal*(dna.pressao-50)/50*.08;}
    forma[id]=clamp(mult,.7,1.3);
  });
  return forma;
}
/* Igual forcaTime (com a variação de forma da partida embutida), mas reaplica o boost de
   "ataque total" se o clube já ativou nesta partida — precisa ser usado em todo recálculo
   DURANTE o jogo (substituição, troca de estilo), senão a substituição/troca apagaria o
   boost sem querer. */
function forcaTimeAoVivo(state,p,t,mando){
  const f=forcaTime(state,t,mando,p.forma);
  if(p.ataqueTotal&&p.ataqueTotal[t.id])return{ata:f.ata*1.3,def:f.def*.7};
  return f;
}
function podeAtaqueTotal(p,t){
  if(p.fim||p.min<80)return false;
  if(p.ataqueTotal&&p.ataqueTotal[t.id])return false;
  const casa=p.g.casa===t.id;
  const meusGols=casa?p.gc:p.gf,advGols=casa?p.gf:p.gc;
  return meusGols<=advGols;
}
function ativarAtaqueTotal(state,p,t){
  if(!p.ataqueTotal)p.ataqueTotal={};
  if(p.ataqueTotal[t.id])return;
  p.ataqueTotal[t.id]=true;
  const mandante=p.g.casa===t.id;
  if(mandante)p.H=forcaTimeAoVivo(state,p,t,true);else p.A=forcaTimeAoVivo(state,p,t,false);
}

/* ============ SIMULAÇÃO ============ */
function criarPartida(state,g,acresc1,acresc2){
  const H=state.times[g.casa],A=state.times[g.fora];
  const narrador=pick(NARRADORES),classico=rivalDe(g.casa)===g.fora;
  const eventos=[{min:0,tipo:'info',txt:preencher(pick(FRASES_INICIO),{time:H.nome,adversario:A.nome}),lado:null}];
  const forma=gerarForma(state,H,A,classico);
  H.titulares.concat(A.titulares).forEach(id=>{const j=J(state,id);if(!j.carreira)j.carreira={jogos:0,gols:0,assistencias:0,titulos:0,classicos:0,temporadasClube:0};j.carreira.jogos++;});
  return {g,min:0,gc:0,gf:0,fc:0,ff:0,posse:50,eventos,H:forcaTime(state,H,true,forma),A:forcaTime(state,A,false,forma),fim:false,narrador,classico,forma,
    acresc1:acresc1??rnd(1,4),acresc2:acresc2??rnd(2,6)};
}
function emCampo(state,t){return t.titulares.map(id=>J(state,id)).filter(j=>!j.suspenso&&!j.lesao);}
function escolherAutor(state,t){
  const slots=formacaoDoClube(state,t),pesos={ATA:6,MEI:3,VOL:1,LAT:1,ZAG:.5,GOL:.05};
  const cands=t.titulares.map((id,i)=>({j:J(state,id),p:pesos[slots[i]]*(J(state,id).forca/70)})).filter(c=>!c.j.suspenso&&!c.j.lesao);
  if(!cands.length)return J(state,t.titulares[0]);
  let tot=cands.reduce((s,c)=>s+c.p,0),r=Math.random()*tot;
  for(const c of cands){r-=c.p;if(r<=0)return c.j;}return cands[0].j;
}
function micNarrador(p,txt){return '🎙️ '+p.narrador.nome+': '+txt;}
function comBordao(p,txt){return Math.random()<.2?txt+' '+pick(p.narrador.bordoes):txt;}
function narrarGol(p,t,a,assist){
  const quente=p.min>=75||p.classico;
  let txt=preencher(pick(quente?FRASES_GOL_QUENTE:FRASES_GOL),{jogador:a.nome});
  if(assist)txt+=', assistência de '+assist.nome;
  txt+=' ('+t.nome+')';
  return comBordao(p,micNarrador(p,txt));
}
/* hooks = { interativo(timeId), onPenalti(partida,lado,time), onFalta(...), onLesao(partida,lado,time,jogador) }
   Sem hooks (ou interativo retornando falso), o motor resolve sozinho — é assim que os
   times de IA sempre se comportaram e como qualquer simulação em segundo plano funciona. */
function minuto(state,p,hooks){
  if(p.fim)return;p.min++;
  const H=state.times[p.g.casa],A=state.times[p.g.fora];
  const rH=p.H.ata/p.A.def,rA=p.A.ata/p.H.def;
  p.posse=p.posse*.92+(rH/(rH+rA)*100)*.08;
  const lados=[[rH,H,'c'],[rA,A,'f']];
  for(const [r,t,l] of lados){
    if(Math.random()<.11*Math.pow(r,1.5)){if(l==='c')p.fc++;else p.ff++;
      if(Math.random()<.2){const a=escolherAutor(state,t),adversario=l==='c'?A:H,desfecho=pick(['fora','fora','cima','defesa','trave']);
        let txt;
        if(desfecho==='fora')txt=preencher(pick(FRASES_FINALIZACAO_FORA),{jogador:a.nome});
        else if(desfecho==='cima')txt=preencher(pick(FRASES_FINALIZACAO_CIMA),{jogador:a.nome});
        else if(desfecho==='defesa')txt=preencher(pick(FRASES_DEFESA),{time:adversario.nome});
        else txt=preencher(pick(FRASES_TRAVE),{time:t.nome});
        p.eventos.push({min:p.min,tipo:'lance',txt,lado:l});}}
    if(Math.random()<.025)p.eventos.push({min:p.min,tipo:'escanteio',txt:preencher(pick(FRASES_ESCANTEIO),{time:t.nome}),lado:l});
    if(Math.random()<.012){const candImp=emCampo(state,t);if(candImp.length){const a=pick(candImp);
      p.eventos.push({min:p.min,tipo:'impedimento',txt:preencher(pick(FRASES_IMPEDIMENTO),{jogador:a.nome}),lado:l});}}
    if(Math.random()<.0155*Math.pow(r,2.3)){const a=escolherAutor(state,t);registrarGolCarreira(a);if(l==='c')p.gc++;else p.gf++;
      let assist=null;
      if(Math.random()<.65){const cands=emCampo(state,t).filter(x=>x.id!==a.id);if(cands.length){assist=pick(cands);registrarAssistCarreira(assist);}}
      p.eventos.push({min:p.min,tipo:'gol',txt:narrarGol(p,t,a,assist),lado:l,autor:a.id,assistente:assist?assist.id:null});}
    if(Math.random()<.018){const candCartao=emCampo(state,t);if(candCartao.length){const a=pick(candCartao);a.cartoes++;
      if(Math.random()<.08){if(l==='c')p.H.ata*=.9,p.H.def*=.9;else p.A.ata*=.9,p.A.def*=.9;a.suspenso=2;
        const txt=comBordao(p,micNarrador(p,preencher(pick(FRASES_VERMELHO),{jogador:a.nome})+' ('+t.nome+') — joga com um a menos'));
        p.eventos.push({min:p.min,tipo:'vermelho',txt,lado:l});}
      else p.eventos.push({min:p.min,tipo:'amarelo',txt:preencher(pick(FRASES_AMARELO),{jogador:a.nome})+' ('+t.nome+')',lado:l});}}
    const tr=t.treino||{passe:0,falta:0,penalti:0,fisico:0};
    if(Math.random()<.0009){
      if(hooks&&hooks.interativo&&hooks.interativo(t.id)){hooks.onPenalti(p,l,t);return;}
      const a=escolherAutor(state,t),conv=.76+tr.penalti/500;
      if(Math.random()<conv){registrarGolCarreira(a);if(l==='c')p.gc++;else p.gf++;p.eventos.push({min:p.min,tipo:'gol',txt:comBordao(p,micNarrador(p,'Pênalti convertido por '+a.nome+' ('+t.nome+')')),lado:l,autor:a.id});}
      else p.eventos.push({min:p.min,tipo:'penalti_perdido',txt:'Pênalti perdido por '+a.nome+' ('+t.nome+')',lado:l});
    }
    if(Math.random()<.001*(1+tr.falta/100)){
      if(hooks&&hooks.interativo&&hooks.interativo(t.id)){hooks.onFalta(p,l,t);return;}
      const a=escolherAutor(state,t);registrarGolCarreira(a);if(l==='c')p.gc++;else p.gf++;
      p.eventos.push({min:p.min,tipo:'gol',txt:comBordao(p,micNarrador(p,'Golaço de falta de '+a.nome+' ('+t.nome+')')),lado:l,autor:a.id});
    }
    if(Math.random()<.0035*(1-(t.staff?t.staff.fisico:0)*.15)){const candLesao=emCampo(state,t);if(candLesao.length){const a=pick(candLesao);const dur=rnd(2,12);a.lesao=dur;a.lesaoTipo=pick(['muscular','torção no tornozelo','pancada no joelho','desgaste físico']);
      a.lesoesTotal=(a.lesoesTotal||0)+1;if(a.lesoesTotal>=3&&!a.fragil){a.fragil=true;a.valor=Math.round(a.valor*.85/1e4)*1e4;}
      p.eventos.push({min:p.min,tipo:'lesao',txt:preencher(pick(FRASES_LESAO),{jogador:a.nome})+' ('+t.nome+')',lado:l});
      if(hooks&&hooks.interativo&&hooks.interativo(t.id))hooks.onLesao(p,l,t,a);}}
  }
  if(p.min>=90+(p.acresc2||0))finalizar(state,p);
}
function finalizar(state,p){
  p.fim=true;p.g.gc=p.gc;p.g.gf=p.gf;p.g.eventos=p.eventos;
  const H=state.times[p.g.casa],A=state.times[p.g.fora];
  [H,A].forEach(t=>{const casa=t.id===H.id,pro=casa?p.gc:p.gf,contra=casa?p.gf:p.gc,venceu=pro>contra; t.titulares.forEach(id=>{const j=J(state,id);if(!j)return;const gols=(p.eventos||[]).filter(e=>e.tipo==='gol'&&e.autor===id).length,assist=(p.eventos||[]).filter(e=>e.tipo==='gol'&&e.assistente===id).length,cartoes=(p.eventos||[]).filter(e=>(e.tipo==='amarelo'||e.tipo==='vermelho')&&e.lado===(casa?'c':'f')&&e.txt.includes(j.nome)).length,nota=clamp(6+(venceu?.7:pro===contra?0:-.8)+gols*1.4+assist*.6-cartoes*.35,3,10);j.notaAtual=Number(nota.toFixed(1));if(!j.notasTemporada)j.notasTemporada={soma:0,jogos:0};j.notasTemporada.soma+=nota;j.notasTemporada.jogos++;if(!j.notas)j.notas=[];j.notas.push({temporada:state.temporada,rodada:state.rodada+1,nota:j.notaAtual});if(j.notas.length>20)j.notas.shift();j.energia=clamp((j.energia==null?100:j.energia)-28,0,100);});});
  const dh=p.gc>p.gf?5:p.gc<p.gf?-5:0;
  H.moral=clamp(H.moral+dh,40,100);A.moral=clamp(A.moral-dh,40,100);
  const txtFim=preencher(pick(FRASES_FIM),{time:H.nome,adversario:A.nome,gc:p.gc,gf:p.gf});
  p.eventos.push({min:p.min,tipo:'fim',txt:micNarrador(p,txtFim),lado:null});
}
/* Resolve uma cobrança de pênalti/falta escolhida pelo jogador humano — a mesma matemática
   que antes vivia dentro do handler de UI, agora pura e reutilizável pelo servidor. */
function resolverCobranca(state,cobranca,tipoKey){
  const c=cobranca,p=c.p,t=state.times[c.timeId],batedor=J(state,c.batedor);
  const tipos=c.tipo==='penalti'?TIPOS_PENALTI:TIPOS_FALTA,info=tipos[tipoKey];
  const tr=t.treino||{passe:0,falta:0,penalti:0,fisico:0};
  const adversario=state.times[c.l==='c'?p.g.fora:p.g.casa];
  const defGoleiro=(adversario.staff?adversario.staff.goleiro:0)*.03;
  const bonusTreino=(c.tipo==='penalti'?tr.penalti:tr.falta)/300;
  const bonusBatedor=(batedor.forca-70)/300;
  const chance=clamp(info.chance+bonusTreino+bonusBatedor-defGoleiro,.15,.95);
  const gol=Math.random()<chance;
  let autor=batedor,txt;
  if(gol){
    if(c.tipo==='falta'&&tipoKey==='cruzamento'){autor=escolherAutor(state,t);txt=info.golTxt.replace('X',autor.nome);}
    else txt=c.tipo==='falta'?info.golTxt.replace('X',batedor.nome):(batedor.nome+' cobrou o pênalti ('+info.nome+') e marcou! GOL!');
    registrarGolCarreira(autor);if(c.l==='c')p.gc++;else p.gf++;
    p.eventos.push({min:p.min,tipo:'gol',txt:micNarrador(p,txt),lado:c.l,autor:autor.id});
  }else{
    txt=c.tipo==='falta'?info.forTxt.replace('X',batedor.nome):(batedor.nome+' cobrou o pênalti ('+info.nome+') e '+pick(['o goleiro defendeu!','mandou para fora!','acertou a trave!']));
    p.eventos.push({min:p.min,tipo:c.tipo==='penalti'?'penalti_perdido':'falta_perdida',txt,lado:c.l});
  }
  if(p.min>=90+(p.acresc2||0))finalizar(state,p);
  return {gol};
}
function rodadaAtual(state){const c=state.calendario[meu(state).conf];return {A:c.A[state.rodada],B:c.B[state.rodada],C:c.C[state.rodada],D:c.D[state.rodada]};}
function resolverRodadasForaneas(state){
  CONFEDERACOES.filter(c=>c!==meu(state).conf).forEach(conf=>{
    ['A','B','C','D'].forEach(div=>{
      state.calendario[conf][div][state.rodada].forEach(g=>{if(g.gc===null){const p=criarPartida(state,g);while(!p.fim)minuto(state,p);}});
    });
  });
}
/* Parte não-interativa de iniciar a rodada: ajusta escalações de times de IA e do próprio
   time por lesão/suspensão/convocação, e resolve os jogos das outras confederações. O HTML
   fica só com a parte que monta a tela de partida (ui.partida) e liga o cronômetro. */
function prepararRodada(state){
  state.times.forEach(t=>{
    if(t.titulares.some(id=>{const j=J(state,id);return j.suspenso>0||j.lesao>0||j.selecao>0;})){
      substituirIndisponiveis(state,t);
      if(t.id===state.meuTime)noticia(state,'Jogador suspenso, lesionado ou convocado foi substituído automaticamente na escalação.');
    }
    if(t.id!==state.meuTime&&Math.random()<.3)t.estilo=pick(Object.keys(ESTILOS));
  });
  resolverRodadasForaneas(state);
}
function jogoDoTime(state,t){return state.calendario[t.conf][t.div][state.rodada].find(g=>g.casa===t.id||g.fora===t.id);}

/* ============ TABELA ============ */
function tabela(state,conf,div){
  const st={};state.times.filter(t=>t.conf===conf&&t.div===div).forEach(t=>st[t.id]={id:t.id,pts:0,j:0,v:0,e:0,d:0,gp:0,gc:0,ult:[]});
  state.calendario[conf][div].forEach(r=>r.forEach(g=>{if(g.gc===null)return;const c=st[g.casa],f=st[g.fora];
    c.j++;f.j++;c.gp+=g.gc;c.gc+=g.gf;f.gp+=g.gf;f.gc+=g.gc;
    if(g.gc>g.gf){c.v++;f.d++;c.pts+=3;c.ult.push('V');f.ult.push('D');}
    else if(g.gc<g.gf){f.v++;c.d++;f.pts+=3;c.ult.push('D');f.ult.push('V');}
    else{c.e++;f.e++;c.pts++;f.pts++;c.ult.push('E');f.ult.push('E');}}));
  return Object.values(st).sort((a,b)=>b.pts-a.pts||b.v-a.v||(b.gp-b.gc)-(a.gp-a.gc)||b.gp-a.gp||a.id-b.id);
}
function posicao(state,id){const t=state.times[id];return tabela(state,t.conf,t.div).findIndex(x=>x.id===id)+1;}

/* ============ TEMPORADA ============ */
function resumoTemporada(state,conf){
  conf=conf||meu(state).conf;
  const tabs={A:tabela(state,conf,'A'),B:tabela(state,conf,'B'),C:tabela(state,conf,'C'),D:tabela(state,conf,'D')};
  const transicoes=[['A','B'],['B','C'],['C','D']].map(([sup,inf])=>({sup,inf,caem:[tabs[sup][10].id,tabs[sup][11].id],sobem:[tabs[inf][0].id,tabs[inf][1].id]}));
  return {conf,tabs,campeoes:{A:tabs.A[0].id,B:tabs.B[0].id,C:tabs.C[0].id,D:tabs.D[0].id},transicoes,
    artilheiro:Object.values(state.jogadores).filter(j=>state.times[j.time].conf===conf).sort((a,b)=>b.gols-a.gols)[0]};
}
function premiosMundiais(state){
  const todos=Object.values(state.jogadores).filter(j=>!j.emBase);
  const bolaDeOuro=todos.slice().sort((a,b)=>(b.forca+b.gols*.3+b.assistencias*.2)-(a.forca+a.gols*.3+a.assistencias*.2))[0];
  const artilheiro=todos.slice().sort((a,b)=>b.gols-a.gols)[0];
  const garcom=todos.slice().sort((a,b)=>b.assistencias-a.assistencias)[0];
  const revelacao=todos.filter(j=>j.idade<=21).sort((a,b)=>b.forca-a.forca)[0];
  const premios=[
    {nome:'Bola de Ouro',jogador:bolaDeOuro,bonus:3},
    {nome:'Artilheiro Mundial',jogador:artilheiro,bonus:1},
    {nome:'Rei das Assistências',jogador:garcom,bonus:1},
    {nome:'Craque Revelação',jogador:revelacao,bonus:2},
  ];
  const m=meu(state);
  state.premiosTemporada=[];
  premios.forEach(p=>{
    if(!p.jogador)return;
    if(p.nome==='Artilheiro Mundial'&&p.jogador.gols<=0)return;
    if(p.nome==='Rei das Assistências'&&p.jogador.assistencias<=0)return;
    p.jogador.forca=clamp(p.jogador.forca+p.bonus,35,99);
    state.premiosTemporada.push({nome:p.nome,jogadorNome:p.jogador.nome,timeNome:state.times[p.jogador.time].nome});
    const meuJogador=m.jogadores.includes(p.jogador.id)||m.prospectos.includes(p.jogador.id);
    if(meuJogador){state.titulos.push(p.nome+' — '+p.jogador.nome+' ('+state.temporada+')');noticia(state,'🏅 '+p.jogador.nome+' do seu clube ganhou o prêmio de '+p.nome+'! Força +'+p.bonus+'.');}
    else noticia(state,'🏅 Prêmio '+p.nome+': '+p.jogador.nome+' ('+state.times[p.jogador.time].nome+').');
  });
}
function novaTemporada(state){
  const m=meu(state);
  const resumos={};CONFEDERACOES.forEach(conf=>resumos[conf]=resumoTemporada(state,conf));
  const meuResumo=resumos[m.conf];
  ['A','B','C','D'].forEach(d=>{if(meuResumo.campeoes[d]===m.id){state.titulos.push(CONF_NOME[m.conf]+' Série '+d+' '+state.temporada);m.caixa+=TITULO_PREMIO[d];}});
  const posFinal=posicao(state,m.id);
  const foiCampeao=Object.values(meuResumo.campeoes).includes(m.id);
  atualizarCarreiraTecnico(state,m,foiCampeao,posFinal);
  if(foiCampeao){
    m.torcida=Math.round(m.torcida*1.05);noticia(state,'O título fez a torcida crescer! Nova média: '+m.torcida.toLocaleString('pt-BR')+'.');
    if(m.patrocinioContrato){const bonus=Math.round(m.patrocinio*3/1e4)*1e4;if(bonus>0){m.caixa+=bonus;noticia(state,m.patrocinioContrato.empresa+' pagou um bônus de '+fmt(bonus)+' pelo título (cláusula de desempenho).');}}
  }
  else if(posFinal<=6)m.torcida=Math.round(m.torcida*1.02);
  // Prêmio de campeão/vice — pra TODO clube, não só o de referência (o bônus de torcida/
  // patrocínio acima continua só pra referência, é flavor de perspectiva única mesmo).
  CONFEDERACOES.forEach(conf=>{
    ['A','B','C','D'].forEach(d=>{
      resumos[conf].tabs[d].forEach((row,i)=>{
        const t=state.times[row.id];
        if(i===0){
          t.caixa+=TITULO_PREMIO[d];
          t.titulares.forEach(id=>{const j=J(state,id);if(!j)return;
            if(!j.carreira)j.carreira={jogos:0,gols:0,assistencias:0,titulos:0,classicos:0,temporadasClube:0};
            j.carreira.titulos++;
            pushHistorico(state,j,'titulo','Campeão da '+CONF_NOME[conf]+' Série '+d+' — temporada '+state.temporada+'.');
            if(j.dna)j.dna.lealdade=clamp(j.dna.lealdade+5,0,100);});
        }
        else if(i===1)t.caixa+=VICE_PREMIO[d];
      });
    });
  });
  CONFEDERACOES.forEach(conf=>{resumos[conf].transicoes.forEach(tr=>{tr.caem.forEach(id=>state.times[id].div=tr.inf);tr.sobem.forEach(id=>state.times[id].div=tr.sup);});});
  premiosMundiais(state);
  state.times.forEach(t=>{
    // Artilheiro da temporada (item 02: "temporada marcante") — precisa rodar ANTES do
    // reset de j.gols logo abaixo, senão não sobra nada pra medir.
    const artilheiro=t.jogadores.map(id=>J(state,id)).sort((a,b)=>b.gols-a.gols)[0];
    if(artilheiro&&artilheiro.gols>=15)pushHistorico(state,artilheiro,'artilheiro_temporada','Artilheiro do '+t.nome+' na temporada '+state.temporada+' com '+artilheiro.gols+' gols.');
    t.jogadores.slice().forEach(id=>{const j=J(state,id);j.mediaUltimaTemporada=j.notasTemporada&&j.notasTemporada.jogos?Number((j.notasTemporada.soma/j.notasTemporada.jogos).toFixed(1)):null;j.notasTemporada={soma:0,jogos:0};j.idade++;j.gols=0;j.assistencias=0;j.cartoes=0;j.suspenso=0;j.lesao=0;j.lesaoTipo='';j.selecao=0;j.contrato--;
      if(!j.carreira)j.carreira={jogos:0,gols:0,assistencias:0,titulos:0,classicos:0,temporadasClube:0};
      j.carreira.temporadasClube++;
      if(j.idade<24)j.forca+=rnd(1,4);else if(j.idade<30)j.forca+=rnd(-1,2);else j.forca-=rnd(1,4);
      j.forca=clamp(j.forca,35,99);
      if(j.idade>=37){t.jogadores=t.jogadores.filter(x=>x!==id);delete state.jogadores[id];
        // Museu do clube (item 05): quem se aposenta com reputação alta vira ídolo — a
        // única forma de preservar a carreira dele depois que o jogador some do state.
        if(reputacaoJogador(j)>=280){
          if(!t.idolos)t.idolos=[];
          t.idolos.push({nome:j.nome,pos:j.pos,jogos:j.carreira.jogos,gols:j.carreira.gols,assistencias:j.carreira.assistencias,titulos:j.carreira.titulos,temporadasClube:j.carreira.temporadasClube,reputacao:reputacaoJogador(j),aposentadoTemporada:state.temporada});
          if(t.id===state.meuTime)noticia(state,'🏛️ '+j.nome+' se aposentou como um ídolo do '+t.nome+' — entra pra Sala de Ídolos do clube.');
        }
        const novo=gerarJogador(state,j.pos,t.forca-8);novo.idade=rnd(17,19);novo.time=t.id;state.jogadores[novo.id]=novo;t.jogadores.push(novo.id);
        if(t.id===state.meuTime)noticia(state,j.nome+' se aposentou. O garoto '+novo.nome+' subiu da base.');}
      else if(j.contrato<=0){
        if(t.id===state.meuTime){
          t.jogadores=t.jogadores.filter(x=>x!==id);t.titulares=t.titulares.filter(x=>x!==id);
          const destino=pick(state.times.filter(x=>x.id!==t.id));destino.jogadores.push(id);j.time=destino.id;j.contrato=rnd(2,4);
          noticia(state,j.nome+' teve o contrato encerrado e assinou como agente livre com o '+destino.nome+'.');
        }else j.contrato=rnd(2,4);
      }
      j.valor=valorJogador(j.forca,j.idade)*(j.fragil?.85:1);j.valor=Math.round(j.valor/1e4)*1e4;j.salario=Math.round(j.valor*.004/1000)*1000;});
    if(t.id===state.meuTime){
      const qtd=rnd(2,4),destaques=[];
      for(let k=0;k<qtd;k++){const{j,tag}=gerarJovemBase(state,t);if(tag)destaques.push(j.nome+(tag==='estrela'?' (⭐ grande potencial)':' (promessa)'));}
      noticia(state,qtd+' jogador'+(qtd>1?'es':'')+' de 18 anos subir'+(qtd>1?'am':'a')+' da base para o elenco.'+(destaques.length?' Destaque'+(destaques.length>1?'s':'')+': '+destaques.join(', ')+'.':''));
    }
    t.moral=70;t.caixa+=CAIXA_BONUS_TEMPORADA[t.div];t.treino={passe:0,falta:0,penalti:0,fisico:0};autoEscalar(state,t);
    if(t.patrocinioContrato){
      t.patrocinioContrato.duracaoRestante--;
      if(t.patrocinioContrato.duracaoRestante<=0){
        const empresa=t.patrocinioContrato.empresa;t.patrocinio=0;t.patrocinioContrato=null;
        if(t.id===state.meuTime)noticia(state,'Contrato de patrocínio com '+empresa+' encerrado. Busque um novo patrocinador na aba Finanças.');
      }
    }
  });
  m.prospectos.slice().forEach(id=>{const j=J(state,id);j.idade++;
    if(j.idade>=18){m.prospectos=m.prospectos.filter(x=>x!==id);j.emBase=false;j.salario=Math.round(j.valor*.004/1000)*1000;m.jogadores.push(id);
      noticia(state,j.nome+' (base) subiu para o elenco principal aos '+j.idade+' anos!');}});
  if(m.prospectos.length<5&&Math.random()<clamp(.12+m.baseNivel*.15,0,.9)){
    const pos=pick(POSICOES),novo=gerarJogador(state,pos,m.forca+rnd(-6,2));
    novo.idade=rnd(14,16);novo.emBase=true;novo.salario=0;
    novo.potencial=clamp(novo.forca+rnd(15,35)+m.baseNivel*5+m.staff.olheiro*3,novo.forca,98);
    novo.valor=Math.round(novo.valor*.3/1e4)*1e4;novo.time=m.id;
    state.jogadores[novo.id]=novo;m.prospectos.push(novo.id);
    noticia(state,'Novo garoto na base: '+novo.nome+' ('+pos+', '+novo.idade+' anos).');
  }
  state.temporada++;state.dia=0;gerarTemporada(state);gerarCopa(state);gerarTorneiosContinentais(state);state.diasParaJogo=DIAS_ENTRE_RODADAS;
  m.pontosTreino=TREINO_PONTOS_POR_RODADA;
  state.janela={aberta:true,dias:10,meioAberta:false};
  noticia(state,'Temporada '+state.temporada+' começou. Janela de transferências aberta (10 dias). Cota de participação depositada.');
}

/* ============ MERCADO / ECONOMIA ============ */
function hash01(n){n=(n^61)^(n>>>16);n+=n<<3;n^=n>>>4;n=Math.imul(n,0x27d4eb2d);n^=n>>>15;return(n>>>0)/4294967295;}
function disponivelNoMercado(state,j){
  if(j.forca<90)return true;
  return hash01(j.id*1000003+state.rodada*97+state.temporada*131)<.07;
}
function calcularBilheteria(t,casa,classico){
  if(!casa)return 0;
  const base=clamp(.35+t.moral/200,0,1)*(classico?1.3:1);
  let publico=0,receita=0;
  Object.entries(t.setores).forEach(([k,s])=>{
    const info=SETORES_ESTADIO[k];
    const fatorPreco=clamp(info.precoBase/s.preco,.5,1.6);
    s.ocupacao=clamp(base*fatorPreco,.05,1);
    const pub=Math.round(s.lugares*s.ocupacao);
    publico+=pub;receita+=pub*s.preco;
  });
  t.ultimoPublico=publico;
  return receita;
}
function calcularSocios(t){
  const mensalidade=t.socios.mensalidade||40;
  const potencial=t.torcida*.15*clamp(t.moral/70,.5,1.3)*clamp(50/mensalidade,.4,1.8);
  t.socios.ativos=Math.max(0,Math.round(t.socios.ativos+(potencial-t.socios.ativos)*.08));
  return t.socios.ativos*mensalidade;
}
function transferir(state,j,de,para,preco){
  de.jogadores=de.jogadores.filter(id=>id!==j.id);de.titulares=de.titulares.filter(id=>id!==j.id);
  para.jogadores.push(j.id);j.time=para.id;de.caixa+=preco;para.caixa-=preco;
  pushHistorico(state,j,'transferencia','Transferido do '+de.nome+' para o '+para.nome+' por '+fmt(preco)+'.');
  if(j.carreira)j.carreira.temporadasClube=0;
  if(de.titulares.length<11)autoEscalar(state,de);
  if(para.id!==state.meuTime)autoEscalar(state,para);
}
function negocioIA(state){
  if(!state.janela.aberta)return;
  const comp=pick(state.times.filter(t=>t.id!==state.meuTime&&!t.controlador&&t.caixa>15e6));if(!comp)return;
  const vend=pick(state.times.filter(t=>t.id!==comp.id&&t.id!==state.meuTime&&!t.controlador&&t.jogadores.length>18));
  const j=vend.jogadores.map(id=>J(state,id)).filter(x=>!vend.titulares.includes(x.id)).sort((a,b)=>b.forca-a.forca)[0];
  if(!j||comp.jogadores.length>=25||comp.caixa<j.valor)return;
  transferir(state,j,vend,comp,j.valor);noticia(state,comp.nome+' contrata '+j.nome+' junto ao '+vend.nome+' por '+fmt(j.valor)+'.');
}
/* Efeitos de treinar num clube específico (moral, estatística de treino, risco de
   lesão). Não mexe no relógio do mundo (diasParaJogo/dia/janela) — no solo isso é um
   contador global de "dias até a rodada", que quem chama decide como avançar; no
   multiplayer, cada clube treina no seu próprio ritmo dentro do lobby, sem um
   contador compartilhado que uma ação de um jogador atrasaria pra todo mundo. */
function treinar(state,clubeId,tipo){
  const m=state.times[clubeId];
  if(tipo==='folga'){
    const MULT_MORAL={temperamental:1.4,frio:.7,timido:.75};
    m.jogadores.map(id=>J(state,id)).forEach(j=>{const mult=MULT_MORAL[j.personalidade]||1;j.moral=clamp(j.moral+Math.round(rnd(1,3)*mult),0,100);j.energia=clamp((j.energia==null?100:j.energia)+10,0,100);if(j.lesao>0)j.lesao=Math.max(0,j.lesao-2);});
    m.moral=clamp(m.moral+1,0,100);
  }else{
    m.jogadores.map(id=>J(state,id)).forEach(j=>{j.energia=clamp((j.energia==null?100:j.energia)-3,0,100);if(j.lesao>0)j.lesao=Math.max(0,j.lesao-1);});
    m.treino[tipo]=clamp((m.treino[tipo]||0)+8,0,40);
    if(Math.random()<.03*(1-m.staff.fisico*.2)){const cands=m.jogadores.map(id=>J(state,id)).filter(j=>!j.lesao);
      if(cands.length){const j=pick(cands);const dur=rnd(3,10);j.lesao=dur;j.lesaoTipo=pick(['muscular','torção no tornozelo','pancada no joelho','desgaste físico']);
        j.lesoesTotal=(j.lesoesTotal||0)+1;if(j.lesoesTotal>=3&&!j.fragil){j.fragil=true;j.valor=Math.round(j.valor*.85/1e4)*1e4;}
        if(m.titulares.includes(j.id))substituirIndisponiveis(state,m);}}
  }
}
function eventoVestiario(state){
  if(state.pedidoPendente)return;
  const m=meu(state);
  const melhoresPorPos={};
  m.jogadores.map(id=>J(state,id)).forEach(j=>{if(!melhoresPorPos[j.pos]||j.forca>melhoresPorPos[j.pos])melhoresPorPos[j.pos]=j.forca;});
  const cands=m.jogadores.map(id=>J(state,id)).filter(j=>{
    if(j.personalidade==='lider'||j.personalidade==='leal')return j.moral<50;
    if(j.moral<70)return true;
    if(j.personalidade==='estrela'&&!m.titulares.includes(j.id)&&j.forca>=melhoresPorPos[j.pos]-3)return true;
    return false;
  });
  if(!cands.length)return;
  const j=pick(cands),aumento=Math.round(j.salario*.25/1000)*1000;
  state.pedidoPendente={jogadorId:j.id,aumento};
}
function convocarSelecao(state){
  const m=meu(state),cands=m.jogadores.map(id=>J(state,id)).filter(j=>j.forca>=75&&!j.suspenso&&!j.lesao&&!j.selecao);
  if(!cands.length)return;
  const j=pick(cands);j.selecao=rnd(1,2);
  if(m.titulares.includes(j.id))substituirIndisponiveis(state,m);
  pushHistorico(state,j,'convocacao','Convocado para a Seleção Nacional (temporada '+state.temporada+').');
  noticia(state,j.nome+' foi convocado para a Seleção Nacional! Fica de fora por '+j.selecao+' rodada(s).');
}
/* Antes usava confirm() do navegador — travava concluirRodada() num diálogo bloqueante.
   Agora só registra a oferta pendente; a UI decide como e quando mostrar o painel
   (mesmo padrão já usado pelo pedido de aumento do vestiário, state.pedidoPendente). */
function ofertaRecebida(state){
  if(!state.janela.aberta)return;
  const m=meu(state);if(m.jogadores.length<=16)return;
  if(state.ofertaPendente)return;
  const cands=m.jogadores.map(id=>J(state,id)).filter(j=>!m.titulares.includes(j.id)||Math.random()<.3);
  if(!cands.length)return;
  const j=pick(cands),comp=pick(state.times.filter(t=>t.id!==m.id&&t.jogadores.length<25&&t.caixa>j.valor*.8));
  if(!comp)return;
  const oferta=Math.round(j.valor*rnd(85,115)/100/1e4)*1e4;
  state.ofertaPendente={jogadorId:j.id,compradorId:comp.id,oferta};
}

/* ============ FIM DE RODADA ============ */
/* A função mais importante desta separação: hoje só quem clica "jogar rodada" a dispara,
   mas é exatamente ela que o servidor vai chamar sozinho quando todos os times humanos
   estiverem "prontos" (Fase 2 do plano de multiplayer). Precisa ser 100% headless — e
   antes não era, por causa do confirm() dentro de ofertaRecebida (corrigido acima). */
function concluirRodada(state){
  Object.values(state.jogadores).forEach(j=>{j.energia=clamp((j.energia==null?100:j.energia)+18,0,100);if(j.suspenso>0)j.suspenso--;if(j.lesao>0)j.lesao=Math.max(0,j.lesao-1);
    if(j.selecao>0){j.selecao--;if(j.selecao===0){j.forca=clamp(j.forca+rnd(1,3),35,99);j.moral=100;noticia(state,j.nome+' voltou da Seleção valorizado!');}}});
  state.times.forEach(t=>{
    const jogo=jogoDoTime(state,t);
    const casa=jogo.casa===t.id;
    const rivalT=rivalDe(t.id),classicoT=rivalT!==null&&(jogo.casa===rivalT||jogo.fora===rivalT);
    const bilheteria=calcularBilheteria(t,casa,classicoT&&casa);
    const tv=TV[t.div];const patrocinio=t.patrocinio||0;const socios=calcularSocios(t);
    const venceu=casa?jogo.gc>jogo.gf:jogo.gf>jogo.gc;
    const tecnico=t.id===state.meuTime?state.tecnico:t.controlador?t.tecnico:null;
    registrarPartidaTecnico(tecnico,venceu,jogo.gc===jogo.gf,casa?jogo.gc:jogo.gf,casa?jogo.gf:jogo.gc);
    const bonusVitoria=venceu?BONUS_VITORIA:0;
    const sal=t.jogadores.reduce((s,id)=>s+J(state,id).salario,0);
    const custoStaff=((t.staff?.fisico||0)+(t.staff?.goleiro||0)+(t.staff?.olheiro||0))*15000;
    t.caixa+=bilheteria+tv+patrocinio+socios+bonusVitoria-sal-custoStaff;
    if(!t.financas)t.financas=[];
    t.financas.push({t:state.temporada,r:state.rodada+1,bilheteria,tv,patrocinio,socios,bonusVitoria,sal:sal+custoStaff,caixa:t.caixa});
    if(t.financas.length>40)t.financas=t.financas.slice(-40);
    /* História individual (item 02) — feito por clube, não só pelo de referência: cada
       clube só enxerga os próprios gols nesse jogo (filtrados por `lado`), então não corre
       o risco de contar o mesmo evento duas vezes quando o loop passa pelo adversário. */
    const meuLado=casa?'c':'f',advGols=casa?jogo.gf:jogo.gc;
    const meusGols=casa?jogo.gc:jogo.gf;
    const golsDoTime=(jogo.eventos||[]).filter(e=>e.tipo==='gol'&&e.lado===meuLado&&e.autor);
    if(golsDoTime.length){
      if(classicoT&&meusGols>advGols){
        const adversario=state.times[casa?jogo.fora:jogo.casa];
        golsDoTime.forEach(e=>{const j=J(state,e.autor);if(!j)return;
          if(!j.carreira)j.carreira={jogos:0,gols:0,assistencias:0,titulos:0,classicos:0,temporadasClube:0};
          j.carreira.classicos++;
          pushHistorico(state,j,'classico','Marcou no clássico contra o '+adversario.nome+'.');
          if(j.dna)j.dna.lealdade=clamp(j.dna.lealdade+2,0,100);});
      }
      if(meusGols-advGols===1){
        const j=J(state,golsDoTime[golsDoTime.length-1].autor);
        if(j)pushHistorico(state,j,'gol_decisivo','Marcou o gol da vitória por '+meusGols+'x'+advGols+'.');
      }
      const contagem={};golsDoTime.forEach(e=>contagem[e.autor]=(contagem[e.autor]||0)+1);
      Object.entries(contagem).forEach(([id,n])=>{if(n>=3){const j=J(state,+id);if(j)pushHistorico(state,j,'hattrick','Fez um hat-trick ('+n+' gols) contra o '+state.times[casa?jogo.fora:jogo.casa].nome+'.');}});
    }
  });
  const m=meu(state),jm=jogoDoTime(state,m);
  const adv=state.times[jm.casa===m.id?jm.fora:jm.casa];
  const ehClassico=state.rivalId!=null&&(jm.casa===state.rivalId||jm.fora===state.rivalId);
  noticia(state,(ehClassico?'🔥 CLÁSSICO! ':'')+state.times[jm.casa].nome+' '+jm.gc+' x '+jm.gf+' '+state.times[jm.fora].nome+(jm.eventos.filter(e=>e.tipo==='vermelho').length?' (com expulsão)':''));
  if(ehClassico){
    const meuGols=jm.casa===m.id?jm.gc:jm.gf,advGols=jm.casa===m.id?jm.gf:jm.gc;
    if(meuGols>advGols){state.classico.v++;m.moral=clamp(m.moral+10,0,100);}
    else if(meuGols<advGols){state.classico.d++;m.moral=clamp(m.moral-10,0,100);}
    else state.classico.e++;
  }
  if(m.caixa<0)noticia(state,'Atenção: o caixa está negativo. Venda jogadores ou reduza a folha.');
  for(let i=0;i<rnd(1,3);i++)if(Math.random()<.5)negocioIA(state);
  if(Math.random()<.12)eventoVestiario(state);
  if(Math.random()<.08)convocarSelecao(state);
  if(Math.random()<.15)ofertaRecebida(state);
  CONFEDERACOES.filter(c=>c!==m.conf).forEach(conf=>{
    const tor=state.continentais[conf];
    if(tor&&tor.campeao==null&&tor.jogos.length&&state.rodada>=tor.rodadaAlvo)jogarFaseMataMata(state,tor);
  });
  if(CONFEDERACOES.every(c=>state.continentais[c]&&state.continentais[c].campeao!=null)&&!state.mundial){
    gerarMundial(state);jogarMundial(state);
  }
  state.rodada++;state.dia++;
  if(state.rodada>=RODADAS_TEMPORADA)state.fimTemporada=true;
  m.treino={passe:Math.round(m.treino.passe*.4),falta:Math.round(m.treino.falta*.4),penalti:Math.round(m.treino.penalti*.4),fisico:Math.round(m.treino.fisico*.4)};
  state.diasParaJogo=DIAS_ENTRE_RODADAS;
  m.pontosTreino=TREINO_PONTOS_POR_RODADA;
  if(state.janela.aberta){state.janela.dias--;if(state.janela.dias<=0)state.janela.aberta=false;}
  if(!state.janela.meioAberta&&state.rodada===Math.floor(RODADAS_TEMPORADA/2)){
    state.janela={aberta:true,dias:10,meioAberta:true};noticia(state,'Janela de transferências do meio da temporada aberta! 10 dias.');
  }
}

return {
  // dados
  NOMES,SOBRENOMES,APELIDOS,POSICOES,ELENCO_BASE,TIMES_BASE,CONFEDERACOES,CONF_NOME,
  CIDADES_MUNDO,SUFIXOS_POR_CONF,TIMES_MUNDO,RODADAS_TEMPORADA,DIAS_ENTRE_RODADAS,TREINO_PONTOS_POR_RODADA,
  CAIXA_TIER,CAIXA_BONUS_TEMPORADA,TITULO_PREMIO,VICE_PREMIO,BONUS_VITORIA,FORMACOES,ESTILOS,COMPAT,TV,TREINOS,ATRIBUTOS_BASE,ATRIBUTOS_POSICAO,CARACTERISTICAS_ESPECIAIS,
  STAFF_NOMES,STAFF_DESC,FASES_COPA,CLASSICOS,TIPOS_FALTA,TIPOS_PENALTI,
  SETORES_ESTADIO,EMPRESAS_PATROCINIO,PERSONALIDADES,
  // utilidades
  rnd,pick,clamp,fmt,diaDaRodada,rivalDe,gerarClubesConfederacao,garantirNomesClubes,
  // estado/mundo
  meu,J,valorJogador,gerarJogador,garantirLaterais,gerarEscudo,renderEscudo,gerarClassicos,rivalDoEstado,novoJogo,gerarCalendario,gerarTemporada,noticia,formacaoDoClube,ladoDoSlot,parseValorEntrada,salvarFormacaoPersonalizada,criarCarreiraTecnico,registrarConquistaTecnico,registrarPartidaTecnico,reconstruirEstatisticasTecnico,atualizarCarreiraTecnico,
  pickPersonalidade,gerarDNA,custoRenovacao,reputacaoJogador,
  // competições
  criarTorneioMataMata,simularJogoCopa,jogarFaseMataMata,jogarTorneio,gerarCopa,
  gerarTorneiosContinentais,gerarMundial,jogarMundial,
  // escalação/força
  rating,autoEscalar,forcaTime,forcaTimeAoVivo,podeAtaqueTotal,ativarAtaqueTotal,substituirIndisponiveis,
  // simulação
  criarPartida,emCampo,escolherAutor,minuto,finalizar,resolverCobranca,rodadaAtual,
  resolverRodadasForaneas,prepararRodada,jogoDoTime,
  // tabela/temporada
  tabela,posicao,resumoTemporada,premiosMundiais,novaTemporada,gerarOfertasEmprego,assumirClube,
  // economia/mercado
  transferir,negocioIA,eventoVestiario,convocarSelecao,ofertaRecebida,treinar,disponivelNoMercado,
  criarSetoresIniciais,recalcularCapacidade,calcularBilheteria,calcularSocios,
  // fim de rodada
  concluirRodada,
};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=Motor;
if(typeof window!=='undefined')window.Motor=Motor;
})();
