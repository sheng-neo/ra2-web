// ===== ui/windows/newspaper.ts =====（WP12b：报纸，spec:ui-art §2.5 Newspaper 行、spec:disasters §2.10.1 版面）
// 报头（news.paperName，原创报名）/ 号外横幅 / 日期 / 头条 / 2 条正文 / 天气栏（weather.<trend> + 气温 heat−100°F + 风 + 降水）。
// 数据 q.news.currentPaper()；文案 news.<NewsType>.headline / .body（args：city / value / year），缺键回退到 news.generic.*。
// 同一组件：Windows 菜单的窗口 + newspaper / extraPaper 两个模态（modal 多一个 OK）。
import type { NewsStoryView, PaperView } from '../../contracts/queries';
import type { WindowDeps, WindowFactory } from '../windowTypes';
import { monthYearOf } from './format';
import { bindText, tx } from './text';
import { btn, h, replace } from './wdom';

export const PAPER_BODY_STORIES = 2;
const WEATHER_TYPES = 12;

export interface NewspaperOptions { modal?: boolean; onClose?: () => void }

/** 一条故事的标题 / 正文（缺键回退通用模板）。 */
export function storyText(deps: WindowDeps, paper: PaperView, s: NewsStoryView, part: 'headline' | 'body'): string {
  const args = { city: deps.host.state.cityName, value: s.value, year: paper.year };
  const key = `news.${s.type}.${part}`;
  return deps.strings.has(key) ? deps.strings.t(key, args) : tx(deps.strings, `news.generic.${part}`, args);
}

export function buildNewspaper(deps: WindowDeps, opts: NewspaperOptions = {}): { el: HTMLElement; refresh(): void } {
  const t = bindText(deps.strings);
  const page = h('div', { cls: 'sc2k-win-paper', testid: 'paper' });
  const el = h('div', { cls: 'sc2k-win-body sc2k-win-newspaper' }, page,
    opts.modal ? h('div', { cls: 'sc2k-win-buttons' }, btn(t('ui.ok'), () => opts.onClose?.(), { testid: 'paper-ok', cls: 'sc2k-win-primary' })) : null);

  function refresh(): void {
    const paper = deps.host.q.news.currentPaper();
    const masthead = h('div', { cls: 'sc2k-win-masthead', text: t('news.paperName'), testid: 'paper-masthead' });
    if (!paper) { replace(page, masthead, h('div', { cls: 'sc2k-win-muted', text: t('ui.news.none'), testid: 'paper-empty' })); return; }
    const stories = paper.stories.filter((s) => s !== paper.headline).slice(0, PAPER_BODY_STORIES);
    const w = paper.weather;
    const trend = Math.max(0, Math.min(WEATHER_TYPES - 1, w.trend | 0));
    replace(page,
      masthead,
      paper.extra ? h('div', { cls: 'sc2k-win-extra', text: t('news.extra'), testid: 'paper-extra' }) : null,
      h('div', { cls: 'sc2k-win-dateline', text: monthYearOf(deps.strings, paper.year, paper.month), testid: 'paper-date' }),
      paper.headline
        ? h('div', { cls: 'sc2k-win-headline', testid: 'paper-headline' }, h('h2', { text: storyText(deps, paper, paper.headline, 'headline') }), h('p', { text: storyText(deps, paper, paper.headline, 'body') }))
        : null,
      h('div', { cls: 'sc2k-win-stories', testid: 'paper-stories' }, ...stories.map((s) => h('div', { cls: 'sc2k-win-story' }, h('h3', { text: storyText(deps, paper, s, 'headline') }), h('p', { text: storyText(deps, paper, s, 'body') })))),
      h('div', { cls: 'sc2k-win-weather', testid: 'paper-weather' },
        h('b', { text: `${t('news.weatherColumn')}: ${t(`weather.${trend}`)}` }),
        h('div', { text: `${t('ui.news.temperature', { value: w.heat - 100 })} · ${t('ui.news.wind', { value: w.wind })} · ${t('ui.news.humidity', { value: w.humid })}` })));
  }
  refresh();
  return { el, refresh };
}

export const newspaperWindow: WindowFactory = (deps) => {
  const p = buildNewspaper(deps);
  return { id: 'newspaper', title: deps.strings.t('window.newspaper'), el: p.el, width: 480, refresh: p.refresh, onShow: p.refresh };
};
