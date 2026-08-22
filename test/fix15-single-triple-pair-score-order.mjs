import assert from 'node:assert/strict';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';
import { aiFollow } from '../js/ai.js';
import { validateFollow } from '../js/rules.js';

// 场景1（用户实测复现）：活主=方块，领出方块打了 ♠5♠5♠5（黑桃3同张，非主牌）。
// 跟牌方手里没有黑桃，只能垫牌，手里同时有"分值小的方块5"和"分值大的字牌/红心10"
// 这类主牌。按"分小牌小顺序"，应该优先垫分值小的牌。
{
    const trumpSuit = SUIT_DIAMONDS;
    function S(rank) { return new Card(SUIT_SPADES, rank); }
    function H(rank) { return new Card(SUIT_HEARTS, rank); }
    function D(rank) { return new Card(SUIT_DIAMONDS, rank); }

    function C(rank) { return new Card(SUIT_CLUBS, rank); }

    const ledCards = [S('5'), S('5'), S('5')];
    // 手里没有黑桃；有方块5（5分，主牌）、字牌（10分，主牌）、红心10（10分，主牌）、
    // 以及不算分的黑桃以外单张（梅花Q，不算分，可惜不是黑桃跟不上）
    const hand = [D('5'), new Card('special', 'character'), H('10'), C('Q')];

    const aiChoice = aiFollow(hand, ledCards, ledCards, trumpSuit, false);
    const [ok, err] = validateFollow(aiChoice, ledCards, hand, trumpSuit, false, ledCards, 3);
    assert.equal(ok, true, `aiFollow 选出的牌应该合法，实际错误: ${err}`);

    const totalScore = aiChoice.reduce((s, c) => s + c.scoreValue(), 0);
    // 手里没有黑桃、也没有别的不算分单张能凑够3张（只有1张梅花Q不算分），
    // 必须垫2张分牌，理论最小方案是"方块5(5分) + 字牌或红心10中分值更小的" ——
    // 这里两张都是10分，没有差别，但方块5(5分)必须被选中，不能被字牌/红心10顶替。
    assert.ok(aiChoice.some(c => c.suit === SUIT_DIAMONDS && c.rank === '5'),
        `分值最小的方块5应该被优先选中，实际选了: ${aiChoice.map(c => c.displayName()).join(' ')}`);
    assert.equal(totalScore, 15, `理论最小总分值应为15(5+10)，实际: ${totalScore}`);
}

// 场景2（_pickSmallestCard，跟单张）：手里没有领出花色，只能垫牌；
// 全是分牌时必须选分值最小的那张，不能被 cardPower 的花色排序带偏。
{
    const trumpSuit = null;
    function S(rank) { return new Card(SUIT_SPADES, rank); }
    function H(rank) { return new Card(SUIT_HEARTS, rank); }
    function D(rank) { return new Card(SUIT_DIAMONDS, rank); }

    const ledCards = [new Card('special', 'character')]; // 字牌单张领出，跟牌方没有字牌
    const hand = [D('5'), H('K')]; // 方块5(5分) vs 红心K(10分)，应该选方块5
    const aiChoice = aiFollow(hand, ledCards, ledCards, trumpSuit, false);
    assert.equal(aiChoice.length, 1);
    assert.equal(aiChoice[0].rank, '5', `应该选分值更小的方块5，实际选了: ${aiChoice[0].displayName()}`);
}

console.log('PASS: fix15-single-triple-pair-score-order');
