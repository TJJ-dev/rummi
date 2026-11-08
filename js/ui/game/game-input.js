/**
 * 命中判定：把屏幕坐标换算成"哪张牌 / 哪个按钮 / 哪一组 / 组内第几号位"。
 * 纯函数，坐标全部来自 board-layout。
 */

const { hitTest } = require('../widgets');

/**
 * 手指按在哪张牌上。
 * @param {Array<{id:string, rect:object}>} tableCells 桌面所有牌（平铺，含坐标）
 * @returns {{id:string, from:'hand'|'table', rect:object}|null}
 */
function pickTile({ x, y, handIds = [], handPos, tableCells = [] }) {
  const positions = (handPos && handPos.positions) || [];
  for (let i = 0; i < positions.length; i++) {
    if (hitTest(positions[i], x, y)) {
      return { id: handIds[i], from: 'hand', rect: positions[i] };
    }
  }
  for (const cell of tableCells) {
    if (hitTest(cell.rect, x, y)) {
      return { id: cell.id, from: 'table', rect: cell.rect };
    }
  }
  return null;
}

/** 按到了哪个按钮；返回按钮 id 或 null */
function pickButton({ x, y, buttons = [] }) {
  for (const b of buttons) {
    if (hitTest(b, x, y)) return b.id;
  }
  return null;
}

function overlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 一组的包围盒；pad 是向外扩的吸附余量 */
function groupRect(group, tw, th, pad = 6) {
  return {
    x: group.x - pad,
    y: group.y - pad,
    w: group.ids.length * (tw + 2) + pad * 2,
    h: th + pad * 2,
  };
}

/**
 * 落点（以牌的大小为一个矩形）压在哪一组上；没有压到就返回 -1。
 * 返回 -1 表示"放在空地上"，调用方应该新建一组。
 */
function findDropGroup({ tx, ty, groups = [], tw, th }) {
  const probe = { x: tx, y: ty, w: tw, h: th };
  for (let i = 0; i < groups.length; i++) {
    if (overlap(groupRect(groups[i], tw, th), probe)) return i;
  }
  return -1;
}

/** 落点 x 落在组内哪两张牌之间（0 = 最左，ids.length = 最右） */
function findInsertIndex({ tx, group, tw }) {
  const step = tw + 2;
  for (let i = 0; i < group.ids.length; i++) {
    const center = group.x + i * step + tw / 2; // 第 i 张牌的中心
    if (tx < center) return i;                  // 落在左半边 → 插到它前面
  }
  return group.ids.length;                      // 落在最右 → 组尾
}

module.exports = { pickTile, pickButton, findDropGroup, findInsertIndex };
