/* ===== Catálogo: carregado do backend (/api/produtos) — os preços oficiais ficam no servidor ===== */
let PRODUTOS = [];

/* Gera ilustração SVG (data URI) para cada produto/variação — sem depender de imagens externas */
function arte(cor, variacao = 0){
  const fundos = ['#fdeef3','#ffffff','#f6f6f8'];
  const s = 1 + variacao * 0.25;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <rect width="400" height="400" fill="${fundos[variacao % 3]}"/>
    <circle cx="200" cy="210" r="${140 + variacao*20}" fill="${cor}" opacity=".35"/>
    <g transform="translate(200 220) scale(${s}) translate(-200 -220)">
      <rect x="150" y="110" width="100" height="40" rx="8" fill="#2b2b2e"/>
      <rect x="135" y="145" width="130" height="190" rx="26" fill="${cor}" stroke="#fff" stroke-width="6"/>
      <rect x="155" y="195" width="90" height="70" rx="10" fill="#fff" opacity=".85"/>
      <text x="200" y="236" font-family="Georgia,serif" font-size="20" letter-spacing="3" text-anchor="middle" fill="#2b2b2e">KAWAI</text>
    </g></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/* Fotos do produto: usa as imagens reais (p.imgs) ou, se não houver, a ilustração gerada */
const fotos = p => p.imgs || [0,1,2].map(i => arte(p.cor, i));
const capa  = p => fotos(p)[0];

/* ===== Dados da loja — EDITE AQUI com os contatos reais ===== */
const CONTATOS = {
  whatsapp: '5511938004977',            // DDI + DDD + número, só dígitos
  whatsappExibir: '(11) 93800-4977',
  instagram: '_ka_wa_iiiiiiii',        // sem o @
  tiktok: '_ka_wa_iiiiiiii0',           // sem o @
  endereco: 'Rua Barão de Iguape, 174 — Liberdade, São Paulo/SP'
};

/* Monta colagem do topo, categorias, contatos e links do rodapé */
function renderLoja(){
  const fp = PRODUTOS.find(p => p.imgs);   // usa as fotos reais do produto, se existirem
  const f = fp ? fp.imgs : [arte('#f8c8d8',0), arte('#bfe0f5',1), arte('#ffe7a3',2)];
  $('collage').innerHTML = f.slice(0,3).map(src => `<div><img src="${src}" alt="Produtos da KAWAI"></div>`).join('');

  const CATS = [
    {t:'Skincare', d:'Limpadores, toners, séruns e hidratantes para uma rotina completa, do jeito coreano.', cor:'#c9e8c3'},
    {t:'Proteção solar', d:'Protetores leves, de toque seco, perfeitos para usar todos os dias.', cor:'#ffd9a8'},
    {t:'Máscaras faciais', d:'Sheet masks para hidratar, acalmar e dar brilho em um passo só.', cor:'#f8c8d8'},
    {t:'Maquiagem e acessórios', d:'Iluminadores e itens fofos, como a concha de sereia com pingente de pérola.', cor:'#fdeef3', img: fp ? fp.imgs[0] : null}
  ];
  $('catGrid').innerHTML = CATS.map(c => `
    <a href="#produtos" class="cat reveal"><div class="cat-img"><img src="${c.img || arte(c.cor,1)}" alt="${c.t}"></div>
    <div class="cat-info"><h3>${c.t}</h3><p>${c.d}</p></div></a>`).join('');

  const wa = 'https://wa.me/' + CONTATOS.whatsapp;
  const ig = 'https://instagram.com/' + CONTATOS.instagram;
  const tt = 'https://tiktok.com/@' + CONTATOS.tiktok;
  const mapa = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(CONTATOS.endereco);
  const cts = [
    {i:'', t:'WhatsApp',  v:CONTATOS.whatsappExibir, h:wa},
    {i:'', t:'Instagram', v:'@' + CONTATOS.instagram, h:ig},
    {i:'', t:'TikTok',    v:'@' + CONTATOS.tiktok,    h:tt},
    {i:'', t:'Endereço',  v:CONTATOS.endereco,        h:mapa}
  ];
  $('contatosGrid').innerHTML = cts.map(c => `
    <a class="ct reveal" href="${c.h}" target="_blank" rel="noopener"><span class="ct-i">${c.i}</span><strong>${c.t}</strong><span>${c.v}</span></a>`).join('');

  $('ftIg').href = ig; $('ftTt').href = tt; $('ftWa').href = wa; $('ftEnd').textContent = '📍 ' + CONTATOS.endereco;
}

/* ===== Estado ===== */
let carrinho = [];          // [{id, qtd}]
let freteSel = null;        // {nome, valor, prazo}
let pagamento = 'pix';
let produtoAtual = null;

const $ = id => document.getElementById(id);
const moeda = v => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

/* ===== Vitrine ===== */
function renderGrid(){
  $('grid').innerHTML = PRODUTOS.map(p => `
    <article class="card reveal" data-id="${p.id}">
      <div class="img"><img src="${capa(p)}" alt="${p.nome}" loading="lazy"></div>
      <div class="info">
        <h3>${p.nome}</h3>
        <p>${p.desc}</p>
        <span class="preco">${moeda(p.preco)}</span>
      </div>
    </article>`).join('');
  document.querySelectorAll('.card').forEach(c => {
    c.addEventListener('click', () => abrirModal(+c.dataset.id));
    observer.observe(c);
  });
}

/* Animação ao rolar */
const observer = new IntersectionObserver(es => es.forEach(e => {
  if(e.isIntersecting){ e.target.classList.add('show'); observer.unobserve(e.target); }
}), {threshold:.15});

/* ===== Modal ===== */
function abrirModal(id){
  produtoAtual = PRODUTOS.find(p => p.id === id);
  const p = produtoAtual;
  $('mNome').textContent = p.nome;
  $('mPreco').textContent = moeda(p.preco);
  $('mDesc').textContent = p.desc;
  $('mIng').textContent = p.ing;
  $('mImg').src = capa(p);
  $('mThumbs').innerHTML = fotos(p).map((src,i) => `<img src="${src}" class="${i===0?'on':''}" data-i="${i}" alt="Vista ${i+1}">`).join('');
  $('mThumbs').querySelectorAll('img').forEach(t => t.addEventListener('click', () => {
    $('mImg').src = fotos(p)[+t.dataset.i];
    $('mThumbs').querySelectorAll('img').forEach(x => x.classList.remove('on'));
    t.classList.add('on');
  }));
  $('modal').classList.add('open'); $('overlay').classList.add('open');
}
function fecharTudo(){
  ['modal','drawer','overlay'].forEach(i => $(i).classList.remove('open'));
}
$('modalClose').onclick = $('drawerClose').onclick = $('overlay').onclick = fecharTudo;
document.addEventListener('keydown', e => e.key === 'Escape' && fecharTudo());
$('mAdd').onclick = () => { add(produtoAtual.id); fecharTudo(); toast('Adicionado ao carrinho 💖'); };

/* ===== Carrinho ===== */
function add(id){
  const it = carrinho.find(i => i.id === id);
  it ? it.qtd++ : carrinho.push({id, qtd:1});
  renderCarrinho();
  $('cartCount').classList.remove('bump'); void $('cartCount').offsetWidth; $('cartCount').classList.add('bump');
}
function mudarQtd(id, d){
  const it = carrinho.find(i => i.id === id);
  it.qtd += d;
  if(it.qtd <= 0) carrinho = carrinho.filter(i => i.id !== id);
  renderCarrinho();
}
function remover(id){ carrinho = carrinho.filter(i => i.id !== id); renderCarrinho(); }
const subtotal = () => carrinho.reduce((s,i) => s + PRODUTOS.find(p => p.id === i.id).preco * i.qtd, 0);

function renderCarrinho(){
  $('cartCount').textContent = carrinho.reduce((s,i) => s + i.qtd, 0);
  $('items').innerHTML = carrinho.length ? carrinho.map(i => {
    const p = PRODUTOS.find(x => x.id === i.id);
    return `<div class="item">
      <img src="${capa(p)}" alt="">
      <div class="d"><strong>${p.nome}</strong><br>
        <div class="qty"><button onclick="mudarQtd(${p.id},-1)">−</button><span>${i.qtd}</span><button onclick="mudarQtd(${p.id},1)">+</button></div>
        <button class="rem" onclick="remover(${p.id})">remover</button></div>
      <div><strong>${moeda(p.preco * i.qtd)}</strong></div></div>`;
  }).join('') : '<div class="vazio">Seu carrinho está vazio 🌸</div>';
  const k = JSON.stringify(carrinho);
  if(freteKey && k !== freteKey){ freteSel = null; freteKey = null; $('fretes').innerHTML = ''; }
  const sub = subtotal(), fr = (carrinho.length && freteSel) ? freteSel.valor : 0;
  $('tSub').textContent = moeda(sub);
  $('tFrete').textContent = freteSel && carrinho.length ? moeda(fr) : '—';
  $('tTotal').textContent = moeda(sub + fr);
  renderPagamento();
}
$('cartBtn').onclick = () => { $('drawer').classList.add('open'); $('overlay').classList.add('open'); };

/* ===== Frete (API dos Correios, consultada pelo backend) ===== */
let freteKey = null;   // "foto" do carrinho no momento do cálculo
const API = (url, body) => fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)})
  .then(async r => { const d = await r.json().catch(() => ({})); if(!r.ok) throw new Error(d.erro || 'Erro na requisição'); return d; });

