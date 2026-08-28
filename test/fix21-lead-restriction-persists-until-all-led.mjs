import assert from 'node:assert/strict';
import { GameState, Phase } from '../js/game.js';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';

function S(rank) { return new Card(SUIT_SPADES, rank); }
function H(rank) { return new Card(SUIT_HEARTS, rank); }
function C(rank) { return new Card(SUIT_CLUBS, rank); }
function D(rank) { return new Card(SUIT_DIAMONDS, rank); }

// 规则三"还有玩家没当过领出者"时，"最大单张"=其他玩家（无同花色更大的牌、
// 也没有炸弹）压不过的单张，且这条限制持续到三个人都各自当过一次领出者为止。
{
    // 用 _startTrick 直接构造第2墩——不需要完整跑第1墩，只需要正确设置
    // hasPlayed 标记（玩家0已领出过，玩家1/2只跟过牌=还没当过领出者）。
    const game = new GameState();
    game.trumpSuit = null;
    game.trumpCaller = -1;
    game.mustPlayCards = [];
    game.phase = Phase.PLAY;

    // 玩家0剩：黑桃J。玩家1有黑桃A（能压黑桃J），玩家2没有黑桃。
    const sJ = S('J');
    game.players[0].hand = [sJ];
    game.players[1].hand = [S('A'), H('Q')];
    game.players[2].hand = [H('J'), C('5')];
    game.players[0].hasPlayed = true;  // 玩家0已经当过领出者
    game.players[1].hasPlayed = false; // 玩家1还没当过领出者
    game.players[2].hasPlayed = false; // 玩家2还没当过领出者

    game._startTrick(0); // 玩家0继续领出
    assert.notEqual(game.forcedLeadInfo, null,
        '黑桃J被玩家1的黑桃A能压，玩家0没有合法最大单张候选，应触发随机代打');
}

// 对照场景：第2墩玩家0手里有梅花5，对面没有梅花更大的牌，梅花5是合法候选，不触发随机代打。
{
    const game = new GameState();
    game.trumpSuit = null;
    game.trumpCaller = -1;
    game.mustPlayCards = [];
    game.phase = Phase.PLAY;

    const c5 = C('5');
    game.players[0].hand = [c5];
    game.players[1].hand = [S('A'), H('Q')];
    game.players[2].hand = [H('J'), S('K')];
    game.players[0].hasPlayed = true;
    game.players[1].hasPlayed = false;
    game.players[2].hasPlayed = false;

    game._startTrick(0);
    assert.equal(game.forcedLeadInfo, null,
        '梅花5对面没有梅花更大的牌，是合法最大单张候选，不应触发随机代打');
}

console.log('PASS: fix21-lead-restriction-persists-until-all-led');
