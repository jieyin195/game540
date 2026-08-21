// 找一个真实触发"暴力兜底"（安全网也失败，回退到 hand.slice(0,n) 跳过校验）的
// 具体案例，打印出当时的领出牌、跟牌方手牌、aiFollow 的原始输出、安全兜底的输出，
// 定位真正的根因，而不是靠猜。
import { GameState, Phase } from '../js/game.js';
import { canCounterTrump } from '../js/rules.js';
import { aiDecideCallTrump, aiLead, aiFollow, safeFollowFallback } from '../js/ai.js';

function runCallTrumpPhase(game) {
    function callRound(order, isCountering) {
        for (const idx of order) {
            const player = game.players[idx];
            const currentCall = game.trumpCaller !== -1 ? game.trumpCallCards : null;
            const call = aiDecideCallTrump(player.hand, currentCall);
            if (!isCountering) {
                if (call && game.processCallTrump(idx, call)) {
                    callRound([1, 2].map(off => (idx + off) % 3), true);
                    return true;
                }
            } else {
                if (call && canCounterTrump(call, currentCall) && game.processCallTrump(idx, call)) {
                    callRound([1, 2].map(off => (idx + off) % 3), true);
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

let found = false;

const NUM_GAMES = 2000;
for (let g = 0; g < NUM_GAMES && !found; g++) {
    const game = new GameState();
    runCallTrumpPhase(game);

    let plays = 0;
    while (game.phase !== Phase.GAME_END && plays < 1000 && !found) {
        plays++;
        const leader = game.whoLeads();
        if (leader === -1) break;

        const hand        = game.players[leader].hand;
        const trumpSuit    = game.trumpSuit;
        const ledCards     = game.getLedCards();
        const anyUnplayed  = game.players.some((p, i) => i !== leader && !p.hasPlayed);

        let cards;
        if (!ledCards) {
            cards = aiLead(hand, trumpSuit, anyUnplayed, leader === game.trumpCaller ? game.mustPlayCards : null);
        } else {
            const currentBest   = game.getCurrentBest() ?? [];
            const trickHasScore = game.trickHasScore();
            cards = aiFollow(hand, ledCards, currentBest, trumpSuit, trickHasScore);
        }

        const needed = ledCards ? game.trickCardCount : (cards ? cards.length : 1);
        if (ledCards && cards.length !== needed) {
            if (cards.length > needed) cards = cards.slice(0, needed);
            else {
                const extra = hand.filter(c => !cards.includes(c));
                cards = [...cards, ...extra].slice(0, needed);
            }
        }
        cards = cards.filter(c => hand.includes(c));
        if (cards.length === 0) cards = hand.slice(0, needed);

        // 手动重放 submitAiPlay 的三层逻辑，捕获中间态
        if (ledCards) {
            const handSnapshot = [...hand];
            const [ok1] = game.playCards(leader, [...cards], false);
            if (!ok1) {
                // 回滚：playCards 失败不会改变状态，可以放心继续手动分析
                const fallback = safeFollowFallback(hand, ledCards, trumpSuit, needed);
                const savedTrick = game.currentTrick.length;
                const [ok2, err2] = game.playCards(leader, [...fallback], false);
                if (!ok2) {
                    found = true;
                    console.log('=== 找到暴力兜底案例 ===');
                    console.log('game编号', g, '第', plays, '次出牌');
                    console.log('trumpSuit:', trumpSuit, ' trumpCaller:', game.trumpCaller);
                    console.log('leader:', leader, ' ledCards:', ledCards.map(c => c.displayName()).join(' '));
                    console.log('currentBest (playCards 失败前的真实值):', game.getCurrentBest()?.map(c => c.displayName()).join(' '));
                    console.log('currentTrick 已出的牌:', game.currentTrick.map(e => `p${e.playerIdx}:${e.cards.map(c=>c.displayName()).join(',')}`).join(' | '));
                    console.log('trickHasScore:', game.trickHasScore());
                    console.log('leader完整手牌:', handSnapshot.map(c => c.displayName()).join(' '));
                    console.log('aiFollow原始输出:', cards.map(c => c.displayName()).join(' '));
                    console.log('safeFollowFallback输出:', fallback.map(c => c.displayName()).join(' '));
                    console.log('safeFollowFallback校验失败原因:', err2);
                } else {
                    // 兜底本身是好的，撤销这次手动 playCards 以免弄脏后续状态
                    // （因为这只是诊断脚本，找到就退出，不需要真的继续这局）
                }
            } else {
                // 校验本来就通过，继续正常流程（用手动 playCards 的结果代替 submitAiPlay）
            }
        } else {
            game.playCards(leader, [...cards], false);
        }

        const padInfo = game.checkAndProcessBombPad();
        void padInfo;

        if (game.isTrickComplete()) {
            game.resolveTrick();
            game.startNextTrick();
        }
    }
}

if (!found) console.log(`${NUM_GAMES}局内没有复现暴力兜底案例`);
