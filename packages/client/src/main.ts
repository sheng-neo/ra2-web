import { renderAssetBrowser } from './pages/asset-browser';
import { renderBootScreen } from './pages/boot-screen';
import { renderMapViewer } from './pages/map-viewer';
import { renderSimSandbox } from './pages/sim-sandbox';

/** 极简 hash 路由：# 首页 / #assets 资源浏览器 / #map 地图 / #sim 沙盒。 */
async function route(): Promise<void> {
  const app = document.getElementById('app')!;
  app.innerHTML = '';
  const statusBar = document.getElementById('status-bar');
  if (statusBar) statusBar.style.display = location.hash === '' ? '' : 'none';

  if (location.hash === '#assets') {
    await renderAssetBrowser(app);
  } else if (location.hash === '#map') {
    await renderMapViewer(app);
  } else if (location.hash === '#sim') {
    await renderSimSandbox(app);
  } else {
    await renderBootScreen(app);
  }
}

window.addEventListener('hashchange', () => {
  location.reload(); // 页面间状态独立，整页重载最稳妥
});

void route();
