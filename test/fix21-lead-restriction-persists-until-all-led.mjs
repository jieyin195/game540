import assert from 'node:assert/strict';
import { GameState } from '../js/game.js';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';

function S(rank) { return new Card(SUIT_SPADES, rank); }
function H(rank) { return new Card(SUIT_HEARTS, rank); }
function C(rank) { return new Card(SUIT_CLUBS, rank); }
function D(rank) { return new Card(SUIT_DIAMONDS, rank); }

// 用户实测复现：规则三"还有玩家没出过牌"指的是"还没当过领出者"，不是
// "还没打出过任意一张牌（含跟牌）"。如果第1墩的赢家接着又赢下第2墩，
// 另外两个玩家虽然在第1墩里都跟过牌，但都还没当过领出者，这条"必须出
// 对子/最大单张"的限制到第2墩依然要生效，不能因为大家都跟过牌了就解除。
{
    const game = new GameState();
    game.trumpSuit = null;
    game.trumpCaller = -1;
    game.mustPlayCards = [];

    // 玩家0的3张牌全用同一花色（梅花），避免不同花色之间 cardPower 只是
    // 实现内部用来给"无主时随便比个大小"的任意排序、不代表真实大小关系，
    // 导致"最大单张"断言不稳。梅花Q > 梅花J > 梅花5。
    // 注意：playCards 按引用比较手牌，必须用手牌数组里的同一个 Card 对象，
    // 且 removeCards 会 splice 手牌数组，之后不能再用旧的下标取牌。
    const c5 = C('5'), cQ = C('Q'), cJ = C('J');
    const hJ = H('J'), sK = S('K'), hK = H('K');
    const dJ = D('J'), sQ = S('Q'), dK = D('K');
    game.players[0].hand = [c5, cQ, cJ];
    game.players[1].hand = [hJ, sK, hK];
    game.players[2].hand = [dJ, sQ, dK];

    // 第1墩：玩家0领出梅花Q（手里最大的单张，无对子），玩家1、玩家2手里都
    // 没有梅花，只能垫别的花色（无主时跟不上花色也压不过，玩家0必赢）；
    // 垫牌选各自手里不算分的J，避免触发"不能主动垫分牌"。
    const [ok1] = game.playCards(0, [cQ]);
    assert.equal(ok1, true, '玩家0第1墩领出最大单张应该合法');
    const [ok2] = game.playCards(1, [hJ]);
    assert.equal(ok2, true, '玩家1第1墩跟牌应该合法');
    const [ok3] = game.playCards(2, [dJ]);
    assert.equal(ok3, true, '玩家2第1墩跟牌应该合法');

    assert.equal(game.players[0].hasPlayed, true, '玩家0领出过，应该算当过领出者');
    assert.equal(game.players[1].hasPlayed, false, '玩家1只跟过牌，不算当过领出者');
    assert.equal(game.players[2].hasPlayed, false, '玩家2只跟过牌，不算当过领出者');

    game.checkAndProcessBombPad();
    assert.equal(game.isTrickComplete(), true);
    const winner = game.resolveTrick();
    assert.equal(winner, 0, '玩家0领出的梅花Q没人能跟/能压，应该赢下第1墩');
    game.startNextTrick();
    assert.equal(game.forcedLeadInfo, null,
        `不该触发"最大单张打不过别人"的随机代打（没人能打过梅花J），实际: ${JSON.stringify(game.forcedLeadInfo)}`);

    // 第2墩：玩家0（第1墩赢家）继续领出，此时玩家1、玩家2依然一次领出者都没当过，
    // "必须出对子/最大单张"这条限制应该继续生效——玩家0手里没有对子，
    // 必须出最大单张（梅花J比梅花5大），不能随便出一张小的单张。
    const [okSmall, errSmall] = game.playCards(0, [c5]);
    assert.equal(okSmall, false, '还有玩家没当过领出者时，不能出非最大的单张，应该被拒绝');
    assert.ok(errSmall.includes('最大单张'), `错误信息应提示必须出最大单张，实际: ${errSmall}`);

    const [okBig] = game.playCards(0, [cJ]); // 梅花J，玩家0手里剩下最大的
    assert.equal(okBig, true, `出手里最大的单张应该合法，实际错误: ${okBig ? '' : '见上'}`);
}

console.log('PASS: fix21-lead-restriction-persists-until-all-led');
