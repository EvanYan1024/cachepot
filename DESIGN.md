# CachePot — 保密无损彩票（Confidential PoolTogether on FHEVM）

> 名字由来：法语 *cachepot*——专为遮掩内里而生的罐子。一个天生用来「藏」的 pot，装着一个保密的奖池。

> 技术方案文档 · v0.1 · 2026-07-31
> 目标赛事：Zama Developer Program Mainnet Season 4 Bounty Track
> 截止：2026-09-05 23:59 AoE · 奖池 5,000 cUSDT · 最多 3 队分奖
> 提交：https://forms.zama.org/developer-program-mainnet-season4-bounty-track

---

## 0. 一句话定位

**保密版 PoolTogether**：用户存入 cUSDT 参与"无损彩票"——本金随时可取，收益定期抽奖发放。**存款金额、余额、谁中了奖全部是 FHE 密文**，但抽奖的每一步都发生在不可变合约的链上交易里，**任何人可验证过程公平**。

## 1. 赛题要求对照

| 赛题硬性要求 | 本方案的回应 |
|---|---|
| 存款、余额、中奖情况加密 | ERC7984 保密代币 + `euint64` 加密账本，中奖者身份全程密文（§5.4） |
| 赢家选择链上可验证 | 链上 CSPRNG + 不可变合约逻辑 + KMS 门限签名解密验证（§6） |
| 本金随时可取 | `withdraw` 无锁定期，`FHE.min` 防超额（§5.1） |
| Production-ready，非 PoC | 分批抽奖状态机应对 HCU 限额（§5.3）、两段式 TWAB 结算、防重放、完整前端 |
| Sepolia 部署 + 线上 demo | Zama Hardhat 模板 + Vercel 前端 |
| 3 分钟真人视频 + X thread | 交付清单见 §10 |

## 2. 目标与非目标

**目标（全部服务于"保密 + 可验证"这一个卖点）**
- 加密余额加权抽奖：存得越多、越久，中奖概率越大，且权重本身保密
- 加密 TWAB（时间加权平均余额）：防开奖前突击存款
- 中奖者身份不公开：只有中奖者本人解密自己余额才知道
- 抽奖全流程链上可审计，无管理员干预路径

**非目标（明确砍掉，README 说明生产路线）**
- 真实收益源：Sepolia 无真实利率市场，奖金由 mock 收益源注入；生产环境替换为 Aave/ERC4626，接口预留
- PoolTogether V5 的 TPDA 收益拍卖、VRGDA 领奖激励、自适应 prize tier、多 vault——均为 hyperstructure 包袱，与保密卖点无关
- 多链部署、治理、协议费

## 3. 系统架构

```
┌────────────┐   shield/unshield    ┌──────────────────┐
│  USDT(mock)│ ◄──────────────────► │ cUSDT (ERC7984)  │  OpenZeppelin
└────────────┘                      │  Wrapper          │  confidential-contracts
                                    └───────┬──────────┘
                                            │ confidentialTransfer (operator)
                                    ┌───────▼──────────┐
                                    │  CachePot.sol     │  核心合约（唯一自研合约）
                                    │  - 加密账本/TWAB   │
                                    │  - 抽奖状态机      │
                                    │  - mock 收益注入   │
                                    └───────┬──────────┘
                Zama Protocol       ┌───────▼──────────┐
                (Sepolia 已部署)     │ FHEVM 协处理器     │ FHE 运算执行
                                    │ KMS (门限解密)     │ checkSignatures 验签
                                    │ Relayer           │ 前端加密输入/用户解密
                                    └──────────────────┘
前端：Next.js + @zama-fhe/relayer-sdk + wagmi，Vercel 部署
```

## 4. 关键技术约束（决定了后续所有设计）

调研确认的 FHEVM 事实，方案围绕它们构建：

