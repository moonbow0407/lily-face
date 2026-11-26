import * as THREE from 'three';
import { recolorSymbol } from './symbols.js';

const { smoothstep } = THREE.MathUtils;

/**
 * 顶点表情做的漫画符号（💢、竖线、汗滴……）：很多模型把符号放在一个小材质上，平时藏在头后面，
 * 表情把它们挪到头顶。原样显示又大又艳，和模型画风不搭；这里让它们和贴片符号（达妮娅的汗滴）一个画风：
 * - 位置 / 大小：符号直接出现在 at（绑定姿态坐标），按 scale 缩小，出现时从稍高处滑下来
 * - 淡入淡出：靠透明度，不让符号从头后面"飞"过来
 * - 上色：同 recolorSymbol（柔和线稿 + 渐变填充，半透明）
 *
 * 配置 model.vertexSymbols = { material, list: { 语义名: { at: [x,y,z], scale, tint: [r,g,b], clip } } }，
 * clip（可选）：只保留离符号中心这么远以内的部分（相对半高），贴图集里相邻图案漏进来时用。
 * 语义名在 model.morphs 里映射到模型表情；表情表照常 add('angryMark', 1) 即可。
 */
export function createVertexSymbols(mesh, cfg) {
  const vs = cfg.vertexSymbols;
  const material = vs && mesh.material.find((m) => m.name === vs.material);
  if (!material) return () => {};

  const uniforms = {
    uVSymFrom: { value: new THREE.Vector3() },
    uVSymTo: { value: new THREE.Vector3() },
    uVSymScale: { value: 1 },
    uVSymW: { value: 0 }, // 当前符号的表情值：顶点按它还原到完全展开的位置
    uVSymHeight: { value: 1 },
    uVSymClip: { value: 100 },
    uVSymTint: { value: new THREE.Vector3(0.24, 0.5, 0.84) },
  };
  material.transparent = true;
  material.depthWrite = false;
  material.opacity = 0;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'uniform vec3 uVSymFrom, uVSymTo;\nuniform float uVSymScale, uVSymW;\nvarying vec3 vSymLocal;\n' +
      shader.vertexShader.replace('#include <morphtarget_vertex>', `#include <morphtarget_vertex>
vSymLocal = vec3(0.0);
vec3 vsMove = transformed - position;
if (uVSymW > 0.01 && dot(vsMove, vsMove) > 1e-6) {
  vSymLocal = position + vsMove / uVSymW - uVSymFrom;
  transformed = uVSymTo + vSymLocal * uVSymScale;
}`);
    shader.fragmentShader = 'uniform vec3 uVSymTint;\nuniform float uVSymHeight, uVSymClip;\nvarying vec3 vSymLocal;\n' +
      recolorSymbol(shader.fragmentShader, 'uVSymTint', 'vSymLocal.y / uVSymHeight')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (length(vSymLocal.xy) > uVSymClip * uVSymHeight * 0.5) discard;');
  };
  material.customProgramCacheKey = () => 'vertex-symbol';
  material.needsUpdate = true;

  // 每个符号展开后的中心和高度（只看被这个表情挪动的顶点）
  const geo = mesh.geometry;
  const pos = geo.attributes.position.array;
  const matIndex = mesh.material.indexOf(material);
  const inMat = new Set();
  for (const g of geo.groups) if (g.materialIndex === matIndex) for (let i = g.start; i < g.start + g.count; i++) inMat.add(geo.index.array[i]);
  const list = [];
  for (const [key, opt] of Object.entries(vs.list ?? {})) {
    const name = cfg.morphs?.[key];
    const mi = mesh.morphTargetDictionary[name];
    if (mi === undefined) continue;
    const d = geo.morphAttributes.position[mi].array;
    const c = new THREE.Vector3();
    let n = 0, lo = Infinity, hi = -Infinity;
    for (const v of inMat) {
      if (Math.abs(d[v * 3]) + Math.abs(d[v * 3 + 1]) + Math.abs(d[v * 3 + 2]) < 1e-4) continue;
      const y = pos[v * 3 + 1] + d[v * 3 + 1];
      c.x += pos[v * 3] + d[v * 3]; c.y += y; c.z += pos[v * 3 + 2] + d[v * 3 + 2];
      lo = Math.min(lo, y); hi = Math.max(hi, y); n++;
    }
    if (n) list.push({ key, name, center: c.divideScalar(n), height: Math.max(0.05, hi - lo), ...opt });
  }

  /** 每帧：选当前最明显的符号，摆到位置上，按表情值淡入淡出 */
  return function update(morphs, debug) {
    let best = null, w = 0;
    for (const s of list) {
      const v = debug.raw === s.name ? 1 : morphs.get(s.key);
      if (v > w) { w = v; best = s; }
    }
    material.opacity = smoothstep(w, 0.02, 0.6);
    uniforms.uVSymW.value = best ? w : 0;
    if (!best) return;
    uniforms.uVSymFrom.value.copy(best.center);
    uniforms.uVSymTo.value.set(best.at[0], best.at[1] + 0.07 * (1 - smoothstep(w, 0, 1)), best.at[2]);
    uniforms.uVSymScale.value = best.scale ?? 0.5;
    uniforms.uVSymHeight.value = best.height;
    uniforms.uVSymClip.value = best.clip ?? 100;
    uniforms.uVSymTint.value.set(...(best.tint ?? vs.tint ?? [0.24, 0.5, 0.84]));
  };
}
