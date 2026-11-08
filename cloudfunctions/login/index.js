/**
 * 登录云函数：拿到调用者的 openid，并保证 users 集合里有这条记录。
 *
 * 为什么客户端不用传任何凭证：
 *   云函数里 cloud.getWXContext().OPENID 是微信平台保证的，
 *   伪造不了、也不需要 appid/secret，不存在密钥泄漏问题。
 *
 * 返回：{ openid, appid, unionid, isNew, user }
 */

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const USERS = 'users';

/** 集合不存在时自动建一个（第一次跑会很省事） */
async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (err) {
    // 已经存在会抛错，忽略即可
  }
}

exports.main = async () => {
  const { OPENID, APPID, UNIONID } = cloud.getWXContext();

  await ensureCollection(USERS);
  const users = db.collection(USERS);

  // 查这个用户，没有就建一条
  let user = null;
  try {
    const res = await users.doc(OPENID).get();
    user = res.data;
  } catch (err) {
    user = null; // 文档不存在会抛错，当作新用户
  }

  const base = {
    openid: OPENID,
    appid: APPID,
    unionid: UNIONID || '',
  };

  if (user) {
    return { ...base, isNew: false, user };
  }

  const now = Date.now();
  const doc = {
    _id: OPENID, // 直接用 openid 当主键，天然唯一
    nickname: '',
    avatar: '',
    createdAt: now,
    updatedAt: now,
    stats: { games: 0, wins: 0 },
  };

  try {
    await users.add({ data: doc });
  } catch (err) {
    // 并发时可能已经被建过，忽略
  }

  return { ...base, isNew: true, user: doc };
};
