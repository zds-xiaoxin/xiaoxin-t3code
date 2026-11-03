# Xiaoxin T3 Code C37 · Mac Apple Silicon 测试版

[English](RELEASE.en.md) · 2026-11-03 · 社区预发布 · macOS arm64

<!-- community-showcase -->

[完整功能图集 / Full feature gallery](https://github.com/zds-xiaoxin/xiaoxin-t3code#feature-showcase)

![工作台功能布局示意 / Workbench feature-layout concept](https://raw.githubusercontent.com/zds-xiaoxin/xiaoxin-t3code/main/assets/community/showcase/01-workbench-overview.png)

_合成内容的功能布局示意；其他图片的来源和平台标注见完整图集。 / Synthetic layout concept; see the gallery for image provenance and platform labels._

<!-- /community-showcase -->

## 新功能

在「设置 → 外观 → 界面 → 界面风格」选择「当前风格」或「macOS 风格」。切换立即生效，重新打开后保留；配色、字体、字号和侧栏偏好独立保留。旧设置默认使用当前风格。

继承 C36 的 0.1.7 nightly 内核、紧凑中文界面、上下文与缓存明细、任务响应与 SQLite 写线程等改动。C37 是社区构建编号，内嵌官方版本为 `0.1.7-nightly.20261103.4119`，不是新的上游稳定版。

## 下载与安装

- 下载本页 `Xiaoxin-T3-Code-C37-macOS-arm64.zip`，并按 `SHA256SUMS.txt` 核对。解压得到 `T3 Code (Alpha).app`。
- 仅提供 Apple Silicon（M 系列）Mac；应用声明最低 macOS 13.0，实际本机验证不代表已覆盖所有 macOS 版本。没有本轮 Intel Mac / Windows 发行包。
- 新用户将应用移入「应用程序」，使用自己的模型 CLI、账号或供应商配置。包内没有维护者的聊天、账号、密钥、项目、私有设置或临时权限助手。
- 升级用户先结束任务、完整退出 T3，再备份 `~/.t3` 和 `~/Library/Application Support/t3code-v2`；保留旧 App，随后替换。冷备时保持 App 关闭，只运行一个实例。
- 这一内核使用 schema 78。**旧 App 不能直接读取升级后的数据；不能用旧库覆盖新聊天。** 回退需要兼容版本及对应的升级前完整备份。
- 发布包使用 ad-hoc 签名，未经过 Apple 公证。若 macOS 阻止打开，按系统「隐私与安全性」的提示处理；不需要为安装关闭系统安全保护或授予完全磁盘访问。
- **本测试包采用手动更新。** 后续从本仓库下载，不接入上游 nightly 自动更新源。发布副本仅调整了更新源文件并重新签名，应用 ASAR 与已验证的 C37 完全一致。

## 验证范围与已知限制

- 相关合同/设置持久化 59 项测试、受影响测试 88 项、36 包类型检查以及格式、lint、knip、React 编译检查通过；测试集合有重叠，数量不相加。桌面构建 7/7 通过。
- 隔离客户端验证了两个风格的双向切换、各自重开保留、深浅色材质和切回当前风格后的样式清除；已安装 Mac 的中文、历史聊天/项目、已有模型账号状态及配置回读通过。物理 Fn 切换和微信输入法候选、文字输入由使用者本人实测通过。
- Renderer 65 个样本的 CPU 中位值 4.9%、P95 7.1%，低于预设 5% / 10% 数值阈值；但全局输入探针记录了 3 个来源未明的活动观察点，**严格空闲窗口有效性仍未确认**。这不是完整性能、节省率或长期稳定性结论。
- 没有为本次验收发送真实或付费模型请求；不代表所有供应商、网络、长期会话和远程连接场景均已验证。可选 T3 Connect 未重新登录测试；本地 ad-hoc 包不具备官方发行的完整签名/通行密钥声明。
- ZIP、签名、文件完整性与隔离启动记录见随发行附带的 `BUILD-PROVENANCE.json`；它只包含公开构建与验证摘要。

当前正式推荐版 C31 继续保留为旧数据版本入口。C37 为朋友试用的 Mac 预发布；下载本页对应资产，不用 `Latest` 代替本页。
