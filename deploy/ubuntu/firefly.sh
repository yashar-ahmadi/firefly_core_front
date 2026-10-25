#!/usr/bin/env bash
# Firefly storefront on an Ubuntu server: build, zero-downtime deploy, rollback and nginx config,
# one shop at a time. The step-by-step guide is docs/deploy-ubuntu.html.
# اسکریپت استقرار فروشگاه روی سرور اوبونتو؛ راهنمای کامل: docs/deploy-ubuntu.html
#
#   sudo deploy/ubuntu/firefly.sh init     <shop>          create /etc/firefly/<shop>.env
#   sudo deploy/ubuntu/firefly.sh deploy   <shop>          build this checkout and switch to it
#   sudo deploy/ubuntu/firefly.sh rollback <shop> [tag]    switch back to the previous release
#   sudo deploy/ubuntu/firefly.sh nginx    <shop>          write the shop's nginx config
#   sudo deploy/ubuntu/firefly.sh status   <shop>
#   sudo deploy/ubuntu/firefly.sh logs     <shop> [docker logs options, default -f --tail 200]
#
# Each shop runs as one container, "blue" or "green", on 127.0.0.1 only (the app trusts the
# X-Real-IP header nginx sets, so its port must never face the internet). A deploy starts the new
# release on the idle colour's port, waits for /healthz/, points nginx's upstream at it, reloads
# nginx (its old workers finish the requests in flight), then stops the old container. Next.js
# exits on SIGTERM without draining, so the switch happens in nginx first.
#
# The shop's settings live in /etc/firefly/<shop>.env: the app's variables (.env.example) plus
# the DEPLOY_* lines `init` appends, which only this script reads. The file is parsed, never
# sourced, and goes to the container as is (`docker run --env-file`; the app drops one pair of
# quotes around a value itself).
#
# Paths and commands can be changed through the environment (the defaults suit a stock Ubuntu
# with nginx from apt and certbot): FIREFLY_CONFIG_DIR, FIREFLY_STATE_DIR, NGINX_CONF_DIR,
# NGINX_UPSTREAM_DIR, NGINX_TEST, NGINX_RELOAD, NGINX_VERSION, NGINX_BROTLI (auto|on|off),
# LETSENCRYPT_LIVE, ACME_ROOT.

set -Eeuo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG_DIR="${FIREFLY_CONFIG_DIR:-/etc/firefly}"
STATE_DIR="${FIREFLY_STATE_DIR:-/var/lib/firefly}"
NGINX_CONF_DIR="${NGINX_CONF_DIR:-/etc/nginx/conf.d}"
NGINX_UPSTREAM_DIR="${NGINX_UPSTREAM_DIR:-/etc/nginx/firefly}"
NGINX_TEST="${NGINX_TEST:-nginx -t -q}"
NGINX_RELOAD="${NGINX_RELOAD:-systemctl reload nginx}"
LETSENCRYPT_LIVE="${LETSENCRYPT_LIVE:-/etc/letsencrypt/live}"
ACME_ROOT="${ACME_ROOT:-/var/www/letsencrypt}"
IMAGE_REPO="firefly-front"
HEALTH_TIMEOUT=120

die() {
  echo "firefly: $*" >&2
  exit 1
}
note() { echo "firefly: $*"; }

usage() {
  sed -n '6,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-1}"
}

# --- Settings ------------------------------------------------------------------------------------

