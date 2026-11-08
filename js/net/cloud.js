/**
 * 云函数调用封装。
 *
 * 解决三个问题：
 *   1. wx.cloud.callFunction 是回调式的 → 包成 Promise，业务代码里就能写 await
 *   2. 没有超时，弱网下会一直挂着 → 加一个超时兜底
 *   3. 失败信息是一串英文 errMsg → 翻译成能直接显示给用户的中文
 */

/**
 * 调一个云函数。
 * @param {string} name  云函数名，比如 'login'
 * @param {object} data  入参
 * @param {{timeout?: number, retry?: number}} options
 *        timeout 超时毫秒数，默认 8000；retry 失败后重试次数，默认 0
 * @returns {Promise<any>} 云函数返回的 result
 */
function call(name, data = {}, { timeout = 8000, retry = 0 } = {}) {
  const request = new Promise((resolve, reject) => {
    // settled 保证"超时"和"回调"只会有一个生效，不会重复 resolve/reject
    let settled = false;
    let timer = null;

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('网络超时，请检查网络后重试'));
    }, timeout);

    wx.cloud.callFunction({
      name,
      data,
      success: (res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(res.result);
      },
      fail: (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const raw = (err && err.errMsg) || String(err);
        console.warn('[cloud] ' + name + ' 调用失败：' + raw);
        reject(new Error(mapError(err)));
      },
    });
  });

  return request.catch((err) => {
    // 只读接口和幂等接口（加入房间/开局）可以安全重试。
    // 摸牌、出牌绝不能自动重试：第一次可能已经成功，只是响应超时，
    // 再调一次会导致重复摸牌或重复结算。
    if (retry > 0 && /超时/.test(err.message)) {
      return call(name, data, { timeout, retry: retry - 1 });
    }
    throw err;
  });
}

/** 把微信的英文错误翻成中文提示（顺便帮你定位配置问题） */
function mapError(err) {
  const msg = (err && err.errMsg) || String(err);
  if (msg.includes('FunctionName parameter could not be found')) {
    return '云函数还没部署，请先上传 login';
  }
  if (msg.includes('Invoking task timed out') || msg.includes('-504002')) {
    return '云函数响应超时，请重试';
  }
  if (msg.includes('Environment not found') || msg.includes('env')) {
    return '云开发环境 ID 不对，检查 js/net/config.js';
  }
  if (msg.includes('timeout')) return '网络超时，请重试';
  if (msg.includes('collection not exists')) return '数据库集合不存在，去控制台新建 users';
  return '网络异常：' + msg;
}

module.exports = { call, mapError };
