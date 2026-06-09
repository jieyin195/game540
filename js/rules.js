/**
 * rules.js - 540打牌游戏规则引擎
 *
 * Translated from game_540/rules.py (Python → ES module JS)
 */

import {
    Card, SUITS, SUIT_SPECIAL,
    RANK_SMALL_JOKER, RANK_BIG_JOKER, RANK_CHARACTER, RANK_THREE,
    REGULAR_RANK_ORDER, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS,
} from './card.js';

// ---------------------------------------------------------------------------
// Suit priority (used for trump calling tie-breaks)
// ---------------------------------------------------------------------------
export const SUIT_PRIORITY = {
    [SUIT_SPADES]:   4,
    [SUIT_HEARTS]:   3,
    [SUIT_CLUBS]:    2,
    [SUIT_DIAMONDS]: 1,
};

// ---------------------------------------------------------------------------
// Trump helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the card is a trump card given the current trump suit.
 * @param {Card} card
 * @param {string|null} trumpSuit
 * @returns {boolean}
 */
export function isTrump(card, trumpSuit) {
    if (card.rank === RANK_THREE || card.rank === RANK_CHARACTER ||
        card.rank === RANK_BIG_JOKER || card.rank === RANK_SMALL_JOKER) return true;
    if (card.rank === '10' || card.rank === '2') return true;
    if (trumpSuit && card.suit === trumpSuit) return true;
    return false;
}

/**
 * Returns the logical suit of a card ('trump' or the card's actual suit).
 * @param {Card} card
 * @param {string|null} trumpSuit
 * @returns {string}
 */
export function getSuitOfCard(card, trumpSuit) {
    if (isTrump(card, trumpSuit)) return 'trump';
    return card.suit;
}

/**
 * Returns a numeric power value for a card (higher = stronger).
 * @param {Card} card
 * @param {string|null} trumpSuit
 * @param {number} [playOrder=0]
 * @returns {number}
 */
export function cardPower(card, trumpSuit, playOrder = 0) {
    const rank = card.rank;
    const suit = card.suit;

    if (rank === RANK_THREE)      return 10000;
    if (rank === RANK_CHARACTER)  return 9900;
    if (rank === RANK_BIG_JOKER)  return 9800;
    if (rank === RANK_SMALL_JOKER) return 9700;

    if (trumpSuit === null || trumpSuit === undefined) {
        if (rank === '10') return 9500 - playOrder;
        if (rank === '2')  return 9400 - playOrder;
        const suitIdx = SUITS.includes(suit) ? SUITS.indexOf(suit) : 0;
        const rankVal = REGULAR_RANK_ORDER[rank] ?? 0;
        return suitIdx * 100 + rankVal;
    } else {
        const isTrumpSuit = (suit === trumpSuit);
        if (rank === '10' && isTrumpSuit)  return 9600;
        if (rank === '10' && !isTrumpSuit) return 9500 - playOrder;
        if (rank === '2'  && isTrumpSuit)  return 9400;
        if (rank === '2'  && !isTrumpSuit) return 9300 - playOrder;
        if (suit === trumpSuit) {
            const rankVal = REGULAR_RANK_ORDER[rank] ?? 0;
            return 1000 + rankVal;
        }
        const suitIdx = SUITS.includes(suit) ? SUITS.indexOf(suit) : 0;
        const rankVal = REGULAR_RANK_ORDER[rank] ?? 0;
        return suitIdx * 100 + rankVal;
    }
}

/**
 * Returns the strongest card from a group.
 * @param {Card[]} cards
 * @param {string|null} trumpSuit
 * @returns {Card}
 */
export function bestCardInGroup(cards, trumpSuit) {
    return cards.reduce((best, c) =>
        cardPower(c, trumpSuit, c.playOrder) > cardPower(best, trumpSuit, best.playOrder) ? c : best
    );
}

// ---------------------------------------------------------------------------
// Pair-grouping key
// ---------------------------------------------------------------------------

/**
 * Returns a grouping key for pairing purposes (handles cross-suit 10s and 2s).
 * Exported because ai.js uses it directly.
 * @param {Card} card
 * @param {string|null} trumpSuit
 * @returns {string}
 */
export function pairKey(card, trumpSuit) {
    return `${card.suit}_${card.rank}`;
}

