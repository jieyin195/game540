/**
 * game.js - 540打牌游戏状态与流程管理
 *
 * Translated from game_540/game.py (Python → ES module JS)
 */

import { Card, buildDeck, shuffleAndDeal, totalScore } from './card.js';
import {
    isTrump, cardPower, getPlayType, PlayType,
    canCallTrump, canCounterTrump,
    getFollowSuit, filterHandBySuit,
    getPairs, getTriples, getBombs,
    mustLeadPairOrBiggest, getPadCards, getBiggestSingleCandidates,
    validateFollow, doesBeat, _canPlayerBeat,
} from './rules.js';

// ---------------------------------------------------------------------------
// 游戏阶段
// ---------------------------------------------------------------------------

/** @type {{ DEAL: string, CALL_TRUMP: string, PLAY: string, TRICK_END: string, GAME_END: string }} */
export const Phase = Object.freeze({
    DEAL:       'deal',       // 发牌阶段
    CALL_TRUMP: 'call_trump', // 叫主阶段
    PLAY:       'play',       // 打牌阶段
    TRICK_END:  'trick_end',  // 本轮结束（短暂显示）
    GAME_END:   'game_end',   // 本局结束
});

// ---------------------------------------------------------------------------
// 玩家
// ---------------------------------------------------------------------------

export class Player {
    /**
     * @param {string}  name
     * @param {boolean} [isHuman=false]
     */
    constructor(name, isHuman = false) {
        this.name       = name;
        this.isHuman    = isHuman;
        /** @type {Card[]} */
        this.hand       = [];
        this.trickScore = 0;    // 本局得分
        this.hasPlayed  = false; // 本局是否当过领出者（不是"跟过牌"，规则三看的是"谁还没领出过"）
    }

    /**
     * Removes the given card objects from the hand (by reference).
     * @param {Card[]} cards
     */
    removeCards(cards) {
        for (const c of cards) {
            const idx = this.hand.indexOf(c);
            if (idx !== -1) this.hand.splice(idx, 1);
        }
    }

    toString() {
        return `Player(${this.name})`;
    }
}

// ---------------------------------------------------------------------------
// 一轮（trick）记录
// ---------------------------------------------------------------------------

export class TrickEntry {
    /**
     * @param {number} playerIdx
     * @param {Card[]} cards
     */
    constructor(playerIdx, cards) {
        this.playerIdx = playerIdx;
        this.cards     = cards;
        /** @type {Card[]} */
        this.padCards  = [];
    }

    /** @returns {number} */
    score() {
        return totalScore(this.cards) + totalScore(this.padCards);
    }

    /** @returns {Card[]} */
    allCards() {
        return [...this.cards, ...this.padCards];
    }
}

// ---------------------------------------------------------------------------
// 游戏状态
// ---------------------------------------------------------------------------

export class GameState {
    constructor() {
        /** @type {Player[]} */
        this.players = [
            new Player('玩家1', false), // AI  (index 0, left)
            new Player('你',    true),  // 人类（index 1, bottom）
            new Player('玩家2', false), // AI  (index 2, top)
        ];

        /** @type {string|null} */
        this.trumpSuit       = null;  // 活主花色
        this.trumpCaller     = -1;    // 叫主玩家索引
        /** @type {Card[]} */
        this.trumpCallCards  = [];    // 叫主用的牌
        /** @type {TrickEntry[]} */
        this.currentTrick    = [];    // 当前轮出牌记录
        /** @type {string} */
        this.phase           = Phase.DEAL;
        this.firstPlayer     = 0;     // 本轮先出牌者
        this.trickWinner     = -1;    // 本轮赢家
        this.allTricksDone   = false;
        this.message         = '';    // 界面提示信息
        /** @type {string|null} */
        this.pendingAction   = null;  // AI待执行动作

        // 规则三扩展：领出者无对子、被迫出的最大单张确实打不过别人手里的牌时，
        // 由下一个本局还没出过牌的玩家帮领出者随机抽一张代打，防止领出者自行挑牌"作弊"。
        // 每次 _startTrick 后若触发，记录本次触发信息供 UI 展示一次；未触发为 null。
        /** @type {{leaderIdx: number, drawerIdx: number, card: Card}|null} */
        this.forcedLeadInfo  = null;

        // 反主牌必出：反主成功后这些牌必须在第一次领出时打出
        /** @type {Card[]} */
        this.mustPlayCards   = [];

        // 叫主阶段状态
        this.callTrumpIdx    = 0;     // 当前正在决定是否叫主的玩家
        this.callTrumpDone   = false;

        // 打牌阶段：等待人类输入时置 true
        this.waitingHuman    = false;
        /** @type {Card[]|null} */
        this.humanSelected   = null;  // 人类选择的牌（由UI填入）

        // 当前一轮每人应出的张数（被炸后变为4）
        this.trickCardCount  = 0;

        // 初始化：发牌（随机决定叫主起始玩家）
        this._deal(Math.floor(Math.random() * 3));
    }

