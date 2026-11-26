import * as THREE from 'three';
import { calib, toRef, configureCalibration } from './calibration.js';

/*
 * 脸颊形变用到的所有 uniform（GPU 端共享）。
 * 交互逻辑每帧改这里的值，着色器（cheekShaders.js）读取。
 */
export const POKE_SLOTS = 4;

export const uniforms = {
  uPokes: { value: Array.from({ length: POKE_SLOTS }, () => new THREE.Vector4()) },
  uGrab: { value: new THREE.Vector3() },
  uDelta: { value: new THREE.Vector3() },
  uPullSides: { value: 0 },
  uCheekJiggle: { value: new THREE.Vector2() },
  uPullBlush: { value: new THREE.Vector2() },
  uBlushHeight: { value: new THREE.Vector2(16.96, 16.96) },
  // 捧脸
  uCheekSpring: { value: 0 },
  uRadius: { value: calib.faceWidth * 0.2 },
  uCup: { value: 0 },
  // 前发避让：拉扯量（参考坐标）超过 slack 才开始推发丝，knee 是起步的柔和过渡，follow 是跟随比例。
  // 数值由角色配置的 hairAvoid 写入（见 configureRig）
  uHairSlack: { value: 0.11 },
  uHairKnee: { value: 0.03 },
  uHairFollow: { value: 0.8 },
  // 戳凹在眼睛下方淡出的高度（参考坐标 [开始, 完全消失]），由角色配置的 pokeFade 写入
  uPokeFade: { value: new THREE.Vector2(17.30, 17.46) },
};

/** 按角色配置初始化形变：坐标校准 + 前发避让参数。必须在给材质打补丁之前调用 */
export function configureRig({ calibration, hairAvoid, pokeFade }) {
  configureCalibration(calibration);
  if (pokeFade) uniforms.uPokeFade.value.set(...pokeFade);
  uniforms.uRadius.value = calib.faceWidth * 0.2;
  if (hairAvoid) {
    uniforms.uHairSlack.value = hairAvoid.slack;
    uniforms.uHairKnee.value = hairAvoid.knee;
    uniforms.uHairFollow.value = hairAvoid.follow;
  }
}

/** 脸颊可动度：耳前/侧后方的一块不动，避免撕裂（参考站同款遮罩） */
export function addCheekMobility(geometry) {
  const pos = geometry.attributes.position;
  const out = new Float32Array(pos.count);
  const p = new THREE.Vector3();
  const ss = THREE.MathUtils.smoothstep;
  const weight = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    toRef(p.fromBufferAttribute(pos, i), p);
    const b = ss(Math.abs(p.x), 0.47, 0.64) * ss(p.y, 16.92, 17.08) * (1 - ss(p.z, -0.22, 0.015));
    out[i] = 1 - b;
    // 捧脸时被手掌托住的那块脸颊肉
    const ax = Math.abs(p.x);
    weight[i] = out[i] * ss(ax, 0.32, 0.5) * (1 - ss(ax, 0.89, 1.05))
      * ss(p.y, 16.8, 17.04) * (1 - ss(p.y, 17.17, 17.38)) * ss(p.z, -0.02, 0.22);
  }
  geometry.setAttribute('aCheekMobility', new THREE.BufferAttribute(out, 1));
  geometry.setAttribute('aCheekWeight', new THREE.BufferAttribute(weight, 1));
}
