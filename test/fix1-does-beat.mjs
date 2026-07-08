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