    // ------------------------------------------------------------------
    // 发牌
    // ------------------------------------------------------------------

    /**
     * Deals a fresh game. Resets all per-game state.
     * @param {number} [startFrom=-1]  Index of the player who calls trump first;
     *                                  if negative, chosen randomly.
     */
    _deal(startFrom = -1) {
        if (startFrom < 0) startFrom = Math.floor(Math.random() * 3);

        const deck  = buildDeck();
        const hands = shuffleAndDeal(deck);

        for (let i = 0; i < this.players.length; i++) {
            this.players[i].hand       = [...hands[i]];
            this.players[i].trickScore = 0;
            this.players[i].hasPlayed  = false;
        }

        this.phase          = Phase.CALL_TRUMP;
        this.callTrumpIdx   = startFrom;
        this.callTrumpCount = 0;         // 已决定的玩家数
        this.trumpSuit      = null;
        this.trumpCaller    = -1;
        this.trumpCallCards = [];
        this.mustPlayCards  = [];
        this.callTrumpDone  = false;
        this.currentTrick   = [];
        this.trickCardCount = 0;
        this.trickWinner    = -1;
        this.allTricksDone  = false;
        this.forcedLeadInfo = null;
        this.message        = '叫主阶段：请各玩家决定是否叫主';
    }

    // ------------------------------------------------------------------
    // 叫主阶段
    // ------------------------------------------------------------------

    /**
     * Preemptive trump-calling: any player may call/counter at any time.
     * callCards === null means this player passes.
     * Returns true if the action succeeded (pass always succeeds; invalid call returns false).
     * @param {number}      playerIdx
     * @param {Card[]|null} callCards
     * @returns {boolean}
     */
    processCallTrump(playerIdx, callCards) {
        if (callCards === null) return true;

        if (this.trumpCaller === -1) {
            if (canCallTrump(callCards)) {
                this.trumpCaller    = playerIdx;
                this.trumpCallCards = callCards;
                // 规则一"反主牌必出"只针对反主成功的情况；普通叫主（哪怕最终
                // 没人反主成功、就此定局）不强制叫主人必须打出这几张，可以自由领出。
                this.mustPlayCards  = [];
                this.trumpSuit      = this._extractTrumpSuit(callCards);
                this.message        = `${this.players[playerIdx].name} 叫主`;
                return true;
            }
            return false;
        } else {
            if (canCounterTrump(callCards, this.trumpCallCards)) {
                this.trumpCaller    = playerIdx;
                this.trumpCallCards = callCards;
                // 反主牌必出：只要这一步动作本身是反主，反主亮出来的牌就必须先出，
                // 跟反主的人是不是本局最初叫主的人无关——哪怕是最初叫主的人自己
                // 反回去拿回叫主权，这次反主亮出来的牌依然必须先出，不能收回。
                this.mustPlayCards  = [...callCards];
                this.trumpSuit      = this._extractTrumpSuit(callCards);
                this.message        = `${this.players[playerIdx].name} 反主`;
                return true;
            }
            return false;
        }
    }

    /**
     * Closes the trump-calling window and advances to the play phase.
     */
    finishCallTrump() {
        this._finishCallTrump();
    }

    /**
     * Extracts the active trump suit from calling cards.
     * Returns null when calling with specials (jokers, character, 3).
     * @param {Card[]} cards
     * @returns {string|null}
     */
    _extractTrumpSuit(cards) {
        for (const c of cards) {
            if (c.suit !== 'special' && c.rank === '10') return c.suit;
        }
        return null; // 叫的是王/字牌/3，无活主花色
    }

