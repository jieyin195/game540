import assert from 'node:assert/strict';
import { GameState } from '../js/game.js';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';

function S(rank) { return new Card(SUIT_SPADES, rank); }
function H(rank) { return new Card(SUIT_HEARTS, rank); }
function C(rank) { return new Card(SUIT_CLUBS, rank); }
function D(rank) { return new Card(SUIT_DIAMONDS, rank); }

// 用户实测复现：规则三"必须出对子或最大的单张"是任选的——不管手里有没有
// 对子，都可以选择出一组对子/三同张/连对，也可以选择出手里最大的单张，
// 不是"有对子就必须出对子、不能出单张"。
{
    const game = new GameState();
    game.trumpSuit = null;
    game.trumpCaller = -1;
    game.mustPlayCards = [];

    // 玩家0手里有一对方块5，还有梅花A（梅花组唯一的牌，天然是梅花组最大）。
    // 第1墩，玩家1、玩家2都还没当过领出者，玩家0领出。
    const cA = C('A'), d5a = D('5'), d5b = D('5');
    game.players[0].hand = [cA, d5a, d5b];
    game.players[1].hand = [S('K'), H('K')];
    game.players[2].hand = [S('Q'), H('Q')];

    // 手里有对子（方块5对）时，选择出手里最大的单张（梅花A）应该合法——
    // 不强制必须出对子。
    const [okSingle, errSingle] = game.playCards(0, [cA]);
    assert.equal(okSingle, true, `有对子时仍应允许选择出最大单张，实际错误: ${errSingle}`);
}

// "最大单张"按主/副牌分开算，不是整手牌里 cardPower 最大的那张：无主时，
// 手里若同时有梅花A和方块Q，两者分属不同的副牌组（互相无大小之分，规则
// 2.2），各自都是本组最大——出梅花A、出方块Q都应该合法。
{
    const game = new GameState();
    game.trumpSuit = null;
    game.trumpCaller = -1;
    game.mustPlayCards = [];

    const cA = C('A'), dQ = D('Q'), d5a = D('5'), d5b = D('5');
    game.players[0].hand = [cA, dQ, d5a, d5b];
    game.players[1].hand = [S('K'), H('K')];
    game.players[2].hand = [S('Q'), H('Q')];

    const [okClub] = game.playCards(0, [cA]);
    assert.equal(okClub, true, '梅花A是梅花组里最大的单张，应该合法（不要求是整手牌cardPower最大）');
}
{
    const game = new GameState();
    game.trumpSuit = null;
    game.trumpCaller = -1;
    game.mustPlayCards = [];

    const cA = C('A'), dQ = D('Q'), d5a = D('5'), d5b = D('5');
    game.players[0].hand = [cA, dQ, d5a, d5b];
    game.players[1].hand = [S('K'), H('K')];
    game.players[2].hand = [S('Q'), H('Q')];

    const [okDiamond] = game.playCards(0, [dQ]);
    assert.equal(okDiamond, true, '方块Q是方块组里最大的单张（另有方块5×2但Q更大），应该合法');
}

// 反例：出一张既不是任何组最大、也不是对子的单张，仍应判违规。
// 手里方块有Q和5（两张5成对，Q单独且比5大——方块组最大是Q，不是5）。
{
    const game = new GameState();
    game.trumpSuit = null;
    game.trumpCaller = -1;
    game.mustPlayCards = [];

    const cA = C('A'), dQ = D('Q'), d5a = D('5'), d5b = D('5');
    game.players[0].hand = [cA, dQ, d5a, d5b];
    game.players[1].hand = [S('K'), H('K')];
    game.players[2].hand = [S('Q'), H('Q')];

    const [ok, err] = game.playCards(0, [d5a]); // 方块5，方块组里不是最大的（方块Q更大），也不是对子（方块5对子要两张一起出）
    assert.equal(ok, false, '出的单张既不是任何组里最大的、也不是对子时，应判违规');
    assert.ok(err.includes('最大单张'), `错误信息应提示必须出最大单张，实际: ${err}`);
}

console.log('PASS: fix22-lead-single-or-pair-free-choice');
