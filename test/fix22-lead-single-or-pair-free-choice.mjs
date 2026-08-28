import assert from 'node:assert/strict';
import { GameState, Phase } from '../js/game.js';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';

function S(rank) { return new Card(SUIT_SPADES, rank); }
function H(rank) { return new Card(SUIT_HEARTS, rank); }
function C(rank) { return new Card(SUIT_CLUBS, rank); }
function D(rank) { return new Card(SUIT_DIAMONDS, rank); }

// 规则三"必须出对子或最大单张"是任选的，且"最大单张"=对面压不过的牌。
// 有对子时仍可以选择出一张对面压不过的单张，而不是必须出对子。
{
    const game = new GameState();
    game.trumpSuit = null;
    game.trumpCaller = -1;
    game.mustPlayCards = [];
    game.phase = Phase.PLAY;

    // 玩家0有一对方块5和一张梅花A；对面玩家1/2没有梅花，所以梅花A对面压不过。
    const cA = C('A'), d5a = D('5'), d5b = D('5');
    game.players[0].hand = [cA, d5a, d5b];
    game.players[1].hand = [S('K'), H('K')];
    game.players[2].hand = [S('Q'), H('Q')];
    game.players[0].hasPlayed = false;
    game.players[1].hasPlayed = false;
    game.players[2].hasPlayed = false;

    // 有对子（方块5）时，选择出梅花A（对面压不过的单张）应该合法。
    const [okSingle, errSingle] = game.playCards(0, [cA]);
    assert.equal(okSingle, true, `有对子时仍应允许出对面压不过的单张（梅花A），实际错误: ${errSingle}`);
}

// 反例：出一张对面能压过的单张（比如方块5，对面有方块A），应判违规。
{
    const game = new GameState();
    game.trumpSuit = null;
    game.trumpCaller = -1;
    game.mustPlayCards = [];
    game.phase = Phase.PLAY;

    const cA = C('A'), d5a = D('5'), d5b = D('5');
    game.players[0].hand = [cA, d5a, d5b];
    game.players[1].hand = [D('A'), H('K')]; // 玩家1有方块A，能压过方块5
    game.players[2].hand = [S('Q'), H('Q')];
    game.players[0].hasPlayed = false;
    game.players[1].hasPlayed = false;
    game.players[2].hasPlayed = false;

    const [ok, err] = game.playCards(0, [d5a]); // 方块5，对面玩家1有方块A能压
    assert.equal(ok, false, '对面有方块A能压过方块5，方块5不是最大单张，应判违规');
    assert.ok(err.includes('最大单张'), `错误信息应提示必须出最大单张，实际: ${err}`);
}

console.log('PASS: fix22-lead-single-or-pair-free-choice');
