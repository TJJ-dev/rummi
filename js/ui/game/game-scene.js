/**
 * 对局场景：只做"编排" —— 持有状态、驱动回合、把触摸事件分派下去。
 *
 * 具体实现拆在四个模块里：
 *   board-layout.js   坐标计算（纯函数）
 *   board-draft.js    草稿数据（纯函数）
 *   game-input.js     命中判定（纯函数）
 *   game-renderer.js  绘制
 *
 * 数据分两层：
 *   game  —— 权威对局状态，只能通过 core 的方法改（draw / submitMove / endTurn）
 *   draft —— 玩家正在编辑的副本：手牌是 id 列表，桌面是带坐标的"组"
 */

const RummyGame = require('../../core/game');
const { takeTurn } = require('../../core/ai');
const { hitTest } = require('../widgets');
const layoutUtil = require('./board-layout');
const draftUtil = require('./board-draft');
const input = require('./game-input');
const renderer = require('./game-renderer');

const HUMAN = 0;
const AI_DELAY = 0.65; // 电脑玩家思考时间（秒）
const TIME_LEFT = 60;  // 每回合思考时间上限（秒），超时自动摸牌

class GameScene {
  /**
   * @param {object} app         场景管理器
   * @param {number} playerCount 总人数（含真人），默认 4
   */
  constructor(app, playerCount) {
    this.app = app;
    this.W = app.W;
    this.H = app.H;
    this.playerCount = playerCount || 4; // 记住人数，重开一局时还要用
    // 布局常量只算一次，带上安全区（避免顶栏被刘海挡住）
    this.L = layoutUtil.computeLayout(this.W, this.H, app.safeTop || 0, app.safeBottom || 0);
    console.log('[GameScene] 已创建，每回合限时 ' + TIME_LEFT + ' 秒，安全区 top=' + this.L.safeTop);
    this.newGame();
  }

  newGame() {
    this.game = new RummyGame({ playerCount: this.playerCount, humanIndex: HUMAN });
    this.draft = draftUtil.createDraft(this.game, HUMAN, this.L);
    this.selected = [];      // 点选高亮（视觉用，出牌不依赖它）
    this.drag = null;        // 正在拖的牌：{ id, from, x, y, dx, dy, w, h, moved }
    this.lastDrawnId = null; // 刚摸到的那张牌，渲染时高亮；触摸或下次摸牌时清掉
    this.message = '把牌拖到桌面出牌，或点「摸牌」';
    this.aiWait = 0;
    this.timeLeft = TIME_LEFT; // 本回合剩余秒数
    this.turnOwner = null;     // 当前回合属于谁，用来判断"换人了"（置空 → 下次 update 重新计时）
  }

  isHumanTurn() {
    return this.game.current === HUMAN && this.game.turnState !== 'over';
  }

  /** 从 game 重新生成草稿（摸牌、电脑行动、出牌之后都要调） */
  _syncDraft() {
    this.draft = draftUtil.createDraft(this.game, HUMAN, this.L);
  }

  _tileOf(id) {
    return draftUtil.tileOf(this.game, id);
  }

  _handLayout() {
    return layoutUtil.handPositions({
      layout: this.L,
      count: this.draft.hand.length,
      handIds: this.draft.hand,
      selectedIds: this.selected,
    });
  }

  /** 桌面所有牌的位置（平铺数组，含坐标） */
  _tableCells() {
    return layoutUtil.tablePositions({ layout: this.L, groups: this.draft.table });
  }

  /* ----------------------------- 拖动 ----------------------------- */

  onTouchStart(x, y) {
    if (this.lastDrawnId) this.lastDrawnId = null; // 一摸屏幕，刚摸牌的高亮就消失
    if (this.game.turnState === 'over' || !this.isHumanTurn()) return;

    const hit = input.pickTile({
      x,
      y,
      handIds: this.draft.hand,
      handPos: this._handLayout(),
      tableCells: this._tableCells(),
    });
    if (!hit) return;

    this.drag = {
      id: hit.id,
      from: hit.from,
      x,
      y,
      dx: x - hit.rect.x, // 手指相对牌左上角的偏移，保证拖动时牌不会跳
      dy: y - hit.rect.y,
      w: hit.rect.w,      // 记住原牌尺寸，拖动时按原尺寸画，避免突然变大
      h: hit.rect.h,
      moved: false,
    };
  }

  onTouchMove(x, y) {
    if (!this.drag) return;
    this.drag.x = x;
    this.drag.y = y;
    this.drag.moved = true;
  }

  /**
   * 松手：
   *   - 落在空地   → 新建一组，就摆在松手的位置
   *   - 落在某组上 → 按左右插进那一组，组内的牌自动重新紧贴
   *   - 落在桌面外 → 收回手牌
   */
  _dropTile(d, x, y) {
    const { tableTop, tableBottom, tableTileW: tw, tableTileH: th } = this.L;
    const inTable = y >= tableTop && y <= tableBottom;

    if (!inTable) {
      if (!draftUtil.isOnTable(this.draft, d.id)) return; // 手牌拖到桌面外 = 放回原位
      draftUtil.removeTile(this.draft, d.id);
      draftUtil.pushToHand(this.draft, d.id);
      return;
    }

    // 这张牌左上角应该落在哪（夹在桌面区域内，别跑出边界）
    const tx = Math.max(6, Math.min(x - d.dx, this.W - 6 - tw));
    const ty = Math.max(tableTop + 4, Math.min(y - d.dy, tableBottom - 4 - th));

    draftUtil.removeTile(this.draft, d.id); // 先离开原来那一组

    const gi = input.findDropGroup({ tx, ty, groups: this.draft.table, tw, th });
    if (gi < 0) {
      draftUtil.addGroup(this.draft, d.id, tx, ty); // 空地 → 新建一组
      return;
    }
    const at = input.findInsertIndex({ tx, group: this.draft.table[gi], tw });
    draftUtil.insertToGroup(this.draft, gi, at, d.id); // 进组 → 组内自动紧贴
  }

