import * as THREE from 'three';
import { uniforms } from '../rig/uniforms.js';

const { clamp, smoothstep, damp } = THREE.MathUtils;

/**
 * 情绪信号：把交互状态整理成和角色无关的一组数值（0..1），供角色的表情表使用。
 * 信号算法是引擎的；"信号 → 什么表情"是角色的（personality.expressions）。
 * 节奏参数来自 personality.behavior；某种反应关掉时对应信号恒为 0。
 */
export function createSignals({ s, sfx, symbols, debug, mesh, symbolCenter, symbolMaterial }) {
  let pokeFace = 0, pokeAfter = 0, sulkGate = 0, sulkPuffed = false;
  let shyAmt = 0, enjoyAmt = 0, dizzyAmt = 0;
  let eggFade = 0, shownEgg = null;

  return function update({ dt, now, rhythmActive }) {
    const b = s.behavior;
    const holding = s.holdId !== null;
    const h = s.pullAmount;
    const poked = now < s.pokeUntil;
    pokeFace = clamp(pokeFace + ((poked ? 1 : -1) * dt) / (poked ? 0.09 : 0.3), 0, 1);
    pokeAfter = poked ? 1 : pokeAfter * Math.exp(-dt / 1.1); // 戳完的余韵：比 pokeFace 长，约 2~3 秒淡完

    // 生闷气：拉久了松手，脸还红着
    let sulk = 0;
    if (b.sulk) {
      sulkGate = damp(sulkGate, holding || poked ? 0 : 1, 15, dt);
      const blushLevel = Math.max(uniforms.uPullBlush.value.x, uniforms.uPullBlush.value.y);
      sulk = sulkGate * smoothstep(blushLevel, 0.015, 0.7) * (1 - h) * (1 - pokeFace);
      if (sulk > 0.8 && !sulkPuffed) { sulkPuffed = true; sfx.puff(); }
      else if (sulk < 0.08) sulkPuffed = false;
    }

    // 彩蛋：拉的时候淡入，松手后淡出；揉晕时显示晕的符号，松手后还晕一小会儿
    if (s.dizzyUntil > now) s.egg = symbols.dizzy; else if (s.egg && s.egg === symbols.dizzy) s.egg = null;
    if (s.egg) shownEgg = s.egg;
    if (debug.egg) { if (debug.egg.symbol) debug.egg.from ??= symbolCenter(mesh, symbolMaterial, debug.egg.spot); s.egg = shownEgg = debug.egg; }
    eggFade = damp(eggFade, s.egg && (h > 0.015 || debug.egg || s.egg === symbols.dizzy) ? 1 : 0, s.egg ? 12 : 7, dt);
    if (!s.egg && eggFade < 0.005) shownEgg = null;
    const ef = shownEgg ? eggFade : 0;

    // 捧脸各阶段：刚捧住（惊讶）→ 害羞 → 享受
    const [shyFrom, shyTo] = b.cup?.shy ?? [Infinity, Infinity];
    const [enjoyFrom, enjoyTo] = b.cup?.enjoy ?? [Infinity, Infinity];
    shyAmt = damp(shyAmt, s.cupHeld ? smoothstep(s.cupTime, shyFrom, shyTo) : 0, 6, dt);
    enjoyAmt = damp(enjoyAmt, s.cupHeld ? smoothstep(s.cupTime, enjoyFrom, enjoyTo) : 0, s.cupHeld ? 3 : 8, dt);
    dizzyAmt = damp(dizzyAmt, s.dizzyUntil > now ? 1 : 0, 6, dt);
    const calm = (1 - enjoyAmt) * (1 - dizzyAmt);
    const rh = rhythmActive ? h : 0; // 音游长按程度

    // 捧脸 / 拉脸共用的"脸被托住"程度；害羞时更红
    uniforms.uCup.value = Math.max(s.cupAmount, h) * (1 + 0.6 * shyAmt);

    return {
      h, rh, rhythmActive,
      pullSides: s.pullSides,
      left: s.pullSides === 2 || s.grab.x >= 0 ? h : 0,
      right: s.pullSides === 2 || s.grab.x < 0 ? h : 0,
      es: {
        surprise: Math.max(s.cupAmount * (1 - 0.75 * shyAmt) * calm, h * (1 - rh)), // 惊讶慢慢褪掉
        mouth: Math.max(s.cupAmount * (1 - 0.45 * enjoyAmt), h * (1 - rh)), // 音游长按让出嘴型
      },
      shy: shyAmt * calm,
      enjoy: enjoyAmt,
      dizzy: dizzyAmt,
      rub: s.cupHeld ? s.rubLevel : 0, // 捧着时揉得多快（揉晕之前就有）
      afterglow: smoothstep(s.afterglow, 0, 0.45),
      sulk,
      pokeFace: smoothstep(pokeFace, 0, 1),
      pokeRaw: pokeFace,
      pokeAfter,
      combo: s.pokeCombo,
      roll: debug.roll ?? s.roll,
      egg: shownEgg,
      eggFade: ef,
    };
  };
}
