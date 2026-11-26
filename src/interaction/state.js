import * as THREE from 'three';
import { uniforms } from '../rig/uniforms.js';
import { CheekSpring } from '../rig/springs.js';

/**
 * 交互共享状态：输入（input.js）写，拉扯物理（pull.js）和表情（expression/）读。
 * 坐标都是参考坐标（见 rig/calibration.js）。
 */
export function createInteractionState({ actions, defaultAction, behavior }) {
  const mode = defaultAction ?? 'off';
  return {
    mode, // 当前工具：poke / single / double / cup / off（音游中或没有可用工具）
    modeBeforeRhythm: mode,
    behavior, // 角色的反应节奏（personality.behavior）
    // 幅度上限（相对脸宽），来自角色配置 personality.actions
    limits: {
      single: actions.single?.limit ?? 0.075,
      double: actions.double?.limit ?? 0.048,
      cup: actions.cup?.push ?? 0.035,
      rhythm: actions.rhythm?.limit ?? 0.12,
    },

    // --- 拉扯 / 捧脸 ---
    grab: uniforms.uGrab.value, // 抓取中心
    delta: uniforms.uDelta.value, // 当前拉扯位移
    target: new THREE.Vector3(), // 指针对应的目标位移
    vel: new THREE.Vector3(),
    pullSides: 0, // 0 捧脸 / 1 单手 / 2 双手（松手后保留，用于回弹）
    holdId: null, // 正在按住的指针（键盘长按为 'key'）
    keyHoldCode: null,
    pulling: false, // 已经真正拉动过
    holdStart: null, // 拉开超过阈值的时刻（脸红计时）
    pullAmount: 0, // 平滑后的拉扯程度 0..1
    egg: null, // 本次拉扯触发的彩蛋（见角色配置 symbols）
    roll: 0, // 每次动作开始（戳一下 / 按下拉或捧）掷一次的随机数 0..1，表情表据此选招牌表情或变体

    // 拖动
    pressPx: new THREE.Vector2(),
    dragPlane: new THREE.Plane(),
    dragStart: new THREE.Vector3(),

    // 回弹后的脸颊抖动
    jiggle: { armed: false, amp: 0, t: Infinity, left: false, right: false },
    releaseDir: new THREE.Vector3(),
    blushHold: { x: 0, y: 0 },

    // --- 戳 ---
    pokeUntil: -Infinity, // 戳完 550ms 内是"被戳"表情
    pokeCombo: 0, // 连戳次数（两次间隔 < 0.7 秒算连戳）
    lastPokeAt: -Infinity,

    // --- 捧脸 ---
    cupHeld: false,
    cupAmount: 0, // 捧脸程度 0..1（平滑）
    cheekSpring: new CheekSpring(),
    cupTime: 0, // 本次已经捧了多久（秒）
    rubInput: 0, // 这一帧揉脸移动的像素
    rubLevel: 0, // 揉脸的快慢 0..1（平滑）
    rubEnergy: 0, // 揉脸累积，攒满就晕
    lastRubPx: new THREE.Vector2(),
    dizzyUntil: -Infinity, // 揉晕的表情持续到
    afterglow: 0, // 捧完松手后"嘿嘿"笑的余韵 0..1

    hoverEvent: null, // 鼠标悬停（每帧更新光标）
  };
}
