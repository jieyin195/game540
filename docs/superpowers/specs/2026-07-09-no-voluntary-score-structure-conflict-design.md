# 跟牌"结构强制"与"不能主动垫分牌"冲突 修复设计

## 背景

`test/smoke-full-games.mjs`（300局 AI vs AI vs AI 全自动整局压力测试，本分支 Task 1-6 完成后新增的回归工具）跑出后发现：`js/rules.js` 里两条独立的跟牌规则会互相打架，导致部分完全合规、别无选择的出牌被误判为违规。这个问题**早于本分支存在**（`git diff 9f62243..HEAD -- js/rules.js` 确认不是 Task 1-6 引入的回归），且同时影响人类玩家（`input.js` 的人类出牌路径没有安全网兜底）和 AI（有 Task 6 的三层安全网兜底，表现为"安全兜底触发"次数升高，不会崩溃但会导致 AI 不必要地放弃最优出法）。

## 问题的精确机制

`js/rules.js` 里跟牌校验有两条独立规则：

1. **`_validateFollowStructure` / `_validateBombFollowStructure`（结构强制）**：如果手里同花色/主牌能凑成对子/三同张/炸弹，跟牌时就**必须**用这个成型组合，不能拆散了当零散单张出。例如手里有一对大王，对方出对子，玩家不能把这对大王拆开、一张大王配一张零散单张来跟。
2. **`_checkNoVoluntaryScore`（不能主动垫分牌）**：跟牌时如果出了计分牌（'5'/'10'/'K'/大小王/字牌/'3'），会检查手里同花色/主牌里有几张不计分的牌——如果不计分的牌数量足够覆盖这次出牌的张数，就判定为"本可以不出分，你是主动垫分"，判违规。

冲突点：`_checkNoVoluntaryScore` 数"不计分牌"时，是把同花色/主牌的**全部手牌**当候选池，不管这些不计分牌能不能实际拿来用。当玩家手里唯一能凑成的对子（或三同张、炸弹）恰好是计分牌，同时手里还有配不成对的零散单张（不计分）时：

- 规则1 强制玩家必须出那对计分牌（零散单张拆不成对子，出了就违反规则1）。
- 规则2 看到"还有零散单张没出、都不计分"，判定玩家是"主动垫分"，违反规则2。

玩家被同时逼进两条互斥规则，出现无合规解——这不是玩家的错，是规则本身有冲突。

**具体例子**：对方出一对，玩家同花色/主牌只有：一对大王（各10分）+ 一张零散4（不计分，配不成对）。玩家唯一合规出法是把大王对子打出去。`_checkNoVoluntaryScore` 会看到候选池 `[大王, 大王, 4]` 里有1张不计分（那张4），跟这次出牌张数(2)比较后，认为"你本该少出1张分牌"，触发"垫分牌须按分小牌小顺序"甚至"不能主动垫分牌"的误判。

## 用户确认的修复方向

跟牌时，只要手里**还有别的、不计分的同类型成型组合**（对子/三同张/炸弹，视规则1当前实际强制的类型而定）可以顶替，就必须优先用那个，出计分的仍然违规；但如果唯一能凑成的成型组合就是计分牌本身、没有别的同类型成型组合可选，那么被迫出计分牌不算"主动垫分"。**配不成对/三张的零散单张，无论计不计分，都不算"替代方案"**——它们本来就不是规则1下的合法出法，不该被规则2 用来指控玩家"本可以少垫分"。

## 影响范围边界

通读 `validateFollow`（`js/rules.js:752-832`）确认：

- **只影响"跟同花色/主牌"这一侧的检查**（`validateFollow:819-822`，`_checkNoVoluntaryScore(followInSuit, handInSuit, ...)`）。"垫异花色"那一侧（`validateFollow:823-829`，`_checkNoVoluntaryScore(followOffSuit, handOffSuit, ...)`）不受影响、不需要改——因为 `_validateFollowStructure` 只在 `handInSuit.length > 0` 分支里被调用一次（`validateFollow:792-799`），从未对异花色部分做过结构强制。
- **只影响跟对子（PAIR）、三同张（TRIPLE）、连对（CONSEC_PAIRS）、连三同张（CONSEC_TRIPLES）、炸弹（BOMB）这五种 `effectiveLedType`**。跟单张（SINGLE）不触发规则1的强制成型，`_checkNoVoluntaryScore` 现有的逐张比较逻辑对单张场景本来就是对的，不用改。
- `_validateFollowStructure` 在 `handInSuit.length >= 2`（或 TRIPLE/BOMB 对应的更高门槛）时才会触发强制；如果玩家同花色/主牌不够这次出牌张数（`followInSuit.length < 要求张数`），会在更早的"必须跟花色"检查（`validateFollow:784-790`）就直接拒绝，走不到这里，不用考虑。

