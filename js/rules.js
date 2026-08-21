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

const SIDE_RANK_STEP = { A: 5, K: 4, Q: 3, J: 2, '5': 1 };  // 同花色内部相邻，差值均为1
const SIDE_SUIT_BASE = 1000;                                 // 与主牌数值段（个位数~十几）完全不重叠
const SIDE_SUIT_GAP  = 100;                                  // 花色间隔，远大于同花色内部最大差值(4)

function _sideOrder(suit, rank) {
    if (!(rank in SIDE_RANK_STEP)) return -1;
    const suitIdx = SUITS.indexOf(suit);
    if (suitIdx < 0) return -1;
    return SIDE_SUIT_BASE + suitIdx * SIDE_SUIT_GAP + SIDE_RANK_STEP[rank];
}

/**
 * Returns the ordering index of a pair within the trump sequence.
 * Higher = stronger. Returns -1 for non-consecutive pairs.
 *
 * Return value ranges by card type:
 * - Main-card (主牌) sequence pairs: 1-14
 * - Side-suit (副牌) same-suit A/K/Q/J/5 pairs: 1000-1305 (via _sideOrder helper)
 *   The large gap between suit segments (100) is intentional to ensure that
 *   different suits' side-card groups never appear adjacent.
 *
 * NOTE: Returned values are only meaningful for adjacency comparison within the
 * same suit/sequence group (checking whether two groups' order values differ by
 * exactly 1). They are NOT absolute cross-suit/cross-group strength scores.
 *
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
        return orderMap[rank] ?? _sideOrder(suit, rank);
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
        return _sideOrder(suit, rank);
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
 * Finds all consecutive windows of a given size from groups, using trumpPairOrder.
 * For example, if groups has pairs ordered as [order=3, order=4, order=5, order=6],
 * and windowCount=2, returns [[group@3, group@4], [group@4, group@5], [group@5, group@6]].
 * @param {Array<Array<Card>>} groups - Array of card groups (pairs or triples)
 * @param {string|null} trumpSuit - Current trump suit
 * @param {number} windowCount - Size of consecutive window to find
 * @returns {Array<Array<Card>>} Array of consecutive windows, each flattened to a card array
 */
export function _consecutiveWindows(groups, trumpSuit, windowCount) {
    const withOrder = groups
        .map(g => ({ group: g, order: trumpPairOrder(g, trumpSuit) }))
        .filter(x => x.order >= 0)
        .sort((a, b) => a.order - b.order);
    const windows = [];
    for (let i = 0; i + windowCount <= withOrder.length; i++) {
        const slice = withOrder.slice(i, i + windowCount);
        const isConsecutive = slice.every((x, j) => j === 0 || x.order - slice[j - 1].order === 1);
        if (isConsecutive) windows.push(slice.flatMap(x => x.group));
    }
    return windows;
}

/**
 * Returns true if the player's hand contains a card that can beat the current best.
 * Uses doesBeat as the single source of truth for beating logic.
 * Exported because game.js uses it.
 * @param {Card[]} hand
 * @param {Card[]} currentBest
 * @param {Card[]} ledCards
 * @param {string|null} trumpSuit
 * @returns {boolean}
 */
export function _canPlayerBeat(hand, currentBest, ledCards, trumpSuit) {
    if (!currentBest || currentBest.length === 0) return false;
    const ledType = getPlayType(ledCards, trumpSuit);

    // 炸弹不受"同花色/主牌"取牌池限制——手里任意一组炸弹都是候选，具体能不能
    // 压过（主牌炸弹可炸任意4张以内的牌，副牌炸弹只能炸同花色的牌）交给
    // doesBeat 统一判断。之前这里没有 BOMB 分支，会落到最后的单张兜底比较，
    // 单张永远无法匹配炸弹牌型，导致"有炸弹也判断不能压"的漏判。
    if (ledType === PlayType.BOMB) {
        return getBombs(hand, trumpSuit).some(b => doesBeat(b, currentBest, trumpSuit));
    }

    const ledSuit    = getFollowSuit(ledCards, trumpSuit);
    const handInSuit = filterHandBySuit(hand, ledSuit, trumpSuit);
    // 有该花色牌只能用该花色试；没有该花色牌时改用主牌试（若ledSuit本身就是'trump'，两者相同）
    const pool = handInSuit.length > 0 ? handInSuit : filterHandBySuit(hand, 'trump', trumpSuit);

    if (ledType === PlayType.PAIR)   return getPairs(pool, trumpSuit).some(p => doesBeat(p, currentBest, trumpSuit));
    if (ledType === PlayType.TRIPLE) return getTriples(pool, trumpSuit).some(t => doesBeat(t, currentBest, trumpSuit));
    if (ledType === PlayType.CONSEC_PAIRS || ledType === PlayType.CONSEC_TRIPLES) {
        const groupSize   = ledType === PlayType.CONSEC_PAIRS ? 2 : 3;
        const windowCount = ledCards.length / groupSize;
        const groups      = groupSize === 2 ? getPairs(pool, trumpSuit) : getTriples(pool, trumpSuit);
        return _consecutiveWindows(groups, trumpSuit, windowCount).some(cand => doesBeat(cand, currentBest, trumpSuit));
    }
    return pool.some(c => doesBeat([c], currentBest, trumpSuit));
}

