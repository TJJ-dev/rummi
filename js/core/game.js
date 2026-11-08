/**
 * 拉密对局状态机
 *
 * 回合状态：
 *   await-draw  等玩家行动（可以摸牌，也可以直接出牌）
 *   await-play  行动中（出过牌之后，仍可继续调整）
 *   over        有人出完手牌 / 牌堆摸空后结算
 *
 * 出牌有两种入口：
 *   playMeld()   打出一组全新的牌组（电脑 AI 用这个）
 *   submitMove() 提交整张桌面的新摆法（玩家拖牌用这个，支持重排已有牌组）
 *
 * 尚未实现（后续迭代）：百搭挪动与替换。
 */

const { createDeck, shuffle, sortHand, handValue } = require('./tiles');
const { isValidMeld, meldValue, isInitialMeldValid, INITIAL_MELD_MIN } = require('./rules');

const HAND_SIZE = 14;

class RummyGame {
  constructor(options = {}) {
    const playerCount = options.playerCount || 4;
    const humanIndex = options.humanIndex == null ? 0 : options.humanIndex;
    const rng = options.rng || Math.random;

    this.playerCount = playerCount;
    this.players = [];
    for (let i = 0; i < playerCount; i++) {
      this.players.push({
        index: i,
        isHuman: i === humanIndex,
        hand: [],
        hasMelded: false,
      });
    }

    const deck = shuffle(createDeck(), rng);
    for (let round = 0; round < HAND_SIZE; round++) {
      for (const p of this.players) p.hand.push(deck.pop());
    }
    for (const p of this.players) p.hand = sortHand(p.hand);

    this.pool = deck;          // 牌堆（可摸的牌）
    this.table = [];           // 桌面牌组 [{ id, owner, tiles }]
    this.current = options.current == null ? humanIndex : options.current; // 默认真人先手；联机由服务端指定
    this.turnState = 'await-draw';
    this.turnPlacedValue = 0;  // 本轮已打出的点数（用于首出 30 分判定）
    this.consecutivePasses = 0;
    this.winner = null;
    this.log = [];
    this._meldSeq = 0;
  }

  get currentPlayer() {
    return this.players[this.current];
  }

  _player(index) {
    const p = this.players[index];
    if (!p) throw new Error(`玩家 ${index} 不存在`);
    return p;
  }

  _assertTurn(index) {
    if (this.turnState === 'over') throw new Error('对局已结束');
    if (index !== this.current) throw new Error('还没轮到该玩家');
  }

  _canAct() {
    return this.turnState === 'await-draw' || this.turnState === 'await-play';
  }

  /** 摸牌。牌堆为空时直接进入出牌阶段。返回摸到的牌或 null */
  draw(index) {
    this._assertTurn(index);
    if (this.turnState !== 'await-draw') throw new Error('当前不能摸牌');

    const player = this._player(index);
    if (this.pool.length === 0) {
      this.turnState = 'await-play';
      return null;
    }
    const tile = this.pool.pop();
    player.hand.push(tile);
    player.hand = sortHand(player.hand);
    this.turnState = 'await-play';
    return tile;
  }

  /** 打出一组全新的牌组（tileIds 为手牌 id），成功则移入桌面。电脑 AI 走这条路 */
  playMeld(index, tileIds) {
    this._assertTurn(index);
    if (!this._canAct()) throw new Error('现在不能出牌');

    const player = this._player(index);
    const tiles = [];
    for (const id of tileIds) {
      const pos = player.hand.findIndex((t) => t.id === id);
      if (pos < 0) throw new Error('手牌中没有这张牌');
      tiles.push(player.hand[pos]);
    }

    if (!isValidMeld(tiles)) throw new Error('这不是合法的牌组（顺子或刻子）');

    if (!player.hasMelded) {
      const total = this.turnPlacedValue + meldValue(tiles);
      if (!isInitialMeldValid(total)) {
        throw new Error(`首次出牌总点数需 ≥ ${INITIAL_MELD_MIN}，当前 ${total}`);
      }
    }

    const ids = new Set(tileIds);
    player.hand = player.hand.filter((t) => !ids.has(t.id));
    player.hasMelded = true;
    this.turnPlacedValue += meldValue(tiles);
    this.table.push({ id: `m${this._meldSeq++}`, owner: index, tiles });
    this.log.push(`玩家${index} 打出 ${tiles.length} 张牌`);

    this.turnState = 'await-play';
    if (player.hand.length === 0) {
      this.winner = index;
      this.turnState = 'over';
      this.log.push(`玩家${index} 出完手牌，获胜！`);
    }
    return tiles;
  }

