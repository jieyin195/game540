/**
 * input.js - 用户输入处理（鼠标 + 触摸）及游戏更新循环（AI计时、出牌结算）
 */

import { Phase } from './game.js';
import { canCallTrump, canCounterTrump } from './rules.js';
import { aiDecideCallTrump, aiLead, aiFollow } from './ai.js';

// ---------------------------------------------------------------------------
// Helper: display names joined by space
// ---------------------------------------------------------------------------

/**
 * Returns display names of cards joined by space.
 * @param {import('./card.js').Card[]} cards
 * @returns {string}
 */
function cardsCn(cards) {
    return cards.map(c => c.displayName()).join(' ');
}

// ---------------------------------------------------------------------------
// Hit test helpers (private)
// ---------------------------------------------------------------------------

/**
 * @param {{x:number,y:number}} pos
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @returns {boolean}
 */
function _hit(pos, rect) {
    return pos.x >= rect.x && pos.x <= rect.x + rect.w &&
           pos.y >= rect.y && pos.y <= rect.y + rect.h;
}

/**
 * Inflated hit test: expands the hit zone vertically by `inflate` pixels
 * on both the top and bottom edges (touch-friendly).
 * @param {{x:number,y:number}} pos
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @param {number} inflate
 * @returns {boolean}
 */
function _hitInflated(pos, rect, inflate) {
    return pos.x >= rect.x && pos.x <= rect.x + rect.w &&
           pos.y >= rect.y - inflate && pos.y <= rect.y + rect.h + inflate;
}

// ---------------------------------------------------------------------------
// InputHandler class
// ---------------------------------------------------------------------------

