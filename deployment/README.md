# 部署交接

当前状态：本机可运行；公网部署尚未完成。需要有权使用的服务器、可解析域名和模型配置。GitHub Pages 不是 API 服务器；没有把其他团队项目的服务器视为已授权部署目标。

## 推荐结构

同一个 HTTPS 地址提供页面、API 和媒体；后端容器不映射宿主机端口。为减少单人使用的登录摩擦，Render 版本不再使用浏览器弹窗密码。模型密钥仍只保存在服务端环境变量，付费生成接口默认按来源限制为每小时 60 次。公网网址不要主动分享；长期多人使用时应恢复身份验证。

这是单人测试部署方案，不是多租户平台。文字、关联、PPT 索引仍在浏览器；上传／生成媒体位于服务器持久卷。换网址前先在旧网址导出每个空间的 ZIP，PPT 另存，再在新网址导入。上线不会自动迁移本机资料，也不会跨设备同步。

## Render 一键部署（建议）

仓库根目录的 `render.yaml` 、`Dockerfile.render` 以及 `deployment/Caddyfile.render` 已组成单服务部署：Render 终止 HTTPS，容器内 Caddy 转发给 Python 工作台。默认使用新加坡区免费实例，无需银行卡，适合先跑通公网文字与模型调用。免费实例会休眠，容器文件系统也不是持久存储；上传和生成的媒体可能在重启或重新部署后丢失，25镜合成不作为稳定交付能力。需要长期保存时，再升级到至少 `1c-2g` 并挂载 `/data` 持久盘。

1. 用 GitHub 登录 Render，打开 `https://render.com/deploy?repo=https://github.com/laijinghua624624-dotcom/JINHUA`。
2. 确认免费计算规格。免费实例不提供持久盘，请只用副本测试真实素材；重要文件及时下载。
3. 在创建页填写所有标记为 `sync: false` 的秘密环境变量。不要将密钥粘贴到 GitHub、聊天或前端。
4. 创建成功后，Render 会提供 `https://lance-content-studio-....onrender.com`。根地址是完整工作台；`/mobile.html` 是轻量随身版。GitHub Pages 只作为静态展示。

Render 会在运行时自动提供 `RENDER_EXTERNAL_URL` 和 `PORT`；启动脚本会把公网 URL 作为同源安全边界，内部 Python 端口仍为 8000，不直接暴露。

## 上线前必填

1. 专用或经授权的 Linux 主机，Docker Engine 与 Compose；足够视频生成及合成用的 CPU、内存和磁盘。先确认 80/443 未被现有服务占用；如已占用，由服务器管理员整合已有代理，不能停止其他服务。
2. 将自有域名解析至该主机并允许 80/443。不得公开容器的 8000 端口。
3. 从 `.env.example` 创建私密 `.env`，填写新 Ark 密钥、文本／看图、图片、视频模型 ID；确认账户实际开通了所需能力。不要在聊天、源码或截图中发送密钥。
4. 从 `deploy.env.example` 创建私密 `deploy.env`，填写 `LANCE_DOMAIN` 和密码的 bcrypt 哈希；密码建议至少 20 位随机字符。用下方交互命令生成，避免明文密码进入命令历史。哈希在 env 文件中用单引号包围以保留 `$`。

```bash
docker run --rm -it caddy:2.11-alpine caddy hash-password
chmod 600 .env deploy.env
docker compose --env-file deploy.env config --quiet
docker compose --env-file deploy.env up -d --build
```

访问 `https://你的域名/`，浏览器会要求用户名和密码。生成服务地址留空，模型密钥只由服务器 `.env` 提供。这里不从 GitHub Pages 跨域调用：跨域认证会增加兼容性问题。原 GitHub Pages 仍可作为静态展示。

## 发布验收（不能用构建成功替代）

- 根地址打开完整工作台，`/mobile.html` 打开轻量随身版；iPad 不应被自动跳到轻量版。
- 健康检查返回 200、FFmpeg 可用、模型配置齐全；响应和日志不能出现密钥。
- 公网来源连续超过每小时限制后，新付费生成请求返回 429；视频状态查询和已有成果读取不受影响。
- 跨站请求应被拒绝，`.env`、Python 源码和私密目录不能读取。
- 真实图片／视频／文档上传、8 秒视频核验、12 帧提取、25 镜合成、PPT 内嵌与下载。
- 完成一条真实的文本生成、3–5 张图、三段各 8 秒视频；记录费用、耗时和失败原因。只有此项通过才能说 AI 流程跑通。
- 重启容器后媒体仍能读取；浏览器刷新后项目仍在。核对旧网址迁移后的备份和素材数量。

本次仅验证 Python 监听保护、配置格式及本机行为；Docker 守护进程未运行，未完成容器构建、TLS、登录代理或真实模型验收。

## 保留与回退

先记录已运行的源码版本及镜像，再部署新版本；保留 `studio_data`、`caddy_data`、`caddy_config`。停止服务使用 `docker compose --env-file deploy.env down`，不要加 `-v`，后者会删除媒体卷和证书。恢复旧源码并重新构建不会自动恢复已修改的用户数据；定期单独备份持久卷和浏览器导出文件。

## 当前 Mac 本机服务

本机服务通过 `python3 -u studio_server.py` 运行，默认仅监听 `127.0.0.1:8787`。`8000` 留给另一个本地项目，`8765` 留给旧版即梦代理。Render 容器仍显式使用内部 `8000`，由 Caddy 反向代理，与 Mac 本机端口不冲突。尝试安装登录启动项后进程未提供可访问端口，因此已卸载此次启动项，保留普通运行方式，不宣称自启动成功。

修改模型配置后停止当前服务再重新启动。电脑休眠／关机期间不可访问；程序退出后需要重新启动。服务器日志不应包含请求正文、API密钥或个人资料。

实现依据：[Caddy 反向代理](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)。
