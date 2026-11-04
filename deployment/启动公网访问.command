#!/bin/bash
# 一键把本地 Lance（含 /quote/ 报价系统）开到公网（localhost.run 免费隧道）
cd "$(dirname "$0")/.."
LOG="/tmp/lance-public-tunnel.log"
: > "$LOG"
echo "正在启动 Lance 与公网隧道…"
launchctl kickstart "gui/$(id -u)/com.lance.contentstudio" 2>/dev/null || true
sleep 1
( ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:localhost:8787 nokey@localhost.run > "$LOG" 2>&1 ) &
SSH_PID=$!
URL=""
for i in $(seq 1 30); do
  URL=$(grep -o "https://[a-z0-9]*\.lhr\.life" "$LOG" | head -1)
  [ -n "$URL" ] && break
  sleep 1
done
if [ -z "$URL" ]; then
  echo "隧道启动失败，日志：$LOG"; kill $SSH_PID 2>/dev/null; exit 1
fi
echo "=============================================="
echo "  公网地址：$URL"
echo "  报价系统：$URL/quote/"
echo "  更多 → 拍摄器材报价"
echo "  关闭本窗口即停止公网访问（本机 Lance 不受影响）"
echo "=============================================="
( sleep 1; open "$URL" ) >/dev/null 2>&1 &
wait $SSH_PID
