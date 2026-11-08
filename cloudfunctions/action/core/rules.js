/**
 * 牌组（meld）合法性判定
 *
 * 合法牌组只有两种：
 *   顺子 run：同色、3 张以上连续数字（如 红5 红6 红7）
 *   刻子 group：同数字、3~4 张不同颜色（如 红7 蓝7 黑7）
 * 百搭（joker）可替代任意一张牌，但不能单独成组。
 */

const { MAX_NUMBER } = require('./tiles');

const MIN_RUN = 3;
const MIN_GROUP = 3;
const MAX_GROUP = 4;
const INITIAL_MELD_MIN = 30; // 首次出牌的总点数门槛

function realTiles(tiles) {
  return tiles.filter((t) => !t.isJoker);
}

/** 是否为合法顺子 */
function isRun(tiles) {
  const n = tiles.length;
  if (n < MIN_RUN || n > MAX_NUMBER) return false;

  const real = realTiles(tiles);
  const jokers = n - real.length;
  if (real.length === 0) return false;

  const color = real[0].color;
  const seen = new Set();
  for (const t of real) {
    if (t.color !== color) return false;
    if (t.number < 1 || t.number > MAX_NUMBER) return false;
    if (seen.has(t.number)) return false;
    seen.add(t.number);
  }

  const nums = real.map((t) => t.number).sort((a, b) => a - b);
  const span = nums[nums.length - 1] - nums[0] + 1;
  const missing = span - real.length; // 中间需要被百搭填上的空位
  if (missing > jokers) return false;

  // 多余的百搭只能接在两端，不能超出 1~13 的范围
  const extra = jokers - missing;
  const lowRoom = nums[0] - 1;
  const highRoom = MAX_NUMBER - nums[nums.length - 1];
  return extra <= lowRoom + highRoom;
}

/** 是否为合法刻子 */
function isGroup(tiles) {
  const n = tiles.length;
  if (n < MIN_GROUP || n > MAX_GROUP) return false;

  const real = realTiles(tiles);
  if (real.length === 0) return false;

  const number = real[0].number;
  const colors = new Set();
  for (const t of real) {
    if (t.number !== number) return false;
    if (colors.has(t.color)) return false;
    colors.add(t.color);
  }
  return true;
}

function isValidMeld(tiles) {
  return isRun(tiles) || isGroup(tiles);
}

/** 牌面点数（百搭不计分，符合「首出 30 分」规则） */
function meldValue(tiles) {
  return realTiles(tiles).reduce((sum, t) => sum + t.number, 0);
}

/** 首次出牌规则：本轮打出的所有牌组，非百搭点数之和需 >= 30 */
function isInitialMeldValid(totalValue) {
  return totalValue >= INITIAL_MELD_MIN;
}

module.exports = {
  MIN_RUN,
  MIN_GROUP,
  MAX_GROUP,
  INITIAL_MELD_MIN,
  realTiles,
  isRun,
  isGroup,
  isValidMeld,
  meldValue,
  isInitialMeldValid,
};