$('cep').addEventListener('input', e => {
  let v = e.target.value.replace(/\D/g,'').slice(0,8);
  e.target.value = v.length > 5 ? v.slice(0,5) + '-' + v.slice(5) : v;
});
$('cepBtn').onclick = async () => {
  const cep = $('cep').value.replace(/\D/g,'');
  if(cep.length !== 8) return toast('Digite um CEP válido com 8 dígitos');
  if(!carrinho.length) return toast('Adicione produtos antes de calcular o frete');
  $('cepBtn').disabled = true; $('cepBtn').textContent = '...';
  try{
    const {opcoes} = await API('/api/frete', {cep, items:carrinho});
    freteSel = null; freteKey = JSON.stringify(carrinho);
    $('fretes').innerHTML = opcoes.map((o,i) => `
      <div class="frete" data-i="${i}"><span><strong>${o.servico}</strong>${o.simulado ? ' <small>(simulado)</small>' : ''}<br><small>${o.prazo} dias úteis</small></span><strong>${moeda(o.valor)}</strong></div>`).join('');
    $('fretes').querySelectorAll('.frete').forEach(el => el.onclick = () => {
      $('fretes').querySelectorAll('.frete').forEach(x => x.classList.remove('sel'));
      el.classList.add('sel'); freteSel = opcoes[+el.dataset.i]; renderCarrinho();
    });
  }catch(e){ toast(e.message); }
  finally{ $('cepBtn').disabled = false; $('cepBtn').textContent = 'Calcular'; }
};

