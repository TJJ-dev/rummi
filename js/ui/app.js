/**
 * 场景管理器。
 *
 * 只做两件事：
 *   1. 保存"当前是哪个场景"，以及屏幕尺寸、安全区、登录用户这些全局信息
 *   2. 把主循环的 update / render 和触摸事件转发给当前场景
 *
 * 场景之间不互相 require，切换一律走这里的方法，
 * 这样以后加新场景只要在下面补一个 goXxx()。
 */

const HomeScene = require('./home-scene');
const ModeSelectScene = require('./mode/ModeSelectScene');
const GameScene = require('./game/game-scene');
const LoginScene = require('./login/login');
const NameScene = require('./name/name');
const RoomLobbyScene = require('./room/room-lobby');
const RoomWaitScene = require('./room/room-wait');
const OnlineGameScene = require('./game/online-game-scene');
const roomApi = require('../net/room');

class App {
  /**
   * @param {object}  opts
   * @param {object}  opts.ctx
   * @param {number}  opts.width
   * @param {number}  opts.height
   * @param {number}  opts.safeTop       刘海 / 状态栏高度
   * @param {number}  opts.safeBottom    底部 Home 指示条高度
   * @param {object}  opts.user          本地缓存的用户（有就直接进首页，跳过登录页）
   * @param {string}  opts.pendingRoomId 从分享卡片进来时带的房间号
   */
  constructor({ ctx, width, height, safeTop = 0, safeBottom = 0, user = null, pendingRoomId = null }) {
    this.ctx = ctx;
    this.W = width;
    this.H = height;
    this.safeTop = safeTop;
    this.safeBottom = safeBottom;
    this.time = 0;
    this.scene = null;
    this.user = user;                 // 由 setUser() 更新
    this.pendingRoomId = pendingRoomId; // 登录完再消费

    if (user) this.afterLogin();
    else this.goLogin();
  }

  /** 更新当前登录用户 */
  setUser(user) {
    this.user = user;
  }

  /** 登录页 */
  goLogin() {
    this.scene = new LoginScene(this);
  }

  /** 首页 */
  goHome() {
    this.scene = new HomeScene(this);
  }

  goName() {
    this.scene = new NameScene(this);
  }

  /** 模式选择 */
  goMode() {
    this.scene = new ModeSelectScene(this);
  }

  /** 在线对战：房间大厅 */
  goRoomLobby() {
    this.scene = new RoomLobbyScene(this);
  }

  /** 房间等待页 */
  goRoomWait(roomId) {
    this.scene = new RoomWaitScene(this, roomId);
  }

  /** 在线对局；view 是服务端下发的"我这个座位看到的对局" */
  goOnlineGame(roomId, view) {
    this.scene = new OnlineGameScene(this, roomId, view);
  }

  /**
   * 登录成功（或刚起完名字）后决定去哪：
   *   有分享房间号 → 直接进房；没昵称 → 先去起名字；否则 → 首页
   */
  afterLogin() {
    const user = this.user;
    if (!user || !user.nickname) {
      this.goName();
      return;
    }

    if (this.pendingRoomId) {
      const roomId = this.pendingRoomId;
      this.pendingRoomId = null;
      this.goRoomLobby();
      this.joinRoomFromShare(roomId);
      return;
    }

    this.goHome();
  }

  /** 从分享卡片进来：加入房间，失败就回首页 */
  async joinRoomFromShare(roomId) {
    if (!roomId) return;

    // 已经在这个房间里了（比如从分享卡片切回来），不要重复加入
    if (this.scene instanceof RoomWaitScene && this.scene.roomId === roomId) return;
    if (this.scene instanceof OnlineGameScene && this.scene.roomId === roomId) return;

    try {
      const res = await roomApi.joinRoom(roomId);
      if (res && res.ok) {
        this.goRoomWait(roomId);
        return;
      }
      console.warn('[room] 分享加入失败：' + ((res && res.error) || '未知错误'));
    } catch (err) {
      console.warn('[room] 分享加入异常：' + err.message);
    }
    this.goHome();
  }

  /** 开局，playerCount 由模式选择页带过来 */
  startGame(playerCount) {
    this.scene = new GameScene(this, playerCount);
  }

  onTouchEnd(x, y) {
    if (this.scene && this.scene.onTouchEnd) this.scene.onTouchEnd(x, y);
  }

  onTouchStart(x, y) {
    if (this.scene && this.scene.onTouchStart) this.scene.onTouchStart(x, y);
  }

  onTouchMove(x, y) {
    if (this.scene && this.scene.onTouchMove) this.scene.onTouchMove(x, y);
  }

  update(dt) {
    this.time += dt;
    if (this.scene && this.scene.update) this.scene.update(dt);
  }

  render() {
    if (this.scene) this.scene.render(this.ctx);
  }
}

module.exports = App;
