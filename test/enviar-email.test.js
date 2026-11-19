const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const nodemailer = require('nodemailer');
const { carregarConfiguracao, enviarEmail } = require('../enviar-email');

function criarArquivos(t, alteracoes = {}) {
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), 'teste-email-microsoft-'));
  t.after(() => fs.rmSync(diretorio, { recursive: true, force: true }));
  const arquivos = {
    '.env': 'MICROSOFT_LOGIN=teste@example.com\nMICROSOFT_SENHA="senha # de teste"\nEMAIL_ASSUNTO="Olá, teste"\n',
    'destinatarios.json': '\uFEFF["um@example.com", " dois@example.com "]',
    'corpo-email.html': '<p>Olá, mundo!</p>',
    ...alteracoes
  };
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    if (conteudo !== null) fs.writeFileSync(path.join(diretorio, nome), conteudo);
  }
  return diretorio;
}

test('carrega os arquivos locais, preserva a senha e normaliza destinatários', (t) => {
  const chave = 'MICROSOFT_LOGIN';
  const anterior = process.env[chave];
  process.env[chave] = 'ambiente-do-portal@example.com';
  t.after(() => {
    if (anterior === undefined) delete process.env[chave];
    else process.env[chave] = anterior;
  });
  const config = carregarConfiguracao(criarArquivos(t));
  assert.equal(config.usuario, 'teste@example.com');
  assert.equal(config.senha, 'senha # de teste');
  assert.equal(config.assunto, 'Olá, teste');
  assert.deepEqual(config.destinatarios, ['um@example.com', 'dois@example.com']);
  assert.equal(config.corpo, '<p>Olá, mundo!</p>');
});

test('aceita um único destinatário', (t) => {
  const diretorio = criarArquivos(t, { 'destinatarios.json': '["um@example.com"]' });
  assert.deepEqual(carregarConfiguracao(diretorio).destinatarios, ['um@example.com']);
});

for (const [nome, alteracoes, mensagem] of [
  ['arquivo ausente', { '.env': null }, /Não foi possível ler .env/],
  ['login vazio', { '.env': 'MICROSOFT_SENHA="teste"\nEMAIL_ASSUNTO=Teste' }, /MICROSOFT_LOGIN/],
  ['senha vazia', { '.env': 'MICROSOFT_LOGIN=teste@example.com\nEMAIL_ASSUNTO=Teste' }, /MICROSOFT_SENHA/],
  ['assunto vazio', { '.env': 'MICROSOFT_LOGIN=teste@example.com\nMICROSOFT_SENHA=teste' }, /EMAIL_ASSUNTO/],
  ['JSON inválido', { 'destinatarios.json': '["um@example.com",]' }, /JSON inválido/],
  ['lista vazia', { 'destinatarios.json': '[]' }, /um ou mais/],
  ['objeto no lugar do array', { 'destinatarios.json': '{}' }, /um ou mais/],
  ['endereço inválido', { 'destinatarios.json': '["invalido"]' }, /posição 1/],
  ['item não textual', { 'destinatarios.json': '[null]' }, /posição 1/],
  ['injeção de cabeçalho', { 'destinatarios.json': '["um@example.com\\r\\nBcc:outro@example.com"]' }, /posição 1/],
  ['HTML vazio', { 'corpo-email.html': '   ' }, /não pode estar vazio/]
]) {
  test(`rejeita ${nome} antes de conectar ao SMTP`, (t) => {
    assert.throws(() => carregarConfiguracao(criarArquivos(t, alteracoes)), mensagem);
  });
}

for (const html of [true, false]) {
  test(`monta mensagem ${html ? 'HTML' : 'texto'} no Nodemailer e fecha o transporte`, async (t) => {
    const original = nodemailer.createTransport;
    let opcoes;
    let fechou = false;
    t.mock.method(nodemailer, 'createTransport', (config) => {
      opcoes = config;
      // Gera a mensagem MIME real em memória, sem rede ou credenciais reais.
      const transporte = original({ streamTransport: true, buffer: true, newline: 'unix' });
      t.mock.method(transporte, 'close', () => { fechou = true; });
      return transporte;
    });
    const info = await enviarEmail(
      'teste@example.com', 'senha-ficticia', ['um@example.com', 'dois@example.com'],
      'Assunto de teste', html ? '<p>Teste</p>' : 'Teste', html
    );
    assert.deepEqual(opcoes.auth, { user: 'teste@example.com', pass: 'senha-ficticia' });
    assert.equal(opcoes.host, 'smtp.office365.com');
    assert.equal(opcoes.port, 587);
    assert.equal(opcoes.secure, false);
    assert.equal(opcoes.requireTLS, true);
    assert.equal(opcoes.tls.minVersion, 'TLSv1.2');
    assert.deepEqual(info.envelope, { from: 'teste@example.com', to: ['um@example.com', 'dois@example.com'] });
    const mensagem = info.message.toString();
    assert.match(mensagem, /Subject: Assunto de teste/);
    assert.match(mensagem, html ? /Content-Type: text\/html/ : /Content-Type: text\/plain/);
    assert.match(mensagem, html ? /<p>Teste<\/p>/ : /Teste/);
    assert.equal(fechou, true);
  });
}

test('propaga falha de autenticação e fecha o transporte', async (t) => {
  const erro = Object.assign(new Error('Autenticação recusada'), { code: 'EAUTH' });
  let fechou = false;
  t.mock.method(nodemailer, 'createTransport', () => ({
    sendMail: async () => { throw erro; },
    close: () => { fechou = true; }
  }));
  await assert.rejects(
    enviarEmail('teste@example.com', 'senha-ficticia', ['um@example.com'], 'Teste', '<p>Teste</p>'),
    (recebido) => recebido === erro
  );
  assert.equal(fechou, true);
});
