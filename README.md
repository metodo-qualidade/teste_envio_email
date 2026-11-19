# Enviar e-mail pelo Microsoft 365

Aplicação Node.js independente para testes. O mecanismo de envio foi extraído de `src/middlewares/email-utils.js`: Nodemailer, `smtp.office365.com`, porta `587`, autenticação por login/senha e remetente igual ao login. A conexão exige STARTTLS e TLS 1.2 ou superior.

Você pode copiar **somente esta pasta** para outro local e executá-la. Ela tem dependências e arquivos próprios e não importa código, credenciais, banco de dados ou configurações do portal.

## Preparar

Requisito: Node.js 20 ou superior com npm.

```powershell
cd enviar-email-microsoft
npm install
```

O `.env` local já está criado e vazio. Se você recebeu a pasta por Git, crie-o com `Copy-Item .env.example .env`.

Preencha o `.env`:

```dotenv
MICROSOFT_LOGIN=seu-email@empresa.com.br
MICROSOFT_SENHA="sua-senha"
EMAIL_ASSUNTO="Meu e-mail de teste"
```

Mantenha a senha entre aspas para preservar caracteres como `#` e espaços. O `.env` está no `.gitignore`; nenhuma credencial do portal foi copiada. O script lê apenas o `.env` desta pasta, mesmo quando chamado de outro diretório, e não usa variáveis de ambiente herdadas para substituir esses valores.

Edite `corpo-email.html` com o conteúdo desejado. Ele é enviado como HTML, sem processamento de Handlebars ou substituição de variáveis.

Substitua os exemplos em `destinatarios.json` por um ou mais endereços:

```json
[
  "pessoa1@empresa.com.br",
  "pessoa2@empresa.com.br"
]
```

Use apenas endereços, sem nomes. Para um único destinatário, deixe um único item no array. Todos recebem a mesma mensagem e aparecem no campo **Para**, visíveis entre si.

## Validar e enviar

```powershell
npm run validar
npm start
```

`npm run validar` verifica credenciais preenchidas, estrutura do JSON, formato básico dos endereços e HTML não vazio, **sem conectar ou enviar**. Ele não verifica a senha na Microsoft nem a existência das caixas postais.

`npm start` realiza um envio real. A aceitação pelo SMTP e o ID da mensagem aparecem no terminal; isso não garante entrega na caixa de entrada. Falhas encerram com código 1. Se houver rejeição parcial, o script mostra os endereços recusados e também encerra com código 1; os aceitos já foram processados. Não há novas tentativas automáticas.

## Autenticação Microsoft

Esta aplicação replica o envio SMTP por login/senha do portal e se destina a contas corporativas Microsoft 365/Exchange Online. A conta precisa permitir **SMTP AUTH** e a política da organização precisa permitir autenticação por usuário/senha. Se essas opções estiverem bloqueadas, preencher uma senha válida não será suficiente. Consulte a [documentação oficial de SMTP AUTH](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission).

Conforme o [cronograma publicado pela Microsoft](https://techcommunity.microsoft.com/blog/exchange/updated-exchange-online-smtp-auth-basic-authentication-deprecation-timeline/4489835), a autenticação básica SMTP será desativada por padrão para organizações existentes no fim de dezembro de 2026, com possibilidade de reativação pelo administrador. Esta versão não implementa OAuth2.

## Verificação automatizada

```powershell
npm test
```

Os testes usam arquivos temporários e transporte local do Nodemailer. Não conectam à Microsoft nem enviam e-mails reais.
