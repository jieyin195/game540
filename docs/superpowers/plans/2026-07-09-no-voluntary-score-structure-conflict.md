# 跟牌结构强制与不能主动垫分牌冲突 修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `js/rules.js` 里 `_validateFollowStructure`/`_validateBombFollowStructure`（结构强制：有对子/三同张/炸弹必须用）与 `_checkNoVoluntaryScore`（不能主动垫分牌）之间的规则冲突——当玩家同花色/主牌唯一能凑成的成型组合（对子/三同张/炸弹）恰好是计分牌、且手里还有配不成对的零散非计分单张时，不应再被误判为"主动垫分"。

**Architecture:** 不改动三个既有函数（`_validateFollowStructure`、`_validateBombFollowStructure`、`_checkNoVoluntaryScore`）的函数体和签名。在 `validateFollow` 内部新增一个纯函数 `_voluntaryScorePool`，逐分支镜像结构强制规则实际强制的条件，把传给 `_checkNoVoluntaryScore` 的候选池从"同花色/主牌全部手牌"收窄为"手里其他同类型的成型组合"（配不成对/三张的零散单张不算候选）。只替换 `validateFollow` 里"跟同花色/主牌"这一处调用点的候选池参数，"垫异花色"那处调用点不受影响。（此设计后经 Task 1 复查修订为 `_forcedGroupCards` + 两次独立调用，详见 Task 1 内的修订说明。）

**Fix Round 2 / Task 2 追加：** Task 1 复查后又发现一个独立的 Critical bug——当同一 `pairKey`（同花色同点数）的牌数量超过结构规则实际需要的张数时，`_forcedGroupCards` 固定截取分组内"前N张"，`validateFollow` 调用点用对象引用（`.includes()`）划分"成型组合 vs 补位单张"，`_checkNoVoluntaryScore` 内部又用引用比较（`!==`）判断"是否按分小牌小顺序"——换一张同 pairKey 的等价牌出，会被误判违规。修复需要放宽此前"三个既有函数函数体不变"的约束（用户已批准）：只对 `_checkNoVoluntaryScore` 内一行比较逻辑做按值比较的最小改动，并新增 `_partitionByPairKeyCounts` 辅助函数替换调用点的引用划分。详见 Task 2 与 `docs/superpowers/specs/2026-07-09-no-voluntary-score-structure-conflict-design.md` 的"Fix Round 2"一节。

**Tech Stack:** 纯 JavaScript（ES Modules），Node.js 原生 `assert/strict` 做测试，无第三方测试框架/无构建步骤——与本分支已有的 `test/fix1~fix6-*.mjs` 完全一致的约定。

## Global Constraints

- 不修改 `js/card.js`、`js/game.js`、`js/renderer.js`、`js/ai.js`、`js/input.js`、`game540.html`——本次修复只涉及 `js/rules.js` 一个源文件 + 一个新增测试文件。
- 不改变 `_validateFollowStructure`、`_validateBombFollowStructure` 两个既有函数的函数体和对外签名。
- `_checkNoVoluntaryScore` 对外签名（参数、返回值类型）不变；**Task 2（Fix Round 2）经用户批准放宽"函数体不变"的约束**，允许修改其内部第730行 `expected`/`actual` 逐张比较的逻辑（引用比较 `!==` 改为按值比较），改动范围仅限这一行比较逻辑本身，不改函数签名、不改其余行为（`isBeatingPlay` 短路、`nonScore` 短路、排序逻辑均不变）。
- 不改变 `validateFollow` 的导出签名（`export function validateFollow(followCards, ledCards, hand, trumpSuit, trickHasScore, currentBest, requiredCount)`不变）。
- 新增的 `_forcedGroupCards` 函数不导出（与 `_validateFollowStructure`/`_checkNoVoluntaryScore` 保持同样的模块私有约定，前缀下划线、无 `export` 关键字）。（此函数最初以 `_voluntaryScorePool` 之名实现，因 Critical 回归改名为 `_forcedGroupCards`，见 Task 1 修订说明）
- 新增的 `_partitionByPairKeyCounts` 函数（Task 2）同样不导出，遵循相同的模块私有约定。
- 测试文件延续 `.mjs` + `node:assert/strict` + 直接 `import` 真实 `js/rules.js`/`js/card.js`（不用 mock）的约定，文件命名 `test/fix11-voluntary-score-structure-conflict.mjs`。
- `_validateFollowStructure` 里 `CONSEC_TRIPLES` 分支复用 `pairsAvail`（而非 `triplesAvail`）是已知的、独立的疑似问题——本次修复严格镜像这一现状，不顺带修正（详见 `docs/superpowers/specs/2026-07-09-no-voluntary-score-structure-conflict-design.md` "不在本次修复范围内"一节）。
- Git 提交信息使用 `fix: <中文描述>` 格式，与本分支既有提交风格一致（例如 `fix: 用分牌合理压牌时不再误判为主动垫分牌`）。

---

## 背景速览（供实现者跳过重新分析）

`js/rules.js` 现有代码（截至本计划编写时，`validateFollow` 在文件第752-832行）：

- `_validateFollowStructure(followInSuit, handInSuit, ledType, trumpSuit)`（624-665行）：PAIR/TRIPLE/CONSEC_PAIRS/CONSEC_TRIPLES 分支，判断手里有没有能凑成的对子/三同张，有就强制跟牌里必须包含同等大小的成型组合；BOMB 分支转发给 `_validateBombFollowStructure`。
- `_validateBombFollowStructure(followInSuit, handInSuit, trumpSuit)`（671-703行）：按"炸弹 > 三同张+1 > 两对 > 一对+2单"的优先级层层强制。
- `_checkNoVoluntaryScore(followCards, pool, trumpSuit, isBeatingPlay)`（718-734行）：`isBeatingPlay` 为真时直接放行；否则数 `pool` 里有几张不计分牌，跟这次出牌张数比较，不够就要求"按分从小到大"顺序垫牌。
- `validateFollow` 的第819-822行（跟同花色/主牌）当前是：

```js
if (followInSuit.length > 0 && handInSuit.length > 0) {
    const [ok, err] = _checkNoVoluntaryScore(followInSuit, handInSuit, trumpSuit, isBeatingPlay);
    if (!ok) return [false, err];
}
```

问题：这里传入的候选池 `handInSuit` 是同花色/主牌的**全部**手牌，没有排除"配不成对、结构上根本不可能被用来跟牌"的零散单张。当玩家被规则1强制打出唯一的、恰好计分的对子/三同张/炸弹时，规则2会把手里配不成对的零散非计分单张也算作"你本可以少垫分的证据"，产生误判。完整背景、逐行验证过的机制、影响范围边界，见 `docs/superpowers/specs/2026-07-09-no-voluntary-score-structure-conflict-design.md`（已提交，commit `2983f15`）。

