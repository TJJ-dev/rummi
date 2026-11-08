/**
 * 布局与坐标计算。
 *
 * 纯函数：不依赖 this，也不依赖 wx，可以直接用 node 跑。
 * 渲染和命中判定都调用这里 —— 同一套坐标，"看到的位置"和"点中的位置"永远一致。
 */

const DRAG_LIFT = 6; // 选中时牌上浮的像素

/**
 * 计算整屏的布局常量（尺寸、按钮位置等），只算一次。
 * @param {number} W          屏宽
 * @param {number} H          屏高
 * @param {number} safeTop    顶部安全区（刘海/状态栏）高度
 * @param {number} safeBottom 底部安全区（Home 指示条）高度
 */
function computeLayout(W, H, safeTop = 0, safeBottom = 0) {
  const topOffset = safeTop; // 顶栏整体下移这么多，避免被刘海盖住
  const topH = 44;
  const barH = topOffset + topH; // 顶栏背景的总高度（含刘海）

  const tableTop = topOffset + 104;
  const tableBottom = Math.round(H * 0.56);

  const handH = Math.min(64, Math.round(H * 0.115)); // 手牌高
  const handW = Math.round(handH * 0.72);            // 手牌宽

  const btnY = H - safeBottom - 68; // 按钮整体上移，避开 Home 指示条
  const gap = 10;
  const bw = (W - gap * 3) / 2; // 两个按钮
  const bh = 50;

  return {
    W,
    H,
    safeTop,
    safeBottom,
    topOffset,
    topH,
    barH,

    oppY: topOffset + 50,
    oppH: 46,
    tableTop,
    tableBottom,

    handW,
    handH,
    handGapX: 4, // 手牌横向间距
    handGapY: 8, // 手牌行距
    handBottom: btnY - 40,        // 手牌区底部基准线（向上生长）
    handMinTop: tableBottom + 8,  // 向上生长的极限，避免盖住桌面

    tableTileW: 26, // 桌面牌宽
    tableTileH: 36, // 桌面牌高
    tableGapX: 2,
    tableGroupGap: 10,

    dragLift: DRAG_LIFT,
    messageY: btnY - 24,

    backBtn: { id: 'back', x: 8, y: topOffset + 9, w: 58, h: 26, label: '返回', fontSize: 13 },
    buttons: [
      { id: 'draw', x: gap, y: btnY, w: bw, h: bh, label: '摸牌', fontSize: 16 },
      { id: 'play', x: gap * 2 + bw, y: btnY, w: bw, h: bh, label: '出牌', fontSize: 16 },
    ],
    restartBtn: {
      id: 'restart',
      x: W / 2 - 100,
      y: H * 0.5 + 30,
      w: 200,
      h: 50,
      label: '再来一局',
      fontSize: 17,
      enabled: true,
    },
  };
}

/**
 * 手牌每张牌的位置。
 * 一行放不下就换行；行数太多时才略微降低牌高，保证不盖住桌面和按钮。
 * positions 与 handIds 下标一一对应。
 */
function handPositions({ layout, count, handIds = [], selectedIds = [] }) {
  const { W, handW, handH, handGapX, handGapY, handBottom, handMinTop, dragLift } = layout;
  const maxW = W - 12;

  // 一行能放几张
  const perRow = Math.max(1, Math.floor((maxW + handGapX) / (handW + handGapX)));
  const rows = Math.max(1, Math.ceil(count / perRow));

  // 行数过多时压缩牌高（兜底，正常不会触发）
  let h = handH;
  const maxBlockH = handBottom - handMinTop;
  const needed = rows * handH + (rows - 1) * handGapY;
  if (needed > maxBlockH) {
    h = Math.max(26, Math.floor((maxBlockH - (rows - 1) * handGapY) / rows));
  }

  const blockH = rows * h + (rows - 1) * handGapY;
  const top = handBottom - blockH;

  const positions = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / perRow);
    const c = i % perRow;
    const inRow = Math.min(perRow, count - r * perRow); // 最后一行可能不满
    const rowW = inRow * handW + (inRow - 1) * handGapX;
    const startX = (W - rowW) / 2;                      // 每行各自居中
    const lifted = selectedIds.indexOf(handIds[i]) >= 0;

    positions.push({
      x: startX + c * (handW + handGapX),
      y: top + r * (h + handGapY) + (lifted ? -dragLift : 0),
      w: handW,
      h,
    });
  }
  return { positions, top, rows, tileH: h, perRow };
}

/**
 * 桌面每张牌的位置。整组放不下就换到下一行，单组太长则组内也换行。
 *
 * @param {object}     p
 * @param {object}     p.layout    computeLayout 的结果
 * @param {string[][]} p.tableIds  桌面每一组的 id 数组
 */
function tablePositions({ layout, groups = [] }) {
  const { tableTileW: tw, tableTileH: th, W } = layout;
  const maxX = W - 8;
  const out = [];

  for (const g of groups) {
    let x = g.x;
    let y = g.y;
    for (const id of g.ids) {
      if (x + tw > maxX) {
        x = g.x;
        y += th + 10; // 组太长就组内折行
      }
      out.push({ id, rect: { x, y, w: tw, h: th } });
      x += tw + 2; // ← 紧贴的间距就是这里
    }
  }
  return out;
}

module.exports = { computeLayout, handPositions, tablePositions, DRAG_LIFT };
