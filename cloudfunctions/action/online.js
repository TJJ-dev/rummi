/**
 * 在线对局。
 *
 * 权威状态只存在服务端的 room.game 里：
 *   - 客户端只提交"我想摸牌 / 我想这样摆桌面"，不自己改结果
 *   - 每回合 60 秒，超时由服务端自动摸牌并结束回合
 *   - 所有写给客户端的视图都经过 viewFor()，别人的手牌只给张数
 *
 * 并发用 version 乐观锁：两个人同时操作时只有一个人能写成功，
 * 另一个会重新读房间再判断，避免同一回合被结算两次。
 */

const { db, ROOMS } = require('./db');
const RummyGame = require('./core/game');
const { publicRoom } = require('./view');

const TURN_MS = 60 * 1000;
const MAX_TIMEOUT_STEPS = 16;

function roomIdOf(payload) {
  return String((payload && payload.roomId) || '').trim();
}

async function loadRoom(roomId) {
  if (!/^\d{6}$/.test(roomId)) return null;
  try {
    return (await db.collection(ROOMS).doc(roomId).get()).data;
  } catch (err) {
    return null;
  }
}

function seatOf(room, openid) {
  return (room.seats || []).findIndex((s) => s.openid === openid);
}

/**
 * 某位玩家看到的对局。自己的手牌是完整牌面，其他人只给张数。
 * 注意：绝不能把别人的 hand 数组原样返回。
 */
function viewFor(room, seat) {
  const g = room.game;
  if (!g) return null;

  const turnEndsAt = (room.turnStartedAt || room.updatedAt || Date.now()) + TURN_MS;

  return {
    roomId: room._id,
    version: room.version || 0,
    status: room.status,
    mySeat: seat,
    current: g.current,
    turnState: g.turnState,
    poolCount: (g.pool || []).length,
    winner: g.winner,
    turnEndsAt,
    turnLeftMs: Math.max(0, turnEndsAt - Date.now()),
    turnPlacedValue: g.turnPlacedValue || 0,
    table: g.table || [],
    players: (g.players || []).map((p, i) => {
      const s = (room.seats || [])[i] || {};
      const mine = i === seat;
      return {
        index: i,
        seat: i,
        name: s.nickname || `玩家${i + 1}`,
        avatar: s.avatar || '',
        isHuman: mine,
        isMe: mine,
        hasMelded: !!p.hasMelded,
        handCount: (p.hand || []).length,
        hand: mine ? p.hand : [],
      };
    }),
  };
}

/** 把超时玩家自动摸牌、结束回合；返回新的 game 以及是否改动过 */
function applyTimeout(room, now) {
  const game = RummyGame.fromJSON(room.game);
  let changed = false;

  // 一次请求最多推进 16 个回合，防止房间长期没人时死循环
  for (let i = 0; i < MAX_TIMEOUT_STEPS; i++) {
    if (game.turnState === 'over') break;

    const started = room.turnStartedAt || room.updatedAt || now;
    if (now - started < TURN_MS) break;

    const index = game.current;
    try {
      game.draw(index);
    } catch (err) {
      // 正常不会发生；保险起见用 endTurn 兜底，避免卡死
    }
    if (game.turnState !== 'over') game.endTurn(index);

    room.turnStartedAt = started + TURN_MS;
    changed = true;
  }

  if (changed) {
    room.game = game.toJSON();
    if (game.turnState === 'over') room.status = 'finished';
  }
  return { game, changed };
}

async function saveRoom(room, patch) {
  const version = room.version || 0;
  const data = Object.assign({}, patch, {
    version: version + 1,
    updatedAt: Date.now(),
  });

  const res = await db
    .collection(ROOMS)
    .where({ _id: room._id, version })
    .update({ data });

  return !!(res.stats && res.stats.updated);
}

function finishIfOver(room) {
  if (room.game && room.game.turnState === 'over') room.status = 'finished';
}

/** 房主开局 */
async function startGame(openid, payload) {
  const roomId = roomIdOf(payload);

  for (let attempt = 0; attempt < 3; attempt++) {
    const room = await loadRoom(roomId);
    if (!room) return { ok: false, error: '房间不存在' };

    const seat = seatOf(room, openid);
    if (seat < 0) return { ok: false, error: '你不在这个房间里' };

    // 重复点开始 / 别人已经开局 → 直接返回当前对局，幂等
    if (room.status === 'playing' && room.game) {
      return { ok: true, room: publicRoom(room, openid), game: viewFor(room, seat) };
    }
    if (room.status !== 'waiting') return { ok: false, error: '房间已结束或已关闭' };
    if (room.ownerOpenid !== openid) return { ok: false, error: '只有房主能开始游戏' };

    const seats = room.seats || [];
    if (seats.length < 2) return { ok: false, error: '至少 2 人才能开始' };
    if (seats.length > 4) return { ok: false, error: '人数超过 4 人' };

    const game = new RummyGame({
      playerCount: seats.length,
      humanIndex: -1, // 联机里每个人都是真人，没有电脑
      current: 0,
    });
    game.players.forEach((p) => {
      p.isHuman = false;
    });

    const now = Date.now();
    room.game = game.toJSON();
    room.status = 'playing';
    room.turnStartedAt = now;
    room.lastActionAt = now;

    if (!(await saveRoom(room, {
      game: room.game,
      status: room.status,
      turnStartedAt: room.turnStartedAt,
      lastActionAt: room.lastActionAt,
    }))) {
      continue; // 有人同时加入/操作，重读再来
    }

    room.version = (room.version || 0) + 1;
    return { ok: true, room: publicRoom(room, openid), game: viewFor(room, seat) };
  }

  return { ok: false, error: '房间繁忙，请重试' };
}