## 不在本次修复范围内（已知但独立的问题，供后续排查）

- 之前整局压力测试还发现约14%的失败落在"必须跟X花色"这条错误信息上，根因尚未定位，可能是真实bug也可能是测试脚本本身的误判，属于独立事项，不在本次修复范围。
- `_validateFollowStructure` 对 `CONSEC_TRIPLES`（连三同张）的强制检查目前复用的是 `pairsAvail`（对子）而不是 `triplesAvail`（三同张）（`js/rules.js:657-662`）——这看起来像是另一处独立的、更早就存在的疑似bug。本次修复严格按"镜像规则1实际强制的内容"设计，**不会修正**这一点（否则会让候选池收窄逻辑和规则1实际强制的范围不一致，可能引入新的误判）；建议作为独立发现记录到最终全分支审查的 carry-forward 列表。

## 实现方案

> **修订说明（任务复查后发现设计缺陷，已修正）：** 本节最初版本（`_voluntaryScorePool` 一次性返回收窄候选池、只调用一次 `_checkNoVoluntaryScore`）已实现并提交（commit `4d13691`），但任务复查子代理发现并经人工手算独立复核确认：当结构强制的成型组合本身凑不够这次跟牌张数（TRIPLE 分支"无三同张、只能对子+单张"、BOMB 分支"只有一对、需要2张单张补位"等回退分支）、还需要额外零散单张补位时，原方案会把这些补位单张整体排除出候选池——即使它们本身别无选择、必须打出。这会导致 `_checkNoVoluntaryScore` 内部 `actual`（从完整 `followCards` 算出，包含补位单张）与 `expected`（从收窄后的候选池算出，不含补位单张）张数对不上，重新制造出本次修复要消除的那类误判（复现：手里同花色只剩 K♥K♥5♥ 三张，对方出三同张，玩家被迫三张全出，误判违规）。下方是修正后的设计——用户已确认此修复方向。

**不改动 `_validateFollowStructure`、`_validateBombFollowStructure`、`_checkNoVoluntaryScore` 三个既有函数本体**，也不改 `_checkNoVoluntaryScore` 的调用签名。在 `validateFollow` 内部、调用 `_checkNoVoluntaryScore` 处理同花色/主牌部分之前（`validateFollow:867-871`），新增一个纯函数 `_forcedGroupCards`，只负责回答"结构规则强制玩家使用的那组成型组合具体是哪几张牌"（不再尝试直接返回"整体候选池"）：

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

`validateFollow:867-871` 改为（分两次独立调用 `_checkNoVoluntaryScore`：一次检查"成型组合本身选得对不对"，一次检查"补位单张选得对不对"）：

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

`872-878`（异花色部分）不改。

### 为什么这样设计能生效（不用改 `_checkNoVoluntaryScore` 本体）

`_checkNoVoluntaryScore` 用"整体排序取最小"一次性比较，天然只能表达一层判断——它无法同时表达"成型组合本身不管分值都必须整体打出（无从选择）"和"补位单张该优先出不计分的"这两层各自独立的逻辑。把两层强行塞进一次比较，遇到"成型组合凑不够张数、还要单张补位"就会出错（见上方修订说明）。

修正后的设计把这两层拆成两次独立调用，每次调用内部仍然是原来那套"按 `(scoreValue, cardPower)` 排序取最小"逻辑，只是各自的输入范围不同：

