#!/usr/bin/env bash
# Manage local Archon development services with macOS launchd.
#
# Starts:
# - API server on the normal local dev port, with WEB_UI_DEV=1 so it does not
#   serve the built web bundle.
# - Vite web UI on http://localhost:5173.

set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "local-dev-daemon is currently macOS-only because it uses launchd." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ARCHON_HOME="${ARCHON_HOME:-$HOME/.archon}"
LOG_DIR="$ARCHON_HOME/logs/dev-daemon"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LOCAL_BIN_DIR="$HOME/.local/bin"

SERVER_LABEL="com.archon.dev.server"
WEB_LABEL="com.archon.dev.web"
SERVER_PLIST="$LAUNCH_AGENTS_DIR/$SERVER_LABEL.plist"
WEB_PLIST="$LAUNCH_AGENTS_DIR/$WEB_LABEL.plist"
GUI_DOMAIN="gui/$(id -u)"
LAUNCHER_SCRIPT="$SCRIPT_DIR/archon-dev"
LOCAL_LAUNCHER="$LOCAL_BIN_DIR/archon-dev"

resolve_bun_bin() {
  if [ -n "${BUN_BIN:-}" ]; then
    printf '%s' "$BUN_BIN"
    return
  fi

  if command -v bun >/dev/null 2>&1; then
    command -v bun
    return
  fi

  echo "Could not find bun. Set BUN_BIN=/absolute/path/to/bun and retry." >&2
  exit 1
}

xml_escape() {
  local value="$1"
  value="${value//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"
  value="${value//\"/&quot;}"
  value="${value//\'/&apos;}"
  printf '%s' "$value"
}

write_plist() {
  local label="$1"
  local plist_path="$2"
  local bun_bin="$3"
  local package_script="$4"
  local stdout_path="$5"
  local stderr_path="$6"
  local web_ui_dev="$7"

  local escaped_label escaped_bun escaped_script escaped_repo escaped_stdout escaped_stderr
  escaped_label="$(xml_escape "$label")"
  escaped_bun="$(xml_escape "$bun_bin")"
  escaped_script="$(xml_escape "$package_script")"
  escaped_repo="$(xml_escape "$REPO_ROOT")"
  escaped_stdout="$(xml_escape "$stdout_path")"
  escaped_stderr="$(xml_escape "$stderr_path")"

  cat >"$plist_path" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$escaped_label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$escaped_bun</string>
    <string>run</string>
    <string>$escaped_script</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$escaped_repo</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$escaped_stdout</string>
  <key>StandardErrorPath</key>
  <string>$escaped_stderr</string>
EOF

  if [ "$web_ui_dev" = "true" ]; then
    cat >>"$plist_path" <<EOF
  <key>EnvironmentVariables</key>
  <dict>
    <key>WEB_UI_DEV</key>
    <string>1</string>
  </dict>
EOF
  fi

  cat >>"$plist_path" <<EOF
</dict>
</plist>
EOF
}

install_plists() {
  mkdir -p "$LOG_DIR" "$LAUNCH_AGENTS_DIR"
  local bun_bin
  bun_bin="$(resolve_bun_bin)"

  touch \
    "$LOG_DIR/server.out.log" \
    "$LOG_DIR/server.err.log" \
    "$LOG_DIR/web.out.log" \
    "$LOG_DIR/web.err.log"

  write_plist \
    "$SERVER_LABEL" \
    "$SERVER_PLIST" \
    "$bun_bin" \
    "dev:server" \
    "$LOG_DIR/server.out.log" \
    "$LOG_DIR/server.err.log" \
    "true"

  write_plist \
    "$WEB_LABEL" \
    "$WEB_PLIST" \
    "$bun_bin" \
    "dev:web" \
    "$LOG_DIR/web.out.log" \
    "$LOG_DIR/web.err.log" \
    "false"

  echo "Installed launchd plists:"
  echo "  $SERVER_PLIST"
  echo "  $WEB_PLIST"
  echo "Using bun: $bun_bin"
}