`getPairs`/`getTriples`/`getBombs`（141-193行）都是按 `pairKey`（`${suit}_${rank}`）分组——同一组内的牌 `scoreValue()`、`cardPower()` 必然完全相同。这意味着只要把传给 `_checkNoVoniture Score` 的候选池收窄为"结构规则实际允许使用的成型组合"，函数内部现成的"按(分值,牌力)排序取最小"逻辑不需要任何改动就能正确工作。

---

### Task 1: `_forcedGroupCards` 辅助函数 + 两次独立垫分检查 + 回归测试

> **修订说明（任务复查后发现设计缺陷，已修正）：** 本任务最初以 `_voluntaryScorePool`（收窄候选池、单次调用 `_checkNoVoluntaryScore`）实现并提交（commit `4d13691`），但任务复查子代理发现、并经人工手算独立复核确认：当结构强制的成型组合本身凑不够跟牌张数、还需要额外零散单张补位时（TRIPLE 回退到"对子+单张"、BOMB 回退到"对子+两张单张"等分支），原方案会把这些补位单张整体排除出候选池，即使它们别无选择、必须打出，导致 `_checkNoVoluntaryScore` 内 `actual`/`expected` 张数对不上、重新出现本任务要修的那类误判。下方 Step 1/Step 3 已更新为修正后的设计（详见 `docs/superpowers/specs/2026-07-09-no-voluntary-score-structure-conflict-design.md` "实现方案"一节的修订说明），后续执行者应直接实现本次更新后的版本，不要参照本文件修订前的历史版本。

**Files:**
- Modify: `js/rules.js`（新增 `_forcedGroupCards` 函数 + `validateFollow` 867-871行附近一处调用点替换为两次独立调用）
- Test: `test/fix11-voluntary-score-structure-conflict.mjs`（已有5个场景，本次追加3个新场景，共8个）

**Interfaces:**
- Consumes（`js/rules.js` 内已存在、无需改动的函数/常量）：
  - `getPairs(cards, trumpSuit) => Card[][]`（每个子数组是一组同 `pairKey` 的牌，长度≥2时取前2张）
  - `getTriples(cards, trumpSuit) => Card[][]`（长度≥3时取前3张）
  - `getBombs(cards, trumpSuit) => Card[][]`（长度≥4时取前4张）
  - `PlayType.{SINGLE,PAIR,TRIPLE,CONSEC_PAIRS,CONSEC_TRIPLES,BOMB}`（字符串常量）
  - `_checkNoVoluntaryScore(followCards, pool, trumpSuit, isBeatingPlay) => [boolean, string]`（签名不变，本次调用两次、不修改函数体）
- Produces（本任务新增，供 `validateFollow` 内部消费，不对外导出）：
  - `_forcedGroupCards(handInSuit, effectiveLedType, n, trumpSuit) => Card[]` — 返回结构规则强制使用的成型组合具体是哪些牌；不触发任何成型强制时返回空数组 `[]`（注意：不是 `handInSuit`，这是与旧版 `_voluntaryScorePool` 唯一的分支行为差异）。

- [ ] **Step 1: 更新测试文件为修正后的8个场景（5个既有场景保留 + 追加3个新场景），覆盖两次独立检查各自的正确性**

`test/fix11-voluntary-score-structure-conflict.mjs` 目前已有5个场景（rank 用 `'Q'` 而非早期草案的 `'2'`——因为 `getSuitOfCard` 把 `'2'` 恒判定为主牌花色，用真正的副牌点数 `'Q'` 才能正确测试"跟副牌"路径，这是原实现者已做的必要修正，予以保留）。把整个文件内容更新为下列完整版本（保留场景1-5，追加场景6/7/8：场景6/7 分别覆盖 TRIPLE/BOMB 强制成型本身凑不够张数、需要补位单张、且补位单张别无选择时不应误判；场景8 覆盖"补位单张本可以选更便宜的却选了计分牌"这条此前完全没有测试覆盖的新逻辑分支）：

