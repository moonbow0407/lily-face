import * as THREE from 'three';

/** MMDLoader 生成的表情是绝对坐标；换成相对偏移，便于拆分/叠加 */
export function makeMorphsRelative(geometry) {
  if (geometry.morphTargetsRelative) return;
  const base = geometry.attributes.position.array;
  for (const attr of geometry.morphAttributes.position ?? []) {
    const a = attr.array;
    for (let i = 0; i < a.length; i++) a[i] -= base[i];
    attr.needsUpdate = true;
  }
  const nb = geometry.attributes.normal?.array;
  for (const attr of geometry.morphAttributes.normal ?? []) {
    const a = attr.array;
    for (let i = 0; i < a.length; i++) a[i] -= nb[i];
    attr.needsUpdate = true;
  }
  geometry.morphTargetsRelative = true;
}

/**
 * 漫画符号贴片的位置/大小微调：模型预设的位置偏大、偏远，
 * 这里把贴片从预设中心 uSymFrom 挪到 uSymTo 并缩放（在蒙皮前做，会跟着头动）。
 */
export const symbolUniforms = {
  uSymFrom: { value: new THREE.Vector3() },
  uSymTo: { value: new THREE.Vector3() },
  uSymScale: { value: 1 },
  uSymTint: { value: new THREE.Vector3(0.24, 0.50, 0.84) }, // 填充主色（下深上浅）
};
export function setupSymbol(material) {
  material.transparent = true;
  material.depthWrite = false;
  material.opacity = 0;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, symbolUniforms);
    shader.vertexShader = 'uniform vec3 uSymFrom, uSymTo;\nuniform float uSymScale;\nvarying vec3 vSymLocal;\n' +
      shader.vertexShader.replace('#include <morphtarget_vertex>', `#include <morphtarget_vertex>
vSymLocal = transformed - uSymFrom;
transformed = uSymTo + vSymLocal * uSymScale;`);
    shader.fragmentShader = 'uniform vec3 uSymTint;\nvarying vec3 vSymLocal;\n' + recolorSymbol(shader.fragmentShader, 'uSymTint', 'vSymLocal.y / 1.1');
  };
  material.customProgramCacheKey = () => 'symbol';
  material.needsUpdate = true;
}

/**
 * 漫画符号统一画风（贴片符号和顶点表情符号共用）：原图常是饱和色 + 粗黑线，和模型的柔和色调不搭。
 * 线稿改成柔和的深蓝灰，填充改成上浅下深的 tint 色，保留原图高光；不吃光照，半透明。
 * tint：填充色 uniform 名；height：符号内的相对高度表达式（-0.5 底 .. 0.5 顶）。
 */
export function recolorSymbol(fragmentShader, tint, height) {
  return fragmentShader
    .replace('#include <map_fragment>', `#include <map_fragment>
float symLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
float symLine = 1.0 - smoothstep(0.03, 0.2, symLum);
float symTop = clamp(${height} + 0.5, 0.0, 1.0);
vec3 symFill = mix(${tint}, mix(${tint}, vec3(1.0), 0.62), smoothstep(0.2, 0.85, symTop));
vec3 symColor = mix(symFill, vec3(0.08, 0.13, 0.26), symLine);
symColor = mix(symColor, vec3(1.0), smoothstep(0.7, 0.95, symLum) * (1.0 - symLine));
float symAlpha = diffuseColor.a * mix(0.82, 0.95, symLine);`)
    .replace('#include <opaque_fragment>', `outgoingLight = symColor;
diffuseColor.a = symAlpha;
#include <opaque_fragment>`);
}

/** 某个位置表情生效后，贴片的中心（绑定姿态坐标） */
export function symbolCenter(mesh, materialName, morphName) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position.array;
  const morph = geo.morphAttributes.position[mesh.morphTargetDictionary[morphName]].array;
  const matIndex = mesh.material.findIndex((m) => m.name === materialName);
  const seen = new Set();
  const c = new THREE.Vector3();
  for (const g of geo.groups) {
    if (g.materialIndex !== matIndex) continue;
    for (let i = g.start; i < g.start + g.count; i++) {
      const v = geo.index.array[i];
      if (seen.has(v)) continue;
      seen.add(v);
      c.x += pos[v * 3] + morph[v * 3]; c.y += pos[v * 3 + 1] + morph[v * 3 + 1]; c.z += pos[v * 3 + 2] + morph[v * 3 + 2];
    }
  }
  return c.divideScalar(Math.max(1, seen.size));
}

/** UV 表情（MMDLoader 不支持）：漫画符号贴片靠它切换图案 */
export class UvMorphs {
  constructor(geometry, pmxMorphs) {
    this.uv = geometry.attributes.uv;
    this.uv.setUsage(THREE.DynamicDrawUsage);
    this.base = this.uv.array.slice();
    this.morphs = new Map();
    for (const m of pmxMorphs) {
      if (m.type !== 3) continue;
      const idx = new Uint32Array(m.elements.length);
      const off = new Float32Array(m.elements.length * 2);
      m.elements.forEach((e, i) => { idx[i] = e.index; off[i * 2] = e.uv[0]; off[i * 2 + 1] = e.uv[1]; });
      this.morphs.set(m.name, { idx, off });
    }
    this.weights = new Map();
    this.dirty = false;
  }
  get names() { return [...this.morphs.keys()]; }
  set(name, w) {
    if (!this.morphs.has(name)) return;
    if ((this.weights.get(name) ?? 0) === w) return;
    this.weights.set(name, w);
    this.dirty = true;
  }
  update() {
    if (!this.dirty) return;
    this.dirty = false;
    const a = this.uv.array, b = this.base;
    for (const { idx } of this.morphs.values()) for (const i of idx) { a[i * 2] = b[i * 2]; a[i * 2 + 1] = b[i * 2 + 1]; }
    for (const [name, w] of this.weights) {
      if (!w) continue;
      const { idx, off } = this.morphs.get(name);
      for (let k = 0; k < idx.length; k++) { a[idx[k] * 2] += off[k * 2] * w; a[idx[k] * 2 + 1] += off[k * 2 + 1] * w; }
    }
    this.uv.needsUpdate = true;
  }
}
