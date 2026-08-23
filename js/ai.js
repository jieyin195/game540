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
    validateFollow, _consecutiveWindows,
} from './rules.js';

// ---------------------------------------------------------------------------
// 叫主 AI
// ---------------------------------------------------------------------------

// 固定主牌（不管常主/活主都是主牌）按大小顺序给权重：3>字牌>大王>小王>10>2
const FIXED_TRUMP_WEIGHT = {
    [RANK_THREE]: 6, [RANK_CHARACTER]: 5, [RANK_BIG_JOKER]: 4, [RANK_SMALL_JOKER]: 3,
    '10': 2, '2': 1,
};
// 活主花色自己的 A/K/Q/J/5（叫某花色10之后，这些牌会变成主牌）
const SIDE_TRUMP_WEIGHT = { 'A': 5, 'K': 4, 'Q': 3, 'J': 2, '5': 1 };

// 用 3000 局随机发牌模拟"有可叫候选的手"的强度分布校准：
// min 35 / p25 61 / median 68 / p75 76 / max 111。
// 初始叫主要求达到中位数水平（不是随便有张牌就叫），反主要求明显更强（约前25%），
// 因为反主需要更强的牌力才能真正压过对方、且会暴露更多信息。
const INITIAL_CALL_THRESHOLD = 65;
const COUNTER_CALL_THRESHOLD = 78;
// 叫某花色活主，必须比留在常主明显更划算才值得——固定主牌部分两边都一样，
// 真正决定"要不要激活这个花色"的是该花色能带来的净增量，不能只看绝对分数
// 有没有过门槛（那样测的其实是固定主牌够不够，跟选哪个花色没关系）。
const SUIT_ACTIVATION_MARGIN = 4;

/**
 * 评估这手牌如果以 suit 作为活主花色（suit 为 null 表示常主/不指定花色）的强度：
 * 固定主牌的数量和大小 + （若指定花色）该花色 A/K/Q/J/5 的数量和大小，
 * 再叠加"分牌保护"——分牌（5/10/K/王/字牌/3）能配成对子的加分（能藏住、有机会
 * 一起打出去，不容易被规则三逼着单独暴露），落单的分牌减分（容易被迫垫出去送分）。
 * @param {Card[]} hand
 * @param {string|null} suit
 * @returns {number}
 */
