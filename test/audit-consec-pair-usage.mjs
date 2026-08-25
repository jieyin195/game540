/**
 * audit-consec-pair-usage.mjs — 扫描整局模拟，专门检查跟连对/连三同张时，
 * AI 实际用的"整组对子/三同张"数量，是不是比手里其实能凑到的更少
 * （比如手里有2组可用的对子，却只用了1组，其余拆成单张）。
 */
import { GameState, Phase } from '../js/game.js';
import { canCounterTrump } from '../js/rules.js';
import { aiDecideCallTrump, aiLead, aiFollow } from '../js/ai.js';
import { submitAiPlay } from '../js/input.js';
import { getPlayType, PlayType, getFollowSuit, filterHandBySuit, getPairs, getTriples, doesBeat } from '../js/rules.js';

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

function countGroupsUsed(cards, trumpSuit) {
    const byKey = new Map();
    for (const c of cards) {
        const key = `${c.suit}_${c.rank}`;
        byKey.set(key, (byKey.get(key) ?? 0) + 1);
    }
    let pairs = 0;
    for (const cnt of byKey.values()) if (cnt >= 2) pairs++;
    return pairs;
}

let found = 0;
const NUM_GAMES = 800;

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
            const ledType = getPlayType(ledCards, trumpSuit);

            cards = aiFollow(hand, ledCards, currentBest, trumpSuit, trickHasScore, game.trickCardCount);

            // 只审计连对/连三同张的跟牌
            if ((ledType === PlayType.CONSEC_PAIRS || ledType === PlayType.CONSEC_TRIPLES) &&
                game.trickCardCount === ledCards.length) {
                const isBeating = currentBest.length > 0 ? doesBeat(cards, currentBest, trumpSuit) : false;
                if (!isBeating) {
                    const handSnapshot = [...hand];
                    const usedPairs = countGroupsUsed(cards, trumpSuit);
                    // 手里实际能凑到多少组整对（不要求连续，只看有没有同名同花色的组）
                    const maxPossiblePairs = countGroupsUsed(handSnapshot, trumpSuit);
                    const groupSize = ledType === PlayType.CONSEC_TRIPLES ? 3 : 2;
                    const windowCount = ledCards.length / groupSize;
                    const shortfall = Math.min(maxPossiblePairs, windowCount) - usedPairs;
                    if (shortfall > 0) {
                        found++;
                        console.log(`=== 案例 ${found}：第${g}局 第${plays}次出牌 ===`);
                        console.log('trumpSuit:', trumpSuit);
                        console.log('ledCards:', ledCards.map(c => c.displayName()).join(' '), ' (', ledType, ')');
                        console.log('实际打出:', cards.map(c => c.displayName()).join(' '), ' 用了', usedPairs, '组整对');
                        console.log('手里最多能凑', Math.min(maxPossiblePairs, windowCount), '组');
                        console.log('打出前完整手牌:', handSnapshot.map(c => c.displayName()).join(' '));
                        if (found >= 10) { console.log('\n案例已经够多，提前结束。'); process.exit(0); }
                    }
                }
            }
        }

        const needed = ledCards ? game.trickCardCount : (cards ? cards.length : 1);
        if (ledCards && cards.length !== needed) {
            if (cards.length > needed) cards = cards.slice(0, needed);
            else { const extra = hand.filter(c => !cards.includes(c)); cards = [...cards, ...extra].slice(0, needed); }
        }
        cards = cards.filter(c => hand.includes(c));
        if (cards.length === 0) cards = hand.slice(0, needed);

        const [ok] = submitAiPlay(game, leader, cards, { ledCards, hand, trumpSuit, needed, anyUnplayed });
        if (!ok) break;

        game.checkAndProcessBombPad();
        if (game.isTrickComplete()) {
            game.resolveTrick();
            game.startNextTrick();
        }
    }
}

console.log(`\n共扫描 ${NUM_GAMES} 局，找到 ${found} 例"跟连对/连三同张时用的整对数量比手里能凑的少"的案例。`);
