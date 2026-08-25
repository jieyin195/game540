import assert from 'node:assert/strict';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS } from '../js/card.js';
import { getPadCards } from '../js/rules.js';

// 出牌方原来出的单张黑桃Q被炸了，需要垫足4张（再垫3张）。手里没有黑桃了，
// 只能垫别的花色：一对红心K（10分/张）+ 一张梅花J（不算分）+ 一张梅花5（5分）。
//
// "有对子先出对子"这条结构优先级只在同花色范围内强制——垫的是完全不同的
// 花色，不要求凑对子结构，只要求"不能主动垫分"：应优先用不算分的梅花J，
// 剩下2张从算分牌里挑分值最小的（梅花5=5分 + 红心K其中一张=10分），没必要
// 为了凑"对子"多垫10分把红心K对子整对打出。
const trumpSuit = null;
function S(rank) { return new Card(SUIT_SPADES, rank); }
function H(rank) { return new Card(SUIT_HEARTS, rank); }
function C(rank) { return new Card(SUIT_CLUBS, rank); }

const originalPlay = [S('Q')];
const hand = [H('K'), H('K'), C('J'), C('5')];

const pad = getPadCards(hand, originalPlay, trumpSuit);
assert.equal(pad.length, 3);

const totalScore = pad.reduce((s, c) => s + c.scoreValue(), 0);
assert.equal(totalScore, 15,
    `异花色垫牌不要求凑对子，应优先用不算分的梅花J(0分)+分值最小的梅花5(5分)+红心K其中一张(10分)=15，实际: ${pad.map(c => c.displayName()).join(' ')} 总分值${totalScore}`);
assert.equal(pad.filter(c => c.suit === 'clubs' && c.rank === 'J').length, 1,
    '不算分的梅花J应该被用上');

console.log('PASS: fix19-padcards-unstructured-offsuit');
