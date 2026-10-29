#!/bin/sh
# Shared lines of the Mac scripts of the installed V1 app (install/compose.yaml). Paths only.

# Docker Desktop puts "docker" in one of these; a double-clicked file may not have them.
PATH="$PATH:/usr/local/bin:/opt/homebrew/bin:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin"
export PATH

PRM_INSTALL=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PRM_APP=$(dirname -- "$PRM_INSTALL")
# The folder the person sees: the one with the installer files (the launchers set it), else the
# app folder. The certificate and the backups go there.
PRM_HOME=${PRM_HOME:-$PRM_APP}
PRM_COMPOSE_FILE="$PRM_INSTALL/compose.yaml"
PRM_PORT=8443

prm_fail() {
  printf '\nSTOPPED: %s\n' "$*" >&2
  exit 1
}

prm_compose() {
  docker compose -f "$PRM_COMPOSE_FILE" "$@"
}

# The address of the app, from the PRM_HOST line the installer wrote in install/.env.
prm_url() {
  host=$(sed -n 's/^PRM_HOST=//p' "$PRM_INSTALL/.env" 2>/dev/null | head -n 1)
  [ -n "$host" ] || prm_fail "The app is not installed yet. Double-click the installer first."
  printf 'https://%s:%s\n' "$host" "$PRM_PORT"
}

# Opens Docker Desktop when it is not running, and waits for it (at most 3 minutes).
prm_docker_ready() {
  if ! command -v docker >/dev/null 2>&1; then
    printf 'Docker Desktop is not installed. The download page opens now.\n'
    printf 'Install Docker Desktop for Mac, open it once, then run this again.\n'
    open "https://www.docker.com/products/docker-desktop/" 2>/dev/null || true
    prm_fail "Docker Desktop is needed."
  fi
  if ! docker info >/dev/null 2>&1; then
    printf 'Opening Docker Desktop. Please wait...\n'
    open -a Docker 2>/dev/null || prm_fail "Docker Desktop did not open. Open it, then try again."
    tries=0
    until docker info >/dev/null 2>&1; do
      tries=$((tries + 1))
      [ "$tries" -le 90 ] || prm_fail "Docker Desktop did not start in 3 minutes. Open it, then try again."
      sleep 2
    done
  fi
  docker compose version >/dev/null 2>&1 || prm_fail "This Docker has no 'docker compose'. Update Docker Desktop."
}

# Waits until the screens answer (about 1 minute at most), then opens them in the browser.
prm_open_browser() {
  url=$(prm_url)
  tries=0
  until curl --silent --output /dev/null --insecure "$url/" 2>/dev/null; do
    tries=$((tries + 1))
    [ "$tries" -le 60 ] || break
    sleep 1
  done
  open "$url" 2>/dev/null || true
  printf 'The app is at %s\n' "$url"
}
