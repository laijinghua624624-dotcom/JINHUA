#!/bin/bash
# Lance智能裤 一键部署脚本
# 使用方法：
# 1. 先在 GitHub 上创建一个空仓库（不要勾选 README）
# 2. 把下面的 GITHUB_USERNAME 和 REPO_NAME 改成你的
# 3. 运行：bash deploy.sh

GITHUB_USERNAME="你的GitHub用户名"
REPO_NAME="lance-smart-pants"

echo "========================================"
echo "  Lance智能裤 部署脚本"
echo "========================================"
echo ""

# 检查是否在正确的目录
if [ ! -f "index.html" ]; then
    echo "❌ 错误：请在 xuan-ti-ku 目录下运行此脚本"
    exit 1
fi

echo "✅ 找到 index.html"
echo ""

# 检查git仓库
if [ ! -d ".git" ]; then
    echo "初始化 git 仓库..."
    git init
    git add .
    git commit -m "Lance智能裤 v1.0"
fi

echo ""
echo "📝 请确认以下信息："
echo "   GitHub 用户名: $GITHUB_USERNAME"
echo "   仓库名: $REPO_NAME"
echo ""
echo "如果不正确，请编辑此脚本修改后再运行。"
echo ""
read -p "确认部署？(y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消部署"
    exit 0
fi

echo ""
echo "🚀 开始部署..."
echo ""

# 添加远程仓库
git remote remove origin 2>/dev/null
git remote add origin "https://github.com/$GITHUB_USERNAME/$REPO_NAME.git"

# 推送代码
echo "推送代码到 GitHub..."
git branch -M main
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 代码推送成功！"
    echo ""
    echo "📋 接下来请手动开启 GitHub Pages："
    echo ""
    echo "1. 打开：https://github.com/$GITHUB_USERNAME/$REPO_NAME/settings/pages"
    echo "2. Source 选择 'Deploy from a branch'"
    echo "3. Branch 选择 'main'，文件夹选择 '/ (root)'"
    echo "4. 点击 Save"
    echo "5. 等待 1-2 分钟，页面会显示你的访问地址"
    echo ""
    echo "🌐 访问地址将是：https://$GITHUB_USERNAME.github.io/$REPO_NAME/"
    echo ""
    echo "🎉 部署完成！"
else
    echo ""
    echo "❌ 推送失败，请检查："
    echo "   1. GitHub 用户名和仓库名是否正确"
    echo "   2. 仓库是否已创建（不要勾选 README）"
    echo "   3. 是否有 GitHub 访问权限"
    echo ""
    echo "创建仓库：https://github.com/new"
fi