```js
import assert from 'node:assert/strict';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';
import { validateFollow } from '../js/rules.js';

// 场景1（核心场景）：跟对子，同花色唯一的对子恰好是计分牌（一对K），
// 另有一张配不成对的零散非计分单张（Q）。玩家被迫出这对K，不应判"主动垫分"。
{
    const K1  = new Card(SUIT_SPADES, 'K');
    const K2  = new Card(SUIT_SPADES, 'K');
    const Q = new Card(SUIT_SPADES, 'Q');
    const ledCards     = [new Card(SUIT_SPADES, 'A'), new Card(SUIT_SPADES, 'A')];
    const hand         = [K1, K2, Q];
    const followCards  = [K1, K2];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 2);
    assert.equal(ok, true, `唯一的对子恰好计分、零散单张配不成对时，不应判违规，实际错误: ${err}`);
}

// 场景2（回归）：跟对子，手里有两对——一对非计分（Q）、一对计分（K）。
// 玩家出了计分的K对，本可以用非计分的Q对代替，仍应判"不能主动垫分牌"。
{
    const Q1 = new Card(SUIT_SPADES, 'Q');
    const Q2 = new Card(SUIT_SPADES, 'Q');
    const K1 = new Card(SUIT_SPADES, 'K');
    const K2 = new Card(SUIT_SPADES, 'K');
    const ledCards    = [new Card(SUIT_SPADES, 'A'), new Card(SUIT_SPADES, 'A')];
    const hand        = [Q1, Q2, K1, K2];
    const followCards = [K1, K2];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 2);
    assert.equal(ok, false, '有非计分对子可用时，出计分对子仍应判"不能主动垫分牌"');
    assert.equal(err, '不能主动垫分牌', `错误信息不符，实际: ${err}`);
}

// 场景3（TRIPLE 分支）：跟三同张，手里没有三同张，只有一对计分K + 两张
// 配不成对的零散非计分单张（J、Q）。玩家出"K对+其中一张单张"，不应判违规。
{
    const K1  = new Card(SUIT_SPADES, 'K');
    const K2  = new Card(SUIT_SPADES, 'K');
    const J   = new Card(SUIT_SPADES, 'J');
    const Q = new Card(SUIT_SPADES, 'Q');
    const ledCards = [
        new Card(SUIT_SPADES, 'A'), new Card(SUIT_SPADES, 'A'), new Card(SUIT_SPADES, 'A'),
    ];
    const hand        = [K1, K2, J, Q];
    const followCards = [K1, K2, J];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 3);
    assert.equal(ok, true, `无三同张、唯一的对子恰好计分时，不应判违规，实际错误: ${err}`);
}

// 场景4（BOMB 分支）：跟炸弹，手里凑不出炸弹/三同张/两对，只有一对计分K
// + 三张零散非计分单张（J、Q、A）。玩家出"K对+其中两张单张"，不应判违规。
{
    const K1  = new Card(SUIT_HEARTS, 'K');
    const K2  = new Card(SUIT_HEARTS, 'K');
    const J   = new Card(SUIT_HEARTS, 'J');
    const Q   = new Card(SUIT_HEARTS, 'Q');
    const Aa  = new Card(SUIT_HEARTS, 'A');
    const ledCards = [
        new Card(SUIT_HEARTS, '5'), new Card(SUIT_HEARTS, '5'),
        new Card(SUIT_HEARTS, '5'), new Card(SUIT_HEARTS, '5'),
    ];
    const hand        = [K1, K2, J, Q, Aa];
    const followCards = [K1, K2, J, Q];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 4);
    assert.equal(ok, true, `凑不出炸弹/三同张/两对、唯一的对子恰好计分时，不应判违规，实际错误: ${err}`);
}

// 场景5（垫异花色不受影响）：玩家手里完全没有led花色的牌，只能垫异花色。
// 异花色没有"必须成对"的结构限制，本该保持修复前后行为一致——
// 有非计分的异花色单张（方块J）可用时，出两张计分的异花色单张（方块K K）仍应判违规。
{
    const DK1 = new Card(SUIT_DIAMONDS, 'K');
    const DK2 = new Card(SUIT_DIAMONDS, 'K');
    const DJ  = new Card(SUIT_DIAMONDS, 'J');
    const ledCards    = [new Card(SUIT_CLUBS, 'Q'), new Card(SUIT_CLUBS, 'Q')];
    const hand        = [DK1, DK2, DJ];
    const followCards = [DK1, DK2];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 2);
    assert.equal(ok, false, '垫异花色时，有非计分单张可用仍出两张计分牌，应判违规（此路径不受本次修复影响）');
    assert.equal(err, '垫分牌须按分小牌小顺序', `错误信息不符，实际: ${err}`);
}

// 场景6（TRIPLE 分支，成型组合+补位单张全部被迫打出，无替代解）：
// 同花色恰好3张——一对计分K + 一张计分5，凑不出三同张，跟三同张时3张全部被迫打出。
// 补位单张（那张5）没有任何非计分替代（手牌已耗尽），不应判"主动垫分"。
{
    const K1 = new Card(SUIT_CLUBS, 'K');
    const K2 = new Card(SUIT_CLUBS, 'K');
    const C5 = new Card(SUIT_CLUBS, '5');
    const ledCards = [
        new Card(SUIT_CLUBS, 'A'), new Card(SUIT_CLUBS, 'A'), new Card(SUIT_CLUBS, 'A'),
    ];
    const hand        = [K1, K2, C5];
    const followCards = [K1, K2, C5];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 3);
    assert.equal(ok, true, `三同张回退到"对子+单张"、补位单张别无选择时，不应判违规，实际错误: ${err}`);
}

// 场景7（BOMB 分支，成型组合+2张补位单张全部被迫打出，无替代解）：
// 同花色恰好4张——一对计分K + 计分5 + 非计分J，凑不出炸弹/三同张/两对，
// 跟炸弹时4张全部被迫打出。补位单张（5、J）虽然J不计分，但因为是
// "全部被迫打出"（没有更多同花色牌可选），不应判"主动垫分"。
{
    const K1 = new Card(SUIT_CLUBS, 'K');
    const K2 = new Card(SUIT_CLUBS, 'K');
    const C5 = new Card(SUIT_CLUBS, '5');
    const CJ = new Card(SUIT_CLUBS, 'J');
    const ledCards = [
        new Card(SUIT_CLUBS, 'Q'), new Card(SUIT_CLUBS, 'Q'),
        new Card(SUIT_CLUBS, 'Q'), new Card(SUIT_CLUBS, 'Q'),
    ];
    const hand        = [K1, K2, C5, CJ];
    const followCards = [K1, K2, C5, CJ];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 4);
    assert.equal(ok, true, `凑不出炸弹/三同张/两对、补位单张全部被迫打出时，不应判违规，实际错误: ${err}`);
}

// 场景8（补位单张层级的"分小牌小"检查，新逻辑分支，此前无测试覆盖）：
// 同花色4张——一对计分K + 计分5 + 非计分J，凑不出三同张，跟三同张只需
// 3张，玩家选择"K对 + 计分5"，本可以选"K对 + 非计分J"，应判违规。
{
    const K1 = new Card(SUIT_CLUBS, 'K');
    const K2 = new Card(SUIT_CLUBS, 'K');
    const C5 = new Card(SUIT_CLUBS, '5');
    const CJ = new Card(SUIT_CLUBS, 'J');
    const ledCards = [
        new Card(SUIT_CLUBS, 'A'), new Card(SUIT_CLUBS, 'A'), new Card(SUIT_CLUBS, 'A'),
    ];
    const hand        = [K1, K2, C5, CJ];
    const followCards = [K1, K2, C5];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 3);
    assert.equal(ok, false, '补位单张有非计分可选（J）却选了计分的5，应判"不能主动垫分牌"');
    assert.equal(err, '不能主动垫分牌', `错误信息不符，实际: ${err}`);
}

console.log('PASS: fix11-voluntary-score-structure-conflict');
```

- [ ] **Step 2: 运行测试，确认新增场景在当前（修复前）实现下失败**

Run: `node test/fix11-voluntary-score-structure-conflict.mjs`

Expected: FAIL —— 场景6在 `assert.equal(ok, true, ...)` 处抛出 `AssertionError`（当前 `_voluntaryScorePool` 对 TRIPLE 回退到"对子"分支返回 `pairsAvail.flat()`，即只有 `[K1,K2]`，丢弃了补位单张 `C5`；`_checkNoVoluntaryScore` 内 `actual`——来自完整 `followCards=[K1,K2,C5]`，长度3——与 `expected`——来自收窄后长度2的池切片——张数对不上，误判违规）。脚本在场景6处中断，场景7/8此时不会被执行到——这是预期行为，等 Step 3 的实现修好后才会跑到底。

- [ ] **Step 3: 用 `_forcedGroupCards` 替换 `_voluntaryScorePool`，调用点改为两次独立检查**

在 `js/rules.js` 中，找到现有的 `_voluntaryScorePool` 函数（紧邻 `_checkNoVoluntaryScore` 之后、`validateFollow` 之前），整体替换为：

```js
/**
 * 计算"不能主动垫分牌"检查中，结构规则强制玩家使用的那组成型组合
 * （对子/三同张/炸弹）具体是哪些牌。分支逐一镜像 _validateFollowStructure /
 * _validateBombFollowStructure 的既有强制条件，保证识别范围与结构规则
 * 实际强制的范围完全一致。返回空数组表示当前 effectiveLedType 不触发
 * 任何成型强制（例如 SINGLE），跟牌张数里没有必须原样保留的"组"。
 * @param {Card[]} handInSuit
 * @param {string} effectiveLedType
 * @param {number} n - followInSuit.length（本次同花色/主牌实际出牌张数）
 * @param {string|null} trumpSuit
 * @returns {Card[]}
 */
function _forcedGroupCards(handInSuit, effectiveLedType, n, trumpSuit) {
    if (effectiveLedType === PlayType.PAIR ||
        effectiveLedType === PlayType.CONSEC_PAIRS ||
        effectiveLedType === PlayType.CONSEC_TRIPLES) {
        const pairsAvail = getPairs(handInSuit, trumpSuit);
        if (pairsAvail.length > 0 && n >= 2) return pairsAvail.flat();
        return [];
    }

    if (effectiveLedType === PlayType.TRIPLE) {
        const triplesAvail = getTriples(handInSuit, trumpSuit);
        if (triplesAvail.length > 0 && n >= 3) return triplesAvail.flat();
        const pairsAvail = getPairs(handInSuit, trumpSuit);
        if (pairsAvail.length > 0 && n >= 2) return pairsAvail.flat();
        return [];
    }

    if (effectiveLedType === PlayType.BOMB) {
        const bombsAvail = getBombs(handInSuit, trumpSuit);
        if (bombsAvail.length > 0 && n >= 4) return bombsAvail.flat();
        const triplesAvail = getTriples(handInSuit, trumpSuit);
        if (triplesAvail.length > 0 && n >= 3) return triplesAvail.flat();
        const pairsAvail = getPairs(handInSuit, trumpSuit);
        if (pairsAvail.length >= 2 && n >= 4) return pairsAvail.flat();
        if (pairsAvail.length >= 1 && n >= 2) return pairsAvail.flat();
        return [];
    }

    return [];
}
```