bootstrap_service() {
  local label="$1"
  local plist="$2"

  if launchctl print "$GUI_DOMAIN/$label" >/dev/null 2>&1; then
    launchctl kickstart -k "$GUI_DOMAIN/$label"
  else
    launchctl bootstrap "$GUI_DOMAIN" "$plist"
  fi
}

bootout_service() {
  local label="$1"
  local plist="$2"

  if launchctl print "$GUI_DOMAIN/$label" >/dev/null 2>&1; then
    launchctl bootout "$GUI_DOMAIN" "$plist"
  fi
}

start_services() {
  install_plists
  bootstrap_service "$SERVER_LABEL" "$SERVER_PLIST"
  bootstrap_service "$WEB_LABEL" "$WEB_PLIST"
  echo "Archon dev services started."
  echo "  Web UI: http://localhost:5173"
  echo "  API:    http://localhost:3090"
  echo "  Logs:   $LOG_DIR"
}

stop_services() {
  bootout_service "$WEB_LABEL" "$WEB_PLIST"
  bootout_service "$SERVER_LABEL" "$SERVER_PLIST"
  echo "Archon dev services stopped."
}

uninstall_services() {
  stop_services
  rm -f "$SERVER_PLIST" "$WEB_PLIST"
  echo "Removed launchd plists."
}

install_launcher() {
  if [ ! -f "$LAUNCHER_SCRIPT" ]; then
    echo "Launcher script missing: $LAUNCHER_SCRIPT" >&2
    exit 1
  fi

  mkdir -p "$LOCAL_BIN_DIR"
  ln -sf "$LAUNCHER_SCRIPT" "$LOCAL_LAUNCHER"
  chmod +x "$LAUNCHER_SCRIPT"

  echo "Installed launcher: $LOCAL_LAUNCHER"
  echo "Run from anywhere with:"
  echo "  archon-dev"
  echo "  archon-dev logs"
  echo "  archon-dev status"
  echo "  archon-dev stop"
  if [[ ":$PATH:" != *":$LOCAL_BIN_DIR:"* ]]; then
    echo ""
    echo "Add this to your shell profile if archon-dev is not found:"
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  fi
}

print_status_for() {
  local label="$1"
  local output
  if output="$(launchctl print "$GUI_DOMAIN/$label" 2>/dev/null)"; then
    echo "$label: loaded"
    echo "$output" | awk '/pid = / || /state = / { print "  " $0 }'
  else
    echo "$label: not loaded"
  fi
}

status_services() {
  print_status_for "$SERVER_LABEL"
  print_status_for "$WEB_LABEL"
  echo "Logs: $LOG_DIR"
}

tail_logs() {
  mkdir -p "$LOG_DIR"
  touch \
    "$LOG_DIR/server.out.log" \
    "$LOG_DIR/server.err.log" \
    "$LOG_DIR/web.out.log" \
    "$LOG_DIR/web.err.log"
  tail -n 80 -f \
    "$LOG_DIR/server.out.log" \
    "$LOG_DIR/server.err.log" \
    "$LOG_DIR/web.out.log" \
    "$LOG_DIR/web.err.log"
}

usage() {
  cat <<EOF
Usage: bun run dev:daemon -- <command>

Commands:
  start      Install and start the server + Vite launchd services
  stop       Stop both services
  restart    Stop, then start both services
  status     Show launchd status
  logs       Tail server and web logs
  install    Write launchd plists without starting
  link       Install ~/.local/bin/archon-dev launcher
  uninstall  Stop services and remove launchd plists

Default UI: http://localhost:5173
API server: http://localhost:3090 (WEB_UI_DEV=1, no static web bundle)
EOF
}

command="${1:-status}"

case "$command" in
  start)
    start_services
    ;;
  stop)
    stop_services
    ;;
  restart)
    stop_services
    start_services
    ;;
  status)
    status_services
    ;;
  logs)
    tail_logs
    ;;
  install)
    install_plists
    ;;
  link)
    install_launcher
    ;;
  uninstall)
    uninstall_services
    ;;
  help|--help|-h)
    usage
    ;;
  *)
    echo "Unknown command: $command" >&2
    usage >&2
    exit 1
    ;;
esac
