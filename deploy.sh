#!/bin/bash
set -euo pipefail

if [ ! -f "index.html" ] || [ ! -d ".git" ]; then
  echo "请在 JINHUA 仓库根目录运行此脚本。"
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "未找到 origin 远程仓库，请先配置 GitHub 远程。"
  exit 1
fi

BRANCH="$(git branch --show-current)"
if [ -z "$BRANCH" ]; then
  echo "当前处于 detached HEAD，请先切换到要部署的分支。"
  exit 1
fi

if [ -n "$(git status --short)" ]; then
  echo "当前还有未提交的更改。请先检查并提交，然后重新运行。"
  exit 1
fi

echo "正在将 $BRANCH 推送到 origin…"
git push -u origin "$BRANCH"

echo "推送完成。如果 GitHub Pages 已配置为从该分支部署，线上页面会在数分钟内更新。"
