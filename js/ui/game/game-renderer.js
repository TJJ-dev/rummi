/**
 * 对局渲染。
 *
 * 只负责"把状态画出来"，不持状态、不改数据。
 * 坐标全部来自 board-layout，和命中判定共用同一套计算。
 *
 * 所有函数都接收同一个 state 对象 s：
 *   { W, H, layout, game, draft, selected, lastDrawnId, message, drag,
 *     isHumanTurn, timeLeft, userName, tileOf }
 */

const theme = require('../theme');
const { drawTile, drawButton, fillRoundRect, roundRect } = require('../widgets');
const { handPositions, tablePositions } = require('./board-layout');

const INITIAL_MELD_MIN = 30;
const WARN_SECONDS = 10;  // 剩多少秒开始变红
const DANGER_COLOR = '#c0392b';

/** 画整个对局画面。正在拖的牌最后画，保证在最上层 */
function render(ctx, s) {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, s.W, s.H);

  renderTopBar(ctx, s);
  renderOpponents(ctx, s);
  renderTable(ctx, s);
  renderHand(ctx, s);
  renderButtons(ctx, s);

  if (s.drag && s.drag.moved) renderDragTile(ctx, s);
  if (s.game.turnState === 'over') renderOverlay(ctx, s);
}

function renderTopBar(ctx, s) {
  const { W, barH, topOffset, topH, backBtn } = s.layout;
  fillRoundRect(ctx, 0, 0, W, barH, 0, theme.bgDark); // 背景含刘海区域
  drawButton(ctx, backBtn);

  const cy = topOffset + topH / 2; // 内容居中在"刘海以下"的那条 44px 里

  // 右侧：牌堆张数
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.textDim;
  ctx.font = '13px sans-serif';
  const poolCount = s.game.poolCount != null ? s.game.poolCount : (s.game.pool || []).length;
  ctx.fillText(`牌堆 ${poolCount}`, W - 12, cy);

  // 中间：回合提示。轮到自己时画成一个醒目的倒计时胶囊
  if (s.isHumanTurn) {
    const secs = Math.max(0, Math.ceil(s.timeLeft)); // 用 ceil，59.2 显示 60
    const text = `你的回合 ${secs}s`;
    const pillH = 30;

    ctx.font = 'bold 16px sans-serif';
    const pillW = ctx.measureText(text).width + 28;

    fillRoundRect(
      ctx,
      W / 2 - pillW / 2,
      cy - pillH / 2,
      pillW,
      pillH,
      pillH / 2,
      secs <= WARN_SECONDS ? DANGER_COLOR : theme.button
    );

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(text, W / 2, cy);
  } else {
    ctx.fillStyle = theme.textDim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 15px sans-serif';
    const name = s.currentName || `玩家 ${s.game.current}`;
    ctx.fillText(`${name} 思考中…`, W / 2, cy);
  }
}