    /** @private */
    _finishCallTrump() {
        this.callTrumpDone = true;
        this.phase         = Phase.PLAY;
        // 先出牌者：叫主者（若无人叫主则叫主起始玩家）
        this.firstPlayer   = Math.max(this.trumpCaller, 0);
        this._startTrick(this.firstPlayer);

        const suitCn = { spades: '黑桃', hearts: '红心', clubs: '梅花', diamonds: '方块' };
        if (this.trumpSuit) {
            const ts = suitCn[this.trumpSuit] ?? this.trumpSuit;
            this.message = `活主：${ts}，${this.players[this.trumpCaller].name}先出牌`;
        } else {
            const firstName = this.players[this.firstPlayer].name;
            this.message = `常主模式，${firstName}先出牌`;
        }
    }

    // ------------------------------------------------------------------
    // 打牌阶段
    // ------------------------------------------------------------------

    /**
     * Starts a new trick with the given first player.
     * @param {number} firstPlayer
     * @private
     */
    _startTrick(firstPlayer) {
        this.currentTrick = [];
        this.firstPlayer  = firstPlayer;
        this.trickWinner  = -1;
        this.message      = `${this.players[firstPlayer].name} 先出牌`;

        this.forcedLeadInfo = this._tryForcedRandomLead(firstPlayer);
    }

    /**
     * 规则三扩展："领出者无对子、被迫出的最大单张打不过别人手里的牌"时，
     * 由领出者之后第一个本局还没当过领出者的玩家，从领出者手里随机抽一张牌代为打出
     * （只出这一张单张），防止领出者自行挑选具体是哪张牌。
     *
     * 判定顺序（先做便宜的检查，短路掉多数不适用的情况）：
     * 1. 本局是否还有其他玩家一次领出者都没当过——没有的话直接跳过，规则三本身也已经解除
     * 2. 反主牌必出还没执行完——那个规则优先级更高，领出者必须先打反主的牌，不适用本规则
     * 3. 领出者手里有没有对子（含3同张/连对等）——有对子就轮不到"最大单张"这一分支
     * 4. 领出者手里所有"合法最大单张"候选（主牌组+各副牌花色组，见
     *    getBiggestSingleCandidates），是否全部都打不过另外两人手里现有的牌——
     *    只要有一个候选能赢，就说明领出者有合法的取胜选择，不触发本规则
     *
     * @param {number} leaderIdx
     * @returns {{leaderIdx: number, drawerIdx: number, card: Card}|null}
     * @private
     */
    _tryForcedRandomLead(leaderIdx) {
        const anyUnplayed = this.players.some((p, i) => i !== leaderIdx && !p.hasPlayed);
        if (!anyUnplayed) return null;

        if (leaderIdx === this.trumpCaller && this.mustPlayCards.length > 0) return null;

        const leader = this.players[leaderIdx];
        if (leader.hand.length === 0) return null;
        if (getPairs(leader.hand, this.trumpSuit).length > 0) return null;

        const otherHands = this.players.filter((_, i) => i !== leaderIdx).map(p => p.hand);
        const candidates = getBiggestSingleCandidates(leader.hand, otherHands, this.trumpSuit);
        // candidates = cards that no other player can beat with a same-suit single (炸弹不算).
        // If any such card exists, the leader has a winning option → don't trigger forced draw.
        if (candidates.length > 0) return null;

        let drawerIdx = -1;
        for (let offset = 1; offset <= 2; offset++) {
            const idx = (leaderIdx + offset) % 3;
            if (!this.players[idx].hasPlayed) { drawerIdx = idx; break; }
        }
        if (drawerIdx === -1) return null; // 理论上不会发生（anyUnplayed 已保证存在）

        const randIdx    = Math.floor(Math.random() * leader.hand.length);
        const drawnCard  = leader.hand[randIdx];

        drawnCard.playOrder = 0;
        this.trickCardCount = 1;
        this.currentTrick.push(new TrickEntry(leaderIdx, [drawnCard]));
        leader.removeCards([drawnCard]);
        leader.hasPlayed = true;

        const drawerName = this.players[drawerIdx].name;
        this.message = `${leader.name} 的单张打不过别人，${drawerName} 帮他随机抽出: ${drawnCard.displayName()}`;

        return { leaderIdx, drawerIdx, card: drawnCard };
    }

