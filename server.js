// KAWAI — backend (Express)
// Frete: API dos Correios (preço + prazo) · Pagamento: Mercado Pago (PIX via API, cartão/boleto via Checkout Pro)
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';

/* ===== Configuração (variáveis do .env) ===== */
const env = process.env;
const PORT = env.PORT || 3000;
const BASE_URL = (env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const HTTPS = BASE_URL.startsWith('https://');
const CORREIOS_URL = env.CORREIOS_BASE_URL || 'https://api.correios.com.br';
const CEP_ORIGEM = (env.CEP_ORIGEM || '01503001').replace(/\D/g, '');
const SERVICOS = [
  { servico: 'PAC',   codigo: env.CORREIOS_COD_PAC   || '03298' },
  { servico: 'SEDEX', codigo: env.CORREIOS_COD_SEDEX || '03220' },
];
const TEM_CORREIOS = ['CORREIOS_USUARIO', 'CORREIOS_CODIGO_ACESSO', 'CORREIOS_CARTAO', 'CORREIOS_CONTRATO', 'CORREIOS_DR'].every(k => env[k]);
const mp = env.MP_ACCESS_TOKEN ? new MercadoPagoConfig({ accessToken: env.MP_ACCESS_TOKEN }) : null;

if (!TEM_CORREIOS) console.warn('⚠️  Credenciais dos Correios ausentes: o frete será SIMULADO.');
if (!mp) console.warn('⚠️  MP_ACCESS_TOKEN ausente: o checkout está desativado.');

/* ===== Catálogo (fonte oficial dos preços: o cliente nunca define o valor) ===== */
const CATALOGO = [
  { id: 1, nome: 'Protetor Solar Bioré UV Aqua Rich', preco: 69.90, peso: 90, cor: '#ffd9a8',
    desc: 'Textura aquosa, FPS 50+, toque seco e sem resíduo branco.',
    ing: 'Água, Etanol, Ácido Hialurônico, Octocrileno, Zinco, Extrato de Cenoura, Tocoferol.' },
  { id: 2, nome: 'Toner Anua Heartleaf 77%', preco: 119.90, peso: 350, cor: '#c9e8c3',
    desc: 'Tônico calmante com extrato de houttuynia para pele sensível.',
    ing: 'Extrato de Houttuynia Cordata (77%), Água, Butilenoglicol, Pantenol, Alantoína, Betaína.' },
  { id: 3, nome: 'Hidratante Laneige Water Bank', preco: 189.90, peso: 120, cor: '#bfe0f5',
    desc: 'Gel-creme com hidratação intensa por até 72 horas.',
    ing: 'Água, Glicerina, Esqualano, Água Mineral, Extrato de Chá Verde, Ácido Hialurônico, Niacinamida.' },
  { id: 4, nome: 'Sheet Masks Mediheal (caixa c/ 10)', preco: 79.90, peso: 280, cor: '#f8c8d8',
    desc: 'Máscaras faciais individuais com hidratação e brilho imediato.',
    ing: 'Água, Glicerina, Colágeno Hidrolisado, Pantenol, Extrato de Aloe Vera, Adenosina.' },
  { id: 5, nome: 'Sérum Beauty of Joseon Glow', preco: 109.90, peso: 100, cor: '#ffe7a3',
    desc: 'Sérum iluminador com propólis e niacinamida para pele luminosa.',
    ing: 'Extrato de Própolis (60%), Niacinamida (2%), Água, Butilenoglicol, Hamamélis, Pantenol.' },
  { id: 6, nome: 'Limpador Facial Cosrx Low pH', preco: 84.90, peso: 190, cor: '#e3d4f5',
    desc: 'Gel de limpeza suave que respeita a barreira natural da pele.',
    ing: 'Água, Cocamidopropil Betaína, Óleo da Árvore do Chá, Extrato de Bétula, Ácido Salicílico (BHA).' },
  // Produto vindo do Instagram da loja. ⚠️ CONFIRMAR: preço, peso e composição abaixo são provisórios.
  { id: 7, nome: 'Iluminador Concha de Sereia Flower Knows', preco: 99.90, peso: 80, cor: '#fdeef3',
    imgs: ['/img/iluminador-flower-knows-1.jpg', '/img/iluminador-flower-knows-rosa.jpg', '/img/iluminador-flower-knows-azul.jpg'],
    desc: 'Iluminador compacto numa elegante concha cor de marfim, com pingente de pérola. Leve na bolsa para ter o brilho perfeito onde for.',
    ing: 'Composição a confirmar — consulte a embalagem do produto.' },
];

/* ===== Pedidos (arquivo JSON simples — em produção, troque por um banco de dados) ===== */
const ORDERS_FILE = new URL('./orders.json', import.meta.url);
const orders = fs.existsSync(ORDERS_FILE) ? JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')) : {};
const salvar = () => fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));

