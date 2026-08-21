import assert from 'node:assert/strict';
import { Card, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';
import { validateFollow } from '../js/rules.js';

// 复现用户截图场景：常主模式，玩家1领出 ♦10（主牌单张），"你"手里没有主牌，
// 只能垫副牌，手里有 ♣K、♣5、♦5、♦5。常主下 K 和 5 都计分，♣5/♦5 分值相同
// （都是5分）且不同花色之间"无大小之分"，理应两张5谁先垫都行。
{
    const CK  = new Card(SUIT_CLUBS, 'K');
    const C5  = new Card(SUIT_CLUBS, '5');
    const D5a = new Card(SUIT_DIAMONDS, '5');
    const D5b = new Card(SUIT_DIAMONDS, '5');
    const ledCards = [new Card(SUIT_DIAMONDS, '10')]; // 常主下10永远是主牌

    const hand = [CK, C5, D5a, D5b];

    const [okClubs, errClubs] = validateFollow([C5], ledCards, hand, null, false, ledCards, 1);
    assert.equal(okClubs, true, `垫梅花5应该合法，实际错误: ${errClubs}`);

    const [okDiamonds, errDiamonds] = validateFollow([D5a], ledCards, hand, null, false, ledCards, 1);
    assert.equal(okDiamonds, true, `垫方块5应该同样合法（不同花色的5无大小之分），实际错误: ${errDiamonds}`);
}

console.log('PASS: fix12-cross-suit-score-tie');
