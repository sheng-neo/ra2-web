import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initCloud, inClaude } from './cloud';
import './styles.css';

async function boot() {
  const root = createRoot(document.getElementById('root')!);
  // 在 claude.ai 里打开时，先从账号里拉回记录，再显示（避免换手机时先看到引导页）。
  if (inClaude()) {
    root.render(<div className="loading">正在读取你的记录…</div>);
    await initCloud();
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
void boot();

// 离线可用：只在自己的服务器上注册 service worker（claude.ai 里不支持）。
if ('serviceWorker' in navigator && import.meta.env.PROD && !inClaude()) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
