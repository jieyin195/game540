import assert from 'node:assert/strict';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';
import { validateFollow } from '../js/rules.js';
import { aiFollow } from '../js/ai.js';

function S(rank) { return new Card(SUIT_SPADES, rank); }
function H(rank) { return new Card(SUIT_HEARTS, rank); }
function C(rank) { return new Card(SUIT_CLUBS, rank); }
function D(rank) { return new Card(SUIT_DIAMONDS, rank); }

// 场景1：单张——领出黑桃5（副牌，常主模式），跟牌人手里正好1张黑桃A，必须出A
{
    const trumpSuit = null;
    const ledCards = [S('5')];
    const hand = [S('A'), H('K'), C('Q')];
    const [okAce, errAce] = validateFollow([S('A')], ledCards, hand, trumpSuit, false, ledCards, 1);
    assert.equal(okAce, true, `出黑桃A应该合法，实际错误: ${errAce}`);

    const [okOther, errOther] = validateFollow([S('K')], ledCards, hand, trumpSuit, false, ledCards, 1);
    // hand 里没有黑桃K，这里改成用手里有的别的黑桃牌验证"有A不出A"会被拒绝
    const hand2 = [S('A'), S('K'), C('Q')];
    const [okSkip, errSkip] = validateFollow([S('K')], ledCards, hand2, trumpSuit, false, ledCards, 1);
    assert.equal(okSkip, false, '手里有黑桃A却不出，应该被拒绝');
    assert.equal(errSkip, '见黑桃5须出黑桃A', `错误信息不符，实际: ${errSkip}`);

    const aiChoice = aiFollow(hand2, ledCards, ledCards, trumpSuit, false);
    assert.deepEqual(aiChoice, [S('A')], `AI应该主动出黑桃A，实际: ${aiChoice.map(c => c.displayName()).join(' ')}`);
}

// 场景2：对子——领出方块5方块5，跟牌人手里正好一对方块A，必须出这对A
{
    const trumpSuit = null;
    const ledCards = [D('5'), D('5')];
    const hand = [D('A'), D('A'), D('K'), D('Q')];
    const [ok, err] = validateFollow([D('K'), D('Q')], ledCards, hand, trumpSuit, false, ledCards, 2);
    assert.equal(ok, false, '手里有对方块A却不出，应该被拒绝');
    assert.equal(err, '见方块5须出方块A', `错误信息不符，实际: ${err}`);

    const aiChoice = aiFollow(hand, ledCards, ledCards, trumpSuit, false);
    assert.equal(aiChoice.length, 2);
    assert.ok(aiChoice.every(c => c.suit === SUIT_DIAMONDS && c.rank === 'A'),
        `AI应该主动出方块A对子，实际: ${aiChoice.map(c => c.displayName()).join(' ')}`);
}

// 场景3：张数不匹配——领出一对梅花5，但跟牌人只有1张梅花A（不是一对），不触发
{
    const trumpSuit = null;
    const ledCards = [C('5'), C('5')];
    const hand = [C('A'), C('J'), C('Q')];
    const [ok, err] = validateFollow([C('J'), C('Q')], ledCards, hand, trumpSuit, false, ledCards, 2);
    assert.equal(ok, true, `张数不匹配（只有1张A，领出的是对5）不应该触发这条规则，实际错误: ${err}`);
}

// 场景4：活主模式——领出的是主5（活主花色自己的5），不受这条规则约束
{
    const trumpSuit = SUIT_SPADES;
    const ledCards = [S('5')]; // 黑桃是活主花色，黑桃5是主牌，不是副牌
    const hand = [S('A'), S('K')];
    // 黑桃A在活主模式下也是主牌，规则不该管这种"主5"的情况——即使手里有黑桃A也不强制出它
    const [ok, err] = validateFollow([S('K')], ledCards, hand, trumpSuit, false, ledCards, 1);
    assert.equal(ok, true, `活主自己花色的5不受"见5须出A"约束，实际错误: ${err}`);
}

console.log('PASS: fix17-see-5-play-ace');
