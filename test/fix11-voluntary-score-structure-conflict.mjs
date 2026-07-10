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

console.log('PASS: fix11-voluntary-score-structure-conflict');
