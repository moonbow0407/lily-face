/*
 * 模型层：模型文件本身决定的东西（材质、骨骼、表情名、坐标校准）。
 */
import hairRest from './hairRest.json';

export default {
  file: "/models/lily/lily.pmx",
  bytes: 20766047, // 服务器不给 content-length 时，用它估算加载进度
  texDir: "tex", // 贴图目录在磁盘上的真实名字（区分大小写；check 会逐张核对）

  /*
   * 模型坐标 ↔ 参考坐标：model.x = ref.x * sx, model.y = ref.y + dy, model.z = ref.z + dz
   * 按地标（嘴、鼻尖、眼睛高度，睫毛外缘宽度）对齐达妮娅的人工校准估算：{"eyeY":17.466,"eyeZ":0.277,"lashX":0.79}
   */
  calibration: {"sx":0.931,"dy":-0.043,"dz":-0.018,"faceWidth":2.142},

  /** 前发避让：沿用达妮娅的值，目测确认过拉脸时不穿模 */
  hairAvoid: { slack: 0.11, knee: 0.03, follow: 0.8 },

  /** 戳凹在眼睛下方淡出的高度：比达妮娅（17.30~17.46）低一些，否则闭眼时戳脸颊上部，眼珠会从下眼睑露出来 */
  pokeFade: [17.14, 17.32],

  /** 镜头取景（模型坐标），按眼睛高度和脸宽从达妮娅的取景换算 */
  camera: {"wideY":16.897,"wideYPortrait":16.647,"closeY":17.227,"wideHeight":6.69,"wideWidth":4.81,"wideWidthPortrait":3.24,"closeHeight":1.99,"closeWidth":1.78},

  materials: {
    skin: ["face","Cheek"], // 拉 + 戳 + 泛红
    hitTest: ["face"], // 点击检测只看这些材质
    mouth: ["teeth","舌头"], // 口腔、舌头：只跟随戳
    followPoke: ["bai","eye","eye hi2","hi","眉口","睫毛","bai2"], // 眼睛、睫毛等：只跟随戳（戳脸颊上部时眼珠不从皮肤后面露出来）
    hairOnCheek: ["MI_Bangs1","MI_Bangs1+"], // 垂在脸颊前的发丝：快穿模时被推开（脸颊前的粉色发束在 Bangs 里，不在 Hair 里）
    symbol: null, // 漫画符号贴片
    noOutline: ["face","Cheek","teeth","舌头","emo1","emo43","emo目"], // 会变形或是贴纸的材质不画描边
  },

  bones: {
    head: "頭",
    neck: "首",
    eyes: ["右目","左目"],
    /** 手臂放下：[骨骼名, x, y, z]（弧度，YXZ 顺序）。默认按 A 字型模型，姿势不对就调 */
    restPose: [["左腕",0,0,-0.62],["右腕",0,0,0.62],["左ひじ",0,-0.25,0],["右ひじ",0,0.25,0]],
  },

  /** 头发静止姿势（打开 ?char=<id>&bake 烘焙得到） */
  hairRest,

  /** 表情：语义名 → 模型里的顶点表情名 */
  morphs: {
    blink: "まばたき",
    browDown: "下",
    browUp: "上",
    browTrouble: "困る",
    browTroubleL: "左困る",
    browTroubleR: "右困る",
    eyeSurprise: "びっくり",
    eyeHalf: "じと目",
    eyeSmile: "笑い", // 两眼弯成弧线，明显
    // eyeRelaxL / eyeRelaxR 不映射：这个模型的「なごみ」是一条黑色长条，会盖住眼睛
    wink: "ウィンク", // 闭左眼（画面右侧）
    winkR: "ウィンク右", // 闭右眼（画面左侧）
    mouthNarrow: "口横狭め",
    mouthCornerDown: "口角下げ",
    mouthCornerUp: "口角上げ",
    mouthCornerUpL: "左口角上げ",
    mouthCornerUpR: "右口角上げ",
    mouthWideL: "左口横広げ",
    mouthWideR: "右口横広げ",
    mouthForward: "口前",
    mouthWedge: "∧", // 很淡
    mouthOpen: "あ", // 小张嘴，看得出
    mouthO: "お", // 圆嘴，比「あ」更明显
    tongue: "ぺろっ",
    grin: "にやり",
    smileSoft: "にこり", // 很淡
    shy: "照れ2", // 淡淡的脸红
    strongShy: "照れ", // 更浓的脸红（不闭眼）
    pout: "(○｀ε´○)", // 很淡
    serious: "真面目",
    // ---- 眼部贴片：盖在眼睛上的漫画眼，最明显 ----
    squeezeEyes: "はぅ", // ><
    xEyes: "X_X", // 黑色 X
    starEyes: "星目", // 瞳孔里一颗星，很淡
    bigEyes: "はちゅ目", // 白圈呆眼
    pupilSmall: "瞳小", // 瞳孔缩小，吃惊
    // ---- 漫画符号（emo43 材质；位置、大小、颜色见下方 vertexSymbols） ----
    angryMark: "angry", // 💢
    gloomLines: "lost for word", // 竖线
    dizzyMark: "annoyed", // 乱线团（揉晕时的彩蛋，对应达妮娅的乱线）
    // mouthTriangle: '',  // 模型里没找到
  },

  /**
   * 不做平滑的表情：「笑い」「ウィンク」半开半合时眼珠会从睫毛下露出来，只用 0 / 1。
   * 眯眼笑的过渡在表情表里用眨眼衔接；单眼眨眼直接切换（和真眨眼一样快）
   */
  instantMorphs: ['eyeSmile', 'wink', 'winkR'],

  /** 漫画符号的预设位置（位置表情名） */
  symbolSpots: [],

  /**
   * 顶点表情做的漫画符号：缩小、摆到头边、按达妮娅汗滴的画风重新上色（见 src/rig/vertexSymbols.js）。
   * at 是绑定姿态坐标（眼睛高约 17.47，x<0 是画面左侧）；tint 是填充色。
   */
  vertexSymbols: {
    material: 'emo43',
    list: {
      angryMark: { at: [-0.5, 17.98, 0.66], scale: 0.32, tint: [0.88, 0.42, 0.5], clip: 0.75 },
      gloomLines: { at: [0.62, 17.88, 0.62], scale: 0.32, tint: [0.42, 0.38, 0.55] },
      dizzyMark: { at: [0.66, 17.86, 0.62], scale: 0.32, tint: [0.42, 0.38, 0.55] }, // 颜色同达妮娅的乱线
    },
  },
};