| # | 约束 | 影响 |
|---|---|---|
| C1 | `FHE.randEuintX(bound)` 的 bound 必须是 2 的幂；随机数只能在交易中生成（不能 `eth_call`），结果是密文 | 不能直接 `rand % 加密总权重`；随机数无人可预测（含验证者），天然防 MEV |
| C2 | `FHE.div`/`FHE.rem` 只支持**明文除数** | 随机目标点改用定点缩放 `(r × T) >> 64`（§5.3） |
| C3 | HCU 限额：单笔交易全局 20M、**顺序深度 5M**；euint64 非标量 `add` 162k、`lt` 146k、`mul` 596k、`select` 55k | 前缀和扫描是顺序链，单笔交易只能扫 ~8–15 人 → 抽奖必须分批（§5.3） |
| C4 | ERC7984 转账失败**不 revert**（静默转 0） | 所有出账用 `FHE.min(请求额, 余额)` 钳制（§5.1） |
| C5 | 公开解密流程：`makePubliclyDecryptable` → SDK `publicDecrypt` → 链上 `FHE.checkSignatures` 验签，需自做防重放 | 凡需公开的明文都走此流程，重放用 roundId 标志位挡（§6） |

## 5. 核心机制

### 5.1 存款 / 取款

- **存款**：用户在前端 `setOperator` 授权后调用 `deposit(encAmount, proof)`，合约用 `confidentialTransferFrom` 拉取 cUSDT；到账额以合约实际收到的密文为准（ERC7984 转账返回实际转账密文额）
- **取款**：随时可调，无锁定期。`sent = FHE.min(encRequested, balance[user])` 钳制后转出（应对 C4，防超额也防余额不足时静默失败造成的账本不一致）
- 每次余额变动前，先做 TWAB 结算（§5.2）
- 参与者首次存款进入 `participants[]` 数组；demo 设 `MAX_PARTICIPANTS = 256` 与最小存款额（防尘埃账户拖垮扫描成本）；生产路线：槽位复用 + 分片扫描

### 5.2 加密 TWAB 权重（防突击存款）

抽奖权重不是即时余额，而是本轮**时间加权累积**，全部在密文域维护：

```
每次余额变动（时刻 t）：
  acc[user] += balance[user] × (t − lastTouch[user])   // Δt 为明文标量，乘法便宜
  lastTouch[user] = t
```

- `acc` 用 `euint128`（余额 × 秒数可能溢出 64 位）
- **两段式结算**：若用户上次结算在上一轮、本轮已关闭，则先把 `balance × (closeTime − lastTouch)` 计入上一轮的 `accClosed[user]`，再从 `closeTime` 起累计新轮的 `accCurrent[user]`——保证轮次关闭后余额变动不污染已关闭轮次的权重，也无需在关轮时遍历所有用户（惰性结算）
- 扫描时用户权重：`w = accClosed[user] + balance[user] × (closeTime − lastTouch)`（未结算部分现场补齐）

### 5.3 抽奖状态机（本项目的技术心脏）

轮次生命周期：`Open → Closed → Drawing(分批) → Awarded`，固定周期（demo 用 24h，参数化）。

**① 关轮 + 取随机数（1 笔交易，任何人可调）**

```solidity
function closeRound() external {
    require(block.timestamp >= round.closeTime && round.state == Open);
    round.rand = FHE.randEuint64();        // 密文随机数，此刻起无人可预测或窥视
    round.state = Drawing;
}
```

**② 分批扫描选赢家（多笔交易，任何人可推进）**

绕过 C2：目标点用定点缩放取代取模——

```
target = (uint128(rand) × totalWeight) >> 64    // 均匀落在 [0, totalWeight)
```

对参与者做加密前缀和扫描，全程密文，无人知道命中谁：

