#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
output=${1:?Usage: scripts/package.sh /absolute/path/chronix.tar.gz}
[[ "$output" = /* ]] || { echo 'Use an absolute output path.' >&2; exit 1; }
npm test
# Explicit allowlist: no .env, database, Git metadata or downloaded credentials.
tar -czf "$output" package.json public server scripts deploy test README.md docs/self-hosting.md .env.example
sha256sum "$output"
