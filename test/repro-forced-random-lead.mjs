// 验证：规则三扩展——领出者无对子、最大单张打不过别人时，由下家随机抽一张代打
import { Card } from '../js/card.js';
import { GameState } from '../js/game.js';

function S(rank) { return new Card('spades', rank); }
function H(rank) { return new Card('hearts', rank); }
function C(rank) { return new Card('clubs', rank); }
function D(rank) { return new Card('diamonds', rank); }

const game = new GameState();

// 手动摆牌：常主模式，玩家0（玩家1）领出，手里只有孤张10（无对子），
// 玩家2（下标2，玩家2）手里有大王（能压过10），玩家1（下标1，"你"）本局还没出过牌。
game.trumpSuit   = null;
game.trumpCaller = -1;
game.mustPlayCards = [];
game.players[0].hand = [S('10')];
game.players[1].hand = [S('A'), H('K'), D('5')];
game.players[2].hand = [new Card('special', 'big_joker'), C('A')];
game.players[0].hasPlayed = false;
game.players[1].hasPlayed = false;
game.players[2].hasPlayed = false;
game.phase = 'play';

console.log('触发前 玩家1手牌:', game.players[0].hand.map(c => c.displayName()));
console.log('触发前 你手牌   :', game.players[1].hand.map(c => c.displayName()));

game._startTrick(0); // 玩家1（下标0）领出

console.log('forcedLeadInfo:', game.forcedLeadInfo);
console.log('currentTrick:', game.currentTrick.map(e => ({ playerIdx: e.playerIdx, cards: e.cards.map(c => c.displayName()) })));
console.log('玩家1.hasPlayed:', game.players[0].hasPlayed);
console.log('触发后 玩家1手牌:', game.players[0].hand.map(c => c.displayName()));
console.log('whoLeads():', game.whoLeads(), '(应为1，即该轮到"你"了)');

// 反例：如果没人能压过玩家1的10，不应触发
const game2 = new GameState();
game2.trumpSuit   = null;
game2.trumpCaller = -1;
game2.mustPlayCards = [];
game2.players[0].hand = [S('10')];
game2.players[1].hand = [D('5')];
game2.players[2].hand = [C('5')];
game2.players[0].hasPlayed = false;
game2.players[1].hasPlayed = false;
game2.players[2].hasPlayed = false;
game2._startTrick(0);
console.log('\n反例（没人能压过10）forcedLeadInfo:', game2.forcedLeadInfo, '(应为 null)');
console.log('反例 currentTrick 长度:', game2.currentTrick.length, '(应为 0)');