```solidity
function advanceDraw(uint256 batchSize) external {  // batchSize ≤ BATCH_MAX
    for (i = cursor; i < cursor + batchSize; i++) {
        euint128 w = _settledWeight(participants[i]);          // §5.2
        cum = FHE.add(cum, w);                                 // 加密累加器，跨交易保存
        ebool hit = FHE.lt(target, cum);
        ebool isWinner = FHE.and(hit, FHE.not(found));         // 只有第一个越过 target 的算中
        found = FHE.or(found, hit);
        winnerFlag[i] = isWinner;                              // 每人一个加密中奖标记
    }
    cursor += batchSize;
}
```

- `cum`/`found`/`target` 是合约存储里的加密累加器，跨交易续算——**这就是应对 C3 的分批状态机**
- 顺序链深度 ≈ 每人 500–700k HCU（euint128 加法 + 比较 + 布尔链），5M 深度限额下 `BATCH_MAX` 保守取 8，实测后调优
- 呼应 PoolTogether 的"激励维护"哲学：`advanceDraw` 对 caller 发小额激励（可选，时间富余再做）

**③ 保密发奖（并入扫描或独立分批）**

```solidity
balance[i] = FHE.add(balance[i], FHE.select(winnerFlag[i], prize, ZERO));
acc 同步结算
```

- 赢家身份**永不解密**：每个人余额都被"加了一笔"，只是非赢家加的是加密的 0。链上观察者无法区分
- 中奖者在前端用**用户解密**（EIP-712 签名，仅本人可解）看到自己余额跳变——这就是"获奖情况加密"的达成方式
- **设计决策：奖金总额公开**（明文 `prize`）。公开奖池大小是彩票产品的展示需求（PoolTogether 亦如此），保密的是"谁赢了"；`select` 用标量也更省 HCU

**④ 多赢家扩展（P1，时间富余再做）**：N 个赢家 = 取 N 个独立随机数跑 N 组 `found/winnerFlag`，扫描循环内并行累积，边际成本远小于 N 倍。

### 5.4 保密性边界（诚实声明，写进 README 和 pitch）

| 信息 | 状态 |
|---|---|
| 单人存款额 / 余额 / TWAB 权重 | 密文，仅本人可解 |
| 谁是赢家、赢了多少 | 密文，仅赢家本人知道 |
| 奖金总额、轮次时间表、参与人数（数组长度） | 公开（设计决策） |
| 存取款交易的发生本身（地址、时间） | 公开（链上交易固有元数据） |

## 6. 可验证性论证（评审核心问题："你怎么证明抽奖公平？"）

1. **随机性可信**：`FHE.randEuint64()` 由协议级 CSPRNG 在交易执行时生成，PRNG 状态在链上更新；生成出来就是密文——部署者、验证者、MEV 搜索者都无法预测或窥视。对比 Chainlink VRF：无需外部预言机信任，且随机数本身保密
2. **选择逻辑可信**：抽奖全流程是不可变合约代码里的公开交易（`closeRound`/`advanceDraw` 均无权限、任何人可调、可重放审计），每批发事件；不存在管理员干预路径
3. **解密可信**：任何公开明文都经 KMS **门限签名**，链上 `FHE.checkSignatures` 验证；单一 KMS 节点无法伪造。回调用 roundId 标志位防重放（C5）
4. **账本可信**：奖金入账走与存款同一套加密账本，赢家取款时链上余额自洽

## 7. 合约接口草案

```solidity
contract CachePot is ZamaEthereumConfig {
    // —— 用户 ——
    function deposit(externalEuint64 amount, bytes calldata proof) external;
    function withdraw(externalEuint64 amount, bytes calldata proof) external;
    function balanceOf(address user) external view returns (euint64); // 密文句柄，本人经 ACL 解密

    // —— 轮次（无权限，任何人可调）——
    function closeRound() external;                    // 到期关轮 + 取随机数
    function advanceDraw(uint256 batchSize) external;  // 分批扫描
    function finalizeRound() external;                 // 扫描完成 → Awarded，开新轮

    // —— 收益（demo mock）——
    function fundPrize(uint64 amount) external;        // 赞助者注入 cUSDT 奖金（明文额）

    // —— 视图 ——
    function currentRound() external view returns (RoundInfo); // 状态/截止/奖额/游标
}
```