1. **成型组合检查**：`followGroup`（跟牌里实际用于凑成型组合的那几张，按引用与 `groupCards` 比对得出）对比 `groupCards`（手里所有同类型候选成型组合，例如全部候选对子）。`getPairs`/`getTriples`/`getBombs` 按 `pairKey`（`suit_rank`）分组，同一组内的牌 `scoreValue()`/`cardPower()` 必然完全相同，所以只要候选组合里有更便宜（不计分）的可用，`_checkNoVoluntaryScore` 现有排序逻辑会正确要求优先用它——这就是"有其他对子就不要打分牌对子"；如果收窄后只剩这一组本身（唯一能凑成的组合），`nonScore` 为0，正确判定"没有更便宜的选择"而放行。
2. **补位单张检查**：`followFiller`（跟牌里除成型组合外剩下的部分）对比 `handFiller`（手里除成型组合外剩下的散牌）。这部分本质就是"自由挑单张"场景，与修复前"垫异花色"那条路径用的是完全相同的既有逻辑，只是候选范围限定在"去掉成型组合后的同花色散牌"——如果散牌里有不计分的可选，选了计分的仍判违规；如果散牌本身别无选择（唯一剩下的就是这些，不管计不计分），正确放行。

两次调用都不改 `_checkNoVoluntaryScore` 本体和签名；当 `groupCards` 为空数组（`effectiveLedType` 不触发任何成型强制，例如 SINGLE）时，第一次调用的两个参数都是空数组、直接 `true` 放行，第二次调用退化为 `_checkNoVoluntaryScore(followInSuit, handInSuit, ...)`——与本次修复介入前完全一致的原始行为，确认不影响 SINGLE 等未涉及分支。

**方案取舍**：曾考虑另一种做法——让 `_validateFollowStructure`/`_validateBombFollowStructure` 的返回值里也带上"这次强制用的是哪组牌"，`validateFollow` 直接复用，避免下面这点条件重复。但那样要改两个函数里几乎每个 `return` 语句的返回结构，改动面明显更大、复查成本更高。本方案的重复只是几行 `.length > 0` / `.length >= N` 判断（复用的 `getPairs`/`getTriples`/`getBombs` 本身是已有、已测试的纯函数，不重新实现分组逻辑），足够小、足够低风险，换来三个已审查通过的核心函数完全不用动、原有测试全部保持有效。选择这个更小改动面的方案。

## 测试计划

新增 `test/fix11-voluntary-score-structure-conflict.mjs`，覆盖：

1. **核心场景（本次bug的直接复现）**：跟对子，同花色/主牌里唯一的对子是计分牌（一对大王），另有一张配不成对的零散非计分单张。修复前应判违规，修复后应放行。
2. **回归场景（确认"有别的对子就必须用"没有被破坏）**：跟对子，同花色/主牌里有两对——一对非计分、一对计分。玩家出计分那对，应仍判"不能主动垫分牌"违规（因为确实有更便宜的选择没用）。
3. **TRIPLE 分支**：跟三同张，手里没有三同张、只有一对计分对子，另有零散非计分单张。应放行（对应 `_validateFollowStructure` "无3同张但有对子，必须出对子加单张"分支）。
4. **BOMB 分支**：跟炸弹（或被炸后 `effectiveLedType===BOMB`），手里只有一对计分对子（够不上2对/三同张/炸弹），另有零散非计分单张。应放行（对应 `_validateBombFollowStructure` 最后一个 `pairsAvail.length>=1` 分支）。
5. **异花色垫牌不受影响（防止误伤）**：构造一个异花色垫牌场景（`followOffSuit`），确认 `_voluntaryScorePool` 完全没有介入这条路径，行为与修复前一致。

测试沿用本分支既有的 `.mjs` + `assert/strict` + 直接 `import` 真实 `js/rules.js` 的约定（不用 mock），文件命名延续 `test/fixN-*.mjs` 序号规律（上一个是 fix6，本次是 fix11，对应任务编号）。

## 自查

- **占位符检查**：无 TBD/待定项，所有代码块都是可直接使用的完整实现。
- **内部一致性**：`_voluntaryScorePool` 的每个分支条件逐一比对过 `_validateFollowStructure`/`_validateBombFollowStructure` 现有代码（`js/rules.js:624-703`），确认完全镜像，没有遗漏或臆造分支。
- **范围检查**：改动集中在 `js/rules.js` 一处新增函数 + `validateFollow` 一处调用点替换，范围单一、可独立测试，不需要再拆分。
- **歧义检查**：唯一有歧义空间的"CONSEC_TRIPLES 是否该用 triplesAvail"已经在"不在本次修复范围"一节里明确了选择（严格镜像现状，不顺带修正），不留模糊地带。

