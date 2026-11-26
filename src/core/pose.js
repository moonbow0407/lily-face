import * as THREE from 'three';
import { MMDAnimationHelper } from 'three/examples/jsm/animation/MMDAnimationHelper.js';

/**
 * 骨骼与基础姿势：手臂下垂、头发静止姿势（烘焙或套用）、每帧复位。
 *
 * 头发静止姿势：模型原始姿势里常有几缕发梢插在脸颊里，本来靠物理碰撞推出去。
 * 开发时用 ?bake 跑一次物理，让头发、袖子在重力和碰撞下自然落定，导出 JSON；
 * 正式页面直接套用这份姿势、不开物理——不穿模、不会自己飘，也不用下载物理引擎。
 * helper 只负责 IK 与付与骨（眼睛、肩膀等联动）。
 */
export async function setupPose({ mesh, bones: cfg, hairRest, bake, onBakeProgress }) {
  const bone = Object.fromEntries(mesh.skeleton.bones.map((b) => [b.name, b]));
  for (const [name, x, y, z] of cfg.restPose ?? []) {
    bone[name]?.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ')));
  }
  mesh.updateMatrixWorld(true);

  const snapshot = () => mesh.skeleton.bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone() }));
  let rest = snapshot();
  function resetPose() {
    const bs = mesh.skeleton.bones;
    for (let i = 0; i < bs.length; i++) { bs[i].position.copy(rest[i].p); bs[i].quaternion.copy(rest[i].q); }
  }
  const headBone = bone[cfg.head];
  const neckBone = bone[cfg.neck];
  const restHeadWorld = headBone.getWorldQuaternion(new THREE.Quaternion());

  const helper = new MMDAnimationHelper();
  if (bake) {
    helper.add(mesh, { physics: true, warmup: 0, unitStep: 1 / 65, maxStepNum: 3 });
    const before = mesh.skeleton.bones.map((b) => b.quaternion.clone());
    for (let i = 0; i < 240; i++) {
      resetPose();
      helper.update(1 / 60);
      if (i % 20 === 19) { onBakeProgress?.((i + 1) / 240); await new Promise((r) => requestAnimationFrame(r)); }
    }
    const out = {};
    mesh.skeleton.bones.forEach((b, i) => {
      if (b.quaternion.angleTo(before[i]) < 1e-4) return;
      out[b.name] = [...b.quaternion.toArray(), ...b.position.toArray()].map((v) => +v.toFixed(6));
    });
    window.__bakedHairRest = JSON.stringify(out);
    console.info(`[bake] ${Object.keys(out).length} 根骨骼（开发服务器会自动写入角色目录的 hairRest.json）`);
    helper.enable('physics', false);
  } else {
    helper.add(mesh, { physics: false });
    for (const [name, v] of Object.entries(hairRest ?? {})) {
      const b = bone[name];
      if (!b) continue;
      b.quaternion.fromArray(v, 0);
      b.position.fromArray(v, 4);
    }
  }
  rest = snapshot();

  const _q = new THREE.Quaternion();
  return {
    bone,
    headBone,
    neckBone,
    eyeBones: (cfg.eyes ?? []).map((n) => bone[n]).filter(Boolean),
    helper,
    resetPose,
    /** 世界中的位移 → 绑定姿态（去掉头部当前的旋转） */
    worldDeltaToBind(v) {
      headBone.getWorldQuaternion(_q).invert().premultiply(restHeadWorld);
      return v.applyQuaternion(_q);
    },
  };
}