存款输入用 `externalEuint64 + proof`（Relayer SDK 的 `createEncryptedInput` 产出），合约内 `FHE.fromExternal` 校验。ACL：用户余额句柄 `FHE.allow(balance, user)`，抽奖中间量只 `allowThis`。

## 8. HCU 预算（2026-07-31 mock 环境实测，`fhevm.computeTransactionHCU`）

W1 纯余额版 vs W2 TWAB 完整版（含两段结算、每人 2–3 次 euint128 标量乘法）：

| 操作 | W1 global/depth | W2 global/depth | 结论 |
|---|---|---|---|
| closeRound | 1.75M / 1.75M | 2.74M / 2.72M | 单笔宽裕（限额 20M/5M） |
| advanceDraw 每参与者 | 574k / 210k | **2.26M / 335k** | W2 约束项转为 **global** |
| **BATCH_MAX** | 23（depth 限） | **8**（20M/2.26M） | 生产用 6–7 留余量 |
| 256 人满员一轮 | 16 笔 | ~40 笔 | keeper 自动推进，可接受 |

优化预留（暂不做）：扫描中跳过 accCur 精确结算可省一半以上，但会给赢家多记几秒 prize 权重——当前保持精确版。

**拆成两层后的实测**（§8.2 架构，`CacheVault.advanceDraw` 含跨合约 `creditBatch`）：

| 操作 | global | depth | 结论 |
|---|---|---|---|
| advanceDraw 每参与者 | **2.55M** | ~186k | 比单池版 +13%（多了 L1 的 and/or/select/add） |
| **BATCH_MAX** | **7**（20M / 2.55M） | — | 生产用 6 留余量 |

L1 金库选择本身几乎不花钱：贡献额是明文，`FHE.ge/lt(euint64, uint64)` 走标量路径，每个金库每轮只算一次。

### 8.1 Sepolia 部署地址

| 合约 | 地址 | 说明 |
|---|---|---|
| **CachePrizePool** | `0xd337eFCcB99016F0195852d19ac6828afe866C87` | 共享奖池，prize token = cUSDT，轮次 600s（v3：skipVault 活性逃生口 + 搁浅 TWAB 丢弃） |
| CacheVault cUSDT | `0x314CC047759F0678792b5671b8CcfdF5abacd369` | v4：缓冲钳制取款 |
| CacheVault cUSDC | `0x16e0dbB985426383672fAbCe1d367C7792A30502` | v4：接入 Zama Earn（Confidential Vault）批处理器 |
| CacheVault cWETH | `0x52E372c30b830Da5e50926565B769732fFb32a85` | v4：缓冲钳制取款 |
| cUSDTMock | `0x4E7B06D78965594eB5EF5414c357ca21E1554491` | **Zama 官方**保密 USDT wrapper（6 位小数，rate 1:1） |
| cUSDCMock | `0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639` | Zama 官方 |
| cWETHMock | `0x46208622DA27d91db4f0393733C8BA082ed83158` | Zama 官方 |
| USDTMock | `0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0` | 奖池底层 ERC-20，`mint` 公开无权限 = 水龙头 |

**真网演练结果**（`scripts/rehearse.ts`，同一地址同时存入两个已注资金库）：

```
reserve before draw: 30000000      赔率 cUSDT 20/30 · cUSDC 10/30
prize balance:  0 → 30000000       同时在两个金库里，只被支付一次
reserve after:  0                  won last round: true
claim settled:  wallet 1050450000 → 1080450000
```

刻意不自己发币：CachePot 构造函数吃 `IERC7984`，接的是生态里已有的保密资产，证明通用性。`TestERC7984.sol` 仅作 hardhat mock 网络的单测 fixture 保留。

