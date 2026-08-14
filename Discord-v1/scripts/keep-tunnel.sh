#!/usr/bin/env bash
# Keep a Cloudflare quick tunnel alive.
# Error 1033 / HTTP 530 = hostname orphaned. Only a NEW quick tunnel fixes it.
# Dead hosts are auto-blacklisted and never reused.
# Sandbox system DNS often times out on *.trycloudflare.com — always probe via DoH + --resolve.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URLFILE="$ROOT/.dashboard-url"
ENVFILE="$ROOT/.env"
LOG="$ROOT/logs/tunnel-watch.log"
CFLOG="$ROOT/logs/cloudflared.log"
LOCK="$ROOT/logs/keep-tunnel.lock"
DEAD="$ROOT/logs/dead-hosts.txt"
mkdir -p "$ROOT/logs"
touch "$DEAD"

# Single instance
if [[ -f "$LOCK" ]]; then
  old="$(cat "$LOCK" 2>/dev/null || true)"
  if [[ -n "$old" ]] && kill -0 "$old" 2>/dev/null && [[ "$old" != "$$" ]]; then
    echo "[$(date -u +%FT%TZ)] already running pid=$old — exit" >>"$LOG"
    exit 0
  fi
fi
echo $$ >"$LOCK"
trap 'rm -f "$LOCK"' EXIT

find_cf() {
  if [[ -x /home/user/.npm/_npx/8a26fc3a61fe4212/node_modules/cloudflared/bin/cloudflared ]]; then
    echo /home/user/.npm/_npx/8a26fc3a61fe4212/node_modules/cloudflared/bin/cloudflared
    return
  fi
  local found
  found="$(find /home/user/.npm/_npx -name cloudflared -type f 2>/dev/null | head -1)"
  if [[ -n "$found" && -x "$found" ]]; then
    echo "$found"
    return
  fi
  echo cloudflared
}

CF="$(find_cf)"
FAILS=0
echo "[$(date -u +%FT%TZ)] keep-tunnel start pid=$$ cf=$CF" >>"$LOG"

host_of() {
  local url="${1:-}"
  url="${url#http://}"
  url="${url#https://}"
  url="${url%%/*}"
  url="${url%%:*}"
  printf '%s' "$url" | tr '[:upper:]' '[:lower:]'
}

is_dead() {
  local host
  host="$(host_of "${1:-}")"
  [[ -z "$host" ]] && return 0
  grep -qiFx "$host" "$DEAD" 2>/dev/null
}

mark_dead() {
  local host
  host="$(host_of "${1:-}")"
  [[ -z "$host" ]] && return 0
  if ! grep -qiFx "$host" "$DEAD" 2>/dev/null; then
    printf '%s\n' "$host" >>"$DEAD"
    echo "[$(date -u +%FT%TZ)] auto-removed dead host $host" >>"$LOG"
  fi
  # Drop dead URL from live files so nothing reuses it.
  if [[ -f "$URLFILE" ]]; then
    local cur
    cur="$(host_of "$(cat "$URLFILE" 2>/dev/null || true)")"
    if [[ "$cur" == "$host" ]]; then
      : >"$URLFILE"
    fi
  fi
}

update_env() {
  local url="$1"
  local host
  host="$(host_of "$url")"
  if is_dead "$host"; then
    echo "[$(date -u +%FT%TZ)] refuse blacklisted host $host" >>"$LOG"
    return 1
  fi
  python3 - "$ENVFILE" "$url" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
url = sys.argv[2]
if not p.exists():
    raise SystemExit(0)
repls = {
    'DASHBOARD_URL': url,
    'DISCORD_REDIRECT_URI': url + '/api/auth/discord/callback',
}
out = []
for line in p.read_text().splitlines():
    if not line or line.startswith('#') or '=' not in line:
        out.append(line)
        continue
    k, _, _ = line.partition('=')
    out.append(f'{k}={repls[k]}' if k in repls else line)
p.write_text('\n'.join(out) + '\n')
PY
  printf '%s\n' "$url" >"$URLFILE"
  printf '%s\n' "$url" >"$ROOT/../PUBLIC_DASHBOARD.txt" 2>/dev/null || true
  printf '%s\n' "$url" >"/home/user/PUBLIC_DASHBOARD.txt" 2>/dev/null || true
}

