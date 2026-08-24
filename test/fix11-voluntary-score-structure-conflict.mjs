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

// 场景5（垫异花色也受结构限制，不分花色）：玩家手里完全没有led花色的牌，
// 只能垫异花色。结构优先级（有对子先出对子）不分花色——手里的方块K对子
// 互相同花色同点数，即使要垫的是跟领出完全不同的花色，也必须整对打出，
// 不能为了省分拆开、换成方块J这种不算分的单张。
{
    const DK1 = new Card(SUIT_DIAMONDS, 'K');
    const DK2 = new Card(SUIT_DIAMONDS, 'K');
    const DJ  = new Card(SUIT_DIAMONDS, 'J');
    const ledCards    = [new Card(SUIT_CLUBS, 'Q'), new Card(SUIT_CLUBS, 'Q')];
    const hand        = [DK1, DK2, DJ];

    const [okPair, errPair] = validateFollow([DK1, DK2], ledCards, hand, null, false, [], 2);
    assert.equal(okPair, true, `异花色但成对的方块K必须整对打出，应该合法，实际错误: ${errPair}`);

    const [okBroken, errBroken] = validateFollow([DK1, DJ], ledCards, hand, null, false, [], 2);
    assert.equal(okBroken, false, '手里有异花色对子时，拆开对子换成不算分的单张应判违规');
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
