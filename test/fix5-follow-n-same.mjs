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
