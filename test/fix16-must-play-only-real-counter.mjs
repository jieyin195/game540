import assert from 'node:assert/strict';
import { GameState } from '../js/game.js';
import { Card, SUIT_SPADES } from '../js/card.js';

function S10() { return new Card(SUIT_SPADES, '10'); }
function bigJoker() { return new Card('special', 'big_joker'); }
function smallJoker() { return new Card('special', 'small_joker'); }
function character() { return new Card('special', 'character'); }

function freshGame() {
    const game = new GameState();
    game.trumpCaller = -1;
    game.trumpCallCards = [];
    game.mustPlayCards = [];
    game.trumpSuit = null;
    return game;
}

// 场景1：普通叫主，没人反主，最终定局——不强制必出
{
    const game = freshGame();
    const call = [S10(), S10()];
    assert.equal(game.processCallTrump(0, call), true);
    assert.deepEqual(game.mustPlayCards, [], '没人反主时，叫主人不应该被强制必出');
}

// 场景2：玩家0叫主，玩家1反主成功且没人再反——反主亮出来的牌必须强制必出
{
    const game = freshGame();
    game.processCallTrump(0, [S10(), S10()]);
    const counter = [bigJoker(), bigJoker(), bigJoker()]; // 3张反2张，张数更多
    assert.equal(game.processCallTrump(1, counter), true);
    assert.equal(game.mustPlayCards.length, 3, '反主成功后应该强制必出');
    assert.deepEqual(game.mustPlayCards, counter);
}

// 场景3：玩家0叫主，玩家1反主，玩家0又反回去拿回叫主权——
// 只要这一步动作本身是反主，就必须强制必出，跟反主的人是不是最初叫主人无关。
// 玩家0自己反主时亮出来的4张小王，同样必须先出，不能收回。
{
    const game = freshGame();
    game.processCallTrump(0, [S10(), S10()]);
    game.processCallTrump(1, [bigJoker(), bigJoker(), bigJoker()]);
    const reclaim = [smallJoker(), smallJoker(), smallJoker(), smallJoker()]; // 4张反3张
    assert.equal(game.processCallTrump(0, reclaim), true);
    assert.equal(game.mustPlayCards.length, 4,
        '即使是最初叫主的人自己反回来拿回叫主权，反主亮出来的牌依然必须强制必出，不能收回');
    assert.deepEqual(game.mustPlayCards, reclaim);
}

// 场景4：玩家0叫主，玩家1反主，玩家2再反玩家1——反主成功，强制必出
{
    const game = freshGame();
    game.processCallTrump(0, [S10(), S10()]);
    game.processCallTrump(1, [bigJoker(), bigJoker()]);
    const counter2 = [smallJoker(), smallJoker(), smallJoker()]; // 3张反2张
    assert.equal(game.processCallTrump(2, counter2), true);
    assert.equal(game.mustPlayCards.length, 3, '反主成功后应该强制必出');
    assert.deepEqual(game.mustPlayCards, counter2);
}

// 场景5：多轮反复反主后，最后一次反主亮出来的牌依然强制必出
{
    const game = freshGame();
    game.processCallTrump(0, [S10(), S10()]);
    game.processCallTrump(1, [bigJoker(), bigJoker(), bigJoker()]);
    game.processCallTrump(0, [smallJoker(), smallJoker(), smallJoker(), smallJoker()]);
    const counter3 = [character(), character(), character(), character()];
    assert.equal(game.processCallTrump(2, counter3), true);
    assert.equal(game.mustPlayCards.length, 4, '最后一次反主亮出来的牌应该强制必出');
    assert.deepEqual(game.mustPlayCards, counter3);
}

console.log('PASS: fix16-must-play-only-real-counter');
