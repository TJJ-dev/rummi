const { db, ROOMS, USERS, MAX_SEATS } = require('./db');
const { publicRoom } = require('./view');
const { viewFor } = require('./online');

function makeRoomId() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** 从 users 集合读昵称头像 —— 不信客户端传的 */
async function getProfile(openid) {
  try {
    const res = await db.collection(USERS).doc(openid).get();
    return res.data || {};
  } catch (err) {
    return {};
  }
}

/** 集合不存在时自动创建；已存在会抛错，直接忽略（换环境时省事） */
async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (err) {
    // 已存在
  }
}

// 加入房间
async function joinRoom(openid, payload) {
  const roomId = String(payload.roomId || '').trim();
  if (!/^\d{6}$/.test(roomId)) return { ok: false, error: '房间号格式不对' };

  const col = db.collection(ROOMS);

  let room;
  try {
    room = (await col.doc(roomId).get()).data;
  } catch (err) {
    return { ok: false, error: '房间不存在' };
  }

  // 已经在房里 → 幂等返回（重进游戏、断线回来都走这里）。
  // 这一步必须在"是否已开始"之前判断，否则对局中掉线就再也回不来了。
  const mine = (room.seats || []).findIndex((s) => s.openid === openid);
  if (mine >= 0) {
    return {
      ok: true,
      room: publicRoom(room, openid),
      game: viewFor(room, mine),
      rejoined: true,
    };
  }

  if (room.status !== 'waiting') return { ok: false, error: '房间已开始或已关闭' };

  const max = room.maxPlayers || MAX_SEATS;
  if ((room.seats || []).length >= max) return { ok: false, error: '房间已满' };

  const profile = await getProfile(openid);
  const now = Date.now();
  const seat = {
    openid,
    nickname: profile.nickname || '玩家',
    avatar: profile.avatar || '',
    joinedAt: now,
    lastSeenAt: now,
  };

  const seats = (room.seats || []).concat([seat]);

  // 乐观锁：只有 version 没变才写入，防止两个人同时抢同一个空位
  const res = await col
    .where({ _id: roomId, version: room.version })
    .update({
      data: {
        seats,
        seatCount: seats.length,
        isFull: seats.length >= max,
        version: room.version + 1,
        updatedAt: now,
      },
    });

  if (!res.stats.updated) return { ok: false, error: '手慢了，房间状态已变，请刷新重试' };

  // 返回的 version 必须是"写入之后"的，否则客户端拿旧版本调下一个接口会撞
  return {
    ok: true,
    room: publicRoom({ ...room, seats, version: room.version + 1 }, openid),
  };
}

// 离开房间
async function leaveRoom(openid, payload) {
  const roomId = String(payload.roomId || '').trim();
  const col = db.collection(ROOMS);

  let room;
  try {
    room = (await col.doc(roomId).get()).data;
  } catch (err) {
    return { ok: true }; // 房间已经没了，也算离开成功
  }

  if (room.status === 'playing') return { ok: false, error: '对局中不能离开' };

  const oldSeats = room.seats || [];
  const seats = oldSeats.filter((s) => s.openid !== openid);
  if (seats.length === oldSeats.length) return { ok: true }; // 本来就不在，幂等

  const patch = {
    seats,
    seatCount: seats.length,
    isFull: false,
    version: room.version + 1,
    updatedAt: Date.now(),
  };

  if (seats.length === 0) {
    patch.status = 'closed';             // 没人了 → 关房
  } else if (room.ownerOpenid === openid) {
    patch.ownerOpenid = seats[0].openid; // 房主走了 → 转让给第一个座位
  }

  const res = await col.where({ _id: roomId, version: room.version }).update({ data: patch });

  // 版本被抢了（比如离开的同时有人加入）→ 必须让客户端重试，
  // 否则会留下"客户端以为走了、服务端还在座位上"的幽灵
  if (!res.stats.updated) return { ok: false, error: '房间状态已变，请重试' };
  return { ok: true };
}

async function roomState(openid, payload) {
  const roomId = String(payload.roomId || '').trim();

  let room;
  try {
    room = (await db.collection(ROOMS).doc(roomId).get()).data;
  } catch (err) {
    return { ok: false, error: '房间不存在' };
  }

  const seat = (room.seats || []).findIndex((s) => s.openid === openid);
  if (seat < 0) {
    return { ok: false, error: '你不在这个房间里' };
  }

  return {
    ok: true,
    room: publicRoom(room, openid),
    game: viewFor(room, seat),
  };
}