/**
 * Compares two card plays using trump-then-suit-then-power ordering.
 * Helper function used by doesBeat to determine card comparison logic.
 * @param {Card[]} followCards - Cards being played (to compare)
 * @param {Card[]} bestCards - Current best cards (to compare against)
 * @param {string|null} trumpSuit - Current trump suit
 * @param {Function} pick - Reducer function (Math.max or Math.min) for selecting power value
 * @returns {boolean} True if followCards beats bestCards
 */
function _compareByTrumpThenSuitThenPower(followCards, bestCards, trumpSuit, pick) {
    const followTrump = followCards.some(c => isTrump(c, trumpSuit));
    const bestTrump    = bestCards.some(c => isTrump(c, trumpSuit));

    if (followTrump && !bestTrump) return true;
    if (!followTrump && bestTrump) return false;
    // 都不是主牌：不同花色不可比，先出者（currentBest）仍然大
    if (!followTrump && !bestTrump && followCards[0].suit !== bestCards[0].suit) return false;

    const followPower = pick(...followCards.map(c => cardPower(c, trumpSuit)));
    const bestPower    = pick(...bestCards.map(c => cardPower(c, trumpSuit)));
    return followPower > bestPower;
}

/**
 * Returns true if followCards beats currentBest.
 * Handles bomb override, play-type matching, same-length-window rule for
 * consecutive pairs/triples, and trump-suit-power comparison for other types.
 * @param {Card[]} followCards - Cards being played
 * @param {Card[]} currentBest - Current best cards to beat
 * @param {string|null} trumpSuit - Current trump suit
 * @returns {boolean} True if followCards beats currentBest
 */
export function doesBeat(followCards, currentBest, trumpSuit) {
    const followType = getPlayType(followCards, trumpSuit);

    if (followType === PlayType.BOMB) {
        if (!currentBest || currentBest.length === 0) return true;
        const bestType = getPlayType(currentBest, trumpSuit);
        if (bestType !== PlayType.BOMB) return true;
        return _compareByTrumpThenSuitThenPower(followCards, currentBest, trumpSuit, Math.max);
    }

    if (!currentBest || currentBest.length === 0) return true;
    const bestType = getPlayType(currentBest, trumpSuit);

    // 牌型不匹配（不是同一种合法牌型）一律不能压
    if (followType !== bestType) return false;

    if (bestType === PlayType.CONSEC_PAIRS || bestType === PlayType.CONSEC_TRIPLES) {
        if (followCards.length !== currentBest.length) return false;
        return _compareByTrumpThenSuitThenPower(followCards, currentBest, trumpSuit, Math.min);
    }

    return _compareByTrumpThenSuitThenPower(followCards, currentBest, trumpSuit, Math.max);
}

// ---------------------------------------------------------------------------
// Follow structure validation (跟牌牌型匹配)
// ---------------------------------------------------------------------------

/**
 * Counts pair groups in cards (by pairKey).
 * @param {Card[]} cards
 * @param {string|null} trumpSuit
 * @returns {Map<string, Card[]>}
 */
function _groupCards(cards, trumpSuit) {
    const groups = new Map();
    for (const c of cards) {
        const key = pairKey(c, trumpSuit);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
    }
    return groups;
}

/**
 * Validates that followCards match the required structure for the led play type.
 * Rule: 出对子→跟对子（有的话），出炸弹→跟炸弹（有的话）。
 * 无对应牌型时按"垫最接近相同的牌"原则。
 * Only checks the in-suit portion of followCards.
 * @param {Card[]} followInSuit - follow cards that are in the led suit
 * @param {Card[]} handInSuit - hand cards in the led suit
 * @param {string} ledType - PlayType of the led cards
 * @param {string|null} trumpSuit
 * @returns {[boolean, string]}
 */
