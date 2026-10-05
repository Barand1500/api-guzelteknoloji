#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/htdocs/api.guzelteknoloji.com}"
BRANCH="${BRANCH:-main}"

APP_DIR="$(cd "$APP_DIR" && pwd -P)"
cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git merge --ff-only "origin/$BRANCH"
npm ci

next_release="$(mktemp -d "$APP_DIR/.deploy-next.XXXXXX")"
previous_release="$(mktemp -d "$APP_DIR/.deploy-previous.XXXXXX")"
swapping=0

finish_deploy() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    echo "Deploy başarısız; önceki sürüm geri yükleniyor." >&2
    if (( swapping )); then
      set +e
      [[ ! -d "$APP_DIR/public" ]] || mv -- "$APP_DIR/public" "$next_release/failed-public"
      [[ ! -d "$APP_DIR/dist" ]] || mv -- "$APP_DIR/dist" "$next_release/failed-dist"
      [[ ! -d "$previous_release/public" ]] || mv -- "$previous_release/public" "$APP_DIR/public"
      [[ ! -d "$previous_release/dist" ]] || mv -- "$previous_release/dist" "$APP_DIR/dist"
      pm2 describe guzel-api >/dev/null 2>&1 && pm2 restart ecosystem.config.cjs --update-env || true
      set -e
    fi
  fi
  rm -rf -- "$next_release"
  if (( status == 0 )); then
    rm -rf -- "$previous_release"
  else
    rmdir -- "$previous_release" 2>/dev/null || echo "Yedek sürüm: $previous_release" >&2
  fi
  exit "$status"
}
trap finish_deploy EXIT

npm run build:server -- --outDir "$next_release/dist"
PUBLIC_BUILD_DIR="$next_release/public" npm run build:frontend

PUBLIC_BUILD_DIR="$next_release/public" node --input-type=module <<'NODE'
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const output = process.env.PUBLIC_BUILD_DIR;
const html = readFileSync(join(output, "index.html"), "utf8");
const references = [...html.matchAll(/(?:src|href)="\/(assets\/[^\"]+)"/g)].map(match => match[1]);
if (references.length < 2 || references.some(file => !existsSync(join(output, file)))) {
  throw new Error("Ön yüz çıktısında eksik JS/CSS dosyası var.");
}
console.log(`Ön yüz hazır: ${readdirSync(join(output, "assets")).length} güncel asset.`);
NODE

swapping=1
[[ ! -d "$APP_DIR/dist" ]] || mv -- "$APP_DIR/dist" "$previous_release/dist"
[[ ! -d "$APP_DIR/public" ]] || mv -- "$APP_DIR/public" "$previous_release/public"
mv -- "$next_release/dist" "$APP_DIR/dist"
mv -- "$next_release/public" "$APP_DIR/public"

if pm2 describe guzel-api >/dev/null 2>&1; then
  pm2 restart ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save
echo "Deploy tamamlandı: $(date -Is). Eski assetler temizlendi."
