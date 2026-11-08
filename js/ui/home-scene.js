/** 首页场景：标题、开始游戏、玩法说明 */

const theme = require('./theme');
const { drawTile, drawButton, drawGhostButton, hitTest, fillRoundRect } = require('./widgets');
const { drawUserBadge } = require('./user-badge');

const RULES = [
  '1. 牌堆共 106 张：红/橙/蓝/黑 4 色 × 数字 1~13 × 2 套，外加 2 张百搭。',
  '2. 顺子：同颜色、3 张以上连续数字，例如 红5 红6 红7。',
  '3. 刻子：同数字、3~4 张不同颜色，例如 红7 蓝7 黑7。',
  '4. 首次出牌：该回合打出的所有牌组，非百搭点数之和需 ≥ 30。',
  '5. 每回合先摸一张牌，再决定出牌或结束回合。',
  '6. 百搭（★）可替代任意一张牌，但不能单独成组、也不计入首出点数。',
];

/** 按最大宽度把一段文本折行 */
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const DEMO_TILES = [
  { color: 'red', number: 5, isJoker: false },
  { color: 'blue', number: 6, isJoker: false },
  { color: 'orange', number: 7, isJoker: false },
  { color: 'black', number: 7, isJoker: false },
  { color: 'joker', number: 0, isJoker: true },
];

class HomeScene {
  constructor(app) {
    this.app = app;
    this.W = app.W;
    this.H = app.H;
    this.showRules = false;
    this._layout();
  }

  _layout() {
    const { W, H } = this;
    const btnW = W * 0.7;
    const btnX = (W - btnW) / 2;

    this.startBtn = {
      id: 'start',
      x: btnX,
      y: H * 0.60,
      w: btnW,
      h: 54,
      label: '开始游戏',
      fontSize: 19,
      enabled: true,
    };
    this.rulesBtn = {
      id: 'rules',
      x: btnX,
      y: H * 0.60 + 72,
      w: btnW,
      h: 46,
      label: '玩法说明',
      fontSize: 16,
    };

    this.panel = { x: 20, y: H * 0.12, w: W - 40, h: H * 0.72 };
    this.closeBtn = {
      id: 'close',
      x: W / 2 - 90,
      y: this.panel.y + this.panel.h - 68,
      w: 180,
      h: 46,
      label: '返回',
      fontSize: 16,
    };
  }

  onTouchEnd(x, y) {
    if (this.showRules) {
      if (hitTest(this.closeBtn, x, y)) this.showRules = false;
      return;
    }
    if (hitTest(this.startBtn, x, y)) {
      this.app.goMode(); // 先进入模式选择，不直接开局
      return;
    }
    if (hitTest(this.rulesBtn, x, y)) this.showRules = true;
  }

  update() {}

  render(ctx) {
    const { W, H } = this;
    const t = this.app.time;

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    // 标题
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('拉 密', W / 2, H * 0.2);

    ctx.fillStyle = theme.textDim;
    ctx.font = '14px sans-serif';
    ctx.fillText('Rummikub · 数字牌推理对战', W / 2, H * 0.27);

    // 演示牌（轻微上下浮动）
    const tw = 36;
    const th = 48;
    const gap = 8;
    const totalW = DEMO_TILES.length * (tw + gap) - gap;
    let x = (W - totalW) / 2;
    const baseY = H * 0.35;
    for (let i = 0; i < DEMO_TILES.length; i++) {
      const bob = Math.sin(t * 2 + i * 0.6) * 4;
      drawTile(ctx, DEMO_TILES[i], x, baseY + bob, tw, th, false);
      x += tw + gap;
    }

    ctx.fillStyle = theme.text;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('2~4 人一桌，每人 14 张牌', W / 2, H * 0.47);
    ctx.fillStyle = theme.textDim;
    ctx.fillText('凑顺子、凑刻子，先出完手牌者获胜', W / 2, H * 0.47 + 24);

    drawButton(ctx, this.startBtn);
    drawGhostButton(ctx, this.rulesBtn);

    // 右上角昵称。放在弹窗之前，这样打开"玩法说明"时会被盖住，不会浮在弹窗上
    drawUserBadge(ctx, this.app);

    if (this.showRules) this._renderRules(ctx);
  }

  _renderRules(ctx) {
    const { W, H } = this;
    const p = this.panel;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
    ctx.fillRect(0, 0, W, H);

    fillRoundRect(ctx, p.x, p.y, p.w, p.h, 14, theme.bgDark);

    ctx.fillStyle = theme.accent;
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('玩法说明', W / 2, p.y + 34);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '13px sans-serif';
    ctx.fillStyle = theme.text;

    let y = p.y + 66;
    const maxWidth = p.w - 40;
    for (const rule of RULES) {
      const lines = wrapText(ctx, rule, maxWidth);
      for (const line of lines) {
        ctx.fillText(line, p.x + 20, y);
        y += 21;
      }
      y += 8;
    }

    drawButton(ctx, this.closeBtn);
  }
}

module.exports = HomeScene;