current_url() {
  local raw=""
  if [[ -s "$URLFILE" ]]; then
    raw="$(tr -d ' \r\n' <"$URLFILE")"
  else
    raw="$(grep '^DASHBOARD_URL=' "$ENVFILE" 2>/dev/null | cut -d= -f2- || true)"
  fi
  local host
  host="$(host_of "$raw")"
  # Never treat localhost / private / blacklisted as a public dashboard.
  if [[ -z "$host" || "$host" == "localhost" || "$host" == "127.0.0.1" || "$host" == "0.0.0.0" || "$host" == *.local ]]; then
    return 0
  fi
  if is_dead "$host"; then
    mark_dead "$host"
    return 0
  fi
  printf '%s' "$raw"
}

local_ok() {
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 4 http://127.0.0.1:3000/api/health || echo 000)"
  [[ "$code" == "200" ]]
}

# Resolve via DoH so sandbox libc DNS timeouts cannot fake a dead tunnel.
# Prints: IPv4 | NXDOMAIN | NODATA | (empty + exit 1 = transport fail)
resolve_doh() {
  python3 - "$1" <<'PY'
import json, sys, urllib.request
host = sys.argv[1]
urls = [
    f"https://cloudflare-dns.com/dns-query?name={host}&type=A",
    f"https://dns.google/resolve?name={host}&type=A",
]
saw = False
nx = False
for url in urls:
    try:
        req = urllib.request.Request(url, headers={"accept": "application/dns-json"})
        with urllib.request.urlopen(req, timeout=6) as r:
            data = json.load(r)
        saw = True
        if data.get("Status") == 3:
            nx = True
            continue
        for a in data.get("Answer") or []:
            if a.get("type") == 1 and a.get("data"):
                print(a["data"], end="")
                raise SystemExit(0)
    except SystemExit:
        raise
    except Exception:
        continue
if nx:
    print("NXDOMAIN", end="")
    raise SystemExit(2)
if saw:
    print("NODATA", end="")
    raise SystemExit(2)
raise SystemExit(1)
PY
}

# ok | e1033 | httpNNN | dohfail | dead
health_probe() {
  local url="$1"
  [[ -z "$url" ]] && { echo dead; return 1; }
  local host
  host="$(host_of "$url")"
  if is_dead "$host"; then
    echo dead
    return 1
  fi
  : > /tmp/cf-health.body
  local ip="" code=""
  ip="$(resolve_doh "$host" 2>/dev/null || true)"
  if [[ "$ip" == "NXDOMAIN" || "$ip" == "NODATA" ]]; then
    mark_dead "$host"
    echo e1033
    return 1
  fi
  if [[ -n "$ip" ]]; then
    code="$(curl -4 -sS -o /tmp/cf-health.body -w '%{http_code}' --max-time 10 --connect-timeout 6 \
      --resolve "${host}:443:${ip}" "$url/api/health" || true)"
  else
    echo dohfail
    return 1
  fi
  [[ -z "$code" ]] && code=000
  local body
  body="$(cat /tmp/cf-health.body 2>/dev/null || true)"
  if [[ "$code" == "200" ]] && echo "$body" | grep -q '"ok":true'; then
    echo ok
    return 0
  fi
  if [[ "$code" == "530" || "$code" == "1033" ]] || echo "$body" | grep -qiE '1033|unable to resolve it|Cloudflare Tunnel error'; then
    # Do not blacklist here — brand-new quick tunnels often 530 for a few seconds.
    echo e1033
    return 1
  fi
  echo "http$code"
  return 1
}

kill_cf() {
  pkill -f 'cloudflared tunnel --url' 2>/dev/null || true
  sleep 1
  pkill -9 -f 'cloudflared tunnel --url' 2>/dev/null || true
  sleep 1
}

