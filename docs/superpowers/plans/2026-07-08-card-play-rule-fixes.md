# 540 出牌规则修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复"540/五百四"三人扑克游戏中的 6 处出牌规则缺陷（大小顺序判断错误、同花色副牌连对不能出、垫牌被误判为压牌、能压必压漏判、跟三同张拆散对子、AI 出牌完全跳过规则校验），并给 AI 出牌加一道校验+兜底安全网。

**Architecture:** 所有改动集中在 `js/rules.js`（纯规则引擎）、`js/ai.js`（AI 决策）、`js/input.js`（AI 出牌提交流程）三个文件；`js/card.js`、`js/game.js`、`js/renderer.js` 不改动。修复点之间有依赖顺序：修复点1（`doesBeat`）是基础，修复点3、4 都依赖修复点1 的结果；修复点2（`trumpPairOrder`）相对独立；修复点5（`ai.js`）独立；修复点6（安全网）依赖修复点1-5 都已完成（安全网的"结构化兜底"复用的正是前面修好的判断逻辑）。因此任务必须按 1→2→3→4→5→6 的顺序执行。

**Tech Stack:** 原生 ES module JavaScript（无构建工具、无框架）。测试用 Node.js 内置 `assert/strict` 模块写最小复现脚本，`node test/xxx.mjs` 直接运行，无需安装任何依赖（仓库中没有 `package.json`）。

## Global Constraints

- 不修改 `js/card.js`、`js/game.js`、`js/renderer.js`。
- 不修改 `game.playCards(playerIdx, cards, skipValidation)` 的对外签名。
- 每个修复点先写最小复现脚本跑出"复现失败"（TDD 的 failing test），再实现修复，再跑出"通过"。
- 所有测试脚本放在 `test/` 目录下，用 `.mjs` 扩展名，直接 `import` 真实的 `js/*.js` 模块（不使用任何 mock 框架），用 Node 内置 `assert/strict`。
- 所有测试脚本假定从仓库根目录运行（`node test/xxx.mjs`），import 路径一律使用 `../js/xxx.js`。
- 提交信息统一使用 `fix: <中文描述>` 格式，与仓库现有提交历史（如"fix: 修复5项游戏规则不一致问题"）保持一致。
- 任务必须按顺序执行（1→2→3→4→5→6→7），后面的任务假定前面的任务已经完成并已提交。

---

## Task 1: `doesBeat` 重构（对应①大小顺序乱、③垫牌变压牌）

**Files:**
- Create: `test/fix1-does-beat.mjs`
- Modify: `js/rules.js:512-548`

**Interfaces:**
- Consumes: `getPlayType`, `PlayType`（已存在于 `js/rules.js`）、`cardPower(card, trumpSuit, playOrder=0)`（已存在）、`isTrump(card, trumpSuit)`（已存在）
- Produces: `doesBeat(followCards, currentBest, trumpSuit)` — 签名不变，供 `_canPlayerBeat`（Task 3）、`validateFollow`、`ai.js`、`game.js` 使用；新增内部辅助函数 `_compareByTrumpThenSuitThenPower(followCards, bestCards, trumpSuit, pick)`（`pick` 是 `Math.max` 或 `Math.min`）

- [ ] **Step 1: Write the failing test**

Create `test/fix1-does-beat.mjs`:

```js
import assert from 'node:assert/strict';
import { Card, SUIT_CLUBS, SUIT_DIAMONDS, SUIT_HEARTS } from '../js/card.js';
import { doesBeat } from '../js/rules.js';

// image-5：对家出一对梅花K，玩家垫梅花Q+方块Q（跨花色，不是真对子）
// 不应该被判定为压过
{
    const currentBest = [new Card(SUIT_CLUBS, 'K'), new Card(SUIT_CLUBS, 'K')];
    const followCards = [new Card(SUIT_CLUBS, 'Q'), new Card(SUIT_DIAMONDS, 'Q')];
    assert.equal(doesBeat(followCards, currentBest, null), false,
        '跨花色的"伪对子"不应该压过真对子（image-5）');
}

// image-2/7：对家出红心Q Q Q（真三同张），玩家垫红心J+红心A+红心5（同花色但不是三同张）
// 不应该被判定为压过
{
    const currentBest = [new Card(SUIT_HEARTS, 'Q'), new Card(SUIT_HEARTS, 'Q'), new Card(SUIT_HEARTS, 'Q')];
    const followCards = [new Card(SUIT_HEARTS, 'J'), new Card(SUIT_HEARTS, 'A'), new Card(SUIT_HEARTS, '5')];
    assert.equal(doesBeat(followCards, currentBest, null), false,
        '同花色但不构成三同张的牌不应该压过真三同张（image-2/7）');
}

// 回归：同花色真对子，点数更大，应该压过
{
    const currentBest = [new Card(SUIT_CLUBS, 'Q'), new Card(SUIT_CLUBS, 'Q')];
    const followCards = [new Card(SUIT_CLUBS, 'K'), new Card(SUIT_CLUBS, 'K')];
    assert.equal(doesBeat(followCards, currentBest, null), true,
        '同花色真对子点数更大应该压过（回归）');
}

// 回归：活主模式下，主牌单张应该压过副牌单张，不受点数限制
{
    const currentBest = [new Card(SUIT_DIAMONDS, 'A')];
    const followCards = [new Card(SUIT_CLUBS, '5')];
    assert.equal(doesBeat(followCards, currentBest, SUIT_CLUBS), true,
        '主牌应该压过副牌，不受点数限制（回归）');
}

console.log('PASS: fix1-does-beat');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/fix1-does-beat.mjs`
Expected: FAIL — 第一个 `assert.equal` 抛出 `AssertionError`（实际值为 `true`），因为当前 `doesBeat` 会把跨花色的"伪对子"错误地判定为压过。

- [ ] **Step 3: Write minimal implementation**

在 `js/rules.js` 中，将第 512-548 行的完整函数：

