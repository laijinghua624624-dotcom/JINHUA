# 把 Lance（含报价系统）迁到香港 VPS

目标：一台香港服务器，`https://lance.你的域名.com/` 打开 Lance，`/quote/` 打开拍摄器材报价；不依赖 Render，不依赖本机。

## 一、买服务器 + 域名（约 ¥24–40/月 + 域名 ¥60/年）

1. 阿里云/腾讯云轻量 → 地域**中国香港** → 2核2G、50GB、Ubuntu 22.04；
2. 买一个 `.com` 域名，DNS 加 A 记录：`lance` → 服务器 IP（香港免备案）；
3. 记下：服务器 IP、root 密码（或 SSH key）。

## 二、服务器装 Docker

```bash
ssh root@服务器IP
apt update && apt install -y docker.io docker-compose-plugin
systemctl enable --now docker
```

## 三、上传仓库

```bash
apt install -y git
git clone -b feature/equipment-quote https://github.com/laijinghua624624-dotcom/JINHUA.git /opt/jinhua
cd /opt/jinhua
git checkout feature/equipment-quote
```

> 正式用建议先把分支合并到 main，再用 main 部署。

## 四、配置密钥

把本机 Lance 的 `.env` 复制到服务器 `/opt/jinhua/deployment/vps/.env`：

```bash
scp .env root@服务器IP:/opt/jinhua/deployment/vps/.env
```

再补上 `DOMAIN=lance.你的域名.com`（见 `.env.example`）。

## 五、启动

```bash
cd /opt/jinhua/deployment/vps
docker compose up -d --build
```

首次构建会装 Python 依赖和 Caddy，约 5–10 分钟。

## 六、验证

- `https://lance.你的域名.com/` → Lance；
- `https://lance.你的域名.com/quote/` → 拍摄器材报价系统；
- 数据（媒体、上传）在 Docker volume `lance_data`（对应容器 `/data`）。

## 七、日常

```bash
cd /opt/jinhua/deployment/vps
docker compose logs -f lance    # 看日志
docker compose pull && docker compose up -d --build   # 更新
```

备份 volume：`docker run --rm -v vps_lance_data:/data -v $(pwd):/backup alpine tar czf /backup/lance-data.tgz /data`

## 八、注意

- 报价系统的手机打卡/报销上传（Node 8137）还没并进 Lance；如需外网手机上传，后面再作为独立服务加 Caddy 路由；
- Render 上的旧实例可以继续保留做备份，确认新站稳定后再停；
- `.env` 含模型密钥，权限设 600，不要提交 Git。

## 当前线上状态（2026-11-05）

- 域名：`lance.lance624.com`（腾讯云 DNSPod，A 记录 → 119.28.20.166）
- Lance：https://lance.lance624.com/
- 报价系统：https://lance.lance624.com/quote/
- HTTPS：Let's Encrypt，Caddy 自动续期
- 防火墙：已放行 80/443
- 服务器进程：Docker Compose（lance + caddy），开机自启

免费测试域名可用 `119.28.20.166.sslip.io`；IP 直连需域名证书匹配，请始终用域名访问。
