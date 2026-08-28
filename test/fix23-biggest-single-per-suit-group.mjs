import assert from 'node:assert/strict';
import { GameState, Phase } from '../js/game.js';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';
import { getBiggestSingleCandidates } from '../js/rules.js';

function S(rank) { return new Card(SUIT_SPADES, rank); }
function H(rank) { return new Card(SUIT_HEARTS, rank); }
function C(rank) { return new Card(SUIT_CLUBS, rank); }
function D(rank) { return new Card(SUIT_DIAMONDS, rank); }

// "最大单张"=其他玩家既无法以同花色更大的单张、也无法以炸弹压过的牌。

// 场景1：对面没有同花色更大的牌，所有牌都是候选。
{
    const trumpSuit = null;
    const sQ = S('Q'), hQ = H('Q');
    const candidates = getBiggestSingleCandidates([sQ, hQ], [[C('A'), D('J')]], trumpSuit);
    assert.ok(candidates.includes(sQ), '对面没有黑桃更大的牌，黑桃Q是候选');
    assert.ok(candidates.includes(hQ), '对面没有红心更大的牌，红心Q是候选');
}

// 场景2：对面有同花色更大的单张，该牌不是候选。
{
    const trumpSuit = null;
    const sQ = S('Q'), hQ = H('Q');
    const candidates = getBiggestSingleCandidates([sQ, hQ], [[S('K')]], trumpSuit);
    assert.ok(!candidates.includes(sQ), '对面有黑桃K，黑桃Q被压，不是候选');
    assert.ok(candidates.includes(hQ), '对面没有红心更大的牌，红心Q是候选');
}

// 场景3：对面有主牌炸弹，任何单张都被炸，没有候选。
{
    const trumpSuit = null;
    const sQ = S('Q'), hQ = H('Q');
    const bigJoker = new Card('special', 'big_joker');
    const bombs = [bigJoker, bigJoker, bigJoker, bigJoker]; // 4张大王=主牌炸弹（常主）
    const candidates = getBiggestSingleCandidates([sQ, hQ], [bombs], trumpSuit);
    assert.equal(candidates.length, 0, '对面有主牌炸弹，任何单张都被炸，候选为空');
}

// 场景4：对面有红心副牌炸弹（4张红心A），红心K不是候选；但黑桃Q对面没有炸弹也压不过，是候选。
{
    const trumpSuit = null;
    const sQ = S('Q'), hK = H('K');
    const hA1=H('A'), hA2=H('A'), hA3=H('A'), hA4=H('A');
    const candidates = getBiggestSingleCandidates([sQ, hK], [[hA1,hA2,hA3,hA4]], trumpSuit);
    assert.ok(!candidates.includes(hK), '对面有红心A炸弹，红心K被炸，不是候选');
    assert.ok(candidates.includes(sQ), '对面没有黑桃炸弹也没有黑桃更大的牌，黑桃Q是候选');
}

// 场景5（集成：随机代打触发——手里所有牌都能被对面炸弹炸掉）
{
    const game = new GameState();
    game.trumpSuit = null;
    game.trumpCaller = -1;
    game.mustPlayCards = [];
    game.phase = Phase.PLAY;

    const sQ = S('Q');
    const bj = new Card('special', 'big_joker');
    game.players[0].hand = [sQ];
    game.players[1].hand = [bj, bj, bj, bj]; // 4张大王=主牌炸弹
    game.players[2].hand = [C('5')];
    game.players[0].hasPlayed = false;
    game.players[1].hasPlayed = false;
    game.players[2].hasPlayed = false;

    game._startTrick(0);
    assert.notEqual(game.forcedLeadInfo, null, '对面有主牌炸弹，手里没有合法最大单张，应触发随机代打');
}

// 场景6（不触发）：有一张牌对面既没有同花色更大的也没有炸弹压。
{
    const game = new GameState();
    game.trumpSuit = null;
    game.trumpCaller = -1;
    game.mustPlayCards = [];
    game.phase = Phase.PLAY;

    const hQ = H('Q');
    game.players[0].hand = [hQ];
    game.players[1].hand = [S('A'), C('A')];
    game.players[2].hand = [D('K')];
    game.players[0].hasPlayed = false;
    game.players[1].hasPlayed = false;
    game.players[2].hasPlayed = false;

    game._startTrick(0);
    assert.equal(game.forcedLeadInfo, null, '红心Q对面压不过，是合法候选，不应触发随机代打');
}

console.log('PASS: fix23-biggest-single-per-suit-group');
