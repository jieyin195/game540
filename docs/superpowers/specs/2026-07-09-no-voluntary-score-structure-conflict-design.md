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

**不改动 `_validateFollowStructure`、`_validateBombFollowStructure`、`_checkNoVoluntaryScore` 三个既有函数本体**，也不改 `_checkNoVoluntaryScore` 的调用签名。只在 `validateFollow` 内部、调用 `_checkNoVoluntaryScore` 处理同花色/主牌部分之前（`validateFollow:819-822`），新增一个纯函数 `_voluntaryScorePool`，把原本直接传入的 `handInSuit` 替换成这个函数收窄后的结果：

```js
/**
 * 计算"不能主动垫分牌"检查应使用的候选池：当 _validateFollowStructure /
 * _validateBombFollowStructure 强制玩家使用某个成型组合（对子/三同张/炸弹）时，
 * 候选池收窄为"手里其他同类型的成型组合"，排除配不成对/三张的零散单张——
 * 它们从来都不是合法的替代出法，不该被当作"本可以少垫分"的证据。
 * 分支逐一镜像 _validateFollowStructure / _validateBombFollowStructure 的
 * 既有强制条件，保证收窄范围与结构规则实际强制的范围完全一致。
 * @param {Card[]} handInSuit
 * @param {string} effectiveLedType
 * @param {number} n - followInSuit.length（本次同花色/主牌实际出牌张数）
 * @param {string|null} trumpSuit
 * @returns {Card[]}
 */
function _voluntaryScorePool(handInSuit, effectiveLedType, n, trumpSuit) {
    if (effectiveLedType === PlayType.PAIR ||
        effectiveLedType === PlayType.CONSEC_PAIRS ||
        effectiveLedType === PlayType.CONSEC_TRIPLES) {
        const pairsAvail = getPairs(handInSuit, trumpSuit);
        if (pairsAvail.length > 0 && n >= 2) return pairsAvail.flat();
        return handInSuit;
    }

    if (effectiveLedType === PlayType.TRIPLE) {
        const triplesAvail = getTriples(handInSuit, trumpSuit);
        if (triplesAvail.length > 0 && n >= 3) return triplesAvail.flat();
        const pairsAvail = getPairs(handInSuit, trumpSuit);
        if (pairsAvail.length > 0 && n >= 2) return pairsAvail.flat();
        return handInSuit;
    }

    if (effectiveLedType === PlayType.BOMB) {
        const bombsAvail = getBombs(handInSuit, trumpSuit);
        if (bombsAvail.length > 0 && n >= 4) return bombsAvail.flat();
        const triplesAvail = getTriples(handInSuit, trumpSuit);
        if (triplesAvail.length > 0 && n >= 3) return triplesAvail.flat();
        const pairsAvail = getPairs(handInSuit, trumpSuit);
        if (pairsAvail.length >= 2 && n >= 4) return pairsAvail.flat();
        if (pairsAvail.length >= 1 && n >= 2) return pairsAvail.flat();
        return handInSuit;
    }

    return handInSuit;
}
```

`validateFollow:819-822` 改为：

```js
if (followInSuit.length > 0 && handInSuit.length > 0) {
    const pool = _voluntaryScorePool(handInSuit, effectiveLedType, followInSuit.length, trumpSuit);
    const [ok, err] = _checkNoVoluntaryScore(followInSuit, pool, trumpSuit, isBeatingPlay);
    if (!ok) return [false, err];
}
```

`823-829`（异花色部分）不改。

### 为什么这样设计能生效（不用改 `_checkNoVoluntaryScore` 本体）

`getPairs`/`getTriples`/`getBombs` 都是按 `pairKey`（即 `suit_rank`）分组——**同一组里的牌 `scoreValue()` 和 `cardPower()` 必然完全相同**（同花色同点数）。`_checkNoVoluntaryScore` 内部按 `(scoreValue, cardPower)` 排序、取"最小的前N张"来判断是否按"分小牌小"顺序垫牌。当候选池收窄为"别的成型组合"后：

- 如果别的组合里有不计分的（比如另一对非计分对子），它会自然排在计分牌前面，`_checkNoVoluntaryScore` 现有逻辑会正确要求玩家优先用那对——这正是用户说的"有其他对子就不要打分牌对子"。
- 如果收窄后候选池里**只剩**这一组计分牌本身（唯一能凑成的组合就是它），`nonScore` 数量为0，`_checkNoVoluntaryScore` 会正确判定"没有更便宜的选择"，放行。

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
