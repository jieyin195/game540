/**
 * ai.js - 540打牌游戏 AI 决策模块（规则based）
 *
 * Translated from game_540/ai.py (Python → ES module JS)
 */

import { Card, SUITS, SUIT_SPECIAL, RANK_THREE, RANK_CHARACTER, RANK_BIG_JOKER, RANK_SMALL_JOKER } from './card.js';
import {
    cardPower, isTrump, getPlayType, PlayType,
    canCallTrump, canCounterTrump,
    getPairs, getTriples, getBombs,
    getFollowSuit, filterHandBySuit,
    doesBeat, _canPlayerBeat,
    isConsecutivePairs, pairKey, trumpPairOrder,
    validateFollow,
} from './rules.js';

// ---------------------------------------------------------------------------
// 叫主 AI
// ---------------------------------------------------------------------------

/**
 * AI决定是否叫主/反主。
 * 返回叫主用的牌列表，或 null（Pass）。
 * @param {Card[]} hand
 * @param {Card[]|null} currentCall
 * @returns {Card[]|null}
 */
export function aiDecideCallTrump(hand, currentCall) {
    const candidates = _findCallCandidates(hand);
    if (!candidates.length) return null;

    // 按叫主强度排序（张数多优先，然后点数大优先）
    candidates.sort((a, b) => {
        const lenDiff = b.length - a.length;
        if (lenDiff !== 0) return lenDiff;
        return _callPower(b) - _callPower(a);
    });

    for (const callCards of candidates) {
        if (currentCall === null || currentCall === undefined) {
            if (canCallTrump(callCards)) return callCards;
        } else {
            if (canCounterTrump(callCards, currentCall)) return callCards;
        }
    }

    return null;
}

/**
 * 找出所有可以用于叫主的牌组合
 * @param {Card[]} hand
 * @returns {Card[][]}
 */
function _findCallCandidates(hand) {
    const candidates = [];
    const groups = {};
    for (const c of hand) {
        if (!groups[c.rank]) groups[c.rank] = [];
        groups[c.rank].push(c);
    }

    for (const [rank, cards] of Object.entries(groups)) {
        if (rank === '10') {
            // 10必须按花色分组，不同花色不能混用
            const suitGroups = {};
            for (const c of cards) {
                if (!suitGroups[c.suit]) suitGroups[c.suit] = [];
                suitGroups[c.suit].push(c);
            }
            for (const suitCards of Object.values(suitGroups)) {
                if (suitCards.length >= 1) candidates.push([suitCards[0]]);
                if (suitCards.length >= 2) candidates.push(suitCards.slice(0, 2));
                if (suitCards.length >= 3) candidates.push(suitCards.slice(0, 3));
                if (suitCards.length >= 4) candidates.push(suitCards.slice(0, 4));
            }
        } else if ([RANK_SMALL_JOKER, RANK_BIG_JOKER, RANK_CHARACTER, RANK_THREE].includes(rank)) {
            if (cards.length >= 2) candidates.push(cards.slice(0, 2));
            if (cards.length >= 3) candidates.push(cards.slice(0, 3));
            if (cards.length >= 4) candidates.push(cards.slice(0, 4));
        }
    }

    return candidates;
}

/**
 * 叫主强度（排序用）
 * @param {Card[]} cards
 * @returns {number}
 */
function _callPower(cards) {
    const rank = cards[0].rank;
    const rankPower = {
        '10': 1,
        [RANK_SMALL_JOKER]: 2,
        [RANK_BIG_JOKER]: 3,
        [RANK_CHARACTER]: 4,
        [RANK_THREE]: 5,
    };
    return rankPower[rank] ?? 0;
}

// ---------------------------------------------------------------------------
// 出牌 AI（领出）
// ---------------------------------------------------------------------------

/**
 * AI领出牌决策。
 * @param {Card[]} hand
 * @param {string|null} trumpSuit
 * @param {boolean} anyUnplayed - 是否有玩家未出过牌（影响必须出对子规则）
 * @returns {Card[]}
 */