/** 我当前正在进行的对局（用于从大厅回到牌桌） */
async function myRoom(openid) {
  const res = await db
    .collection(ROOMS)
    .where({ status: 'playing' })
    .limit(50)
    .get();

  for (const room of res.data || []) {
    const seat = (room.seats || []).findIndex((s) => s.openid === openid);
    if (seat >= 0 && room.game) {
      return {
        ok: true,
        room: publicRoom(room, openid),
        game: viewFor(room, seat),
      };
    }
  }
  return { ok: true, room: null, game: null };
}

async function heartbeat(openid, payload) {
  const roomId = String(payload.roomId || '').trim();
  const col = db.collection(ROOMS);

  let room;
  try {
    room = (await col.doc(roomId).get()).data;
  } catch (err) {
    return { ok: false, error: '房间不存在' };
  }
  if (!(room.seats || []).some((s) => s.openid === openid)) {
    return { ok: false, error: '你不在这个房间里' };
  }

  // 只更新自己那一项，不碰 seats 数组，不加 version
  await col.doc(roomId).update({
    data: { ['presence.' + openid]: Date.now() },
  });
  return { ok: true };
}

async function createRoom(openid, payload) {
  const profile = await getProfile(openid);
  const nickname = profile.nickname || '玩家';
  const avatar = profile.avatar || '';
  const isPublic = payload.isPublic !== false; // 默认公开，出现在房间列表里

  await ensureCollection(ROOMS); // 换新环境时自动建集合，省一次手工操作

  const now = Date.now();
  const seat = { openid, nickname, avatar, joinedAt: now, lastSeenAt: now };

  let lastErr = null;
  for (let i = 0; i < 5; i++) {
    const roomId = makeRoomId();

    // 先把完整文档构造出来：一是用来 add，二是直接喂给 publicRoom，
    // 这样 createRoom 和 joinRoom / roomState 返回的结构完全一致
    const roomDoc = {
      _id: roomId,
      version: 1,
      status: 'waiting',
      ownerOpenid: openid,
      isPublic,
      maxPlayers: MAX_SEATS,
      seats: [seat],
      seatCount: 1,
      isFull: false,
      presence: {},
      game: null,
      createdAt: now,
      updatedAt: now,
      lastActionAt: now,
    };

    try {
      await db.collection(ROOMS).add({ data: roomDoc });
      return { ok: true, room: publicRoom(roomDoc, openid) };
    } catch (err) {
      lastErr = err;
      console.error('[createRoom] add failed', err);

      // 只有房间号冲突才换号重试，其他错误立即返回
      const message = String(err.errMsg || err.message || err);
      if (!/duplicate|already exists|重复/i.test(message)) break;
    }
  }

  return {
    ok: false,
    error:
      '房间创建失败：' +
      ((lastErr && (lastErr.errMsg || lastErr.message || String(lastErr))) || '未知错误'),
  };
}

async function roomList() {
  const res = await db
    .collection(ROOMS)
    .where({ status: 'waiting' })
    // 列表不需要对局状态，别把整副牌一起读出来
    .field({
      status: true,
      ownerOpenid: true,
      isPublic: true,
      maxPlayers: true,
      seatCount: true,
      isFull: true,
      createdAt: true,
      seats: true,
    })
    .limit(50)
    .get();

  // 只按 status 查，其余条件在内存里过滤、排序。
  // 这样不需要复合索引，新环境也不会因为没建索引直接报错。
  const rooms = (res.data || [])
    .filter((r) => r.isPublic !== false && !r.isFull)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 20);

  return {
    ok: true,
    rooms: rooms.map((r) => {
      const owner = (r.seats || []).find((s) => s.openid === r.ownerOpenid) || (r.seats || [])[0];
      return {
        roomId: r._id,
        ownerName: owner ? owner.nickname : '未知',
        ownerAvatar: owner ? owner.avatar : '',
        seatCount: r.seatCount || (r.seats ? r.seats.length : 0),
        maxPlayers: r.maxPlayers || MAX_SEATS,
        createdAt: r.createdAt || 0,
        // 注意：不要把 seats 整个返回，那会带上别人的 openid
      };
    }),
  };
}

module.exports = {
  createRoom,
  joinRoom,
  leaveRoom,
  roomList,
  roomState,
  myRoom,
  heartbeat,
};