function _validateFollowStructure(followInSuit, handInSuit, ledType, trumpSuit) {
    if (followInSuit.length <= 1) return [true, ''];
    if (ledType === PlayType.SINGLE) return [true, ''];

    const followGroups = _groupCards(followInSuit, trumpSuit);
    const followSizes  = [...followGroups.values()].map(g => g.length).sort((a, b) => b - a);

    if (ledType === PlayType.PAIR) {
        const pairsAvail = getPairs(handInSuit, trumpSuit);
        if (pairsAvail.length > 0 && followInSuit.length >= 2) {
            if (!followSizes.some(s => s >= 2)) return [false, '有对子必须出对子'];
        }
        return [true, ''];
    }

    if (ledType === PlayType.TRIPLE) {
        const triplesAvail = getTriples(handInSuit, trumpSuit);
        if (triplesAvail.length > 0 && followInSuit.length >= 3) {
            if (!followSizes.some(s => s >= 3)) return [false, '有3同张必须出3同张'];
            return [true, ''];
        }
        const pairsAvail = getPairs(handInSuit, trumpSuit);
        if (pairsAvail.length > 0 && followInSuit.length >= 2) {
            if (!followSizes.some(s => s >= 2)) return [false, '无3同张但有对子，必须出对子加单张'];
        }
        return [true, ''];
    }

    if (ledType === PlayType.BOMB) {
        return _validateBombFollowStructure(followInSuit, handInSuit, trumpSuit);
    }

    if (ledType === PlayType.CONSEC_PAIRS || ledType === PlayType.CONSEC_TRIPLES) {
        const pairsAvail = getPairs(handInSuit, trumpSuit);
        if (pairsAvail.length > 0 && followInSuit.length >= 2) {
            if (!followSizes.some(s => s >= 2)) return [false, '有对子必须出对子'];
        }
        return [true, ''];
    }

    return [true, ''];
}

/**
 * Validates bomb-follow structure hierarchy:
 * 炸弹 > 3同张+1 > 2对 > 1对+2单 > 4单
 */
function _validateBombFollowStructure(followInSuit, handInSuit, trumpSuit) {
    const n = followInSuit.length;
    if (n < 2) return [true, ''];

    const followGroups = _groupCards(followInSuit, trumpSuit);
    const followSizes  = [...followGroups.values()].map(g => g.length).sort((a, b) => b - a);

    const bombsAvail   = getBombs(handInSuit, trumpSuit);
    if (bombsAvail.length > 0 && n >= 4) {
        const followType = getPlayType(followInSuit, trumpSuit);
        if (followType !== PlayType.BOMB) return [false, '有同花色炸弹必须出炸弹'];
        return [true, ''];
    }

    const triplesAvail = getTriples(handInSuit, trumpSuit);
    if (triplesAvail.length > 0 && n >= 3) {
        if (!followSizes.some(s => s >= 3)) return [false, '无炸弹但有3同张，必须出3同张'];
        return [true, ''];
    }

    const pairsAvail = getPairs(handInSuit, trumpSuit);
    if (pairsAvail.length >= 2 && n >= 4) {
        const pairCount = followSizes.filter(s => s >= 2).length;
        if (pairCount < 2) return [false, '无3同张但有2对，必须出2对'];
        return [true, ''];
    }

    if (pairsAvail.length >= 1 && n >= 2) {
        if (!followSizes.some(s => s >= 2)) return [false, '有对子必须出对子'];
    }

    return [true, ''];
}

// ---------------------------------------------------------------------------
// Score-discard helper (不能主动垫分牌)
// ---------------------------------------------------------------------------

/**
 * Checks that followCards do not voluntarily discard score cards from the pool.
 * When forced to play score cards, they must be in smallest-score-first order.
 * @param {Card[]} followCards
 * @param {Card[]} pool - The available card pool (in-suit or off-suit hand)
 * @param {string|null} trumpSuit
 * @param {boolean} isBeatingPlay - If true, this is a beating play (压牌) and is exempt from the check
 * @returns {[boolean, string]}
 */
