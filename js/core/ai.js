/**
 * 电脑玩家。
 *
 * 策略是「贪心 + 会用桌面」：
 *   1. 摸一张牌
 *   2. 尽量把手里的牌接到桌面已有的牌组上（顺子接两端、刻子补颜色、百搭补空位）
 *   3. 剩下的手牌里，能独立成组的组成新牌组
 *   4. 首出要凑够 30 分；凑不够就放弃这一轮（只留下摸到的那张）
 *   5. 用 submitMove 一次性提交整张新桌面
 *
 * 为了让首出更容易凑够 30 分，会按「刻子优先」和「顺子优先」各算一套方案，
 * 再挑「能满足 30 分、且出牌更多」的那套。
 *
 * 每一步都拿 isValidMeld 验过，所以永远不可能提交出非法的桌面。
 * 不做的事：把桌面已有的牌组拆开重新分配（那需要搜索，代价太高）。
 */

const { isValidMeld, isInitialMeldValid } = require('./rules');
const { COLORS, MAX_NUMBER } = require('./tiles');

const MIN_MELD = 3;
const MAX_GROUP = 4;

const realOf = (tiles) => tiles.filter((t) => !t.isJoker);

/** 一组牌的牌面点数（百搭不计分） */
function valueOf(tiles) {
  return realOf(tiles).reduce((sum, t) => sum + t.number, 0);
}

/**
 * 尽量往一组牌上接牌。用掉的牌会从 pool 里移除，返回接上去的牌。
 * 先试真牌，真牌接不上了再考虑百搭（百搭更宝贵，留着凑首出）。
 */
function extendMeld(meld, pool, allowJoker) {
  const added = [];
  let progress = true;

  while (progress) {
    progress = false;
    const passes = allowJoker ? [false, true] : [false];

    for (const wantJoker of passes) {
      for (let i = 0; i < pool.length; i++) {
        const tile = pool[i];
        if (!!tile.isJoker !== wantJoker) continue;
        if (!isValidMeld(meld.concat(added, [tile]))) continue;
        added.push(tile);
        pool.splice(i, 1);
        progress = true;
        break;
      }
      if (progress) break;
    }
  }
  return added;
}

/**
 * 在某个颜色里找一条顺子。
 * 从长到短扫窗口，空位用百搭补；allowJoker = false 时只用真牌。
 * 找不到返回 null。
 */
function findRun(pool, color, jokers, allowJoker) {
  const byNumber = new Map();
  for (const t of pool) {
    if (t.isJoker || t.color !== color) continue;
    if (!byNumber.has(t.number)) byNumber.set(t.number, t);
  }
  if (byNumber.size === 0) return null;

  const maxJokers = allowJoker ? jokers.length : 0;

  for (let len = MAX_NUMBER; len >= MIN_MELD; len--) {
    for (let start = 1; start + len - 1 <= MAX_NUMBER; start++) {
      const tiles = [];
      let missing = 0;
      for (let n = start; n < start + len; n++) {
        if (byNumber.has(n)) tiles.push(byNumber.get(n));
        else missing += 1;
      }
      if (tiles.length === 0) continue;   // 不能全是百搭
      if (missing > maxJokers) continue;
      for (let k = 0; k < missing; k++) tiles.push(jokers[k]);
      if (isValidMeld(tiles)) return tiles;
    }
  }
  return null;
}

/** 从手牌里找一组刻子（同数字、不同颜色），找不到返回 null */
function findGroupInHand(pool) {
  const jokers = pool.filter((t) => t.isJoker);

  // 每个颜色只留一张 —— 同色两张凑不成刻子
  const byNumber = new Map();
  for (const t of pool) {
    if (t.isJoker) continue;
    if (!byNumber.has(t.number)) byNumber.set(t.number, new Map());
    const byColor = byNumber.get(t.number);
    if (!byColor.has(t.color)) byColor.set(t.color, t);
  }

  for (const [, byColor] of byNumber) {
    const picked = [...byColor.values()];
    if (picked.length >= MIN_MELD) return picked.slice(0, MAX_GROUP);
    const need = MIN_MELD - picked.length;
    if (need > 0 && need <= jokers.length) return picked.concat(jokers.slice(0, need));
  }
  return null;
}