export function aiLead(hand, trumpSuit, anyUnplayed, mustPlayCards = null) {
    // 反主牌必出：直接出这些牌
    if (mustPlayCards && mustPlayCards.length > 0) {
        return [...mustPlayCards];
    }

    if (anyUnplayed) {
        // 有玩家未出过牌：必须出对子（或无对子时最大单张）
        const pairs = getPairs(hand, trumpSuit);
        if (pairs.length) {
            // 优先出非主牌的分值对子，次选主牌对子
            const nonTrumpScorePairs = pairs.filter(
                p => !isTrump(p[0], trumpSuit) && p[0].scoreValue() > 0
            );
            if (nonTrumpScorePairs.length) {
                const best = nonTrumpScorePairs.reduce((a, b) =>
                    cardPower(a[0], trumpSuit) > cardPower(b[0], trumpSuit) ? a : b
                );
                return [...best];
            }
            // 无分值对子，出最小对子
            const best = pairs.reduce((a, b) =>
                cardPower(a[0], trumpSuit) < cardPower(b[0], trumpSuit) ? a : b
            );
            return [...best];
        } else {
            // 无对子，出最大单张
            return [hand.reduce((a, b) =>
                cardPower(a, trumpSuit) > cardPower(b, trumpSuit) ? a : b
            )];
        }
    }

    // 所有玩家都出过牌，可自由出
    // 策略：优先出连对（带分），其次出对子，最后出单张
    const consec = _findBestConsecutivePairs(hand, trumpSuit);
    if (consec) return consec;

    const pairs = getPairs(hand, trumpSuit);
    if (pairs.length) {
        // 出最有价值的对子（非分牌配对）
        const scoredPairs = pairs.filter(p => p[0].scoreValue() > 0 || p[1].scoreValue() > 0);
        let best;
        if (scoredPairs.length) {
            best = scoredPairs.reduce((a, b) =>
                cardPower(a[0], trumpSuit) > cardPower(b[0], trumpSuit) ? a : b
            );
        } else {
            // 出最大对子（进攻）
            best = pairs.reduce((a, b) =>
                cardPower(a[0], trumpSuit) > cardPower(b[0], trumpSuit) ? a : b
            );
        }
        return [...best];
    }

    // 无对子：出最大非分单张，或最大单张
    const nonScore = hand.filter(c => c.scoreValue() === 0);
    if (nonScore.length) {
        return [nonScore.reduce((a, b) =>
            cardPower(a, trumpSuit) > cardPower(b, trumpSuit) ? a : b
        )];
    }
    return [hand.reduce((a, b) =>
        cardPower(a, trumpSuit) > cardPower(b, trumpSuit) ? a : b
    )];
}

/**
 * 寻找手牌中最长的连对
 * @param {Card[]} hand
 * @param {string|null} trumpSuit
 * @returns {Card[]|null}
 */
function _findBestConsecutivePairs(hand, trumpSuit) {
    const groups = {};
    for (const c of hand) {
        const key = pairKey(c, trumpSuit);
        if (!groups[key]) groups[key] = [];
        groups[key].push(c);
    }

    // 找所有成对的组
    const pairGroups = Object.entries(groups).filter(([k, g]) => g.length >= 2);
    if (pairGroups.length < 2) return null;

    // 找连续的对子序列
    const pairWithOrder = [];
    for (const [k, g] of pairGroups) {
        const order = trumpPairOrder([g[0], g[1]], trumpSuit);
        if (order > 0) {
            pairWithOrder.push([order, g.slice(0, 2)]);
        }
    }

    if (!pairWithOrder.length) return null;

    pairWithOrder.sort((a, b) => a[0] - b[0]);

    // 找最长连续段
    let bestSeq = [];
    let currentSeq = [pairWithOrder[0]];
    for (let i = 1; i < pairWithOrder.length; i++) {
        if (pairWithOrder[i][0] - pairWithOrder[i - 1][0] === 1) {
            currentSeq.push(pairWithOrder[i]);
        } else {
            if (currentSeq.length > bestSeq.length) bestSeq = currentSeq;
            currentSeq = [pairWithOrder[i]];
        }
    }
    if (currentSeq.length > bestSeq.length) bestSeq = currentSeq;

    if (bestSeq.length >= 2) {
        const result = [];
        for (const [, pair] of bestSeq) result.push(...pair);
        return result;
    }
    return null;
}

// ---------------------------------------------------------------------------
// 跟牌 AI
// ---------------------------------------------------------------------------

