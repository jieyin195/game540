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
