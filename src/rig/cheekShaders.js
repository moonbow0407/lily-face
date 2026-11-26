/*
 * 脸颊形变（GPU 着色器）
 * 公式移植自参考站，数值都在参考坐标里（见 calibration.js）。
 * 材质分四类：
 *   face  = 脸部皮肤：拉 + 戳 + 泛红
 *   mouth = 口腔、舌头：只跟随戳（避免穿模）
 *   hair  = 垂在脸颊前的前发：只在快穿模时被推开
 *   描边  = OutlineEffect 的独立着色器，前发描边要跟着发丝一起动
 */
import { calib } from './calibration.js';
import { uniforms, POKE_SLOTS } from './uniforms.js';

const HEAD = /* glsl */ `
uniform vec4 uPokes[${POKE_SLOTS}];
uniform vec3 uGrab, uDelta;
uniform float uPullSides, uCheekSpring, uRadius, uHairSlack, uHairKnee, uHairFollow;
uniform vec2 uCheekJiggle, uPokeFade;
attribute float aCheekMobility;
attribute float aCheekWeight;
`;

// 戳：凹陷 → 回弹时脸颊鼓起，并向四周摊开
const POKE = /* glsl */ `
{
 float indentation=0.0;
 float cheekBulge=0.0;
 vec2 spread=vec2(0.0);
 for(int i=0;i<${POKE_SLOTS};i++){
  if(uPokes[i].w==0.0)continue;
  vec3 offset=(rp-uPokes[i].xyz)/vec3(.38,.32,.46);
  float r2=dot(offset,offset);
  spread+=uPokes[i].w*offset.xy*exp(-.95*r2);
  float side=sign(uPokes[i].x);
  vec3 padCenter=uPokes[i].xyz+vec3(side*.22,-.035,-.09);
  vec3 padOffset=(rp-padCenter)/vec3(.46,.36,.53);
  cheekBulge+=max(-uPokes[i].w,0.0)*exp(-dot(padOffset,padOffset));
  indentation+=uPokes[i].w*(1.0-.43*r2)*exp(-r2);
 }
 float lipBand=1.0-smoothstep(.08,.19,abs(rp.y-16.985));
 float cheekSide=smoothstep(mix(.12,.27,lipBand),mix(.36,.50,lipBand),abs(rp.x));
 float poke=indentation/(1.0+2.8*abs(indentation))*aCheekMobility
  *cheekSide*smoothstep(16.66,16.88,rp.y)*(1.0-smoothstep(uPokeFade.x,uPokeFade.y,rp.y));
 poke-=.40*max(poke,0.0);
 float padMask=aCheekMobility*cheekSide*smoothstep(16.59,16.84,rp.y)*(1.0-smoothstep(uPokeFade.x-.06,uPokeFade.y-.01,rp.y));
 float fullness=cheekBulge/(1.0+2.0*abs(cheekBulge));
 rd+=vec3(sign(rp.x)*.76,.17,.58)*fullness*padMask;
 rd.xy+=spread*.60*padMask;
 rd-=poke*normalize(vec3(rp.x*1.65,-.38,1.0));
}
`;

// 拉：抓住脸颊肉往外扯（单手只动一侧，双手两侧对称），松手后沿轮廓抖一下
const PULL = /* glsl */ `
// 捧脸：双手托住，脸颊肉被往上、往前挤；按住时还能轻轻推一推
rd+=vec3(-sign(rp.x)*.036,.073,.102)*uCheekSpring*aCheekWeight;
if(uPullSides<.5){
 float influence=1.0-smoothstep(0.0,uRadius,distance(rp,uGrab));
 rd+=uDelta*influence*influence*aCheekWeight;
}else{
 float sameSide=sign(rp.x)*sign(uGrab.x);
 float lateral=abs(rp.x);
 float sideArc=smoothstep(.42,.82,lateral);
 float centerZ=uGrab.z-.39*sideArc;
 vec3 offset=vec3((lateral-abs(uGrab.x))/.44,(rp.y-uGrab.y)/.32,(rp.z-centerZ)/.51);
 float r2=dot(offset,offset);
 float pad=aCheekMobility*(1.0+.65*r2)*exp(-r2)*smoothstep(.16,.43,lateral)
  *smoothstep(16.62,16.91,rp.y)*(1.0-smoothstep(17.14,17.43,rp.y));
 if(sameSide>0.0 || uPullSides>1.5){
  float rim=smoothstep(.64,.98,lateral);
  float lateralTravel=uDelta.x*sameSide*(1.0-.28*rim);
  float outward=uDelta.x*sign(uGrab.x);
  float down=max(-uDelta.y,0.0);
  float softPad=smoothstep(16.68,16.96,rp.y)*(1.0-.72*rim);
  float verticalTravel=max(uDelta.y,0.0)*(1.0-.5*rim)-down*.86*softPad;
  // 脸颊外缘（被发丝盖住的那圈）少往前顶，免得从发丝里拱出来
  rd+=vec3(lateralTravel,verticalTravel,uDelta.z+.32*outward*(1.0-.55*rim)+.30*down*softPad)*pad;
 }
}
{
 float cheekX=abs(rp.x);
 float jiggleWeight=smoothstep(.18,.48,cheekX)*smoothstep(16.60,16.91,rp.y)
  *(1.0-smoothstep(17.12,17.43,rp.y))*smoothstep(-.56,-.12,rp.z)*aCheekMobility;
 float jiggle=mix(uCheekJiggle.x,uCheekJiggle.y,step(0.0,rp.x))*jiggleWeight;
 rd+=vec3(sign(rp.x)*.078,-(rp.y-17.02)*.27,.074)*jiggle;
}
`;

