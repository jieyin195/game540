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
