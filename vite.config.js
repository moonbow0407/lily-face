import { defineConfig } from 'vite';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 开发服务器专用：?bake 烘焙完头发后，页面把结果 POST 到这里，直接写进 src/characters/<id>/hairRest.json，
 * 不用再从控制台复制。只在 npm run dev 时存在，构建产物里没有。
 */
function hairRestWriter() {
  return {
    name: 'port-hair-rest',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__port/hair-rest', (req, res) => {
        const id = new URL(req.url, 'http://x').searchParams.get('char') ?? '';
        const dir = join(server.config.root, 'src/characters', id);
        if (req.method !== 'POST' || !/^[a-z][a-z0-9-]*$/.test(id) || !existsSync(dir)) {
          res.statusCode = 400;
          return res.end('bad request');
        }
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          try {
            const bones = JSON.parse(body);
            writeFileSync(join(dir, 'hairRest.json'), `${JSON.stringify(bones)}\n`);
            res.end(`saved ${Object.keys(bones).length}`);
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  build: { target: 'es2022' },
  server: { port: 5173, strictPort: true },
  plugins: [hairRestWriter()],
});
