import assert from 'node:assert/strict';
import { Card, SUIT_SPADES, SUIT_HEARTS, SUIT_CLUBS, SUIT_DIAMONDS } from '../js/card.js';
import { aiFollow } from '../js/ai.js';
import { validateFollow } from '../js/rules.js';

// 用户实测复现（历史场景，规则已调整）：别人出连对，跟牌方同花色的牌不够
// （但不是完全没有）。结构优先级（对子）只在同花色范围内强制，异花色垫牌
// 不要求凑对子，只要求"不能主动垫分"。这个场景里异花色恰好有3张不算分的
// 牌（梅花A、梅花A、梅花Q），需要补的缺口正好也是3张，所以按"不算分优先"
// 选出来的结果自然就是这3张——巧合下正好用满了梅花A对子，但这不是因为
// "去找对子"，而是"不算分的牌刚好够用"。
{
    const trumpSuit = null;
    function D(rank) { return new Card(SUIT_DIAMONDS, rank); }
    function C(rank) { return new Card(SUIT_CLUBS, rank); }
    function H(rank) { return new Card(SUIT_HEARTS, rank); }

    // 领出方块 J J Q Q（连对，2组）
    const ledCards = [D('J'), D('J'), D('Q'), D('Q')];
    // 跟牌方手里方块只有1张（凑不成对，必须用掉），另有梅花对A（不算分）、
    // 红心对K（算分）——按"结构不分花色"，缺口的3张应该优先用梅花A对子
    // （不算分）+ 1张非分单张，而不是随便垫散牌或者用算分的红心K对子。
    const hand = [D('5'), C('A'), C('A'), H('K'), H('K'), C('Q')];

    const aiChoice = aiFollow(hand, ledCards, ledCards, trumpSuit, false, 4);
    const [ok, err] = validateFollow(aiChoice, ledCards, hand, trumpSuit, false, ledCards, 4);
    assert.equal(ok, true, `aiFollow 选出的牌应该合法，实际错误: ${err}`);
    assert.equal(aiChoice.length, 4);
    assert.ok(aiChoice.includes(D('5')) || aiChoice.some(c => c.suit === SUIT_DIAMONDS && c.rank === '5'),
        '唯一的方块5必须被用上（跟花色的硬性要求）');
    assert.equal(aiChoice.filter(c => c.suit === SUIT_CLUBS && c.rank === 'A').length, 2,
        `异花色不算分的牌恰好够用（梅花A×2+梅花Q）时应该全部用上，实际: ${aiChoice.map(c => c.displayName()).join(' ')}`);
    const totalScore = aiChoice.reduce((s, c) => s + c.scoreValue(), 0);
    assert.equal(totalScore, 5, `优先用不算分的异花色牌垫，只有方块5(5分)不可避免，总分值应为5，实际: ${totalScore}`);
}

// 反例校验：手里没有方块5这个唯一同花色牌时随便垫别的（不测，覆盖到主场景即可）

console.log('PASS: fix20-follow-uses-offsuit-pairs-when-insufficient');