  /* ----------------------------- 点击 ----------------------------- */

  onTouchEnd(x, y) {
    const g = this.game;

    // 拖动结束
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      if (d.moved) {
        this._dropTile(d, x, y);
        return;
      }
      // 没移动过 = 当成点击，继续往下走
    }

    if (g.turnState === 'over') {
      if (hitTest(this.L.restartBtn, x, y)) this.newGame();
      return;
    }
    if (hitTest(this.L.backBtn, x, y)) {
      this.app.goMode(); // 返回模式选择
      return;
    }
    if (!this.isHumanTurn()) return;

    const btn = input.pickButton({ x, y, buttons: this.L.buttons });
    if (btn) {
      this._onButton(btn);
      return;
    }
    this._onTileTap(x, y);
  }

  _onButton(id) {
    const g = this.game;

    if (id === 'draw') {
      if (g.turnState !== 'await-draw') {
        this.message = '本回合已经摸过牌了';
        return;
      }
      try {
        const tile = g.draw(HUMAN);
        this._syncDraft();
        // 记住刚摸到的这张牌，渲染时高亮，方便在排好序的手牌里找到它
        this.lastDrawnId = tile ? tile.id : null;
        this.message = tile ? '摸了一张牌，回合结束' : '牌堆已空，回合结束';
        this.aiWait = 0;
        if (g.turnState !== 'over') g.endTurn(HUMAN);
      } catch (err) {
        this.message = err.message;
      }
      return;
    }

    if (id === 'play') {
      try {
        // 把带坐标的"组"转成 core 需要的二维 id 数组再校验
        g.submitMove(HUMAN, draftUtil.groupIds(this.draft));
        this._syncDraft();
        this.message = '出牌成功，回合结束';
        this.aiWait = 0;
        if (g.turnState !== 'over') g.endTurn(HUMAN);
      } catch (err) {
        this.message = err.message; // 校验失败时保留玩家的摆放，方便修改
      }
    }
  }

  /** 点手牌 = 选中/取消选中（视觉提示） */
  _onTileTap(x, y) {
    const ids = this.draft.hand;
    const { positions } = this._handLayout();
    for (let i = 0; i < positions.length; i++) {
      if (hitTest(positions[i], x, y)) {
        const idx = this.selected.indexOf(ids[i]);
        if (idx >= 0) this.selected.splice(idx, 1);
        else this.selected.push(ids[i]);
        return;
      }
    }
  }

  /* ----------------------------- 回合驱动 + 计时 ----------------------------- */

  update(dt) {
    const g = this.game;
    if (g.turnState === 'over') return;

    // 换人了 → 倒计时重置。
    // 新开局、真人结束回合、电脑走完，三种情况都靠这一句覆盖。
    if (this.turnOwner !== g.current) {
      this.turnOwner = g.current;
      this.timeLeft = TIME_LEFT;
    }

    // 扣时间；归零就交给超时处理
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = TIME_LEFT; // 先重置，防止连续触发
      this._timeoutTurn();
      return;
    }

    if (g.current === HUMAN) return; // 轮到真人：只负责倒计时，等玩家操作

    // ---------- 电脑回合 ----------
    this.aiWait += dt;
    if (this.aiWait < AI_DELAY) return;

    this.aiWait = 0;
    takeTurn(g, g.current);
    this._syncDraft(); // 电脑可能往桌面加牌，草稿要跟着刷新
    if (g.turnState !== 'over' && g.current === HUMAN) {
      this.message = '轮到你了：把牌拖到桌面，或点「摸牌」';
    }
  }

  /** 当前玩家超时：真人自动摸牌（已经摸过就直接过），电脑替它走一步 */
  _timeoutTurn() {
    const g = this.game;

    if (g.current === HUMAN) {
      if (g.turnState === 'await-draw') {
        this._onButton('draw'); // 还没行动 → 摸一张然后结束回合
        this.message = '超时，已自动摸牌';
      } else {
        try {
          g.endTurn(HUMAN); // 已经摸过牌 → 直接过
        } catch (err) {
          /* 忽略：极端情况下状态不对就当无事发生 */
        }
        this._syncDraft();
        this.aiWait = 0;
        this.message = '超时，已轮到下一位';
      }
      return;
    }

    // 电脑正常 0.65 秒就动了，走不到这里，纯兜底
    takeTurn(g, g.current);
    this._syncDraft();
  }

  /* ----------------------------- 渲染 ----------------------------- */

  /** 打包给渲染模块的状态（只读） */
  renderState() {
    return {
      W: this.W,
      H: this.H,
      layout: this.L,
      game: this.game,
      draft: this.draft,
      selected: this.selected,
      lastDrawnId: this.lastDrawnId,
      message: this.message,
      drag: this.drag,
      isHumanTurn: this.isHumanTurn(),
      timeLeft: this.timeLeft,
      myIndex: this.myIndex == null ? HUMAN : this.myIndex,
      currentName: this.currentName || '',
      online: !!this.online,
      userName: (this.app.user && this.app.user.nickname) || '',
      tileOf: (id) => this._tileOf(id),
    };
  }

  render(ctx) {
    renderer.render(ctx, this.renderState());
  }
}

module.exports = GameScene;
