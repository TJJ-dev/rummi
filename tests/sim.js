/**
 * 无界面模拟器：在 Node 里把一整局跑完，并逐回合打印每个人做了什么。
 * 用来验证规则改动、对比 AI 强弱。
 *
 * 用法：
 *   node tests/sim.js        // 4 人
 *   node tests/sim.js 2      // 2 人
 *   node tests/sim.js 3      // 3 人
 *
 * 它复用的是真正跑在游戏里的逻辑（js/core/game.js + js/core/ai.js），
 * 不是另写一套，所以这里跑出来的行为就是游戏里的行为。
 */

const RummyGame = require('../js/core/game');
const { takeTurn } = require('../js/core/ai');
const { COLOR_LABEL } = require('../js/core/tiles');

const playerCount = Number(process.argv[2]) || 4;
const MAX_TURNS = 2000; // 防止意外死循环

function tileLabel(t) {
  return t.isJoker ? '百搭' : `${COLOR_LABEL[t.color]}${t.number}`;
}

const game = new RummyGame({ playerCount, humanIndex: 0 });

console.log(`=== ${playerCount} 人对局（全部由 AI 代打）===`);
console.log(`每人手牌 ${RummyGame.HAND_SIZE} 张，牌堆 ${game.pool.length} 张\n`);

let turn = 0;
let emptyTurns = 0; // 连续"什么都没出"的回合数

while (game.turnState !== 'over' && turn < MAX_TURNS) {
  turn++;
  const idx = game.current;
  const before = game.players[idx].hand.length;

  const { drawn, played } = takeTurn(game, idx);

  const after = game.players[idx].hand.length;
  if (played.length === 0) emptyTurns++;
  else emptyTurns = 0;

  console.log(
    `[${String(turn).padStart(3)}] 玩家${idx}  ` +
      `摸:${drawn ? tileLabel(drawn) : '牌堆空'}  ` +
      `出:${played.length ? played.map(tileLabel).join(' ') : '—'}  ` +
      `手牌 ${before}→${after}  牌堆剩 ${game.pool.length}`
  );
}

console.log('');
if (game.turnState === 'over') {
  console.log(`对局结束：赢家 = 玩家 ${game.winner}`);
} else {
  console.log(`达到 ${MAX_TURNS} 回合上限仍未结束（可能有问题，需要检查）`);
}
console.log(`总回合数：${turn}`);
console.log(`桌面牌组数：${game.table.length}`);
console.log('各玩家剩余手牌：');
for (const s of game.getScores()) {
  console.log(`  玩家${s.index}: ${s.value} 分（剩 ${s.tilesLeft} 张）`);
}