/** 拉取对局状态；顺便处理 60 秒超时 */
async function onlineState(openid, payload) {
  const roomId = roomIdOf(payload);

  for (let attempt = 0; attempt < 3; attempt++) {
    const room = await loadRoom(roomId);
    if (!room) return { ok: false, error: '房间不存在' };

    const seat = seatOf(room, openid);
    if (seat < 0) return { ok: false, error: '你不在这个房间里' };
    if (!room.game) {
      return { ok: true, room: publicRoom(room, openid), game: null };
    }

    const { changed } = applyTimeout(room, Date.now());
    if (!changed) {
      return { ok: true, room: publicRoom(room, openid), game: viewFor(room, seat) };
    }

    const saved = await saveRoom(room, {
      game: room.game,
      status: room.status,
      turnStartedAt: room.turnStartedAt,
    });
    if (!saved) continue;

    room.version = (room.version || 0) + 1;
    return { ok: true, room: publicRoom(room, openid), game: viewFor(room, seat) };
  }

  return { ok: false, error: '房间繁忙，请重试' };
}

/**
 * 摸牌 + 自动结束回合。
 * 数据库写入失败（版本冲突）会重读重试，所以不会出现"摸了两张"。
 */
async function onlineDraw(openid, payload) {
  const roomId = roomIdOf(payload);

  for (let attempt = 0; attempt < 3; attempt++) {
    const room = await loadRoom(roomId);
    if (!room) return { ok: false, error: '房间不存在' };

    const seat = seatOf(room, openid);
    if (seat < 0) return { ok: false, error: '你不在这个房间里' };
    if (room.status !== 'playing' || !room.game) return { ok: false, error: '对局还没开始' };

    const { game, changed: timedOut } = applyTimeout(room, Date.now());
    if (game.turnState === 'over') {
      room.game = game.toJSON();
      finishIfOver(room);
      if (timedOut && !(await saveRoom(room, {
        game: room.game,
        status: room.status,
        turnStartedAt: room.turnStartedAt,
      }))) {
        continue;
      }
      if (timedOut) room.version = (room.version || 0) + 1;
      return { ok: false, error: '对局已经结束', game: viewFor(room, seat) };
    }

    if (game.current !== seat) return { ok: false, error: '还没轮到你' };
    if (game.turnState !== 'await-draw') return { ok: false, error: '本回合已经摸过牌了' };

    const tile = game.draw(seat);
    if (game.turnState !== 'over') game.endTurn(seat);
    room.game = game.toJSON();
    room.turnStartedAt = Date.now();
    finishIfOver(room);

    const saved = await saveRoom(room, {
      game: room.game,
      status: room.status,
      turnStartedAt: room.turnStartedAt,
    });
    if (!saved) continue;

    room.version = (room.version || 0) + 1;
    return {
      ok: true,
      drawn: tile ? { id: tile.id, color: tile.color, number: tile.number, isJoker: tile.isJoker } : null,
      room: publicRoom(room, openid),
      game: viewFor(room, seat),
    };
  }

  return { ok: false, error: '操作太频繁，请重试' };
}

/**
 * 提交整张桌面（拖牌后的结果）+ 自动结束回合。
 * 规则校验全在 core，服务端不信任客户端传来的任何结论。
 */
async function onlinePlay(openid, payload) {
  const roomId = roomIdOf(payload);
  const tableMelds = payload && payload.tableMelds;
  if (!Array.isArray(tableMelds)) return { ok: false, error: '出牌数据格式不对' };

  for (let attempt = 0; attempt < 3; attempt++) {
    const room = await loadRoom(roomId);
    if (!room) return { ok: false, error: '房间不存在' };

    const seat = seatOf(room, openid);
    if (seat < 0) return { ok: false, error: '你不在这个房间里' };
    if (room.status !== 'playing' || !room.game) return { ok: false, error: '对局还没开始' };

    const { game } = applyTimeout(room, Date.now());
    if (game.current !== seat) return { ok: false, error: '还没轮到你' };
    if (game.turnState === 'over') return { ok: false, error: '对局已经结束' };

    try {
      game.submitMove(seat, tableMelds);
    } catch (err) {
      return { ok: false, error: err.message || '出牌不合法' };
    }

    if (game.turnState !== 'over') game.endTurn(seat);
    room.game = game.toJSON();
    room.turnStartedAt = Date.now();
    finishIfOver(room);

    const saved = await saveRoom(room, {
      game: room.game,
      status: room.status,
      turnStartedAt: room.turnStartedAt,
    });
    if (!saved) continue;

    room.version = (room.version || 0) + 1;
    return {
      ok: true,
      room: publicRoom(room, openid),
      game: viewFor(room, seat),
    };
  }

  return { ok: false, error: '操作太频繁，请重试' };
}

module.exports = {
  TURN_MS,
  viewFor,
  startGame,
  onlineState,
  onlineDraw,
  onlinePlay,
};