## Fix Round 2：跟牌校验中"重复 pairKey 牌"的引用比较问题

### 问题描述

Task 1 复查（Fix Round 1，commit `784a78a`）后再次复核发现一个独立于"补位单张"问题的 Critical bug：当玩家手里同一花色内、同一点数的牌（同 `pairKey`）数量**超过**结构规则实际要求使用的张数时——例如手里有3张甚至4张同花色的K，而结构规则只强制用其中2张凑一对——出这些牌中任意等价的组合本该同样合规，但实际只有"恰好命中 `_forcedGroupCards`/`getPairs`/`getTriples`/`getBombs` 内部固定选中的那几个具体对象"的出法才会通过，换一张同 pairKey 的等价牌就会被误判为"不能主动垫分牌"或"垫分牌须按分小牌小顺序"。三副牌堆合计126张、每副42张手牌的设定下，同花色同点数凑够3张、4张的情形并不罕见，这不是一个边缘情形。

举例：手里有 K♠K♠K♠（三张，同 pairKey）跟同花色对子，`_forcedGroupCards` 只会返回其中固定的两张（记为 K1、K2，取决于牌在数组里的原始顺序）。玩家出 K1、K2 → 通过；玩家出 K1、K3 或 K2、K3（同样是一对K，理应等价）→ 现有实现会误判违规。

### 根因

两处对象引用比较共同导致：

1. **`validateFollow`（`js/rules.js:866-877`）划分"成型组合牌 vs 补位单张"时用 `.includes()`** ——`followGroup = followInSuit.filter(c => groupCards.includes(c))` 等三处。`groupCards` 是 `_forcedGroupCards` 返回的具体几个对象（例如 `[K1,K2]`），不是"K这个 pairKey 需要2张"这一抽象事实。玩家出的 K3 不在 `[K1,K2]` 这个具体对象列表里，会被错误地划进"补位单张"而不是"成型组合"，即使 K3 和 K1/K2 完全等价。
2. **`_checkNoVoluntaryScore`（`js/rules.js:730`）内 `expected`/`actual` 逐张比较用 `!==`** ——`actual.some((c, i) => c !== expected[i])`。即使划分本身是对的，`scoreSorter` 排序对完全并列（同分值同牌力）的牌是稳定排序意义上的"随便谁在前面都一样"，但 `!==` 比较要求逐位置对象严格相同，把"排序认为等价"的两张牌又判定成不同。

这两处问题会独立地在不同链路上触发（详见"测试计划"里场景9/10的验证），任何一处单独修复都不足以解决问题，必须同时改。

### 影响范围（对此前结论的更正）

此前判断"垫异花色"调用点（`validateFollow:878-884`）不受影响、无需改动——这个判断对**划分逻辑**本身仍然成立（异花色没有"结构强制成型组合"的概念，`handOffSuit = hand.filter(c => !handInSuit.includes(c))` 是合法的按引用排除，不需要引入 pairKey 计数划分）。

但本轮验证发现遗漏了一点：**`_checkNoVoluntaryScore` 是三处调用共享的同一份代码**，根因第2点（第730行的引用比较）对垫异花色调用点同样成立——只要 `handOffSuit` 里有同 pairKey 的重复牌（比如异花色恰好有3张同点数的牌，都不计分或都计分），排序后逐位置引用比较一样会误判。这条路径不需要新增代码改动（下方"改动1"是共享函数体，自动覆盖到这里），但此前遗漏了对应的测试覆盖，本轮已补充（场景14）。

### 实现方案

在 `_checkNoVoluntaryScore` 之后、`_forcedGroupCards` 之后，做两处改动。

#### 改动1：`_checkNoVoluntaryScore` 第730行改为按值比较

```js
const sameRank = (a, b) =>
    a.scoreValue() === b.scoreValue() && cardPower(a, trumpSuit) === cardPower(b, trumpSuit);
if (actual.length !== expected.length || actual.some((c, i) => !sameRank(c, expected[i]))) {
    return [false, '垫分牌须按分小牌小顺序'];
}
```

（`trumpSuit` 在 `_checkNoVoluntaryScore` 函数体内本来就是可访问的既有参数，`sameRank` 直接复用即可，不需要额外传参。）