// ---------------------------------------------------------------------------
// Hand analysis helpers
// ---------------------------------------------------------------------------

/**
 * Counts occurrences of each display name in a card array.
 * @param {Card[]} cards
 * @returns {Map<string, number>}
 */
export function countSame(cards) {
    const counter = new Map();
    for (const c of cards) {
        const name = c.displayName();
        counter.set(name, (counter.get(name) ?? 0) + 1);
    }
    return counter;
}

/**
 * Returns all pairs from a hand (as [Card, Card] arrays).
 * @param {Card[]} hand
 * @param {string|null} trumpSuit
 * @returns {Array<[Card, Card]>}
 */
export function getPairs(hand, trumpSuit) {
    const groups = new Map();
    for (const card of hand) {
        const key = pairKey(card, trumpSuit);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(card);
    }
    const pairs = [];
    for (const group of groups.values()) {
        if (group.length >= 2) pairs.push([group[0], group[1]]);
    }
    return pairs;
}

/**
 * Returns all triples from a hand (as Card[3] arrays).
 * @param {Card[]} hand
 * @param {string|null} trumpSuit
 * @returns {Array<Card[]>}
 */
export function getTriples(hand, trumpSuit) {
    const groups = new Map();
    for (const card of hand) {
        const key = pairKey(card, trumpSuit);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(card);
    }
    const triples = [];
    for (const group of groups.values()) {
        if (group.length >= 3) triples.push(group.slice(0, 3));
    }
    return triples;
}

/**
 * Returns all bombs (4-of-a-kind groups) from a hand.
 * @param {Card[]} hand
 * @param {string|null} trumpSuit
 * @returns {Array<Card[]>}
 */
export function getBombs(hand, trumpSuit) {
    const groups = new Map();
    for (const card of hand) {
        const key = pairKey(card, trumpSuit);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(card);
    }
    const bombs = [];
    for (const group of groups.values()) {
        if (group.length >= 4) bombs.push(group.slice(0, 4));
    }
    return bombs;
}

// ---------------------------------------------------------------------------
// Consecutive pairs / triples ordering
// ---------------------------------------------------------------------------

/**
 * Returns the ordering index of a pair within the trump sequence.
 * Higher = stronger. Returns -1 for non-consecutive pairs.
 * Exported because ai.js uses it.
 * @param {Array<Card>} pair - A [Card, Card] array
 * @param {string|null} trumpSuit
 * @returns {number}
 */
export function trumpPairOrder(pair, trumpSuit) {
    const card = pair[0];
    const rank = card.rank;
    const suit = card.suit;

    if (trumpSuit === null || trumpSuit === undefined) {
        // 常主模式：只有 3>字牌>大王>小王 可构成连对
        // 规则：对小王与对10不是连对，对10与对2不是连对
        const orderMap = {
            [RANK_THREE]:      4,
            [RANK_CHARACTER]:  3,
            [RANK_BIG_JOKER]:  2,
            [RANK_SMALL_JOKER]: 1,
        };
        return orderMap[rank] ?? -1;
    } else {
        if (rank === RANK_THREE)      return 14;
        if (rank === RANK_CHARACTER)  return 13;
        if (rank === RANK_BIG_JOKER)  return 12;
        if (rank === RANK_SMALL_JOKER) return 11;
        if (rank === '10' && suit === trumpSuit) return 10;
        if (rank === '10') return 9;
        if (rank === '2'  && suit === trumpSuit) return 8;
        if (rank === '2') return 7;
        const regularOrder = { 'A': 6, 'K': 5, 'Q': 4, 'J': 3, '5': 2 };
        if (suit === trumpSuit) return regularOrder[rank] ?? -1;
        return -1;
    }
}

/**
 * Returns true if the given array of pairs forms a consecutive sequence.
 * @param {Array<Array<Card>>} pairs
 * @param {string|null} trumpSuit
 * @returns {boolean}
 */
export function isConsecutivePairs(pairs, trumpSuit) {
    if (pairs.length < 2) return true;
    const orders = pairs.map(p => trumpPairOrder(p, trumpSuit)).sort((a, b) => a - b);
    if (orders.some(o => o < 0)) return false;
    for (let i = 1; i < orders.length; i++) {
        if (orders[i] - orders[i - 1] !== 1) return false;
    }
    return true;
}