export class InputHandler {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {import('./renderer.js').GameRenderer} renderer
     */
    constructor(canvas, renderer) {
        this._canvas   = canvas;
        this._renderer = renderer;

        canvas.addEventListener('mousedown', (e) => {
            this._onPointer(e.clientX, e.clientY);
        });

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const t = e.touches[0];
            this._onPointer(t.clientX, t.clientY);
        }, { passive: false });
    }

    // ------------------------------------------------------------------
    // Coordinate conversion
    // ------------------------------------------------------------------

    /**
     * Converts screen (CSS pixel) coordinates to canvas pixel coordinates,
     * accounting for CSS scaling.
     * @param {number} clientX
     * @param {number} clientY
     * @returns {{x:number,y:number}}
     */
    _toCanvasPos(clientX, clientY) {
        const rect   = this._canvas.getBoundingClientRect();
        const scaleX = this._canvas.width  / rect.width;
        const scaleY = this._canvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top)  * scaleY,
        };
    }

    // ------------------------------------------------------------------
    // Main pointer dispatch
    // ------------------------------------------------------------------

    /**
     * @param {number} clientX
     * @param {number} clientY
     */
    _onPointer(clientX, clientY) {
        const renderer = this._renderer;
        const game     = renderer.game;
        const pos      = this._toCanvasPos(clientX, clientY);
        const btns     = renderer.getButtonRects();

        // 1. Close tracker popup on any tap
        if (renderer.showTracker) {
            renderer.showTracker = false;
            return;
        }

        // 2. Tracker button
        if (btns.tracker && _hit(pos, btns.tracker)) {
            renderer.showTracker = true;
            return;
        }

        // 3. Game-end screen: restart button
        if (game.phase === Phase.GAME_END) {
            if (renderer._restartBtnRect && _hit(pos, renderer._restartBtnRect)) {
                game.reset();
                // Reset renderer state
                renderer.selectedIndices    = [];
                renderer.showingTrickResult = false;
                renderer.lastTrickDisplay   = 0;
                renderer.aiPending          = false;
                renderer.aiActionTime       = 0;
                renderer._aiCallTimes       = null;
                renderer.callPhase          = 'idle';
                renderer.callOrder          = [];
                renderer.callCurrent        = -1;
                renderer.callWaitHuman      = false;
                renderer.callAiTime         = 0;
                renderer.playedCards        = [];
                renderer.dealStartTime      = Date.now();
                renderer._sortHumanHand();
                renderer.addMessage('新局开始');
            }
            return;
        }

        // 4. Call-trump phase
        if (game.phase === Phase.CALL_TRUMP) {
            this._clickCallTrump(pos);
            return;
        }

        // 5. Play phase
        if (game.phase === Phase.PLAY) {
            this._clickPlay(pos);
            return;
        }
    }

    // ------------------------------------------------------------------
    // Call-trump click handling
    // ------------------------------------------------------------------

    /**
     * @param {{x:number,y:number}} pos
     */
    _clickCallTrump(pos) {
        const renderer = this._renderer;
        const game     = renderer.game;
        const btns     = renderer.getButtonRects();
        const hand     = game.players[1].hand;
        const revealed = renderer._dealRevealedCount();

        // Only respond to clicks when it's human's turn in the sequential flow
        // (or during dealing, allow card selection)
        const humanTurn = renderer.callWaitHuman && renderer.callCurrent === 1;

        // Iterate rects in REVERSE order (topmost card drawn last = visually on top)
        const rects = renderer.humanHandRects;
        for (let i = rects.length - 1; i >= 0; i--) {
            if (i >= revealed) continue;
            if (_hitInflated(pos, rects[i], 22)) {
                const selIdx = renderer.selectedIndices.indexOf(i);
                if (selIdx !== -1) {
                    renderer.selectedIndices.splice(selIdx, 1);
                } else {
                    renderer.selectedIndices.push(i);
                }
                return;
            }
        }

        // Call/Counter button — only when it's human's turn
        if (humanTurn && btns.call && _hit(pos, btns.call)) {
            const sel = renderer.selectedIndices
                .filter(i => i < hand.length)
                .sort((a, b) => a - b)
                .map(i => hand[i]);

            const currentCall = game.trumpCaller !== -1 ? game.trumpCallCards : null;
            const valid = currentCall
                ? canCounterTrump(sel, currentCall)
                : canCallTrump(sel);

            if (valid) {
                const ok = game.processCallTrump(1, sel);
                if (ok) {
                    renderer.selectedIndices = [];
                    renderer._sortHumanHand();
                    const label = renderer.callPhase === 'countering' ? '反主' : '叫主';
                    renderer.addMessage(`你${label}: ${cardsCn(sel)}`);
                    renderer.callWaitHuman = false;
                    _startCounterRound(renderer, game, 1);
                }
            } else {
                renderer.addMessage('所选牌不能叫主');
            }
            return;
        }

        // Pass button — only when it's human's turn
        if (humanTurn && btns.pass && _hit(pos, btns.pass)) {
            game.processCallTrump(1, null);
            renderer.selectedIndices = [];
            renderer.addMessage('你 Pass');
            renderer.callWaitHuman = false;
            _advanceCallTurn(renderer, game);
            return;
        }
    }

    // ------------------------------------------------------------------
    // Play-phase click handling
    // ------------------------------------------------------------------

    /**
     * @param {{x:number,y:number}} pos
     */
    _clickPlay(pos) {
        const renderer = this._renderer;
        const game     = renderer.game;
        const btns     = renderer.getButtonRects();

        // Ignore clicks during trick-result display or when it's not human's turn
        if (renderer.showingTrickResult) return;
        if (game.whoLeads() !== 1) return;

        const hand  = game.players[1].hand;
        const rects = renderer.humanHandRects;

        // Iterate in reverse (topmost card first)
        for (let i = rects.length - 1; i >= 0; i--) {
            if (_hitInflated(pos, rects[i], 22)) {
                const selIdx = renderer.selectedIndices.indexOf(i);
                if (selIdx !== -1) {
                    renderer.selectedIndices.splice(selIdx, 1);
                } else {
                    renderer.selectedIndices.push(i);
                }
                return;
            }
        }

        // Play button
        if (btns.play && _hit(pos, btns.play)) {
            if (renderer.selectedIndices.length === 0) return;

            const sel = renderer.selectedIndices
                .filter(i => i < hand.length)
                .sort((a, b) => a - b)
                .map(i => hand[i]);

            if (sel.length === 0) return;

            const [ok, err] = game.playCards(1, sel);
            if (ok) {
                renderer.selectedIndices = [];
                renderer._sortHumanHand();
                renderer.addMessage(`你出牌: ${cardsCn(sel)}`);
                _afterPlay(renderer, game);
            } else {
                renderer.addMessage(`出牌无效: ${err}`);
            }
            return;
        }
    }
}

// ---------------------------------------------------------------------------
// After-play hook (private)
// ---------------------------------------------------------------------------

/**
 * Called after any player's cards are successfully played.
 * If the trick is now complete, resolves it and sets up the result display.
 * @param {import('./renderer.js').GameRenderer} renderer
 * @param {import('./game.js').GameState} game
 */
