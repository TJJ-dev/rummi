/**
 * 左上角显示当前用户的昵称。
 *
 * 为什么抽成公共函数：首页、模式选择等多个场景都要用，
 * 每个页面复制一遍的话，以后改样式要改好几处、容易漏。
 * 各场景在 render() 的最后调一次即可。
 */

const theme = require('./theme');

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} app  场景管理器（需要 user / safeTop）
 */
function drawUserBadge(ctx, app) {
  const user = app && app.user;
  if (!user || !user.nickname) return; // 没登录 / 没昵称就不画，调用方不用判断

  const top = (app.safeTop || 0) + 12; // 必须避开刘海

  // 这几行要自己设完整，不能依赖调用方留下的状态：
  // fillStyle / font / textAlign / textBaseline 都是"全局状态"，会互相影响
  ctx.fillStyle = theme.textDim;
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(user.nickname, 12, top);
}

module.exports = { drawUserBadge };
