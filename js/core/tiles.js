/**
 * 牌（tile）模型与牌堆
 *
 * 拉密（Rummikub）标准牌堆：
 *   4 种颜色 × 数字 1~13 × 2 套 = 104 张
 *   2 张百搭（joker）            = 106 张
 *
 * 本文件是纯逻辑，不依赖任何微信 API，可直接用 node 运行测试。
 */

const COLORS = ['red', 'orange', 'blue', 'black'];
const MIN_NUMBER = 1;
const MAX_NUMBER = 13;

const COLOR_LABEL = {
  red: '红',
  orange: '橙',
  blue: '蓝',
  black: '黑',
  joker: '百搭',
};

let _seq = 0;

function makeTile(color, number) {
  return { id: `t${_seq++}`, color, number, isJoker: false };
}

function makeJoker() {
  return { id: `j${_seq++}`, color: 'joker', number: 0, isJoker: true };
}

/** 生成一副完整的 106 张牌（未洗牌） */
function createDeck() {
  _seq = 0;
  const deck = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const color of COLORS) {
      for (let n = MIN_NUMBER; n <= MAX_NUMBER; n++) {
        deck.push(makeTile(color, n));
      }
    }
  }
  deck.push(makeJoker());
  deck.push(makeJoker());
  return deck;
}

/** Fisher-Yates 洗牌，可注入 rng 以便测试复现 */
function shuffle(deck, rng = Math.random) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

/** 计分价值：普通牌按点数，百搭按 30 分 */
function tileValue(tile) {
  return tile.isJoker ? 30 : tile.number;
}

function handValue(tiles) {
  return tiles.reduce((sum, t) => sum + tileValue(t), 0);
}

/** 手牌排序：非百搭在前，按颜色、数字排列，百搭放最后 */
function sortHand(tiles) {
  return tiles.slice().sort((a, b) => {
    if (a.isJoker !== b.isJoker) return a.isJoker ? 1 : -1;
    if (a.color !== b.color) return COLORS.indexOf(a.color) - COLORS.indexOf(b.color);
    return a.number - b.number;
  });
}

module.exports = {
  COLORS,
  MIN_NUMBER,
  MAX_NUMBER,
  COLOR_LABEL,
  makeTile,
  makeJoker,
  createDeck,
  shuffle,
  tileValue,
  handValue,
  sortHand,
};