/**
 * Returns true if the cards form a valid consecutive pairs play.
 * @param {Card[]} cards
 * @param {string|null} trumpSuit
 * @returns {boolean}
 */
export function isValidConsecutivePairs(cards, trumpSuit) {
    if (cards.length < 4 || cards.length % 2 !== 0) return false;

    const groups = new Map();
    for (const c of cards) {
        const key = pairKey(c, trumpSuit);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
    }

    const pairGroups = [...groups.values()].filter(g => g.length >= 2);
    if (pairGroups.reduce((sum, g) => sum + 2, 0) !== cards.length) return false;

    const pairs = pairGroups.map(g => [g[0], g[1]]);
    return isConsecutivePairs(pairs, trumpSuit);
}

// ---------------------------------------------------------------------------
// Trump calling / counter
// ---------------------------------------------------------------------------

/**
 * Returns true if the given cards constitute a valid trump call.
 * @param {Card[]} cards
 * @returns {boolean}
 */
export function canCallTrump(cards) {
    if (cards.length === 0) return false;
    if (cards.length === 1 && cards[0].rank === '10') return true;
    if (cards.length === 2) {
        const [c1, c2] = cards;
        if (c1.rank === c2.rank &&
            ['10', RANK_SMALL_JOKER, RANK_BIG_JOKER, RANK_CHARACTER, RANK_THREE].includes(c1.rank)) {
            if (c1.rank === '10' && c1.suit !== c2.suit) return false;
            return true;
        }
    }
    if (cards.length === 3) {
        const ranks = cards.map(c => c.rank);
        if (new Set(ranks).size === 1 &&
            ['10', RANK_SMALL_JOKER, RANK_BIG_JOKER, RANK_CHARACTER].includes(ranks[0])) {
            if (ranks[0] === '10' && new Set(cards.map(c => c.suit)).size !== 1) return false;
            return true;
        }
    }
    if (cards.length === 4) {
        const ranks = cards.map(c => c.rank);
        if (new Set(ranks).size === 1 &&
            ['10', RANK_SMALL_JOKER, RANK_BIG_JOKER, RANK_CHARACTER].includes(ranks[0])) {
            if (ranks[0] === '10' && new Set(cards.map(c => c.suit)).size !== 1) return false;
            return true;
        }
    }
    return false;
}

/**
 * Returns true if newCards can counter (override) the currentCall.
 * @param {Card[]} newCards
 * @param {Card[]} currentCall
 * @returns {boolean}
 */
export function canCounterTrump(newCards, currentCall) {
    if (newCards.length < 2) return false;
    if (!canCallTrump(newCards)) return false;
    const newN = newCards.length;
    const curN = currentCall.length;
    if (newN > curN) return true;
    if (newN < curN) return false;

    const newRank = newCards[0].rank;
    const curRank = currentCall[0].rank;
    const rankPower = {
        '10': 1,
        [RANK_SMALL_JOKER]: 2,
        [RANK_BIG_JOKER]:   3,
        [RANK_CHARACTER]:   4,
        [RANK_THREE]:       5,
    };
    const newRp = rankPower[newRank] ?? 0;
    const curRp = rankPower[curRank] ?? 0;
    if (newRp > curRp) return true;
    if (newRp < curRp) return false;

    const newSuitP = SUIT_PRIORITY[newCards[0].suit] ?? 0;
    const curSuitP = SUIT_PRIORITY[currentCall[0].suit] ?? 0;
    return newSuitP > curSuitP;
}

// ---------------------------------------------------------------------------
// PlayType enum-like object
// ---------------------------------------------------------------------------

/**
 * Constants representing the type of a card play.
 */
export const PlayType = Object.freeze({
    SINGLE:         'single',
    PAIR:           'pair',
    TRIPLE:         'triple',
    BOMB:           'bomb',
    CONSEC_PAIRS:   'consec_pairs',
    CONSEC_TRIPLES: 'consec_triples',
    INVALID:        'invalid',
});

// ---------------------------------------------------------------------------
// Play type detection
// ---------------------------------------------------------------------------

/**
 * Returns the PlayType of a set of cards played together.
 * @param {Card[]} cards
 * @param {string|null} trumpSuit
 * @returns {string} One of the PlayType constants
 */
