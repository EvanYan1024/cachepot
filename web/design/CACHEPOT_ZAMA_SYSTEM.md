# CachePot × Zama Soft Utility System

这套系统基于 2026-08-14 实际检查的 Zama App 界面重新提取。它复用 Zama 的产品语法，但保留 CachePot 自己的奖池概念、图标与内容。

## 核心判断

当前 Zama App 的识别度来自以下组合，而不只是黄黑配色：

1. **Floating shell**：顶部菜单四周留白，以大圆角和柔和阴影悬浮在工作区上；导航不再占用产品内容的横向空间。
2. **Soft utility surfaces**：卡片使用 18–28px 圆角、浅色表面渐变、内高光和向下的柔影。
3. **One task per page**：操作页采用居中窄列，大金额输入是视觉中心，不使用宽屏仪表盘堆叠。
4. **Ink actions, yellow signals**：黑色立体按钮完成金融动作；黄色只表示选中、隐私和 Token 身份。
5. **Image-led onboarding**：Dashboard 使用不透明、已密封的产品视觉解释抽象的隐私能力。

CachePot 的独有主题是“密封容器与可验证的外部状态”：界面展示奖池规模与协议进度，但容器内的个人余额、赔率和赢家始终被遮蔽。价值的存在由封口光线和星号暗示，而不是展示内容物。

## 视觉令牌

### 颜色

| Token | Value | 用途 |
| --- | --- | --- |
| `--background` | `#EEEEEF` | 冷灰应用背景 |
| `--card` | `#FBFBFA` | 卡片和输入表面 |
| `--foreground` | `#252523` | 主文字 |
| `--muted-foreground` | `#747471` | 说明文字 |
| `--border` | `#D2D2D1` | 低对比边界 |
| `--primary` | `#FFD91A` | 导航选中、Token、隐私信号 |
| `--action` | `#242422` | 主操作按钮 |

深色主题使用 `#151514` 背景与 `#232321` 卡片；黄色保持不变，主操作反转为浅色。

### 字体

- 产品界面统一使用 `Archivo Variable`，不再在首页使用衬线字体。
- Display：58/59、500；H1：42/44、600；H2：30/34、600。
- 正文：16/26；辅助文字：14/21；Caption：12/16。
- 等宽字体只用于地址、密文 handle 和需要严格列对齐的链上数值。
- 大标题 tracking 为 `-0.035em` 到 `-0.055em`。

### 形状与层级

- 顶部导航：16px 圆角。
- 主卡片：24–28px 圆角。
- 内部输入：16px 圆角。
- 标签与 Token：8–12px 圆角；状态可使用 pill。
- 卡片用内高光、双层柔影和轻微同色渐变建立深度。
- 边界仅作为表面边缘，不再承担全部信息分区。

### 控件尺寸

- 默认按钮：40px。
- 主按钮：48px。
- 紧凑按钮：36px。
- 金额输入：96px；数字 40–48px。
- 资产行：72–92px。

## 应用骨架

### Desktop

```text
┌─────────────────────────────────────────────────────────────┐
│ CachePot   Home   Save   Draw   How it works   ◐  Connect  │
└─────────────────────────────────────────────────────────────┘

           centered landing statement / page heading

┌─────────────────────────────────────────────────────────────┐
│               product visual or primary task                │
└─────────────────────────────────────────────────────────────┘
```

- 顶部菜单最大宽度 1240px，距离视口边缘 12–16px，并随页面滚动保持可用。
- 主内容最大宽度 1240px；交易任务本身继续使用 768–896px 窄列。
- 钱包和网络状态位于菜单右侧；营销导航与产品导航共用同一层。
- 首页是完整 Landing Page，进入 Save / Draw / Portfolio 后才切换到单任务产品页面。

### Mobile

- 顶部为菜单按钮、CachePot 标识和主题切换。
- 菜单展开为页面内浮层，包含导航和钱包操作。
- 不使用固定底部导航，避免与交易按钮竞争。
- 内容保持单列，左右 gutter 为 16px。

## 组件语法

### Primary action

- 黑色低对比纵向渐变。
- 白色文字，12–24px 柔影，顶部有 1px 内高光。
- hover 上移 1px并轻微增亮；disabled 保留结构但降低透明度。

### Active navigation

- 淡黄色表面、黄色边缘和短距离柔光。
- 不使用整块实心黄色背景。

### Transaction panel

固定顺序：

1. 页面标题与一句解释。
2. 私密余额摘要。
3. Deposit / Withdraw segmented control。
4. 96px 大金额输入。
5. 可用余额。
6. 唯一主操作。
7. 交易过程与辅助操作。

### Privacy state

- 未授权数值显示 `••••••`。
- 使用 Fingerprint / Lock 图标与明确文字。
- 解密权限和 ciphertext handle 放入渐进式详情。
- 黄色标记隐私能力，不用大面积斜线纹理。

### Asset lists

- 资产身份放在首列，使用黄色圆角 Token 图标。
- 桌面保持列对齐；移动端折叠为信息组。
- 行操作使用白色悬浮按钮或黑色主按钮。
- 表头保持低对比，不使用重色块。

## 页面映射

### Landing / Home

- 首屏使用“Save privately. Win quietly.”的居中价值主张和双 CTA。
- CachePot 专属的不透明密封陶瓷罐承担产品解释，仅通过封口黄光和星号暗示价值，并叠加真实 Live prize。
- 首屏后依次呈现协议证据、四步工作原理、实时 Vault、隐私边界和最终 CTA。
- Landing 负责建立信任与解释价值；账户连接和交易操作留给产品页。

### Save

- Vault 列表保持资产比较能力，但整个表作为一张柔光大卡片。
- Vault detail 使用居中 768px 单任务工作区。
- Faucet 与授权是次级卡片，不和存款主操作竞争。

### Draw

- 轮次阶段使用浅黄色当前态。
- Prize reserve 与 Current action 位于 896px 工作区。
- Sponsor 与 FHE/HCU 详情默认折叠。

### Portfolio

- 未连接时使用单张 onboarding 卡。
- 已连接时奖品余额、Vault 仓位和本地解密状态使用同一表面体系。
- Claim 是黑色主操作，解密权限使用黄色信号。

## 品牌资产

`/public/brand/cachepot-concealed-vault.png` 是本项目生成的原创横向品牌资产：不透明的象牙白陶瓷 cachepot 完全隐藏内容，仅从微开的盖缝透出黄色光线，并以单一几何星号表达“已密封的价值”。背景与应用的暖纸灰保持一致，不包含 Zama Logo 或其他第三方品牌资产。

## 动效

- 页面进入：opacity + 14px translateY，650ms。
- 控件反馈：不超过 200ms。
- 只动画 transform 与 opacity；进度条除外。
- 遵守 `prefers-reduced-motion`。
