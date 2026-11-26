/*
 * 性格层：开放的动作、反应节奏、表情表、彩蛋。
 * 表情表在 expressions.js：每个动作一个招牌表情 + 一个变体。
 */
import expressions from './expressions.js';
import honeyLemon from '../../rhythm/charts/honeyLemon.js'; // 无版权 BGM + 125 BPM 简单谱面（同达妮娅）

export default {
  /*
   * 开放的动作，按顺序出现在右侧工具栏，不写就不出现。
   * cup 捧脸 / poke 戳脸 / single 单手拉脸 / double 双手拉脸 / rhythm 音游
   * limit / push 是相对脸宽的幅度上限，一般不用改。
   */
  actions: {
    poke: { label: '戳脸' },
    single: { label: '单手拉脸', limit: 0.075 },
    double: { label: '双手拉脸', limit: 0.048 },
    cup: { label: '捧脸', push: 0.035 },
    rhythm: { label: '音游', song: honeyLemon, limit: 0.075, tap: 'single', hint: '点按 / 空格 = 捏一下 · 长按 = 捏住' }, // 点按、长按都是单手捏，只是时间长短不同；limit 同单手拉，再大前发会被推开、露出后面的深色头纱
  },
  defaultAction: 'poke',

  /** 反应节奏：捧住后先害羞、再享受；揉多了会晕；捧够再松手会笑；拉久了松手会鼓嘴 */
  behavior: {
    cup: { shy: [0.6, 1.6], enjoy: [2.0, 3.0] },
    dizzy: { energy: 1.2 },
    afterglow: { minHold: 0.6 },
    sulk: true,
  },

  expressions,

  /** 拉脸的变体直接写在表情表里（p.roll），不用彩蛋 */
  eggs: { chance: 0, list: [] },
};