export function getPlayType(cards, trumpSuit) {
    const n = cards.length;
    if (n === 0) return PlayType.INVALID;
    if (n === 1) return PlayType.SINGLE;

    const groups = new Map();
    for (const c of cards) {
        const key = pairKey(c, trumpSuit);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
    }
    const counts = [...groups.values()].map(g => g.length).sort((a, b) => a - b);

    if (n === 2 && counts.length === 1 && counts[0] === 2) return PlayType.PAIR;
    if (n === 3 && counts.length === 1 && counts[0] === 3) return PlayType.TRIPLE;
    if (n === 4 && counts.length === 1 && counts[0] === 4) return PlayType.BOMB;

    if (n % 2 === 0 && [...groups.values()].every(g => g.length >= 2)) {
        const pairs = [...groups.values()].filter(g => g.length >= 2).map(g => [g[0], g[1]]);
        if (pairs.length === n / 2 && isConsecutivePairs(pairs, trumpSuit)) return PlayType.CONSEC_PAIRS;
    }

    if (n % 3 === 0 && [...groups.values()].every(g => g.length >= 3)) {
        const triplesPairs = [...groups.values()].filter(g => g.length >= 3).map(g => [g[0], g[1]]);
        if (triplesPairs.length === n / 3 && isConsecutivePairs(triplesPairs, trumpSuit)) return PlayType.CONSEC_TRIPLES;
    }

    return PlayType.INVALID;
}

// ---------------------------------------------------------------------------
// Suit following helpers
// ---------------------------------------------------------------------------

/**
 * Returns the suit that followers must match ('trump' or a regular suit).
 * @param {Card[]} ledCards
 * @param {string|null} trumpSuit
 * @returns {string}
 */
export function getFollowSuit(ledCards, trumpSuit) {
    if (!ledCards || ledCards.length === 0) return 'trump';
    return getSuitOfCard(ledCards[0], trumpSuit);
}

/**
 * Filters a hand to only cards of the given logical suit.
 * @param {Card[]} hand
 * @param {string} suit
 * @param {string|null} trumpSuit
 * @returns {Card[]}
 */
export function filterHandBySuit(hand, suit, trumpSuit) {
    return hand.filter(c => getSuitOfCard(c, trumpSuit) === suit);
}

/**
 * Returns true if card can beat currentBest in a single-card comparison.
 * @param {Card} card
 * @param {Card} currentBest
 * @param {string|null} trumpSuit
 * @param {number} [cardOrder=0]
 * @param {number} [bestOrder=0]
 * @returns {boolean}
 */
export function canBeatSingle(card, currentBest, trumpSuit, cardOrder = 0, bestOrder = 0) {
    const cardIsTrump = isTrump(card, trumpSuit);
    const bestIsTrump = isTrump(currentBest, trumpSuit);
    if (cardIsTrump && !bestIsTrump) return true;
    if (!cardIsTrump && bestIsTrump) return false;
    return cardPower(card, trumpSuit, cardOrder) > cardPower(currentBest, trumpSuit, bestOrder);
}

// ---------------------------------------------------------------------------
// Chinese suit name map (for error messages)
// ---------------------------------------------------------------------------
const _SUIT_CN = {
    spades:   '黑桃',
    hearts:   '红心',
    clubs:    '梅花',
    diamonds: '方块',
    trump:    '主牌',
};

// ---------------------------------------------------------------------------
// Validation helpers (internal, but exported for game.js)
// ---------------------------------------------------------------------------

/**
 * Returns true if the player's hand contains a card that can beat the current best.
 * Exported because game.js uses it.
 * @param {Card[]} hand
 * @param {Card[]} currentBest
 * @param {Card[]} ledCards
 * @param {string|null} trumpSuit
 * @returns {boolean}
 */
export function _canPlayerBeat(hand, currentBest, ledCards, trumpSuit) {
    const ledSuit = getFollowSuit(ledCards, trumpSuit);
    const handInSuit = filterHandBySuit(hand, ledSuit, trumpSuit);
    if (!currentBest || currentBest.length === 0) return false;
    const bestPower = Math.max(...currentBest.map(c => cardPower(c, trumpSuit, c.playOrder)));

    const ledType = getPlayType(ledCards, trumpSuit);

    if (ledType === PlayType.PAIR) {
        for (const pair of getPairs(handInSuit, trumpSuit)) {
            if (Math.max(cardPower(pair[0], trumpSuit, 0), cardPower(pair[1], trumpSuit, 0)) > bestPower) {
                return true;
            }
        }
        return false;
    }

    if (ledType === PlayType.TRIPLE) {
        for (const triple of getTriples(handInSuit, trumpSuit)) {
            if (Math.max(...triple.map(c => cardPower(c, trumpSuit, 0))) > bestPower) {
                return true;
            }
        }
        return false;
    }

    for (const card of handInSuit) {
        if (cardPower(card, trumpSuit, 0) > bestPower) return true;
    }
    return false;
}

