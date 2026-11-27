/**
 * 下载 PMX 原始字节。
 * 线上构建有 gzip 版（scripts/optimize-models.mjs 生成，体积约一半），浏览器支持 DecompressionStream 就用它；
 * 开发环境、老浏览器、或 gzip 版取不到时，回退到原始 .pmx。解压后的字节与原文件完全一致。
 */
export async function fetchPmx(url, sizeHint, onProgress) {
  if (import.meta.env.PROD && typeof DecompressionStream === 'function') {
    try {
      return await download(`${url}.gz`, 0, onProgress, true);
    } catch (err) {
      console.warn('[模型] gzip 版加载失败，改用原始 PMX', err);
    }
  }
  return download(url, sizeHint, onProgress, false);
}

/** 有等价 WebP 的 PNG 贴图地址集合；开发环境或取不到清单时为空（照常加载 PNG） */
export async function fetchWebpList() {
  if (!import.meta.env.PROD) return new Set();
  try {
    const res = await fetch('/models/webp.json');
    return new Set(res.ok ? await res.json() : []);
  } catch {
    return new Set();
  }
}

async function download(url, sizeHint, onProgress, gzipped) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}：${url}`);
  const total = Number(res.headers.get('content-length')) || sizeHint;
  const bytes = await readAll(res.body, (n) => onProgress(total ? Math.min(1, n / total) : 0));
  // 万一服务器自己带了 Content-Encoding，fetch 已经解过压，这里看文件头判断
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gzipped || !isGzip) return bytes.buffer;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

async function readAll(body, onBytes) {
  const reader = body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onBytes(loaded);
  }
  const out = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}
