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
    mustLeadPairOrBiggest, getPadCards,
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
        this.hasPlayed  = false; // 本局是否出过牌
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
    }

    /** @returns {number} */
    score() {
        return totalScore(this.cards);
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

        // 被炸后垫牌状态
        this.bombPadNeeded   = false;
        this.bombPadPlayer   = -1;
        this.bombPadCount    = 0;

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
        this.trickWinner    = -1;
        this.allTricksDone  = false;
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
                this.mustPlayCards  = [...callCards];
                this.trumpSuit      = this._extractTrumpSuit(callCards);
                this.message        = `${this.players[playerIdx].name} 叫主`;
                return true;
            }
            return false;
        } else {
            if (canCounterTrump(callCards, this.trumpCallCards)) {
                this.trumpCaller    = playerIdx;
                this.trumpCallCards = callCards;
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

            // First-play rule: if any other player hasn't played yet, must lead a pair
            // (or the biggest single if no pairs exist)
            const anyUnplayed = this.players.some(
                (p, i) => i !== playerIdx && !p.hasPlayed
            );
            if (anyUnplayed && !skipValidation) {
                const pairs = getPairs(player.hand, this.trumpSuit);
                if (pairs.length > 0) {
                    // Must play a pair-based type
                    const pairTypes = [
                        PlayType.PAIR, PlayType.CONSEC_PAIRS,
                        PlayType.TRIPLE, PlayType.CONSEC_TRIPLES,
                        PlayType.BOMB,
                    ];
                    if (!pairTypes.includes(playType)) {
                        return [false, '有玩家未出过牌，必须出对子（或连对等）'];
                    }
                } else {
                    // No pairs — must play the biggest single
                    if (playType !== PlayType.SINGLE) return [false, '无对子时必须出单张'];
                    const best = player.hand.reduce((b, c) =>
                        cardPower(c, this.trumpSuit) > cardPower(b, this.trumpSuit) ? c : b
                    );
                    if (cards[0] !== best) return [false, `必须出最大单张: ${best}`];
                }
            }

            // Tag play order on the cards
            cards.forEach((c, i) => { c.playOrder = i; });

            this.currentTrick.push(new TrickEntry(playerIdx, cards));
            player.removeCards(cards);
            player.hasPlayed = true;
            return [true, ''];

        } else {
            // Following
            const ledCards    = this.getLedCards();
            const currentBest = this.getCurrentBest();
            const hasScore    = this.trickHasScore();

            if (!skipValidation) {
                const [ok, err] = validateFollow(
                    cards, ledCards, player.hand,
                    this.trumpSuit, hasScore, currentBest ?? []
                );
                if (!ok) return [false, err];
            }

            cards.forEach((c, i) => { c.playOrder = this.currentTrick.length * 10 + i; });

            this.currentTrick.push(new TrickEntry(playerIdx, cards));
            player.removeCards(cards);
            player.hasPlayed = true;
            return [true, ''];
        }
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

        // Note: bomb-after-bomb padding (炸弹垫牌) is handled by the UI layer.

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