```js
export function doesBeat(followCards, currentBest, trumpSuit) {
    const followType = getPlayType(followCards, trumpSuit);
    if (followType === PlayType.BOMB) {
        if (!currentBest || currentBest.length === 0) return true;
        const bestType = getPlayType(currentBest, trumpSuit);
        if (bestType !== PlayType.BOMB) return true;
        const followIsTrump = followCards.some(c => isTrump(c, trumpSuit));
        const bestIsTrump   = currentBest.some(c => isTrump(c, trumpSuit));
        if (followIsTrump && !bestIsTrump) return true;
        if (!followIsTrump && bestIsTrump) return false;
        const fp = Math.max(...followCards.map(c => cardPower(c, trumpSuit)));
        const bp = Math.max(...currentBest.map(c => cardPower(c, trumpSuit)));
        return fp > bp;
    }
    if (!currentBest || currentBest.length === 0) return true;

    const bestType = getPlayType(currentBest, trumpSuit);

    // 连对/连三同张：只能被同类型同长度的连对压
    if (bestType === PlayType.CONSEC_PAIRS || bestType === PlayType.CONSEC_TRIPLES) {
        if (followType !== bestType) return false;
        if (followCards.length !== currentBest.length) return false;
        const followMin = Math.min(...followCards.map(c => cardPower(c, trumpSuit)));
        const bestMin   = Math.min(...currentBest.map(c => cardPower(c, trumpSuit)));
        return followMin > bestMin;
    }

    const followPower = Math.max(...followCards.map(c => cardPower(c, trumpSuit)));
    const bestPower   = Math.max(...currentBest.map(c => cardPower(c, trumpSuit)));

    const followTrump = followCards.some(c => isTrump(c, trumpSuit));
    const bestTrump   = currentBest.some(c => isTrump(c, trumpSuit));

    if (followTrump && !bestTrump) return true;
    if (!followTrump && bestTrump) return false;
    return followPower > bestPower;
}
```

替换为：

```js
function _compareByTrumpThenSuitThenPower(followCards, bestCards, trumpSuit, pick) {
    const followTrump = followCards.some(c => isTrump(c, trumpSuit));
    const bestTrump    = bestCards.some(c => isTrump(c, trumpSuit));

    if (followTrump && !bestTrump) return true;
    if (!followTrump && bestTrump) return false;
    // 都不是主牌：不同花色不可比，先出者（currentBest）仍然大
    if (!followTrump && !bestTrump && followCards[0].suit !== bestCards[0].suit) return false;

    const followPower = pick(...followCards.map(c => cardPower(c, trumpSuit)));
    const bestPower    = pick(...bestCards.map(c => cardPower(c, trumpSuit)));
    return followPower > bestPower;
}

export function doesBeat(followCards, currentBest, trumpSuit) {
    const followType = getPlayType(followCards, trumpSuit);

    if (followType === PlayType.BOMB) {
        if (!currentBest || currentBest.length === 0) return true;
        const bestType = getPlayType(currentBest, trumpSuit);
        if (bestType !== PlayType.BOMB) return true;
        return _compareByTrumpThenSuitThenPower(followCards, currentBest, trumpSuit, Math.max);
    }

    if (!currentBest || currentBest.length === 0) return true;
    const bestType = getPlayType(currentBest, trumpSuit);

    // 牌型不匹配（不是同一种合法牌型）一律不能压
    if (followType !== bestType) return false;

    if (bestType === PlayType.CONSEC_PAIRS || bestType === PlayType.CONSEC_TRIPLES) {
        if (followCards.length !== currentBest.length) return false;
        return _compareByTrumpThenSuitThenPower(followCards, currentBest, trumpSuit, Math.min);
    }

    return _compareByTrumpThenSuitThenPower(followCards, currentBest, trumpSuit, Math.max);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/fix1-does-beat.mjs`
Expected: PASS — 输出 `PASS: fix1-does-beat`

- [ ] **Step 5: Commit**