/**
 * Returns true if followCards beats currentBest.
 * Renamed from _does_beat; exported because other modules use it.
 * @param {Card[]} followCards
 * @param {Card[]} currentBest
 * @param {string|null} trumpSuit
 * @returns {boolean}
 */
export function doesBeat(followCards, currentBest, trumpSuit) {
    const followType = getPlayType(followCards, trumpSuit);
    if (followType === PlayType.BOMB) return true;
    if (!currentBest || currentBest.length === 0) return true;

    const bestType = getPlayType(currentBest, trumpSuit);

    // 连对/连三同张：只能被同类型同长度的连对压
    if (bestType === PlayType.CONSEC_PAIRS || bestType === PlayType.CONSEC_TRIPLES) {
        if (followType !== bestType) return false;
        if (followCards.length !== currentBest.length) return false;
        const followMin = Math.min(...followCards.map(c => cardPower(c, trumpSuit)));
        const bestMax   = Math.max(...currentBest.map(c => cardPower(c, trumpSuit)));
        return followMin > bestMax;
    }

    const followPower = Math.max(...followCards.map(c => cardPower(c, trumpSuit)));
    const bestPower   = Math.max(...currentBest.map(c => cardPower(c, trumpSuit)));

    const followTrump = followCards.some(c => isTrump(c, trumpSuit));
    const bestTrump   = currentBest.some(c => isTrump(c, trumpSuit));

    if (followTrump && !bestTrump) return true;
    if (!followTrump && bestTrump) return false;
    return followPower > bestPower;
}

// ---------------------------------------------------------------------------
// Main validation entry point
// ---------------------------------------------------------------------------

/**
 * Validates whether followCards is a legal play given the led cards, hand, etc.
 * Returns [isValid: boolean, errorMessage: string].
 * @param {Card[]} followCards
 * @param {Card[]} ledCards
 * @param {Card[]} hand
 * @param {string|null} trumpSuit
 * @param {boolean} trickHasScore
 * @param {Card[]|null} currentBest
 * @returns {[boolean, string]}
 */
export function validateFollow(followCards, ledCards, hand, trumpSuit, trickHasScore, currentBest) {
    const ledType    = getPlayType(ledCards, trumpSuit);
    const followType = getPlayType(followCards, trumpSuit);
    const ledSuit    = getFollowSuit(ledCards, trumpSuit);
    const handInSuit = filterHandBySuit(hand, ledSuit, trumpSuit);
    const n = ledCards.length;

    // Bombs: 主牌炸弹 can beat any ≤4 cards; 副牌炸弹 can only beat same-suit ≤4 cards
    if (followType === PlayType.BOMB) {
        if (n > 4) return [false, '炸弹只能炸4张及以内的牌'];
        const bombCard = followCards[0];
        if (!isTrump(bombCard, trumpSuit)) {
            const bombSuit = getSuitOfCard(bombCard, trumpSuit);
            if (ledSuit !== bombSuit) {
                return [false, '副牌炸弹只能炸同花色的牌'];
            }
        }
        return [true, ''];
    }

    // Must play the correct number of cards
    if (followCards.length !== n) {
        if (hand.length < n) {
            if (followCards.length !== hand.length) return [false, `应出${hand.length}张（手牌不足）`];
        } else {
            return [false, `应出${n}张牌`];
        }
    }

    // Must follow suit if possible
    if (handInSuit.length > 0) {
        const followInSuit = followCards.filter(c => getSuitOfCard(c, trumpSuit) === ledSuit);
        const need = Math.min(n, handInSuit.length);
        if (followInSuit.length < need) {
            return [false, `必须跟${_SUIT_CN[ledSuit] ?? ledSuit}花色（手中还有${handInSuit.length}张）`];
        }
    }

    // 能压必压 rule (must beat if possible, when trick has score)
    if (trickHasScore && currentBest) {
        const canBeat = _canPlayerBeat(hand, currentBest, ledCards, trumpSuit);
        if (canBeat) {
            const isBeating = doesBeat(followCards, currentBest, trumpSuit);
            if (!isBeating) return [false, '前面有分牌，能压必压'];
            return [true, ''];
        }
    }

    // Rule: no voluntary score discard (不能主动垫分牌)
    const followScore = followCards.reduce((sum, c) => sum + c.scoreValue(), 0);
    if (followScore > 0) {
        const nonScoreInSuit = handInSuit.filter(c => c.scoreValue() === 0);
        if (nonScoreInSuit.length >= n) return [false, '不能主动垫分牌'];
        // 被迫垫分牌时：必须按分小牌小顺序（5分<10分，同分值按牌力小优先）
        if (nonScoreInSuit.length < n) {
            const scoreSorter = (a, b) =>
                a.scoreValue() - b.scoreValue() || cardPower(a, trumpSuit) - cardPower(b, trumpSuit);
            const scoreCardsInSuit = handInSuit.filter(c => c.scoreValue() > 0).sort(scoreSorter);
            const needScoreCount = n - nonScoreInSuit.length;
            const expectedScore = scoreCardsInSuit.slice(0, needScoreCount);
            const actualScore = followCards.filter(c => c.scoreValue() > 0).sort(scoreSorter);
            if (actualScore.length !== expectedScore.length ||
                actualScore.some((c, i) => c !== expectedScore[i])) {
                return [false, '垫分牌须按分小牌小顺序'];
            }
        }
    }

    return [true, ''];
}