/* ===== Pagamento (Mercado Pago, via backend) ===== */
let pixInfo = null;    // {pedidoId, qr, copiaCola, msg}
let pollTimer = null;

function renderPagamento(){
  const el = $('pay');
  if(pixInfo){
    el.innerHTML = `<img src="data:image/png;base64,${pixInfo.qr}" alt="QR Code PIX" style="width:170px;margin:auto">
      <p>Escaneie o QR Code ou copie o código:</p>
      <input readonly id="pixCode" value="${pixInfo.copiaCola}">
      <button class="btn sec" style="margin-top:8px" onclick="copiarPix()">Copiar código</button>
      <p style="margin-top:8px">${pixInfo.msg || '⏳ Aguardando pagamento…'}</p>`;
    return;
  }
  el.innerHTML = pagamento === 'pix'
    ? '<p>O QR Code PIX é gerado ao clicar em <strong>Finalizar Compra</strong>.</p>'
    : `<p>Você será levado ao <strong>Mercado Pago</strong> para pagar com ${pagamento === 'cartao' ? 'cartão de crédito' : 'boleto'}, com segurança.</p>`;
}
function copiarPix(){ navigator.clipboard.writeText($('pixCode').value).then(() => toast('Código PIX copiado!')); }

$('tabs').querySelectorAll('button').forEach(b => b.onclick = () => {
  pagamento = b.dataset.p; pixInfo = null; clearInterval(pollTimer);
  $('tabs').querySelectorAll('button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); renderPagamento();
});

/* ===== Finalizar compra ===== */
function limparCarrinho(){
  carrinho = []; freteSel = null; freteKey = null; pixInfo = null; clearInterval(pollTimer);
  $('fretes').innerHTML = ''; $('cep').value = ''; renderCarrinho();
}
$('finish').onclick = async () => {
  if(!carrinho.length) return toast('Adicione produtos ao carrinho');
  if(!freteSel) return toast('Calcule e escolha o frete');
  const nome = $('cliNome').value.trim(), email = $('cliEmail').value.trim();
  if(nome.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) return toast('Informe seu nome e e-mail');
  $('finish').disabled = true; $('finish').textContent = 'Processando...';
  try{
    const d = await API('/api/checkout', {items:carrinho, cep:$('cep').value, servico:freteSel.servico, metodo:pagamento, nome, email});
    if(d.initPoint){ location.href = d.initPoint; return; }          // cartão / boleto → Checkout Pro
    pixInfo = {pedidoId:d.pedidoId, qr:d.qrBase64, copiaCola:d.copiaCola};  // PIX → QR Code na própria página
    renderPagamento(); acompanhar(d.pedidoId);
  }catch(e){ toast(e.message); }
  finally{ $('finish').disabled = false; $('finish').textContent = 'Finalizar Compra'; }
};

/* Consulta o status do pedido a cada 4s até o PIX ser confirmado */
function acompanhar(id){
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try{
      const d = await (await fetch('/api/pedidos/' + id)).json();
      if(d.status === 'pago'){ limparCarrinho(); fecharTudo(); toast('Pagamento confirmado! Obrigada pela compra 🎉'); }
      if(d.status === 'recusado'){ clearInterval(pollTimer); pixInfo.msg = '❌ Pagamento não aprovado.'; renderPagamento(); }
    }catch(_){}
  }, 4000);
}

