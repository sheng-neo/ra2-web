import { renderAssetBrowser } from './pages/asset-browser';
import { renderBootScreen } from './pages/boot-screen';
import { renderMapViewer } from './pages/map-viewer';
import { renderSimSandbox } from './pages/sim-sandbox';
import { renderPlay } from './pages/play';
import { renderMp } from './pages/mp';

/** 极简 hash 路由：# 首页 / #play 单机 / #mp 联机 / #assets / #map / #sim。 */
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
  } else if (location.hash === '#play') {
    await renderPlay(app);
  } else if (location.hash.startsWith('#mp')) {
    await renderMp(app); // 含邀请链接 #mp?room=xxx
  } else {
    await renderBootScreen(app);
  }
}

window.addEventListener('hashchange', () => {
  location.reload(); // 页面间状态独立，整页重载最稳妥
});

void route();