## 8.2 多资产架构：共享奖池 + 多金库

单池版本（§4–5）只接一种资产。生产形态照 PoolTogether V5 拆成两层：

```
                    ┌─────────────────────────────────────┐
                    │          CachePrizePool             │
                    │  prize token: cUSDT（保密）          │
                    │  contribution[vault]  ← 明文，可验证  │
                    │  轮次调度 + 加密随机数 + 全局中奖标记   │
                    │  _prizeBalance[user]  ← 密文奖金账本  │
                    └─────────────────────────────────────┘
                       ▲ creditBatch(users, encFlags)
            ┌──────────┴──────────┬──────────────────┐
      ┌─────┴─────┐        ┌──────┴────┐      ┌──────┴────┐
      │ CacheVault│        │ CacheVault│      │ CacheVault│
      │   cUSDT   │        │   cUSDC   │      │   cWETH   │
      │ 加密 TWAB  │        │ 加密 TWAB  │      │ 加密 TWAB  │
      └───────────┘        └───────────┘      └───────────┘
```

### 两层中奖：为什么这个结构天生适配 FHE

V5 的关键洞察是**不需要跨资产喂价**：金库把收益清算成统一的 prize token 再注入奖池，贡献额天然同币计价。分两层：

| 层 | 决定什么 | 数据形态 | FHE 成本 |
|---|---|---|---|
| L1 金库选择 | 哪个金库中奖 | 贡献额**明文**（V5 也是公开的） | 标量比较，~0 |
| L2 金库内选人 | 金库里谁中奖 | 加密 TWAB 前缀和扫描 | 已实测 2.26M/人 |

L1 用明文边界 + 密文 target：`vaultHit_v = (vaultTarget ≥ cumStart_v) ∧ (vaultTarget < cumEnd_v)`，全是标量运算。

### 比 PoolTogether 更强的隐私

V5 里中奖金库和中奖地址都是公开的。CachePot 把 `vaultHit_v` 也做成密文 `ebool`，于是：

```
credit_u = FHE.select(localWinner_u ∧ vaultHit_v ∧ ¬awarded, roundPrize, 0)
```

每个金库的每个存款人每轮都被写一次奖金账本，绝大多数是加密的零。**匿名集从"单个金库的存款人"扩大到"全部金库的全部存款人"，且没人知道是哪个金库中的奖**。这是 FHE 相对原版的净增益，不是复刻。

### 两个必须解决的正确性问题

**(a) 贡献额如何做到明文可验证。** L1 权重是明文，但 ERC7984 转账收多少是密文，谎报贡献额就能白嫖赔率。解法是让注资走**底层 ERC-20 → 池内 wrap** 这条路：

```solidity
underlying.transferFrom(msg.sender, address(this), amount); // 明文，不足即 revert
underlying.approve(address(prizeToken), amount);
IERC7984Wrapper(prizeToken).wrap(address(this), amount);    // 池内自行包装成保密代币
contribution[vault] += amount;                              // 已验证的明文
```

这同时对应 V5 的"收益清算成 prize token"那一步——清算产出本来就是公开的 ERC-20 数额。

**(b) 恶意金库不能掏空奖池。** 金库只能向池子提交每个用户的加密中奖标记，奖金数额由**池子**计算（V5 同理：赢家由 Prize Pool 判定，金库无权断言）。即便恶意金库把所有用户都标成赢家，池子的全局 `_awarded` 密文标记保证**每轮最多支付一次**：

```solidity
ebool win = FHE.and(FHE.and(flag_u, vaultHit_v), FHE.not(_awarded));
_prizeBalance[u] = FHE.add(_prizeBalance[u], FHE.select(win, _roundPrize, zero));
_awarded = FHE.or(_awarded, win);
```