然后把 `validateFollow` 里现有的（跟同花色/主牌那处调用点，紧接着"能压必压"检查之后）：

```js
if (followInSuit.length > 0 && handInSuit.length > 0) {
    const pool = _voluntaryScorePool(handInSuit, effectiveLedType, followInSuit.length, trumpSuit);
    const [ok, err] = _checkNoVoluntaryScore(followInSuit, pool, trumpSuit, isBeatingPlay);
    if (!ok) return [false, err];
}
```

替换为：

```js
if (followInSuit.length > 0 && handInSuit.length > 0) {
    const groupCards   = _forcedGroupCards(handInSuit, effectiveLedType, followInSuit.length, trumpSuit);
    const followGroup  = followInSuit.filter(c => groupCards.includes(c));
    const followFiller = followInSuit.filter(c => !groupCards.includes(c));
    const handFiller   = handInSuit.filter(c => !groupCards.includes(c));

    const [groupOk, groupErr] = _checkNoVoluntaryScore(followGroup, groupCards, trumpSuit, isBeatingPlay);
    if (!groupOk) return [false, groupErr];

    const [fillerOk, fillerErr] = _checkNoVoluntaryScore(followFiller, handFiller, trumpSuit, isBeatingPlay);
    if (!fillerOk) return [false, fillerErr];
}
```

（紧随其后的"垫异花色"调用点，即 `_checkNoVoluntaryScore(followOffSuit, handOffSuit, trumpSuit, isBeatingPlay)` 这一处，原样保留，不做任何修改。）

- [ ] **Step 4: 运行测试，确认全部8个场景通过**

Run: `node test/fix11-voluntary-score-structure-conflict.mjs`

Expected: `PASS: fix11-voluntary-score-structure-conflict`（8个场景全部通过，无 AssertionError）

- [ ] **Step 5: 运行完整回归套件，确认无既有测试被破坏**

Run: `node test/fix1-does-beat.mjs && node test/fix2-trump-pair-order.mjs && node test/fix3-can-player-beat.mjs && node test/fix4-no-voluntary-score.mjs && node test/fix5-follow-n-same.mjs && node test/fix6-ai-safety-net.mjs && node test/fix11-voluntary-score-structure-conflict.mjs`

Expected: 7个 `PASS: ...` 输出，无失败。

- [ ] **Step 6: 提交**

```bash
git add js/rules.js test/fix11-voluntary-score-structure-conflict.mjs
git commit -m "$(cat <<'EOF'
fix: 修复垫分检查在成型组合需补位单张时的候选池误判

_voluntaryScorePool（commit 4d13691）在结构强制的成型组合凑不够跟牌
张数、还需零散单张补位时（TRIPLE 回退到对子+单张、BOMB 回退到
对子+两张单张等分支），会把这些补位单张整体排除出候选池，导致
_checkNoVoluntaryScore 内 actual/expected 张数对不上，即使补位单张
别无选择也会被误判"不能主动垫分牌"。改为 _forcedGroupCards，只负责
识别"结构规则强制使用的成型组合具体是哪些牌"，调用处拆成两次独立的
_checkNoVoluntaryScore 调用——一次检查成型组合本身，一次检查补位
单张——两次都复用未改动的 _checkNoVoluntaryScore 本体。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `_partitionByPairKeyCounts` 辅助函数 + `_checkNoVoluntaryScore` 按值比较 + 重复pairKey回归测试（Fix Round 2）

**背景：** Task 1 复查后再次复核发现一个独立于"补位单张"问题的 Critical bug——当玩家手里同一花色内、同一点数的牌（同 `pairKey`）数量**超过**结构规则实际要求使用的张数时（例如手里有3张同花色K，结构规则只强制用其中2张凑一对），出这些牌中任意等价的组合本该同样合规，但 `validateFollow` 里"成型组合 vs 补位单张"的划分（`.includes()`，对象引用）和 `_checkNoVoluntaryScore` 内部 `expected`/`actual` 逐张比较（`!==`，对象引用）都要求"恰好是内部固定选中的那几个具体对象"，换一张同 pairKey 的等价牌就会被误判违规。完整根因分析、影响范围、方案取舍见 `docs/superpowers/specs/2026-07-09-no-voluntary-score-structure-conflict-design.md` "Fix Round 2"一节。

**Files:**
- Modify: `js/rules.js`（`_checkNoVoluntaryScore` 内一行比较逻辑改为按值比较；新增 `_partitionByPairKeyCounts` 函数；`validateFollow` 866-877行附近的调用点替换为使用新函数）
- Test: `test/fix11-voluntary-score-structure-conflict.mjs`（已有8个场景，本次追加6个新场景，共14个）

**Interfaces:**
- Consumes（`js/rules.js` 内已存在、无需改动的函数/常量）：
  - `pairKey(card, trumpSuit) => string`（`${card.suit}_${card.rank}`，`trumpSuit` 参数被忽略）
  - `cardPower(card, trumpSuit, playOrder = 0) => number`（本次调用均不传 `playOrder`，恒为默认值0）
  - `_forcedGroupCards(handInSuit, effectiveLedType, n, trumpSuit) => Card[]`（Task 1 产物，签名和行为均不变，本任务直接复用其返回值作为 `_partitionByPairKeyCounts` 的 `requiredCards` 参数）
- Produces（本任务新增，供 `validateFollow` 内部消费，不对外导出）：
  - `_partitionByPairKeyCounts(cards, requiredCards, trumpSuit) => [Card[], Card[]]` — 返回 `[matched, rest]`：按 `pairKey` 计数（而非对象引用）把 `cards` 划分成"命中 `requiredCards` 名额"和"其余"两部分。
- 修改（`_checkNoVoluntaryScore` 对外签名 `(followCards, pool, trumpSuit, isBeatingPlay) => [boolean, string]` 不变，仅内部第730行比较逻辑改为按值比较，改动范围见 Step 3）。

- [ ] **Step 1: 更新测试文件为14个场景（8个既有场景保留 + 追加6个新场景，覆盖重复 pairKey 换牌不应误判）**

把 `test/fix11-voluntary-score-structure-conflict.mjs` 整个文件内容更新为下列完整版本（保留场景1-8，追加场景9-14）：

```js
import assert from 'node:assert/strict';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';
import { validateFollow } from '../js/rules.js';

