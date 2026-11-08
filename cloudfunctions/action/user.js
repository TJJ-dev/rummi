const { db, USERS, MAX_NAME } = require('./db');

async function updateProfile(openid, payload) {
  const nickname = String(payload.nickname || '').trim().slice(0, MAX_NAME);
  if (!nickname) return { ok: false, error: '名字不能为空' };

  const users = db.collection(USERS);
  const now = Date.now();

  try {
    await users.doc(openid).update({
      data: { nickname, updatedAt: now },
    });
  } catch (err) {
    // 记录不存在时补一条（正常流程不会走到，兜底用）
    try {
      await users.add({
        data: {
          _id: openid,
          nickname,
          avatar: '',
          createdAt: now,
          updatedAt: now,
          stats: { games: 0, wins: 0 },
        },
      });
    } catch (err2) {
      return { ok: false, error: '保存失败，请重试' };
    }
  }

  return { ok: true, nickname };
}

module.exports = { updateProfile };