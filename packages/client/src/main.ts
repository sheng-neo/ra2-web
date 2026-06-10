import { renderAssetBrowser } from './pages/asset-browser';
import { renderBootScreen } from './pages/boot-screen';

/** 极简 hash 路由：# 首页 / #assets 资源浏览器。 */
async function route(): Promise<void> {
  const app = document.getElementById('app')!;
  app.innerHTML = '';
  const statusBar = document.getElementById('status-bar');
  if (statusBar) statusBar.style.display = location.hash === '#assets' ? 'none' : '';

  if (location.hash === '#assets') {
    await renderAssetBrowser(app);
  } else {
    await renderBootScreen(app);
  }
}

window.addEventListener('hashchange', () => {
  location.reload(); // 页面间状态独立，整页重载最稳妥
});

void route();
