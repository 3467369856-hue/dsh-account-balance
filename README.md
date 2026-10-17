# dsh-account-balance

DeepSeek Harness（DSH）的客户端插件：把 Codex 的账号入口与三栏布局搬进 DSH。

- 点击头像即可看到**充值余额 + 赠金余额**（读宿主账号服务的真实快照，不是占位数据）
- 三栏布局：最左常驻图标栏 / 项目栏 / 内容区，顶部与项目栏同色 L 形，项目栏左侧两角 12px 圆角
- 左侧上下文导航条：悬停鱼眼刻度、点击跳转、按住拖动、当前阅读位置标记
- 聊天区上下两端渐隐，会话列表底部渐隐
- 余额不足提醒条：与输入框同宽，可「隐藏」并持久化

## 安装

```bash
# 方式一：装 tarball
npm install -g dsh-account-balance-0.1.0.tgz

# 方式二：放进 DSH profile 的 node_modules，并在 dsh.profile.bundles 里登记包名
```

### 从源码构建

仓库不提交构建产物，装包前先生成：

```bash
npm pack                 # 产出 dsh-account-balance-0.1.0.tgz
```

### 在 DSH 里启用

插件通过 `package.json` 的 `dsh.client` 声明自己（`platform: web`），由 DSH 的模块加载器在启动时装载。两种启用方式：

1. **profile 安装**：包放进 DSH profile 的 `node_modules`，并在该 profile 的 `dsh.profile.bundles` 里登记包名，然后重启 DSH。
2. **开发目录**：把仓库目录 junction 到 profile 的 `node_modules\dsh-account-balance`，客户端 HMR 会直接加载改动，无需重启。

### 版本兼容

- 面向 DSH `0.2.0-rc` 系列客户端的 slot / store 约定编写，未在其他版本上验证
- 依赖的私有选择器（见「已知问题」）随上游 DOM 变化可能失效，升级 DSH 后建议对照检查

## 功能说明

### 账号余额
头像菜单里分别列出充值余额与赠金余额，按币种格式化。数据来自宿主账号服务快照，插件只做展示，不额外发起网络请求。

### 三栏布局
- 图标栏由插件的 overlay 面板绘制，宽 48px，按钮 `pointer-events:auto`，不遮挡宿主原有的侧栏折叠按钮
- 位移用 `margin-left` 而非 `padding-left`：绝对定位的列宽拖拽手柄以 padding box 为参照，用 padding 会让手柄与分割线错位
- 项目栏与内容区之间是 1px `#E5E5E5` 分隔线，深色模式走 token

### 上下文导航条
宿主自带每轮刻度与预览气泡，插件只做重挂载与重绘：左移到分隔线内侧 16px、刻度原点改到左侧、按距指针距离做鱼眼缩放，并补上拖动滚动。

### 已知问题
- 聊天区背景色为 `#F5F5F5`，与项目栏白色不一致。在 `[data-slot="main"]` 及其子树加白底（含 `!important`）均无效，说明绘制方在外层容器
- 余额提醒条的「隐藏」按钮点击效果未实测确认（`localStorage` 持久化逻辑已写，按账号隔离）
- 若干选择器依赖上游内部类名（`[class*="_mark"]`、`[class*="_fade"]`、`nav[aria-label="轮次导航"]`），上游改 CSS Module 命名或无障碍标签后相关视觉可能失效，无降级逻辑

## 技术实现
- cordis 客户端插件，`dsh.client.platform = "web"`，工厂式 CJS bundle
- 只用平台 seed：`react`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/cordis`、`dsh-client-store`、`dsh-client-ui-slots`、`dsh-client-ui-dockkit`
- 样式优先 `light-dark()` 与宿主 token，唯一覆盖的 token 是框架底色
- 不改宿主任何文件

## License

MIT