// 场景1（核心场景）：跟对子，同花色唯一的对子恰好是计分牌（一对K），
// 另有一张配不成对的零散非计分单张（Q）。玩家被迫出这对K，不应判"主动垫分"。
{
    const K1  = new Card(SUIT_SPADES, 'K');
    const K2  = new Card(SUIT_SPADES, 'K');
    const Q = new Card(SUIT_SPADES, 'Q');
    const ledCards     = [new Card(SUIT_SPADES, 'A'), new Card(SUIT_SPADES, 'A')];
    const hand         = [K1, K2, Q];
    const followCards  = [K1, K2];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 2);
    assert.equal(ok, true, `唯一的对子恰好计分、零散单张配不成对时，不应判违规，实际错误: ${err}`);
}

// 场景2（回归）：跟对子，手里有两对——一对非计分（Q）、一对计分（K）。
// 玩家出了计分的K对，本可以用非计分的Q对代替，仍应判"不能主动垫分牌"。
{
    const Q1 = new Card(SUIT_SPADES, 'Q');
    const Q2 = new Card(SUIT_SPADES, 'Q');
    const K1 = new Card(SUIT_SPADES, 'K');
    const K2 = new Card(SUIT_SPADES, 'K');
    const ledCards    = [new Card(SUIT_SPADES, 'A'), new Card(SUIT_SPADES, 'A')];
    const hand        = [Q1, Q2, K1, K2];
    const followCards = [K1, K2];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 2);
    assert.equal(ok, false, '有非计分对子可用时，出计分对子仍应判"不能主动垫分牌"');
    assert.equal(err, '不能主动垫分牌', `错误信息不符，实际: ${err}`);
}

// 场景3（TRIPLE 分支）：跟三同张，手里没有三同张，只有一对计分K + 两张
// 配不成对的零散非计分单张（J、Q）。玩家出"K对+其中一张单张"，不应判违规。
{
    const K1  = new Card(SUIT_SPADES, 'K');
    const K2  = new Card(SUIT_SPADES, 'K');
    const J   = new Card(SUIT_SPADES, 'J');
    const Q = new Card(SUIT_SPADES, 'Q');
    const ledCards = [
        new Card(SUIT_SPADES, 'A'), new Card(SUIT_SPADES, 'A'), new Card(SUIT_SPADES, 'A'),
    ];
    const hand        = [K1, K2, J, Q];
    const followCards = [K1, K2, J];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 3);
    assert.equal(ok, true, `无三同张、唯一的对子恰好计分时，不应判违规，实际错误: ${err}`);
}

// 场景4（BOMB 分支）：跟炸弹，手里凑不出炸弹/三同张/两对，只有一对计分K
// + 三张零散非计分单张（J、Q、A）。玩家出"K对+其中两张单张"，不应判违规。
{
    const K1  = new Card(SUIT_HEARTS, 'K');
    const K2  = new Card(SUIT_HEARTS, 'K');
    const J   = new Card(SUIT_HEARTS, 'J');
    const Q   = new Card(SUIT_HEARTS, 'Q');
    const Aa  = new Card(SUIT_HEARTS, 'A');
    const ledCards = [
        new Card(SUIT_HEARTS, '5'), new Card(SUIT_HEARTS, '5'),
        new Card(SUIT_HEARTS, '5'), new Card(SUIT_HEARTS, '5'),
    ];
    const hand        = [K1, K2, J, Q, Aa];
    const followCards = [K1, K2, J, Q];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 4);
    assert.equal(ok, true, `凑不出炸弹/三同张/两对、唯一的对子恰好计分时，不应判违规，实际错误: ${err}`);
}

// 场景5（垫异花色不受影响）：玩家手里完全没有led花色的牌，只能垫异花色。
// 异花色没有"必须成对"的结构限制，本该保持修复前后行为一致——
// 有非计分的异花色单张（方块J）可用时，出两张计分的异花色单张（方块K K）仍应判违规。
{
    const DK1 = new Card(SUIT_DIAMONDS, 'K');
    const DK2 = new Card(SUIT_DIAMONDS, 'K');
    const DJ  = new Card(SUIT_DIAMONDS, 'J');
    const ledCards    = [new Card(SUIT_CLUBS, 'Q'), new Card(SUIT_CLUBS, 'Q')];
    const hand        = [DK1, DK2, DJ];
    const followCards = [DK1, DK2];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 2);
    assert.equal(ok, false, '垫异花色时，有非计分单张可用仍出两张计分牌，应判违规（此路径不受本次修复影响）');
    assert.equal(err, '垫分牌须按分小牌小顺序', `错误信息不符，实际: ${err}`);
}

// 场景6（TRIPLE 分支，成型组合+补位单张全部被迫打出，无替代解）：
// 同花色恰好3张——一对计分K + 一张计分5，凑不出三同张，跟三同张时3张全部被迫打出。
// 补位单张（那张5）没有任何非计分替代（手牌已耗尽），不应判"主动垫分"。
{
    const K1 = new Card(SUIT_CLUBS, 'K');
    const K2 = new Card(SUIT_CLUBS, 'K');
    const C5 = new Card(SUIT_CLUBS, '5');
    const ledCards = [
        new Card(SUIT_CLUBS, 'A'), new Card(SUIT_CLUBS, 'A'), new Card(SUIT_CLUBS, 'A'),
    ];
    const hand        = [K1, K2, C5];
    const followCards = [K1, K2, C5];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 3);
    assert.equal(ok, true, `三同张回退到"对子+单张"、补位单张别无选择时，不应判违规，实际错误: ${err}`);
}

// 场景7（BOMB 分支，成型组合+2张补位单张全部被迫打出，无替代解）：
// 同花色恰好4张——一对计分K + 计分5 + 非计分J，凑不出炸弹/三同张/两对，
// 跟炸弹时4张全部被迫打出。补位单张（5、J）虽然J不计分，但因为是
// "全部被迫打出"（没有更多同花色牌可选），不应判"主动垫分"。
{
    const K1 = new Card(SUIT_CLUBS, 'K');
    const K2 = new Card(SUIT_CLUBS, 'K');
    const C5 = new Card(SUIT_CLUBS, '5');
    const CJ = new Card(SUIT_CLUBS, 'J');
    const ledCards = [
        new Card(SUIT_CLUBS, 'Q'), new Card(SUIT_CLUBS, 'Q'),
        new Card(SUIT_CLUBS, 'Q'), new Card(SUIT_CLUBS, 'Q'),
    ];
    const hand        = [K1, K2, C5, CJ];
    const followCards = [K1, K2, C5, CJ];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 4);
    assert.equal(ok, true, `凑不出炸弹/三同张/两对、补位单张全部被迫打出时，不应判违规，实际错误: ${err}`);
}

