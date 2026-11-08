/**
 * 房间大厅：房间列表 + 创建 / 快速加入。
 *
 * 房间是公开的：谁能看到列表，谁就能点进去加入。
 * 数据每 2 秒轮询一次（回合制不需要更密）。
 */

const theme = require('../theme');
const { fillRoundRect, roundRect, hitTest, drawButton, drawGhostButton } = require('../widgets');
const { drawUserBadge } = require('../user-badge');
const { drawAvatar } = require('../avatar');
const roomApi = require('../../net/room');

const POLL_INTERVAL = 2; // 秒
const MAX_ROWS = 4;
const ROW_H = 76;
const ROW_GAP = 10;

class RoomLobbyScene {
  constructor(app) {
    this.app = app;
    this.W = app.W;
    this.H = app.H;

    this.state = 'loading'; // 'loading' | 'ready' | 'error'
    this.rooms = [];
    this.myGame = null;
    this.message = '';
    this.busy = false;
    this.pollTimer = 0;

    this._layout();
    this._refresh();
    this._checkMyGame();
  }

  _layout() {
    const { W, H } = this;
    const pad = 12;
    const bw = (W - pad * 3) / 2;
    const by = H * 0.22;

    this.createBtn = {
      id: 'create', x: pad, y: by, w: bw, h: 52,
      label: '创建房间', fontSize: 17, enabled: true,
    };
    this.quickBtn = {
      id: 'quick', x: pad * 2 + bw, y: by, w: bw, h: 52,
      label: '快速加入', fontSize: 17, enabled: true,
    };

    this.listTop = H * 0.33;

    const fw = (W - pad * 3) / 2;
    this.refreshBtn = { id: 'refresh', x: pad, y: H * 0.84, w: fw, h: 46, label: '刷新', fontSize: 16 };
    this.backBtn = { id: 'back', x: pad * 2 + fw, y: H * 0.84, w: fw, h: 46, label: '返回', fontSize: 16 };
  }

  _rowRect(i) {
    return { x: 12, y: this.listTop + i * (ROW_H + ROW_GAP), w: this.W - 24, h: ROW_H };
  }

  /* ----------------------------- 数据 ----------------------------- */

  async _refresh() {
    if (this.busy) return;
    this.busy = true;
    try {
      const res = await roomApi.roomList();
      if (!res || !res.ok) {
        this.state = 'error';
        this.message = (res && res.error) || '加载失败';
        return;
      }
      this.rooms = (res.rooms || []).slice(0, MAX_ROWS);
      this.state = 'ready';
      this.message = this.rooms.length ? '' : '还没有房间，点「创建房间」开一个';
    } catch (err) {
      this.state = 'error';
      this.message = err.message || '网络异常';
    } finally {
      this.busy = false;
    }
  }

  /** 有没有一局还没打完的牌桌可以回去 */
  async _checkMyGame() {
    try {
      const res = await roomApi.myRoom();
      if (!res || !res.ok || !res.room || !res.game) return;
      this.myGame = { roomId: res.room.roomId, game: res.game };
      this.quickBtn.label = '继续对局';
    } catch (err) {
      // 没有进行中的对局很正常，不打扰用户
    }
  }

  async _create() {
    if (this.busy) return;
    this.busy = true;
    this.message = '创建中…';
    try {
      const res = await roomApi.createRoom({});
      if (!res || !res.ok) {
        this.message = (res && res.error) || '创建失败';
        return;
      }
      this.app.goRoomWait(res.room.roomId);
    } catch (err) {
      this.message = err.message || '创建失败';
    } finally {
      this.busy = false;
    }
  }

