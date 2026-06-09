/**
 * renderer.js - 540打牌游戏 Canvas 渲染引擎
 *
 * Translated from game_540/ui.py (pygame → HTML5 Canvas 2D)
 */

import {
    SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS, SUIT_SPECIAL,
    RANK_DISPLAY,
} from './card.js';
import {
    isTrump, cardPower, canCallTrump, canCounterTrump,
    getPairs, PlayType, getPlayType,
} from './rules.js';
import { Phase } from './game.js';

// ---------------------------------------------------------------------------
// Color constants
// ---------------------------------------------------------------------------
const C_BG        = '#226e22';
const C_CARD_BG   = '#fffdf0';
const C_CARD_BACK = '#194696';
const C_CARD_SEL  = '#ffdc32';
const C_RED       = '#d21e1e';
const C_BLACK     = '#141414';
const C_GOLD      = '#be9614';
const C_PURPLE    = '#6e1ea0';
const C_WHITE     = '#ffffff';
const C_GRAY      = '#969696';
const C_DARK_GRAY = '#505050';
const C_PANEL_BG  = '#123712';
const C_BTN_GREEN = '#28a028';
const C_BTN_RED   = '#b42828';
const C_BTN_GRAY  = '#646464';
const C_HIGHLIGHT = '#ffff64';

const SUIT_COLOR_MAP = {
    [SUIT_SPADES]:   C_BLACK,
    [SUIT_CLUBS]:    C_BLACK,
    [SUIT_HEARTS]:   C_RED,
    [SUIT_DIAMONDS]: C_RED,
    [SUIT_SPECIAL]:  C_PURPLE,
};

const SUIT_SYMBOL = {
    [SUIT_SPADES]:   '\u2660',
    [SUIT_HEARTS]:   '\u2665',
    [SUIT_CLUBS]:    '\u2663',
    [SUIT_DIAMONDS]: '\u2666',
    [SUIT_SPECIAL]:  '',
};

const SUIT_DISPLAY_NAME = {
    [SUIT_SPADES]:   '黑桃',
    [SUIT_HEARTS]:   '红心',
    [SUIT_CLUBS]:    '梅花',
    [SUIT_DIAMONDS]: '方块',
    null:            '常主',
};

const FONT_STACK = '"Noto Sans SC", "Microsoft YaHei", "SimHei", sans-serif';

// ---------------------------------------------------------------------------
// Helper: card Chinese name (for log messages)
// ---------------------------------------------------------------------------
function cardCn(card) {
    if (card.suit === SUIT_SPECIAL ||
        ['small_joker', 'big_joker', 'character'].includes(card.rank)) {
        return RANK_DISPLAY[card.rank] ?? card.rank;
    }
    const suitCn = { spades: '黑桃', hearts: '红心', clubs: '梅花', diamonds: '方块' };
    return `${suitCn[card.suit] ?? card.suit}${RANK_DISPLAY[card.rank] ?? card.rank}`;
}

function cardsCn(cards) {
    return cards.map(cardCn).join(' ');
}

// ---------------------------------------------------------------------------
// GameRenderer
// ---------------------------------------------------------------------------
export class GameRenderer {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {import('./game.js').GameState} game
     */
    constructor(canvas, game) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        this.game   = game;

        /** @type {number[]} */
        this.selectedIndices  = [];
        /** @type {{x:number,y:number,w:number,h:number}[]} */
        this.humanHandRects   = [];
        /** @type {string[]} */
        this.messageLog       = [];
        this.showingTrickResult = false;
        this.lastTrickDisplay   = 0;

        this.aiPending    = false;
        this.aiActionTime = 0;
        this.aiDelay      = 900; // ms

        /** @type {import('./card.js').Card[]} */
        this.playedCards  = [];
        this.showTracker  = false;

        this.dealStartTime = Date.now();
        this.DEAL_DURATION = 7000;  // ms
        this.DEAL_TOTAL    = 42;
        this.CALL_WINDOW   = 8000;  // ms

        /** @type {Object|null} */
        this._aiCallTimes = null;

        // 叫主轮询状态
        this.callPhase        = 'idle';  // 'idle' | 'calling' | 'countering'
        this.callOrder        = [];      // 待询问的玩家索引队列
        this.callCurrent      = -1;      // 当前正在决定的玩家索引
        this.callWaitHuman    = false;   // 等待人类决定
        this.callAiTime       = 0;       // AI决定的时间戳

        /** @type {Object<string,{x:number,y:number,w:number,h:number}>} */
        this._buttonRects = {};
        /** @type {{x:number,y:number,w:number,h:number}|null} */
        this._restartBtnRect = null;

