#!/usr/bin/env bash
# Run on the server: sudo bash deploy/install.sh /absolute/path/to/source
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run this installer with sudo.' >&2; exit 1; }
source_dir=$(realpath "${1:-$(dirname "$0")/..}")
node_bin=$(command -v node)
[[ "$node_bin" =~ ^/(usr|opt)/[a-zA-Z0-9/._-]+$ ]] || {
  echo 'Install Node 24+ under /usr or /opt so the isolated service can execute it.' >&2; exit 1;
}
"$node_bin" -e 'if (+process.versions.node.split(".")[0] < 24) process.exit(1)'
for command in curl systemctl install runuser; do command -v "$command" >/dev/null; done
config=/etc/chronix/chronix.env
[[ -f "$config" ]] || { echo "Create $config using scripts/configure-google.mjs first." >&2; exit 1; }
chmod 0600 "$config"
chown root:root "$config"
"$node_bin" --env-file="$config" "$source_dir/scripts/check-config.mjs" --deployment
# Never execute the environment file as shell code.
port=$("$node_bin" --env-file="$config" -e 'process.stdout.write(process.env.PORT || "3000")')
version=$("$node_bin" -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1])).version' "$source_dir/package.json")
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$port" =~ ^[0-9]+$ ]] || exit 1
if ! id chronix >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /var/lib/chronix --shell /usr/sbin/nologin chronix
fi
install -d -m 0755 /opt/chronix/releases
install -d -o chronix -g chronix -m 0700 /var/lib/chronix /var/backups/chronix
release=$(mktemp -d "/opt/chronix/releases/$version-$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")
cp -R "$source_dir/public" "$source_dir/server" "$source_dir/scripts" "$source_dir/test" "$source_dir/package.json" "$release/"
chown -R root:root "$release"
chmod -R u=rwX,go=rX "$release"
# Tests run as the unprivileged service account before switching the live version.
(cd "$release" && runuser -u chronix -- "$node_bin" --test --test-isolation=none)
if [[ -f /var/lib/chronix/chronix.sqlite ]]; then
  runuser -u chronix -- env DB_PATH=/var/lib/chronix/chronix.sqlite "$node_bin" "$release/scripts/backup.mjs" /var/backups/chronix
fi
# Preserve the encryption key separately from the application's writable backup area.
install -d -m 0700 /var/backups/chronix-config
install -m 0600 "$config" "/var/backups/chronix-config/chronix-$(date -u +%Y%m%dT%H%M%SZ).env"
previous=$(readlink -f /opt/chronix/current || true)
old_units=$(mktemp -d /tmp/chronix-units.XXXXXXXX)
was_active=false
was_enabled=false
systemctl is-active --quiet chronix && was_active=true
systemctl is-enabled --quiet chronix 2>/dev/null && was_enabled=true
for unit in chronix.service chronix-backup.service chronix-backup.timer; do
  if [[ -f "/etc/systemd/system/$unit" ]]; then cp "/etc/systemd/system/$unit" "$old_units/$unit"; fi
done
rollback() {
  echo 'Deployment failed; restoring the previous service and release.' >&2
  systemctl stop chronix || true
  if [[ -n "$previous" && -d "$previous" ]]; then
    ln -sfn "$previous" /opt/chronix/current.rollback
    mv -Tf /opt/chronix/current.rollback /opt/chronix/current
  else
    rm -f /opt/chronix/current
  fi
  if [[ "$was_enabled" == false ]]; then systemctl disable chronix >/dev/null 2>&1 || true; fi
  for unit in chronix.service chronix-backup.service chronix-backup.timer; do
    if [[ -f "$old_units/$unit" ]]; then cp "$old_units/$unit" "/etc/systemd/system/$unit";
    else rm -f "/etc/systemd/system/$unit"; fi
  done
  systemctl daemon-reload
  if [[ "$was_active" == true ]]; then systemctl start chronix || true; fi
}
trap rollback ERR
for unit in chronix.service chronix-backup.service; do
  sed "s|@NODE@|$node_bin|g" "$source_dir/deploy/$unit" > "/etc/systemd/system/$unit"
done
install -m 0644 "$source_dir/deploy/chronix-backup.timer" /etc/systemd/system/chronix-backup.timer
ln -sfn "$release" /opt/chronix/current.next
mv -Tf /opt/chronix/current.next /opt/chronix/current
systemctl daemon-reload
systemctl enable chronix
systemctl restart chronix
healthy=false
for attempt in {1..20}; do
  if curl --fail --silent "http://127.0.0.1:$port/healthz" | "$node_bin" --input-type=module -e '
    let body=""; for await (const part of process.stdin) body+=part;
    const health=JSON.parse(body); if (health.status!=="ok" || !health.syncEnabled || health.version!==process.argv[1]) process.exit(1);
  ' "$version"; then healthy=true; break; fi
  sleep 1
done
[[ "$healthy" == true ]]
systemctl enable --now chronix-backup.timer
systemctl start chronix-backup.service
trap - ERR
rm -rf -- "$old_units"
echo "Chronix $version installed. Next verify HTTPS with Tailscale Serve and sign in with Google."