function renderOpponents(ctx, s) {
  const { W, oppY, oppH } = s.layout;
  const players = s.game.players.filter((p) => !p.isHuman);
  const gap = 8;
  const cw = (W - 16 - gap * (players.length - 1)) / players.length;

  let x = 8;
  for (const p of players) {
    const active = p.index === s.game.current;
    fillRoundRect(ctx, x, oppY, cw, oppH, 10, active ? '#2b4a3c' : theme.panel);
    if (active) {
      roundRect(ctx, x, oppY, cw, oppH, 10);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = theme.accent;
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = active ? theme.accent : theme.textDim;
    ctx.font = '12px sans-serif';
    const name = p.name || `玩家${p.index + 1}`;
    ctx.fillText(`${name}${p.hasMelded ? ' · 已首出' : ''}`, x + cw / 2, oppY + 15);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    const handCount = p.handCount != null ? p.handCount : p.hand.length;
    ctx.fillText(`${handCount} 张`, x + cw / 2, oppY + 32);

    x += cw + gap;
  }
}

/**
 * 桌面：每组的锚点在 group 上，组内每张牌的位置由 board-layout 算出来。
 * 所以组想摆哪就摆哪，组内的牌永远紧贴。
 */
function renderTable(ctx, s) {
  const { W, tableTop, tableBottom } = s.layout;
  fillRoundRect(ctx, 6, tableTop, W - 12, tableBottom - tableTop, 12, theme.panel);

  if (s.draft.table.length === 0) {
    ctx.fillStyle = theme.textDim;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('把牌拖到这里出牌', W / 2, (tableTop + tableBottom) / 2);
    return;
  }

  const cells = tablePositions({ layout: s.layout, groups: s.draft.table });
  for (const cell of cells) {
    if (cell.rect.y + cell.rect.h > tableBottom - 6) continue; // 超出桌面区域不画
    if (s.drag && s.drag.id === cell.id) continue;             // 正在拖的另画
    const tile = s.tileOf(cell.id);
    if (tile) drawTile(ctx, tile, cell.rect.x, cell.rect.y, cell.rect.w, cell.rect.h, false);
  }
}

function renderHand(ctx, s) {
  const { W } = s.layout;
  const ids = s.draft.hand;
  const { positions, top } = handPositions({
    layout: s.layout,
    count: ids.length,
    handIds: ids,
    selectedIds: s.selected,
  });
  const me = s.game.players[s.myIndex] || s.game.players[0] || {};
  const melded = !!me.hasMelded;

  ctx.textBaseline = 'bottom';
  ctx.font = '12px sans-serif';
  ctx.fillStyle = theme.textDim;
  ctx.textAlign = 'left';
  // 有昵称就把昵称带上 —— 顶栏左上角被"返回"占了，这里是唯一放得下又不会碰撞的左侧位置
  const label = s.userName ? `${s.userName} · 手牌 (${ids.length})` : `我的手牌 (${ids.length})`;
  ctx.fillText(label, 10, top - 6);

  ctx.textAlign = 'right';
  ctx.fillText(
    melded ? '已首出' : `首出需 ${Math.max(0, INITIAL_MELD_MIN - s.game.turnPlacedValue)} 分`,
    W - 10,
    top - 6
  );

  for (let i = 0; i < positions.length; i++) {
    const id = ids[i];
    if (s.drag && s.drag.id === id) continue; // 正在拖的另画
    const tile = s.tileOf(id);
    if (!tile) continue;
    const lifted = s.selected.indexOf(id) >= 0;
    const p = positions[i];
    drawTile(ctx, tile, p.x, p.y, p.w, p.h, lifted);
  }

  // 刚摸到的那张牌加个光环，方便在一堆排好序的牌里找到它
  if (s.lastDrawnId) {
    const i = ids.indexOf(s.lastDrawnId);
    if (i >= 0 && !(s.drag && s.drag.id === s.lastDrawnId)) {
      drawGlow(ctx, positions[i]);
    }
  }
}

/** 给一张牌画高亮光环（画在牌的上层，只描边不填充） */
function drawGlow(ctx, rect) {
  const pad = 2;
  ctx.save();
  ctx.shadowColor = theme.accent;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 3;
  roundRect(ctx, rect.x - pad, rect.y - pad, rect.w + pad * 2, rect.h + pad * 2, theme.radius + 2);
  ctx.stroke();
  ctx.stroke(); // 描两遍，让光晕更明显
  ctx.restore();
}

/** 正在拖的那张牌：跟着手指走，按原尺寸画 */
function renderDragTile(ctx, s) {
  const d = s.drag;
  const tile = s.tileOf(d.id);
  if (!tile) return;
  // 按原牌尺寸画（手牌大、桌面牌小），否则从桌上抓起时会突然变大、并相对手指偏移
  drawTile(ctx, tile, d.x - d.dx, d.y - d.dy, d.w || s.layout.handW, d.h || s.layout.handH, true);
}

function renderButtons(ctx, s) {
  const { W, buttons, messageY } = s.layout;
  const g = s.game;

  for (const b of buttons) {
    let enabled = s.isHumanTurn;
    if (g.turnState === 'over') enabled = false;
    else if (b.id === 'draw') enabled = enabled && g.turnState === 'await-draw';
    else if (b.id === 'play') {
      enabled = enabled && (g.turnState === 'await-draw' || g.turnState === 'await-play');
    }
    drawButton(ctx, { ...b, enabled });
  }

  ctx.fillStyle = theme.text;
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s.message, W / 2, messageY);
}

function renderOverlay(ctx, s) {
  const { W, H, restartBtn } = s.layout;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = theme.accent;
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const winner = s.game.players[s.game.winner];
  const winnerName = winner && winner.name ? winner.name : `玩家 ${s.game.winner}`;
  ctx.fillText(s.game.winner === s.myIndex ? '你赢了！' : `${winnerName} 获胜`, W / 2, H * 0.5 - 20);

  drawButton(ctx, { ...restartBtn, label: s.online ? '返回大厅' : '再来一局' });
}

module.exports = { render };
