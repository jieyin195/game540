import assert from 'node:assert/strict';
import { Card, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';
import { GameState, TrickEntry, Phase } from '../js/game.js';
import { submitAiPlay } from '../js/input.js';

function freshGame() {
    const game = new GameState();
    game.phase         = Phase.PLAY;
    game.trumpSuit     = null;
    game.trumpCaller   = -1;
    game.mustPlayCards = [];
    for (const p of game.players) { p.hand = []; p.hasPlayed = false; p.trickScore = 0; }
    return game;
}

// 场景1：AI 返回了不合规则的牌（有同花色梅花J却出了异花色方块A），
// 安全兜底应该改出正确的同花色牌，不应该把违规牌直接打出去
{
    const game = freshGame();
    const leader = 2;
    game.firstPlayer    = 0;
    game.currentTrick   = [new TrickEntry(0, [new Card(SUIT_CLUBS, 'K')])];
    game.trickCardCount = 1;
    const clubJ    = new Card(SUIT_CLUBS, 'J');
    const diamondA = new Card(SUIT_DIAMONDS, 'A');
    game.players[2].hand = [clubJ, diamondA];

    const badCards = [diamondA];
    const warnCalls  = [];
    const errorCalls = [];
    const origWarn  = console.warn;
    const origError = console.error;
    console.warn  = (...a) => warnCalls.push(a);
    console.error = (...a) => errorCalls.push(a);

    let ok, finalCards;
    try {
        [ok, finalCards] = submitAiPlay(game, leader, badCards, {
            ledCards:    game.getLedCards(),
            hand:        game.players[2].hand,
            trumpSuit:   game.trumpSuit,
            needed:      1,
            anyUnplayed: false,
        });
    } finally {
        console.warn  = origWarn;
        console.error = origError;
    }

    assert.equal(ok, true, '安全兜底后应该成功出牌');
    assert.equal(finalCards.length, 1);
    assert.equal(finalCards[0], clubJ, '兜底应该改出同花色的梅花J，而不是保留违规的方块A');
    assert.equal(warnCalls.length, 1, '应该记录一次"使用安全兜底"警告');
    assert.equal(errorCalls.length, 0, '不应该走到暴力兜底（安全兜底已经成功）');
}

// 场景2：结构化安全兜底本身也没有尝试压牌，如果这一手恰好该压牌，
// 兜底也会被拒绝——此时应该退到暴力方案，保证过程不抛异常、必定出牌成功
{
    const game = freshGame();
    const leader = 2;
    game.firstPlayer    = 0;
    game.currentTrick   = [new TrickEntry(0, [new Card(SUIT_CLUBS, 'K')])]; // K带10分，本墩有分
    game.trickCardCount = 1;
    const clubA = new Card(SUIT_CLUBS, 'A'); // 能压过梅花K
    const clubJ = new Card(SUIT_CLUBS, 'J'); // 不能压过梅花K
    game.players[2].hand = [clubA, clubJ];

    const badCards = [clubJ]; // 有能压的牌（clubA）却出了不能压的牌，违反"有分必压"
    const warnCalls  = [];
    const errorCalls = [];
    const origWarn  = console.warn;
    const origError = console.error;
    console.warn  = (...a) => warnCalls.push(a);
    console.error = (...a) => errorCalls.push(a);

    let ok, finalCards;
    try {
        [ok, finalCards] = submitAiPlay(game, leader, badCards, {
            ledCards:    game.getLedCards(),
            hand:        game.players[2].hand,
            trumpSuit:   game.trumpSuit,
            needed:      1,
            anyUnplayed: false,
        });
    } finally {
        console.warn  = origWarn;
        console.error = origError;
    }

    assert.equal(ok, true, '即使结构化安全兜底也未压牌，暴力方案也应该保证最终出牌成功');
    assert.equal(finalCards.length, 1);
    assert.equal(finalCards[0], clubA, '暴力兜底按手牌原有顺序取牌，应该是clubA');
    assert.equal(warnCalls.length, 1, '应该记录一次"使用安全兜底"警告');
    assert.equal(errorCalls.length, 1, '结构化兜底仍失败时应该记录一次"回退暴力方案"错误');
}

console.log('PASS: fix6-ai-safety-net');