    /**
     * Returns the index of the player who should play next this trick.
     * Returns -1 when the trick is already complete.
     * @returns {number}
     */
    whoLeads() {
        if (this.currentTrick.length === 0) return this.firstPlayer;

        // Follow order: players after firstPlayer in cyclic order
        const played = new Set(this.currentTrick.map(e => e.playerIdx));
        for (let offset = 1; offset <= 2; offset++) {
            const idx = (this.firstPlayer + offset) % 3;
            if (!played.has(idx)) return idx;
        }
        return -1; // 本轮已结束
    }

    /** @returns {boolean} */
    isTrickComplete() {
        return this.currentTrick.length === 3;
    }

    /** @returns {boolean} */
    trickHasScore() {
        return this.currentTrick.some(e => e.score() > 0);
    }

    /**
     * Returns the currently winning cards in this trick, or null if no cards played.
     * @returns {Card[]|null}
     */
    getCurrentBest() {
        if (this.currentTrick.length === 0) return null;
        let bestEntry = this.currentTrick[0];
        for (const entry of this.currentTrick.slice(1)) {
            if (doesBeat(entry.cards, bestEntry.cards, this.trumpSuit)) {
                bestEntry = entry;
            }
        }
        return bestEntry.cards;
    }

    /**
     * Returns the cards that were led (first played) this trick, or null.
     * @returns {Card[]|null}
     */
    getLedCards() {
        if (this.currentTrick.length > 0) return this.currentTrick[0].cards;
        return null;
    }

    /**
     * Attempts to play cards for a player.
     * Returns [success: boolean, errorMessage: string].
     * @param {number}   playerIdx
     * @param {Card[]}   cards
     * @param {boolean}  [skipValidation=false]
     * @returns {[boolean, string]}
     */
    playCards(playerIdx, cards, skipValidation = false) {
        const player = this.players[playerIdx];

        // Verify every card is in the player's hand (by reference)
        for (const c of cards) {
            if (!player.hand.includes(c)) return [false, `手中没有这张牌: ${c}`];
        }

        // Leading (first card of the trick)
        if (this.currentTrick.length === 0) {
            const playType = getPlayType(cards, this.trumpSuit);
            if (playType === PlayType.INVALID) return [false, '无效出牌'];

            // 反主牌必出规则：反主的牌必须在领出时打出
            if (this.mustPlayCards.length > 0 && playerIdx === this.trumpCaller && !skipValidation) {
                for (const mc of this.mustPlayCards) {
                    if (!cards.includes(mc)) {
                        return [false, '必须出反主的牌'];
                    }
                }
                this.mustPlayCards = [];
            }

            // First-play rule: if any other player hasn't LED a trick yet (not merely
            // "hasn't played a card" — following doesn't count), the leader may freely
            // choose between a pair-based play (对子/三同张/连对等) or a "biggest single"
            // — not "pair mandatory whenever one exists". "Biggest single" is judged
            // per suit-group (trump group, or each of the 4 side suits), not by overall
            // cardPower across the whole hand: side suits have no cross-suit ordering
            // (规则 2.2), so "the biggest single" from spades and "the biggest single"
            // from hearts are both legal, independent choices. This stays in force
            // across multiple tricks until every player has had a turn to lead.
            const anyUnplayed = this.players.some(
                (p, i) => i !== playerIdx && !p.hasPlayed
            );
            if (anyUnplayed && !skipValidation) {
                const pairTypes = [
                    PlayType.PAIR, PlayType.CONSEC_PAIRS,
                    PlayType.TRIPLE, PlayType.CONSEC_TRIPLES,
                    PlayType.BOMB,
                ];
                if (!pairTypes.includes(playType)) {
                    if (playType !== PlayType.SINGLE) {
                        return [false, '有玩家未当过领出者，必须出对子（或连对等）或最大的单张'];
                    }
                    const otherHands = this.players.filter((_, i) => i !== playerIdx).map(p => p.hand);
                    const candidates = getBiggestSingleCandidates(player.hand, otherHands, this.trumpSuit);
                    if (!candidates.includes(cards[0])) {
                        return [false, `必须出最大单张（其他玩家用同花色压不过的牌）`];
                    }
                }
            }

            // Tag play order on the cards
            cards.forEach((c, i) => { c.playOrder = i; });

            this.trickCardCount = cards.length;
            this.currentTrick.push(new TrickEntry(playerIdx, cards));
            player.removeCards(cards);
            player.hasPlayed = true;
            return [true, ''];

        } else {
            // Following
            const ledCards    = this.getLedCards();
            const currentBest = this.getCurrentBest();
            const hasScore    = this.trickHasScore();
            const reqCount    = this.trickCardCount;

            if (!skipValidation) {
                const [ok, err] = validateFollow(
                    cards, ledCards, player.hand,
                    this.trumpSuit, hasScore, currentBest ?? [],
                    reqCount
                );
                if (!ok) return [false, err];
            }

            cards.forEach((c, i) => { c.playOrder = this.currentTrick.length * 10 + i; });

            this.currentTrick.push(new TrickEntry(playerIdx, cards));
            player.removeCards(cards);
            // 注意：跟牌不算"当过领出者"，hasPlayed 在这里不置 true——
            // 规则三"还有玩家没出过牌"看的是有没有当过领出者，不是有没有跟过牌。
            return [true, ''];
        }
    }

