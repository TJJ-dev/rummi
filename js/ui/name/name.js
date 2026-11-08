/**
 * 取名字页。
 *
 * 首次登录（或昵称为空）时进入，填完存回服务器，然后回首页。
 *
 * 小游戏没有 <input> 组件，输入的唯途径是 wx.showKeyboard 弹系统键盘，
 * 我们在 canvas 上自己画一个"看起来像输入框"的东西显示用户输入的内容。
 */

const theme = require('../theme');
const { drawButton, hitTest, fillRoundRect } = require('../widgets');
const session = require('../../net/session');

const MAX_LEN = 12;

class NameScene {
  constructor(app) {
    this.app = app;
    this.W = app.W;
    this.H = app.H;
    this.safeTop = app.safeTop || 0;

    // 用已有昵称初始化，不依赖 showKeyboard 的 defaultValue（部分安卓机型不生效）
    this.text = (app.user && app.user.nickname) || '';
    this.keyboardOpen = false;
    this.saving = false;
    this.message = '';

    this._layout();
    this._bindKeyboard();
  }

  _layout() {
    const { W, H } = this;
    // 输入框放在屏幕上半部分，避免被弹出的系统键盘挡住
    this.box = { x: W * 0.1, y: H * 0.30, w: W * 0.8, h: 56 };
    this.confirmBtn = {
      id: 'confirm',
      x: W * 0.1,
      y: H * 0.48,
      w: W * 0.8,
      h: 50,
      label: '确定',
      fontSize: 17,
      enabled: true,
    };
  }

  /* ----------------------------- 键盘 ----------------------------- */

  _bindKeyboard() {
    this._onInput = (res) => {
      this.text = String(res.value || '').slice(0, MAX_LEN);
    };
    this._onConfirm = (res) => {
      // 部分机型点"完成"时 res.value 是空的，回退到已经收到的内容
      this.text = String(res.value || this.text || '').slice(0, MAX_LEN);
      wx.hideKeyboard();
      this._submit();
    };
    this._onComplete = () => {
      this.keyboardOpen = false;
    };

    // 先 off 再 on：这些是全局监听，不清理会越绑越多，一次输入触发多次回调
    this._unbindKeyboard();
    wx.onKeyboardInput(this._onInput);
    wx.onKeyboardConfirm(this._onConfirm);
    wx.onKeyboardComplete(this._onComplete);
  }

  _unbindKeyboard() {
    wx.offKeyboardInput(this._onInput);
    wx.offKeyboardConfirm(this._onConfirm);
    wx.offKeyboardComplete(this._onComplete);
  }

  _openKeyboard() {
    if (this.keyboardOpen) return;
    this.keyboardOpen = true;
    wx.showKeyboard({
      defaultValue: this.text,
      maxLength: MAX_LEN,
      multiple: false,
      confirmType: 'done',
      fail: () => {
        // 安卓部分机型 / 低版本基础库可能弹不出来，让用户点输入框重试
        this.keyboardOpen = false;
        this.message = '键盘打不开，点输入框再试一次';
      },
    });
  }

  /* ----------------------------- 提交 ----------------------------- */

  async _submit() {
    const name = String(this.text || '').trim();
    if (!name) {
      this.message = '名字不能为空';
      return;
    }
    if (this.saving) return;

    this.saving = true;
    this.message = '保存中…';

    try {
      const user = await session.updateProfile({ nickname: name });
      this._unbindKeyboard(); // 离开前把全局监听清掉
      this.app.setUser(user);
      this.app.afterLogin();
    } catch (err) {
      this.saving = false;
      this.message = err.message || '保存失败，请重试';
    }
  }

  /* ----------------------------- 交互 ----------------------------- */

  onTouchEnd(x, y) {
    if (this.saving) return;
    if (hitTest(this.box, x, y)) {
      this._openKeyboard();
      return;
    }
    if (hitTest(this.confirmBtn, x, y)) {
      wx.hideKeyboard();
      this._submit();
    }
  }

  update() {}

  /* ----------------------------- 渲染 ----------------------------- */

  render(ctx) {
    const { W, H } = this;
    const b = this.box;

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    // 标题（每次画文字前都要先设 fillStyle，否则会用上一段的颜色）
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('取个名字', W / 2, H * 0.18);

    // 输入框
    fillRoundRect(ctx, b.x, b.y, b.w, b.h, 12, 'rgba(0, 0, 0, 0.28)');

    // 框里的文字
    const shown = this.text || '点这里输入';
    ctx.fillStyle = this.text ? '#ffffff' : theme.textDim;
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(shown, b.x + 18, b.y + b.h / 2);

    // 闪烁光标（只在键盘打开时闪）
    if (this.keyboardOpen && Math.floor(this.app.time * 2) % 2 === 0) {
      const tw = ctx.measureText(shown).width;
      ctx.fillRect(b.x + 18 + tw + 4, b.y + 16, 2, 24);
    }

    // 字数
    ctx.fillStyle = theme.textDim;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.text.length + '/' + MAX_LEN, b.x + b.w, b.y + b.h + 20);

    // 提示
    if (this.message) {
      ctx.fillStyle = this.message === '保存中…' ? theme.textDim : '#ff6b6b';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.message, W / 2, b.y + b.h + 54);
    }

    // 确认按钮（保存中置灰，防连点）
    drawButton(ctx, { ...this.confirmBtn, enabled: !this.saving });
  }
}

module.exports = NameScene;
