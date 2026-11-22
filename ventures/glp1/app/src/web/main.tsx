import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_LANG, type Lang } from '../core/i18n';
import { App } from './App';
import { initCloud, inClaude } from './cloud';
import { startCounting } from './counting';
import { features } from './features';
import { applyDocumentLang, translate } from './i18n';
import { savedLang } from './lang';
import './styles.css';

async function boot() {
  const root = createRoot(document.getElementById('root')!);
  // 在 claude.ai 里打开时，先从账号里拉回记录，再显示（避免换手机时先看到引导页）。
  // The saved language is read before the first render, so a Chinese profile never flashes English.
  // If storage does not answer quickly, start in the default language; the profile sets it once it loads.
  let lang = await Promise.race([savedLang(), new Promise<Lang>((resolve) => setTimeout(() => resolve(DEFAULT_LANG), 1500))]);
  applyDocumentLang(lang);
  if (features.hostServices && inClaude()) {
    root.render(<div className="loading">{translate(lang, 'app.loadingRecords')}</div>);
    await initCloud();
    // The profile may have just arrived from the account.
    lang = await savedLang();
    applyDocumentLang(lang);
  }
  root.render(
    <StrictMode>
      <App bootLang={lang} />
    </StrictMode>,
  );
  // Anonymous counts, where the build has them and the person said yes (see counting.ts).
  if (features.anonymousCounts) startCounting();
}
void boot();

// 离线可用：只在自己的服务器上注册 service worker（claude.ai 里不支持）。
if ('serviceWorker' in navigator && import.meta.env.PROD && !(features.hostServices && inClaude())) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