# One attempt to open a tunnel. Returns 0 only when public /api/health is 200 twice.
open_once() {
  if ! local_ok; then
    echo "[$(date -u +%FT%TZ)] skip start: local dashboard not up" >>"$LOG"
    return 1
  fi
  kill_cf
  : >"$CFLOG"
  "$CF" tunnel --url http://127.0.0.1:3000 --protocol http2 --edge-ip-version 4 --no-autoupdate >>"$CFLOG" 2>&1 &
  local i url="" oks=0 e1033=0
  for i in $(seq 1 40); do
    url="$(grep -oE 'https://[a-z0-9-]+[.]trycloudflare[.]com' "$CFLOG" | tail -1 || true)"
    if [[ -n "$url" ]]; then
      if is_dead "$url"; then
        echo "[$(date -u +%FT%TZ)] extracted blacklisted $url — retry" >>"$LOG"
        return 2
      fi
      update_env "$url" || return 2
      echo "[$(date -u +%FT%TZ)] new tunnel $url" >>"$LOG"
      # Edge + cert need several seconds; probing too early looks like 1033.
      sleep 8
      local j st
      for j in $(seq 1 16); do
        st="$(health_probe "$url" || true)"
        if [[ "$st" == "ok" ]]; then
          oks=$((oks + 1))
          e1033=0
          if [[ "$oks" -ge 2 ]]; then
            echo "[$(date -u +%FT%TZ)] tunnel healthy $url" >>"$LOG"
            return 0
          fi
        else
          oks=0
          if [[ "$st" == "e1033" || "$st" == "dead" ]]; then
            e1033=$((e1033 + 1))
            echo "[$(date -u +%FT%TZ)] 1033 on $url ($e1033) — auto-removed" >>"$LOG"
            if [[ "$e1033" -ge 3 ]]; then
              mark_dead "$url"
              echo "[$(date -u +%FT%TZ)] hostname dead — opening a new tunnel" >>"$LOG"
              return 2
            fi
          else
            echo "[$(date -u +%FT%TZ)] wait $url probe=$st" >>"$LOG"
          fi
        fi
        sleep 3
      done
      echo "[$(date -u +%FT%TZ)] tunnel not healthy yet $url" >>"$LOG"
      return 2
    fi
    sleep 1
  done
  echo "[$(date -u +%FT%TZ)] failed to obtain tunnel URL" >>"$LOG"
  return 1
}

start_tunnel() {
  local n
  for n in 1 2 3 4 5; do
    open_once
    local rc=$?
    if [[ "$rc" -eq 0 ]]; then
      FAILS=0
      return 0
    fi
    echo "[$(date -u +%FT%TZ)] open_once rc=$rc attempt=$n" >>"$LOG"
    sleep 2
  done
  return 1
}

# Drop any currently stored dead URL immediately.
BOOT="$(current_url)"
if is_dead "$BOOT"; then
  echo "[$(date -u +%FT%TZ)] boot: stored URL is blacklisted — purged" >>"$LOG"
  mark_dead "$BOOT"
  : >"$URLFILE"
  BOOT=""
fi

URL="$BOOT"
st="$(health_probe "$URL" || true)"
if [[ "$st" != "ok" ]]; then
  echo "[$(date -u +%FT%TZ)] boot probe=$st url=${URL:-none}" >>"$LOG"
  if [[ "$st" == "e1033" || "$st" == "dead" ]]; then
    mark_dead "$URL"
  fi
  start_tunnel || true
fi

while true; do
  if ! local_ok; then
    echo "[$(date -u +%FT%TZ)] local dashboard down — waiting" >>"$LOG"
    sleep 6
    continue
  fi
  URL="$(current_url)"
  if is_dead "$URL"; then
    echo "[$(date -u +%FT%TZ)] live file pointed at dead host — purged" >>"$LOG"
    mark_dead "$URL"
    start_tunnel || true
    FAILS=0
    sleep 10
    continue
  fi
  st="$(health_probe "$URL" || true)"
  if [[ "$st" == "ok" ]]; then
    FAILS=0
  else
    FAILS=$((FAILS + 1))
    echo "[$(date -u +%FT%TZ)] health fail #$FAILS probe=$st url=${URL:-none}" >>"$LOG"
    # Only 1033/530 means the hostname is orphaned. Other errors (dohfail/http000)
    # are often sandbox DNS — do not kill a live connector for those.
    if [[ "$st" == "e1033" || "$st" == "dead" ]]; then
      mark_dead "$URL"
      start_tunnel || true
      FAILS=0
    elif [[ "$FAILS" -ge 6 ]]; then
      start_tunnel || true
      FAILS=0
    fi
  fi
  sleep 10
done
