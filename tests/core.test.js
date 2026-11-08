/**
 * 纯逻辑单元测试，直接跑：node tests/core.test.js
 * 不依赖微信环境，也不依赖任何第三方库。
 */

const assert = require('node:assert');
const { createDeck, shuffle, makeTile, makeJoker, handValue } = require('../js/core/tiles');
const { isRun, isGroup, isValidMeld, meldValue } = require('../js/core/rules');
const RummyGame = require('../js/core/game');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  OK  ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}\n    ${err.message}`);
    process.exitCode = 1;
  }
}

const T = (color, n) => makeTile(color, n);
const ids = (tiles) => tiles.map((t) => t.id);

function newGame() {
  return new RummyGame({ playerCount: 4, humanIndex: 0, rng: () => 0.42 });
}

/**
 * 从场上精确取一张指定牌（先看其他玩家手牌，再看牌堆）。
 * 用它来搭出确定的测试牌型，保证 id 唯一、不会和已有牌撞号。
 */
function take(game, color, number) {
  const match = (t) => !t.isJoker && t.color === color && t.number === number;
  for (const p of game.players) {
    const i = p.hand.findIndex(match);
    if (i >= 0) return p.hand.splice(i, 1)[0];
  }
  const i = game.pool.findIndex(match);
  if (i >= 0) return game.pool.splice(i, 1)[0];
  throw new Error(`场上找不到 ${color}${number}`);
}

/** 重设真人手牌（测试里直接指定，避免随机发牌带来的不确定性） */
function setHand(game, tiles) {
  game.players[0].hand = tiles;
}

console.log('牌堆');
test('106 张牌（104 普通 + 2 百搭）', () => {
  const deck = createDeck();
  assert.strictEqual(deck.length, 106);
  assert.strictEqual(deck.filter((t) => t.isJoker).length, 2);
});
test('洗牌不新增/丢失牌', () => {
  const deck = shuffle(createDeck());
  assert.strictEqual(deck.length, 106);
  assert.strictEqual(new Set(deck.map((t) => t.id)).size, 106);
});

console.log('顺子判定');
test('同色连续 3 张 = 合法', () => {
  assert.ok(isRun([T('red', 5), T('red', 6), T('red', 7)]));
});
test('不同色 = 非法', () => {
  assert.ok(!isRun([T('red', 5), T('blue', 6), T('red', 7)]));
});
test('数字重复 = 非法', () => {
  assert.ok(!isRun([T('red', 5), T('red', 5), T('red', 6)]));
});
test('两段被百搭填上 = 合法', () => {
  assert.ok(isRun([T('red', 5), makeJoker(), T('red', 7)]));
});
test('空隙过大百搭不够 = 非法', () => {
  assert.ok(!isRun([T('red', 5), T('red', 9), makeJoker()]));
});

console.log('刻子判定');
test('同数字 3 种颜色 = 合法', () => {
  assert.ok(isGroup([T('red', 7), T('blue', 7), T('black', 7)]));
});
test('颜色重复 = 非法', () => {
  assert.ok(!isGroup([T('red', 7), T('red', 7), T('black', 7)]));
});
test('2 张不能成组', () => {
  assert.ok(!isValidMeld([T('red', 7), T('blue', 7)]));
});
test('百搭点数不计入首出分', () => {
  assert.strictEqual(meldValue([T('red', 10), T('red', 11), makeJoker()]), 21);
});

console.log('对局流程');
test('发牌后每家 14 张，牌堆 50 张', () => {
  const g = newGame();
  for (const p of g.players) assert.strictEqual(p.hand.length, 14);
  assert.strictEqual(g.pool.length, 106 - 14 * 4);
});
test('结束回合后轮到下一位', () => {
  const g = newGame();
  g.draw(0);
  g.endTurn(0);
  assert.strictEqual(g.current, 1);
});
test('手牌点数：百搭按 30 分计', () => {
  assert.strictEqual(handValue([T('red', 3), makeJoker()]), 33);
});

console.log('出牌校验 submitMove');
test('回合开始先摸牌也可以', () => {
  const g = newGame();
  const t = g.draw(0);
  assert.ok(t);
  assert.strictEqual(g.turnState, 'await-play');
});
test('开局可以直接出牌，不必先摸牌', () => {
  const g = newGame();
  const meld = [take(g, 'red', 10), take(g, 'red', 11), take(g, 'red', 12)];
  setHand(g, meld.concat([take(g, 'blue', 2)]));

  g.submitMove(0, [ids(meld)]);
  assert.strictEqual(g.table.length, 1);
  assert.strictEqual(g.players[0].hand.length, 1);
  assert.strictEqual(g.players[0].hasMelded, true);
});
test('首次出牌不满 30 分会被拒绝', () => {
  const g = newGame();
  const meld = [take(g, 'red', 1), take(g, 'red', 2), take(g, 'red', 3)];
  setHand(g, meld.concat([take(g, 'blue', 2)]));
  assert.throws(() => g.submitMove(0, [ids(meld)]), /首次出牌/);
});
test('只重排、不出自己一张牌会被拒绝', () => {
  const g = newGame();
  g.players[0].hasMelded = true;
  const meld = [take(g, 'red', 10), take(g, 'red', 11), take(g, 'red', 12)];
  g.table = [{ id: 'm0', owner: 1, tiles: meld }];
  setHand(g, [take(g, 'blue', 2)]);
  assert.throws(() => g.submitMove(0, [ids(meld)]), /至少要打出自己的一张牌/);
});
test('不能把桌面已有的牌收回手上', () => {
  const g = newGame();
  g.players[0].hasMelded = true;
  const a = take(g, 'red', 10);
  const b = take(g, 'red', 11);
  const c = take(g, 'red', 12);
  const d = take(g, 'red', 13);
  g.table = [{ id: 'm0', owner: 1, tiles: [a, b, c, d] }];
  setHand(g, [take(g, 'blue', 2)]);

  assert.throws(() => g.submitMove(0, [ids([a, b, c])]), /不能把桌面已有的牌收回手上/);
});
test('桌面出现不存在的牌会被拒绝', () => {
  const g = newGame();
  const a = take(g, 'red', 10);
  const b = take(g, 'red', 11);
  setHand(g, [a, b]);
  assert.throws(
    () => g.submitMove(0, [ids([a, b]).concat(['不存在的牌'])]),
    /不存在的牌/
  );
});
test('有一组不合法则整体拒绝', () => {
  const g = newGame();
  g.players[0].hasMelded = true;
  const a = take(g, 'red', 10);
  const b = take(g, 'red', 11);
  const c = take(g, 'blue', 12); // 和 a、b 不同色，凑不成顺子
  setHand(g, [a, b, c]);
  assert.throws(() => g.submitMove(0, [ids([a, b, c])]), /不合法/);
});
test('可以把手里的牌接进桌面已有的牌组', () => {
  const g = newGame();
  g.players[0].hasMelded = true;
  const a = take(g, 'red', 10);
  const b = take(g, 'red', 11);
  const c = take(g, 'red', 12);
  const d = take(g, 'red', 13);
  g.table = [{ id: 'm0', owner: 1, tiles: [a, b, c] }];
  setHand(g, [d]);

  g.submitMove(0, [ids([a, b, c, d])]);
  assert.strictEqual(g.table[0].tiles.length, 4);
  assert.strictEqual(g.players[0].hand.length, 0);
  assert.strictEqual(g.turnState, 'over'); // 出完手牌即获胜
  assert.strictEqual(g.winner, 0);
});
test('可以把桌面一组拆开重新组合', () => {
  const g = newGame();
  g.players[0].hasMelded = true;
  const r10 = take(g, 'red', 10);
  const b10 = take(g, 'blue', 10);
  const k10 = take(g, 'black', 10);
  const y10 = take(g, 'orange', 10);
  g.table = [{ id: 'm0', owner: 1, tiles: [r10, b10, k10] }];
  setHand(g, [y10]);

  // 把桌面三张 10 和手里的橙10 重新组成一个 4 张的刻子
  g.submitMove(0, [ids([r10, b10, k10, y10])]);
  assert.strictEqual(g.table[0].tiles.length, 4);
  assert.strictEqual(g.players[0].hand.length, 0);
});

console.log(`\n通过 ${passed} 项`);