```bash
git add js/rules.js test/fix1-does-beat.mjs
git commit -m "$(cat <<'EOF'
fix: doesBeat重构，跨花色/牌型不匹配的垫牌不再误判为压牌

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `trumpPairOrder` 扩展（对应②连对子不能出）

**Files:**
- Create: `test/fix2-trump-pair-order.mjs`
- Modify: `js/rules.js:207-235`

**Interfaces:**
- Consumes: `SUITS`（已从 `card.js` 导入到 `rules.js`）
- Produces: `trumpPairOrder(pair, trumpSuit)` — 签名不变，返回值语义扩展（副牌 A/K/Q/J/5 不再固定返回 `-1`，改为按花色分段的可排序正数）；新增内部辅助 `_sideOrder(suit, rank)` 和常量 `SIDE_RANK_STEP`、`SIDE_SUIT_BASE`、`SIDE_SUIT_GAP`。供 Task 3 的 `_consecutiveWindows` 复用。

- [ ] **Step 1: Write the failing test**

Create `test/fix2-trump-pair-order.mjs`:

```js
import assert from 'node:assert/strict';
import { Card, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';
import { trumpPairOrder, isConsecutivePairs, getPlayType, PlayType } from '../js/rules.js';

// 常主模式：同花色副牌 A、K 应该视为连续（image-3/4）
{
    const pairA = [new Card(SUIT_CLUBS, 'A'), new Card(SUIT_CLUBS, 'A')];
    const pairK = [new Card(SUIT_CLUBS, 'K'), new Card(SUIT_CLUBS, 'K')];
    assert.equal(isConsecutivePairs([pairA, pairK], null), true,
        '同花色副牌 A+K 应该能连对（常主模式）');
}

// 跨花色副牌不应该连续
{
    const pairA = [new Card(SUIT_CLUBS, 'A'), new Card(SUIT_CLUBS, 'A')];
    const pairK = [new Card(SUIT_DIAMONDS, 'K'), new Card(SUIT_DIAMONDS, 'K')];
    assert.equal(isConsecutivePairs([pairA, pairK], null), false,
        '跨花色副牌不应该被判定为连对');
}

// 端到端：4张同花色副牌 A A K K 应该被识别为 CONSEC_PAIRS 牌型
{
    const cards = [
        new Card(SUIT_CLUBS, 'A'), new Card(SUIT_CLUBS, 'A'),
        new Card(SUIT_CLUBS, 'K'), new Card(SUIT_CLUBS, 'K'),
    ];
    assert.equal(getPlayType(cards, null), PlayType.CONSEC_PAIRS,
        '同花色副牌连对应该被识别为 CONSEC_PAIRS 牌型');
}

// 回归：活主模式下主10/副10的既有数值关系保持不变
{
    assert.equal(trumpPairOrder([new Card(SUIT_CLUBS, '10'), new Card(SUIT_CLUBS, '10')], SUIT_CLUBS), 10,
        '活主花色的10（主10）顺序值应为10（回归）');
    assert.equal(trumpPairOrder([new Card(SUIT_DIAMONDS, '10'), new Card(SUIT_DIAMONDS, '10')], SUIT_CLUBS), 9,
        '非活主花色的10（副10）顺序值应为9（回归）');
}

console.log('PASS: fix2-trump-pair-order');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/fix2-trump-pair-order.mjs`
Expected: FAIL — 第一个 `assert.equal` 抛出 `AssertionError`（实际值为 `false`），因为当前 `trumpPairOrder` 对副牌 A/K 都返回 `-1`，`isConsecutivePairs` 遇到负数直接判定不连续。

- [ ] **Step 3: Write minimal implementation**

在 `js/rules.js` 中，将第 207-235 行的完整函数：

```js
export function trumpPairOrder(pair, trumpSuit) {
    const card = pair[0];
    const rank = card.rank;
    const suit = card.suit;

    if (trumpSuit === null || trumpSuit === undefined) {
        // 常主模式：只有 3>字牌>大王>小王 可构成连对
        // 规则：对小王与对10不是连对，对10与对2不是连对
        const orderMap = {
            [RANK_THREE]:      4,
            [RANK_CHARACTER]:  3,
            [RANK_BIG_JOKER]:  2,
            [RANK_SMALL_JOKER]: 1,
        };
        return orderMap[rank] ?? -1;
    } else {
        if (rank === RANK_THREE)      return 14;
        if (rank === RANK_CHARACTER)  return 13;
        if (rank === RANK_BIG_JOKER)  return 12;
        if (rank === RANK_SMALL_JOKER) return 11;
        if (rank === '10' && suit === trumpSuit) return 10;
        if (rank === '10') return 9;
        if (rank === '2'  && suit === trumpSuit) return 8;
        if (rank === '2') return 7;
        const regularOrder = { 'A': 6, 'K': 5, 'Q': 4, 'J': 3, '5': 2 };
        if (suit === trumpSuit) return regularOrder[rank] ?? -1;
        return -1;
    }
}
```

替换为：

```js
const SIDE_RANK_STEP = { A: 5, K: 4, Q: 3, J: 2, '5': 1 };  // 同花色内部相邻，差值均为1
const SIDE_SUIT_BASE = 1000;                                 // 与主牌数值段（个位数~十几）完全不重叠
const SIDE_SUIT_GAP  = 100;                                  // 花色间隔，远大于同花色内部最大差值(4)

function _sideOrder(suit, rank) {
    if (!(rank in SIDE_RANK_STEP)) return -1;
    const suitIdx = SUITS.indexOf(suit);
    if (suitIdx < 0) return -1;
    return SIDE_SUIT_BASE + suitIdx * SIDE_SUIT_GAP + SIDE_RANK_STEP[rank];
}

export function trumpPairOrder(pair, trumpSuit) {
    const card = pair[0];
    const rank = card.rank;
    const suit = card.suit;

    if (trumpSuit === null || trumpSuit === undefined) {
        // 常主模式：只有 3>字牌>大王>小王 可构成连对
        // 规则：对小王与对10不是连对，对10与对2不是连对
        const orderMap = {
            [RANK_THREE]:      4,
            [RANK_CHARACTER]:  3,
            [RANK_BIG_JOKER]:  2,
            [RANK_SMALL_JOKER]: 1,
        };
        return orderMap[rank] ?? _sideOrder(suit, rank);
    } else {
        if (rank === RANK_THREE)      return 14;
        if (rank === RANK_CHARACTER)  return 13;
        if (rank === RANK_BIG_JOKER)  return 12;
        if (rank === RANK_SMALL_JOKER) return 11;
        if (rank === '10' && suit === trumpSuit) return 10;
        if (rank === '10') return 9;
        if (rank === '2'  && suit === trumpSuit) return 8;
        if (rank === '2') return 7;
        const regularOrder = { 'A': 6, 'K': 5, 'Q': 4, 'J': 3, '5': 2 };
        if (suit === trumpSuit) return regularOrder[rank] ?? -1;
        return _sideOrder(suit, rank);
    }
}
```

`SUITS` 已在文件顶部从 `card.js` 导入（第 8 行），无需新增 import。

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/fix2-trump-pair-order.mjs`
Expected: PASS — 输出 `PASS: fix2-trump-pair-order`

- [ ] **Step 5: Commit**

```bash
git add js/rules.js test/fix2-trump-pair-order.mjs
git commit -m "$(cat <<'EOF'
fix: 同花色副牌A/K/Q/J/5支持连对，按花色分段编号排序

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `_canPlayerBeat` 修正（新发现，非用户原始报告；含连对子/连三同张压牌判断）

**Files:**
- Create: `test/fix3-can-player-beat.mjs`
- Modify: `js/rules.js:472-502`

**Interfaces:**
- Consumes: `doesBeat`（Task 1 产出）、`trumpPairOrder`（Task 2 产出）、`getPairs`、`getTriples`、`getFollowSuit`、`filterHandBySuit`、`getPlayType`、`PlayType`（均已存在于 `js/rules.js`）
- Produces: `_canPlayerBeat(hand, currentBest, ledCards, trumpSuit)` — 签名不变，供 `validateFollow`（能压必压判断）使用；新增内部辅助 `_consecutiveWindows(groups, trumpSuit, windowCount)`

- [ ] **Step 1: Write the failing test**

Create `test/fix3-can-player-beat.mjs`:

```js
import assert from 'node:assert/strict';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_DIAMONDS, SUIT_CLUBS } from '../js/card.js';
import { _canPlayerBeat, getPlayType, PlayType } from '../js/rules.js';

// 场景a：跟牌者没有出牌者的花色（红心），但手里有主牌（黑桃5），应该能压
{
    const hand = [new Card(SUIT_SPADES, '5'), new Card(SUIT_DIAMONDS, 'J')];
    const currentBest = [new Card(SUIT_HEARTS, 'K')];
    const ledCards = [new Card(SUIT_HEARTS, 'K')];
    assert.equal(_canPlayerBeat(hand, currentBest, ledCards, SUIT_SPADES), true,
        '没有出牌者花色但手里有主牌时应该能压');
}

// 场景b1：连对子——手里有两个同花色连续对子，能组成压过led的连对，应该能压
{
    const ledCards = [
        new Card(SUIT_CLUBS, 'Q'), new Card(SUIT_CLUBS, 'Q'),
        new Card(SUIT_CLUBS, 'J'), new Card(SUIT_CLUBS, 'J'),
    ];
    const hand = [
        new Card(SUIT_CLUBS, 'A'), new Card(SUIT_CLUBS, 'A'),
        new Card(SUIT_CLUBS, 'K'), new Card(SUIT_CLUBS, 'K'),
    ];
    assert.equal(getPlayType(ledCards, null), PlayType.CONSEC_PAIRS, '测试前提：ledCards应为连对');
    assert.equal(_canPlayerBeat(hand, ledCards, ledCards, null), true,
        '手里有更大的同花色连对时应该能压（CONSEC_PAIRS）');
}

