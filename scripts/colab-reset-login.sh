#!/bin/bash
# Zrusi stare(colace) prihlasovaci procesy a spusti nove, s cat FIFO od zacatku.
set -uo pipefail
for pid in $(pgrep -f "colab new --gpu T4"); do kill -9 "$pid" 2>/dev/null; done
for pid in $(pgrep -x cat); do
  if tr "\0" "\n" < /proc/$pid/cmdline 2>/dev/null | grep -q "colab-code-acc"; then kill -9 "$pid" 2>/dev/null; fi
done
sleep 1
echo "old processes: $(pgrep -c -f "colab new --gpu T4" 2>/dev/null || echo 0)"
for n in "$@"; do
  ACC="acc$n"
  H="/var/lib/songcraft-renderer/colab/$ACC"
  F="/var/lib/songcraft-renderer/colab-code-$ACC"
  L="/var/lib/songcraft-renderer/colab-login-$ACC.log"
  rm -f "$F" "$L"; mkfifo "$F"; chown songcraft-renderer:songcraft-renderer "$F"
  su -s /bin/bash songcraft-renderer -c "HOME=$H PATH=/opt/video-agent/.venv/bin:/usr/bin:/bin nohup setsid sh -c \"cat $F | colab new --gpu T4 > $L 2>&1\" >/dev/null 2>&1 &"
done
for n in "$@"; do
  ACC="acc$n"; L="/var/lib/songcraft-renderer/colab-login-$ACC.log"
  for i in $(seq 1 30); do sleep 2; grep -q "authorization code" "$L" 2>/dev/null && break; done
  echo "--- $ACC ---"
  grep -oE "https://accounts\.google\.com[^ ]+" "$L" | head -1
  echo
done