  /**
   * 提交一次出牌：把整张桌面的新摆法交进来做整体校验。玩家拖牌走这条路。
   *
   * tableMelds 是二维数组，元素是牌的 id：
   *   [ ['t3','t20','t31'], ['t44','t55','j0'] ]
   *
   * 校验四件事：
   *   1. 每一组都必须是合法的顺子或刻子
   *   2. 桌面原有的牌一张都不能少（不能把桌上的牌收回手里）
   *   3. 至少要打出自己的一张牌
   *   4. 未完成首出时，本次打出的非百搭点数之和 >= 30
   */
  submitMove(index, tableMelds) {
    this._assertTurn(index);
    if (!this._canAct()) throw new Error('现在不能出牌');
    if (!Array.isArray(tableMelds)) throw new Error('出牌数据格式不对');

    const player = this._player(index);

    // 桌面原有牌 + 自己手牌，各建一份索引
    const oldTiles = [];
    for (const meld of this.table) for (const t of meld.tiles) oldTiles.push(t);
    const oldById = new Map(oldTiles.map((t) => [t.id, t]));
    const handById = new Map(player.hand.map((t) => [t.id, t]));

    const used = new Set();
    const newMelds = [];
    let fromHandCount = 0;
    let fromHandValue = 0;

    for (const group of tableMelds) {
      if (!Array.isArray(group)) throw new Error('出牌数据格式不对');
      if (group.length === 0) continue;

      const tiles = [];
      for (const id of group) {
        if (used.has(id)) throw new Error('同一张牌出现了两次');
        used.add(id);

        const fromHand = handById.get(id);
        if (fromHand) {
          tiles.push(fromHand);
          fromHandCount += 1;
          if (!fromHand.isJoker) fromHandValue += fromHand.number; // 百搭不计分
          continue;
        }
        const fromTable = oldById.get(id);
        if (!fromTable) throw new Error('桌面出现了不存在的牌');
        tiles.push(fromTable);
      }

      if (!isValidMeld(tiles)) throw new Error('有一组牌不合法（必须是顺子或刻子）');
      newMelds.push(tiles);
    }

    for (const t of oldTiles) {
      if (!used.has(t.id)) throw new Error('不能把桌面已有的牌收回手上');
    }
    if (fromHandCount === 0) throw new Error('至少要打出自己的一张牌');
    if (!player.hasMelded && !isInitialMeldValid(fromHandValue)) {
      throw new Error(`首次出牌总点数需 ≥ ${INITIAL_MELD_MIN}，当前 ${fromHandValue}`);
    }

    // ---------- 校验通过，正式落地 ----------
    const playedIds = new Set();
    for (const tiles of newMelds) {
      for (const t of tiles) if (handById.has(t.id)) playedIds.add(t.id);
    }

    player.hand = player.hand.filter((t) => !playedIds.has(t.id));
    player.hasMelded = true;
    this.turnPlacedValue += fromHandValue;

    this.table = newMelds.map((tiles) => ({
      id: `m${this._meldSeq++}`,
      owner: index,
      tiles,
    }));
    this.log.push(`玩家${index} 打出 ${playedIds.size} 张牌`);

    if (player.hand.length === 0) {
      this.winner = index;
      this.turnState = 'over';
      this.log.push(`玩家${index} 出完手牌，获胜！`);
    } else {
      this.turnState = 'await-play';
    }
    return newMelds;
  }

  /** 结束回合，轮到下一位 */
  endTurn(index) {
    this._assertTurn(index);
    if (this.turnState === 'await-draw') throw new Error('本回合还没摸牌');

    this.consecutivePasses = this.turnPlacedValue > 0 ? 0 : this.consecutivePasses + 1;
    this.turnPlacedValue = 0;
    this.current = (this.current + 1) % this.playerCount;
    this.turnState = 'await-draw';

    // 牌堆摸空且所有人都无法出牌 -> 结算，手牌点数最小者获胜
    if (this.pool.length === 0 && this.consecutivePasses >= this.playerCount) {
      this._settleByLowestHand();
    }
  }

  _settleByLowestHand() {
    let best = null;
    for (const p of this.players) {
      const v = handValue(p.hand);
      if (best === null || v < best.value) best = { index: p.index, value: v };
    }
    this.winner = best.index;
    this.turnState = 'over';
    this.log.push('牌堆已摸空，手牌点数最低者获胜。');
  }

  /** 结算分数：返回每位玩家剩余手牌点数 */
  getScores() {
    return this.players.map((p) => ({
      index: p.index,
      isHuman: p.isHuman,
      value: handValue(p.hand),
      tilesLeft: p.hand.length,
    }));
  }

  /** 转成可存数据库的纯数据（不含方法） */
  toJSON() {
    return {
      playerCount: this.playerCount,
      players: this.players,
      pool: this.pool,
      table: this.table,
      current: this.current,
      turnState: this.turnState,
      turnPlacedValue: this.turnPlacedValue,
      consecutivePasses: this.consecutivePasses,
      winner: this.winner,
      log: this.log,
      meldSeq: this._meldSeq,
    };
  }

  /**
   * 从数据库里的纯数据恢复对局。
   * 不走构造函数：构造函数会重新洗牌发牌，这里必须原样恢复。
   */
  static fromJSON(data) {
    if (!data) throw new Error('对局数据为空');
    const game = Object.create(RummyGame.prototype);
    Object.assign(game, {
      playerCount: data.playerCount,
      players: data.players,
      pool: data.pool,
      table: data.table,
      current: data.current,
      turnState: data.turnState,
      turnPlacedValue: data.turnPlacedValue || 0,
      consecutivePasses: data.consecutivePasses || 0,
      winner: data.winner,
      log: data.log || [],
      _meldSeq: data.meldSeq == null ? (data._meldSeq || 0) : data.meldSeq,
    });
    return game;
  }

  getState() {
    return {
      current: this.current,
      turnState: this.turnState,
      poolCount: this.pool.length,
      table: this.table,
      winner: this.winner,
      turnPlacedValue: this.turnPlacedValue,
      players: this.players,
    };
  }
}

RummyGame.HAND_SIZE = HAND_SIZE;

module.exports = RummyGame;