  async _quickJoin() {
    if (this.myGame) {
      this.app.goOnlineGame(this.myGame.roomId, this.myGame.game);
      return;
    }
    if (this.busy) return;
    this.busy = true;
    this.message = '匹配中…';
    try {
      const list = await roomApi.roomList();
      if (!list || !list.ok) {
        this.message = (list && list.error) || '匹配失败';
        return;
      }

      // 挑人最多的空房：最容易凑够 2 人开局
      const target = (list.rooms || []).slice().sort((a, b) => b.seatCount - a.seatCount)[0];
      if (target) {
        const joined = await roomApi.joinRoom(target.roomId);
        if (!joined || !joined.ok) {
          this.message = (joined && joined.error) || '加入失败';
          return;
        }
        this.app.goRoomWait(target.roomId);
        return;
      }

      // 一个空房都没有 → 自己开一个
      const created = await roomApi.createRoom({});
      if (!created || !created.ok) {
        this.message = (created && created.error) || '创建失败';
        return;
      }
      this.app.goRoomWait(created.room.roomId);
    } catch (err) {
      this.message = err.message || '匹配失败';
    } finally {
      this.busy = false;
    }
  }

  async _join(roomId) {
    if (this.busy) return;
    this.busy = true;
    this.message = '加入中…';
    try {
      const res = await roomApi.joinRoom(roomId);
      if (!res || !res.ok) {
        this.message = (res && res.error) || '加入失败';
        return;
      }
      this.app.goRoomWait(roomId);
    } catch (err) {
      this.message = err.message || '加入失败';
    } finally {
      this.busy = false;
    }
  }

  /* ----------------------------- 交互 ----------------------------- */

  onTouchEnd(x, y) {
    if (hitTest(this.backBtn, x, y)) return this.app.goHome();
    if (hitTest(this.refreshBtn, x, y)) return this._refresh();
    if (hitTest(this.createBtn, x, y)) return this._create();
    if (hitTest(this.quickBtn, x, y)) return this._quickJoin();

    for (let i = 0; i < this.rooms.length; i++) {
      if (hitTest(this._rowRect(i), x, y)) return this._join(this.rooms[i].roomId);
    }
  }

  update(dt) {
    this.pollTimer += dt;
    if (this.pollTimer < POLL_INTERVAL) return;
    this.pollTimer = 0;
    this._refresh();
  }

  /* ----------------------------- 渲染 ----------------------------- */

  render(ctx) {
    const { W, H } = this;

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('在线对战', W / 2, H * 0.13);

    ctx.fillStyle = theme.textDim;
    ctx.font = '13px sans-serif';
    ctx.fillText('2~4 人 · 房间公开，谁都能加入', W / 2, H * 0.13 + 28);

    drawButton(ctx, this.createBtn);
    this.quickBtn.label = this.myGame ? '继续对局' : '快速加入';
    drawGhostButton(ctx, this.quickBtn);

    if (this.state === 'loading') {
      ctx.fillStyle = theme.textDim;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('加载中…', W / 2, this.listTop + 60);
    } else if (this.rooms.length === 0) {
      ctx.fillStyle = theme.textDim;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.message || '还没有房间', W / 2, this.listTop + 60);
    } else {
      for (let i = 0; i < this.rooms.length; i++) {
        this._renderRow(ctx, this.rooms[i], this._rowRect(i));
      }
      if (this.message) {
        ctx.fillStyle = '#ff6b6b';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.message, W / 2, this.listTop - 14);
      }
    }

    drawGhostButton(ctx, this.refreshBtn);
    drawGhostButton(ctx, this.backBtn);

    drawUserBadge(ctx, this.app);
  }

  _renderRow(ctx, room, r) {
    fillRoundRect(ctx, r.x, r.y, r.w, r.h, 12, theme.panel);

    const ar = 22;
    drawAvatar(ctx, r.x + 16, r.y + (r.h - ar * 2) / 2, ar, room.ownerName, room.ownerName);

    const tx = r.x + 16 + ar * 2 + 14;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(room.ownerName + ' 的房', tx, r.y + r.h / 2 - 13);

    ctx.fillStyle = theme.textDim;
    ctx.font = '12px sans-serif';
    ctx.fillText('房间 ' + room.roomId, tx, r.y + r.h / 2 + 13);

    ctx.textAlign = 'right';
    ctx.fillStyle = room.seatCount >= room.maxPlayers ? '#ff6b6b' : theme.accent;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(room.seatCount + '/' + room.maxPlayers, r.x + r.w - 18, r.y + r.h / 2);
  }
}

module.exports = RoomLobbyScene;
