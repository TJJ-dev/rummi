/**
 * 登录场景：启动时自动登录，失败给一个重试按钮。
 *
 * 结构和其它场景一致：constructor(app) / onTouchEnd / update / render。
 * 只有两个状态：'loading' 和 'error'。成功之后直接 goHome()，不需要 'done' 状态。
 */

const theme = require('../theme');
const { drawButton, hitTest } = require('../widgets');
const session = require('../../net/session');

class LoginScene {
  constructor(app) {
    this.app = app;
    this.W = app.W;
    this.H = app.H;
    this.safeTop = app.safeTop || 0;

    this.state = 'loading'; // 'loading' | 'error'
    this.message = '正在登录…';
    this.busy = false;      // 防止连点重试

    this._layout();
    this._doLogin();        // 进场景就自动登录
  }

  _layout() {
    const { W, H } = this;
    const btnW = W * 0.6;
    this.retryBtn = {
      id: 'retry',
      x: (W - btnW) / 2,
      y: H * 0.58,
      w: btnW,
      h: 50,
      label: '重试',
      fontSize: 17,
      enabled: true,
    };
  }

  async _doLogin() {
    if (this.busy) return;
    this.busy = true;
    this.state = 'loading';
    this.message = '正在登录…';

    try {
      const user = await session.login();
      this.app.setUser(user);
      this.app.afterLogin();
    } catch (err) {
      this.state = 'error';
      this.message = err.message; // cloud.js 里已经翻成中文了
      this.busy = false;          // 允许重试
    }
  }

  onTouchEnd(x, y) {
    if (this.state === 'error' && hitTest(this.retryBtn, x, y)) this._doLogin();
  }

  update() {}

  render(ctx) {
    const { W, H } = this;
    const t = this.app.time;

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('拉 密', W / 2, H * 0.32);

    ctx.fillStyle = theme.textDim;
    ctx.font = '14px sans-serif';
    ctx.fillText('Rummikub', W / 2, H * 0.38);

    if (this.state === 'error') {
      ctx.fillStyle = '#ff6b6b';
      ctx.font = '15px sans-serif';
      ctx.fillText(this.message, W / 2, H * 0.47);
      drawButton(ctx, this.retryBtn);
      return;
    }

    // 加载中：文字 + 三个呼吸的小圆点
    ctx.fillStyle = theme.text;
    ctx.font = '15px sans-serif';
    ctx.fillText('正在登录…', W / 2, H * 0.47);

    const cy = H * 0.53;
    for (let i = 0; i < 3; i++) {
      const r = 4 + Math.sin(t * 4 + i * 0.9) * 2;
      ctx.beginPath();
      ctx.arc(W / 2 + (i - 1) * 18, cy, Math.max(2, r), 0, Math.PI * 2);
      ctx.fillStyle = theme.accent;
      ctx.fill();
    }
  }
}

module.exports = LoginScene;
