#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
target=${1:?Usage: scripts/deploy.sh user@server}
[[ "$target" =~ ^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$ ]] || { echo 'Invalid SSH target.' >&2; exit 1; }
ssh_options=(-F /dev/null -o BatchMode=yes -o ConnectTimeout=15)
if [[ -n "${CHRONIX_SSH_KEY:-}" ]]; then ssh_options+=(-i "$CHRONIX_SSH_KEY"); fi
archive=$(mktemp /tmp/chronix-release.XXXXXX.tar.gz)
trap 'rm -f "$archive"' EXIT
bash scripts/package.sh "$archive"
# Authenticate and check sudo before copying any source.
ssh "${ssh_options[@]}" "$target" 'sudo -n true'
staging=$(ssh "${ssh_options[@]}" "$target" 'mktemp -d /tmp/chronix-deploy.XXXXXXXX')
[[ "$staging" =~ ^/tmp/chronix-deploy\.[a-zA-Z0-9]+$ ]] || exit 1
ssh "${ssh_options[@]}" "$target" "tar -xzf - -C '$staging'" < "$archive"
ssh "${ssh_options[@]}" "$target" "sudo -n bash '$staging/deploy/install.sh' '$staging'"
# Keep the staging source if installation fails, for inspection.
ssh "${ssh_options[@]}" "$target" "rm -rf -- '$staging'"