function _checkNoVoluntaryScore(followCards, pool, trumpSuit, isBeatingPlay) {
    if (isBeatingPlay) return [true, ''];   // 压牌不算主动垫分
    if (!followCards.some(c => c.scoreValue() > 0)) return [true, ''];
    const n = followCards.length;
    const nonScore = pool.filter(c => c.scoreValue() === 0);
    if (nonScore.length >= n) return [false, '不能主动垫分牌'];
    const needScore = n - nonScore.length;

    // "分小牌小顺序"比较的是分值本身，不同花色的副牌之间本就"无大小之分、
    // 先出者大"（规则2.2），不该用 cardPower（那只是同花色/主牌内部排序用的
    // 数值，见其函数注释）在分值相同时强行分出谁"更小"——分值相同的牌里，
    // 打出任意一张都算数，只要打出的分值多重集合是池子里能凑到的最小分值组合。
    const scoreValuesAsc = a => [...a].sort((x, y) => x - y);
    const scorePool      = pool.filter(c => c.scoreValue() > 0).map(c => c.scoreValue());
    const expectedScores = scoreValuesAsc(scorePool).slice(0, needScore);
    const actualScores   = scoreValuesAsc(followCards.filter(c => c.scoreValue() > 0).map(c => c.scoreValue()));

    if (actualScores.length !== expectedScores.length ||
        actualScores.some((v, i) => v !== expectedScores[i])) {
        return [false, '垫分牌须按分小牌小顺序'];
    }
    return [true, ''];
}

/**
 * 连对/连三同张专用的"不能主动垫分牌"检查。
 *
 * 连对子的"可选方案"是一个个完整的连续窗口，不是任意几张同花色对子/三同张的
 * 自由组合——两个不相邻的窗口哪怕各自都不含分，把它们的牌拼起来也不代表
 * 玩家真能打出这个组合（这正是 _forcedGroupCards 用"所有可选窗口的并集"
 * 当作候选池会算错的地方：并集里可能包含两个本身互不相邻、凑不成新连续
 * 窗口的牌）。所以只能对"整个窗口"求比较：玩家实际打出的这个窗口的总分值，
 * 是否已经是所有真正连续、张数相同的窗口里最小的。若还有总分更小（或不含分）
 * 的窗口没打，才算主动垫分。
 * 同花色牌不够、凑不满完整对子/三同张时，followInSuit 里会混入配不成组的散牌
 * （比如3对+1张单牌）——这部分散牌不属于"窗口"比较的范围，单独按普通垫牌规则
 * （对照同花色里没被窗口用到的牌）检查，避免把散牌的分值错算进窗口总分里、
 * 拿一个根本不对等的"5张 vs 4张窗口"比较来误判。
 * @param {Card[]} followInSuit - 跟牌里属于领出花色/主牌的部分
 * @param {Card[]} handInSuit - 手牌里属于领出花色/主牌的部分
 * @param {string} effectiveLedType - PlayType.CONSEC_PAIRS 或 PlayType.CONSEC_TRIPLES
 * @param {string|null} trumpSuit
 * @returns {[boolean, string]}
 */
function _checkConsecutiveNoVoluntaryScore(followInSuit, handInSuit, effectiveLedType, trumpSuit) {
    const groupSize = effectiveLedType === PlayType.CONSEC_TRIPLES ? 3 : 2;

    // 只把 followInSuit 里真正凑成完整对子/三同张的部分当"窗口"比较；
    // 凑不成组的散牌走下面的通用垫分检查。
    const followGroups     = _groupCards(followInSuit, trumpSuit);
    const matchedGroups    = [...followGroups.values()].filter(g => g.length >= groupSize);
    const matchedCards     = matchedGroups.flatMap(g => g.slice(0, groupSize));
    const matchedCardSet   = new Set(matchedCards);
    const leftover         = followInSuit.filter(c => !matchedCardSet.has(c));
    const windowCount      = matchedGroups.length;

    if (windowCount >= 2) {
        const groups  = groupSize === 2 ? getPairs(handInSuit, trumpSuit) : getTriples(handInSuit, trumpSuit);
        const windows = _consecutiveWindows(groups, trumpSuit, windowCount);
        if (windows.length > 0) {
            const totalScore  = cards => cards.reduce((sum, c) => sum + c.scoreValue(), 0);
            const minScore    = Math.min(...windows.map(totalScore));
            const playedScore = totalScore(matchedCards);
            if (playedScore > minScore) return [false, '不能主动垫分牌'];
        }
    }

    if (leftover.length > 0) {
        const handFiller = handInSuit.filter(c => !matchedCardSet.has(c));
        return _checkNoVoluntaryScore(leftover, handFiller, trumpSuit, false);
    }
    return [true, ''];
}