function _handStrengthForSuit(hand, suit) {
    const relevant = hand.filter(c =>
        FIXED_TRUMP_WEIGHT[c.rank] !== undefined ||
        (suit && c.suit === suit && SIDE_TRUMP_WEIGHT[c.rank] !== undefined)
    );

    let score = 0;
    for (const c of relevant) score += FIXED_TRUMP_WEIGHT[c.rank] ?? SIDE_TRUMP_WEIGHT[c.rank] ?? 0;

    const groups = new Map();
    for (const c of relevant) {
        if (c.scoreValue() === 0) continue; // 只看分牌的保护情况
        const key = `${c.suit}_${c.rank}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
    }
    for (const group of groups.values()) {
        score += group.length >= 2 ? 3 : -2;
    }

    return score;
}

/**
 * AI决定是否叫主/反主。会评估每个候选叫主对应的活主花色下的整手牌强度，
 * 只有达到门槛（反主门槛更高）才会真的去叫/反主，而不是有牌型就无脑叫。
 * 返回叫主用的牌列表，或 null（Pass）。
 * @param {Card[]} hand
 * @param {Card[]|null} currentCall
 * @returns {Card[]|null}
 */
export function aiDecideCallTrump(hand, currentCall) {
    const candidates = _findCallCandidates(hand);
    if (!candidates.length) return null;

    const isCounter = currentCall !== null && currentCall !== undefined;
    const threshold = isCounter ? COUNTER_CALL_THRESHOLD : INITIAL_CALL_THRESHOLD;

    const valid = candidates.filter(c =>
        isCounter ? canCounterTrump(c, currentCall) : canCallTrump(c)
    );
    if (!valid.length) return null;

    // 按叫主强度排序（张数多优先，然后点数大优先），作为同分时的 tie-break
    valid.sort((a, b) => {
        const lenDiff = b.length - a.length;
        if (lenDiff !== 0) return lenDiff;
        return _callPower(b) - _callPower(a);
    });

    const commonScore = _handStrengthForSuit(hand, null);

    let best = null;
    let bestScore = -Infinity;
    for (const callCards of valid) {
        const suit = callCards[0].rank === '10' ? callCards[0].suit : null;
        const score = _handStrengthForSuit(hand, suit);
        // 激活花色（叫某花色的10）必须比常主明显更强才值得叫；
        // 叫王/字牌/3（suit为null，本来就是常主）不受这条限制
        if (suit !== null && score < commonScore + SUIT_ACTIVATION_MARGIN) continue;
        if (score > bestScore) {
            bestScore = score;
            best = callCards;
        }
    }

    if (best === null || bestScore < threshold) return null; // 牌力不够，宁可 Pass
    return best;
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

    // "见5须出A"：领出的是副牌5（单/对/三同张），手里同花色A张数刚好对上
    // 领出的张数时，必须打出这些A——直接返回，不用再走后面的对子/单张决策。
    if ((playType === PlayType.SINGLE || playType === PlayType.PAIR || playType === PlayType.TRIPLE) &&
        ledCards[0].rank === '5' && !isTrump(ledCards[0], trumpSuit)) {
        const suit = ledCards[0].suit;
        const acesInHand = hand.filter(c => c.suit === suit && c.rank === 'A');
        if (acesInHand.length === n) return acesInHand;
    }

    // 如果是对子/连对，尝试出对应牌型
    if (playType === PlayType.PAIR || playType === PlayType.CONSEC_PAIRS) {
        return _followPairs(hand, ledCards, currentBest, trumpSuit, trickHasScore, n);
    }

    if (playType === PlayType.TRIPLE) {
        return _followNSame(hand, ledCards, currentBest, trumpSuit, trickHasScore, n, 3);
    }

    if (playType === PlayType.BOMB) {
        // 炸弹不受同花色限制——主牌炸弹能炸任意4张以内的牌，副牌炸弹只能炸
        // 同花色的牌，具体交给 doesBeat 判断；候选池应该是整手牌里所有的炸弹，
        // 不能像普通跟牌那样限定在 handInSuit 里（否则会漏掉能压过去的主牌炸弹）。
        const candidateBombs = getBombs(hand, trumpSuit);
        if (candidateBombs.length) {
            const sortedBombs = [...candidateBombs].sort((a, b) =>
                cardPower(a[0], trumpSuit) - cardPower(b[0], trumpSuit)
            );
            for (const bomb of sortedBombs) {
                if (doesBeat(bomb, currentBest, trumpSuit)) return bomb;
            }
        }
        return _pickStructuredDiscard(handInSuit.length ? handInSuit : hand, hand, 4, trumpSuit);
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

    // 连对/连三同张（n>2）：必须是真正连续的窗口才谈得上"跟对子/压牌"，
    // 不能像普通对子那样只比较 currentBest 的前两张，单独处理。
    if (n > 2) {
        return _followConsecutiveGroups(hand, ledCards, currentBest, trumpSuit, trickHasScore, n, handInSuit, pairsInSuit);
    }

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
        // 垫最小对子（优先不含分值的对子，避免明明有不算分的对子可选却垫了分牌对子）
        return [..._smallestPreferNonScore(pairsInSuit, trumpSuit)];
    }

    // 同花色对子不够（含完全没有该花色的情况）：本墩有分时，"有分必压"允许改用主牌压牌。
    // 只处理最常见的单对（n===2）——连对/连三同张在同花色不够时改用主牌连续窗口是更少见
    // 的边界情况，这里不展开，留给规则引擎的 _canPlayerBeat 兜底校验去挡。
    if (n === 2 && trickHasScore && ledSuit !== 'trump') {
        const trumpPairs = getPairs(filterHandBySuit(hand, 'trump', trumpSuit), trumpSuit);
        const canBeat = trumpPairs.filter(p => doesBeat([...p], currentBest.slice(0, 2), trumpSuit));
        if (canBeat.length) {
            const bestPair = canBeat.reduce((a, b) =>
                cardPower(a[0], trumpSuit) < cardPower(b[0], trumpSuit) ? a : b
            );
            return [...bestPair];
        }
    }

    // 对子不足，能出几对就出几对，剩余用单张补（优先补不含分值的牌，避免主动垫分）
    const result = [];
    const usedCards = new Set();
    for (const pair of pairsInSuit) {
        result.push(...pair);
        for (const c of pair) usedCards.add(c);
    }
    const remainingNeeded = n - result.length;
    const fillerPool = (handInSuit.length ? handInSuit : hand).filter(c => !usedCards.has(c));
    const fillers = _pickDiscard(fillerPool, remainingNeeded, trumpSuit);
    result.push(...fillers);
    for (const c of fillers) usedCards.add(c);
    if (result.length < n) {
        const more = _pickDiscard(hand.filter(c => !usedCards.has(c)), n - result.length, trumpSuit);
        result.push(...more);
    }
    return result.slice(0, n);
}

/**
 * 跟连对/连三同张（ledCards 的牌型是 CONSEC_PAIRS 或 CONSEC_TRIPLES，n>2）。
 * 与普通对子不同，压牌必须是真正连续的同组窗口（用 rules.js 的 _consecutiveWindows
 * 判定，和 _canPlayerBeat/validateFollow 用的是同一套逻辑，避免两边判断不一致）。
 * @param {Card[]} hand
 * @param {Card[]} ledCards
 * @param {Card[]} currentBest
 * @param {string|null} trumpSuit
 * @param {boolean} trickHasScore
 * @param {number} n
 * @param {Card[]} handInSuit
 * @param {Array<Card[]>} pairsInSuit
 * @returns {Card[]}
 */
function _followConsecutiveGroups(hand, ledCards, currentBest, trumpSuit, trickHasScore, n, handInSuit, pairsInSuit) {
    const ledType    = getPlayType(ledCards, trumpSuit);
    const groupSize  = ledType === PlayType.CONSEC_TRIPLES ? 3 : 2;
    const windowCount = n / groupSize;

    // 同花色牌不够时，规则允许改用主牌；没有主牌也没同花色时退回同花色池（会是空数组）
    const pool   = handInSuit.length > 0 ? handInSuit : filterHandBySuit(hand, 'trump', trumpSuit);
    const groups = groupSize === 2 ? getPairs(pool, trumpSuit) : getTriples(pool, trumpSuit);
    const windows = _consecutiveWindows(groups, trumpSuit, windowCount);

    if (windows.length) {
        if (trickHasScore) {
            const beatWindows = windows.filter(w => doesBeat(w, currentBest, trumpSuit));
            if (beatWindows.length) {
                return beatWindows.reduce((a, b) =>
                    cardPower(a[0], trumpSuit) < cardPower(b[0], trumpSuit) ? a : b
                );
            }
        }
        // 垫最小的连续窗口：优先选总分值最小的窗口（跟 rules.js 的
        // _checkConsecutiveNoVoluntaryScore 用的是同一个"总分值最小"标准，
        // 避免两边标准不一致——只看"第一张牌面大小"会选出一个总分值明明更大
        // 的窗口，通过不了那边的校验），分值相同时再比第一张牌面大小。
        const totalScore = w => w.reduce((sum, c) => sum + c.scoreValue(), 0);
        return windows.reduce((a, b) => {
            const sa = totalScore(a), sb = totalScore(b);
            if (sa !== sb) return sa < sb ? a : b;
            return cardPower(a[0], trumpSuit) < cardPower(b[0], trumpSuit) ? a : b;
        }
        );
    }

    // 凑不出真正连续的窗口：能出几组同花色对子/3同张就出几组（优先用不含分值的组，
    // 分牌组只在不含分的组不够时才补上），剩余用不含分值的散牌补
    const result = [];
    const usedCards = new Set();
    const rawGroups = groupSize === 2 ? pairsInSuit : getTriples(handInSuit, trumpSuit);
    const byGroupPower = (a, b) => cardPower(a[0], trumpSuit) - cardPower(b[0], trumpSuit);
    const nonScoreGroups = rawGroups.filter(g => g[0].scoreValue() === 0).sort(byGroupPower);
    const scoreGroups    = rawGroups.filter(g => g[0].scoreValue() > 0).sort(byGroupPower);
    const groupsToUse = [...nonScoreGroups, ...scoreGroups];
    for (const g of groupsToUse.slice(0, windowCount)) {
        result.push(...g);
        for (const c of g) usedCards.add(c);
    }
    const fillerPool = (handInSuit.length ? handInSuit : hand).filter(c => !usedCards.has(c));
    const fillers = _pickDiscard(fillerPool, n - result.length, trumpSuit);
    result.push(...fillers);
    for (const c of fillers) usedCards.add(c);
    if (result.length < n) {
        const more = _pickDiscard(hand.filter(c => !usedCards.has(c)), n - result.length, trumpSuit);
        result.push(...more);
    }
    return result.slice(0, n);
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
        // 优先不含分值的三同张，避免明明有不算分的三同张可选却垫了分牌三同张
        return _smallestPreferNonScore(triples, trumpSuit);
    }

    // 无3同张：用对子+单张或3单张
    return _pickStructuredDiscard(handInSuit.length ? handInSuit : hand, hand, n, trumpSuit);
}

/**
 * 选最小的牌（优先非分牌）
 * @param {Card[]} cards
 * @param {string|null} trumpSuit
 * @returns {Card}
 */
function _pickSmallestCard(cards, trumpSuit) {
    const nonScore = cards.filter(c => c.scoreValue() === 0);
    if (nonScore.length) {
        return nonScore.reduce((a, b) => cardPower(a, trumpSuit) < cardPower(b, trumpSuit) ? a : b);
    }
    // 全是分牌时，必须按"分小牌小顺序"——先比分值（5分 < 10分），
    // 分值相同时才用 cardPower 兜底（不代表真实大小关系，只是随便选一张）。
    // 不能像非分牌那样直接用 cardPower 挑，会挑出分值更大的那张。
    return cards.reduce((a, b) =>
        (a.scoreValue() - b.scoreValue() || cardPower(a, trumpSuit) - cardPower(b, trumpSuit)) < 0 ? a : b
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
    const nonScore = [...hand]
        .filter(c => c.scoreValue() === 0)
        .sort((a, b) => cardPower(a, trumpSuit) - cardPower(b, trumpSuit))
        .slice(0, n);

    let result = [...nonScore];
    if (result.length < n) {
        const scoreCards = hand
            .filter(c => c.scoreValue() > 0)
            .sort((a, b) => (a.scoreValue() - b.scoreValue()) || (cardPower(a, trumpSuit) - cardPower(b, trumpSuit)));
        result.push(...scoreCards.slice(0, n - result.length));
    }
    result = result.slice(0, n);

    // 避免"随手垫牌"意外凑成炸弹（4张完全相同的牌）：垫牌只是单纯垫，凑成炸弹
    // 会让这手牌被当成炸弹校验（比如副牌炸弹只能炸同花色），和垫牌的本意不符。
    if (result.length === 4) {
        const counts = new Map();
        for (const c of result) {
            const k = pairKey(c, trumpSuit);
            counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        if ([...counts.values()].some(cnt => cnt === 4)) {
            const used = new Set(result);
            const alt = [...hand]
                .filter(c => !used.has(c))
                .sort((a, b) => (a.scoreValue() - b.scoreValue()) || (cardPower(a, trumpSuit) - cardPower(b, trumpSuit)))[0];
            if (alt) result[3] = alt;
        }
    }
    return result;
}

/**
 * 从一组牌组（对子/3同张/炸弹）中选"最小"的一组，优先选不含分值的牌组，
 * 只有全是分牌组时才退而选分值最小的。避免结构化垫牌为了凑牌型主动垫出分牌
 * （即便牌面更小），违反"不能主动垫分牌"规则。
 * @param {Card[][]} groups
 * @param {string|null} trumpSuit
 * @returns {Card[]}
 */
function _smallestPreferNonScore(groups, trumpSuit) {
    const nonScore = groups.filter(g => g[0].scoreValue() === 0);
    const candidates = nonScore.length ? nonScore : groups;
    return candidates.reduce((a, b) =>
        cardPower(a[0], trumpSuit) < cardPower(b[0], trumpSuit) ? a : b);
}

/**
 * 按"垫最接近相同的牌"原则选垫牌。
 * 层级：炸弹 > 3同张+1 > 2对 > 1对+2单 > 全单张。
 * 同一档位内优先选不含分值的组合，避免为了凑结构主动垫出分牌。
 * @param {Card[]} pool - 优先取牌池（同花色牌）
 * @param {Card[]} fullHand - 全部手牌（pool不足时补充）
 * @param {number} n - 需要的总张数
 * @param {string|null} trumpSuit
 * @returns {Card[]}
 */
function _pickStructuredDiscard(pool, fullHand, n, trumpSuit) {
    const result = [];
    const used = new Set();

    const _add = (cards) => { for (const c of cards) { result.push(c); used.add(c); } };

    if (n === 4) {
        // 炸弹固定4张，n>4（比如连对/连三同张的兜底）时炸弹凑不满张数，交给后面的层级处理
        const bombs = getBombs(pool, trumpSuit);
        if (bombs.length) {
            _add(_smallestPreferNonScore(bombs, trumpSuit));
            return result.slice(0, n);
        }
    }
    if (n >= 3) {
        const triples = getTriples(pool, trumpSuit);
        if (triples.length) {
            _add(_smallestPreferNonScore(triples, trumpSuit));
        }
    }
    if (result.length === 0 && n >= 4) {
        const pairs = getPairs(pool, trumpSuit);
        if (pairs.length >= 2) {
            const byPower  = (a, b) => cardPower(a[0], trumpSuit) - cardPower(b[0], trumpSuit);
            const nonScore = pairs.filter(p => p[0].scoreValue() === 0).sort(byPower);
            const scored   = pairs.filter(p => p[0].scoreValue() > 0).sort(byPower);
            const ordered  = [...nonScore, ...scored]; // 优先用不含分值的对子凑够2对，不够再补分牌对子
            _add(ordered[0]);
            _add(ordered[1]);
        }
    }
    if (result.length === 0 && n >= 2) {
        const pairs = getPairs(pool, trumpSuit);
        if (pairs.length >= 1) {
            _add(_smallestPreferNonScore(pairs, trumpSuit));
        }
    }

    if (result.length < n) {
        const remaining = pool.filter(c => !used.has(c));
        const filler = _pickDiscard(remaining, n - result.length, trumpSuit);
        _add(filler);
    }
    if (result.length < n) {
        const remaining = fullHand.filter(c => !used.has(c));
        const filler = _pickDiscard(remaining, n - result.length, trumpSuit);
        _add(filler);
    }
    return result.slice(0, n);
}

/**
 * 跟牌侧结构化安全兜底：优先用同花色牌按"垫最接近相同的牌"原则出牌。
 * 只做结构合法性兜底，不尝试主动压牌。
 * @param {import('./card.js').Card[]} hand
 * @param {import('./card.js').Card[]} ledCards
 * @param {string|null} trumpSuit
 * @param {number} requiredCount
 * @returns {import('./card.js').Card[]}
 */
export function safeFollowFallback(hand, ledCards, trumpSuit, requiredCount) {
    const ledSuit    = getFollowSuit(ledCards, trumpSuit);
    const handInSuit = filterHandBySuit(hand, ledSuit, trumpSuit);
    return _pickStructuredDiscard(handInSuit.length ? handInSuit : hand, hand, requiredCount, trumpSuit);
}
