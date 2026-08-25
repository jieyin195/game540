import assert from 'node:assert/strict';
import { GameState } from '../js/game.js';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';
import { aiFollow } from '../js/ai.js';
import { submitAiPlay } from '../js/input.js';

function D(rank) { return new Card(SUIT_DIAMONDS, rank); }
function S(rank) { return new Card(SUIT_SPADES, rank); }
function H(rank) { return new Card(SUIT_HEARTS, rank); }
function C(rank) { return new Card(SUIT_CLUBS, rank); }

// 场景：领出方块对Q（2张），中途被玩家1用主牌炸弹（4张小王）炸了，
// trickCardCount 变成4。最后一个跟牌人（玩家2）手里没有方块，只能垫牌。
//
// 这条路径此前完全没被测过（真实对局里炸弹极罕见），复现出一个真实 bug：
// aiFollow 不知道被炸后张数变了，还按原来2张决策，之后靠一个不看分值的
// 粗暴补位逻辑硬凑张数，导致校验失败、退到安全兜底/暴力兜底。
//
// 注意："有对子先出对子"这条结构优先级只在同花色范围内强制——玩家2手里
// 完全没有方块，垫牌全部是异花色，不要求凑对子结构，只要求"不能主动垫分"：
// 应该优先用不算分的红心J对子（2张），剩下2张从算分牌里挑分值最小的
// （梅花5=5分 + 黑桃K=10分），没必要为了凑"对子"整对打出10分/张的黑桃K对。
const game = new GameState();
game.trumpSuit = null;
game.trumpCaller = -1;
game.mustPlayCards = [];

const ledCards = [D('Q'), D('Q')];
game.currentTrick = [{
    playerIdx: 0, cards: ledCards, padCards: [],
    score() { return 0; }, allCards() { return ledCards; },
}];
game.trickCardCount = 2;
game.firstPlayer = 0;
game.players[0].hasPlayed = true;

const bombCards = [
    new Card('special', 'small_joker'), new Card('special', 'small_joker'),
    new Card('special', 'small_joker'), new Card('special', 'small_joker'),
];
game.players[1].hand = [...bombCards, D('5')];
const [okBomb] = game.playCards(1, [...bombCards], false);
assert.equal(okBomb, true, '主牌炸弹应该能合法炸掉方块对子的领出');

game.players[0].hand = [D('Q'), D('Q'), D('J'), D('K')];
game.checkAndProcessBombPad();
assert.equal(game.trickCardCount, 4, '被炸后 trickCardCount 应该变成4');

// 玩家2没有方块，手里有一对黑桃K（10分/张）、一对红心J（不算分）、一张梅花5（5分）
const hand2 = [S('K'), S('K'), H('J'), H('J'), C('5')];
game.players[2].hand = hand2;

const ledCardsForP2  = game.getLedCards();
const currentBest    = game.getCurrentBest();
const trickHasScore  = game.trickHasScore();

const aiChoice = aiFollow(hand2, ledCardsForP2, currentBest, null, trickHasScore, game.trickCardCount);
assert.equal(aiChoice.length, 4, 'aiFollow 应该直接给出被炸后需要的4张，不依赖后续补位');

const totalScore = aiChoice.reduce((s, c) => s + c.scoreValue(), 0);
assert.equal(totalScore, 15,
    `异花色垫牌不要求凑对子，应优先用不算分的红心J对子(0分)+分值最小的梅花5(5分)+黑桃K(10分)=15，实际: ${aiChoice.map(c => c.displayName()).join(' ')} 总分值${totalScore}`);
assert.equal(aiChoice.filter(c => c.suit === SUIT_HEARTS && c.rank === 'J').length, 2,
    '不算分的红心J对子应该全部用上');

const [ok, finalCards] = submitAiPlay(game, 2, aiChoice, {
    ledCards: ledCardsForP2, hand: hand2, trumpSuit: null, needed: game.trickCardCount, anyUnplayed: false,
});
assert.equal(ok, true, `submitAiPlay 应该一次性通过校验，不用退到安全兜底，实际出牌: ${finalCards.map(c => c.displayName()).join(' ')}`);

console.log('PASS: fix18-bombed-follow-count-and-unstructured-fallback');
