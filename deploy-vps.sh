#!/usr/bin/env bash
set -euo pipefail

if [ "$EUID" -ne 0 ]; then
  echo "Execute como root: sudo bash deploy-vps.sh"
  exit 1
fi

APP_DIR="/var/www/alvisicuts"
DOMAIN="${1:-seu-dominio.com}"
ADMIN_PASSWORD="${2:-alvisi2026}"

apt update && apt upgrade -y
apt install -y curl git nginx certbot python3-certbot-nginx ca-certificates

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

if [ ! -d "$APP_DIR" ]; then
  git clone https://github.com/SEU_USUARIO/SEU_REPO.git "$APP_DIR"
fi

cd "$APP_DIR"
cat > .env <<EOF
NODE_ENV=production
PORT=3000
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF

npm install --production
npm install -g pm2

pm2 delete alvisicuts >/dev/null 2>&1 || true
pm2 start server.js --name alvisicuts --env production
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

cat > /etc/nginx/sites-available/alvisicuts <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3000;
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

ln -sf /etc/nginx/sites-available/alvisicuts /etc/nginx/sites-enabled/alvisicuts
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m admin@$DOMAIN

systemctl status nginx --no-pager
pm2 status

echo ""
echo "Deploy concluído!"
echo "Acesse: https://$DOMAIN"
echo "Painel do dono: https://$DOMAIN/login.html"
echo "Senha do painel: $ADMIN_PASSWORD"