/**
 * AI跟牌决策。
 * @param {Card[]} hand
 * @param {Card[]} ledCards
 * @param {Card[]} currentBest
 * @param {string|null} trumpSuit
 * @param {boolean} trickHasScore
 * @returns {Card[]}
 */
export function aiFollow(hand, ledCards, currentBest, trumpSuit, trickHasScore) {
    const n = ledCards.length;
    const ledSuit = getFollowSuit(ledCards, trumpSuit);
    const handInSuit = filterHandBySuit(hand, ledSuit, trumpSuit);

    // 可用牌：优先用本花色牌（计算用，实际分支内处理）
    const available = handInSuit.length ? handInSuit : hand;

    const playType = getPlayType(ledCards, trumpSuit);

    // 如果是对子/连对，尝试出对应牌型
    if (playType === PlayType.PAIR || playType === PlayType.CONSEC_PAIRS) {
        return _followPairs(hand, ledCards, currentBest, trumpSuit, trickHasScore, n);
    }

    if (playType === PlayType.TRIPLE) {
        return _followNSame(hand, ledCards, currentBest, trumpSuit, trickHasScore, n, 3);
    }

    if (playType === PlayType.BOMB) {
        // 出炸弹：也可以用炸弹压
        const bombs = getBombs(hand, trumpSuit);
        if (bombs.length) {
            // 找能压的最小炸弹
            const sortedBombs = [...bombs].sort((a, b) =>
                cardPower(a[0], trumpSuit) - cardPower(b[0], trumpSuit)
            );
            for (const bomb of sortedBombs) {
                if (doesBeat(bomb, currentBest, trumpSuit)) return bomb;
            }
        }
        // 无法压：垫最小的4张
        return _pickDiscard(hand, 4, trumpSuit);
    }

    // 单张
    return _followSingle(hand, ledCards, currentBest, trumpSuit, trickHasScore);
}

/**
 * 跟单张牌
 * @param {Card[]} hand
 * @param {Card[]} ledCards
 * @param {Card[]} currentBest
 * @param {string|null} trumpSuit
 * @param {boolean} trickHasScore
 * @returns {Card[]}
 */
function _followSingle(hand, ledCards, currentBest, trumpSuit, trickHasScore) {
    const ledSuit = getFollowSuit(ledCards, trumpSuit);
    const handInSuit = filterHandBySuit(hand, ledSuit, trumpSuit);

    if (handInSuit.length) {
        if (trickHasScore) {
            // 能压必压：找最小的能压的牌
            const canBeatCards = handInSuit.filter(c => doesBeat([c], currentBest, trumpSuit));
            if (canBeatCards.length) {
                return [canBeatCards.reduce((a, b) =>
                    cardPower(a, trumpSuit) < cardPower(b, trumpSuit) ? a : b
                )];
            }
        }
        // 垫牌：出最小（优先非分牌）
        return [_pickSmallestCard(handInSuit, trumpSuit)];
    } else {
        // 无该花色：可用主牌压，或垫牌
        if (trickHasScore) {
            const trumpInHand = hand.filter(c => isTrump(c, trumpSuit));
            const canBeat = trumpInHand.filter(c => doesBeat([c], currentBest, trumpSuit));
            if (canBeat.length) {
                return [canBeat.reduce((a, b) =>
                    cardPower(a, trumpSuit) < cardPower(b, trumpSuit) ? a : b
                )];
            }
        }
        // 垫牌
        return [_pickSmallestCard(hand, trumpSuit)];
    }
}

/**
 * 跟对子/连对
 * @param {Card[]} hand
 * @param {Card[]} ledCards
 * @param {Card[]} currentBest
 * @param {string|null} trumpSuit
 * @param {boolean} trickHasScore
 * @param {number} n
 * @returns {Card[]}
 */
