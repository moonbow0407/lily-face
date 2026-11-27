import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gzipSync, constants } from 'node:zlib';
import sharp from 'sharp';

/** 运行时读取的清单：哪些 PNG 有等价的 WebP（loading.js 用） */
export const WEBP_LIST = 'models/webp.json';

/**
 * 构建后处理 dist/models：只做无损优化，画质不变。
 * - PMX 另存一份 gzip（.pmx.gz）。Cloudflare Pages 不压缩 application/octet-stream，
 *   浏览器端用 DecompressionStream 解压；原 .pmx 保留，给不支持的浏览器兜底。
 * - PNG 贴图转无损 WebP，逐像素（含透明像素下的颜色）和 ICC 配置都校验一致才采用，写进 WEBP_LIST。
 *   校验不过的（如带灰度 ICC 的灰度图，WebP 没有灰度模式）保留 PNG。原 PNG 一律保留作兜底。
 */
export function optimizeModels() {
  let outDir = 'dist';
  return {
    name: 'optimize-models',
    apply: 'build',
    configResolved(cfg) { outDir = join(cfg.root, cfg.build.outDir); },
    async closeBundle() {
      let files;
      try { files = walk(join(outDir, 'models')); } catch { return; } // 没有模型（例如只构建引擎）就跳过
      let before = 0;
      let after = 0;
      for (const f of files.filter((p) => /\.pmx$/i.test(p))) {
        const raw = readFileSync(f);
        const gz = gzipSync(raw, { level: constants.Z_BEST_COMPRESSION });
        writeFileSync(`${f}.gz`, gz);
        before += raw.length;
        after += gz.length;
      }
      const converted = [];
      for (const f of files.filter((p) => /\.png$/i.test(p))) {
        const png = readFileSync(f);
        const url = `/${relative(outDir, f).split(sep).join('/')}`;
        const webp = await sharp(png).keepIccProfile().webp({ lossless: true, exact: true, effort: 6 }).toBuffer();
        const problem = await compare(png, webp);
        before += png.length;
        if (problem || webp.length >= png.length) {
          console.log(`[optimize-models] 保留 PNG：${url}（${problem ?? 'WebP 不更小'}）`);
          after += png.length;
          continue;
        }
        writeFileSync(f.replace(/\.png$/i, '.webp'), webp);
        converted.push(url);
        after += webp.length;
      }
      writeFileSync(join(outDir, WEBP_LIST), JSON.stringify(converted));
      const mb = (n) => (n / 1048576).toFixed(1);
      console.log(`[optimize-models] 模型 + 贴图下载量 ${mb(before)} MB → ${mb(after)} MB（无损，${converted.length} 张贴图转 WebP）`);
    },
  };
}

function walk(d) {
  return readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
}

/**
 * 两边按同一色彩空间解成 RGBA 原始像素逐字节比较（含透明像素下的颜色），ICC 配置也必须一模一样。
 * 一致返回 null，否则返回原因。需要 sharp ≥0.35：更早的版本不认 exact，会清掉透明像素下的颜色。
 */
async function compare(png, webp) {
  // gAMA / cHRM 色彩块浏览器会用来做色彩校正，WebP 存不下；没有 ICC 兜着就保留 PNG
  const chunks = pngChunks(png);
  if ((chunks.has('gAMA') || chunks.has('cHRM')) && !chunks.has('iCCP') && !chunks.has('sRGB')) {
    return 'gAMA/cHRM 色彩信息 WebP 存不下';
  }
  const [pm, wm] = await Promise.all([sharp(png).metadata(), sharp(webp).metadata()]);
  const sameIcc = (!pm.icc && !wm.icc) || (pm.icc && wm.icc && pm.icc.equals(wm.icc));
  if (!sameIcc) return 'ICC 配置无法原样保留';
  const decode = (input) => sharp(input).keepIccProfile().ensureAlpha().toColourspace('srgb').raw()
    .toBuffer({ resolveWithObject: true });
  const [a, b] = await Promise.all([decode(png), decode(webp)]);
  const same = a.info.width === b.info.width && a.info.height === b.info.height && a.data.equals(b.data);
  return same ? null : '像素不一致';
}

/** PNG 里出现过的块类型 */
function pngChunks(buf) {
  const types = new Set();
  for (let o = 8; o + 8 <= buf.length; o += 12 + buf.readUInt32BE(o)) types.add(buf.toString('latin1', o + 4, o + 8));
  return types;
}
