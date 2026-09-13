# Lance 内容工作台 · 本地版

给 Lance 个人使用的内容策划、汇报与拍摄深化系统。新版入口是 `index.html`，旧版完整保留在 `legacy.html`。代码同步到 GitHub 不等于服务上线：AI调用、媒体核验与视频合成仍需启动本机后端。

## 启动

需要 Python 3.10+ 和 FFmpeg（含 ffprobe）。在项目目录运行：

```bash
python3 studio_server.py
```

打开 http://127.0.0.1:8000 。不能用普通静态服务器替代，也不要直接双击 HTML。服务只监听本机。前端依赖包已构建，可直接使用；修改 PPT 依赖后执行 `npm ci && npm run build`。

首次打开“连接设置”，填写账户已开通的文本／看图、图片、视频模型 ID。API Key 可在弹窗临时填写（仅当前页面会话），推荐放在本机 `.env`：

```dotenv
ARK_API_KEY=填写新的方舟密钥
ARK_TEXT_MODEL=支持看图和JSON输出的模型或接入点ID
ARK_IMAGE_MODEL=支持多参考图及2304x1728输出的图片模型ID
ARK_VIDEO_MODEL=支持图生视频及8秒输出的视频模型ID
```

修改 `.env` 后重启服务。新版本采用方舟 Ark 文本、图片与视频接口；旧版即梦 AK/SK 代理仍保留，但新版不会自动使用它。模型权限、区域、参数和费用必须在你的账户实际验证。连接检查只确认本机服务，不代表付费模型可用。不承诺固定五分钟完成视频生成。

## 使用路线

1. 建单条脚本或专场，输入想法。专场整体规划生成六条故事，再分别补齐。
2. 快速汇报：完整创意字段、3–5 张真实参考图、开场／中间／结尾各 8 秒 AI 视频。缺项时允许预览，不允许导出“完整汇报”或确认方向。
3. 下载 PPT：生成真正的 `.pptx`，内嵌图片和视频，文本可编辑。同时保存至“成果与备份”，支持重新下载。
4. 确认方向后“深入优化”：12 类执行方案、25 镜 AI 图与视频、逐图修改和历史切换、锁定、完整成片合成。深化页“下载 PPT”导出执行方案、25 镜图与完整影片。
5. 场景库：按专题上传尺寸图、现场图／视频、现有参考，关联专场。填写已核对尺寸，未知项保留待确认。PDF 可归档，识图需上传清晰截图。
6. 服装库：按分类上传历史视频，提取 12 个均匀采样候选帧，再由看图模型识别、推荐；选中造型供关联项目使用。这不是自动精确分割全片每套衣服。

每个素材可独立重做。重做图像把当前版本作为编辑参考；旧版不覆盖。视频排队任务 ID 会保存，暂停后可继续查询。停止不会取消上游已开始的付费任务。图片请求与 FFmpeg 当前任务仍会完成；后续批量生成停止。

## PPT 和数据在哪里

- PPT：浏览器默认下载目录（通常“下载”），以及同一浏览器的“成果与备份”。文件名来自脚本／专场标题。
- 文字、关联和版本：该浏览器的 localStorage，TMD / My 隔离；共享审美资料单独存储。
- PPT 二进制：该浏览器的 IndexedDB。清除网站数据会移除本机成果索引与 PPT 缓存，请另存下载文件。
- 上传和生成媒体：项目目录 `.lance-data/media/`。不是临时外链，不会因上游签名链接过期而失效。
- ZIP 备份：当前空间 JSON、所引用的媒体及共享审美素材；已导出的 PPT 请另外下载保管。恢复以副本追加，不覆盖原稿。
- 旧版：仍读取旧存储键；新版首次打开会复制可识别的选题文字与专场关联，不删除旧数据。旧外链媒体不会冒充已核验新素材。

必须使用固定浏览器与固定地址（`localhost` 与 `127.0.0.1` 是不同存储空间）。**当前新版没有云同步、跨设备登录或生产部署**。GitHub Pages 只能提供静态页面，不能执行本机生成、核验与视频合成。

## 检查

```bash
npm ci
npm test
```

包括验收规则、PPT 内嵌媒体、文件安全、上传核验、12 帧提取和实际 25 镜合成。`tests/browser.cjs` 可用 Playwright + 本机 Chrome 运行；使用隔离浏览器和人工合成测试素材，不调用付费 AI。`test-output` 样片仅供软件测试，绝非 AI 创意成果。

真实生成尚待验收：一个单条完整案例、一场六条脚本、一条25镜深化片，以及 Lance 实际场地图和历史服装视频。详见 `使用报告与修改意见.md`。

## 安全

此前截图和历史代码出现过密钥。即使是测试账户，也请立即轮换 Ark Key、火山 AK/SK 和 Supabase secret/service-role key；不要等正式上线。新版不把这些密钥写入前端或提交 Git。不要把这个本地服务直接暴露公网。

## 实现依据

- [火山引擎官方视频任务接口](https://github.com/volcengine/volcengine-python-sdk/blob/master/volcenginesdkarkruntime/resources/content_generation/tasks.py)
- [火山引擎官方图片生成示例](https://github.com/volcengine/volcengine-python-sdk/blob/master/volcenginesdkexamples/volcenginesdkarkruntime/image_generations.py)
- [PptxGenJS 原生媒体](https://gitbrent.github.io/PptxGenJS/docs/api-media/)
