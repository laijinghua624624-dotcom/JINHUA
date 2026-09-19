# JINHUA 随身版启用清单

随身版用于 iPhone / iPad 快速记录，完整脚本、PPT、图片与视频生成仍回到 Mac 工作台完成。

## 已实现

- `mobile.html`：文字、语音、图片、视频、文档与链接采集。
- 离线草稿：断网也能先保存，可逐条删除。
- 私人云同步：邮箱登录、RLS 隔离、私有文件桶。
- Mac“随身收件箱”：确认后才进入灵感库或审美参考库。
- 项目概览：Mac 主动发布，手机只读查看。
- 手机端不调用付费 AI。
- 网页分享／书签收藏：接收标题、链接和选中文字，可补一张截图或导出 PDF；Mac 端确认后进入审美库。

## 正式启用（只做一次）

1. 登录正确的 Supabase 项目，先轮换任何曾经展示过的 secret / service_role。
2. 在 SQL Editor 执行 `supabase/mobile_companion.sql`。
3. 在 Authentication 中保留 Email 登录；是否要求邮件确认按你的需要设置。
4. 将项目的 Project URL 与 **publishable key** 填入 `mobile-config.js`。
5. 不要填写 secret key、service_role 或数据库密码。
6. 本机打开 `http://127.0.0.1:8787/mobile.html`，注册／登录并做一条同步测试。
7. 验证 Mac“随身收件箱”能导入后，再同步代码到 GitHub Pages。

## iPhone / iPad

部署后用 Safari 打开 `https://laijinghua624624-dotcom.github.io/JINHUA/mobile.html`，选择“分享 → 添加到主屏幕”。

网页收藏有三种方式：

1. 在随身版选择“链接”，点击“从剪贴板粘贴链接”，补充收藏原因和截图。
2. 电脑进入随身版“我的”，把“收藏到 JINHUA”拖到浏览器书签栏；在 ShotDeck 或其他网页点击该书签。
3. 支持 Web Share Target 的浏览器可直接从系统分享菜单选择 Lance 随身；不支持时仍使用方式 1。

链接不会自动进入正式审美库。回到 Mac 的“随身收件箱”点击“整理进审美库”，确认分类、标签、版权/使用范围和项目文件夹。ShotDeck 等登录素材库不进行自动抓取。

手机端不是“缩水失败版”，而是有意保持轻量：只做采集、查看和同步，不承担生成、PPT 与 25 镜深化。
