/** 通用绘制工具：圆角矩形、牌、按钮、点击命中判定 */

const theme = require('./theme');

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, color) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

/** 画一张牌 */
function drawTile(ctx, tile, x, y, w, h, selected) {
  const color = theme.tileColors[tile.color] || theme.tileColors.black;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  fillRoundRect(ctx, x, y, w, h, theme.radius, color);
  ctx.restore();

  roundRect(ctx, x, y, w, h, theme.radius);
  ctx.lineWidth = selected ? 3 : 1;
  ctx.strokeStyle = selected ? theme.accent : theme.tileBorder;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (tile.isJoker) {
    ctx.font = `bold ${Math.floor(h * 0.42)}px sans-serif`;
    ctx.fillText('★', x + w / 2, y + h / 2);
  } else {
    ctx.font = `bold ${Math.floor(h * 0.5)}px sans-serif`;
    ctx.fillText(String(tile.number), x + w / 2, y + h / 2);
  }
}

/** 画一个按钮（btn 需要 { x, y, w, h, label, enabled }） */
function drawButton(ctx, btn) {
  const enabled = btn.enabled !== false;
  fillRoundRect(
    ctx,
    btn.x,
    btn.y,
    btn.w,
    btn.h,
    10,
    enabled ? theme.button : theme.buttonDisabled
  );
  ctx.fillStyle = enabled ? theme.buttonText : theme.textDim;
  ctx.font = `bold ${btn.fontSize || 16}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
}

/** 画一个描边按钮（次要操作） */
function drawGhostButton(ctx, btn) {
  fillRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10, theme.buttonGhost);
  roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#4f7f66';
  ctx.stroke();
  ctx.fillStyle = theme.textDim;
  ctx.font = `${btn.fontSize || 16}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
}

function hitTest(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

module.exports = {
  roundRect,
  fillRoundRect,
  drawTile,
  drawButton,
  drawGhostButton,
  hitTest,
};
