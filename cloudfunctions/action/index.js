const { cloud } = require('./db');
const user = require('./user');
const room = require('./room');
const online = require('./online');

const HANDLERS = {
  updateProfile: user.updateProfile,
  createRoom: room.createRoom,
  roomList: room.roomList,
  joinRoom: room.joinRoom,
  leaveRoom: room.leaveRoom,
  roomState: room.roomState,
  myRoom: room.myRoom,
  heartbeat: room.heartbeat,
  startGame: online.startGame,
  onlineState: online.onlineState,
  onlineDraw: online.onlineDraw,
  onlinePlay: online.onlinePlay,
};

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { type, payload = {} } = event || {};

  const handler = HANDLERS[type];
  if (!handler) return { ok: false, error: '未知操作：' + type };

  try {
    return await handler(OPENID, payload);
  } catch (err) {
    console.error('[action] ' + type + ' failed', err);
    return { ok: false, error: '服务器异常：' + (err.message || err) };
  }
};
