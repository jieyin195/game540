/**
 * card.js - 540打牌游戏牌组定义
 * 126张牌：4副牌去掉4,6,7,8,9（保留2张3）
 *
 * Translated from game_540/card.py (Python → ES module JS)
 */

// ---------------------------------------------------------------------------
// Suit constants
// ---------------------------------------------------------------------------
export const SUIT_SPADES   = 'spades';
export const SUIT_HEARTS   = 'hearts';
export const SUIT_CLUBS    = 'clubs';
export const SUIT_DIAMONDS = 'diamonds';
export const SUIT_SPECIAL  = 'special';

export const SUITS = [SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS];

export const SUIT_DISPLAY = {
    [SUIT_SPADES]:   '♠',
    [SUIT_HEARTS]:   '♥',
    [SUIT_CLUBS]:    '♣',
    [SUIT_DIAMONDS]: '♦',
    [SUIT_SPECIAL]:  '',
};

export const SUIT_COLOR = {
    [SUIT_SPADES]:   'black',
    [SUIT_HEARTS]:   'red',
    [SUIT_CLUBS]:    'black',
    [SUIT_DIAMONDS]: 'red',
    [SUIT_SPECIAL]:  'black',
};

// ---------------------------------------------------------------------------
// Rank constants
// ---------------------------------------------------------------------------
export const REGULAR_RANKS = ['A', '2', '5', '10', 'J', 'Q', 'K'];

export const RANK_SMALL_JOKER = 'small_joker';
export const RANK_BIG_JOKER   = 'big_joker';
export const RANK_CHARACTER   = 'character';
export const RANK_THREE       = '3';

export const SPECIAL_RANKS = [RANK_SMALL_JOKER, RANK_BIG_JOKER, RANK_CHARACTER];

export const RANK_DISPLAY = {
    'A':  'A',
    '2':  '2',
    '3':  '3',
    '5':  '5',
    '10': '10',
    'J':  'J',
    'Q':  'Q',
    'K':  'K',
    [RANK_SMALL_JOKER]: '小王',
    [RANK_BIG_JOKER]:   '大王',
    [RANK_CHARACTER]:   '字牌',
};

export const REGULAR_RANK_ORDER = {
    '5':  5,
    'J':  11,
    'Q':  12,
    'K':  13,
    'A':  14,
    '2':  2,
    '10': 10,
};

// ---------------------------------------------------------------------------
// Card class
// ---------------------------------------------------------------------------
export class Card {
    /**
     * @param {string} suit - One of the SUIT_* constants
     * @param {string} rank - One of the REGULAR_RANKS, RANK_THREE, or SPECIAL_RANKS
     */
    constructor(suit, rank) {
        this.suit      = suit;
        this.rank      = rank;
        this.playOrder = 0;   // camelCase equivalent of play_order
    }

    /**
     * Returns the point value of this card (0, 5, or 10).
     * @returns {number}
     */
    scoreValue() {
        if (this.rank === '5') return 5;
        if (
            this.rank === '10'           ||
            this.rank === 'K'            ||
            this.rank === RANK_SMALL_JOKER ||
            this.rank === RANK_BIG_JOKER   ||
            this.rank === RANK_CHARACTER   ||
            this.rank === RANK_THREE
        ) return 10;
        return 0;
    }

    /**
     * Returns true if this card belongs to the special suit (jokers, character, 3).
     * @returns {boolean}
     */
    isSpecial() {
        return this.suit === SUIT_SPECIAL;
    }

    /**
     * Returns the display string for this card (e.g. "♠A", "大王").
     * @returns {string}
     */
    displayName() {
        if (this.suit === SUIT_SPECIAL) {
            return RANK_DISPLAY[this.rank] ?? this.rank;
        }
        const suitSym = SUIT_DISPLAY[this.suit] ?? this.suit;
        const rankSym = RANK_DISPLAY[this.rank] ?? this.rank;
        return `${suitSym}${rankSym}`;
    }

    /**
     * Value equality — two cards are equal if suit and rank match.
     * @param {Card} other
     * @returns {boolean}
     */
    equals(other) {
        if (!(other instanceof Card)) return false;
        return this.suit === other.suit && this.rank === other.rank;
    }

    /**
     * String representation (useful for debugging).
     * @returns {string}
     */
    toString() {
        return this.displayName();
    }
}

// ---------------------------------------------------------------------------
// Deck helpers
// ---------------------------------------------------------------------------

/**
 * Fisher-Yates in-place shuffle.
 * @param {Array} arr - Array to shuffle (mutated in place)
 * @returns {Array} The same array, shuffled
 */
export function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Builds a fresh 126-card deck (unshuffled).
 * 4 copies of each regular suit × regular rank,
 * 4 copies of each special rank (small joker, big joker, character),
 * plus 2 extra threes (♠3).
 * @returns {Card[]}
 */
export function buildDeck() {
    const deck = [];

    for (let copy = 0; copy < 4; copy++) {
        for (const suit of SUITS) {
            for (const rank of REGULAR_RANKS) {
                deck.push(new Card(suit, rank));
            }
        }
        for (const rank of SPECIAL_RANKS) {
            deck.push(new Card(SUIT_SPECIAL, rank));
        }
    }

    // Two extra ♠3 cards
    deck.push(new Card(SUIT_SPADES, RANK_THREE));
    deck.push(new Card(SUIT_SPADES, RANK_THREE));

    if (deck.length !== 126) {
        throw new Error(`Expected 126 cards, got ${deck.length}`);
    }
    return deck;
}

/**
 * Shuffles a copy of deck and deals it into three hands of 42 cards each.
 * @param {Card[]} deck - The full 126-card deck
 * @returns {[Card[], Card[], Card[]]} Three hands: [hand0, hand1, hand2]
 */
export function shuffleAndDeal(deck) {
    const shuffled = shuffleArray([...deck]);
    return [
        shuffled.slice(0, 42),
        shuffled.slice(42, 84),
        shuffled.slice(84, 126),
    ];
}

/**
 * Sums the score values of an array of cards.
 * @param {Card[]} cards
 * @returns {number}
 */
export function totalScore(cards) {
    return cards.reduce((sum, c) => sum + c.scoreValue(), 0);
}
