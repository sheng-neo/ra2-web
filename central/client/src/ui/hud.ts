/**
 * 游戏内 UI（M0）：标题牌、机位按钮、常驻地图署名、鸣谢按钮与鸣谢页、竖屏旋转提示。
 */
import { sourceFileUrl, SOURCE_TREE_URL, type CityMeta } from '@central/data';
import { h } from './dom';

/** 常驻屏幕的地图署名（点一下打开鸣谢页）；分段不拆行，窄屏只在「·」处换行。 */
export const MAP_CREDIT = ['© OpenStreetMap contributors', 'Overture Maps Foundation', '香港特區政府（CSDI）'];

const ODBL_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';
const CSDI_TERMS_URL = 'https://portal.csdi.gov.hk/csdi-webpage/doc/TNC';

export interface HudOptions {
  presets: readonly { id: string; label: string }[];
  active: string;
  onPreset: (id: string) => void;
  meta: CityMeta;
  /** 「聲音」开关（R2：电车叮叮铃）：muted 为开场状态，onToggle 收到新的静音状态。 */
  sound?: { muted: boolean; onToggle: (muted: boolean) => void }; // [r2:trams]
  /** 「搭電車」跟车机位：onRide 返回是否进入跟车。 */
  ride?: { onRide: () => boolean }; // [r2:trams]
}

/** 港府数据（CSDI 条款）的 license 标记，与管线 terrain-refs.ts 一致。 */
const CSDI_LICENSE = 'CSDI-Terms';

const link = (href: string, text: string) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

function creditsPanel(meta: CityMeta, close: () => void): HTMLElement {
  const gov = meta.sources.some((s) => s.license === CSDI_LICENSE);
  const tomtom = meta.sources.some((s) => s.id.endsWith('/tomtom'));
  const sources = h(
    'ul',
    {},
    ...meta.sources.map((s) => {
      const li = h('li', {}, `${s.attribution}（${s.license}）`);
      if (s.url) li.append(' ', link(s.url, '來源'));
      return li;
    }),
  );
  const closeBtn = h('button', { class: 'chip close', type: 'button' }, '關閉');
  closeBtn.addEventListener('click', close);
  return h(
    'div',
    { class: 'panel', role: 'dialog', 'aria-label': '鳴謝 Credits' },
    closeBtn,
    h('h2', {}, '鳴謝 / Credits'),
    h('div', {}, '地圖數據 © OpenStreetMap contributors · Overture Maps Foundation'),
    sources,
    h(
      'p',
      {},
      gov ? '道路、海岸與區域數據' : '道路與建築數據',
      `來自 Overture Maps Foundation 發佈的 ODbL 數據（主要源自 OpenStreetMap${tomtom ? '，少量路段來自 TomTom' : ''}），按 `,
      link(ODBL_URL, 'Open Database License (ODbL) 1.0'),
      ' 提供。本作的衍生數據庫 ',
      // central.json 以 application/json 送出，可直接開；.txt 在部分伺服器會被當成下載，改連源碼倉庫的版本
      link('city/central.json', 'central.json'),
      '、原始快照與生成方法（離線管線 central/citymap）公開於',
      link(SOURCE_TREE_URL, '源碼倉庫'),
      '；授權聲明見 ',
      link(sourceFileUrl('client/public/city/LICENSE-ODbL.txt'), 'LICENSE-ODbL.txt'),
      '，完整署名見 ',
      link(sourceFileUrl('client/public/city/ATTRIBUTION.txt'), 'ATTRIBUTION.txt'),
      '。',
    ),
    gov
      ? h(
          'p',
          {},
          '建築輪廓與高度、三維建築模型及其照片紋理（地政總署）及地形（土木工程拓展署）來自香港特別行政區政府，經空間數據共享平台（CSDI）取得，按 ',
          link(CSDI_TERMS_URL, 'CSDI 使用條款'),
          ' 使用，不屬 ODbL 數據；資料的知識產權屬香港特別行政區政府所有，政府不對本作負責，亦不代表政府認可。',
        )
      : '',
    h(
      'p',
      { class: 'note' },
      '所有地標均為虛構命名的風格化造型，不含任何標誌，並非真實建築的複製品。本作是獨立的原創作品，與任何公司、品牌或機構均無關聯，亦不代表其認可。',
    ),
    h(
      'p',
      { class: 'note' },
      '電車、巴士、小巴、的士、渡輪及港鐵的名稱、塗裝與標誌屬各營運商所有，站名與目的地按數據照錄，僅用以重現街景；各營運商及站名提及的建築、機構與本作沒有關聯，亦不代表其認可；車身廣告均為虛構。本作只作非商業的學習與研究用途。',
    ),
    h('p', { class: 'note' }, `數據版本：${meta.build.pipelineVersion} · ${meta.build.inputsDigest.slice(0, 12)}`),
  );
}

