import assert from 'node:assert/strict';
import { GameState } from '../js/game.js';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS } from '../js/card.js';

function S10() { return new Card(SUIT_SPADES, '10'); }
function H10() { return new Card(SUIT_HEARTS, '10'); }
function C10() { return new Card(SUIT_CLUBS, '10'); }
function bigJoker() { return new Card('special', 'big_joker'); }
function smallJoker() { return new Card('special', 'small_joker'); }
function character() { return new Card('special', 'character'); }
function three() { return new Card(SUIT_SPADES, '3'); }

function freshGame() {
    const game = new GameState();
    game.trumpCaller = -1;
    game.trumpCallCards = [];
    game.mustPlayCards = [];
    game.originalCallerIdx = -1;
    game.trumpSuit = null;
    return game;
}

// 场景1：普通叫主，没人反主，最终定局——不强制必出
{
    const game = freshGame();
    const call = [S10(), S10()];
    assert.equal(game.processCallTrump(0, call), true);
    assert.deepEqual(game.mustPlayCards, [], '没人反主时，叫主人不应该被强制必出');
    assert.equal(game.originalCallerIdx, 0);
}

// 场景2：玩家0叫主，玩家1反主成功且没人再反——反主人（非最初叫主人）应该被强制必出
{
    const game = freshGame();
    game.processCallTrump(0, [S10(), S10()]);
    const counter = [bigJoker(), bigJoker(), bigJoker()]; // 3张反2张，张数更多
    assert.equal(game.processCallTrump(1, counter), true);
    assert.equal(game.mustPlayCards.length, 3, '玩家1不是最初叫主人，反主成功后应该强制必出');
    assert.deepEqual(game.mustPlayCards, counter);
}

// 场景3：玩家0叫主，玩家1反主，玩家0又反回去拿回叫主权——
// 玩家0还是最初叫主人，不应该被强制必出（这是本次要修的核心场景）
{
    const game = freshGame();
    game.processCallTrump(0, [S10(), S10()]);
    game.processCallTrump(1, [bigJoker(), bigJoker(), bigJoker()]);
    const reclaim = [smallJoker(), smallJoker(), smallJoker(), smallJoker()]; // 4张反3张
    assert.equal(game.processCallTrump(0, reclaim), true);
    assert.deepEqual(game.mustPlayCards, [],
        '玩家0是最初叫主人，即使中途被反、自己又反回来，也不应该被强制必出');
    assert.equal(game.originalCallerIdx, 0, 'originalCallerIdx 应该全程保持为最初叫主人，不随反主变化');
}

// 场景4：玩家0叫主，玩家1反主，玩家2再反玩家1（不是最初叫主人）——应该强制必出
{
    const game = freshGame();
    game.processCallTrump(0, [S10(), S10()]);
    game.processCallTrump(1, [bigJoker(), bigJoker()]);
    const counter2 = [smallJoker(), smallJoker(), smallJoker()]; // 3张反2张
    assert.equal(game.processCallTrump(2, counter2), true);
    assert.equal(game.mustPlayCards.length, 3, '玩家2不是最初叫主人，反主成功后应该强制必出');
    assert.deepEqual(game.mustPlayCards, counter2);
}

// 场景5：玩家0叫主，玩家1反主，玩家0反回来，玩家2再反玩家0——
// 最终站住的是玩家2，不是最初叫主人玩家0，应该强制必出
{
    const game = freshGame();
    game.processCallTrump(0, [S10(), S10()]);
    game.processCallTrump(1, [bigJoker(), bigJoker(), bigJoker()]);
    game.processCallTrump(0, [smallJoker(), smallJoker(), smallJoker(), smallJoker()]);
    const counter3 = [three(), new Card(SUIT_SPADES, '3'), new Card(SUIT_SPADES, '3'), new Card(SUIT_SPADES, '3')];
    // 对3固定黑桃3，只有2张实体牌，用4张同点数字牌代替张数验证不重要，
    // 这里只关心 mustPlayCards 的强制逻辑，直接用 canCounterTrump 认可的字牌张数更简单：
    const counter3b = [character(), character(), character(), character()];
    assert.equal(game.processCallTrump(2, counter3b), true);
    assert.equal(game.mustPlayCards.length, 4, '最终站住的不是最初叫主人时，应该强制必出');
}

console.log('PASS: fix16-must-play-only-real-counter');