/** 从手牌里找一条顺子（先用真牌，再允许百搭补空位），找不到返回 null */
function findRunInHand(pool) {
  const jokers = pool.filter((t) => t.isJoker);
  for (const allowJoker of [false, true]) {
    for (const color of COLORS) {
      const run = findRun(pool, color, jokers, allowJoker);
      if (run) return run;
    }
  }
  return null;
}

/**
 * 从手牌里找一组能独立成组的牌。
 * groupFirst 决定先找刻子还是先找顺子。
 */
function findMeldInHand(pool, groupFirst) {
  const finders = groupFirst
    ? [findGroupInHand, findRunInHand]
    : [findRunInHand, findGroupInHand];
  for (const find of finders) {
    const meld = find(pool);
    if (meld) return meld;
  }
  return null;
}

/**
 * 做一套完整的出牌方案（不改 game，只在一个副本上推演）。
 * @returns {{table: object[][], played: object[], ok: boolean}}
 */
function buildPlan(game, player, groupFirst, beforeIds) {
  const hand = player.hand.slice(); // 手牌工作副本，用掉的会从里面移除

  // 1) 桌面上每一组都试着接牌
  const table = game.table.map((m) => {
    const group = m.tiles.slice();
    group.push(...extendMeld(group, hand, true));
    return group;
  });

  // 2) 剩下的手牌里，能独立成组的组成新牌组
  let meld;
  while ((meld = findMeldInHand(hand, groupFirst))) {
    for (const t of meld) {
      const i = hand.indexOf(t);
      if (i >= 0) hand.splice(i, 1);
    }
    table.push(meld);
  }

  // 3) 本轮从手牌打出了哪些牌
  const played = [];
  for (const group of table) {
    for (const t of group) if (!beforeIds.has(t.id)) played.push(t);
  }

  // 4) 出牌的前提：至少打出一张自己的牌；未首出时点数要够 30
  const ok = played.length > 0 && (player.hasMelded || isInitialMeldValid(valueOf(played)));
  return { table, played, ok };
}

/** a 是不是比 b 更好的方案 */
function betterPlan(a, b, needThirty) {
  if (needThirty && a.ok !== b.ok) return a.ok;      // 首出时优先选能凑够 30 分的
  if (a.played.length !== b.played.length) return a.played.length > b.played.length;
  return valueOf(a.played) > valueOf(b.played);
}

/**
 * 让某位电脑走完一个回合。
 * @returns {{drawn: object|null, played: object[]}} 摸到的牌、本轮真正打出的牌
 */
function takeTurn(game, index) {
  const player = game.players[index];
  const drawn = game.draw(index);

  // 桌面原有的牌，用来判断"这一轮从手牌打出了哪些"
  const beforeIds = new Set();
  for (const meld of game.table) for (const t of meld.tiles) beforeIds.add(t.id);

  // 刻子优先 / 顺子优先各算一套，挑更好的那套
  const needThirty = !player.hasMelded;
  let best = null;
  for (const groupFirst of [true, false]) {
    const plan = buildPlan(game, player, groupFirst, beforeIds);
    if (!best || betterPlan(plan, best, needThirty)) best = plan;
  }

  let played = [];
  if (best && best.ok) {
    try {
      game.submitMove(index, best.table.map((g) => g.map((t) => t.id)));
      played = best.played;
    } catch (err) {
      // 理论上不会发生（每组都验过 isValidMeld），保险起见过牌
    }
  }

  if (game.turnState !== 'over') game.endTurn(index);
  return { drawn, played };
}

module.exports = {
  takeTurn,
  extendMeld,
  findMeldInHand,
  findGroupInHand,
  findRunInHand,
  findRun,
  valueOf,
};
