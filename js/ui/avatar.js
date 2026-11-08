/**
 * 文字头像：昵称首字 + 由种子派生的固定颜色。
 *
 * 为什么不用真实头像：微信小游戏拿不到微信头像（getUserInfo 已匿名化），
 * 文字头像是零资源、永远可用的方案。
 * 以后要真头像时，只要让 avatar 字段存云存储 fileID，这个函数仍可作为兜底。
 */

const COLORS = ['#e0483f', '#e08a1e', '#3a72d6', '#2f3540', '#8b45c9', '#12894c'];

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * 画一个圆形文字头像。
 * @param {number} x 左上角 x
 * @param {number} y 左上角 y
 * @param {number} r 半径
 * @param {string} nickname 昵称
 * @param {string} seed 颜色种子（同一个人应始终传同一个值）
 */
function drawAvatar(ctx, x, y, r, nickname, seed) {
  const key = String(seed || nickname || '?');
  const color = COLORS[hash(key) % COLORS.length];

  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(r)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((nickname || '?').slice(0, 1), x + r, y + r + 1);
}

module.exports = { drawAvatar };
