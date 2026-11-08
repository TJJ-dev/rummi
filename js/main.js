/**
 * 小游戏入口：初始化云开发 -> 创建画布 -> 初始化场景 -> 启动渲染循环
 *
 * 这里也是唯一接触 wx.* 的地方：
 * 把屏幕信息（尺寸、安全区）、启动参数和触摸事件翻译成朴素的数据，往下传给 App。
 */

const App = require('./ui/app');
const { ENV_ID } = require('./net/config');
const session = require('./net/session');

// 1. 初始化云开发。必须放在最前面，后面任何用到 wx.cloud 的代码都依赖它。
if (wx.cloud) {
  wx.cloud.init({ env: ENV_ID, traceUser: true });
  console.log('[cloud] 初始化完成，env=' + ENV_ID);
} else {
  console.error('[cloud] 基础库太低，请升级到 2.2.3 以上');
}

function getWindowInfo() {
  if (typeof wx.getWindowInfo === 'function') return wx.getWindowInfo();
  return wx.getSystemInfoSync();
}

// 2. 创建画布
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');

const info = getWindowInfo();
const dpr = info.pixelRatio || 1;
const W = info.windowWidth || info.screenWidth;
const H = info.windowHeight || info.screenHeight;

// 安全区：刘海的顶部高度、底部 Home 指示条的高度。
// 没有 safeArea 信息时按 0 处理（等于没有遮挡）。
const safeArea = info.safeArea || {};
const safeTop = safeArea.top || 0;
const safeBottom = Math.max(0, H - (safeArea.bottom == null ? H : safeArea.bottom));

canvas.width = Math.floor(W * dpr);
canvas.height = Math.floor(H * dpr);
ctx.scale(dpr, dpr);

console.log('[main] 屏幕 ' + W + 'x' + H + ' dpr=' + dpr + ' safeTop=' + safeTop + ' safeBottom=' + safeBottom);

// 3. 读启动参数：从分享卡片进来时会带 roomId
let pendingRoomId = null;
try {
  const launch = typeof wx.getLaunchOptionsSync === 'function' ? wx.getLaunchOptionsSync() : null;
  pendingRoomId = (launch && launch.query && launch.query.roomId) || null;
} catch (err) {
  pendingRoomId = null;
}
if (pendingRoomId) console.log('[room] 分享进入，目标房间 ' + pendingRoomId);

// 4. 读本地登录缓存 —— 必须在 new App() 之前读，
//    因为 App 要根据"有没有缓存"决定进首页还是进登录页。
const cached = session.getUser();
console.log('[login] 本地缓存：' + (cached ? cached.nickname || cached.openid : '无'));

const app = new App({
  ctx,
  width: W,
  height: H,
  safeTop,
  safeBottom,
  user: cached,
  pendingRoomId,
});

// 5. 老用户直接进首页了，这里再后台静默刷新一次用户信息（失败就继续用缓存）
if (cached) {
  session
    .login()
    .then((u) => app.setUser(u))
    .catch((err) => console.warn('[login] 静默刷新失败：' + err.message));
}

// 6. 热启动：从分享卡片切回来时也会带 roomId
if (typeof wx.onShow === 'function') {
  wx.onShow((res) => {
    const roomId = res && res.query && res.query.roomId;
    if (roomId) app.joinRoomFromShare(roomId);
  });
}

function pickTouch(e) {
  if (e.touches && e.touches.length > 0) return e.touches[0];
  if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0];
  return null;
}

wx.onTouchStart((e) => {
  const t = pickTouch(e);
  if (t) app.onTouchStart(t.clientX, t.clientY);
});
wx.onTouchMove((e) => {
  const t = pickTouch(e);
  if (t) app.onTouchMove(t.clientX, t.clientY);
});
wx.onTouchEnd((e) => {
  const t = pickTouch(e);
  if (t) app.onTouchEnd(t.clientX, t.clientY);
});

let last = Date.now();
function loop() {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000); // 秒，封顶 0.1 防跳帧
  last = now;
  app.update(dt);
  app.render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