// 场景b2：连对子——手里只有一个单独的对子，凑不成连对，不应该判定为能压
// （旧代码在这里会误判为true：把led连对里每张牌单独取最大力量值来比较，
//  只要手里有一张点数够大的牌就误报"能压"，而不检查是否真的能组成匹配的连对）
{
    const trumpSuit = SUIT_CLUBS;
    const ledCards = [
        new Card(SUIT_CLUBS, 'K'), new Card(SUIT_CLUBS, 'K'),
        new Card(SUIT_CLUBS, 'Q'), new Card(SUIT_CLUBS, 'Q'),
    ];
    const hand = [
        new Card(SUIT_CLUBS, 'A'), new Card(SUIT_CLUBS, 'A'),
        new Card(SUIT_DIAMONDS, '5'), new Card(SUIT_DIAMONDS, 'J'),
    ];
    assert.equal(getPlayType(ledCards, trumpSuit), PlayType.CONSEC_PAIRS, '测试前提：ledCards应为连对（活主）');
    assert.equal(_canPlayerBeat(hand, ledCards, ledCards, trumpSuit), false,
        '只有一个对子、凑不成连对时不应该判定为能压');
}

console.log('PASS: fix3-can-player-beat');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/fix3-can-player-beat.mjs`
Expected: FAIL — 场景a 的 `assert.equal` 抛出 `AssertionError`（实际值为 `false`），因为当前 `_canPlayerBeat` 在 `handInSuit` 为空时直接返回 `false`，不会去主牌里找。

- [ ] **Step 3: Write minimal implementation**

在 `js/rules.js` 中，将第 472-502 行的完整函数：

```js
export function _canPlayerBeat(hand, currentBest, ledCards, trumpSuit) {
    const ledSuit = getFollowSuit(ledCards, trumpSuit);
    const handInSuit = filterHandBySuit(hand, ledSuit, trumpSuit);
    if (!currentBest || currentBest.length === 0) return false;
    const bestPower = Math.max(...currentBest.map(c => cardPower(c, trumpSuit, c.playOrder)));

    const ledType = getPlayType(ledCards, trumpSuit);

    if (ledType === PlayType.PAIR) {
        for (const pair of getPairs(handInSuit, trumpSuit)) {
            if (Math.max(cardPower(pair[0], trumpSuit, 0), cardPower(pair[1], trumpSuit, 0)) > bestPower) {
                return true;
            }
        }
        return false;
    }

    if (ledType === PlayType.TRIPLE) {
        for (const triple of getTriples(handInSuit, trumpSuit)) {
            if (Math.max(...triple.map(c => cardPower(c, trumpSuit, 0))) > bestPower) {
                return true;
            }
        }
        return false;
    }

    for (const card of handInSuit) {
        if (cardPower(card, trumpSuit, 0) > bestPower) return true;
    }
    return false;
}
```

替换为：

```js
function _consecutiveWindows(groups, trumpSuit, windowCount) {
    const withOrder = groups
        .map(g => ({ group: g, order: trumpPairOrder(g, trumpSuit) }))
        .filter(x => x.order >= 0)
        .sort((a, b) => a.order - b.order);
    const windows = [];
    for (let i = 0; i + windowCount <= withOrder.length; i++) {
        const slice = withOrder.slice(i, i + windowCount);
        const isConsecutive = slice.every((x, j) => j === 0 || x.order - slice[j - 1].order === 1);
        if (isConsecutive) windows.push(slice.flatMap(x => x.group));
    }
    return windows;
}

