import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';
import { GameState } from '../js/game.js';
import { GameRenderer } from '../js/renderer.js';

const noopCtx = new Proxy({}, { get: () => (typeof (() => {}) === 'function' ? () => {} : undefined) });
const fakeCanvas = { width: 800, height: 400, getContext: () => noopCtx, addEventListener: () => {} };

const game = new GameState();
const renderer = new GameRenderer(fakeCanvas, game);

function T(rank) { return new Card(SUIT_DIAMONDS, rank); } // 活主花色=diamonds
game.trumpSuit = 'diamonds';

// 副10（黑桃/红心/梅花的10，都是主牌，档位相同）打乱花色顺序放入手牌
game.players[1].hand = [
    new Card(SUIT_CLUBS, '10'),
    new Card(SUIT_SPADES, '10'),
    new Card(SUIT_HEARTS, '10'),
    new Card(SUIT_CLUBS, '2'),
    new Card(SUIT_SPADES, '2'),
    new Card(SUIT_HEARTS, '2'),
];

renderer._sortHumanHand();
console.log(game.players[1].hand.map(c => c.displayName()).join(' '));
