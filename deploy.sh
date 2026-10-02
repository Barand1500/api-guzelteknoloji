#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/htdocs/api.guzelteknoloji.com}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
npm install --omit=dev
npm install --no-save typescript
npm run build

if pm2 describe guzel-api >/dev/null 2>&1; then
  pm2 restart ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save
echo "Deploy tamamlandı: $(date -Is)"