// 前发：只在脸颊快要顶穿发丝时才被推开。
// 发丝和脸颊之间本来有一点空隙：拉扯量没超过这段余量（uHairSlack）时发丝完全不动，
// 超过后经过一段柔和的过渡（uHairKnee）才开始跟随，而且只跟随超出的那部分。
// 整段平移（不用皮肤那种局部高斯，否则发丝上会鼓出一个包），往上过渡到发根不动；
// 只横向 + 略往前，不上下拉长发丝
const HAIR_PULL = /* glsl */ `
{
 float lateral=abs(rp.x);
 float band=smoothstep(.22,.46,lateral)*(1.0-smoothstep(17.15,17.65,rp.y))
  *smoothstep(15.7,16.45,rp.y)*smoothstep(-.45,-.12,rp.z);
 float sameSide=sign(rp.x)*sign(uGrab.x);
 if(uPullSides>.5 && (sameSide>0.0 || uPullSides>1.5)){
  float outward=max(uDelta.x*sign(uGrab.x),0.0);
  float t=outward-uHairSlack;
  float k=max(uHairKnee,1e-4);
  float excess=t<=-k?0.0:t>=k?t:(t+k)*(t+k)/(4.0*k);
  rd+=vec3(sign(rp.x)*excess*uHairFollow,0.0,excess*.3)*band;
 }
}
`;

// 拉久了脸颊泛红（只在脸部材质上）
const BLUSH = /* glsl */ `
{
 float side=step(0.0,vRefPos.x);
 float height=mix(uBlushHeight.x,uBlushHeight.y,side);
 float lateral=abs(vRefPos.x);
 float padDepth=.24-.39*smoothstep(.42,.82,lateral);
 vec3 padOffset=(vec3(lateral,vRefPos.y,vRefPos.z)-vec3(.57,height,padDepth))/vec3(.29,.18,.42);
 float warmth=exp(-dot(padOffset,padOffset))*mix(uPullBlush.x,uPullBlush.y,side);
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.0,.70,.72),.55*warmth);
 // 捧脸/拉扯时颧骨一带微微泛红
 vec2 cheekCoord=vec2((abs(vRefPos.x)-.54)/.34,(vRefPos.y-17.25)/.15);
 float cheekTint=exp(-dot(cheekCoord,cheekCoord))*uCup*smoothstep(.05,.30,vRefPos.z);
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.0,.72,.74),.55*cheekTint);
}
`;

const vertexBody = (kind) => `
vec3 rp=vec3(position.x/${calib.sx.toFixed(4)},position.y-(${calib.dy.toFixed(4)}),position.z-(${calib.dz.toFixed(4)}));
${kind === 'hair' ? '' : 'vRefPos=rp;'}
vec3 rd=vec3(0.0);
${kind === 'face' ? PULL : kind === 'hair' ? HAIR_PULL : ''}
${kind === 'hair' ? '' : POKE}
transformed+=vec3(rd.x*${calib.sx.toFixed(4)},rd.y,rd.z);
`;

const injectVertex = (shader, kind) => {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = HEAD + (kind === 'hair' ? '' : 'varying vec3 vRefPos;\n')
    + shader.vertexShader.replace('#include <morphtarget_vertex>', `#include <morphtarget_vertex>\n${vertexBody(kind)}`);
};

/**
 * kind: 'face' = 拉 + 戳 + 泛红；'mouth' = 只跟随戳（口腔、舌头，避免穿模）；
 * 'hair' = 只跟随拉（垂在脸颊前的发丝随脸颊一起被拉开，避免脸颊从头发里穿出来）
 */
export function patchMaterial(material, kind) {
  material.onBeforeCompile = (shader) => {
    injectVertex(shader, kind);
    if (kind === 'hair') return;
    let frag = `uniform vec2 uPullBlush, uBlushHeight;\nuniform float uCup;\nvarying vec3 vRefPos;\n` + shader.fragmentShader;
    if (kind === 'face') frag = frag.replace('#include <color_fragment>', `#include <color_fragment>\n${BLUSH}`);
    shader.fragmentShader = frag;
  };
  material.customProgramCacheKey = () => `cheek-${kind}`;
  material.needsUpdate = true;
}

/** OutlineEffect 的描边材质用的是独立着色器，头发描边也要跟着发丝一起位移 */
export function patchOutlineMaterial(material) {
  material.onBeforeCompile = (shader) => injectVertex(shader, 'hair');
  material.customProgramCacheKey = () => 'cheek-hair-outline';
  material.needsUpdate = true;
}