        this._sortHumanHand();
    }

    // ------------------------------------------------------------------
    // Layout (responsive, called every frame)
    // ------------------------------------------------------------------
    _layout() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const cardW = Math.max(36, Math.min(W * 0.042, 68));
        const cardH = cardW * 1.47;
        const pad   = 6;

        const leftW  = Math.round(W * 0.07);
        const rightW = Math.round(W * 0.20);
        const topH   = Math.round(H * 0.13);
        const botH   = Math.round(H * 0.25);

        const centerW = W - leftW - rightW - 3 * pad;
        const centerH = H - topH  - botH  - 3 * pad;

        return {
            W, H, cardW, cardH, pad,
            top:    { x: pad,                     y: pad,                  w: W - 2 * pad,  h: topH },
            left:   { x: pad,                     y: topH + 2 * pad,      w: leftW,         h: centerH },
            center: { x: leftW + 2 * pad,         y: topH + 2 * pad,      w: centerW,       h: centerH },
            right:  { x: leftW + centerW + 3 * pad, y: topH + 2 * pad,    w: rightW,        h: centerH },
            bottom: { x: pad,                     y: topH + centerH + 3 * pad, w: W - 2 * pad, h: botH },
        };
    }

    // ------------------------------------------------------------------
    // Text helper
    // ------------------------------------------------------------------
    _fillText(text, x, y, options = {}) {
        const ctx  = this.ctx;
        const size  = options.size  || 16;
        const color = options.color || C_WHITE;
        const bold  = options.bold  ? 'bold ' : '';
        const font  = options.font  || FONT_STACK;
        ctx.font      = `${bold}${size}px ${font}`;
        ctx.fillStyle = color;
        ctx.textBaseline = 'top';
        if (options.center) {
            ctx.textAlign = 'center';
            ctx.fillText(text, x, y);
            ctx.textAlign = 'start';
        } else {
            ctx.textAlign = 'start';
            ctx.fillText(text, x, y);
        }
    }

    // ------------------------------------------------------------------
    // Rounded rect path helper
    // ------------------------------------------------------------------
    _roundRect(x, y, w, h, r) {
        const ctx = this.ctx;
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // ------------------------------------------------------------------
    // Card back
    // ------------------------------------------------------------------
    drawCardBack(x, y, w, h) {
        const ctx = this.ctx;
        // Outer
        this._roundRect(x, y, w, h, 6);
        ctx.fillStyle = C_CARD_BACK;
        ctx.fill();
        ctx.strokeStyle = '#b4c8f0';
        ctx.lineWidth   = 2;
        ctx.stroke();
        // Inner rect
        const m = Math.round(w * 0.06);
        this._roundRect(x + m, y + m, w - 2 * m, h - 2 * m, 4);
        ctx.fillStyle = '#285aaa';
        ctx.fill();
        // Diamond pattern (4 circles)
        const cx = x + w / 2;
        const cy = y + h / 2;
        const dd = Math.round(w * 0.21);
        for (const [dx, dy] of [[0, -dd], [dd, 0], [0, dd], [-dd, 0]]) {
            ctx.beginPath();
            ctx.arc(cx + dx, cy + dy, Math.max(2, w * 0.045), 0, Math.PI * 2);
            ctx.fillStyle = '#3c6ebe';
            ctx.fill();
        }
    }

    // ------------------------------------------------------------------
    // Joker card face
    // ------------------------------------------------------------------
    drawJoker(x, y, w, h, isBig) {
        const ctx = this.ctx;
        const cx  = x + w / 2;
        const cy  = y + h / 2;
        const s   = w / 68; // scale factor relative to original CARD_W=68

        let bg, fg, accent, label;
        if (isBig) {
            bg = '#dc1e1e'; fg = C_WHITE; accent = '#ffc800'; label = '大王';
        } else {
            bg = '#1e1e32'; fg = C_WHITE; accent = '#b4b4c8'; label = '小王';
        }

        // Background
        this._roundRect(x, y, w, h, 6);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth   = 2;
        ctx.stroke();

        // Crown polygon (7 points, scaled)
        const crownCx = cx;
        const crownCy = cy - 14 * s;
        const crownW  = 28 * s;
        const crownH  = 18 * s;
        const pts = [
            [crownCx - crownW,     crownCy + crownH],
            [crownCx - crownW,     crownCy],
            [crownCx - crownW / 2, crownCy - crownH / 2],
            [crownCx,              crownCy + crownH / 4],
            [crownCx + crownW / 2, crownCy - crownH / 2],
            [crownCx + crownW,     crownCy],
            [crownCx + crownW,     crownCy + crownH],
        ];

        // Fill crown
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.fillStyle = accent;
        ctx.fill();
        ctx.strokeStyle = fg;
        ctx.lineWidth   = 1;
        ctx.stroke();

        // Jewels on crown tips
        const jewels = [
            [crownCx - crownW, crownCy],
            [crownCx,          crownCy + crownH / 4],
            [crownCx + crownW, crownCy],
        ];
        for (const [jx, jy] of jewels) {
            ctx.beginPath();
            ctx.arc(jx, jy, Math.max(2, 3 * s), 0, Math.PI * 2);
            ctx.fillStyle = fg;
            ctx.fill();
        }

        // "JOKER" text
        this._fillText('JOKER', cx, cy + 16 * s, {
            size: Math.round(14 * s), color: fg, center: true,
            font: '"Segoe UI", Arial, sans-serif',
        });

        // Corner label
        this._fillText(label, x + 3 * s, y + 3 * s, {
            size: Math.round(13 * s), color: fg, bold: true,
        });
    }

    // ------------------------------------------------------------------
    // Special plain card (字牌 / 3)
    // ------------------------------------------------------------------
    drawSpecialPlain(x, y, w, h, rank) {
        const ctx = this.ctx;
        const cx  = x + w / 2;
        const cy  = y + h / 2;
        const s   = w / 68;

        let bgColor, centerText, cornerText;
        if (rank === '3') {
            bgColor = '#f0e6ff'; centerText = '3'; cornerText = '3';
        } else {
            bgColor = '#e6dcff'; centerText = '字牌'; cornerText = '字';
        }

        // Background
        this._roundRect(x, y, w, h, 6);
        ctx.fillStyle = bgColor;
        ctx.fill();
        ctx.strokeStyle = C_PURPLE;
        ctx.lineWidth   = 2;
        ctx.stroke();

        // Center text
        this._fillText(centerText, cx, cy - 10 * s, {
            size: Math.round(20 * s), color: C_PURPLE, bold: true, center: true,
        });

        // Corner label
        this._fillText(cornerText, x + 3 * s, y + 3 * s, {
            size: Math.round(14 * s), color: C_PURPLE, bold: true,
        });

        // Second character for 字牌
        if (rank !== '3') {
            this._fillText('牌', x + 3 * s, y + 3 * s + 16 * s, {
                size: Math.round(14 * s), color: C_PURPLE, bold: true,
            });
        }
    }

    // ------------------------------------------------------------------
    // Main card drawing dispatcher
    // ------------------------------------------------------------------
    /**
     * @param {import('./card.js').Card|null} card
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {boolean} faceUp
     * @param {boolean} selected
     * @param {boolean} highlightCall
     * @returns {{x:number,y:number,w:number,h:number}}
     */
    drawCard(card, x, y, w, h, faceUp = true, selected = false, highlightCall = false) {
        const ctx = this.ctx;

        if (!faceUp || card === null) {
            this.drawCardBack(x, y, w, h);
            return { x, y, w, h };
        }

        const rank = card.rank;
        const suit = card.suit;

        // Special cards
        if (suit === SUIT_SPECIAL) {
            if (rank === 'big_joker') {
                this.drawJoker(x, y, w, h, true);
            } else if (rank === 'small_joker') {
                this.drawJoker(x, y, w, h, false);
            } else {
                this.drawSpecialPlain(x, y, w, h, rank);
            }
            // Selection border overlay
            if (selected) {
                this._roundRect(x, y, w, h, 6);
                ctx.strokeStyle = C_CARD_SEL;
                ctx.lineWidth   = 4;
                ctx.stroke();
            }
            return { x, y, w, h };
        }

        // Regular card
        const color    = SUIT_COLOR_MAP[suit] || C_BLACK;
        const sym      = SUIT_SYMBOL[suit]    || '';
        const rankStr  = RANK_DISPLAY[rank]   || rank;
        const s        = w / 68; // scale factor

        // Background
        let bg;
        if (selected) {
            bg = C_CARD_SEL;
        } else if (highlightCall) {
            bg = '#ffeb96';
        } else {
            bg = C_CARD_BG;
        }

        this._roundRect(x, y, w, h, 6);
        ctx.fillStyle = bg;
        ctx.fill();

        const bw = selected ? 3 : 1;
        const bc = selected ? '#c89600' : C_DARK_GRAY;
        ctx.strokeStyle = bc;
        ctx.lineWidth   = bw;
        ctx.stroke();

        // Top-left corner: rank + suit
        const rankFontSize = Math.round(15 * s);
        const suitFontSize = Math.round(18 * s);
        this._fillText(rankStr, x + 4 * s, y + 3 * s, {
            size: rankFontSize, color, bold: true,
        });
        this._fillText(sym, x + 4 * s, y + 3 * s + rankFontSize + 1, {
            size: suitFontSize, color,
        });

        // Center: large suit symbol + rank text
        const cSuitSize = Math.round(38 * s);
        const cRankSize = Math.round(22 * s);
        this._fillText(sym, x + w / 2, y + h / 2 - 14 * s - cSuitSize / 2, {
            size: cSuitSize, color, center: true,
        });
        this._fillText(rankStr, x + w / 2, y + h / 2 + 10 * s, {
            size: cRankSize, color, bold: true, center: true,
        });

        return { x, y, w, h };
    }

    // ------------------------------------------------------------------
    // Hand drawing: horizontal (for top AI and bottom human)
    // ------------------------------------------------------------------
    /**
     * @param {import('./card.js').Card[]} cards
     * @param {number} areaX
     * @param {number} areaY
     * @param {number} areaW
     * @param {Object} options
     * @returns {{x:number,y:number,w:number,h:number}[]}
     */
    drawHandHorizontal(cards, areaX, areaY, areaW, options = {}) {
        const {
            faceUp = true,
            selectedIndices = null,
            callableIndices = null,
            cardH = null,
        } = options;

        const layout = this._layout();
        const cw = layout.cardW;
        const ch = cardH || layout.cardH;
        const margin = 5;

        const n = cards.length;
        if (n === 0) return [];

        const totalNatural = n * cw + (n - 1) * margin;
        let step;
        if (totalNatural <= areaW) {
            step = cw + margin;
        } else {
            step = Math.max(Math.round(cw * 0.26), Math.round((areaW - cw) / Math.max(n - 1, 1)));
        }

        const actualW = cw + (n - 1) * step;
        const startX  = areaX + Math.round((areaW - actualW) / 2);

        const selOffset = Math.round(16 * ch / 100);
        const rects = [];
        for (let i = 0; i < n; i++) {
            const sel = selectedIndices !== null && selectedIndices.includes(i);
            const hl  = callableIndices !== null && callableIndices.includes(i);
            const cy  = areaY - (sel ? selOffset : 0);
            const r   = this.drawCard(cards[i], startX + i * step, cy, cw, ch,
                                       faceUp, sel, hl);
            rects.push(r);
        }
        return rects;
    }

    // ------------------------------------------------------------------
    // Hand drawing: vertical (for left AI)
    // ------------------------------------------------------------------
    drawHandVertical(cards, areaX, areaY, areaH) {
        const n = cards.length;
        if (n === 0) return [];

        const layout = this._layout();
        const cw = Math.round(layout.cardW * 0.6);
        const ch = Math.round(layout.cardH * 0.6);
        const step = Math.max(Math.round(ch * 0.18),
            Math.round((areaH - ch) / Math.max(n - 1, 1)));
        const startY = areaY + Math.round((areaH - ch - (n - 1) * step) / 2);

        for (let i = 0; i < n; i++) {
            this.drawCardBack(areaX, startY + i * step, cw, ch);
        }
    }

    // ------------------------------------------------------------------
    // Button
    // ------------------------------------------------------------------
    /**
     * @returns {{x:number,y:number,w:number,h:number}}
     */
    drawButton(text, x, y, w, h, color = C_BTN_GREEN, enabled = true) {
        const ctx = this.ctx;
        const col = enabled ? color : C_BTN_GRAY;

        this._roundRect(x, y, w, h, 7);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.strokeStyle = C_WHITE;
        ctx.lineWidth   = 2;
        ctx.stroke();

        const fontSize = Math.round(Math.min(h * 0.45, w * 0.16));
        this._fillText(text, x + w / 2, y + (h - fontSize) / 2, {
            size: fontSize, color: C_WHITE, bold: true, center: true,
        });

        return { x, y, w, h };
    }

    // ------------------------------------------------------------------
    // Panel (dark green rounded rect)
    // ------------------------------------------------------------------
    drawPanel(area) {
        const ctx = this.ctx;
        this._roundRect(area.x, area.y, area.w, area.h, 8);
        ctx.fillStyle = C_PANEL_BG;
        ctx.fill();
        ctx.strokeStyle = C_GRAY;
        ctx.lineWidth   = 1;
        ctx.stroke();
    }

    // ------------------------------------------------------------------
    // Score panel
    // ------------------------------------------------------------------
    drawScorePanel(area, game) {
        const ctx = this.ctx;
        let x = area.x + 12;
        let y = area.y + 10;

        this._fillText('得分', area.x + area.w / 2, y + 2, {
            size: 20, color: C_GOLD, bold: true, center: true,
        });
        y += 36;

        for (const p of game.players) {
            const name = p.isHuman ? '你' : p.name;
            this._fillText(name, x, y, { size: 17, color: C_WHITE, bold: true });

            const scCol = p.trickScore >= 180 ? '#50dc50' : '#dc6450';
            this._fillText(`${p.trickScore}分`, area.x + area.w - 70, y, {
                size: 17, color: scCol, bold: true,
            });
            y += 22;

            // Progress bar
            const barW = area.w - 24;
            this._roundRect(x, y, barW, 10, 4);
            ctx.fillStyle = C_DARK_GRAY;
            ctx.fill();

            const fill = Math.round(barW * Math.min(p.trickScore, 360) / 360);
            const barCol = p.trickScore >= 180 ? C_BTN_GREEN : C_BTN_RED;
            if (fill > 0) {
                this._roundRect(x, y, fill, 10, 4);
                ctx.fillStyle = barCol;
                ctx.fill();
            }

            // Baseline marker at 180
            const baseX = x + Math.round(barW * 180 / 360);
            ctx.beginPath();
            ctx.moveTo(baseX, y - 2);
            ctx.lineTo(baseX, y + 12);
            ctx.strokeStyle = C_HIGHLIGHT;
            ctx.lineWidth   = 2;
            ctx.stroke();

            y += 20;
        }

        y += 8;
        ctx.beginPath();
        ctx.moveTo(area.x + 5, y);
        ctx.lineTo(area.x + area.w - 5, y);
        ctx.strokeStyle = C_GRAY;
        ctx.lineWidth   = 1;
        ctx.stroke();
        y += 10;

        this._fillText('基准线: 180分', x, y, { size: 14, color: C_GRAY });
        y += 20;
        this._fillText('总分: 540分', x, y, { size: 14, color: C_GRAY });
        y += 24;

        if (game.trumpCaller >= 0) {
            const cname = game.players[game.trumpCaller].name;
            this._fillText(`叫主: ${cname}`, x, y, { size: 15, color: C_GOLD });
            y += 20;
            if (game.trumpSuit) {
                const ts = SUIT_DISPLAY_NAME[game.trumpSuit] || '';
                this._fillText(`花色: ${ts}`, x, y, { size: 15, color: C_GOLD });
            } else {
                this._fillText('常主', x, y, { size: 15, color: C_GOLD });
            }
            y += 20;
        }

        // Remaining cards
        y = area.y + area.h - 110;
        for (const p of game.players) {
            const name = p.isHuman ? '你' : p.name;
            this._fillText(`${name}: ${p.hand.length}张`, x, y, { size: 14, color: C_GRAY });
            y += 18;
        }
    }

    // ------------------------------------------------------------------
    // Message log
    // ------------------------------------------------------------------
    drawMessages(area, messages) {
        const msgs = messages.slice(-8);
        const x = area.x + 10;
        let y = area.y + area.h - 30 - msgs.length * 17;
        this._fillText('日志', x, y - 18, { size: 13, color: C_GOLD, bold: true });
        for (const msg of msgs) {
            this._fillText(msg, x, y, { size: 13, color: C_WHITE });
            y += 17;
        }
    }

    // ------------------------------------------------------------------
    // Game end overlay
    // ------------------------------------------------------------------
    drawGameEnd(game) {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;

        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.67)';
        ctx.fillRect(0, 0, W, H);

        const bw = Math.min(660, W * 0.7);
        const bh = Math.min(420, H * 0.55);
        const bx = (W - bw) / 2;
        const by = (H - bh) / 2;

        this._roundRect(bx, by, bw, bh, 18);
        ctx.fillStyle = C_PANEL_BG;
        ctx.fill();
        ctx.strokeStyle = C_GOLD;
        ctx.lineWidth   = 3;
        ctx.stroke();

        const cx = bx + bw / 2;
        this._fillText('本局结束', cx, by + 24, {
            size: 34, color: C_GOLD, bold: true, center: true,
        });

        const deltas = game.calculateFinalScores();
        let y = by + 90;
        for (let i = 0; i < game.players.length; i++) {
            const p     = game.players[i];
            const delta = deltas[i];
            const name  = p.isHuman ? '你' : p.name;
            const col   = delta >= 0 ? '#50dc50' : '#e65050';
            const sign  = delta >= 0 ? '+' : '';
            this._fillText(`${name}  ${p.trickScore}分  (${sign}${delta}分)`, cx, y, {
                size: 26, color: col, bold: true, center: true,
            });
            y += 58;
        }

        // Winner
        let wi = 0;
        for (let i = 1; i < 3; i++) {
            if (game.players[i].trickScore > game.players[wi].trickScore) wi = i;
        }
        const wname = game.players[wi].isHuman ? '你' : game.players[wi].name;
        this._fillText(`本局赢家: ${wname}!`, cx, y + 10, {
            size: 28, color: C_GOLD, bold: true, center: true,
        });

        // Restart button
        const rbw = Math.min(220, bw * 0.4);
        const rbh = 54;
        const rbx = cx - rbw / 2;
        const rby = by + bh - rbh - 20;
        this._restartBtnRect = this.drawButton('再来一局', rbx, rby, rbw, rbh, C_BTN_GREEN, true);
    }

    // ------------------------------------------------------------------
    // Card tracker popup
    // ------------------------------------------------------------------
    _drawCardTracker() {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;

        // Overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, W, H);

        const pw = Math.min(860, W * 0.9);
        const ph = Math.min(380, H * 0.55);
        const bx = (W - pw) / 2;
        const by = 80;

        this._roundRect(bx, by, pw, ph, 14);
        ctx.fillStyle = '#142846';
        ctx.fill();
        ctx.strokeStyle = C_GOLD;
        ctx.lineWidth   = 2;
        ctx.stroke();

        const cxBox = bx + pw / 2;
        this._fillText('记牌器', cxBox, by + 16, { size: 22, color: C_GOLD, bold: true, center: true });
        this._fillText('点击任意处关闭', bx + pw - 120, by + 8, { size: 12, color: C_GRAY });

        // Count played cards
        const playedCnt = {};
        for (const card of this.playedCards) {
            const key = `${card.suit}_${card.rank}`;
            playedCnt[key] = (playedCnt[key] || 0) + 1;
        }

        const TRACK_RANKS = ['A', 'K', 'Q', 'J', '5'];
        const TOTAL_PER   = 4;

        // Column headers
        const colLabels = ['花色', 'A', 'K', 'Q', 'J', '5'];
        const colXs     = colLabels.map((_, i) => bx + 18 + i * Math.round(pw / 7));
        const headerY   = by + 52;

        for (let i = 0; i < colLabels.length; i++) {
            this._fillText(colLabels[i], colXs[i], headerY, { size: 15, color: C_GOLD, bold: true });
        }
        ctx.beginPath();
        ctx.moveTo(bx + 10, headerY + 22);
        ctx.lineTo(bx + pw - 10, headerY + 22);
        ctx.strokeStyle = C_GRAY;
        ctx.lineWidth   = 1;
        ctx.stroke();

        // Suit rows
        const suitList = [SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS];
        const suitCnMap = { spades: '黑桃', hearts: '红心', clubs: '梅花', diamonds: '方块' };
        let rowY = headerY + 30;
        const trump = this.game.trumpSuit;

        for (const suit of suitList) {
            const isTs = suit === trump;
            const symCol = isTs ? '#ffd200' : (SUIT_COLOR_MAP[suit] || C_BLACK);
            const suitCn = suitCnMap[suit] + (isTs ? ' ★' : '');

            this._fillText(`${SUIT_SYMBOL[suit]} ${suitCn}`, colXs[0], rowY, {
                size: 14, color: symCol, bold: isTs,
            });

            for (let ci = 0; ci < TRACK_RANKS.length; ci++) {
                const rank   = TRACK_RANKS[ci];
                const played = playedCnt[`${suit}_${rank}`] || 0;
                const remain = TOTAL_PER - played;
                let col, txt;
                if (remain === 0) {
                    col = '#464646'; txt = '─';
                } else if (played > 0) {
                    col = '#e6d250'; txt = `剩${remain}`;
                } else {
                    col = C_WHITE; txt = String(TOTAL_PER);
                }
                this._fillText(txt, colXs[ci + 1], rowY, { size: 15, color: col, bold: remain > 0 });
            }
            rowY += 30;
        }

        // Separator
        ctx.beginPath();
        ctx.moveTo(bx + 10, rowY + 2);
        ctx.lineTo(bx + pw - 10, rowY + 2);
        ctx.strokeStyle = C_GRAY;
        ctx.lineWidth   = 1;
        ctx.stroke();
        rowY += 12;

        // Trump group row
        this._fillText('主牌组', bx + 18, rowY, { size: 14, color: C_GOLD, bold: true });
        const trumpGroups = [
            ['10', 16, '10×16'], ['2', 16, '2×16'],
            ['small_joker', 4, '小王×4'], ['big_joker', 4, '大王×4'],
            ['character', 4, '字牌×4'], ['3', 2, '3×2'],
        ];
        let tx = bx + 80;
        for (const [rank, total, label] of trumpGroups) {
            let played = 0;
            if (rank === '10' || rank === '2') {
                for (const s of suitList) played += (playedCnt[`${s}_${rank}`] || 0);
            } else if (rank === '3') {
                played = playedCnt[`${SUIT_SPADES}_${rank}`] || 0;
            } else {
                played = playedCnt[`${SUIT_SPECIAL}_${rank}`] || 0;
            }
            const remain = total - played;
            let col;
            if (remain === 0)       col = '#464646';
            else if (played > 0)    col = '#e6d250';
            else                    col = '#b4dcff';

            let cell;
            if (remain === 0)       cell = label + '✓';
            else if (played > 0)    cell = `${label}→剩${remain}`;
            else                    cell = label;

            // Measure text width for wrapping
            ctx.font = `bold 13px ${FONT_STACK}`;
            const tw = ctx.measureText(cell).width;
            if (tx + tw > bx + pw - 10) {
                tx = bx + 80;
                rowY += 22;
            }
            this._fillText(cell, tx, rowY, { size: 13, color: col, bold: true });
            tx += tw + 16;
        }

        // Legend
        const legendY = by + ph - 30;
        const legends = [
            ['#464646', '─全出'],
            ['#e6d250', '黄=部分剩余'],
            [C_WHITE, '白=未出任何'],
        ];
        let lx = bx + 20;
        for (const [c, t] of legends) {
            this._fillText(t, lx, legendY, { size: 12, color: c });
            ctx.font = `12px ${FONT_STACK}`;
            lx += ctx.measureText(t).width + 20;
        }
    }

    // ------------------------------------------------------------------
    // Main render
    // ------------------------------------------------------------------
    render() {
        const ctx    = this.ctx;
        const layout = this._layout();

        // Clear background
        ctx.fillStyle = C_BG;
        ctx.fillRect(0, 0, layout.W, layout.H);

        // Draw panels
        for (const area of [layout.top, layout.left, layout.center, layout.right, layout.bottom]) {
            this.drawPanel(area);
        }

        // Draw game elements
        this._drawPlayers(layout, this.game);
        this._drawTrickArea(layout.center, this.game);
        this.drawScorePanel(layout.right, this.game);
        this.drawMessages(layout.center, this.messageLog);
        this._drawButtons(layout, this.game);

        // Game end overlay
        if (this.game.phase === Phase.GAME_END) {
            this.drawGameEnd(this.game);
        }

        // Card tracker popup (topmost)
        if (this.showTracker) {
            this._drawCardTracker();
        }
    }

    // ------------------------------------------------------------------
    // Draw all 3 players' hands
    // ------------------------------------------------------------------
    _drawPlayers(layout, game) {
        const { top, left, bottom, right } = layout;
        const cardW = layout.cardW;
        const cardH = layout.cardH;

        // === Top: AI2 (face-down horizontal) ===
        const p2 = game.players[2];
        this._fillText(`${p2.name}  [${p2.hand.length}张]`, top.x + 10, top.y + 4, {
            size: 17, color: C_WHITE, bold: true,
        });
        if (p2.hand.length > 0) {
            this.drawHandHorizontal(p2.hand, top.x, top.y + 26, top.w, {
                faceUp: false,
                cardH: Math.round(cardH * 0.65),
            });
        }

        // === Left: AI0 (face-down vertical) ===
        const p0 = game.players[0];
        this._fillText(`${p0.name}  [${p0.hand.length}张]`, left.x + 5, left.y + 5, {
            size: 15, color: C_WHITE, bold: true,
        });
        if (p0.hand.length > 0) {
            this.drawHandVertical(p0.hand, left.x + 8, left.y + 30, left.h - 40);
        }

        // === Bottom: Human player (face-up) ===
        const p1    = game.players[1];
        const myTurn = game.phase === Phase.PLAY && game.whoLeads() === 1 && !this.showingTrickResult;

        const revealed  = this._dealRevealedCount();
        const isDealing = game.phase === Phase.CALL_TRUMP && revealed < this.DEAL_TOTAL;
        let label;
        if (isDealing) {
            label = `你 — 正在摸牌... (${revealed}/${this.DEAL_TOTAL})`;
        } else {
            label = '你' + (myTurn ? ' 《轮到你出牌》' : '');
        }
        this._fillText(label, bottom.x + 10, bottom.y + 4, {
            size: 18, color: C_HIGHLIGHT, bold: true,
        });

        // Callable indices (call-trump phase)
        let callableIdx = [];
        if (game.phase === Phase.CALL_TRUMP) {
            callableIdx = p1.hand
                .map((c, i) => canCallTrump([c]) ? i : -1)
                .filter(i => i >= 0);
        }

        const handAreaW = bottom.w - right.w - layout.pad;

        // Deal animation: first `revealed` cards face-up, rest face-down
        if (isDealing) {
            const n = p1.hand.length;
            if (n === 0) { this.humanHandRects = []; return; }
            const margin = 5;
            const totalNatural = n * cardW + (n - 1) * margin;
            let step;
            if (totalNatural <= handAreaW) {
                step = cardW + margin;
            } else {
                step = Math.max(Math.round(cardW * 0.26),
                    Math.round((handAreaW - cardW) / Math.max(n - 1, 1)));
            }
            const actualW = cardW + (n - 1) * step;
            const startX  = bottom.x + Math.round((handAreaW - actualW) / 2);

            this.humanHandRects = [];
            const selOffset = Math.round(16 * cardH / 100);
            for (let i = 0; i < n; i++) {
                const fu = i < revealed;
                const isCallable = fu && callableIdx.includes(i);
                const isSel = this.selectedIndices.includes(i);
                const offY  = isSel ? -selOffset : 0;
                const r = this.drawCard(
                    p1.hand[i],
                    startX + i * step,
                    bottom.y + 32 + offY,
                    cardW, cardH,
                    fu, isSel, isCallable
                );
                this.humanHandRects.push(r);
            }
        } else {
            this.humanHandRects = this.drawHandHorizontal(
                p1.hand,
                bottom.x, bottom.y + 32,
                handAreaW,
                {
                    faceUp: true,
                    selectedIndices: this.selectedIndices,
                    callableIndices: game.phase === Phase.CALL_TRUMP ? callableIdx : null,
                    cardH,
                }
            );
        }
    }

    // ------------------------------------------------------------------
    // Trick area (center)
    // ------------------------------------------------------------------
    _drawTrickArea(area, game) {
        const cx = area.x + area.w / 2;
        const cy = area.y + area.h / 2;
        const layout = this._layout();
        const cardW = layout.cardW;
        const cardH = layout.cardH;

        // Title
        this._fillText('当前一轮', area.x + 12, area.y + 8, {
            size: 16, color: C_GOLD, bold: true,
        });

        if (game.trumpSuit) {
            const ts = SUIT_DISPLAY_NAME[game.trumpSuit] || '';
            this._fillText(`活主: ${ts}`, area.x + 12, area.y + 30, {
                size: 15, color: C_GOLD,
            });
        } else if (game.callTrumpDone) {
            this._fillText('常主模式', area.x + 12, area.y + 30, {
                size: 15, color: C_GOLD,
            });
        } else {
            this._fillText('叫主阶段...', area.x + 12, area.y + 30, {
                size: 15, color: C_HIGHLIGHT,
            });
        }

        // Played cards positions (relative to center)
        const offX = area.w * 0.22;
        const offY = area.h * 0.18;
        const posMap = {
            0: [cx - offX - cardW, cy - offY],    // Left AI
            1: [cx - cardW / 2,    cy + offY],     // Human (bottom center)
            2: [cx + offX,         cy - offY],     // Top AI (right of center)
        };

        for (const entry of game.currentTrick) {
            const [px, py] = posMap[entry.playerIdx];
            const pname = game.players[entry.playerIdx].name;
            this._fillText(pname, px, py - 20, { size: 14, color: C_GRAY });
            const allCards = entry.allCards();
            for (let j = 0; j < allCards.length; j++) {
                this.drawCard(allCards[j], px + j * (cardW + 3), py, cardW, cardH);
            }
        }

        // Call-trump phase hints
        if (game.phase === Phase.CALL_TRUMP) {
            const revealed = this._dealRevealedCount();
            if (revealed < this.DEAL_TOTAL) {
                // Deal animation progress
                const pct = Math.round(revealed / this.DEAL_TOTAL * 100);
                this._fillText(`正在发牌... ${pct}%`, cx, cy - 20, {
                    size: 20, color: C_HIGHLIGHT, center: true,
                });
                const barW = Math.min(300, area.w * 0.5);
                this._roundRect(cx - barW / 2, cy + 10, barW, 14, 6);
                this.ctx.fillStyle = C_DARK_GRAY;
                this.ctx.fill();
                const fillW = Math.round(barW * pct / 100);
                if (fillW > 0) {
                    this._roundRect(cx - barW / 2, cy + 10, fillW, 14, 6);
                    this.ctx.fillStyle = C_BTN_GREEN;
                    this.ctx.fill();
                }
            } else if (this.callPhase === 'countering') {
                // Counter-trump round: show current call + who is deciding
                const cname   = game.players[game.trumpCaller].name;
                const callStr = game.trumpCallCards.map(c => c.displayName()).join(' ');
                this._fillText(`当前叫主: ${cname}`, cx, cy - 40, {
                    size: 16, color: C_HIGHLIGHT, center: true,
                });
                this._fillText(callStr, cx, cy - 18, {
                    size: 16, color: C_GOLD, center: true,
                });
                const who = this.callCurrent;
                if (who === 1) {
                    this._fillText('轮到你决定是否反主', cx, cy + 10, {
                        size: 16, color: '#ffc850', center: true,
                    });
                    this._fillText('↓ 选牌反主，或点 Pass', cx, cy + 32, {
                        size: 14, color: '#ffc850', center: true,
                    });
                } else if (who >= 0) {
                    const whoName = game.players[who].name;
                    this._fillText(`${whoName} 正在决定是否反主...`, cx, cy + 10, {
                        size: 16, color: C_GRAY, center: true,
                    });
                }
            } else if (this.callPhase === 'calling') {
                // Initial calling round
                const who = this.callCurrent;
                if (game.trumpCaller !== -1) {
                    const cname   = game.players[game.trumpCaller].name;
                    const callStr = game.trumpCallCards.map(c => c.displayName()).join(' ');
                    this._fillText(`当前叫主: ${cname}`, cx, cy - 30, {
                        size: 16, color: C_HIGHLIGHT, center: true,
                    });
                    this._fillText(callStr, cx, cy - 10, {
                        size: 16, color: C_GOLD, center: true,
                    });
                } else if (who === 1) {
                    this._fillText('轮到你决定是否叫主', cx, cy - 10, {
                        size: 16, color: '#ffc850', center: true,
                    });
                    this._fillText('↓ 选牌叫主，或点 Pass', cx, cy + 12, {
                        size: 14, color: '#ffc850', center: true,
                    });
                } else if (who >= 0) {
                    const whoName = game.players[who].name;
                    this._fillText(`${whoName} 正在决定是否叫主...`, cx, cy - 10, {
                        size: 16, color: C_GRAY, center: true,
                    });
                }
            } else {
                this._fillText('等待叫主...', cx, cy - 10, {
                    size: 16, color: C_GRAY, center: true,
                });
            }
        }
    }

    // ------------------------------------------------------------------
    // Buttons
    // ------------------------------------------------------------------
    _drawButtons(layout, game) {
        this._buttonRects = {};
        const { bottom, right } = layout;
        const btnH = Math.round(layout.cardH * 0.4);
        const btnW = Math.round(layout.cardW * 2.1);
        const btnY = bottom.y - btnH - 10;

        const handAreaW = bottom.w - right.w - layout.pad;
        const centerX   = bottom.x + handAreaW / 2;

        if (game.phase === Phase.CALL_TRUMP) {
            const humanTurn = this.callWaitHuman && this.callCurrent === 1;

            if (humanTurn) {
                // Check if selected cards form valid call/counter
                const sel = this.selectedIndices
                    .filter(i => i < game.players[1].hand.length)
                    .map(i => game.players[1].hand[i]);
                const cur = game.trumpCaller !== -1 ? game.trumpCallCards : null;
                const callEnabled = cur ? canCounterTrump(sel, cur) : canCallTrump(sel);

                const btnLabel = this.callPhase === 'countering' ? '反主' : '叫主';
                const gap    = 16;
                const totalW = btnW * 2 + gap;
                const sx     = centerX - totalW / 2;

                this._buttonRects.call = this.drawButton(btnLabel, sx, btnY, btnW, btnH, C_BTN_GREEN, callEnabled);
                this._buttonRects.pass = this.drawButton('Pass', sx + btnW + gap, btnY, btnW, btnH, C_BTN_GRAY, true);
            }

        } else if (game.phase === Phase.PLAY) {
            const leader = game.whoLeads();
            if (leader === 1 && !this.showingTrickResult) {
                const enabled = this.selectedIndices.length > 0;
                this._buttonRects.play = this.drawButton(
                    '出牌', centerX - btnW / 2, btnY, btnW, btnH, C_BTN_GREEN, enabled
                );
            }
        }

        // Tracker button (always visible, in right panel bottom)
        const tbW = Math.round(right.w * 0.55);
        const tbH = 36;
        this._buttonRects.tracker = this.drawButton(
            '记牌器',
            right.x + 10,
            right.y + right.h - tbH - 8,
            tbW, tbH,
            '#325082', true
        );
    }

    // ------------------------------------------------------------------
    // Deal animation helper
    // ------------------------------------------------------------------
    _dealRevealedCount() {
        const elapsed = Date.now() - this.dealStartTime;
        if (elapsed >= this.DEAL_DURATION) return this.DEAL_TOTAL;
        return Math.max(1, Math.floor(elapsed / this.DEAL_DURATION * this.DEAL_TOTAL));
    }

    // ------------------------------------------------------------------
    // Sort human hand
    // ------------------------------------------------------------------
    _sortHumanHand() {
        const hand  = this.game.players[1].hand;
        const trump = this.game.trumpSuit;
        const suitOrder = {
            [SUIT_SPADES]: 1, [SUIT_HEARTS]: 2,
            [SUIT_CLUBS]: 3,  [SUIT_DIAMONDS]: 4,
        };

        hand.sort((a, b) => {
            const aIsTrump = isTrump(a, trump);
            const bIsTrump = isTrump(b, trump);
            if (aIsTrump && !bIsTrump) return -1;
            if (!aIsTrump && bIsTrump) return 1;
            if (aIsTrump && bIsTrump) {
                return cardPower(b, trump) - cardPower(a, trump);
            }
            const aSuit = suitOrder[a.suit] ?? 5;
            const bSuit = suitOrder[b.suit] ?? 5;
            if (aSuit !== bSuit) return aSuit - bSuit;
            return cardPower(b, trump) - cardPower(a, trump);
        });
    }

    // ------------------------------------------------------------------
    // Add message
    // ------------------------------------------------------------------
    addMessage(msg) {
        this.messageLog.push(msg);
        if (this.messageLog.length > 8) this.messageLog.shift();
    }

    // ------------------------------------------------------------------
    // Get button rects for input.js
    // ------------------------------------------------------------------
    getButtonRects() {
        return this._buttonRects;
    }
}
