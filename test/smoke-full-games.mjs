/**
 * smoke-full-games.mjs — 无浏览器的整局自动对局压力测试。
 *
 * 不同于 fix1~fix6：那些测试针对单个函数的手工构造场景；这个脚本让三个座位
 * 全部由 AI 决策（aiDecideCallTrump / aiLead / aiFollow / submitAiPlay），
 * 直接驱动真实的 GameState 引擎跑完整局（叫主 → 出牌 → 结算 → 下一墩 →
 * 直到打完42墩），跳过 input.js 里跟 DOM/canvas/计时器耦合的那部分
 * （_advanceCallTurn 的 1.2s 延迟、_updatePlay 的 aiDelay、result 展示的
 * 1800ms 停顿），因为那些纯粹是节奏控制，不影响规则/牌型逻辑本身。
 *
 * 这不能替代浏览器里的手动冒烟测试（画面渲染、game540.html 的ES模块shell
 * 是否真的能加载、点击交互是否顺畅——这些必须要有浏览器才能验证），但可以
 * 把"整局跑下来引擎会不会抛异常/卡死/分数对不上"这一块完全自动化覆盖。
 */

import assert from 'node:assert/strict';
import { GameState, Phase } from '../js/game.js';
import { buildDeck, totalScore } from '../js/card.js';
import { canCounterTrump } from '../js/rules.js';
import { aiDecideCallTrump, aiLead, aiFollow } from '../js/ai.js';
import { submitAiPlay } from '../js/input.js';

const NUM_GAMES = 300;
const TOTAL_POINTS = totalScore(buildDeck());

// ---------------------------------------------------------------------------
// 叫主阶段：无渲染器/无计时器版本的 _advanceCallTurn 状态机
// ---------------------------------------------------------------------------

function runCallTrumpPhase(game) {
    let iterations = 0;
    const maxIterations = 50;

    function callRound(order, isCountering) {
        for (const idx of order) {
            iterations++;
            if (iterations > maxIterations) {
                throw new Error(`叫主阶段超过 ${maxIterations} 轮仍未结束，疑似死循环`);
            }
            const player = game.players[idx];
            const currentCall = game.trumpCaller !== -1 ? game.trumpCallCards : null;
            const call = aiDecideCallTrump(player.hand, currentCall);

            if (!isCountering) {
                if (call && game.processCallTrump(idx, call)) {
                    callRound(
                        [1, 2].map(off => (idx + off) % 3),
                        true,
                    );
                    return true;
                }
            } else {
                if (call && canCounterTrump(call, currentCall) && game.processCallTrump(idx, call)) {
                    callRound(
                        [1, 2].map(off => (idx + off) % 3),
                        true,
                    );
                    return true;
                }
            }
        }
        return false;
    }

    const initialOrder = [0, 1, 2].map(off => (game.callTrumpIdx + off) % 3);
    callRound(initialOrder, false);
    game.finishCallTrump();
}

// ---------------------------------------------------------------------------
// 出牌阶段：无渲染器/无计时器版本的 _updatePlay + _afterPlay
// ---------------------------------------------------------------------------

function runPlayPhase(game, stats) {
    let plays = 0;
    const maxPlays = 1000;

    while (game.phase !== Phase.GAME_END) {
        plays++;
        if (plays > maxPlays) {
            throw new Error(`出牌阶段超过 ${maxPlays} 次出牌仍未结束，疑似死循环`);
        }

        const leader = game.whoLeads();
        if (leader === -1) {
            // 理论上不会走到这里：resolveTrick 后立刻 startNextTrick，
            // 但防御性地处理，避免死循环。
            throw new Error('whoLeads() 返回 -1，但阶段仍是 PLAY（本轮未及时收尾）');
        }

        const hand        = game.players[leader].hand;
        const trumpSuit    = game.trumpSuit;
        const ledCards     = game.getLedCards();
        const anyUnplayed  = game.players.some((p, i) => i !== leader && !p.hasPlayed);

        let cards;
        if (!ledCards) {
            cards = aiLead(hand, trumpSuit, anyUnplayed,
                leader === game.trumpCaller ? game.mustPlayCards : null);
        } else {
            const currentBest   = game.getCurrentBest() ?? [];
            const trickHasScore = game.trickHasScore();
            cards = aiFollow(hand, ledCards, currentBest, trumpSuit, trickHasScore);
        }

        const needed = ledCards ? game.trickCardCount : (cards ? cards.length : 1);
        if (ledCards && cards.length !== needed) {
            if (cards.length > needed) {
                cards = cards.slice(0, needed);
            } else {
                const extra = hand.filter(c => !cards.includes(c));
                cards = [...cards, ...extra].slice(0, needed);
            }
        }
        cards = cards.filter(c => hand.includes(c));
        if (cards.length === 0) cards = hand.slice(0, needed);

        const [ok, finalCards] = submitAiPlay(game, leader, cards, {
            ledCards, hand, trumpSuit, needed, anyUnplayed,
        });

        assert.equal(ok, true,
            `submitAiPlay 未能成功出牌（leader=${leader}, trumpSuit=${trumpSuit}）—— 三层安全网理论上必定成功`);

        stats.totalPlays++;

        // 与 _afterPlay 等效的收尾处理
        const padInfo = game.checkAndProcessBombPad();
        if (padInfo && padInfo.length > 0) stats.bombPads += padInfo.length;

        if (game.isTrickComplete()) {
            const winner = game.resolveTrick();
            assert.ok(winner >= 0 && winner <= 2, `resolveTrick 返回了非法的赢家索引: ${winner}`);
            game.startNextTrick(); // 内部会在所有人手牌清空时把 phase 设为 GAME_END
        }
    }
}

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------

const stats = { totalPlays: 0, bombPads: 0, warnCalls: 0, errorCalls: 0 };
const origWarn  = console.warn;
const origError = console.error;
console.warn  = (...a) => { stats.warnCalls++;  };
console.error = (...a) => { stats.errorCalls++; };

let gamesPlayed = 0;
try {
    for (let g = 0; g < NUM_GAMES; g++) {
        const game = new GameState();
        runCallTrumpPhase(game);
        runPlayPhase(game, stats);

        assert.ok(game.players.every(p => p.hand.length === 0),
            `第${g}局结束后仍有玩家手牌未出完`);

        const scoreSum = game.players.reduce((s, p) => s + p.trickScore, 0);
        assert.equal(scoreSum, TOTAL_POINTS,
            `第${g}局总分 ${scoreSum} 与牌堆总分 ${TOTAL_POINTS} 不符`);

        gamesPlayed++;
    }
} finally {
    console.warn  = origWarn;
    console.error = origError;
}

assert.equal(gamesPlayed, NUM_GAMES);

console.log(`PASS: smoke-full-games (${NUM_GAMES} 局全部正常结束，总出牌 ${stats.totalPlays} 次，` +
    `炸弹垫牌 ${stats.bombPads} 次，安全兜底触发 ${stats.warnCalls} 次，暴力兜底触发 ${stats.errorCalls} 次)`);
