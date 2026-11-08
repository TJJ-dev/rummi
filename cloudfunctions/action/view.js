const { MAX_SEATS } = require('./db');

// 心跳超过这个时间没更新，就算掉线
const OFFLINE_MS = 30000;

/** 房间的唯一出口：所有返回给客户端的房间数据都走这里，天然不含 openid */
function publicRoom(room, viewerOpenid) {
  const max = room.maxPlayers || MAX_SEATS;
  const now = Date.now();
  const presence = room.presence || {};
  const raw = room.seats || [];

  const seats = raw.map((s, i) => {
    // 取"心跳时间 / 加入时间"里最新的那个，判断是否掉线
    const seen = Math.max(presence[s.openid] || 0, s.lastSeenAt || 0, s.joinedAt || 0);

    return {
      seat: i, // 座位号 = 对局里的玩家编号
      nickname: s.nickname || '玩家',
      avatar: s.avatar || '',
      isMe: s.openid === viewerOpenid,
      online: seen > 0 ? now - seen < OFFLINE_MS : true,
    };
  });

  return {
    roomId: room._id,
    status: room.status,
    version: room.version,
    maxPlayers: max,
    seatCount: seats.length,
    isFull: seats.length >= max,
    isOwner: room.ownerOpenid === viewerOpenid,
    // 房主在第几个座位：等待页要给那一格标"房主"
    ownerSeat: raw.findIndex((s) => s.openid === room.ownerOpenid),
    seats,
  };
}

module.exports = { publicRoom, OFFLINE_MS };
