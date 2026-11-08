/**
 * 在线对局场景。
 *
 * 复用单机对局的布局、拖牌、草稿和渲染；区别只有三点：
 *   1. game 是服务端下发的只读视图，不在本地改
 *   2. 摸牌 / 出牌是"发请求 → 等服务端校验 → 用新视图覆盖"
 *   3. 每个回合 60 秒，由服务端判定超时，客户端只负责显示倒计时
 *
 * 拖牌时仍然改本地 draft（草稿），点「出牌」才把整张桌面提交上去。
 * 这样玩家可以自由重排，而服务端只需要校验最终结果。
 */

const GameScene = require('./game-scene');
const { hitTest } = require('../widgets');
const draftUtil = require('./board-draft');
const roomApi = require('../../net/room');

const POLL_INTERVAL = 1.5; // 秒；回合制不需要更密

class OnlineGameScene extends GameScene {
  constructor(app, roomId, view) {
    const count = view && view.players ? view.players.length : 4;
    super(app, count);

    this.online = true;
    this.roomId = roomId;
    this.myIndex = view && view.mySeat != null ? view.mySeat : 0;
    this.busy = false;       // 一次只允许一个摸牌/出牌请求
    this.polling = false;
    this.pollTimer = 0;
    this._lastVersion = -1;

    this._applyView(view);
  }

  /** 对局结束后，单机是"再来一局"，联机是回房间大厅 */
  newGame() {
    if (this.online) {
      this.app.goRoomLobby();
      return;
    }
    super.newGame();
  }

  isHumanTurn() {
    return !!this.game && this.game.current === this.myIndex && this.game.turnState !== 'over';
  }

  /* ----------------------------- 服务端视图 ----------------------------- */

  _applyView(view) {
    if (!view) return;

    const version = view.version == null ? 0 : view.version;
    this.myIndex = view.mySeat == null ? this.myIndex : view.mySeat;
    this.game = view;
    this.playerCount = view.players ? view.players.length : this.playerCount;

    // 版本变化 = 服务端状态真的变了，重建草稿。
    // 版本没变就别动，否则每 1.5 秒轮询一次会把玩家正在拖的牌重置掉。
    if (version !== this._lastVersion) {
      this._lastVersion = version;
      this.draft = draftUtil.createDraft(this.game, this.myIndex, this.L);
      this.selected = [];
      this.drag = null;
    }

    // 用服务端给的"剩余毫秒"换算，避免手机时钟和服务器不一致导致倒计时乱跳
    const endsAt = view.turnLeftMs != null
      ? Date.now() + Number(view.turnLeftMs || 0)
      : (Number(view.turnEndsAt) || Date.now());
    this.turnEndsAtLocal = endsAt;
    this.timeLeft = Math.max(0, (endsAt - Date.now()) / 1000);
    this.turnOwner = view.current;

    const players = view.players || [];
    if (view.turnState === 'over') {
      const winner = players[view.winner];
      this.message = view.winner === this.myIndex
        ? '你出完手牌，获胜！'
        : (winner ? winner.name + ' 获胜' : '对局结束');
    } else if (view.current === this.myIndex) {
      const me = players[this.myIndex];
      this.message = me && me.hasMelded
        ? '轮到你了：拖牌出牌，或点「摸牌」'
        : '轮到你了：首出需 30 分，也可以先摸牌';
    } else {
      const cur = players[view.current];
      this.message = '等待 ' + (cur ? cur.name : '其他玩家') + ' 行动…';
    }
  }

  /* ----------------------------- 请求 ----------------------------- */

  _onButton(id) {
    if (this.busy || !this.isHumanTurn()) return;
    if (id === 'draw') this._sendDraw();
    else if (id === 'play') this._sendPlay();
  }

  async _sendDraw() {
    if (this.game.turnState !== 'await-draw') {
      this.message = '本回合已经摸过牌了';
      return;
    }

    this.busy = true;
    this.message = '摸牌中…';
    try {
      const res = await roomApi.onlineDraw(this.roomId);
      if (this.app.scene !== this) return;
      if (!res || !res.ok) {
        this.message = (res && res.error) || '摸牌失败';
        if (res && res.game) this._applyView(res.game);
        return;
      }
      this._applyView(res.game);
    } catch (err) {
      this.message = err.message || '网络异常';
    } finally {
      this.busy = false;
    }
  }

  async _sendPlay() {
    const tableMelds = draftUtil.groupIds(this.draft);
    this.busy = true;
    this.message = '校验出牌中…';
    try {
      const res = await roomApi.onlinePlay(this.roomId, tableMelds);
      if (this.app.scene !== this) return;
      if (!res || !res.ok) {
        // 校验失败时保留玩家的摆放，方便直接改
        this.message = (res && res.error) || '出牌失败';
        return;
      }
      this._applyView(res.game);
    } catch (err) {
      this.message = err.message || '网络异常';
    } finally {
      this.busy = false;
    }
  }

  async _poll() {
    if (this.polling || this.busy) return;
    this.polling = true;
    try {
      const res = await roomApi.onlineState(this.roomId);
      if (this.app.scene !== this) return;
      if (!res || !res.ok) {
        if (res && res.error === '你不在这个房间里') this.app.goRoomLobby();
        return;
      }
      if (res.game) this._applyView(res.game);
    } catch (err) {
      // 单次轮询失败不打断对局，下一次继续
    } finally {
      this.polling = false;
    }
  }

  /* ----------------------------- 交互 ----------------------------- */

  onTouchEnd(x, y) {
    // 有牌在拖：先交给父类完成落点判断
    if (this.drag) {
      super.onTouchEnd(x, y);
      return;
    }

    if (hitTest(this.L.backBtn, x, y)) {
      if (this.game && this.game.turnState === 'over') {
        this.app.goRoomLobby();
        return;
      }
      if (typeof wx !== 'undefined' && wx.showModal) {
        wx.showModal({
          title: '离开对局？',
          content: '对局会继续，轮到你超时后会自动摸牌。',
          success: (r) => {
            if (r.confirm) this.app.goRoomLobby();
          },
        });
      } else {
        this.app.goRoomLobby();
      }
      return;
    }

    super.onTouchEnd(x, y);
  }

  update(dt) {
    if (this.game && this.game.turnState !== 'over') {
      const endsAt = this.turnEndsAtLocal || 0;
      this.timeLeft = Math.max(0, (endsAt - Date.now()) / 1000);
    }

    this.pollTimer += dt;
    if (this.pollTimer < POLL_INTERVAL) return;
    this.pollTimer = 0;
    this._poll();
  }

  renderState() {
    const s = super.renderState();
    const players = this.game.players || [];
    const cur = players[this.game.current];
    s.myIndex = this.myIndex;
    s.currentName = cur ? cur.name : '';
    s.online = true;
    return s;
  }
}

module.exports = OnlineGameScene;