/* ===== Utilitários ===== */
const erro = (status, msg) => Object.assign(new Error(msg), { status });
const r2 = v => Math.round(v * 100) / 100;
const h = fn => (req, res, next) => fn(req, res, next).catch(next); // captura erros de rotas async

function linhasDoCarrinho(items) {
  if (!Array.isArray(items) || !items.length || items.length > 30) throw erro(400, 'Carrinho inválido.');
  return items.map(i => {
    const p = CATALOGO.find(x => x.id === Number(i.id));
    const qtd = Number(i.qtd);
    if (!p || !Number.isInteger(qtd) || qtd < 1 || qtd > 20) throw erro(400, 'Item inválido no carrinho.');
    return { ...p, qtd };
  });
}
const pesoTotal = linhas => Math.max(300, linhas.reduce((s, l) => s + l.peso * l.qtd, 0) + 150); // + embalagem; mínimo 300 g
const limparCep = cep => {
  const c = String(cep || '').replace(/\D/g, '');
  if (c.length !== 8) throw erro(400, 'CEP inválido.');
  return c;
};

/* ===== Correios ===== */
let tokenCache = { token: null, exp: 0 };

// Autentica com usuário + código de acesso (Basic) e cartão de postagem; o token dura ~24h
async function correiosToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp - 60_000) return tokenCache.token;
  const basic = Buffer.from(`${env.CORREIOS_USUARIO}:${env.CORREIOS_CODIGO_ACESSO}`).toString('base64');
  const r = await fetch(`${CORREIOS_URL}/token/v1/autentica/cartaopostagem`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ numero: env.CORREIOS_CARTAO }),
  });
  if (!r.ok) throw erro(502, 'Falha ao autenticar nos Correios.');
  const d = await r.json();
  tokenCache = { token: d.token, exp: new Date(d.expiraEm).getTime() };
  return d.token;
}

// Frete simulado (usado quando não há credenciais dos Correios, ex.: desenvolvimento)
function simularFrete(cep) {
  const f = 1 + Number(cep[0]) * 0.12, d = Number(cep[0]);
  return [
    { servico: 'PAC',   valor: r2(18.5 * f), prazo: 4 + d,                  simulado: true },
    { servico: 'SEDEX', valor: r2(32.9 * f), prazo: 1 + Math.floor(d / 3), simulado: true },
  ];
}