function _afterPlay(renderer, game) {
    if (!game.isTrickComplete()) return;

    const winner     = game.resolveTrick();
    const trickScore = game.currentTrick.reduce((sum, e) => sum + e.score(), 0);
    const wname      = game.players[winner].name;

    renderer.addMessage(`${wname} 赢得本轮${trickScore > 0 ? `，得${trickScore}分` : ''}`);

    // Push all played cards to tracker
    for (const entry of game.currentTrick) {
        renderer.playedCards.push(...entry.cards);
    }

    renderer.showingTrickResult = true;
    renderer.lastTrickDisplay   = Date.now();
}

// ---------------------------------------------------------------------------
// Update loop (exported, called every animation frame from main.js)
// ---------------------------------------------------------------------------

/**
 * Called every frame from main.js. Drives AI timing, trick resolution, etc.
 * @param {import('./renderer.js').GameRenderer} renderer
 */
export function updateGame(renderer) {
    const game = renderer.game;

    // ------------------------------------------------------------------
    // Trick result display: hold for 1800 ms then advance
    // ------------------------------------------------------------------
    if (renderer.showingTrickResult) {
        if (Date.now() - renderer.lastTrickDisplay >= 1800) {
            renderer.showingTrickResult = false;

            if (game.allTricksDone || game.phase === Phase.GAME_END) {
                // Game already ended (set by resolveTrick/startNextTrick)
                game.phase = Phase.GAME_END;
            } else {
                game.startNextTrick();
                renderer._sortHumanHand();
                renderer.aiPending  = false;
                renderer.aiActionTime = 0;
            }
        }
        return; // Don't drive AI while showing trick result
    }

    // ------------------------------------------------------------------
    // CALL_TRUMP phase: AI call timing
    // ------------------------------------------------------------------
    if (game.phase === Phase.CALL_TRUMP) {
        _updateCallTrump(renderer, game);
        return;
    }

    // ------------------------------------------------------------------
    // PLAY phase: AI move timing
    // ------------------------------------------------------------------
    if (game.phase === Phase.PLAY) {
        _updatePlay(renderer, game);
    }
}

// ---------------------------------------------------------------------------
// Call-trump update (private)
// ---------------------------------------------------------------------------

/**
 * Sequential call/counter-trump flow:
 * 1. After dealing, each player gets a turn to call (starting from callTrumpIdx)
 * 2. If someone calls → counter-trump round: other 2 players get sequential turns
 * 3. If someone counters → new counter round (skip the counter-er)
 * 4. All pass → done
 */
function _updateCallTrump(renderer, game) {
    const now     = Date.now();
    const dealEnd = renderer.dealStartTime + renderer.DEAL_DURATION;

    // Wait for dealing to finish
    if (now < dealEnd) return;

    // ── Start initial calling round once dealing is done ──
    if (renderer.callPhase === 'idle') {
        renderer.callPhase = 'calling';
        renderer.callOrder = [];
        // Starting player + next 2 in order
        for (let offset = 0; offset < 3; offset++) {
            renderer.callOrder.push((game.callTrumpIdx + offset) % 3);
        }
        _advanceCallTurn(renderer, game);
        return;
    }

    // ── Countering / Calling: process current player ──
    const idx = renderer.callCurrent;

    // Human's turn → wait for click (handled in _clickCallTrump)
    if (idx === 1) return;

    // AI's turn → wait for timer
    if (now < renderer.callAiTime) return;

    // AI decides
    const player = game.players[idx];
    const currentCall = game.trumpCaller !== -1 ? game.trumpCallCards : null;
    const call = aiDecideCallTrump(player.hand, currentCall);

    if (renderer.callPhase === 'calling') {
        // Initial calling round
        if (call && game.processCallTrump(idx, call)) {
            renderer._sortHumanHand();
            renderer.addMessage(`${player.name} 叫主: ${cardsCn(call)}`);
            _startCounterRound(renderer, game, idx);
        } else {
            renderer.addMessage(`${player.name} Pass`);
            _advanceCallTurn(renderer, game);
        }
    } else {
        // Counter round
        if (call && canCounterTrump(call, currentCall) && game.processCallTrump(idx, call)) {
            renderer._sortHumanHand();
            renderer.addMessage(`${player.name} 反主: ${cardsCn(call)}`);
            _startCounterRound(renderer, game, idx);
        } else {
            renderer.addMessage(`${player.name} Pass`);
            _advanceCallTurn(renderer, game);
        }
    }
}

/**
 * Start a counter-trump round: other 2 players get turns after the caller.
 */
