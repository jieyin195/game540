import assert from 'node:assert/strict';
import { GameState } from '../js/game.js';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';
import { getBiggestSingleCandidates } from '../js/rules.js';

function S(rank) { return new Card(SUIT_SPADES, rank); }
function H(rank) { return new Card(SUIT_HEARTS, rank); }
function C(rank) { return new Card(SUIT_CLUBS, rank); }
function D(rank) { return new Card(SUIT_DIAMONDS, rank); }

// 用户澄清：规则三"必须出最大单张"里的"最大单张"，副牌部分是按每个花色
// 分别算的（同花色 A>K>Q>J>5，不同花色之间无大小之分）——常主时，
// 某花色没有A就是K。重要：只有孤张（pairKey计数=1）才能出单张，
// 成对的牌属于结构牌，出单张时不能拆散开来用。

// 场景1：常主，黑桃没有A，最大单张应该是黑桃K。
{
    const trumpSuit = null;
    const sK = S('K'), sQ = S('Q');
    const candidates = getBiggestSingleCandidates([sK, sQ], trumpSuit);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0], sK, '黑桃没有A时，黑桃组最大单张应该是K');
}

// 场景2：常主，手里同时有黑桃K（黑桃组孤张最大）、红心Q（红心组唯一孤张），
// 两者都应该是合法候选。
{
    const trumpSuit = null;
    const sK = S('K'), sQ = S('Q'), hQ = H('Q');
    const candidates = getBiggestSingleCandidates([sK, sQ, hQ], trumpSuit);
    assert.equal(candidates.length, 2, `应该有黑桃K和红心Q两个候选，实际: ${candidates.map(c => c.displayName())}`);
    assert.ok(candidates.includes(sK));
    assert.ok(candidates.includes(hQ));
}

// 场景3：常主，手里有主牌孤张（小王）+ 副牌孤张（黑桃K），两者都是合法候选。
{
    const trumpSuit = null;
    const smallJoker = new Card('special', 'small_joker');
    const sK = S('K');
    const candidates = getBiggestSingleCandidates([smallJoker, sK], trumpSuit);
    assert.equal(candidates.length, 2);
    assert.ok(candidates.includes(smallJoker));
    assert.ok(candidates.includes(sK));
}

// 场景4：用户实测复现——手里有4张红心A（成炸弹）和1张红心K，红心A是结构牌
// 不能出单张，红心K才是红心组的最大单张（也是唯一合法的红心孤张）。
{
    const trumpSuit = null;
    const hA1 = H('A'), hA2 = H('A'), hA3 = H('A'), hA4 = H('A'), hK = H('K');
    const candidates = getBiggestSingleCandidates([hA1, hA2, hA3, hA4, hK], trumpSuit);
    assert.equal(candidates.length, 1, `4张红心A是炸弹（成对），不能出单张；只有红心K是孤张，实际: ${candidates.map(c => c.displayName())}`);
    assert.equal(candidates[0], hK, '红心K应该是红心组最大单张');
}

// 场景5：一个花色全部成对（比如2张红心A），该花色组没有孤张，就没有该组的最大单张候选。
{
    const trumpSuit = null;
    const hA1 = H('A'), hA2 = H('A'), sK = S('K');
    const candidates = getBiggestSingleCandidates([hA1, hA2, sK], trumpSuit);
    assert.equal(candidates.length, 1, '红心A是对子，不算孤张；只有黑桃K是孤张候选');
    assert.ok(candidates.includes(sK));
    assert.ok(!candidates.includes(hA1) && !candidates.includes(hA2));
}

// 场景6（集成，随机代打判定应该按"是否有任意一组孤张候选能赢"而不是只看单一最大值）：
// 玩家0手里黑桃K打不过对面的黑桃A，但红心Q对面没人能压——
// 玩家0有合法的取胜选择（出红心Q），不应触发随机代打。
{
    const game = new GameState();
    game.trumpSuit = null;
    game.trumpCaller = -1;
    game.mustPlayCards = [];

    const sK = S('K'), hQ = H('Q');
    game.players[0].hand = [sK, hQ];
    game.players[1].hand = [S('A')]; // 能压过黑桃K
    game.players[2].hand = [C('5')]; // 压不过红心Q（不同花色无大小之分）
    game.players[0].hasPlayed = false;
    game.players[1].hasPlayed = false;
    game.players[2].hasPlayed = false;

    game._startTrick(0);
    assert.equal(game.forcedLeadInfo, null,
        `手里有红心Q这个能赢的候选时不应触发随机代打，实际: ${JSON.stringify(game.forcedLeadInfo)}`);
}

// 场景7（回归：主牌组内平局漏候选）：常主时 2 不分花色都固定是主牌，
// 属于同一个"主牌组"；黑桃2和方块2点数相同、各只有1张（孤张），都算候选。
{
    const trumpSuit = SUIT_HEARTS; // 活主，红心5是主
    const s2 = S('2'), d2 = D('2'), sK = S('K');
    const candidates = getBiggestSingleCandidates([s2, d2, sK], trumpSuit);
    assert.equal(candidates.length, 3,
        `黑桃2和方块2都固定是主牌且点数相同应该都算候选，黑桃K是独立的副牌组候选，实际: ${candidates.map(c => c.displayName())}`);
    assert.ok(candidates.includes(s2), '黑桃2应该是主牌组的候选之一');
    assert.ok(candidates.includes(d2), '方块2应该是主牌组的候选之一');
    assert.ok(candidates.includes(sK), '黑桃K是副牌黑桃组唯一的孤张，应该是候选');
}

console.log('PASS: fix23-biggest-single-per-suit-group');
