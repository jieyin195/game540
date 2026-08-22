/**
 * audit-voluntary-score.mjs — 独立于 validateFollow 之外，用暴力方式复查每一次
 * "非压牌"的跟牌是否真的没有更便宜（分值更小）的替代方案。
 *
 * 动机：validateFollow 通过 ≠ 一定没违反"不能主动垫分牌"/"分小牌小顺序"，
 * 因为如果规则引擎本身的判定逻辑有盲点（比如某个分支漏掉了本该考虑的候选牌），
 * 它会一样放行。这个脚本不依赖 validateFollow 的判断，而是拿到玩家出牌前的完整
 * 手牌快照，自己算一遍"这次跟牌，理论上能凑出的最小总分值是多少"，跟实际打出
 * 的总分值比较，找出实际分值明显更高的案例。
 */
import { GameState, Phase } from '../js/game.js';
import { canCounterTrump } from '../js/rules.js';
import { aiDecideCallTrump, aiLead, aiFollow } from '../js/ai.js';
import { submitAiPlay } from '../js/input.js';
import { doesBeat, getFollowSuit, filterHandBySuit } from '../js/rules.js';

function runCallTrumpPhase(game) {
    function callRound(order, isCountering) {
        for (const idx of order) {
            const player = game.players[idx];
            const currentCall = game.trumpCaller !== -1 ? game.trumpCallCards : null;
            const call = aiDecideCallTrump(player.hand, currentCall);
            if (!isCountering) {
                if (call && game.processCallTrump(idx, call)) { callRound([1, 2].map(o => (idx + o) % 3), true); return true; }
            } else {
                if (call && canCounterTrump(call, currentCall) && game.processCallTrump(idx, call)) { callRound([1, 2].map(o => (idx + o) % 3), true); return true; }
            }
        }
        return false;
    }
    callRound([0, 1, 2].map(o => (game.callTrumpIdx + o) % 3), false);
    game.finishCallTrump();
}

// 手牌里挑 n 张、总分值最小的组合的分值（贪心：只要不要求维持结构，任意 n 张
// 分值总和最小就是"分值最小的每一张单独排序取前 n 张"——因为分值是可加的，
// 不存在"这张牌分值小但必须跟别的牌绑在一起"的情况，除非涉及跟牌张数/花色
// 结构限制。这里只用来估算"理论下限"，作为跟实际打出总分值比较的基准。
function cheapestPossibleScore(hand, n) {
    const sorted = [...hand].sort((a, b) => a.scoreValue() - b.scoreValue());
    return sorted.slice(0, n).reduce((s, c) => s + c.scoreValue(), 0);
}

function totalScore(cards) {
    return cards.reduce((s, c) => s + c.scoreValue(), 0);
}

let found = 0;
const NUM_GAMES = 3000;

for (let g = 0; g < NUM_GAMES; g++) {
    const game = new GameState();
    runCallTrumpPhase(game);

    let plays = 0;
    while (game.phase !== Phase.GAME_END && plays < 1000) {
        plays++;
        const leader = game.whoLeads();
        if (leader === -1) break;

        const hand = game.players[leader].hand;
        const trumpSuit = game.trumpSuit;
        const ledCards = game.getLedCards();
        const anyUnplayed = game.players.some((p, i) => i !== leader && !p.hasPlayed);

        let cards;
        if (!ledCards) {
            cards = aiLead(hand, trumpSuit, anyUnplayed, leader === game.trumpCaller ? game.mustPlayCards : null);
        } else {
            const currentBest = game.getCurrentBest() ?? [];
            const trickHasScore = game.trickHasScore();
            cards = aiFollow(hand, ledCards, currentBest, trumpSuit, trickHasScore);
        }

        const needed = ledCards ? game.trickCardCount : (cards ? cards.length : 1);
        if (ledCards && cards.length !== needed) {
            if (cards.length > needed) cards = cards.slice(0, needed);
            else { const extra = hand.filter(c => !cards.includes(c)); cards = [...cards, ...extra].slice(0, needed); }
        }
        cards = cards.filter(c => hand.includes(c));
        if (cards.length === 0) cards = hand.slice(0, needed);

        // 审计：只关心"跟牌方完全没有领出花色的牌、纯自由垫牌"这种没有任何
        // 跟花色/牌型结构限制的情况——这时候"手牌里分值最小的N张"才是一个
        // 真正可比较、可达成的替代方案，不会有假阳性。
        if (ledCards) {
            const ledSuit = getFollowSuit(ledCards, trumpSuit);
            const handInSuit = filterHandBySuit(hand, ledSuit, trumpSuit);
            const currentBest = game.getCurrentBest() ?? [];
            const isBeating = currentBest.length > 0 ? doesBeat(cards, currentBest, trumpSuit) : false;
            if (!isBeating && handInSuit.length === 0) {
                const handSnapshot = [...hand];
                const played = totalScore(cards);
                const cheapest = cheapestPossibleScore(handSnapshot, cards.length);
                if (played > cheapest) {
                    found++;
                    console.log(`=== 案例 ${found}：第${g}局 第${plays}次出牌 ===`);
                    console.log('trumpSuit:', trumpSuit);
                    console.log('ledCards:', ledCards.map(c => c.displayName()).join(' '));
                    console.log('实际打出:', cards.map(c => c.displayName()).join(' '), ' 总分值:', played);
                    console.log('手牌里分值最小的', cards.length, '张理论总分值:', cheapest);
                    console.log('打出前完整手牌:', handSnapshot.map(c => c.displayName()).join(' '));
                    if (found >= 15) { console.log('\n案例已经够多，提前结束。'); process.exit(0); }
                }
            }
        }

        const [ok] = submitAiPlay(game, leader, cards, { ledCards, hand, trumpSuit, needed, anyUnplayed });
        if (!ok) break;

        game.checkAndProcessBombPad();
        if (game.isTrickComplete()) {
            game.resolveTrick();
            game.startNextTrick();
        }
    }
}

console.log(`\n共扫描 ${NUM_GAMES} 局，找到 ${found} 例"打出总分值 > 手牌里能凑到的理论最小总分值"的案例。`);
