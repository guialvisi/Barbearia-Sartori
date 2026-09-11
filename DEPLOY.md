# Deploy do Bill Cuts

## Opção 1: Render (mais simples)

1. Crie uma conta em https://render.com
2. Conecte seu repositório do GitHub
3. Escolha "Web Service"
4. Use este projeto
5. Build Command: `npm install`
6. Start Command: `npm start`
7. Defina as variáveis de ambiente:
   - `NODE_ENV=production`
   - `PORT=3000`
   - `ADMIN_PASSWORD=billcuts2026` (ou outra senha mais forte)
8. Clique em "Create Web Service"

Observação: o banco SQLite fica no disco local da instância. Para uso inicial é suficiente, mas para produção mais robusta vale migrar para PostgreSQL.

## Opção 2: Railway

1. Acesse https://railway.app
2. Crie um projeto novo
3. Conecte o GitHub
4. Rode o deploy usando o comando `npm start`
5. Configure as variáveis de ambiente no painel

## Opção 3: VPS / Ubuntu

1. Conecte-se ao servidor via SSH
2. Instale Node.js 18+
3. Clone o projeto
4. Rode:
   ```bash
   npm install
   npm start
   ```
5. Configure um reverse proxy com Nginx e HTTPS via Certbot

## Dica importante

Para produção, troque a senha do painel do dono por uma senha forte e armazene em variável de ambiente, não no código-fonte.

Exemplo:

```bash
export ADMIN_PASSWORD="minha_senha_forte"
node server.js
```

## Verificação após deploy

Teste:

- https://SEU_DOMINIO/
- https://SEU_DOMINIO/login.html
- login com a senha configurada

Se o painel redirecionar corretamente e o site abrir sem erro, o deploy foi concluído.
