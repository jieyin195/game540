import assert from 'node:assert/strict';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_DIAMONDS, SUIT_CLUBS } from '../js/card.js';
import { _canPlayerBeat, getPlayType, PlayType } from '../js/rules.js';

// 场景a：跟牌者没有出牌者的花色（红心），但手里有主牌（黑桃5），应该能压
{
    const hand = [new Card(SUIT_SPADES, '5'), new Card(SUIT_DIAMONDS, 'J')];
    const currentBest = [new Card(SUIT_HEARTS, 'K')];
    const ledCards = [new Card(SUIT_HEARTS, 'K')];
    assert.equal(_canPlayerBeat(hand, currentBest, ledCards, SUIT_SPADES), true,
        '没有出牌者花色但手里有主牌时应该能压');
}

// 场景b1：连对子——手里有两个同花色连续对子，能组成压过led的连对，应该能压
{
    const ledCards = [
        new Card(SUIT_CLUBS, 'Q'), new Card(SUIT_CLUBS, 'Q'),
        new Card(SUIT_CLUBS, 'J'), new Card(SUIT_CLUBS, 'J'),
    ];
    const hand = [
        new Card(SUIT_CLUBS, 'A'), new Card(SUIT_CLUBS, 'A'),
        new Card(SUIT_CLUBS, 'K'), new Card(SUIT_CLUBS, 'K'),
    ];
    assert.equal(getPlayType(ledCards, null), PlayType.CONSEC_PAIRS, '测试前提：ledCards应为连对');
    assert.equal(_canPlayerBeat(hand, ledCards, ledCards, null), true,
        '手里有更大的同花色连对时应该能压（CONSEC_PAIRS）');
}

// 场景b2：连对子——手里只有一个单独的对子，凑不成连对，不应该判定为能压
// （旧代码在这里会误判为true：把led连对里每张牌单独取最大力量值来比较，
//  只要手里有一张点数够大的牌就误报"能压"，而不检查是否真的能组成匹配的连对）
{
    const trumpSuit = SUIT_CLUBS;
    const ledCards = [
        new Card(SUIT_CLUBS, 'K'), new Card(SUIT_CLUBS, 'K'),
        new Card(SUIT_CLUBS, 'Q'), new Card(SUIT_CLUBS, 'Q'),
    ];
    const hand = [
        new Card(SUIT_CLUBS, 'A'), new Card(SUIT_CLUBS, 'A'),
        new Card(SUIT_DIAMONDS, '5'), new Card(SUIT_DIAMONDS, 'J'),
    ];
    assert.equal(getPlayType(ledCards, trumpSuit), PlayType.CONSEC_PAIRS, '测试前提：ledCards应为连对（活主）');
    assert.equal(_canPlayerBeat(hand, ledCards, ledCards, trumpSuit), false,
        '只有一个对子、凑不成连对时不应该判定为能压');
}

console.log('PASS: fix3-can-player-beat');