async function cotarFrete(cepDestino, pesoG) {
  if (!TEM_CORREIOS) return simularFrete(cepDestino);
  const headers = { Authorization: `Bearer ${await correiosToken()}`, Accept: 'application/json' };

  const resultados = await Promise.allSettled(SERVICOS.map(async s => {
    const precoQ = new URLSearchParams({
      cepOrigem: CEP_ORIGEM, cepDestino, nuContrato: env.CORREIOS_CONTRATO, nuDR: env.CORREIOS_DR,
      psObjeto: String(pesoG), tpObjeto: '2', comprimento: '20', largura: '16', altura: '12', diametro: '0',
    });
    const prazoQ = new URLSearchParams({ cepOrigem: CEP_ORIGEM, cepDestino });
    const [rp, rz] = await Promise.all([
      fetch(`${CORREIOS_URL}/preco/v1/nacional/${s.codigo}?${precoQ}`, { headers }),
      fetch(`${CORREIOS_URL}/prazo/v1/nacional/${s.codigo}?${prazoQ}`, { headers }),
    ]);
    if (!rp.ok || !rz.ok) throw new Error(`${s.servico}: preço ${rp.status} / prazo ${rz.status}`);
    const preco = await rp.json(), prazo = await rz.json();
    const valor = Number(String(preco.pcFinal).replace(/\./g, '').replace(',', '.')); // "1.234,56" → 1234.56
    const dias = Number(prazo.prazoEntrega);
    if (!Number.isFinite(valor) || !Number.isFinite(dias)) throw new Error(`${s.servico}: resposta inesperada`);
    return { servico: s.servico, valor: r2(valor), prazo: dias, simulado: false };
  }));

  const ok = resultados.filter(r => r.status === 'fulfilled').map(r => r.value);
  resultados.filter(r => r.status === 'rejected').forEach(r => console.error('Correios:', r.reason.message));
  if (!ok.length) throw erro(502, 'Não foi possível calcular o frete agora. Tente novamente.');
  return ok;
}

/* ===== Mercado Pago: status ===== */
function aplicarStatus(o, st) {
  const novo = st === 'approved' ? 'pago'
    : ['rejected', 'cancelled', 'refunded', 'charged_back'].includes(st) ? 'recusado' : 'pendente';
  if (o.status !== novo) { o.status = novo; o.atualizado = new Date().toISOString(); salvar(); }
}

