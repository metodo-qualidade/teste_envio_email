const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

function validarEmail(email) {
  return typeof email === 'string' && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email);
}

function lerArquivo(diretorio, nome) {
  try {
    return fs.readFileSync(path.join(diretorio, nome), 'utf8').replace(/^\uFEFF/, '');
  } catch (erro) {
    throw new Error(`Não foi possível ler ${nome} (${erro.code}).`);
  }
}

function carregarConfiguracao(diretorio = __dirname) {
  // Lê apenas o .env desta aplicação, sem carregar o ambiente do portal.
  const env = dotenv.parse(lerArquivo(diretorio, '.env'));
  const usuario = (env.MICROSOFT_LOGIN || '').trim();
  const senha = env.MICROSOFT_SENHA;
  const assunto = (env.EMAIL_ASSUNTO || '').trim();

  if (!validarEmail(usuario)) {
    throw new Error('Preencha MICROSOFT_LOGIN no .env com um e-mail válido.');
  }
  if (!senha || !senha.trim()) {
    throw new Error('Preencha MICROSOFT_SENHA no .env.');
  }
  if (!assunto || /[\r\n]/.test(assunto)) {
    throw new Error('Preencha EMAIL_ASSUNTO no .env com uma única linha.');
  }

  let destinatarios;
  try {
    destinatarios = JSON.parse(lerArquivo(diretorio, 'destinatarios.json'));
  } catch (erro) {
    if (erro instanceof SyntaxError) {
      throw new Error('destinatarios.json contém JSON inválido. Use um array de e-mails entre aspas duplas.');
    }
    throw erro;
  }
  if (!Array.isArray(destinatarios) || destinatarios.length === 0) {
    throw new Error('destinatarios.json deve conter um array com um ou mais e-mails.');
  }
  destinatarios = destinatarios.map((email, indice) => {
    if (typeof email !== 'string' || !validarEmail(email.trim())) {
      throw new Error(`Destinatário na posição ${indice + 1} é inválido. Use apenas o endereço de e-mail.`);
    }
    return email.trim();
  });

  const corpo = lerArquivo(diretorio, 'corpo-email.html');
  if (!corpo.trim()) {
    throw new Error('corpo-email.html não pode estar vazio.');
  }
  return { usuario, senha, destinatarios, assunto, corpo };
}

// Mesma interface do utilitário do portal; também permite texto puro com html=false.
async function enviarEmail(usuario, senha, destinatarios, assunto, corpo, html = true) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    requireTLS: true,
    tls: { minVersion: 'TLSv1.2' },
    auth: { user: usuario, pass: senha },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000
  });
  try {
    return await transporter.sendMail({
      from: usuario,
      to: destinatarios.join(', '),
      subject: assunto,
      [html ? 'html' : 'text']: corpo
    });
  } finally {
    transporter.close();
  }
}

async function main() {
  const argumentos = process.argv.slice(2);
  if (argumentos.length > 1 || (argumentos.length === 1 && argumentos[0] !== '--validar')) {
    throw new Error('Uso: node enviar-email.js [--validar]');
  }
  const { usuario, senha, destinatarios, assunto, corpo } = carregarConfiguracao();
  if (argumentos.includes('--validar')) {
    console.log(`Configuração válida: ${destinatarios.length} destinatário(s), assunto: ${assunto}`);
    console.log('Validação local concluída. Nenhuma conexão SMTP ou envio foi realizado.');
    return;
  }

  const info = await enviarEmail(usuario, senha, destinatarios, assunto, corpo);
  console.log('Mensagem aceita pelo servidor SMTP. ID:', info.messageId);
  console.log('Destinatários aceitos:', info.accepted.join(', '));
  if (info.rejected.length > 0) {
    console.error('Envio parcial. Destinatários recusados:', info.rejected.join(', '));
    console.error('Os destinatários aceitos já foram processados. Repetir o envio pode duplicar mensagens.');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((erro) => {
    console.error('Falha:', erro.message);
    if (erro.code === 'EAUTH') {
      console.error('Confira o login e a senha e se a conta Microsoft 365 permite SMTP AUTH com usuário e senha.');
    }
    process.exitCode = 1;
  });
}

module.exports = { carregarConfiguracao, enviarEmail };
