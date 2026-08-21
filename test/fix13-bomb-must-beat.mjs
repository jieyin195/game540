import assert from 'node:assert/strict';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS } from '../js/card.js';
import { aiFollow } from '../js/ai.js';
import { validateFollow, _canPlayerBeat } from '../js/rules.js';

const trumpSuit = SUIT_HEARTS;
function S(rank) { return new Card(SUIT_SPADES, rank); }
function H(rank) { return new Card(SUIT_HEARTS, rank); }
function C(rank) { return new Card(SUIT_CLUBS, rank); }

// 场景1：领出方是副牌炸弹（黑桃K炸），跟牌方手里没有4张同花色黑桃，
// 但有4张红心2（永远是主牌，构成主牌炸弹）。规则"主牌炸弹可以炸任意
// 4张以内的牌"，_canPlayerBeat 应判定能压，aiFollow 应该选这个主牌炸弹。
{
    const ledCards = [S('K'), S('K'), S('K'), S('K')];
    const hand = [S('A'), S('Q'), H('2'), H('2'), H('2'), H('2'), C('J')];

    const canBeat = _canPlayerBeat(hand, ledCards, ledCards, trumpSuit);
    assert.equal(canBeat, true, '手里有能压过副牌炸弹的主牌炸弹时，_canPlayerBeat 应返回 true');

    const aiChoice = aiFollow(hand, ledCards, ledCards, trumpSuit, true);
    const [ok, err] = validateFollow(aiChoice, ledCards, hand, trumpSuit, true, ledCards, 4);
    assert.equal(ok, true, `aiFollow 选出的牌应该合法，实际错误: ${err}`);
    assert.equal(aiChoice.length, 4);
    assert.ok(aiChoice.every(c => c.suit === SUIT_HEARTS && c.rank === '2'),
        `本墩有分且能用主牌炸弹压时，aiFollow 应该选主牌炸弹，实际选了: ${aiChoice.map(c => c.displayName()).join(' ')}`);
}

// 场景2："能压必压"：明明能用主牌炸弹压过副牌炸弹，却选择垫牌，应该被拒绝
{
    const ledCards = [S('K'), S('K'), S('K'), S('K')];
    const hand = [S('A'), S('Q'), H('2'), H('2'), H('2'), H('2'), C('J'), C('5')];
    const followCards = [S('A'), S('Q'), C('J'), H('2')]; // 没有真正压过去
    const [ok, err] = validateFollow(followCards, ledCards, hand, trumpSuit, true, ledCards, 4);
    assert.equal(ok, false, '有分牌且能用主牌炸弹压时，不压反垫应判违规');
    assert.equal(err, '前面有分牌，能压必压', `错误信息不符，实际: ${err}`);
}

console.log('PASS: fix13-bomb-must-beat');
