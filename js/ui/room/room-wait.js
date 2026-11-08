/**
 * 房间等待页：4 个座位 + 邀请好友 + 开始游戏。
 *
 * 座位号 = 对局里的玩家编号。
 * 每 2 秒拉一次房态，每 10 秒发一次心跳（用于掉线检测）。
 */

const theme = require('../theme');
const { fillRoundRect, roundRect, hitTest, drawButton, drawGhostButton } = require('../widgets');
const { drawUserBadge } = require('../user-badge');
const { drawAvatar } = require('../avatar');
const roomApi = require('../../net/room');

const POLL_INTERVAL = 2;
const HEARTBEAT_INTERVAL = 10;
const MAX_SEATS = 4;

class RoomWaitScene {
  constructor(app, roomId) {
    this.app = app;
    this.W = app.W;
    this.H = app.H;
    this.roomId = roomId;

    this.room = null;
    this.message = '';
    this.busy = false;
    this.enteredGame = false;
    this.pollTimer = 0;
    this.heartbeatTimer = 0;

    this._layout();
    this._bindShare();
    this._refresh();
  }

  _layout() {
    const { W, H } = this;
    const pad = 12;
    const gap = 12;
    const cw = (W - pad * 2 - gap) / 2;
    const ch = 110;
    const top = H * 0.20;

    this.seatRects = [
      { x: pad, y: top, w: cw, h: ch },
      { x: pad * 2 + cw, y: top, w: cw, h: ch },
      { x: pad, y: top + ch + gap, w: cw, h: ch },
      { x: pad * 2 + cw, y: top + ch + gap, w: cw, h: ch },
    ];

    const bw = W - pad * 2;
    this.inviteBtn = {
      id: 'invite', x: pad, y: H * 0.60, w: bw, h: 52,
      label: '邀请好友', fontSize: 17, enabled: true,
    };
    this.startBtn = {
      id: 'start', x: pad, y: H * 0.70, w: bw, h: 52,
      label: '开始游戏', fontSize: 18, enabled: true,
    };
    this.leaveBtn = {
      id: 'leave', x: W / 2 - 90, y: H * 0.80, w: 180, h: 44,
      label: '离开房间', fontSize: 15,
    };
  }

  /** 转发（右上角菜单 + 主动调用都走这里） */
  _bindShare() {
    this._onShare = () => ({
      title: '来和我打拉密！房间 ' + this.roomId,
      query: 'roomId=' + this.roomId,
    });

    if (typeof wx.onShareAppMessage === 'function') wx.onShareAppMessage(this._onShare);
    if (typeof wx.showShareMenu === 'function') wx.showShareMenu({ withShareTicket: false });
  }

  _invite() {
    const payload = {
      title: '来和我打拉密！房间 ' + this.roomId,
      query: 'roomId=' + this.roomId,
    };
    if (typeof wx.shareAppMessage === 'function') wx.shareAppMessage(payload);
    else this.message = '当前环境不支持转发';
  }

  async _refresh() {
    if (this.busy || this.enteredGame) return;
    this.busy = true;
    try {
      const res = await roomApi.roomState(this.roomId);
      if (this.app.scene !== this) return; // 已经离开这个页面，别再用旧响应跳转
      if (!res || !res.ok) {
        // 被移出 / 房间被关 → 回大厅
        if (res && res.error === '你不在这个房间里') {
          this.app.goRoomLobby();
          return;
        }
        this.message = (res && res.error) || '加载失败';
        return;
      }
      this.room = res.room;
      if (res.room.status === 'playing' && res.game) {
        this.enteredGame = true;
        this.app.goOnlineGame(this.roomId, res.game);
        return;
      }
    } catch (err) {
      this.message = err.message || '网络异常';
    } finally {
      this.busy = false;
    }
  }

  async _leave() {
    if (this.busy) return;
    this.busy = true;
    try {
      await roomApi.leaveRoom(this.roomId);
    } catch (err) {
      /* 离开失败也照样回大厅 */
    }
    this.app.goRoomLobby();
  }

