/*
 * 配色
 * 取色来源：手动指定
 * 主色 / 辅色 / 点缀色：#9d94c3 / #e2b7c0 / #5a4768
 * css 的每个键对应 src/ui/style.css 里的一个 CSS 变量（驼峰 → --kebab-case）；[r, g, b] 是带透明度用的底色。
 */
export default {
  css: {
    bgTop: '#edebf4',
    bgBottom: '#e4d2d6',
    ink: '#403b54',
    accent: '#463c6c',
    accentInk: '#f5f3fc',
    shade: [56, 48, 90],
    gradient1: '#b9adeb',
    gradient2: '#d694a2',
    gradient3: '#be8de2',
    noteTap: '#b2a5e9',
    noteHold: '#c48d98',
    noteHoldBody: '#ab7883',
    noteHoldTail: '#cfa5ae',
    noteHoldHeld: '#a4606e',
    burstTap: '#dbd3fd',
    burstHold: '#fddde4',
    judgePerfect: '#ffe79a',
    judgeGood: '#fdd8e0',
    judgeMiss: '#c4b6fb',
    glow: [67, 61, 92],
  },
  /** 模型描边颜色（0..1） */
  outline: [0.13,0.11,0.21],
};
