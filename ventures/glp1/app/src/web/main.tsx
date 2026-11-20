import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 离线可用：只在正式构建里注册 service worker。
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