// 场景8（补位单张层级的"分小牌小"检查，新逻辑分支，此前无测试覆盖）：
// 同花色4张——一对计分K + 计分5 + 非计分J，凑不出三同张，跟三同张只需
// 3张，玩家选择"K对 + 计分5"，本可以选"K对 + 非计分J"，应判违规。
{
    const K1 = new Card(SUIT_CLUBS, 'K');
    const K2 = new Card(SUIT_CLUBS, 'K');
    const C5 = new Card(SUIT_CLUBS, '5');
    const CJ = new Card(SUIT_CLUBS, 'J');
    const ledCards = [
        new Card(SUIT_CLUBS, 'A'), new Card(SUIT_CLUBS, 'A'), new Card(SUIT_CLUBS, 'A'),
    ];
    const hand        = [K1, K2, C5, CJ];
    const followCards = [K1, K2, C5];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 3);
    assert.equal(ok, false, '补位单张有非计分可选（J）却选了计分的5，应判"不能主动垫分牌"');
    assert.equal(err, '不能主动垫分牌', `错误信息不符，实际: ${err}`);
}

// 场景9（PAIR，跳过中间那张 K1,K3）：同花色 K♠K♠K♠ 三张 + 配不成对的 Q，
// 跟对子，玩家出 K1、K3（跳过 _forcedGroupCards 内部固定选中的 K2）。应放行。
{
    const K1 = new Card(SUIT_SPADES, 'K');
    const K2 = new Card(SUIT_SPADES, 'K');
    const K3 = new Card(SUIT_SPADES, 'K');
    const Q  = new Card(SUIT_SPADES, 'Q');
    const ledCards    = [new Card(SUIT_SPADES, 'A'), new Card(SUIT_SPADES, 'A')];
    const hand        = [K1, K2, K3, Q];
    const followCards = [K1, K3];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 2);
    assert.equal(ok, true, `同 pairKey 有3张时，跳过中间那张仍应放行，实际错误: ${err}`);
}

// 场景10（PAIR，跳过第一张 K2,K3）：同一手牌，玩家出 K2、K3
// （跳过内部固定选中的 K1）。应放行——与场景9互补，验证不同的
// "跳过哪一张"都不应触发误判。
{
    const K1 = new Card(SUIT_SPADES, 'K');
    const K2 = new Card(SUIT_SPADES, 'K');
    const K3 = new Card(SUIT_SPADES, 'K');
    const Q  = new Card(SUIT_SPADES, 'Q');
    const ledCards    = [new Card(SUIT_SPADES, 'A'), new Card(SUIT_SPADES, 'A')];
    const hand        = [K1, K2, K3, Q];
    const followCards = [K2, K3];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 2);
    assert.equal(ok, true, `同 pairKey 有3张时，跳过第一张仍应放行，实际错误: ${err}`);
}

// 场景11（TRIPLE，恰好3张、顺序打乱）：同花色恰好3张K，无多余，
// 跟三同张，三张全出但传入顺序是 [K3,K1,K2]。应放行——这是唯一
// 单独隔离验证改动1本身的场景（划分逻辑没有歧义，3张全是成型组合）。
{
    const K1 = new Card(SUIT_SPADES, 'K');
    const K2 = new Card(SUIT_SPADES, 'K');
    const K3 = new Card(SUIT_SPADES, 'K');
    const ledCards = [
        new Card(SUIT_SPADES, 'A'), new Card(SUIT_SPADES, 'A'), new Card(SUIT_SPADES, 'A'),
    ];
    const hand        = [K1, K2, K3];
    const followCards = [K3, K1, K2];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 3);
    assert.equal(ok, true, `恰好3张、出牌顺序打乱时仍应放行，实际错误: ${err}`);
}

// 场景12（PAIR，两个不同 pairKey 都计分：5对 vs K对）：手里有一对5
// （5分）和一对K（10分），跟对子，玩家出K对。应判"垫分牌须按分小牌小
// 顺序"违规——验证改动1没有削弱"该选更便宜却没选"的检测，且这个场景
// 真正走到第730行的排序/比较逻辑（不像场景2那样在更早的"不计分牌数量"
// 短路检查就提前返回，因为5和K都计分，nonScore恒为空）。
{
    const S5a = new Card(SUIT_SPADES, '5');
    const S5b = new Card(SUIT_SPADES, '5');
    const K1  = new Card(SUIT_SPADES, 'K');
    const K2  = new Card(SUIT_SPADES, 'K');
    const ledCards    = [new Card(SUIT_SPADES, 'A'), new Card(SUIT_SPADES, 'A')];
    const hand        = [S5a, S5b, K1, K2];
    const followCards = [K1, K2];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 2);
    assert.equal(ok, false, '有分值更小的对子（5）可用时，出分值更大的对子（K）应判违规');
    assert.equal(err, '垫分牌须按分小牌小顺序', `错误信息不符，实际: ${err}`);
}

// 场景13（CONSEC_PAIRS，跳过一张）：连对（K-Q，副牌，SIDE_RANK_STEP
// K=4/Q=3 相邻）——手里K有三张、Q恰好两张，跟连对，玩家出
// [K2,K3,Q1,Q2]（跳过内部固定选中的 K1）。应放行。
{
    const K1 = new Card(SUIT_SPADES, 'K');
    const K2 = new Card(SUIT_SPADES, 'K');
    const K3 = new Card(SUIT_SPADES, 'K');
    const Q1 = new Card(SUIT_SPADES, 'Q');
    const Q2 = new Card(SUIT_SPADES, 'Q');
    const ledCards = [
        new Card(SUIT_SPADES, 'Q'), new Card(SUIT_SPADES, 'Q'),
        new Card(SUIT_SPADES, 'K'), new Card(SUIT_SPADES, 'K'),
    ];
    const hand        = [K1, K2, K3, Q1, Q2];
    const followCards = [K2, K3, Q1, Q2];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 4);
    assert.equal(ok, true, `连对场景下跳过重复pairKey中的一张仍应放行，实际错误: ${err}`);
}

// 场景14（垫异花色，重复pairKey换牌）：玩家手里完全没有led花色的牌，
// 被迫垫异花色，异花色恰好3张同点数非主牌牌（互相等价，无不计分替代），
// 跟牌张数2，玩家出其中两张（跳过中间那张）。应放行——此场景不涉及
// _forcedGroupCards/改动2（异花色没有"组"划分），单独验证改动1修复了
// 垫异花色这条路径。
{
    const D5a = new Card(SUIT_DIAMONDS, '5');
    const D5b = new Card(SUIT_DIAMONDS, '5');
    const D5c = new Card(SUIT_DIAMONDS, '5');
    const ledCards    = [new Card(SUIT_CLUBS, 'Q'), new Card(SUIT_CLUBS, 'Q')];
    const hand        = [D5a, D5b, D5c];
    const followCards = [D5a, D5c];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, [], 2);
    assert.equal(ok, true, `垫异花色时，跳过重复pairKey中间那张仍应放行，实际错误: ${err}`);
}

