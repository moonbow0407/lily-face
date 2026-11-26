import * as THREE from 'three';
import { symbolUniforms, symbolCenter } from '../rig/symbols.js';
import { createVertexSymbols } from '../rig/vertexSymbols.js';
import { BlinkRhythm } from '../rig/springs.js';
import { MorphDriver } from './morphs.js';
import { createSignals } from './signals.js';

const { damp } = THREE.MathUtils;

/**
 * 整理彩蛋，返回运行时用的副本。彩蛋 = 拉脸时偶尔换成的另一套表情（morphs），可以再带一个 UV 漫画符号（symbol）。
 * 带符号的彩蛋补上贴片起点（预设位置的中心）；模型没有符号贴片时，带符号的彩蛋丢掉，只有表情的照常用。
 */
export function prepareSymbols(mesh, symbolMaterial, eggs = {}) {
  const ok = !!symbolMaterial && mesh.material.some((m) => m.name === symbolMaterial);
  const prep = (e) => {
    if (!e) return null;
    if (!e.symbol) return { ...e };
    return ok ? { ...e, from: symbolCenter(mesh, symbolMaterial, e.spot) } : null;
  };
  const list = (eggs.list ?? []).map(prep).filter(Boolean);
  return {
    chance: list.length ? eggs.chance ?? 0 : 0,
    tint: eggs.tint ?? [0.24, 0.5, 0.84],
    list,
    dizzy: prep(eggs.dizzy),
  };
}

/**
 * 每帧的脸：情绪信号 → 头颈动作、眨眼、漫画符号、表情（角色的表情表）。
 * ctx: { cfg, mesh, model, pose, s, pokes, sfx, symbols, debug }
 */
export function createFace(ctx) {
  const { cfg, mesh, model, pose, s, pokes, sfx, symbols, debug } = ctx;
  const { morphs: morphNames, symbolSpots = [], materials } = cfg.model;
  const morphs = new MorphDriver(mesh, morphNames, cfg.model.instantMorphs);
  const blink = new BlinkRhythm();
  blink.onTick = (second) => sfx.blinkTick(second);
  const updateVertexSymbols = createVertexSymbols(mesh, cfg.model);
  const signals = createSignals({ s, sfx, symbols, debug, mesh, symbolCenter, symbolMaterial: materials.symbol });

  let pullLean = 0, motionTime = 0;
  const _e = new THREE.Euler();
  const _q = new THREE.Quaternion();

  /** 头颈：待机轻微摇摆；被捧着、被拉时低头，单手拉时往被拉的一侧歪一点；享受时蹭手心，晕时画圈 */
  function moveHead({ dt, now, r, p }) {
    const lean = Math.max(s.cupAmount, p.h * 0.55) + 0.2 * p.sulk;
    const pullLeanTarget = s.pullSides === 1 ? -Math.sign(s.grab.x) * r * (p.rhythmActive ? 1.45 : 1) : 0;
    if (!s.pulling && !s.cupHeld) motionTime += dt;
    const u = motionTime;
    pullLean = damp(pullLean, pullLeanTarget, 9, dt);
    const f = 1 - lean;
    const ct = now / 1000;
    const { enjoy, dizzy } = p;
    _e.set(
      (Math.sin(u * 0.63) * 0.022 + Math.sin(u * 0.23) * 0.006) * f - 0.17 * lean + 0.035 * dizzy * Math.sin(now * 0.0052),
      Math.sin(u * 0.39) * 0.043 * f + 0.14 * p.sulk + 0.035 * enjoy * Math.sin(ct * 0.9),
      Math.sin(u * 0.47 + 0.5) * 0.026 * f + 0.06 * pullLean + enjoy * (0.07 + 0.045 * Math.sin(ct * 1.8)) + 0.045 * dizzy * Math.cos(now * 0.0052),
    );
    pose.headBone.quaternion.multiply(_q.setFromEuler(_e));
    _e.set(
      Math.sin(u * 0.63 - 0.3) * 0.009 * f - 0.085 * lean,
      Math.sin(u * 0.39 - 0.4) * 0.012 * f,
      Math.sin(u * 0.47) * 0.01 * f + 0.027 * pullLean,
    );
    pose.neckBone.quaternion.multiply(_q.setFromEuler(_e));
  }

  /** 漫画符号：位置直接到位，靠透明度淡入淡出，出现时从稍高处轻轻滑下来 */
  function showSymbol(egg, ef) {
    if (model.symbolMat) model.symbolMat.opacity = egg?.symbol ? ef : 0;
    for (const n of model.uvMorphs.names) model.uvMorphs.set(n, egg?.symbol === n ? 1 : 0);
    model.uvMorphs.update();
    for (const spot of symbolSpots) morphs.setRaw(spot, egg?.symbol && egg.spot === spot ? 1 : 0);
    if (!egg?.symbol) return; // 只有表情的彩蛋
    symbolUniforms.uSymFrom.value.copy(egg.from);
    symbolUniforms.uSymTo.value.set(egg.at[0], egg.at[1] + 0.07 * (1 - ef), egg.at[2]);
    symbolUniforms.uSymScale.value = egg.scale;
    symbolUniforms.uSymTint.value.set(...(egg.tint ?? symbols.tint));
  }

  return function updateFace({ dt, now, r, rhythmActive }) {
    const p = signals({ dt, now, rhythmActive });
    moveHead({ dt, now, r, p });

    // 眨眼：被拉、被戳、享受时不眨；被捧着时眨得更勤、偶尔连眨
    const suppressBlink = s.pulling || p.rh > 0.05 || p.pokeRaw > 0.02 || p.enjoy > 0.3 || p.afterglow > 0.05;
    p.blink = suppressBlink
      ? (blink.update(dt, false, true), damp(morphs.get('blink'), 0, 40, dt))
      : blink.update(dt, s.cupHeld, false);
    p.open = 1 - p.blink;
    p.pokes = pokes;

    showSymbol(p.egg, p.eggFade);

    // 害羞时眼神往旁边、往下躲
    _q.setFromEuler(_e.set(0.08 * p.shy, -0.22 * p.shy, 0));
    for (const b of pose.eyeBones) b.quaternion.multiply(_q);

    const targets = { blink: p.blink };
    cfg.personality.expressions(p, (k, v) => { targets[k] = (targets[k] ?? 0) + v; });
    if (debug.morphs) Object.assign(targets, debug.morphs);
    morphs.apply(targets, dt);
    if (debug.raw) morphs.setRaw(debug.raw, 1); // 工作台预览：按模型里的名字直接显示某个表情
    updateVertexSymbols(morphs, debug);
  };
}