// ---------------------------------------------------------------------------
// Forced group narrowing
// ---------------------------------------------------------------------------

/**
 * 计算"不能主动垫分牌"检查中，结构规则强制玩家使用的那组成型组合
 * （对子/三同张/炸弹）具体是哪些牌。分支逐一镜像 _validateFollowStructure /
 * _validateBombFollowStructure 的既有强制条件，保证识别范围与结构规则
 * 实际强制的范围完全一致。返回空数组表示当前 effectiveLedType 不触发
 * 任何成型强制（例如 SINGLE），跟牌张数里没有必须原样保留的"组"。
 * @param {Card[]} handInSuit
 * @param {string} effectiveLedType
 * @param {number} n - followInSuit.length（本次同花色/主牌实际出牌张数）
 * @param {string|null} trumpSuit
 * @returns {Card[]}
 */
function _forcedGroupCards(handInSuit, effectiveLedType, n, trumpSuit) {
    if (effectiveLedType === PlayType.PAIR ||
        effectiveLedType === PlayType.CONSEC_PAIRS ||
        effectiveLedType === PlayType.CONSEC_TRIPLES) {
        // 连对/连三同张这里用普通对子/三同张的宽松口径（不要求真正连续）——
        // 真正需要"连续窗口"精度的检查在 _checkConsecutiveNoVoluntaryScore 里单独做，
        // 这个函数只用于兜底/PAIR 这种不涉及连续性的场景。
        const pairsAvail = getPairs(handInSuit, trumpSuit);
        if (pairsAvail.length > 0 && n >= 2) return pairsAvail.flat();
        return [];
    }

    if (effectiveLedType === PlayType.TRIPLE) {
        const triplesAvail = getTriples(handInSuit, trumpSuit);
        if (triplesAvail.length > 0 && n >= 3) return triplesAvail.flat();
        const pairsAvail = getPairs(handInSuit, trumpSuit);
        if (pairsAvail.length > 0 && n >= 2) return pairsAvail.flat();
        return [];
    }

    if (effectiveLedType === PlayType.BOMB) {
        const bombsAvail = getBombs(handInSuit, trumpSuit);
        if (bombsAvail.length > 0 && n >= 4) return bombsAvail.flat();
        const triplesAvail = getTriples(handInSuit, trumpSuit);
        if (triplesAvail.length > 0 && n >= 3) return triplesAvail.flat();
        const pairsAvail = getPairs(handInSuit, trumpSuit);
        if (pairsAvail.length >= 2 && n >= 4) return pairsAvail.flat();
        if (pairsAvail.length >= 1 && n >= 2) return pairsAvail.flat();
        return [];
    }

    return [];
}


/**
 * 按 pairKey 计数（而非对象引用）把 cards 划分成"命中 requiredCards 名额"
 * 和"其余"两部分。避免同一 pairKey 有多张物理牌时，_forcedGroupCards
 * 固定选中的具体对象与玩家实际打出的对象不一致导致误判——只要 pairKey
 * 相同就算命中名额，不要求是同一个对象。
 * @param {Card[]} cards
 * @param {Card[]} requiredCards
 * @param {string|null} trumpSuit
 * @returns {[Card[], Card[]]} [matched, rest]
 */