  async _start() {
    const room = this.room;
    if (!room) return;
    if (!room.isOwner) {
      this.message = '只有房主能开始';
      return;
    }
    if (room.seatCount < 2) {
      this.message = '至少 2 人才能开始';
      return;
    }
    if (this.busy) return;

    this.busy = true;
    this.message = '正在开局…';
    try {
      const res = await roomApi.startGame(this.roomId);
      if (this.app.scene !== this) return;
      if (!res || !res.ok) {
        this.message = (res && res.error) || '开局失败';
        return;
      }
      this.enteredGame = true;
      this.app.goOnlineGame(this.roomId, res.game);
    } catch (err) {
      this.message = err.message || '开局失败';
    } finally {
      this.busy = false;
    }
  }

  onTouchEnd(x, y) {
    if (hitTest(this.leaveBtn, x, y)) return this._leave();
    if (hitTest(this.inviteBtn, x, y)) return this._invite();
    if (hitTest(this.startBtn, x, y)) return this._start();
  }

  update(dt) {
    this.pollTimer += dt;
    if (this.pollTimer >= POLL_INTERVAL) {
      this.pollTimer = 0;
      this._refresh();
    }

    this.heartbeatTimer += dt;
    if (this.heartbeatTimer >= HEARTBEAT_INTERVAL) {
      this.heartbeatTimer = 0;
      roomApi.heartbeat(this.roomId).catch(() => {});
    }
  }

  render(ctx) {
    const { W, H } = this;

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('房间 ' + this.roomId, W / 2, H * 0.10);

    const room = this.room;
    const seats = (room && room.seats) || [];

    for (let i = 0; i < MAX_SEATS; i++) {
      this._renderSeat(ctx, this.seatRects[i], seats[i], i);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.textDim;
    ctx.font = '14px sans-serif';
    const n = seats.length;
    ctx.fillText(
      '在线 ' + n + '/' + MAX_SEATS + (n >= 2 ? ' · 可以开始' : ' · 至少 2 人'),
      W / 2,
      H * 0.545
    );

    if (this.message) {
      ctx.fillStyle = theme.accent;
      ctx.font = '14px sans-serif';
      ctx.fillText(this.message, W / 2, H * 0.575);
    }

    drawButton(ctx, this.inviteBtn);
    drawButton(ctx, {
      ...this.startBtn,
      enabled: !!(room && room.isOwner && n >= 2),
    });
    drawGhostButton(ctx, this.leaveBtn);

    drawUserBadge(ctx, this.app);
  }

  _renderSeat(ctx, rect, seat, index) {
    if (!seat) {
      fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12, 'rgba(0, 0, 0, 0.14)');
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('空位', rect.x + rect.w / 2, rect.y + rect.h / 2);
      return;
    }

    fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12, 'rgba(0, 0, 0, 0.28)');

    const ar = 24;
    drawAvatar(ctx, rect.x + 16, rect.y + 14, ar, seat.nickname, seat.nickname);

    const tx = rect.x + 16 + ar * 2 + 12;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = seat.online ? '#ffffff' : 'rgba(255, 255, 255, 0.45)';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(seat.nickname, tx, rect.y + 14 + ar);

    const tags = [];
    if (seat.isMe) tags.push('我');
    if (this.room && this.room.ownerSeat === index) tags.push('房主');
    if (!seat.online) tags.push('掉线');
    if (tags.length) {
      ctx.fillStyle = seat.online ? theme.accent : '#ff6b6b';
      ctx.font = '12px sans-serif';
      ctx.fillText(tags.join(' · '), tx, rect.y + 14 + ar + 22);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '11px sans-serif';
    ctx.fillText('座位 ' + (index + 1), rect.x + 16, rect.y + rect.h - 14);
  }
}

module.exports = RoomWaitScene;
