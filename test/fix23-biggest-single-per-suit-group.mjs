import assert from 'node:assert/strict';
import { GameState } from '../js/game.js';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';
import { getBiggestSingleCandidates } from '../js/rules.js';

function S(rank) { return new Card(SUIT_SPADES, rank); }
function H(rank) { return new Card(SUIT_HEARTS, rank); }
function C(rank) { return new Card(SUIT_CLUBS, rank); }
function D(rank) { return new Card(SUIT_DIAMONDS, rank); }

// 用户澄清：规则三"必须出最大单张"里的"最大单张"，副牌部分是按每个花色
// 分别算的（同花色 A>K>Q>J>5，不同花色之间无大小之分、先出者大）——常主时，
// 某花色没有A就是K，是"该花色组里最大"，不是"整手牌里cardPower最大"。
// getBiggestSingleCandidates 应该按"主牌组 + 4个副牌花色组"分别取各组最大。

// 场景1：常主，黑桃没有A，最大单张应该是黑桃K（不是随便什么其他花色的牌）。
{
    const trumpSuit = null;
    const sK = S('K'), sQ = S('Q');
    const candidates = getBiggestSingleCandidates([sK, sQ], trumpSuit);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0], sK, '黑桃没有A时，黑桃组最大单张应该是K');
}

// 场景2：常主，手里同时有黑桃K（黑桃组最大）、红心Q（红心组唯一，天然最大），
// 两者都应该是合法候选——不是只取其中cardPower更大的那一个。
{
    const trumpSuit = null;
    const sK = S('K'), sQ = S('Q'), hQ = H('Q');
    const candidates = getBiggestSingleCandidates([sK, sQ, hQ], trumpSuit);
    assert.equal(candidates.length, 2, `应该有黑桃K和红心Q两个候选，实际: ${candidates.map(c => c.displayName())}`);
    assert.ok(candidates.includes(sK));
    assert.ok(candidates.includes(hQ));
}

// 场景3：常主，手里有主牌（比如小王）时，主牌组单独成一组，且规则明确"主牌
// 大于任何副牌"，主牌组的最大单张和副牌组的最大单张都是合法候选（各自都是
// 本组最大），领出时选哪个都行。
{
    const trumpSuit = null;
    const smallJoker = new Card('special', 'small_joker');
    const sK = S('K');
    const candidates = getBiggestSingleCandidates([smallJoker, sK], trumpSuit);
    assert.equal(candidates.length, 2);
    assert.ok(candidates.includes(smallJoker));
    assert.ok(candidates.includes(sK));
}

// 场景4（集成，随机代打判定应该按"是否有任意一组候选能赢"而不是只看单一
// 最大值）：玩家0手里黑桃K打不过对面的黑桃A，但红心Q对面没人能压——
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

// 场景5（回归：主牌组内平局漏候选）：常主时 2 不分花色都固定是主牌，
// 属于同一个"主牌组"；黑桃2和方块2点数相同（互相"先出者大"，规则2.2/2.3），
// 应该都算合法的"主牌组最大单张"，不能因为遍历顺序只留其中一张——
// 之前 aiLead 用整手牌 reduce 求最大值时可能选中被漏掉的那张，导致合法的
// AI 领牌被 validateFollow 拒绝退到安全兜底（真实复现于 smoke-full-games）。
{
    const trumpSuit = SUIT_HEARTS; // 活主，红心5是主
    const s2 = S('2'), d2 = D('2'), sK = S('K');
    const candidates = getBiggestSingleCandidates([s2, d2, sK], trumpSuit);
    // 3个候选：主牌组的黑桃2+方块2（点数相同，都是主牌组最大），
    // 加上黑桃K自己单独成一组（黑桃K不是主牌，是副牌里的黑桃组，天然最大）。
    assert.equal(candidates.length, 3,
        `黑桃2和方块2都固定是主牌且点数相同应该都算候选，黑桃K是独立的副牌组候选，实际: ${candidates.map(c => c.displayName())}`);
    assert.ok(candidates.includes(s2), '黑桃2应该是主牌组的候选之一');
    assert.ok(candidates.includes(d2), '方块2应该是主牌组的候选之一');
    assert.ok(candidates.includes(sK), '黑桃K是副牌黑桃组唯一的牌，应该是候选');
}

console.log('PASS: fix23-biggest-single-per-suit-group');