function _startCounterRound(renderer, game, callerIdx) {
    renderer.callPhase = 'countering';
    renderer.callOrder = [];
    for (let offset = 1; offset <= 2; offset++) {
        renderer.callOrder.push((callerIdx + offset) % 3);
    }
    _advanceCallTurn(renderer, game);
}

/**
 * Advance to the next player in the call/counter queue.
 */
function _advanceCallTurn(renderer, game) {
    if (renderer.callOrder.length === 0) {
        // All players have decided
        if (renderer.callPhase === 'calling' && game.trumpCaller === -1) {
            // No one called → 常主
            game.finishCallTrump();
            renderer.callPhase = 'idle';
            renderer._sortHumanHand();
            renderer.addMessage('无人叫主，常主模式');
        } else if (renderer.callPhase === 'calling' && game.trumpCaller !== -1) {
            // Someone called during initial round, start counter
            _startCounterRound(renderer, game, game.trumpCaller);
        } else {
            // Counter round done, all passed
            game.finishCallTrump();
            renderer.callPhase = 'idle';
            renderer._sortHumanHand();
            renderer.addMessage(game.message);
        }
        return;
    }

    renderer.callCurrent = renderer.callOrder.shift();

    if (renderer.callCurrent === 1) {
        // Human's turn
        renderer.callWaitHuman = true;
        renderer.selectedIndices = [];
    } else {
        // AI's turn: 1.2s delay
        renderer.callWaitHuman = false;
        renderer.callAiTime = Date.now() + 1200;
    }
}

// ---------------------------------------------------------------------------
// Play update (private)
// ---------------------------------------------------------------------------

/**
 * Handles AI timing for the play phase.
 * @param {import('./renderer.js').GameRenderer} renderer
 * @param {import('./game.js').GameState} game
 */
function _updatePlay(renderer, game) {
    const leader = game.whoLeads();

    // -1 = trick complete (waiting for result display), 1 = human's turn
    if (leader === -1 || leader === 1) return;

    const now = Date.now();

    if (!renderer.aiPending) {
        // Schedule the AI move
        renderer.aiPending    = true;
        renderer.aiActionTime = now + renderer.aiDelay;
        return;
    }

    if (now < renderer.aiActionTime) return; // still waiting

    // Time to play!
    renderer.aiPending = false;

    const hand       = game.players[leader].hand;
    const trumpSuit  = game.trumpSuit;
    const ledCards   = game.getLedCards();
    const anyUnplayed = game.players.some((p, i) => i !== leader && !p.hasPlayed);

    let cards;
    try {
        if (!ledCards) {
            // This AI is leading the trick
            cards = aiLead(hand, trumpSuit, anyUnplayed,
                          leader === game.trumpCaller ? game.mustPlayCards : null);
        } else {
            // Following
            const currentBest  = game.getCurrentBest() ?? [];
            const trickHasScore = game.trickHasScore();
            cards = aiFollow(hand, ledCards, currentBest, trumpSuit, trickHasScore);
        }

        // Ensure the AI plays the correct number of cards
        if (ledCards && cards.length !== ledCards.length) {
            const needed = ledCards.length;
            if (cards.length > needed) {
                cards = cards.slice(0, needed);
            } else {
                // Pad from the rest of hand
                const extra = hand.filter(c => !cards.includes(c));
                cards = [...cards, ...extra].slice(0, needed);
            }
        }

        // Validate cards are actually in the hand
        cards = cards.filter(c => hand.includes(c));
        if (cards.length === 0) cards = hand.slice(0, ledCards ? ledCards.length : 1);

    } catch (e) {
        console.error('AI decision error:', e);
        // Fallback: pick first N cards from hand
        const n = ledCards ? ledCards.length : 1;
        cards = hand.slice(0, n);
    }

    // Play the cards (skipValidation = true for AI)
    const [ok, err] = game.playCards(leader, cards, true);
    if (ok) {
        renderer.addMessage(`${game.players[leader].name} 出牌: ${cardsCn(cards)}`);
        _afterPlay(renderer, game);
    } else {
        // Fallback: brute-force first N cards
        console.warn(`AI playCards failed (${err}), using fallback`);
        const n       = ledCards ? ledCards.length : 1;
        const fbCards = hand.slice(0, Math.min(n, hand.length));
        const [fbOk]  = game.playCards(leader, fbCards, true);
        if (fbOk) {
            renderer.addMessage(`${game.players[leader].name} 出牌: ${cardsCn(fbCards)}`);
            _afterPlay(renderer, game);
        }
    }
}
