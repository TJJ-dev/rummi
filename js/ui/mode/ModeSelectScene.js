/**
 * 模式选择场景：选人数，或者进入在线对战。
 *
 * 和其他场景一样，只做三件事：布局、处理触摸、绘制。
 * 场景之间不互相认识，切换一律通过 this.app 的方法。
 */

const theme = require('../theme');
const { drawGhostButton, roundRect, fillRoundRect, hitTest } = require('../widgets');
const { drawUserBadge } = require('../user-badge');

// 牌堆张数 = 106 - 每人 14 张 × 人数
const MODES = [
  { players: 2, title: '双人对战', desc: '你和 1 个电脑 · 牌堆 78 张' },
  { players: 3, title: '三人对战', desc: '你和 2 个电脑 · 牌堆 64 张' },
  { players: 4, title: '四人对战', desc: '你和 3 个电脑 · 牌堆 50 张' },
  { id: 'online', online: true, title: '在线对战', desc: '和真人一起玩 · 2~4 人' },
];

class ModeSelectScene {
  constructor(app) {
    this.app = app;
    this.W = app.W;
    this.H = app.H;
    this._layout();
  }

  _layout() {
    const { W, H } = this;
    const cardW = W * 0.8;
    const cardX = (W - cardW) / 2;
    // 4 张卡要压一下尺寸，否则会和返回按钮撞
    const cardH = 72;
    const gap = 14;
    const startY = H * 0.24;

    this.cards = MODES.map((m, i) => ({
      id: m.id || `mode${m.players}`,
      online: !!m.online,
      players: m.players,
      title: m.title,
      desc: m.desc,
      x: cardX,
      y: startY + i * (cardH + gap),
      w: cardW,
      h: cardH,
    }));

    this.backBtn = {
      id: 'back',
      x: W / 2 - 90,
      y: H * 0.82,
      w: 180,
      h: 46,
      label: '返回',
      fontSize: 16,
    };
  }

  onTouchEnd(x, y) {
    if (hitTest(this.backBtn, x, y)) {
      this.app.goHome();
      return;
    }
    for (const c of this.cards) {
      if (hitTest(c, x, y)) {
        if (c.online) this.app.goRoomLobby();
        else this.app.startGame(c.players);
        return;
      }
    }
  }

  update() {}

  render(ctx) {
    const { W, H } = this;

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('选择模式', W / 2, H * 0.14);

    ctx.fillStyle = theme.textDim;
    ctx.font = '13px sans-serif';
    ctx.fillText('人机对战 · 你坐 0 号位先手', W / 2, H * 0.14 + 30);

    for (const c of this.cards) {
      const bg = c.online ? theme.accent : theme.buttonGhost;
      const titleColor = c.online ? '#0b3d26' : '#ffffff';
      const descColor = c.online ? 'rgba(11, 61, 38, 0.78)' : theme.textDim;

      fillRoundRect(ctx, c.x, c.y, c.w, c.h, 14, bg);
      roundRect(ctx, c.x, c.y, c.w, c.h, 14);
      ctx.lineWidth = 1;
      ctx.strokeStyle = c.online ? 'rgba(0, 0, 0, 0.15)' : '#4f7f66';
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = titleColor;
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(c.title, c.x + 24, c.y + c.h / 2 - 11);

      ctx.fillStyle = descColor;
      ctx.font = '13px sans-serif';
      ctx.fillText(c.desc, c.x + 24, c.y + c.h / 2 + 13);

      ctx.textAlign = 'right';
      ctx.fillStyle = c.online ? '#0b3d26' : theme.accent;
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('›', c.x + c.w - 24, c.y + c.h / 2);
    }

    drawGhostButton(ctx, this.backBtn);

    // 左上角昵称，放在最后避免被卡片循环改过的状态影响
    drawUserBadge(ctx, this.app);
  }
}

module.exports = ModeSelectScene;