/* ===== Toast ===== */
let tt;
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ===== Modo claro / escuro ===== */
function aplicarTema(t){
  document.documentElement.setAttribute('data-theme', t);
  $('themeBtn').textContent = t === 'dark' ? '☀️' : '🌙';
  $('themeBtn').setAttribute('aria-label', t === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro');
}
$('themeBtn').onclick = () => {
  const novo = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  aplicarTema(novo);
  try{ localStorage.setItem('kawai-tema', novo); }catch(_){}   // lembra a escolha
};
aplicarTema(document.documentElement.getAttribute('data-theme') || 'light');

/* Início */
(async function init(){
  try{ PRODUTOS = await (await fetch('/api/produtos')).json(); }
  catch(_){ toast('Não foi possível carregar os produtos. O servidor está rodando?'); }
  renderGrid(); renderCarrinho(); renderLoja();
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

  // Retorno do Mercado Pago (cartão/boleto): ?pedido=ID
  const ped = new URLSearchParams(location.search).get('pedido');
  if(ped){
    history.replaceState({}, '', location.pathname);
    try{
      const d = await (await fetch('/api/pedidos/' + ped)).json();
      toast(d.status === 'pago' ? 'Pagamento confirmado! 🎉' : d.status === 'recusado' ? 'Pagamento não aprovado.' : 'Pedido recebido. Aguardando confirmação do pagamento.');
    }catch(_){}
  }
})();
