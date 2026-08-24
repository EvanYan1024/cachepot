# PoolTogether V5 奖励架构核对与 CachePot 适配提示

核对日期：2026-08-23。本文只采用 PoolTogether 官方开发者文档和 Generation Software 官方合约仓库。

## 结论

Claude 给出的“三层解耦”概括方向正确：收益源、收益清算、Prize Pool 记账彼此分离，CachePot 若已有一个无许可、按实际到账金额记账的 `contribute(vault, amount)`，确实具备接第三方奖励来源的关键入口。

但原论证有几处需要修正：

1. PoolTogether 的 `contributePrizeTokens` **不会调用 `transferFrom`**。调用者必须先把 prize token 转入 Prize Pool；函数只检查“实际余额减已记账余额”是否足够，再把金额记到指定 vault。[PrizePool.sol `contributePrizeTokens`](https://github.com/GenerationSoftware/pt-v5-prize-pool/blob/main/src/PrizePool.sol#L367-L383)
2. “赔率跟着实际到账金额走”正确，但不是简单的“本轮贡献占比 = 本轮派奖占比”。Vault 的中奖权重取决于一个由奖级决定的历史 draw 区间内的贡献份额；用户在该 vault 内还要乘自己的 TWAB / vault 总 TWAB。[PrizePool.sol `isWinner` 与 `getVaultPortion`](https://github.com/GenerationSoftware/pt-v5-prize-pool/blob/main/src/PrizePool.sol#L907-L1025)
3. 标准 PrizeVault 清算出去的通常是 **存款资产或 PrizeVault shares**，不是底层 ERC-4626 yield-vault shares。因此把拍卖对象直接描述成 `aUSDC`、`sDAI` 等并不严谨。[PrizeVault.sol `liquidatableBalanceOf`](https://github.com/GenerationSoftware/pt-v5-vault/blob/main/src/PrizeVault.sol#L600-L630)
4. “收益已经是 USDT 就可跳过拍卖”只有在收割产物与 Prize Pool 接受的是**同一个 ERC-20 token**，或存在原子、可验证的包装步骤时才成立。USDT 与 cUSDT 即使经济价值相同，合约层仍是不同 token。
5. “把 waUSDT share 1:1 wrap 成保密 token，再从升值部分收割 USDT”不是自然成立的：若 wrapper 承诺每个保密 token 可 1:1 unwrap 为一个 waUSDT share，那么这些升值 shares 完整属于持有人；抽走储备会破坏 1:1 偿付。要收割升值，需要改变 wrapper 的负债单位并新增本金/汇率/损失会计，而不只是更换底层 token。

## PoolTogether V5 实际分层

### 1. PrizeVault 与收益源

标准 `PrizeVault` 自身实现 ERC-4626，并持有另一个 ERC-4626 `yieldVault`。用户存入的是 `yieldVault.asset()`；PrizeVault 把资产放入底层 yield vault，用户余额则通过 TWAB 份额记账。[PrizeVault 合约说明及构造参数](https://github.com/GenerationSoftware/pt-v5-vault/blob/main/src/PrizeVault.sol#L17-L65) [构造器与 `yieldVault.asset()`](https://github.com/GenerationSoftware/pt-v5-vault/blob/main/src/PrizeVault.sol#L264-L301)

在正常、无亏损状态下，PrizeVault 让用户份额按本金单位记账；底层资产超过 `totalDebt` 的部分才是 yield。合约进一步保留 `yieldBuffer`，可清算收益为 `total assets - total debt - yield buffer`，还会扣除 yield fee。[收益与债务会计](https://github.com/GenerationSoftware/pt-v5-vault/blob/main/src/PrizeVault.sol#L537-L595)

“任何 ERC-4626 都可直接接入”也应理解为“任何**兼容的** ERC-4626”。官方合约明确不支持存取款收费的底层 vault；底层亏损、withdraw/redeem 限额、精度和舍入也会改变可提款能力。[PrizeVault 兼容性与亏损说明](https://github.com/GenerationSoftware/pt-v5-vault/blob/main/src/PrizeVault.sol#L25-L64) [官方 Vault 设计](https://dev.pooltogether.com/protocol/design/vaults/)

### 2. TPDA 清算

标准 PrizeVault 不自行做市场兑换，而是把可清算收益暴露给外部 Liquidation Pair。Pair 使用 Target Period Dutch Auction 定价；官方给出的核心价格关系为：

`auctionPrice = targetAuctionPeriod / elapsedTimeSinceLastAuction * lastAuctionPrice`

因此价格在上次拍卖后由极高值随时间下降，在目标周期时达到上次成交价，不需要预言机。清算者支付 Prize Pool 的 prize token，收到 vault 暴露的资产；官方建议普通账户经 Router 交易，并支持 flash swap。[PoolTogether V5 Liquidation 设计](https://dev.pooltogether.com/protocol/design/#liquidation) [TPDA Pair 参考](https://dev.pooltogether.com/protocol/reference/liquidator/tpdaliquidationpair/) [清算机器人指南](https://dev.pooltogether.com/protocol/guides/bots/liquidating-yield/)

在标准 PrizeVault 的原子清算路径中，Pair 先从 vault 转出 yield，随后 `verifyTokensIn` 验证输入 token 正是 Prize Pool 的 prize token，并调用 `contributePrizeTokens(address(this), amountIn)`。[PrizeVault.sol 清算回调](https://github.com/GenerationSoftware/pt-v5-vault/blob/main/src/PrizeVault.sol#L632-L698)

### 3. Prize Pool 入口与赔率

每个 Prize Pool 在构造时固定一个 `prizeToken`；具体 token 随部署变化，不应笼统写成“主网是 WETH/POOL”。官方设计页说明图中 POOL 只是示例、Optimism 部署使用 WETH；官方合约仓库还特别注明目前只有 WETH 作为 `prizeToken` 经过审计。[协议资金流说明](https://dev.pooltogether.com/protocol/design/#flow-of-funds) [Prize Pool 仓库审计提示](https://github.com/GenerationSoftware/pt-v5-prize-pool#overview)

`contributePrizeTokens(vault, amount)` 是 `public`，没有 caller allowlist。它做的是：

- 检查 Prize Pool 的未记账实际余额至少为 `amount`；
- 把 `amount` 加入指定 vault 与全局的 draw accumulator；
- 记录当前 open draw 并发出事件。

这保证了不能凭空伪造贡献，但“先转账、后记账”若拆成两笔交易会留下被第三方抢先归因未记账余额的窗口。PoolTogether 的标准 Pair 在同一笔交易中完成输入和记账；CachePot 若使用同一函数内 `transferFrom + balance delta + 记账`，反而是更直接的原子接口。

Vault 贡献如何影响中奖：

- vault 部分：指定历史 draw 区间内，该 vault 的贡献 / 所有有效 vault 的总贡献；特殊 `DONATOR` 的捐赠会进入奖金流动性但被排除在 odds 分母之外；[贡献份额计算](https://github.com/GenerationSoftware/pt-v5-prize-pool/blob/main/src/PrizePool.sol#L1001-L1043)
- 用户部分：同一时间范围内，用户 TWAB / vault 总供应 TWAB；
- 奖级部分：tier odds 与 prize index；不同奖级使用不同长度的历史范围。[中奖判定](https://github.com/GenerationSoftware/pt-v5-prize-pool/blob/main/src/PrizePool.sol#L907-L963)

所以更精确的表述是：**实际 prize-token 贡献决定 vault 在相应历史窗口中的 odds 份额；用户 TWAB 再决定其在 vault 内的份额。** 奖金如何分到各 tier/reserve 是全局 Prize Pool 的流动性模型，不是按 vault 逐笔分账。

## 对 Claude 原论证的逐项判断

| 原说法 | 判断 | 修正或补充 |
| --- | --- | --- |
| V5 将收益源、清算和奖池入口解耦 | 基本正确 | Prize Pool 还要求 vault 使用 TWAB 并具备 prize claim 路径；自定义 vault 的官方最低要求是 TWAB、贡献 prize token、允许领奖。[自定义 Vault 指南](https://dev.pooltogether.com/protocol/guides/customize/custom-prize-vault/) |
| PrizeVault 包装任意 ERC-4626 | 方向正确 | 必须是兼容实现；手续费、亏损、流动性限制、舍入和精度都需验证。 |
| `liquidatableBalanceOf` 是“超出本金的收益” | 基本正确 | 实际还扣 yield buffer、yield fee，并受底层最大提款或 mint limit 限制。 |
| TPDA 无预言机，由套利者发现价格 | 正确 | Pair 的报价来自上次成交价与时间曲线；执行仍需滑点上限、deadline、流动性/MEV 风险控制。 |
| `contributePrizeTokens` 无许可且认实际到账 | 正确但表述不完整 | 它不拉币，只消费未记账余额；生产调用应原子化，避免余额归因被抢。 |
| 赔率按 vault 实际贡献成比例 | 基本正确 | 是 tier-dependent 历史窗口中的 vault portion，再与用户 TWAB 和 tier odds 组合；不等于直接分到同等比例奖金。 |
| 恶意收益源骗不到别人的奖 | 过强 | 没有真实 prize token 就买不到 odds；但任何人用真实 token 为任意 vault 买 odds 是协议允许的，补贴/捐赠池下可能存在经济博弈，仍需建模。 |
| 同 prize token 且收益同资产时可跳过拍卖 | 条件成立 | 必须是同一个 token 合约，或有原子包装/兑换；USDT 与 cUSDT 不能仅凭同锚定价值视为同资产。 |

## CachePot / FHE 适配时最重要的边界

### 奖池接口可以保持稳定

推荐保留 Prize Pool 的窄入口：第三方适配器、keeper、赞助者都先获得奖池接受的唯一 prize token，再调用同一个原子 `contribute(vault, amount)`。奖池只维护：实际到账、归属 vault、轮次和 odds，不识别 Aave、Morpho、Yearn 或拍卖合约。

建议把下列安全属性写成合约不变量与测试：

- 记账增加量不得超过本次真实 balance delta；
- token transfer 与归因在同一交易完成；
- 任意 caller 可以贡献，但不能借用历史或他人的未记账余额；
- 不受支持/未注册 vault 是否可以买 odds，应成为显式政策，而不是偶然行为；
- fee-on-transfer、rebasing、ERC-777 callback 和异常 ERC-20 的处理边界明确；
- 贡献失败时，token 转账与记账一起回滚。

### “生息型 wrapper”需要重新定义偿付义务

如果 confidential wrapper 当前承诺 `1 cToken = 1 underlying token`，把 underlying 从 USDT 换成 waUSDT 只会让 cToken 代表 waUSDT share。waUSDT 对 USDT 的升值属于 cToken 持有人，wrapper 没有可无偿抽走的“多余 share”。

若要把升值变成共享奖金，至少需要一种新的明文/密文会计模型：

- 负债以存入时的 USDT 本金计，而不是以 waUSDT share 数计；
- 记录总本金、当前可赎回资产、可收割盈余和亏损状态；
- 明确定义入场/退出汇率、舍入、yield buffer、底层 loss 如何社会化；
- 证明 harvest 后仍满足所有密文用户余额的总偿付能力；
- 处理即时提款流动性和底层协议暂停/限额。

这更接近 PoolTogether PrizeVault 的 `totalAssets / totalDebt / availableYield` 模型，而不是简单替换 ERC7984 wrapper 的 reserve token。

### FHE 不会自动隐藏资金路径

即使个人余额存为 ciphertext，下列数据仍可能公开：底层 ERC-20 转入 wrapper 的数量、Aave/ERC-4626 聚合仓位、harvest 数量、每个 vault 的公开贡献和调用时间。如果“单笔存款金额”也属于隐私目标，需要单独设计批处理、relayer、shielded ingress 或延迟聚合；不能只以“余额是密文”推导整条资金路径保密。

### 是否需要 TPDA

- 收割结果已是奖池接受的**同一 prize token**：可直接贡献，不需要拍卖。
- 收割结果是 USDT、奖池接受 cUSDT：至少需要可信/原子的 wrap adapter；是否需要拍卖取决于包装是否固定 1:1、是否有权限或流动性约束。
- 收割结果是其他资产：可引入 TPDA 或受控 DEX adapter。TPDA 的优势是不依赖价格预言机，但仍要考虑低流动性、长时间无人清算、MEV、最低成交量和紧急退出。

## 推荐落地顺序

1. 先把现有 `contribute` 明确定义成第三方奖励入口，并补齐 balance-delta、原子转账、vault 身份、异常 ERC-20 测试。
2. 做一个不含 FHE 资产负债复杂度的 `MockYieldAdapter`，证明第三方 harvest 后可原子贡献、贡献归属和 odds 守恒。
3. 为生息型 confidential vault 单独写 accounting spec，先证明 `assets >= encrypted principal liabilities + buffer`；不要直接把“底层 share 升值”等同于可收割收益。
4. 只有接入非 prize-token 收益并确实需要市场发现价格时，再加入 TPDA；稳定币/保密包装路径先用最小 adapter 验证。