console.log('PASS: fix11-voluntary-score-structure-conflict');
```

- [ ] **Step 2: 运行测试，确认新增场景在当前（Fix Round 1，commit `784a78a`）实现下失败**

Run: `node test/fix11-voluntary-score-structure-conflict.mjs`

Expected: FAIL —— 场景按顺序执行，脚本在第一个失败的断言处抛出 `AssertionError` 并中断，之后的场景不会被执行到（等 Step 3 修好后才会跑到底）：
- 场景9在 `assert.equal(ok, true, ...)` 处失败，实际 `err` 为 `'不能主动垫分牌'`（`.includes()` 按引用划分把 K3 错误地划进"补位单张"，`handFiller=[K3,Q]` 里非计分牌数量(1)已经 `>= n(1)`，在 `_checkNoVoluntaryScore` 第723行短路返回违规）。
- （单独运行到场景10/11/13时）会在 `assert.equal(ok, true, ...)` 处失败，实际 `err` 为 `'垫分牌须按分小牌小顺序'`（第730行 `c !== expected[i]` 按引用比较，把"同 pairKey 但不同对象"的等价牌判定为不同）。
- （单独运行到场景12时）已经通过——这是纯粹的回归守护场景，Fix Round 1 的代码在这个输入上行为已经正确，不属于本轮要修的 RED 阶段失败。
- （单独运行到场景14时）会在 `assert.equal(ok, true, ...)` 处失败，实际 `err` 为 `'垫分牌须按分小牌小顺序'`（同样是第730行引用比较，这条路径不经过 `_forcedGroupCards`/划分逻辑，纯粹暴露 `_checkNoVoluntaryScore` 本体的引用比较问题）。

- [ ] **Step 3: `_checkNoVoluntaryScore` 改为按值比较 + 新增 `_partitionByPairKeyCounts` + 替换调用点**

在 `js/rules.js` 中，找到 `_checkNoVoluntaryScore` 函数体内以下这一段（约第728-731行）：

```js
    if (actual.length !== expected.length || actual.some((c, i) => c !== expected[i])) {
        return [false, '垫分牌须按分小牌小顺序'];
    }
```

替换为：

```js
    const sameRank = (a, b) =>
        a.scoreValue() === b.scoreValue() && cardPower(a, trumpSuit) === cardPower(b, trumpSuit);
    if (actual.length !== expected.length || actual.some((c, i) => !sameRank(c, expected[i]))) {
        return [false, '垫分牌须按分小牌小顺序'];
    }
```

然后在 `_forcedGroupCards` 函数之后（`validateFollow` 之前），新增：

```js
/**
 * 按 pairKey 计数（而非对象引用）把 cards 划分成"命中 requiredCards 名额"
 * 和"其余"两部分。避免同一 pairKey 有多张物理牌时，_forcedGroupCards
 * 固定选中的具体对象与玩家实际打出的对象不一致导致误判——只要 pairKey
 * 相同就算命中名额，不要求是同一个对象。
 * @param {Card[]} cards
 * @param {Card[]} requiredCards
 * @param {string|null} trumpSuit
 * @returns {[Card[], Card[]]} [matched, rest]
 */
function _partitionByPairKeyCounts(cards, requiredCards, trumpSuit) {
    const remaining = new Map();
    for (const c of requiredCards) {
        const key = pairKey(c, trumpSuit);
        remaining.set(key, (remaining.get(key) ?? 0) + 1);
    }
    const matched = [];
    const rest = [];
    for (const c of cards) {
        const key = pairKey(c, trumpSuit);
        const left = remaining.get(key) ?? 0;
        if (left > 0) {
            matched.push(c);
            remaining.set(key, left - 1);
        } else {
            rest.push(c);
        }
    }
    return [matched, rest];
}
```

最后把 `validateFollow` 里 Task 1 写入的（跟同花色/主牌那处调用点）：

```js
if (followInSuit.length > 0 && handInSuit.length > 0) {
    const groupCards   = _forcedGroupCards(handInSuit, effectiveLedType, followInSuit.length, trumpSuit);
    const followGroup  = followInSuit.filter(c => groupCards.includes(c));
    const followFiller = followInSuit.filter(c => !groupCards.includes(c));
    const handFiller   = handInSuit.filter(c => !groupCards.includes(c));

    const [groupOk, groupErr] = _checkNoVoluntaryScore(followGroup, groupCards, trumpSuit, isBeatingPlay);
    if (!groupOk) return [false, groupErr];

    const [fillerOk, fillerErr] = _checkNoVoluntaryScore(followFiller, handFiller, trumpSuit, isBeatingPlay);
    if (!fillerOk) return [false, fillerErr];
}
```

替换为：

```js
if (followInSuit.length > 0 && handInSuit.length > 0) {
    const groupCards = _forcedGroupCards(handInSuit, effectiveLedType, followInSuit.length, trumpSuit);
    const [followGroup, followFiller] = _partitionByPairKeyCounts(followInSuit, groupCards, trumpSuit);
    const [, handFiller] = _partitionByPairKeyCounts(handInSuit, groupCards, trumpSuit);

    const [groupOk, groupErr] = _checkNoVoluntaryScore(followGroup, groupCards, trumpSuit, isBeatingPlay);
    if (!groupOk) return [false, groupErr];

    const [fillerOk, fillerErr] = _checkNoVoluntaryScore(followFiller, handFiller, trumpSuit, isBeatingPlay);
    if (!fillerOk) return [false, fillerErr];
}
```

（紧随其后的"垫异花色"调用点，即 `_checkNoVoluntaryScore(followOffSuit, handOffSuit, trumpSuit, isBeatingPlay)` 这一处，原样保留，不做任何修改——它不需要按 pairKey 划分，但会自动受益于 `_checkNoVoluntaryScore` 本体的按值比较修复。）

- [ ] **Step 4: 运行测试，确认全部14个场景通过**

Run: `node test/fix11-voluntary-score-structure-conflict.mjs`

Expected: `PASS: fix11-voluntary-score-structure-conflict`（14个场景全部通过，无 AssertionError）

- [ ] **Step 5: 运行完整回归套件，确认无既有测试被破坏**

Run: `node test/fix1-does-beat.mjs && node test/fix2-trump-pair-order.mjs && node test/fix3-can-player-beat.mjs && node test/fix4-no-voluntary-score.mjs && node test/fix5-follow-n-same.mjs && node test/fix6-ai-safety-net.mjs && node test/fix11-voluntary-score-structure-conflict.mjs`

Expected: 7个 `PASS: ...` 输出，无失败。

- [ ] **Step 6: 提交**

```bash
git add js/rules.js test/fix11-voluntary-score-structure-conflict.mjs
git commit -m "$(cat <<'EOF'
fix: 修复垫分检查对同pairKey重复牌的引用比较误判

