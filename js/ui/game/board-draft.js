/**
 * 草稿数据操作。
 *
 * 草稿装的是牌的 id。桌面按「组」组织，每组带自己的锚点坐标：
 *
 *   {
 *     hand: ['t3', 't17'],
 *     table: [
 *       { x: 8,   y: 114, ids: ['t1','t2','t3'] },   // 一组，锚点在左上角
 *       { x: 300, y: 250, ids: ['t9'] },             // 另一组，玩家自己摆的位置
 *     ],
 *   }
 *
 * 关键设计：**组的位置（x, y）是自由的，组内每张牌的坐标不存。**
 * 组内的位置由 board-layout 用「锚点 + 第几张」算出来，
 * 所以组内的牌永远紧贴、不可能重叠；而组想放哪就放哪。
 *
 * 全部是纯数据操作，可以直接用 node 跑。
 */

const GROUP_GAP = 12; // 从 game 生成草稿时，组与组的间隔

/**
 * 从对局状态生成一份草稿。
 * 桌面已有的牌组会按行自动摆好（之后就靠玩家自己拖）。
 */
function createDraft(game, humanIndex, layout) {
  const { W, tableTop, tableTileW: tw, tableTileH: th } = layout;
  const maxX = W - 8;
  const X0 = 8;
  const lineH = th + 10;

  const draft = {
    hand: game.players[humanIndex].hand.map((t) => t.id),
    table: [],
  };

  let x = X0;
  let y = tableTop + 10;
  for (const meld of game.table) {
    const w = meld.tiles.length * (tw + 2);
    if (x > X0 && x + w > maxX) {
      x = X0;
      y += lineH;
    }
    draft.table.push({
      x,
      y,
      ids: meld.tiles.map((t) => t.id),
    });
    x += w + GROUP_GAP;
  }
  return draft;
}

/** 按 id 找回牌的完整数据（渲染时要用牌的颜色、数字） */
function tileOf(game, id) {
  for (const p of game.players) {
    const t = p.hand.find((x) => x.id === id);
    if (t) return t;
  }
  for (const m of game.table) {
    const t = m.tiles.find((x) => x.id === id);
    if (t) return t;
  }
  return null;
}

function isOnTable(draft, id) {
  return draft.table.some((g) => g.ids.indexOf(id) >= 0);
}

/**
 * 把牌从草稿里拿掉（手牌、桌面都找一遍）。
 * 某一组被拿空了就顺手删掉这一组，避免留下空组。
 * @returns {'hand'|'table'|null} 原来放在哪
 */
function removeTile(draft, id) {
  const hi = draft.hand.indexOf(id);
  if (hi >= 0) {
    draft.hand.splice(hi, 1);
    return 'hand';
  }
  for (let g = 0; g < draft.table.length; g++) {
    const i = draft.table[g].ids.indexOf(id);
    if (i >= 0) {
      draft.table[g].ids.splice(i, 1);
      if (draft.table[g].ids.length === 0) draft.table.splice(g, 1);
      return 'table';
    }
  }
  return null;
}

/** 在 (x, y) 处新建一组，只放这一张牌 */
function addGroup(draft, id, x, y) {
  draft.table.push({ x, y, ids: [id] });
}

/**
 * 插进第 groupIndex 组。
 * 只改 ids 的顺序，不动组的 x/y —— 组内的牌会自动重新紧贴排列。
 */
function insertToGroup(draft, groupIndex, insertIndex, id) {
  const group = draft.table[groupIndex];
  if (!group) return;
  const at = Math.max(0, Math.min(insertIndex, group.ids.length));
  group.ids.splice(at, 0, id);
}

/** 放回手牌（避免重复） */
function pushToHand(draft, id) {
  if (draft.hand.indexOf(id) < 0) draft.hand.push(id);
}

/** 转成 core 需要的格式（二维 id 数组）交给 submitMove 校验 */
function groupIds(draft) {
  return draft.table.map((g) => g.ids.slice());
}

module.exports = {
  createDraft,
  tileOf,
  isOnTable,
  removeTile,
  addGroup,
  insertToGroup,
  pushToHand,
  groupIds,
};
