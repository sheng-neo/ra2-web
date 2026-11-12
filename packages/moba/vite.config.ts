import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * 多文件构建专用：把入口的 <script type="module" src="./assets/…"> 换成 body 末尾的一小段内联加载器。
 *
 * 原因：资源用相对路径(base './')，以 /moba(无尾斜杠)访问时会被解析到站点根目录。index.html 开头虽有补斜杠的跳转，
 * 但浏览器的预加载扫描器会抢在脚本执行之前，按错误的基准路径把入口脚本请求出去(一次 404 / 类型不符的报错)。
 * 改由脚本自己插入入口标签后，需要补斜杠时就只跳转、不加载，错误地址上不再有任何请求。
 * 加载器放在 body 末尾：动态插入的模块脚本不会等文档解析完，放在这里才能保证 #app / #boot 已经在文档里。
 */
function deferEntryScript(): Plugin {
  const TAG = /[ \t]*<script type="module"[^>]*\ssrc="([^"]+)"[^>]*><\/script>\n?/;
  return {
    name: 'starfall-defer-entry',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const m = TAG.exec(html);
        // 认不出入口标签(构建工具换了输出格式)就原样返回：功能不受影响，只是 /moba 会多一次无效请求
        if (!m || !html.includes('</body>')) return html;
        const lines = [
          '<script>',
          '  // 入口脚本由这里插入：需要补斜杠跳转(/moba → /moba/)时不加载，免得按错误的基准路径白请求一次',
          '  (function () {',
          '    if (/\\/moba$/.test(location.pathname)) return;',
          "    var s = document.createElement('script');",
          "    s.type = 'module';",
          "    s.crossOrigin = 'anonymous';",
          '    s.onerror = function () {',
          "      var boot = document.getElementById('boot');",
          "      var tip = document.getElementById('boot-tip');",
          '      if (!boot || !tip || window.__mobaBooted) return;',
          "      boot.classList.add('is-error');",
          "      tip.textContent = '游戏脚本没能载入，请检查网络后刷新页面重试。';",
          '    };',
          `    s.src = ${JSON.stringify(m[1])};`,
          '    document.body.appendChild(s);',
          '  })();',
          '</script>',
        ];
        const loader = lines.map((l) => `    ${l}\n`).join('');
        return html.replace(TAG, '').replace(/[ \t]*<\/body>/, `${loader}  </body>`);
      },
    },
  };
}

// 普通构建 → dist/（多文件，随主站部署到 /moba/）
// `--mode single` → dist-single/index.html（JS/CSS 全内联的单文件，可离线打开或嵌入任意页面）
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [deferEntryScript()],
  build: {
    target: 'es2022',
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 4000,
    // 只有一个入口块，用不上 modulepreload 的兼容垫片；去掉它，产物里就不含任何 fetch 调用(受限宿主的 CSP 禁止一切外部请求)
    modulePreload: { polyfill: false },
  },
  server: {
    port: 5183,
    host: true,
  },
}));