_forcedGroupCards（Fix Round 1）依赖 getPairs/getTriples/getBombs 固定
截取分组内"前N张"作为成型组合；validateFollow 调用点用对象引用
（.includes()）划分"成型组合 vs 补位单张"；_checkNoVoluntaryScore 内部
expected/actual 逐张比较又用引用比较（!==）。三处叠加导致：当同一花色
同点数的牌数量超过结构规则实际需要的张数时，换一张同pairKey的等价牌出
会被误判"不能主动垫分牌"或"垫分牌须按分小牌小顺序"。

修复：_checkNoVoluntaryScore 第730行改为按(scoreValue,cardPower)值比较
（sameRank），与其排序逻辑用的键保持一致；新增 _partitionByPairKeyCounts
按 pairKey 计数（而非对象引用）划分成型组合与补位单张，替换 validateFollow
里跟同花色/主牌那两处调用点的引用划分。垫异花色调用点不改代码，但受益
于 _checkNoVoluntaryScore 本体的按值比较修复。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

> **修订说明：** 下方 Self-Review 写于最初的 `_voluntaryScorePool`（单次调用）版本提交之时；任务复查发现该版本的填充单张场景有回归后，Task 1 已按上方修订说明整体改为 `_forcedGroupCards`（两次独立调用）设计并追加场景6/7/8。本节结论对修订后的版本同样成立（详见修订后的 Step 1/Step 3 与规格文档"实现方案"一节），未重新逐条重写，仅在此记录修订事实以避免误读为遗漏复查。

**Spec coverage：** 逐一对照 `docs/superpowers/specs/2026-07-09-no-voluntary-score-structure-conflict-design.md`：
- "实现方案"一节的 `_forcedGroupCards` 完整代码、`validateFollow` 两次独立调用点替换 —— Task 1 Step 3 逐字采用。
- "测试计划"一节的场景 —— Task 1 Step 1 逐一实现（核心场景/回归场景/TRIPLE分支/BOMB分支/异花色不受影响，以及修订后追加的 TRIPLE 全补位/BOMB 全补位/补位层级分小牌小 三个场景）。
- "影响范围边界"（只影响跟同花色/主牌一侧、只影响 PAIR/TRIPLE/CONSEC_PAIRS/CONSEC_TRIPLES/BOMB）—— 体现在 Global Constraints 与 `_forcedGroupCards` 的分支设计中（SINGLE 及未匹配到的类型直接 `return []`，两次调用退化为等价于修复前的单次调用，等价于不介入）。
- "不在本次修复范围内"（CONSEC_TRIPLES 复用 pairsAvail 的疑似问题、~14%未定位的"必须跟X花色"失败类别）—— 已写入 Global Constraints 作为明确的不变更边界，不额外处理。
未发现遗漏。

**Placeholder scan：** 全文搜索确认无 TBD/待定/"参考场景N实现"之类占位——8个测试场景、`_forcedGroupCards` 实现、调用点替换均为可直接使用的完整代码。

**Type consistency：** `_forcedGroupCards(handInSuit, effectiveLedType, n, trumpSuit)` 的参数顺序、类型在"新增函数"代码块和"调用点替换"代码块中一致；`getPairs`/`getTriples`/`getBombs` 的返回类型（`Card[][]`，`.flat()` 后变 `Card[]`）与 `_checkNoVoluntaryScore` 期望的 `pool: Card[]` 参数类型一致。测试文件里的 `Card`/`SUIT_*` 导入名称与 `js/card.js` 现有导出一致（沿用 fix4/fix5 测试已验证过的导入方式）。

Task 1/Task 2 之间无跨任务命名一致性风险（`_forcedGroupCards` 的签名和调用方式在两个任务里完全一致，Task 2 只改了它的调用点包装方式，未改它本身）。

**Task 2 Self-Review：**

**Spec coverage：** 逐一对照 `docs/superpowers/specs/2026-07-09-no-voluntary-score-structure-conflict-design.md` "Fix Round 2"一节：
- "实现方案"改动1（`_checkNoVoluntaryScore` 第730行 `sameRank` 按值比较）—— Task 2 Step 3 逐字采用。
- "实现方案"改动2（新增 `_partitionByPairKeyCounts`、替换调用点引用划分）—— Task 2 Step 3 逐字采用。
- "影响范围（对此前结论的更正）"（垫异花色调用点不改代码、但受益于改动1，此前遗漏的测试覆盖需补上）—— 体现为 Task 2 Step 3 明确保留该调用点不变的说明，以及场景14。
- "测试计划（追加场景9-14）"—— Task 2 Step 1 逐一实现，场景9/10 互补覆盖两个不同的旧失败点、场景11 隔离验证改动1、场景13 覆盖此前完全没有测试覆盖的 CONSEC_PAIRS 分支、场景14 覆盖垫异花色路径。**唯一偏离设计文档字面描述之处**：设计文档"测试计划"一节把场景12的预期错误信息描述为"不能主动垫分牌"，经逐行手算验证（5和K都计分，`nonScore` 恒为空，永远走不到第723行的短路），真正触发的是第730行的排序比较，正确错误信息应为"垫分牌须按分小牌小顺序"——Task 2 Step 1 的测试代码已按验证后的正确值编写，未照抄设计文档这一处字面描述。
- "为什么改动1和改动2用不同的判据"、"`cardPower` 的 `playOrder` 参数排查"、"方案取舍"三节均为设计论证性内容，不对应可执行的实现步骤，无需单独落地任务。
未发现遗漏。

**Placeholder scan：** 全文搜索确认无 TBD/待定——6个新增测试场景、`sameRank` 改动、`_partitionByPairKeyCounts` 实现、调用点替换均为可直接使用的完整代码。

**Type consistency：** `_partitionByPairKeyCounts(cards, requiredCards, trumpSuit) => [Card[], Card[]]` 的参数顺序、返回值解构在 Step 3 的实现代码块和调用点替换代码块中一致（调用点两处分别用 `[followGroup, followFiller]` 和 `[, handFiller]` 解构，与函数固定返回 `[matched, rest]` 的顺序对应）；`sameRank(a, b)` 内部使用的 `cardPower(a, trumpSuit)`/`cardPower(b, trumpSuit)` 与 `_checkNoVoluntaryScore` 现有 `scoreSorter` 使用的 `cardPower` 调用方式（不传 `playOrder`）一致，避免排序键和相等判据不一致。测试文件新增场景延续场景1-8已用过的 `Card`/`SUIT_*` 导入和 `validateFollow` 调用签名，无新增导入需求。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-09-no-voluntary-score-structure-conflict.md`。现在共有两个任务：Task 1（`_forcedGroupCards` + 两次独立垫分检查，已完成并提交，commit `784a78a`）、Task 2（`_partitionByPairKeyCounts` + 按值比较，Fix Round 2，待执行）。Task 2 的执行方式：

**1. Subagent-Driven (recommended)** - 我为 Task 2 派遣一个全新的实现子代理，完成后做任务复查（spec合规性+代码质量），快速迭代

**2. Inline Execution** - 在当前会话内直接执行 Task 2，走 executing-plans 流程

Which approach？
