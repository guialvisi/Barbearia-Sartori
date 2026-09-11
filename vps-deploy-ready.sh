#!/usr/bin/env bash
set -euo pipefail

if [ "$EUID" -ne 0 ]; then
  echo "Execute como root: sudo bash vps-deploy-ready.sh"
  exit 1
fi

APP_NAME="alvisicuts"
APP_DIR="/var/www/$APP_NAME"
PORT="3000"
DOMAIN="${1:-seu-dominio.com}"
ADMIN_PASSWORD="${2:-alvisi2026}"
REPO_URL="${3:-https://github.com/SEU_USUARIO/SEU_REPO.git}"

echo "=================================================="
echo "Deploy do AlvisiCuts para VPS"
echo "=================================================="

echo "[1/7] Atualizando sistema..."
apt update && apt upgrade -y

echo "[2/7] Instalando dependências do sistema..."
apt install -y curl git nginx certbot python3-certbot-nginx ca-certificates

echo "[3/7] Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v

echo "[4/7] Clonando projeto..."
mkdir -p /var/www
if [ -d "$APP_DIR/.git" ]; then
  echo "Repositório já existe. Atualizando..."
  cd "$APP_DIR"
  git pull --ff-only || true
else
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

if [ ! -f package.json ]; then
  echo "Arquivo package.json não encontrado no repositório."
  exit 1
fi

echo "[5/7] Instalando dependências do projeto..."
cd "$APP_DIR"
cat > .env <<EOF
NODE_ENV=production
PORT=$PORT
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF
npm install --production

echo "[6/7] Configurando PM2 e iniciando app..."
npm install -g pm2
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
pm2 start server.js --name "$APP_NAME" --env production
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

cat > /etc/nginx/sites-available/$APP_NAME <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/$APP_NAME
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "[7/7] Configurando HTTPS com Let's Encrypt..."
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m admin@$DOMAIN || {
  echo "Falha ao configurar HTTPS. Verifique o domínio e DNS."
  echo "Você ainda pode acessar via http://$DOMAIN"
}

sleep 2

echo ""
echo "=================================================="
echo "DEPLOY FINALIZADO"
echo "=================================================="
echo "Site: https://$DOMAIN"
echo "Login do dono: https://$DOMAIN/login.html"
echo "Senha: $ADMIN_PASSWORD"
echo "Painel: https://$DOMAIN/admin-profissional.html"
echo ""
echo "Para verificar o app:"
echo "  pm2 logs $APP_NAME"
echo "  pm2 status"