金库能操纵的只有"自己用户之间"的分配，而它的中奖频率被自己的贡献额锁死——和 V5 的安全论证同构。因此**金库注册可以是无许可的**。

### 奖金与本金分离

赢家可能存的是 cWETH 却赢得 cUSDT，两者不能相加。所以金库账本（存款资产）和池子的 `_prizeBalance`（prize token）是两个独立的加密账本，赢家从池子单独 `claim`。这也正是 V5 的语义。

## 9. 前端与 SDK 交互

- **技术栈**：Vite + React + shadcn/ui + TanStack Query + wagmi/RainbowKit + **`@zama-fhe/sdk` + `@zama-fhe/react-sdk`**（旧 relayer-sdk 已 legacy），Vercel 部署
- **页面**：`/` landing（保密边界对照）· `/deposit` · `/prize`（抽奖算法 + HCU 表）· `/account`（密文句柄原文展示）
- **存款流**：faucet 领 mock USDT → shield 成 cUSDT（wrapper）→ `setOperator` → 加密输入存款
- **余额/中奖展示**：`userDecrypt`（EIP-712 签名）解密自己的余额与中奖标记；开奖后余额跳变 + "You won 🎉" 动效——**这是 demo 视频的高光镜头**
- **轮次页**：奖池金额、倒计时、抽奖进度条（cursor/总人数）、"帮抽奖推进一批"按钮（人人可点，体现无许可）
- **自动推进**：一个 keeper 脚本（cron）在无人点击时代为推进抽奖，保证 demo 站点始终有活轮次

## 10. 交付清单与里程碑（截止 9/5 AoE，约 5 周）

| 周 | 里程碑 | 验证标准 |
|---|---|---|
| W1 (8/1–8/7) | Hardhat 模板搭建；**核心风险验证**：加密扫描选赢家 + 定点缩放在本地 mock 环境跑通，实测 HCU 定 BATCH_MAX | 单测：给定已知随机数，赢家落点正确；批次断点续算正确 |
| W2 (8/8–8/14) | 完整合约：存取款 + TWAB 两段结算 + 状态机 + cUSDT 集成，Sepolia 部署 | 全流程集成测试在 Sepolia 通过 |
| W3 (8/15–8/21) | 前端：存取款、用户解密余额、轮次页、抽奖推进 | 真机走通完整用户旅程 |
| W4 (8/22–8/28) | 打磨：keeper、动效、文案、README（架构图 + 保密边界 + 生产路线）、安全自查（重放/ACL/溢出） | 外人不看文档能用 demo |
| W5 (8/29–9/5) | 3 分钟真人视频（**禁 AI 生成**）、X thread（@zama #ZamaDeveloperProgram）、提交表单 | 提交完成，留 buffer |

**风险前置**：W1 的加密扫描验证是全项目最大不确定点，若 HCU 实测远超预算，退路是压缩权重精度（euint128 → 右移若干位 → euint64 扫描），减半单批成本。

## 11. 与 PoolTogether V5 的对照（评审叙事用）

| V5 组件 | 本方案 | 理由 |
|---|---|---|
| Prize Vault (ERC4626) | 简化为合约内加密账本 + mock 收益 | Sepolia 无真实收益；生产接 Aave，接口预留 |
| TWAB Controller | **加密 TWAB**（惰性两段结算） | 保留防作弊本质，且权重本身保密——超越原版的隐私性 |
| RNG 拍卖 + Chainlink VRF | `FHE.randEuint64()` | 原生密文随机数，去掉外部预言机信任 |
| 中奖判定（明文余额加权） | 加密前缀和扫描 + 定点缩放 | 全密文域完成，身份不泄露 |
| VRGDA Claimer | 无需领奖——发奖即入账 | select 发奖天然"自动到账"，比原版体验更好 |
| Prize tiers (4^t) | 单赢家（P1：N 赢家） | 复杂度换保密叙事，tier 与卖点无关 |
