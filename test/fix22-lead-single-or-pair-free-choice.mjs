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
// 注意：无主时不同花色之间的 cardPower 只是实现内部用来给"随便比个大小"
// 的任意排序（不代表真实点数大小），这里用 D('Q')（方块Q）作为这手牌里
// 排序最大的单张，实际用哪张不重要，只要和实现的判定口径一致即可。
{
    const game = new GameState();
    game.trumpSuit = null;
    game.trumpCaller = -1;
    game.mustPlayCards = [];

    // 玩家0手里有一对方块5，还有梅花A、方块Q。第1墩，玩家1、玩家2都还没
    // 当过领出者，玩家0领出。
    const cA = C('A'), d5a = D('5'), d5b = D('5'), dQ = D('Q');
    game.players[0].hand = [cA, d5a, d5b, dQ];
    game.players[1].hand = [S('K'), H('K')];
    game.players[2].hand = [S('Q'), H('Q')];

    // 手里有对子（方块5对）时，选择出手里最大的单张（方块Q）应该合法——
    // 不强制必须出对子。
    const [okSingle, errSingle] = game.playCards(0, [dQ]);
    assert.equal(okSingle, true, `有对子时仍应允许选择出最大单张，实际错误: ${errSingle}`);
}

// 反例：手里有对子时，出一张既不是对子也不是"手里最大单张"的单张，仍应判违规
// （对子/最大单张是任选，但单张必须是最大的那张，不能随便挑一张小的单出）。
{
    const game = new GameState();
    game.trumpSuit = null;
    game.trumpCaller = -1;
    game.mustPlayCards = [];

    const cA = C('A'), d5a = D('5'), d5b = D('5'), dQ = D('Q');
    game.players[0].hand = [cA, d5a, d5b, dQ];
    game.players[1].hand = [S('K'), H('K')];
    game.players[2].hand = [S('Q'), H('Q')];

    const [ok, err] = game.playCards(0, [cA]); // 梅花A，不是手里最大单张（方块Q更大），也不是对子
    assert.equal(ok, false, '出的单张不是手里最大的那张时，仍应判违规');
    assert.ok(err.includes('最大单张'), `错误信息应提示必须出最大单张，实际: ${err}`);
}

console.log('PASS: fix22-lead-single-or-pair-free-choice');