#### 改动2：新增 `_partitionByPairKeyCounts`，替换调用点的引用划分

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

`validateFollow:866-877`（跟同花色/主牌那两次调用）改为：

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

`878-884`（垫异花色）不改——原因见上方"影响范围"：这条路径没有"组"的概念，不需要引入按 pairKey 划分；它受益于改动1（共享 `_checkNoVoluntaryScore` 函数体），无需单独改代码。

`_forcedGroupCards` 本身不需要任何修改——它"固定截取分组前N张"的行为在改动2之后不再是问题：`_partitionByPairKeyCounts` 只关心 `groupCards` 按 pairKey 分组后**各组数量**，不关心具体是数组里的哪几个对象实例。

### 为什么改动1和改动2用不同的判据（`(scoreValue,cardPower)` vs `pairKey`）

两处都是在解决"重复牌"问题，但服务的是两个不同层次，判据必须分别对应：

- **改动1** 判断"两张牌在'按分小牌小'排序意义下是否等价"，必须和 `scoreSorter`（`a.scoreValue() - b.scoreValue() || cardPower(a, trumpSuit) - cardPower(b, trumpSuit)`）用完全一样的键。排序已经把"分值、牌力都相同"的牌视为并列（稳定排序不改变相对顺序，谁被切进 `expected` 纯属数组原始顺序的偶然结果），相等判断必须用同一个键，否则会出现"排序说这两张牌打成平手，相等判断却坚持不同"的自相矛盾。这里如果改用 `pairKey` 会比 `cardPower` 更严格——会把"排序认为并列、但字面花色不同"的牌（例如两张非主牌 `'10'`，分属不同副牌花色）重新判定为不同——但 `cardPower` 对非主牌 `'10'`/`'2'` 本来就不区分具体副牌花色（既有、独立的简化设计，`_checkNoVoluntaryScore` 现有代码调用 `cardPower` 时从不传 `playOrder`，早已把这类牌视为并列），不是本次要解决的问题，因此改动1明确不用 `pairKey`。
- **改动2** 判断"这张牌算不算 `_forcedGroupCards` 选中的成型组合的一部分"，是结构层面的问题，必须严格对应 `getPairs`/`getTriples`/`getBombs` 自己的分组依据——`pairKey`，差一点都不行（哪怕分值凑巧相同，花色点数不同的牌根本凑不成同一个对子/三同张/炸弹）。

两处不是随意选择，而是分别对齐各自所服务的既有逻辑（排序键 vs 分组键）。

### `cardPower` 的 `playOrder` 参数排查

`cardPower(card, trumpSuit, playOrder = 0)` 对非主牌 `'10'`/`'2'` 两种点数的取值依赖 `playOrder`（`9500-playOrder`/`9300-playOrder`）——这意味着理论上，同 `pairKey` 的两张牌如果传入不同的 `playOrder` 会算出不同的 `cardPower`，破坏"同 pairKey 的牌 `cardPower` 必然相同"这一改动1隐含依赖的前提。核实 `_checkNoVoluntaryScore` 全部 `cardPower(...)` 调用点：均未传第三个参数，恒为默认值0；且比较发生时，`pool`/`followCards`/`expected`/`actual` 涉及的所有候选牌都还是尚未打出的手牌——`playOrder` 只在实际打牌时（`game.js:378,402`）才被赋值到牌对象上。因此在 `_checkNoVoluntaryScore` 的比较场景内，同 pairKey 的多张牌 `cardPower` 必然完全相同，这一风险点不成立，改动1无需为此做额外处理。

### 方案取舍：为什么不通过"重排候选池顺序"规避

曾考虑完全不碰三个既有核心函数、只在调用点通过重新排列传给 `_checkNoVoluntaryScore` 的候选池数组顺序，让"引用恰好相同"这个前提凑巧成立（例如把玩家实际打出的牌排在数组前面）。放弃原因：这依赖数组顺序这种隐晦技巧，需要在三处调用点（成型组合/补位单张/垫异花色）分别正确实现且保持一致，任何一处遗漏都会复现原 bug，可维护性和"确保万无一失"的要求不符，还会让 `_checkNoVoluntaryScore` 的行为依赖调用方"凑巧传对顺序"这种脆弱约定。改动1直接修复比较逻辑本身，不依赖任何调用方约定，更稳妥。