export function _canPlayerBeat(hand, currentBest, ledCards, trumpSuit) {
    if (!currentBest || currentBest.length === 0) return false;
    const ledSuit    = getFollowSuit(ledCards, trumpSuit);
    const handInSuit = filterHandBySuit(hand, ledSuit, trumpSuit);
    const ledType    = getPlayType(ledCards, trumpSuit);
    // 有该花色牌只能用该花色试；没有该花色牌时改用主牌试（若ledSuit本身就是'trump'，两者相同）
    const pool = handInSuit.length > 0 ? handInSuit : filterHandBySuit(hand, 'trump', trumpSuit);

    if (ledType === PlayType.PAIR)   return getPairs(pool, trumpSuit).some(p => doesBeat(p, currentBest, trumpSuit));
    if (ledType === PlayType.TRIPLE) return getTriples(pool, trumpSuit).some(t => doesBeat(t, currentBest, trumpSuit));
    if (ledType === PlayType.CONSEC_PAIRS || ledType === PlayType.CONSEC_TRIPLES) {
        const groupSize   = ledType === PlayType.CONSEC_PAIRS ? 2 : 3;
        const windowCount = ledCards.length / groupSize;
        const groups      = groupSize === 2 ? getPairs(pool, trumpSuit) : getTriples(pool, trumpSuit);
        return _consecutiveWindows(groups, trumpSuit, windowCount).some(cand => doesBeat(cand, currentBest, trumpSuit));
    }
    return pool.some(c => doesBeat([c], currentBest, trumpSuit));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/fix3-can-player-beat.mjs`
Expected: PASS — 输出 `PASS: fix3-can-player-beat`

- [ ] **Step 5: Commit**

```bash
git add js/rules.js test/fix3-can-player-beat.mjs
git commit -m "$(cat <<'EOF'
fix: _canPlayerBeat改用doesBeat统一判断，修复无同花色时漏判及连对子压牌判断缺失

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `_checkNoVoluntaryScore` 修正（bonus，用户排查过程中发现）

**Files:**
- Create: `test/fix4-no-voluntary-score.mjs`
- Modify: `js/rules.js:674-689`（函数签名与实现）
- Modify: `js/rules.js:756-781`（`validateFollow` 内的调用处）

**Interfaces:**
- Consumes: `doesBeat`（Task 1 产出）
- Produces: `_checkNoVoluntaryScore(followCards, pool, trumpSuit, isBeatingPlay)` — 新增第 4 个参数 `isBeatingPlay`（module-private，仅 `validateFollow` 内部调用，无外部消费者）

- [ ] **Step 1: Write the failing test**

Create `test/fix4-no-voluntary-score.mjs`:

```js
import assert from 'node:assert/strict';
import { Card, SUIT_CLUBS } from '../js/card.js';
import { validateFollow } from '../js/rules.js';

// 本墩目前没有分牌（led的梅花Q本身score=0），玩家用梅花K压过（K本身带10分）
// 不应该被误判为"主动垫分牌"——这是合理的压牌，不是垫牌
{
    const ledCards    = [new Card(SUIT_CLUBS, 'Q')];
    const currentBest  = ledCards;
    const hand         = [new Card(SUIT_CLUBS, 'K'), new Card(SUIT_CLUBS, 'J')];
    const followCards  = [new Card(SUIT_CLUBS, 'K')];
    const [ok, err] = validateFollow(followCards, ledCards, hand, null, false, currentBest, 1);
    assert.equal(ok, true, `用分牌合理压牌不应该被拒绝，实际错误: ${err}`);
}

console.log('PASS: fix4-no-voluntary-score');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/fix4-no-voluntary-score.mjs`
Expected: FAIL — `assert.equal` 抛出 `AssertionError`（`ok` 实际为 `false`，`err` 为 `'不能主动垫分牌'`），因为当前 `_checkNoVoluntaryScore` 不区分压牌和垫牌。

- [ ] **Step 3: Write minimal implementation**

**3a.** 在 `js/rules.js` 中，将第 674-689 行的完整函数：

```js
function _checkNoVoluntaryScore(followCards, pool, trumpSuit) {
    if (!followCards.some(c => c.scoreValue() > 0)) return [true, ''];
    const n = followCards.length;
    const nonScore = pool.filter(c => c.scoreValue() === 0);
    if (nonScore.length >= n) return [false, '不能主动垫分牌'];
    const scoreSorter = (a, b) =>
        a.scoreValue() - b.scoreValue() || cardPower(a, trumpSuit) - cardPower(b, trumpSuit);
    const scorePool = pool.filter(c => c.scoreValue() > 0).sort(scoreSorter);
    const needScore = n - nonScore.length;
    const expected  = scorePool.slice(0, needScore);
    const actual    = followCards.filter(c => c.scoreValue() > 0).sort(scoreSorter);
    if (actual.length !== expected.length || actual.some((c, i) => c !== expected[i])) {
        return [false, '垫分牌须按分小牌小顺序'];
    }
    return [true, ''];
}
```

替换为：

```js
function _checkNoVoluntaryScore(followCards, pool, trumpSuit, isBeatingPlay) {
    if (isBeatingPlay) return [true, ''];   // 压牌不算主动垫分
    if (!followCards.some(c => c.scoreValue() > 0)) return [true, ''];
    const n = followCards.length;
    const nonScore = pool.filter(c => c.scoreValue() === 0);
    if (nonScore.length >= n) return [false, '不能主动垫分牌'];
    const scoreSorter = (a, b) =>
        a.scoreValue() - b.scoreValue() || cardPower(a, trumpSuit) - cardPower(b, trumpSuit);
    const scorePool = pool.filter(c => c.scoreValue() > 0).sort(scoreSorter);
    const needScore = n - nonScore.length;
    const expected  = scorePool.slice(0, needScore);
    const actual    = followCards.filter(c => c.scoreValue() > 0).sort(scoreSorter);
    if (actual.length !== expected.length || actual.some((c, i) => c !== expected[i])) {
        return [false, '垫分牌须按分小牌小顺序'];
    }
    return [true, ''];
}
```

**3b.** 在 `js/rules.js` 中，将 `validateFollow` 内第 756-781 行：

```js
    // 能压必压 rule (must beat if possible, when trick has score)
    if (trickHasScore && currentBest) {
        const canBeat = _canPlayerBeat(hand, currentBest, ledCards, trumpSuit);
        if (canBeat) {
            const isBeating = doesBeat(followCards, currentBest, trumpSuit);
            if (!isBeating) return [false, '前面有分牌，能压必压'];
            return [true, ''];
        }
    }

    // Rule: no voluntary score discard (不能主动垫分牌)
    // 分别检查同花色和异花色部分
    const followInSuit  = followCards.filter(c => getSuitOfCard(c, trumpSuit) === ledSuit);
    const followOffSuit = followCards.filter(c => getSuitOfCard(c, trumpSuit) !== ledSuit);

    if (followInSuit.length > 0 && handInSuit.length > 0) {
        const [ok, err] = _checkNoVoluntaryScore(followInSuit, handInSuit, trumpSuit);
        if (!ok) return [false, err];
    }
    if (followOffSuit.length > 0) {
        const handOffSuit = hand.filter(c => !handInSuit.includes(c));
        if (handOffSuit.length > 0) {
            const [ok, err] = _checkNoVoluntaryScore(followOffSuit, handOffSuit, trumpSuit);
            if (!ok) return [false, err];
        }
    }
```

替换为：

```js
    // 能压必压 rule (must beat if possible, when trick has score)
    if (trickHasScore && currentBest) {
        const canBeat = _canPlayerBeat(hand, currentBest, ledCards, trumpSuit);
        if (canBeat) {
            const isBeating = doesBeat(followCards, currentBest, trumpSuit);
            if (!isBeating) return [false, '前面有分牌，能压必压'];
            return [true, ''];
        }
    }

    // Rule: no voluntary score discard (不能主动垫分牌)
    // 分别检查同花色和异花色部分；压牌（真的赢下这一墩）豁免"主动垫分"检查
    const isBeatingPlay = (currentBest && currentBest.length > 0)
        ? doesBeat(followCards, currentBest, trumpSuit)
        : false;
    const followInSuit  = followCards.filter(c => getSuitOfCard(c, trumpSuit) === ledSuit);
    const followOffSuit = followCards.filter(c => getSuitOfCard(c, trumpSuit) !== ledSuit);

    if (followInSuit.length > 0 && handInSuit.length > 0) {
        const [ok, err] = _checkNoVoluntaryScore(followInSuit, handInSuit, trumpSuit, isBeatingPlay);
        if (!ok) return [false, err];
    }
    if (followOffSuit.length > 0) {
        const handOffSuit = hand.filter(c => !handInSuit.includes(c));
        if (handOffSuit.length > 0) {
            const [ok, err] = _checkNoVoluntaryScore(followOffSuit, handOffSuit, trumpSuit, isBeatingPlay);
            if (!ok) return [false, err];
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/fix4-no-voluntary-score.mjs`
Expected: PASS — 输出 `PASS: fix4-no-voluntary-score`

- [ ] **Step 5: Commit**

```bash
git add js/rules.js test/fix4-no-voluntary-score.mjs
git commit -m "$(cat <<'EOF'
fix: 用分牌合理压牌时不再误判为主动垫分牌

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `_followNSame` 修正（对应⑥的 ai.js 具体逻辑漏洞）

**Files:**
- Create: `test/fix5-follow-n-same.mjs`
- Modify: `js/ai.js:417`

**Interfaces:**
- Consumes: `_pickStructuredDiscard(pool, fullHand, n, trumpSuit)`（已存在于 `js/ai.js:467-519`，跟炸弹路径已在使用）
- Produces: `aiFollow(hand, ledCards, currentBest, trumpSuit, trickHasScore)` — 对外签名不变，仅内部 `_followNSame` 的兜底调用变化

- [ ] **Step 1: Write the failing test**

Create `test/fix5-follow-n-same.mjs`:

```js
import assert from 'node:assert/strict';
import { Card, SUIT_HEARTS } from '../js/card.js';
import { aiFollow } from '../js/ai.js';

// 跟三同张，手里没有三同张但有一对A，不应该拆散这对A
{
    const ledCards    = [new Card(SUIT_HEARTS, 'Q'), new Card(SUIT_HEARTS, 'Q'), new Card(SUIT_HEARTS, 'Q')];
    const currentBest  = ledCards;
    const heartA1 = new Card(SUIT_HEARTS, 'A');
    const heartA2 = new Card(SUIT_HEARTS, 'A');
    const hand = [heartA1, heartA2, new Card(SUIT_HEARTS, 'J'), new Card(SUIT_HEARTS, 'Q')];

    const result = aiFollow(hand, ledCards, currentBest, null, false);

    assert.equal(result.length, 3, '应该出3张牌跟三同张');
    assert.ok(result.includes(heartA1) && result.includes(heartA2),
        '手里的一对A不应该被拆散垫出去');
}

console.log('PASS: fix5-follow-n-same');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/fix5-follow-n-same.mjs`
Expected: FAIL — 第二个 `assert.ok` 抛出 `AssertionError`，因为当前 `_followNSame` 用朴素的 `_pickDiscard` 按力量值从小到大排序取前3张（`[♥J, ♥Q, ♥A]`），只包含一张A，拆散了A对子。

- [ ] **Step 3: Write minimal implementation**

在 `js/ai.js` 第 417 行，将：

```js
    return _pickDiscard(handInSuit.length ? handInSuit : hand, n, trumpSuit);
```

替换为：

```js
    return _pickStructuredDiscard(handInSuit.length ? handInSuit : hand, hand, n, trumpSuit);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/fix5-follow-n-same.mjs`
Expected: PASS — 输出 `PASS: fix5-follow-n-same`

- [ ] **Step 5: Commit**

```bash
git add js/ai.js test/fix5-follow-n-same.mjs
git commit -m "$(cat <<'EOF'
fix: 跟三同张时改用结构化垫牌兜底，不再拆散手中对子

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: AI 出牌安全网架构（对应⑤上家出主牌下家垫副牌、⑥上家出对子下家不跟对子）

**Files:**
- Create: `test/fix6-ai-safety-net.mjs`
- Modify: `js/ai.js`（文件末尾追加新导出函数，紧接第 519 行 `_pickStructuredDiscard` 之后）
- Modify: `js/input.js:5-7`（imports）
- Modify: `js/input.js`（在第 487 行"Play update"分节注释之前插入两个新函数）
- Modify: `js/input.js:554-571`（`_updatePlay` 尾部的出牌提交逻辑）

**Interfaces:**
- Consumes: `_pickStructuredDiscard`、`getFollowSuit`、`filterHandBySuit`（均已存在于 `js/ai.js`）；`mustLeadPairOrBiggest`、`cardPower`（已存在于 `js/rules.js`，`mustLeadPairOrBiggest` 目前是未使用的导出函数）；`game.playCards(playerIdx, cards, skipValidation)`（已存在于 `js/game.js`，签名不变）
- Produces:
  - `safeFollowFallback(hand, ledCards, trumpSuit, requiredCount)`（`js/ai.js` 新导出函数）
  - `submitAiPlay(game, leader, cards, ctx)`（`js/input.js` 新导出函数），其中 `ctx = {ledCards, hand, trumpSuit, needed, anyUnplayed}`，返回 `[ok, finalCards]`

- [ ] **Step 1: Write the failing test**

Create `test/fix6-ai-safety-net.mjs`:

```js
import assert from 'node:assert/strict';
import { Card, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';
import { GameState, TrickEntry, Phase } from '../js/game.js';
import { submitAiPlay } from '../js/input.js';

function freshGame() {
    const game = new GameState();
    game.phase         = Phase.PLAY;
    game.trumpSuit     = null;
    game.trumpCaller   = -1;
    game.mustPlayCards = [];
    for (const p of game.players) { p.hand = []; p.hasPlayed = false; p.trickScore = 0; }
    return game;
}

// 场景1：AI 返回了不合规则的牌（有同花色梅花J却出了异花色方块A），
// 安全兜底应该改出正确的同花色牌，不应该把违规牌直接打出去
{
    const game = freshGame();
    const leader = 2;
    game.firstPlayer    = 0;
    game.currentTrick   = [new TrickEntry(0, [new Card(SUIT_CLUBS, 'K')])];
    game.trickCardCount = 1;
    const clubJ    = new Card(SUIT_CLUBS, 'J');
    const diamondA = new Card(SUIT_DIAMONDS, 'A');
    game.players[2].hand = [clubJ, diamondA];

    const badCards = [diamondA];
    const warnCalls  = [];
    const errorCalls = [];
    const origWarn  = console.warn;
    const origError = console.error;
    console.warn  = (...a) => warnCalls.push(a);
    console.error = (...a) => errorCalls.push(a);

    let ok, finalCards;
    try {
        [ok, finalCards] = submitAiPlay(game, leader, badCards, {
            ledCards:    game.getLedCards(),
            hand:        game.players[2].hand,
            trumpSuit:   game.trumpSuit,
            needed:      1,
            anyUnplayed: false,
        });
    } finally {
        console.warn  = origWarn;
        console.error = origError;
    }

    assert.equal(ok, true, '安全兜底后应该成功出牌');
    assert.equal(finalCards.length, 1);
    assert.equal(finalCards[0], clubJ, '兜底应该改出同花色的梅花J，而不是保留违规的方块A');
    assert.equal(warnCalls.length, 1, '应该记录一次"使用安全兜底"警告');
    assert.equal(errorCalls.length, 0, '不应该走到暴力兜底（安全兜底已经成功）');
}

// 场景2：结构化安全兜底本身也没有尝试压牌，如果这一手恰好该压牌，
// 兜底也会被拒绝——此时应该退到暴力方案，保证过程不抛异常、必定出牌成功
{
    const game = freshGame();
    const leader = 2;
    game.firstPlayer    = 0;
    game.currentTrick   = [new TrickEntry(0, [new Card(SUIT_CLUBS, 'K')])]; // K带10分，本墩有分
    game.trickCardCount = 1;
    const clubA = new Card(SUIT_CLUBS, 'A'); // 能压过梅花K
    const clubJ = new Card(SUIT_CLUBS, 'J'); // 不能压过梅花K
    game.players[2].hand = [clubA, clubJ];

    const badCards = [clubJ]; // 有能压的牌（clubA）却出了不能压的牌，违反"有分必压"
    const warnCalls  = [];
    const errorCalls = [];
    const origWarn  = console.warn;
    const origError = console.error;
    console.warn  = (...a) => warnCalls.push(a);
    console.error = (...a) => errorCalls.push(a);

    let ok, finalCards;
    try {
        [ok, finalCards] = submitAiPlay(game, leader, badCards, {
            ledCards:    game.getLedCards(),
            hand:        game.players[2].hand,
            trumpSuit:   game.trumpSuit,
            needed:      1,
            anyUnplayed: false,
        });
    } finally {
        console.warn  = origWarn;
        console.error = origError;
    }

    assert.equal(ok, true, '即使结构化安全兜底也未压牌，暴力方案也应该保证最终出牌成功');
    assert.equal(finalCards.length, 1);
    assert.equal(finalCards[0], clubA, '暴力兜底按手牌原有顺序取牌，应该是clubA');
    assert.equal(warnCalls.length, 1, '应该记录一次"使用安全兜底"警告');
    assert.equal(errorCalls.length, 1, '结构化兜底仍失败时应该记录一次"回退暴力方案"错误');
}

console.log('PASS: fix6-ai-safety-net');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/fix6-ai-safety-net.mjs`
Expected: FAIL — Node 在 import 阶段抛出错误（类似 `SyntaxError: The requested module '../js/input.js' does not provide an export named 'submitAiPlay'`），因为 `submitAiPlay` 还不存在。

- [ ] **Step 3: Write minimal implementation**

**3a.** 在 `js/ai.js` 文件末尾（紧接第 519 行 `_pickStructuredDiscard` 函数的结尾），将：

```js
    if (result.length < n) {
        const remaining = fullHand.filter(c => !used.has(c));
        const filler = _pickDiscard(remaining, n - result.length, trumpSuit);
        _add(filler);
    }
    return result.slice(0, n);
}
```

替换为（保留原内容，仅在其后追加新函数）：

```js
    if (result.length < n) {
        const remaining = fullHand.filter(c => !used.has(c));
        const filler = _pickDiscard(remaining, n - result.length, trumpSuit);
        _add(filler);
    }
    return result.slice(0, n);
}

/**
 * 跟牌侧结构化安全兜底：优先用同花色牌按"垫最接近相同的牌"原则出牌。
 * 只做结构合法性兜底，不尝试主动压牌。
 * @param {import('./card.js').Card[]} hand
 * @param {import('./card.js').Card[]} ledCards
 * @param {string|null} trumpSuit
 * @param {number} requiredCount
 * @returns {import('./card.js').Card[]}
 */
export function safeFollowFallback(hand, ledCards, trumpSuit, requiredCount) {
    const ledSuit    = getFollowSuit(ledCards, trumpSuit);
    const handInSuit = filterHandBySuit(hand, ledSuit, trumpSuit);
    return _pickStructuredDiscard(handInSuit.length ? handInSuit : hand, hand, requiredCount, trumpSuit);
}
```

（`getFollowSuit`、`filterHandBySuit` 已在文件顶部从 `rules.js` 导入，无需新增 import。）

**3b.** 在 `js/input.js` 第 5-7 行，将：

```js
import { Phase } from './game.js';
import { canCallTrump, canCounterTrump } from './rules.js';
import { aiDecideCallTrump, aiLead, aiFollow } from './ai.js';
```

替换为：

```js
import { Phase } from './game.js';
import { canCallTrump, canCounterTrump, mustLeadPairOrBiggest, cardPower } from './rules.js';
import { aiDecideCallTrump, aiLead, aiFollow, safeFollowFallback } from './ai.js';
```

**3c.** 在 `js/input.js` 中，将第 483-489 行：

```js
        renderer.callAiTime = Date.now() + 1200;
    }
}

// ---------------------------------------------------------------------------
// Play update (private)
// ---------------------------------------------------------------------------
```

替换为：

```js
        renderer.callAiTime = Date.now() + 1200;
    }
}

// ---------------------------------------------------------------------------
// AI 出牌安全网（先校验，失败则结构化兜底，兜底也失败才暴力兜底）
// ---------------------------------------------------------------------------

/**
 * 领出侧的结构化安全兜底：反主牌必出 > 有对子出对子 > 无对子出最大单张。
 * @param {import('./card.js').Card[]} hand
 * @param {string|null} trumpSuit
 * @param {boolean} anyUnplayed
 * @param {import('./card.js').Card[]|null} mustPlayCards
 * @returns {import('./card.js').Card[]}
 */
function _safeLeadFallback(hand, trumpSuit, anyUnplayed, mustPlayCards) {
    if (mustPlayCards && mustPlayCards.length > 0) return [...mustPlayCards];
    if (anyUnplayed) return mustLeadPairOrBiggest(hand, trumpSuit);
    return [hand.reduce((a, b) => cardPower(a, trumpSuit) < cardPower(b, trumpSuit) ? a : b)];
}

/**
 * 提交 AI 出牌：先用真实规则校验，校验失败则用结构化安全兜底再校验一次，
 * 兜底也失败时才回退暴力方案（保证不会比现状更差）。
 * @param {import('./game.js').GameState} game
 * @param {number} leader
 * @param {import('./card.js').Card[]} cards
 * @param {{ledCards: import('./card.js').Card[]|null, hand: import('./card.js').Card[], trumpSuit: string|null, needed: number, anyUnplayed: boolean}} ctx
 * @returns {[boolean, import('./card.js').Card[]]}
 */
export function submitAiPlay(game, leader, cards, ctx) {
    const { ledCards, hand, trumpSuit, needed, anyUnplayed } = ctx;

    let [ok, err] = game.playCards(leader, cards, false);
    if (!ok) {
        console.warn(`AI ${ledCards ? '跟牌' : '出牌'}未通过校验 (${err})，使用安全兜底`);
        cards = ledCards
            ? safeFollowFallback(hand, ledCards, trumpSuit, needed)
            : _safeLeadFallback(hand, trumpSuit, anyUnplayed, leader === game.trumpCaller ? game.mustPlayCards : null);
        [ok, err] = game.playCards(leader, cards, false);
        if (!ok) {
            console.error(`安全兜底仍未通过校验 (${err})，回退暴力方案`);
            cards = hand.slice(0, needed);
            [ok, err] = game.playCards(leader, cards, true);
        }
    }
    return [ok, cards];
}

// ---------------------------------------------------------------------------
// Play update (private)
// ---------------------------------------------------------------------------
```

**3d.** 在 `js/input.js` 中，将 `_updatePlay` 尾部第 554-571 行：

```js
    // Play the cards (skipValidation = true for AI)
    const [ok, err] = game.playCards(leader, cards, true);
    if (ok) {
        renderer.addMessage(`${game.players[leader].name} 出牌: ${cardsCn(cards)}`);
        _afterPlay(renderer, game);
    } else {
        // Fallback: brute-force first N cards
        console.warn(`AI playCards failed (${err}), using fallback`);
        const n       = ledCards ? game.trickCardCount : 1;
        const fbCards = hand.slice(0, Math.min(n, hand.length));
        const [fbOk]  = game.playCards(leader, fbCards, true);
        if (fbOk) {
            renderer.addMessage(`${game.players[leader].name} 出牌: ${cardsCn(fbCards)}`);
            _afterPlay(renderer, game);
        }
    }
}
```

替换为：

```js
    // Play the cards (validated; safety net falls back if AI output is invalid)
    const needed = ledCards ? game.trickCardCount : cards.length;
    const [ok, finalCards] = submitAiPlay(game, leader, cards, { ledCards, hand, trumpSuit, needed, anyUnplayed });
    if (ok) {
        renderer.addMessage(`${game.players[leader].name} 出牌: ${cardsCn(finalCards)}`);
        _afterPlay(renderer, game);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/fix6-ai-safety-net.mjs`
Expected: PASS — 输出 `PASS: fix6-ai-safety-net`

- [ ] **Step 5: Run all previous test scripts to confirm no regression**

Run:
```bash
node test/fix1-does-beat.mjs && node test/fix2-trump-pair-order.mjs && node test/fix3-can-player-beat.mjs && node test/fix4-no-voluntary-score.mjs && node test/fix5-follow-n-same.mjs && node test/fix6-ai-safety-net.mjs
```
Expected: 依次输出 6 行 `PASS: ...`，无报错。

- [ ] **Step 6: Commit**

```bash
git add js/ai.js js/input.js test/fix6-ai-safety-net.mjs
git commit -m "$(cat <<'EOF'
fix: AI出牌加入校验+结构化兜底+暴力兜底三层安全网，不再跳过规则校验

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 手动冒烟测试（浏览器实测，覆盖用户原始报告的 6 张截图场景）

单元测试只验证了独立函数的输入输出，这一步在真实 UI 里过一遍完整对局，确认修复在实际游戏流程中生效、且没有引入新的视觉/交互问题。

**Files:** 无代码改动，仅手动验证。

- [ ] **Step 1: 启动本地静态服务器**

`index.html` 用 `<script type="module" src="js/main.js">` 加载 ES module，直接用 `file://` 打开会被浏览器 CORS 拦截导致黑屏，必须通过 HTTP 服务器访问。在仓库根目录运行：

```bash
python -m http.server 8000
```

（若环境没有 `python`，改用 `npx serve .` 或任意其他静态服务器。）

- [ ] **Step 2: 浏览器打开并进行一整局游戏**

访问 `http://localhost:8000/index.html`，正常走完叫主/反主 → 出牌 → 结算流程，至少打完一整局（42 轮出牌）。过程中特别留意以下 6 个点（对应 `docs/problem` 的 ①-⑥）：

1. **大小顺序**：留意任意一次比牌结果，牌大小关系应符合 `docs/rules.md` 第 2.2/2.3 节（同花色副牌 `A>K>Q>J>5`；不同花色副牌先出者大；主牌顺序按常主/活主规则）。
2. **连对子**：当自己或 AI 手里有同花色相邻的两对副牌（如 `♣A♣A♣K♣K`）时，应该能作为连对一起出。
3. **垫牌 vs 压牌**：跟牌垫入不同花色的牌时，即使数值凑巧偏大，也不应该显示为"压过"了对方的对子/三同张。
4. **首轮出牌约束**：只要还有玩家没出过牌，观察 AI/自己出单张时是不是必须出对子或最大单张（这一条已确认不是 bug，只需确认现状没有被其他修复带偏）。
5. **上家出主牌，下家垫副牌**：确认这种情况不再出现——没有同花色/主牌时才允许垫其他副牌。
6. **上家出对子，下家跟对子**：确认 AI 手里有对应对子时会跟对子，而不是拆散或垫别的牌。

- [ ] **Step 3: 记录结果**

若发现任何一条不符合预期，记录具体的出牌顺序和截图，回到 Task 1-6 对应的修复点重新排查（不要在这一步直接改代码）。若 6 条全部符合预期，本次修复视为验证完成。

---

## 自查清单（写计划后自评，仅供实施者参考，无需勾选执行）

- **规格覆盖**：设计文档的 6 个修复点分别对应 Task 1-6；`docs/rules.md` 2.2/2.3/6节 的验收标准体现在各 Task 的测试断言里；Task 7 覆盖用户原始 6 张截图场景的端到端验证。
- **占位符扫描**：全文无 TBD/TODO，所有代码块均为完整可运行代码，无"参考Task N"式的省略。
- **签名一致性**：`doesBeat(followCards, currentBest, trumpSuit)` 在 Task 1 定义、Task 3/4 直接调用，签名一致；`_checkNoVoluntaryScore` 的新增第4参数 `isBeatingPlay` 在 Task 4 的 3a/3b 两处改动中保持一致；`safeFollowFallback(hand, ledCards, trumpSuit, requiredCount)`（Task 6 3a）与 `submitAiPlay` 内的调用（Task 6 3c）参数顺序一致；`submitAiPlay(game, leader, cards, ctx)` 在 Task 6 3c 定义、3d 调用处的 `ctx` 字段（`ledCards, hand, trumpSuit, needed, anyUnplayed`）与测试文件中构造的 `ctx` 对象字段名完全一致。
