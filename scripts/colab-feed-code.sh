#!/bin/bash
# Posle auth kod do FIFO zjavajiciho uctu. cat FIFO bezi od zacatku, takze
# to funguje kdykoliv po vygenerovani URL.
set -uo pipefail
ACC="$1"; CODE="$2"
F="/var/lib/songcraft-renderer/colab-code-$ACC"
T="/var/lib/songcraft-renderer/colab/$ACC/.config/colab-cli/token.json"
rm -f "$F"; mkfifo "$F"; chown songcraft-renderer:songcraft-renderer "$F"
L="/var/lib/songcraft-renderer/colab-login-$ACC.log"
su -s /bin/bash songcraft-renderer -c "HOME=/var/lib/songcraft-renderer/colab/$ACC PATH=/opt/video-agent/.venv/bin:/usr/bin:/bin nohup setsid sh -c \"cat $F | colab new --gpu T4 > $L 2>&1\" >/dev/null 2>&1 &"
for i in $(seq 1 30); do sleep 2; grep -q "authorization code" "$L" 2>/dev/null && break; done
printf "%s\n" "$CODE" | timeout 120 tee "$F" >/dev/null 2>&1
for i in $(seq 1 40); do
  sleep 4
  [ -f "$T" ] && { echo "$ACC: prihlasen"; exit 0; }
  if grep -qiE "InvalidGrant|error" "$L" 2>/dev/null; then
    echo "$ACC: selhalo -"; grep -iE "InvalidGrant|invalid_grant|Error" "$L" | tail -2; exit 1
  fi
done
echo "$ACC: timeout pri tokenu"; exit 1