function _partitionByPairKeyCounts(cards, requiredCards, trumpSuit) {
    const remaining = new Map();
    for (const c of requiredCards) {
        const key = pairKey(c, trumpSuit);
        remaining.set(key, (remaining.get(key) ?? 0) + 1);
    }
    const matched = [];
    const rest = [];
    for (const c of cards) {
        const key = pairKey(c, trumpSuit);
        const left = remaining.get(key) ?? 0;
        if (left > 0) {
            matched.push(c);
            remaining.set(key, left - 1);
        } else {
            rest.push(c);
        }
    }
    return [matched, rest];
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
 * @param {number} [requiredCount] - 被炸后可能大于 ledCards.length
 * @returns {[boolean, string]}
 */
export function validateFollow(followCards, ledCards, hand, trumpSuit, trickHasScore, currentBest, requiredCount) {
    const ledType    = getPlayType(ledCards, trumpSuit);
    const followType = getPlayType(followCards, trumpSuit);
    const ledSuit    = getFollowSuit(ledCards, trumpSuit);
    const handInSuit = filterHandBySuit(hand, ledSuit, trumpSuit);
    const n = requiredCount ?? ledCards.length;
    const bombed = n > ledCards.length;
    const effectiveLedType = bombed ? PlayType.BOMB : ledType;

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

    // Follow structure validation (跟牌牌型匹配：出对子→跟对子等)
    if (handInSuit.length > 0) {
        const fInSuit = followCards.filter(c => getSuitOfCard(c, trumpSuit) === ledSuit);
        if (fInSuit.length > 0) {
            const [structOk, structErr] = _validateFollowStructure(fInSuit, handInSuit, effectiveLedType, trumpSuit);
            if (!structOk) return [false, structErr];
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
    // 分别检查同花色和异花色部分；压牌（真的赢下这一墩）豁免"主动垫分"检查
    const isBeatingPlay = (currentBest && currentBest.length > 0)
        ? doesBeat(followCards, currentBest, trumpSuit)
        : false;
    const followInSuit  = followCards.filter(c => getSuitOfCard(c, trumpSuit) === ledSuit);
    const followOffSuit = followCards.filter(c => getSuitOfCard(c, trumpSuit) !== ledSuit);

    if (followInSuit.length > 0 && handInSuit.length > 0) {
        if (!isBeatingPlay &&
            (effectiveLedType === PlayType.CONSEC_PAIRS || effectiveLedType === PlayType.CONSEC_TRIPLES)) {
            // 连对/连三同张：可选方案是完整的连续窗口，不是任意同花色对子/三同张
            // 的自由拼凑，用专门的窗口级比较，见 _checkConsecutiveNoVoluntaryScore 注释。
            const [consecOk, consecErr] = _checkConsecutiveNoVoluntaryScore(followInSuit, handInSuit, effectiveLedType, trumpSuit);
            if (!consecOk) return [false, consecErr];
        } else {
            const groupCards = _forcedGroupCards(handInSuit, effectiveLedType, followInSuit.length, trumpSuit);
            const [followGroup, followFiller] = _partitionByPairKeyCounts(followInSuit, groupCards, trumpSuit);
            const [, handFiller] = _partitionByPairKeyCounts(handInSuit, groupCards, trumpSuit);

            const [groupOk, groupErr] = _checkNoVoluntaryScore(followGroup, groupCards, trumpSuit, isBeatingPlay);
            if (!groupOk) return [false, groupErr];

            const [fillerOk, fillerErr] = _checkNoVoluntaryScore(followFiller, handFiller, trumpSuit, isBeatingPlay);
            if (!fillerOk) return [false, fillerErr];
        }
    }
    if (followOffSuit.length > 0) {
        const handOffSuit = hand.filter(c => !handInSuit.includes(c));
        if (handOffSuit.length > 0) {
            const [ok, err] = _checkNoVoluntaryScore(followOffSuit, handOffSuit, trumpSuit, isBeatingPlay);
            if (!ok) return [false, err];
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

/**
 * 从一组牌组（对子/三同张）中挑一组用来垫牌：优先选不含分值的组，避免为了
 * 凑结构主动垫出分牌；全是分牌组时才退而选其中一组。
 * @param {Array<Card[]>} groups
 * @returns {Card[]}
 */
function _pickPadGroup(groups) {
    const nonScore = groups.filter(g => g[0].scoreValue() === 0);
    return nonScore.length > 0 ? nonScore[0] : groups[0];
}

function _pickPadFromPool(pool, n, trumpSuit) {
    if (!pool.length || n <= 0) return [];
    if (n >= 3) {
        const triples = getTriples(pool, trumpSuit);
        if (triples.length > 0) return _pickPadGroup(triples).slice(0, 3);
    }
    if (n >= 2) {
        const pairs = getPairs(pool, trumpSuit);
        if (pairs.length > 0) {
            const pair = [..._pickPadGroup(pairs)];
            if (n === 2) return pair;
            const remaining = [...pool.filter(c => !pair.includes(c))]
                .sort((a, b) => a.scoreValue() - b.scoreValue() || cardPower(a, trumpSuit) - cardPower(b, trumpSuit));
            if (remaining.length > 0) return [...pair, remaining[0]];
            return pair;
        }
    }
    const sorted = [...pool].sort((a, b) =>
        a.scoreValue() - b.scoreValue() || cardPower(a, trumpSuit) - cardPower(b, trumpSuit));
    return sorted.slice(0, n);
}
