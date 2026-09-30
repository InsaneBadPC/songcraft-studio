#!/usr/bin/env bash
set -euo pipefail
KEY="/storage/emulated/0/InsaneCode/Secret/ssh-vm/youtube-vm"
HOST="ubuntu@138.2.190.31"
remote='set -euo pipefail
for unit in video-agent-dashboard.service songcraft-video-renderer.service; do
  test "$(systemctl is-active "$unit")" = active
  test "$(systemctl is-enabled "$unit")" = enabled
  test "$(systemctl show "$unit" -p NRestarts --value)" = 0
  echo "$unit=healthy"
done
listeners=$(ss -ltn 2>/dev/null | awk "NR > 1 && /:8080[[:space:]]/ {print}")
test -n "$listeners"
! printf "%s\n" "$listeners" | grep -Eq "(^|[[:space:]])(0\\.0\\.0\\.0|\\[::\\]|\\*):8080"
printf "%s\n" "$listeners" | grep -Eq "127\\.0\\.0\\.1:8080"
echo "dashboard_listener=loopback-only"
worker=$(find /opt -maxdepth 4 -type f -name worker.mjs 2>/dev/null | head -1)
dashboard=$(find /opt -maxdepth 5 -type f -name server.py 2>/dev/null | grep -Ei "video|dashboard|agent" | head -1)
test -n "$worker" && grep -q image_animation "$worker"
test -n "$dashboard" && grep -q "max_part_size=50" "$dashboard"
echo "deployed_sources=render-capable"
set -a
. /opt/video-agent/.env
set +a
test "$(curl -sS -u "$DASHBOARD_USER:$DASHBOARD_PASSWORD" -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/api/health)" = 200
echo "dashboard_health=200"'
result=$(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=20 "$HOST" "bash -s" <<< "$remote")
printf '%s\n' "$result"
grep -q "dashboard_health=200" <<< "$result"
echo "VM runtime verification passed"