// Valida o header x-signature das notificações (https://www.mercadopago.com.br/developers)
function assinaturaValida(req, dataId) {
  if (!env.MP_WEBHOOK_SECRET) return true; // somente em testes
  const sig = String(req.headers['x-signature'] || '');
  const ts = /ts=([^,]+)/.exec(sig)?.[1], v1 = /v1=([^,]+)/.exec(sig)?.[1];
  if (!ts || !v1 || !dataId) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${req.headers['x-request-id'] || ''};ts:${ts};`;
  const esperado = crypto.createHmac('sha256', env.MP_WEBHOOK_SECRET).update(manifest).digest('hex');
  return esperado.length === v1.length && crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(v1));
}

/* ===== App ===== */
const app = express();
app.use(express.json({ limit: '50kb' }));
app.use(express.static(new URL('./public', import.meta.url).pathname));

// Catálogo para a vitrine (sem o peso)
app.get('/api/produtos', (_req, res) => res.json(CATALOGO.map(({ peso, ...p }) => p)));

// Frete: consulta Correios (PAC e SEDEX) com o peso real do carrinho
app.post('/api/frete', h(async (req, res) => {
  const cep = limparCep(req.body.cep);
  const linhas = linhasDoCarrinho(req.body.items);
  res.json({ opcoes: await cotarFrete(cep, pesoTotal(linhas)) });
}));

// Checkout: recalcula tudo no servidor e cria o pagamento no Mercado Pago
app.post('/api/checkout', h(async (req, res) => {
  if (!mp) throw erro(503, 'Pagamentos indisponíveis no momento.');
  const { servico, metodo, nome, email } = req.body;
  const cep = limparCep(req.body.cep);
  if (!['pix', 'cartao', 'boleto'].includes(metodo)) throw erro(400, 'Forma de pagamento inválida.');
  if (String(nome || '').trim().length < 2 || !/^\S+@\S+\.\S+$/.test(email || '')) throw erro(400, 'Informe nome e e-mail válidos.');

  const linhas = linhasDoCarrinho(req.body.items);
  const frete = (await cotarFrete(cep, pesoTotal(linhas))).find(o => o.servico === servico);
  if (!frete) throw erro(400, 'Serviço de frete indisponível. Calcule o frete novamente.');

  const subtotal = r2(linhas.reduce((s, l) => s + l.preco * l.qtd, 0));
  const total = r2(subtotal + frete.valor);
  const id = crypto.randomUUID();
  orders[id] = { id, status: 'pendente', metodo, nome, email, cep, servico, frete: frete.valor, subtotal, total,
    itens: linhas.map(l => ({ id: l.id, nome: l.nome, qtd: l.qtd, preco: l.preco })), criado: new Date().toISOString() };
  salvar();

  const notification_url = HTTPS ? `${BASE_URL}/webhook/mercadopago` : undefined; // o MP exige URL pública

  if (metodo === 'pix') {
    const pg = await new Payment(mp).create({
      body: {
        transaction_amount: total, description: `Pedido KAWAI ${id.slice(0, 8)}`, payment_method_id: 'pix',
        external_reference: id, notification_url, payer: { email, first_name: nome },
      },
      requestOptions: { idempotencyKey: id },
    });
    const td = pg.point_of_interaction?.transaction_data;
    if (!td?.qr_code) throw erro(502, 'Não foi possível gerar o PIX.');
    orders[id].paymentId = pg.id; salvar();
    return res.json({ pedidoId: id, qrBase64: td.qr_code_base64, copiaCola: td.qr_code });
  }

  // Cartão / boleto: Checkout Pro (a página do Mercado Pago coleta os dados do cartão — o site não toca neles)
  const excluidos = metodo === 'cartao'
    ? ['ticket', 'atm', 'bank_transfer', 'account_money']
    : ['credit_card', 'debit_card', 'prepaid_card', 'bank_transfer', 'account_money'];
  const back = `${BASE_URL}/?pedido=${id}`;
  const pref = await new Preference(mp).create({
    body: {
      items: [
        ...linhas.map(l => ({ id: String(l.id), title: l.nome, quantity: l.qtd, unit_price: l.preco, currency_id: 'BRL' })),
        { id: 'frete', title: `Frete ${frete.servico}`, quantity: 1, unit_price: frete.valor, currency_id: 'BRL' },
      ],
      payer: { email, name: nome },
      external_reference: id,
      notification_url,
      back_urls: { success: back, pending: back, failure: back },
      ...(HTTPS && { auto_return: 'approved' }),
      payment_methods: { excluded_payment_types: excluidos.map(i => ({ id: i })) },
    },
  });
  res.json({ pedidoId: id, initPoint: pref.init_point });
}));

// Status do pedido (o front consulta a cada 4s no PIX). Se o webhook ainda não chegou, sincroniza com o MP.
app.get('/api/pedidos/:id', h(async (req, res) => {
  const o = orders[req.params.id];
  if (!o) throw erro(404, 'Pedido não encontrado.');
  if (o.status === 'pendente' && o.paymentId && mp) {
    try { aplicarStatus(o, (await new Payment(mp).get({ id: o.paymentId })).status); } catch (e) { console.error('MP get:', e.message); }
  }
  res.json({ status: o.status });
}));

// Webhook do Mercado Pago: confirma o pagamento consultando a API (nunca confie só no corpo da notificação)
app.post('/webhook/mercadopago', h(async (req, res) => {
  const dataId = req.query['data.id'] || req.body?.data?.id;
  const type = req.query.type || req.body?.type;
  if (!assinaturaValida(req, dataId)) return res.sendStatus(401);
  if (type === 'payment' && dataId && mp) {
    const pg = await new Payment(mp).get({ id: dataId });
    const o = orders[pg.external_reference];
    if (o) { o.paymentId = pg.id; aplicarStatus(o, pg.status); }
  }
  res.sendStatus(200);
}));

// Tratamento de erros
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ erro: err.status ? err.message : 'Erro interno. Tente novamente.' });
});

app.listen(PORT, () => console.log(`KAWAI rodando em ${BASE_URL}`));