### 测试计划（追加场景9-14）

在既有 `test/fix11-voluntary-score-structure-conflict.mjs` 的8个场景后追加：

9. **PAIR，跳过中间那张（K1,K3）**：同花色 K♣K♣K♣ 三张 + 配不成对的 Q，跟对子。玩家出 K1、K3（跳过内部固定选中的 K2）。应放行。（验证：这个具体输入下，"仅改动1"或"仅改动2"单独都不够，两处必须同时生效——分别会在补位单张层级的"不能主动垫分牌"短路检查、或成型组合层级的排序比较处失败。）
10. **PAIR，跳过第一张（K2,K3）**：同一手牌，玩家出 K2、K3（跳过内部固定选中的 K1）。应放行。与场景9互补：验证不同的"跳过哪一张"在旧代码下会从不同的检查点触发误判（场景9败于补位单张层级，场景10败于成型组合层级），两者合起来确认无论玩家跳过哪一张都必须正确处理，不是碰巧命中某个特例。
11. **TRIPLE，恰好3张、顺序打乱**：同花色恰好3张K，无多余，跟三同张，三张全出但玩家传入顺序是 `[K3,K1,K2]`（非内部固定的 `[K1,K2,K3]` 顺序）。应放行。这个场景里"成型组合 vs 补位单张"划分没有歧义（3张全部是成型组合，无补位单张），因此这是唯一单独隔离验证"改动1"本身的场景（与改动2的划分逻辑无关）。
12. **PAIR，两个不同 pairKey 都计分（5对 vs K对）**：手里有一对5（5分）和一对K（10分），跟对子，玩家出K对。应判"不能主动垫分牌"违规。验证改动1没有削弱真正"该选更便宜却没选"的检测——这个场景真正走到第730行的排序/比较逻辑（不像既有场景2那样在更早的"不计分牌数量"短路检查就提前返回），是此前测试完全没有覆盖的代码深度。
13. **CONSEC_PAIRS，跳过一张**：连对（K-Q，副牌，`SIDE_RANK_STEP` K=4/Q=3 相邻）——手里K有三张、Q恰好两张，跟连对，玩家出 `[K2,K3,Q1,Q2]`（跳过内部固定选中的 K1）。应放行。此前 CONSEC_PAIRS/CONSEC_TRIPLES 这两个 `effectiveLedType` 分支完全没有测试覆盖，本场景补上。
14. **垫异花色，重复pairKey换牌**：玩家手里完全没有 led 花色的牌（被迫垫异花色），异花色恰好3张同点数非主牌牌（例如三张♣5，互相等价，无不计分替代），跟牌张数2，玩家出其中两张（跳过第三张）。应放行。此场景不涉及 `_forcedGroupCards`/改动2（异花色没有"组"划分），单独验证改动1（第730行的比较逻辑）本身独立修复了垫异花色这条路径——此前认为"异花色不受影响"的结论需要这条测试明确澄清"不受影响"仅限于划分逻辑，不代表该路径完全没有引用比较问题。

### 自查（Fix Round 2）

- **占位符检查**：无 TBD/待定项，改动1、改动2、调用点替换均为可直接使用的完整代码。
- **内部一致性**：改动2新增的 `_partitionByPairKeyCounts` 参数顺序 `(cards, requiredCards, trumpSuit)` 与调用点两处用法一致；返回值 `[matched, rest]` 的解构在两处调用点（`followInSuit`/`handInSuit`）均正确对应到 `followGroup`/`followFiller` 和 `_`/`handFiller`（`handFiller` 只需要 rest 部分，matched 部分用 `,` 跳过，未使用）。
- **范围检查**：改动集中在 `js/rules.js` 内 `_checkNoVoluntaryScore` 一行比较逻辑 + 新增一个 helper 函数 + 调用点替换，加测试文件追加6个场景，范围单一、可独立测试。
- **歧义检查**：判据选择（改动1用 `(scoreValue,cardPower)`、改动2用 `pairKey`）已在"为什么用不同的判据"一节明确论证，不留模糊地带；异花色调用点"要不要改代码"已明确结论为"不改代码、但补测试"，避免与"改动1自动覆盖"这一事实混淆。
