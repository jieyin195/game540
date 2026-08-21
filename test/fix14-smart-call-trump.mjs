import assert from 'node:assert/strict';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';
import { aiDecideCallTrump } from '../js/ai.js';

function S(rank) { return new Card(SUIT_SPADES, rank); }
function H(rank) { return new Card(SUIT_HEARTS, rank); }
function C(rank) { return new Card(SUIT_CLUBS, rank); }
function D(rank) { return new Card(SUIT_DIAMONDS, rank); }

// 场景1：牌力明显不够（只有孤零零一张10，没有其他主牌、没有分牌保护），
// 不应该无脑叫主——旧逻辑"有牌就叫"会在这里叫，新逻辑应该 Pass。
{
    const hand = [
        S('10'),
        C('A'), C('K'), C('Q'), C('J'),
        D('A'), D('K'), D('Q'), D('J'),
        H('A'), H('K'), H('Q'), H('J'),
        S('A'), S('K'), S('Q'), S('J'),
    ];
    const call = aiDecideCallTrump(hand, null);
    assert.equal(call, null, `牌力不够时应该 Pass，实际叫了: ${call?.map(c => c.displayName()).join(' ')}`);
}

// 场景2：牌力很强（大量固定主牌 + 该花色分牌成对），应该叫主
{
    const hand = [
        S('10'), S('10'),
        new Card('special', 'big_joker'), new Card('special', 'big_joker'),
        new Card('special', 'small_joker'), new Card('special', 'small_joker'),
        new Card('special', 'character'), new Card('special', 'character'),
        S('A'), S('A'), S('K'), S('K'), S('5'), S('5'),
        H('2'), H('2'), C('2'), C('2'),
    ];
    const call = aiDecideCallTrump(hand, null);
    assert.ok(call, '牌力很强时应该叫主，不应该 Pass');
    assert.equal(call[0].rank, '10', `应该叫花色10激活黑桃，实际叫了: ${call.map(c => c.displayName()).join(' ')}`);
    assert.equal(call[0].suit, SUIT_SPADES);
}

// 场景3：反主门槛应该比初叫更高——用一手刚好够初叫门槛、但达不到反主门槛的牌，
// 初叫应该通过，反主（currentCall 非空）应该 Pass。
{
    const hand = [
        S('3'), S('3'),
        new Card('special', 'character'), new Card('special', 'character'),
        new Card('special', 'big_joker'), new Card('special', 'big_joker'),
        new Card('special', 'small_joker'), new Card('special', 'small_joker'),
        S('10'),
        S('A'), S('A'), S('K'), S('K'), S('5'), S('5'),
    ];
    const initialCall = aiDecideCallTrump(hand, null);
    assert.ok(initialCall, '这手牌初叫门槛应该够，实际 Pass 了');

    const currentCall = [H('10')];
    const counterCall = aiDecideCallTrump(hand, currentCall);
    assert.equal(counterCall, null,
        `反主门槛应该更高，同样的牌不该反主，实际反主了: ${counterCall?.map(c => c.displayName()).join(' ')}`);
}

console.log('PASS: fix14-smart-call-trump');