function _followPairs(hand, ledCards, currentBest, trumpSuit, trickHasScore, n) {
    const ledSuit = getFollowSuit(ledCards, trumpSuit);
    const handInSuit = filterHandBySuit(hand, ledSuit, trumpSuit);
    const pairsInSuit = getPairs(handInSuit, trumpSuit);

    const numPairsNeeded = Math.floor(n / 2);

    if (pairsInSuit.length >= numPairsNeeded) {
        // 有足够对子
        if (trickHasScore) {
            // 尝试压牌
            const canBeat = pairsInSuit.filter(p =>
                doesBeat([...p], currentBest.slice(0, 2), trumpSuit)
            );
            if (canBeat.length) {
                // 用最小能压的对子
                const bestPair = canBeat.reduce((a, b) =>
                    cardPower(a[0], trumpSuit) < cardPower(b[0], trumpSuit) ? a : b
                );
                return [...bestPair];
            }
        }
        // 垫最小对子
        const smallest = pairsInSuit.reduce((a, b) =>
            cardPower(a[0], trumpSuit) < cardPower(b[0], trumpSuit) ? a : b
        );
        return [...smallest];
    } else {
        // 对子不足，能出几对就出几对，剩余用单张补
        const result = [];
        const usedCards = new Set();
        for (const pair of pairsInSuit) {
            result.push(...pair);
            for (const c of pair) usedCards.add(c);
        }
        const remainingNeeded = n - result.length;
        const fillers = (handInSuit.length ? handInSuit : hand)
            .filter(c => !usedCards.has(c))
            .slice(0, remainingNeeded);
        result.push(...fillers);
        if (result.length < n) {
            const more = hand
                .filter(c => !result.includes(c))
                .slice(0, n - result.length);
            result.push(...more);
        }
        return result.slice(0, n);
    }
}

/**
 * 跟3同张
 * @param {Card[]} hand
 * @param {Card[]} ledCards
 * @param {Card[]} currentBest
 * @param {string|null} trumpSuit
 * @param {boolean} trickHasScore
 * @param {number} n
 * @param {number} sameCount
 * @returns {Card[]}
 */
function _followNSame(hand, ledCards, currentBest, trumpSuit, trickHasScore, n, sameCount) {
    const ledSuit = getFollowSuit(ledCards, trumpSuit);
    const handInSuit = filterHandBySuit(hand, ledSuit, trumpSuit);
    const triples = getTriples(handInSuit, trumpSuit);

    if (triples.length) {
        if (trickHasScore) {
            const canBeat = triples.filter(t => doesBeat(t, currentBest, trumpSuit));
            if (canBeat.length) {
                return canBeat.reduce((a, b) =>
                    cardPower(a[0], trumpSuit) < cardPower(b[0], trumpSuit) ? a : b
                );
            }
        }
        return triples.reduce((a, b) =>
            cardPower(a[0], trumpSuit) < cardPower(b[0], trumpSuit) ? a : b
        );
    }

    // 无3同张：用对子+单张或3单张
    return _pickDiscard(handInSuit.length ? handInSuit : hand, n, trumpSuit);
}

/**
 * 选最小的牌（优先非分牌）
 * @param {Card[]} cards
 * @param {string|null} trumpSuit
 * @returns {Card}
 */
function _pickSmallestCard(cards, trumpSuit) {
    const nonScore = cards.filter(c => c.scoreValue() === 0);
    const pool = nonScore.length ? nonScore : cards;
    return pool.reduce((a, b) =>
        cardPower(a, trumpSuit) < cardPower(b, trumpSuit) ? a : b
    );
}

/**
 * 选n张垫牌（不能主动垫分牌）。
 * 优先垫最小非分牌，不足时才垫分牌（按分小牌小顺序）。
 * @param {Card[]} hand
 * @param {number} n
 * @param {string|null} trumpSuit
 * @returns {Card[]}
 */
function _pickDiscard(hand, n, trumpSuit) {
    // 先取非分牌（按分值0，再按牌力升序）
    const nonScore = [...hand]
        .sort((a, b) => (a.scoreValue() - b.scoreValue()) || (cardPower(a, trumpSuit) - cardPower(b, trumpSuit)))
        .filter(c => c.scoreValue() === 0)
        .slice(0, n);

    const result = nonScore;
    if (result.length < n) {
        // 不足则补分牌（按分值从小到大）
        const scoreCards = hand
            .filter(c => c.scoreValue() > 0)
            .sort((a, b) => (a.scoreValue() - b.scoreValue()) || (cardPower(a, trumpSuit) - cardPower(b, trumpSuit)));
        result.push(...scoreCards.slice(0, n - result.length));
    }
    return result.slice(0, n);
}
