/**
 * 登录态。
 *
 * 缓存里存的只是一份"展示用的副本"（openid / 昵称 / 头像）。
 * 真正的身份永远由云函数用 cloud.getWXContext() 判定，
 * 客户端不需要证明自己是谁，也不该把 openid 当令牌用。
 */

const cloud = require('./cloud');

const KEY = 'rammi:user';
let cached = null;

/** 读本地缓存（同步、不联网） */
function getUser() {
  if (cached) return cached;
  try {
    cached = wx.getStorageSync(KEY) || null;
  } catch (err) {
    cached = null; // 存储读失败不能影响游戏启动
  }
  return cached;
}

/** 写本地缓存 + 内存缓存 */
function setUser(user) {
  cached = user;
  try {
    wx.setStorageSync(KEY, user);
  } catch (err) {
    /* 存储写失败静默忽略，不影响本次会话 */
  }
}

/** 调云函数登录：拿 openid，并保证 users 集合里有这条记录 */
async function login() {
  const res = await cloud.call('login', {});
  const user = {
    ...res.user,
    openid: res.openid,
    isNew: res.isNew,
  };
  setUser(user);
  return user;
}

/**
 * 改昵称。
 *
 * 顺序很关键：**先存服务器，成功了再更新本地缓存**。
 * 如果反过来（先本地后服务器），服务器那一步失败时本地已经"改名成功"了，
 * 下次启动又从服务器拉回旧名字，用户会觉得"名字自己变回去了"。
 */
async function updateProfile({ nickname }) {
  const res = await cloud.call('action', {
    type: 'updateProfile',
    payload: { nickname },
  });
  if (!res || !res.ok) throw new Error((res && res.error) || '保存失败，请重试');

  const user = { ...getUser(), nickname: res.nickname };
  setUser(user);
  return user;
}

/** 清掉登录态（调试用，或者以后做"退出登录"） */
function clear() {
  cached = null;
  try {
    wx.removeStorageSync(KEY);
  } catch (err) {
    /* 忽略 */
  }
}

module.exports = { getUser, setUser, login, updateProfile, clear };