# The value of KEY in an env file: its last assignment, without one pair of surrounding quotes.
env_get() {
  local file="$1" key="$2" line value
  line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 || true)"
  value="${line#*=}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value#"${value%%[![:space:]]*}"}"
  if [[ ${#value} -ge 2 && ( ${value:0:1} == '"' || ${value:0:1} == "'" ) && ${value: -1} == "${value:0:1}" ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

check_shop() {
  [[ "${1:-}" =~ ^[a-z0-9][a-z0-9-]{0,30}$ ]] ||
    die "shop name must be lowercase letters, digits and dashes (e.g. digital-shop): '${1:-}'"
}

env_file() { echo "$CONFIG_DIR/$1.env"; }

load_shop() {
  SHOP="$1"
  ENV_FILE="$(env_file "$SHOP")"
  [[ -f "$ENV_FILE" ]] || die "$ENV_FILE is missing: run 'firefly.sh init $SHOP' first"
  API_URL="$(env_get "$ENV_FILE" FIREFLY_API_URL)"
  SITE_URL="$(env_get "$ENV_FILE" SITE_URL)"
  PORT_BLUE="$(env_get "$ENV_FILE" DEPLOY_PORT_BLUE)"
  PORT_GREEN="$(env_get "$ENV_FILE" DEPLOY_PORT_GREEN)"
  NPM_REGISTRY="$(env_get "$ENV_FILE" DEPLOY_NPM_REGISTRY)"
  CACHE_SIZE="$(env_get "$ENV_FILE" DEPLOY_CACHE_SIZE)"
  MEMORY="$(env_get "$ENV_FILE" DEPLOY_MEMORY)"
  KEEP="$(env_get "$ENV_FILE" DEPLOY_KEEP_RELEASES)"
  DRAIN="$(env_get "$ENV_FILE" DEPLOY_DRAIN_SECONDS)"
  CACHE_SIZE="${CACHE_SIZE:-512m}"
  KEEP="${KEEP:-3}"
  DRAIN="${DRAIN:-10}"
  [[ "$PORT_BLUE" =~ ^[0-9]+$ && "$PORT_GREEN" =~ ^[0-9]+$ && "$PORT_BLUE" != "$PORT_GREEN" ]] ||
    die "DEPLOY_PORT_BLUE and DEPLOY_PORT_GREEN in $ENV_FILE must be two different port numbers"
  [[ "$KEEP" =~ ^[1-9][0-9]*$ ]] || die "DEPLOY_KEEP_RELEASES must be a positive number"
  [[ "$DRAIN" =~ ^[0-9]+$ ]] || die "DEPLOY_DRAIN_SECONDS must be a number of seconds"
  SHOP_STATE="$STATE_DIR/$SHOP"
  UPSTREAM_FILE="$NGINX_UPSTREAM_DIR/$SHOP.upstream"
  NGINX_SHOP_CONF="$NGINX_CONF_DIR/firefly-$SHOP.conf"
}

require_app_urls() {
  [[ "$API_URL" =~ ^https?://[^/?#]+ ]] || die "FIREFLY_API_URL in $ENV_FILE must be the API's public URL"
  # Inside the container, localhost is the container itself; the API must be reached by the
  # public address it gives its image URLs (docs/DEPLOYMENT.md).
  [[ ! "$API_URL" =~ ^https?://(localhost|127\.|\[::1\]) ]] ||
    die "FIREFLY_API_URL points to localhost ($API_URL): set the API's public address, e.g. https://api.shop.ir"
  [[ "$SITE_URL" =~ ^https://[^/?#]+/?$ ]] ||
    die "SITE_URL in $ENV_FILE must be the shop's public https:// address without a path, e.g. https://shop.ir"
}

shop_domain() {
  local host="${SITE_URL#https://}"
  host="${host%/}"
  [[ "$host" != www.* ]] ||
    die "SITE_URL uses www ($SITE_URL): use the bare domain; nginx sends www.<domain> to it"
  printf '%s' "$host"
}

# --- Containers ----------------------------------------------------------------------------------

container() { echo "firefly-$SHOP-$1"; }
port_of() { if [[ "$1" == blue ]]; then echo "$PORT_BLUE"; else echo "$PORT_GREEN"; fi; }
other() { if [[ "$1" == blue ]]; then echo green; else echo blue; fi; }

running() { [[ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null || true)" == true ]]; }

# The colour nginx points at (the upstream file), else the one running container, else nothing.
active_colour() {
  local port
  if [[ -f "$UPSTREAM_FILE" ]]; then
    port="$(sed -n 's/^[[:space:]]*server 127\.0\.0\.1:\([0-9]*\);.*/\1/p' "$UPSTREAM_FILE" | head -n 1)"
    if [[ "$port" == "$PORT_BLUE" ]] && running "$(container blue)"; then echo blue && return; fi
    if [[ "$port" == "$PORT_GREEN" ]] && running "$(container green)"; then echo green && return; fi
  fi
  if running "$(container blue)"; then echo blue; elif running "$(container green)"; then echo green; fi
}

http_status() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$@" || true
}

wait_healthy() {
  local name="$1" port="$2" waited=0
  while ((waited < HEALTH_TIMEOUT)); do
    running "$name" || return 1
    [[ "$(http_status "http://127.0.0.1:$port/healthz/")" == 200 ]] && return 0
    sleep 2
    waited=$((waited + 2))
  done
  return 1
}

start_release() {
  local colour="$1" image="$2" name port font
  name="$(container "$colour")"
  port="$(port_of "$colour")"
  docker rm -f "$name" >/dev/null 2>&1 || true
  local args=(
    -d --name "$name" --restart unless-stopped
    --env-file "$ENV_FILE"
    -p "127.0.0.1:$port:3000"
    # The data cache grows with every new listing query and Next never prunes it: keep it in a
    # bounded tmpfs owned by the image's `node` user (docs/DEPLOYMENT.md).
    --tmpfs "/app/.next/cache:rw,size=$CACHE_SIZE,uid=1000,gid=1000,mode=0755"
    --log-opt max-size=10m --log-opt max-file=5
    --label "org.firefly.shop=$SHOP"
  )
  [[ -z "$MEMORY" ]] || args+=(--memory "$MEMORY")
  font="$CONFIG_DIR/$SHOP-font.woff2"
  [[ ! -f "$font" ]] || args+=(-v "$font:/app/public/fonts/custom/font.woff2:ro")
  note "starting $name ($image) on 127.0.0.1:$port"
  docker run "${args[@]}" "$image" >/dev/null
  if ! wait_healthy "$name" "$port"; then
    echo "--- last log lines of $name ---" >&2
    docker logs --tail 40 "$name" >&2 || true
    docker rm -f "$name" >/dev/null 2>&1 || true
    die "$name did not answer /healthz/ with 200 within ${HEALTH_TIMEOUT}s; the running release is untouched"
  fi
}

write_upstream() {
  mkdir -p "$NGINX_UPSTREAM_DIR"
  printf '# Written by deploy/ubuntu/firefly.sh: the %s release of %s.\nserver 127.0.0.1:%s;\n' \
    "$2" "$SHOP" "$1" >"$UPSTREAM_FILE.tmp"
  mv "$UPSTREAM_FILE.tmp" "$UPSTREAM_FILE"
}

# Point nginx at the new colour. Without the shop's nginx config yet, only the file is written.
switch_nginx() {
  local port="$1" colour="$2" previous=""
  [[ ! -f "$UPSTREAM_FILE" ]] || previous="$(cat "$UPSTREAM_FILE")"
  write_upstream "$port" "$colour"
  [[ -f "$NGINX_SHOP_CONF" ]] || {
    note "nginx is not configured for $SHOP yet: run 'firefly.sh nginx $SHOP' next"
    return 0
  }
  if ! $NGINX_TEST || ! $NGINX_RELOAD; then
    if [[ -n "$previous" ]]; then printf '%s\n' "$previous" >"$UPSTREAM_FILE"; else rm -f "$UPSTREAM_FILE"; fi
    return 1
  fi
}

record_release() {
  echo "$1" >>"$SHOP_STATE/releases"
}

# Keep the images of the last $KEEP releases (and any image a container still uses).
prune_images() {
  local keep_tags image
  keep_tags="$(tac "$SHOP_STATE/releases" 2>/dev/null | awk '!seen[$0]++' | head -n "$KEEP")"
  while read -r image; do
    [[ -n "$image" ]] || continue
    grep -qxF "${image#*:}" <<<"$keep_tags" && continue
    [[ -z "$(docker ps -aq --filter "ancestor=$image")" ]] || continue
    docker rmi "$image" >/dev/null 2>&1 && note "removed old image $image" || true
  done < <(docker images --format '{{.Repository}}:{{.Tag}}' "$IMAGE_REPO/$SHOP")
}

# Start $image on the idle colour, move nginx to it, then retire the old container.
switch_to() {
  local image="$1" tag="${1#*:}" active next port
  active="$(active_colour)"
  next="blue"
  [[ -z "$active" ]] || next="$(other "$active")"
  port="$(port_of "$next")"
  start_release "$next" "$image"
  if ! switch_nginx "$port" "$next"; then
    docker rm -f "$(container "$next")" >/dev/null 2>&1 || true
    die "nginx rejected the switch (nginx -t or reload failed); the running release is untouched"
  fi
  if [[ -n "$active" ]]; then
    note "draining $(container "$active") for ${DRAIN}s"
    sleep "$DRAIN"
    docker stop --time 30 "$(container "$active")" >/dev/null || true
    docker rm "$(container "$active")" >/dev/null 2>&1 || true
  fi
  record_release "$tag"
  prune_images
  # /healthz/ never calls the API; robots.txt does (docs/DEPLOYMENT.md, health check).
  local robots
  robots="$(http_status -H "Host: $(shop_domain)" -H 'X-Forwarded-Proto: https' "http://127.0.0.1:$port/robots.txt")"
  [[ "$robots" == 200 ]] ||
    note "warning: /robots.txt answered $robots, so the API may be unreachable or the API key wrong (docker logs $(container "$next"))"
  note "$SHOP now serves $image ($next, 127.0.0.1:$port)"
}

# --- Commands ------------------------------------------------------------------------------------

cmd_init() {
  local shop="$1" file port=3000 used
  file="$(env_file "$shop")"
  [[ ! -e "$file" ]] || die "$file already exists"
  mkdir -p "$CONFIG_DIR"
  chmod 700 "$CONFIG_DIR"
  local others=("$CONFIG_DIR"/*.env)
  used=""
  [[ ! -e "${others[0]}" ]] ||
    used="$(sed -n 's/^[[:space:]]*DEPLOY_PORT_\(BLUE\|GREEN\)=\([0-9]*\).*/\2/p' "${others[@]}")"
  while grep -qxE "$port|$((port + 1))" <<<"$used"; do port=$((port + 10)); done
  (
    umask 077
    {
      cat "$REPO/.env.example"
      cat <<EOF

# --- deploy/ubuntu/firefly.sh (the app ignores these) / تنظیمات اسکریپت استقرار ---

# Two local ports, one per release colour; every shop on this server needs its own pair.
# دو پورت محلی برای دو نسخهٔ آبی و سبز؛ هر فروشگاه روی این سرور جفت پورت خودش را دارد.
DEPLOY_PORT_BLUE=$port
DEPLOY_PORT_GREEN=$((port + 1))

# Size of the in-memory data cache (tmpfs), taken from the container's RAM.
# اندازهٔ کش داده در حافظه (tmpfs) که از رم کانتینر برداشته می‌شود.
DEPLOY_CACHE_SIZE=512m

# Optional memory limit for the container, e.g. 1g.
# سقف اختیاری حافظهٔ کانتینر، مثلاً 1g.
# DEPLOY_MEMORY=1g

# npm registry for the image build, e.g. a mirror when registry.npmjs.org is unreachable.
# رجیستری npm برای ساخت ایمیج؛ مثلاً یک mirror وقتی registry.npmjs.org در دسترس نیست.
# DEPLOY_NPM_REGISTRY=https://registry.npmjs.org/

# How many releases to keep for rollback, and seconds to let the old one finish its requests.
# تعداد نسخه‌هایی که برای بازگشت نگه داشته می‌شوند و مهلت پایان درخواست‌های نسخهٔ قبلی (ثانیه).
DEPLOY_KEEP_RELEASES=3
DEPLOY_DRAIN_SECONDS=10
EOF
    } >"$file"
  )
  note "created $file (ports $port and $((port + 1)))"
  note "edit it now: FIREFLY_API_URL, FIREFLY_API_KEY, SITE_URL, STORE_PRESET and the rest"
}

cmd_deploy() {
  load_shop "$1"
  require_app_urls
  shop_domain >/dev/null
  mkdir -p "$SHOP_STATE"
  exec 9>"$SHOP_STATE/lock"
  flock -n 9 || die "another deploy of $SHOP is running"

  local sha tag image
  sha="$(git -c safe.directory="$REPO" -C "$REPO" rev-parse --short=12 HEAD)"
  [[ -z "$(git -c safe.directory="$REPO" -C "$REPO" status --porcelain --untracked-files=no)" ]] ||
    sha="$sha-dirty"
  tag="$(date -u +%Y%m%d-%H%M%S)-$sha"
  image="$IMAGE_REPO/$SHOP:$tag"
  local build=(--build-arg "FIREFLY_API_URL=$API_URL" --label "org.firefly.shop=$SHOP" -t "$image")
  [[ -z "$NPM_REGISTRY" ]] || build+=(--build-arg "NPM_REGISTRY=$NPM_REGISTRY")
  note "building $image"
  docker build "${build[@]}" "$REPO"
  switch_to "$image"
}

cmd_rollback() {
  load_shop "$1"
  shop_domain >/dev/null
  mkdir -p "$SHOP_STATE"
  exec 9>"$SHOP_STATE/lock"
  flock -n 9 || die "another deploy of $SHOP is running"
  local tag="${2:-}" current
  current="$(tail -n 1 "$SHOP_STATE/releases" 2>/dev/null || true)"
  if [[ -z "$tag" ]]; then
    tag="$(tac "$SHOP_STATE/releases" 2>/dev/null | awk -v cur="$current" '$0 != cur' | head -n 1)"
    [[ -n "$tag" ]] || die "no earlier release of $SHOP is recorded"
  fi
  docker image inspect "$IMAGE_REPO/$SHOP:$tag" >/dev/null 2>&1 ||
    die "image $IMAGE_REPO/$SHOP:$tag is not on this server (see 'firefly.sh status $SHOP')"
  switch_to "$IMAGE_REPO/$SHOP:$tag"
}

cmd_status() {
  load_shop "$1"
  local active
  active="$(active_colour)"
  if [[ -z "$active" ]]; then
    note "$SHOP: no running release"
  else
    local name port
    name="$(container "$active")"
    port="$(port_of "$active")"
    echo "shop:       $SHOP ($(shop_domain))"
    echo "active:     $name on 127.0.0.1:$port"
    echo "image:      $(docker inspect -f '{{.Config.Image}}' "$name")"
    echo "started:    $(docker inspect -f '{{.State.StartedAt}}' "$name")"
    echo "/healthz/:  $(http_status "http://127.0.0.1:$port/healthz/")"
  fi
  echo "releases (newest last, images still on this server marked *):"
  local tag
  while read -r tag; do
    [[ -n "$tag" ]] || continue
    if docker image inspect "$IMAGE_REPO/$SHOP:$tag" >/dev/null 2>&1; then echo "  * $tag"; else echo "    $tag"; fi
  done < <(tail -n 10 "$SHOP_STATE/releases" 2>/dev/null || true)
}

cmd_logs() {
  load_shop "$1"
  shift
  local active
  active="$(active_colour)"
  [[ -n "$active" ]] || die "$SHOP has no running release"
  if (($# == 0)); then set -- -f --tail 200; fi
  docker logs "$@" "$(container "$active")"
}

# nginx config from deploy/nginx.conf.example, the one maintained (and unit-tested) copy:
#   firefly-http.conf       its http-level part (log masks, offline Vary): once per server
#   firefly-<shop>.conf     its upstream and server blocks for this shop
# Until the shop's certificate exists, only the port-80 block is written, so certbot can answer
# the ACME challenge from $ACME_ROOT.
cmd_nginx() {
  load_shop "$1"
  require_app_urls
  local domain example="$REPO/deploy/nginx.conf.example" with_tls=1 http2 brotli
  domain="$(shop_domain)"
  [[ -f "$LETSENCRYPT_LIVE/$domain/fullchain.pem" ]] || with_tls=0

  http2="directive"
  local version="${NGINX_VERSION:-$(nginx -v 2>&1 | sed -n 's|.*nginx/\([0-9.]*\).*|\1|p')}"
  # `http2 on;` needs nginx 1.25.1 (Ubuntu 26.04 has 1.28); older ones take `listen … http2`.
  if [[ -n "$version" ]] && [[ "$(printf '%s\n1.25.1\n' "$version" | sort -V | head -n 1)" != 1.25.1 ]]; then
    http2="listen"
  fi
  brotli="${NGINX_BROTLI:-auto}"
  if [[ "$brotli" == auto ]]; then
    if grep -qs brotli /etc/nginx/modules-enabled/*.conf /etc/nginx/nginx.conf; then brotli=on; else brotli=off; fi
  fi

  mkdir -p "$NGINX_CONF_DIR" "$ACME_ROOT"
  # The http-level part: from the first section after the file's opening comment to the upstream.
  {
    echo "# Written by deploy/ubuntu/firefly.sh from deploy/nginx.conf.example (http level, shared by"
    echo "# every shop on this server). Edit the example in the repository, then run the script again."
    echo
    awk 'started && /^upstream firefly_storefront \{/ { exit }
         started { print }
         !started && /^$/ { started = 1 }' "$example"
  } >"$NGINX_CONF_DIR/firefly-http.conf"

  [[ -f "$UPSTREAM_FILE" ]] || write_upstream "$PORT_BLUE" blue

  {
    echo "# Written by deploy/ubuntu/firefly.sh from deploy/nginx.conf.example for the shop '$SHOP'."
    echo "# Edit the example in the repository (or this file, knowing the script overwrites it)."
    echo
    awk -v tls="$with_tls" '
      /^upstream firefly_storefront \{/ { started = 1 }
      !started { next }
      # Before the certificate exists: the upstream and the port-80 block only.
      tls == 0 && /^server \{/ { block = ""; depth = 0; inserver = 1 }
      inserver {
        block = block $0 "\n"
        depth += gsub(/\{/, "{"); depth -= gsub(/\}/, "}")
        if (depth == 0) { if (block ~ /listen 80;/) printf "%s", block; inserver = 0 }
        next
      }
      tls == 0 && /^# / && seen_upstream { next }
      { print }
      /^\}/ { seen_upstream = 1 }
    ' "$example" |
      sed -e "s|^\([[:space:]]*\)server 127\.0\.0\.1:3000;|\1include $UPSTREAM_FILE;|" \
        -e "s|firefly_storefront|firefly_$SHOP|g" \
        -e "s|<shop\.example\.ir>|$domain|g" \
        -e "s|<shop>|$SHOP|g" \
        -e "s|/var/www/letsencrypt|$ACME_ROOT|g" \
        -e "s|/etc/letsencrypt/live|$LETSENCRYPT_LIVE|g" |
      if [[ "$http2" == listen ]]; then
        sed -e '/^[[:space:]]*http2 on;/d' -e 's/listen \(\[::\]:\)\{0,1\}443 ssl;/listen \1443 ssl http2;/'
      else cat; fi |
      if [[ "$brotli" == off ]]; then
        # Without ngx_brotli, nginx -t fails on these directives: drop them (and continuation lines).
        awk '/^[[:space:]]*brotli/ { skip = 1 } skip { if ($0 ~ /;[[:space:]]*$/) skip = 0; next } { print }'
      else cat; fi
  } >"$NGINX_SHOP_CONF"

  note "wrote $NGINX_CONF_DIR/firefly-http.conf and $NGINX_SHOP_CONF"
  [[ "$brotli" == on ]] || note "brotli is off (module not loaded); gzip still compresses"
  if ((with_tls == 0)); then
    note "no certificate for $domain yet: only the port-80 block is written. Next:"
    echo "  sudo nginx -t && sudo systemctl reload nginx"
    echo "  sudo certbot certonly --webroot -w $ACME_ROOT -d $domain -d www.$domain \\"
    echo "    --deploy-hook 'systemctl reload nginx'"
    echo "  sudo $0 nginx $SHOP     # again, now with TLS"
  else
    echo "  sudo nginx -t && sudo systemctl reload nginx"
  fi
}

main() {
  local command="${1:-}"
  [[ -n "$command" ]] || usage 1
  [[ "$command" != help && "$command" != -h && "$command" != --help ]] || usage 0
  shift
  check_shop "${1:-}"
  case "$command" in
    init) cmd_init "$1" ;;
    deploy) cmd_deploy "$1" ;;
    rollback) cmd_rollback "$@" ;;
    status) cmd_status "$1" ;;
    logs) cmd_logs "$@" ;;
    nginx) cmd_nginx "$1" ;;
    *) usage 1 ;;
  esac
}

main "$@"