export function createHud(parent: HTMLElement, opts: HudOptions): { setActive(id: string): void; setRide(on: boolean): void } {
  const badge = h('div', { class: 'badge' }, h('b', {}, '中環急件'), ' Central Rush ', h('span', { class: 'stage' }, '· R3 真實貼面'));
  const buttons = opts.presets.map((p) => {
    const b = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(p.id === opts.active), 'data-preset': p.id }, p.label);
    b.addEventListener('click', () => opts.onPreset(p.id));
    return b;
  });
  // [r2:trams] 搭電車（跟车）与 聲音（开 / 关）两个按钮接在机位按钮后面
  const extra: HTMLElement[] = [];
  let rideBtn: HTMLElement | null = null;
  if (opts.ride) {
    const ride = opts.ride;
    rideBtn = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', 'data-ride': '1' }, '搭電車');
    rideBtn.addEventListener('click', () => {
      const on = ride.onRide();
      for (const b of buttons) b.setAttribute('aria-pressed', 'false');
      rideBtn!.setAttribute('aria-pressed', String(on));
    });
    extra.push(rideBtn);
  }
  if (opts.sound) {
    const sound = opts.sound;
    let muted = sound.muted;
    const label = () => (muted ? '聲音：關' : '聲音：開');
    const btn = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(!muted), 'data-sound': '1' }, label());
    btn.addEventListener('click', () => {
      muted = !muted;
      btn.textContent = label();
      btn.setAttribute('aria-pressed', String(!muted));
      sound.onToggle(muted);
    });
    extra.push(btn);
  }
  const presets = h('div', { class: 'presets', role: 'toolbar', 'aria-label': '機位' }, ...buttons, ...extra);
  const overlay = h('div', { class: 'overlay', hidden: '' });
  const closeOverlay = () => overlay.setAttribute('hidden', '');
  const openOverlay = () => overlay.removeAttribute('hidden');
  overlay.append(creditsPanel(opts.meta, closeOverlay));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay();
  });
  const credits = h('button', { class: 'chip credits-btn', type: 'button' }, '鳴謝', h('span', { class: 'en' }, ' / Credits'));
  credits.addEventListener('click', openOverlay);
  // 地图署名常驻屏幕（OSMF 署名指引：交互地图上的署名应一直可见）
  const credit = h(
    'button',
    { class: 'map-credit', type: 'button', 'aria-label': `地圖數據 ${MAP_CREDIT.join('、')}` },
    ...MAP_CREDIT.flatMap((t, i) => [...(i > 0 ? [' · '] : []), h('span', {}, t)]),
  );
  credit.addEventListener('click', openOverlay);
  const dock = h('div', { class: 'dock' }, presets, credit);
  const hint = h('div', { class: 'hint' }, '橫放手機，視野更闊');
  setTimeout(() => (hint.style.opacity = '0'), 5000);
  parent.append(badge, dock, credits, hint, overlay);
  return {
    setActive(id) {
      for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.preset === id));
      rideBtn?.setAttribute('aria-pressed', 'false'); // [r2:trams]
    },
    setRide(on) {
      rideBtn?.setAttribute('aria-pressed', String(on)); // [r2:trams]
    },
  };
}