// ---------------------------------------------------------------------------
// AI / game helpers
// ---------------------------------------------------------------------------

/**
 * Returns the recommended lead (pairs if available, otherwise biggest single).
 * @param {Card[]} hand
 * @param {string|null} trumpSuit
 * @returns {Card[]}
 */
export function mustLeadPairOrBiggest(hand, trumpSuit) {
    const pairs = getPairs(hand, trumpSuit);
    if (pairs.length > 0) {
        const best = pairs.reduce((bestPair, p) =>
            cardPower(p[0], trumpSuit) > cardPower(bestPair[0], trumpSuit) ? p : bestPair
        );
        return [...best];
    }
    const biggest = hand.reduce((b, c) => cardPower(c, trumpSuit) > cardPower(b, trumpSuit) ? c : b);
    return [biggest];
}

/**
 * Returns padding cards to bring a play up to 4 cards (for bombs).
 * @param {Card[]} hand
 * @param {Card[]} originalPlay
 * @param {string|null} trumpSuit
 * @returns {Card[]}
 */
export function getPadCards(hand, originalPlay, trumpSuit) {
    const nPad = 4 - originalPlay.length;
    if (nPad <= 0) return [];

    const available = hand.filter(c => !originalPlay.includes(c));

    // 按花色优先级筛选垫牌池
    const ledCard = originalPlay[0];
    let preferred, other;
    if (isTrump(ledCard, trumpSuit)) {
        preferred = available.filter(c => isTrump(c, trumpSuit));
    } else {
        preferred = available.filter(c => c.suit === ledCard.suit && !isTrump(c, trumpSuit));
    }
    other = available.filter(c => !preferred.includes(c));

    let pad = _pickPadFromPool(preferred, nPad, trumpSuit);
    if (pad.length < nPad) {
        pad = pad.concat(_pickPadFromPool(other, nPad - pad.length, trumpSuit));
    }
    return pad.slice(0, nPad);
}

function _pickPadFromPool(pool, n, trumpSuit) {
    if (!pool.length || n <= 0) return [];
    if (n >= 3) {
        const triples = getTriples(pool, trumpSuit);
        if (triples.length > 0) return triples[0].slice(0, 3);
    }
    if (n >= 2) {
        const pairs = getPairs(pool, trumpSuit);
        if (pairs.length > 0) {
            const pair = [...pairs[0]];
            if (n === 2) return pair;
            const remaining = pool.filter(c => !pair.includes(c));
            if (remaining.length > 0) return [...pair, remaining[0]];
            return pair;
        }
    }
    const sorted = [...pool].sort((a, b) => cardPower(a, trumpSuit) - cardPower(b, trumpSuit));
    return sorted.slice(0, n);
}
