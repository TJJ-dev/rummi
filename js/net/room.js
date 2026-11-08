/**
 * 房间 API 封装。
 *
 * 所有房间操作都走 action 云函数，用 type 区分。
 * 这里只做一层薄封装，业务错误（ok:false）原样返回给调用方处理。
 */

const cloud = require('./cloud');

function call(type, payload, options) {
  return cloud.call('action', { type, payload }, options);
}

module.exports = {
  createRoom: (payload = {}) => call('createRoom', payload),
  roomList: () => call('roomList', {}, { retry: 1 }),
  joinRoom: (roomId) => call('joinRoom', { roomId }, { retry: 1 }),
  leaveRoom: (roomId) => call('leaveRoom', { roomId }, { retry: 1 }),
  roomState: (roomId) => call('roomState', { roomId }, { retry: 1 }),
  myRoom: () => call('myRoom', {}, { retry: 1 }),
  heartbeat: (roomId) => call('heartbeat', { roomId }, { retry: 1 }),
  startGame: (roomId) => call('startGame', { roomId }, { retry: 1 }),
  onlineState: (roomId) => call('onlineState', { roomId }, { retry: 1 }),
  onlineDraw: (roomId) => call('onlineDraw', { roomId }),
  onlinePlay: (roomId, tableMelds) => call('onlinePlay', { roomId, tableMelds }),
};