    /**
     * Checks if the last play was a bomb and auto-pads previous entries.
     * Returns array of {playerIdx, padCards} for display, or null.
     * @returns {Array<{playerIdx: number, padCards: Card[]}>|null}
     */
    checkAndProcessBombPad() {
        if (this.currentTrick.length === 0) return null;
        const lastEntry = this.currentTrick[this.currentTrick.length - 1];
        const lastType  = getPlayType(lastEntry.cards, this.trumpSuit);
        if (lastType !== PlayType.BOMB) return null;
        if (this.trickCardCount >= 4) return null;

        const results = [];
        for (const entry of this.currentTrick) {
            if (entry === lastEntry) continue;
            const padNeeded = 4 - entry.cards.length - entry.padCards.length;
            if (padNeeded <= 0) continue;

            const player    = this.players[entry.playerIdx];
            const padCards  = getPadCards(player.hand, entry.allCards(), this.trumpSuit);
            const actual    = padCards.slice(0, padNeeded);
            entry.padCards.push(...actual);
            player.removeCards(actual);
            results.push({ playerIdx: entry.playerIdx, padCards: actual });
        }
        this.trickCardCount = 4;
        return results.length > 0 ? results : null;
    }

    /**
     * Resolves the current trick: determines the winner and awards score.
     * Returns the winner's player index, or -1 if the trick is not yet complete.
     * @returns {number}
     */
    resolveTrick() {
        if (!this.isTrickComplete()) return -1;

        let bestEntry = this.currentTrick[0];
        for (const entry of this.currentTrick.slice(1)) {
            if (doesBeat(entry.cards, bestEntry.cards, this.trumpSuit)) {
                bestEntry = entry;
            }
        }

        const winner     = bestEntry.playerIdx;
        const trickScore = this.currentTrick.reduce((sum, e) => sum + e.score(), 0);
        this.players[winner].trickScore += trickScore;
        this.trickWinner = winner;

        return winner;
    }

    /**
     * Clears the current trick and starts a new one led by the previous winner.
     * Sets allTricksDone + phase = GAME_END when all hands are empty.
     */
    startNextTrick() {
        const winner      = this.trickWinner;
        this.currentTrick = [];
        this._startTrick(winner);

        if (this.players.every(p => p.hand.length === 0)) {
            this.allTricksDone = true;
            this.phase         = Phase.GAME_END;
        }
    }

    /**
     * Returns the delta score for each player relative to the 180-point baseline.
     * Positive = won that many points; negative = lost that many.
     * @returns {number[]} [delta0, delta1, delta2]
     */
    calculateFinalScores() {
        const baseline = 180;
        return this.players.map(p => p.trickScore - baseline);
    }

    /**
     * Resets the game (re-deals). The winner of the last complete game leads
     * the trump-calling phase; otherwise a random player is chosen.
     */
    reset() {
        let startFrom;
        if (this.allTricksDone) {
            startFrom = this.players.reduce(
                (bestIdx, p, i) => p.trickScore > this.players[bestIdx].trickScore ? i : bestIdx,
                0
            );
        } else {
            startFrom = Math.floor(Math.random() * 3);
        }
        this._deal(startFrom);
    }
}
