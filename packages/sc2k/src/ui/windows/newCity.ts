// ===== ui/windows/newCity.ts =====（WP12b：New City 窗口，spec:ui-art §2.6 New City 行）
// 城市名（≤ 23 字符）/ 市长 / 难度 / 起始年 / Coast·River / Hills·Water·Trees 0..47（默认 12 / 5 / 15）/「生成」（host.newCity，留在地形编辑模式预览）/「完成」（terrainDone + 速度 3）。
// 种子是 UI 装饰级随机（只决定 seed / terrainSeed，sim 流从 seed 起确定）。完成 / 生成时在 el 上冒泡 CustomEvent NEW_CITY_EVENT 供外壳 session 监听（自动存档等）。
import type { NewCityParams } from '../../contracts/system';
import type { WindowFactory } from '../windowTypes';
import { bindText } from './text';
import { btn, checkbox, field, h, noteLine, slider } from './wdom';

export const NEW_CITY_EVENT = 'sc2k:newCity';
export interface NewCityEventDetail { phase: 'make' | 'done'; params: NewCityParams }
export const START_YEARS = [1900, 1950, 2000, 2050] as const;
export const DEFAULT_TERRAIN_SLIDERS = { hills: 12, water: 5, trees: 15 } as const;   // spec:ui-art §2.6（默认值）
export const CITY_NAME_MAX = 23;                                                      // CNAM 上限
export const DEFAULT_CITY_NAME = 'Newtown';
const TERRAIN_MAX = 47;

/** UI 装饰级随机：只用于生成种子。 */
const rnd32 = (): number => (Math.random() * 0x100000000) >>> 0;

export const newCityWindow: WindowFactory = (deps) => {
  const t = bindText(deps.strings);
  let seed = rnd32(), terrainSeed = rnd32();
  let generated = false;

  const name = h('input', { type: 'text', value: deps.host.state.cityName || DEFAULT_CITY_NAME, maxLength: CITY_NAME_MAX, testid: 'newcity-name', cls: 'sc2k-win-input' });
  const mayor = h('input', { type: 'text', value: deps.host.state.mayorName, maxLength: CITY_NAME_MAX, testid: 'newcity-mayor', cls: 'sc2k-win-input' });
  const difficulty = h('select', { testid: 'newcity-difficulty', cls: 'sc2k-win-input' }, ...([1, 2, 3] as const).map((d) => h('option', { value: String(d), text: t(`ui.difficulty.${d}`) })));
  const startYear = h('select', { testid: 'newcity-year', cls: 'sc2k-win-input' }, ...START_YEARS.map((y) => h('option', { value: String(y), text: String(y) })));
  const coast = checkbox(t('ui.coast'), false, () => { /* 读值即可 */ }, { testid: 'newcity-coast' });
  const river = checkbox(t('ui.river'), true, () => { /* 读值即可 */ }, { testid: 'newcity-river' });
  const hills = slider({ min: 0, max: TERRAIN_MAX, value: DEFAULT_TERRAIN_SLIDERS.hills, testid: 'newcity-hills' });
  const water = slider({ min: 0, max: TERRAIN_MAX, value: DEFAULT_TERRAIN_SLIDERS.water, testid: 'newcity-water' });
  const trees = slider({ min: 0, max: TERRAIN_MAX, value: DEFAULT_TERRAIN_SLIDERS.trees, testid: 'newcity-trees' });
  const note = noteLine('newcity-note');

  const params = (): NewCityParams => ({
    name: name.value.trim().slice(0, CITY_NAME_MAX) || DEFAULT_CITY_NAME,
    mayor: mayor.value.trim() || undefined,
    difficulty: Number(difficulty.value) as 1 | 2 | 3,
    startYear: Number(startYear.value) as NewCityParams['startYear'],
    seed, terrainSeed,
    terrain: { coast: coast.input.checked, river: river.input.checked, hills: Number(hills.input.value), water: Number(water.input.value), trees: Number(trees.input.value) },
  });
  const centerView = (): void => { deps.renderer.setView({ ...deps.renderer.getView(), centerX: 64, centerY: 64 }); };
  const emit = (phase: NewCityEventDetail['phase'], p: NewCityParams): void => {
    el.dispatchEvent(new CustomEvent<NewCityEventDetail>(NEW_CITY_EVENT, { detail: { phase, params: p }, bubbles: true }));
  };

  /** 生成：新城 + 留在地形编辑模式（时钟为暂停），可反复生成。 */
  const make = (): void => {
    terrainSeed = rnd32();
    const p = params();
    deps.host.newCity(p);
    generated = true;
    centerView();
    note.say(t('ui.newCity.generated'));
    emit('make', p);
  };
  /** 完成：未生成则先生成；进入城市模式并以常速开始。 */
  const done = (): void => {
    const p = params();
    if (!generated) deps.host.newCity(p);
    deps.dispatch({ type: 'terrainDone' });
    deps.dispatch({ type: 'setSpeed', speed: 3 });
    centerView();
    generated = false;
    seed = rnd32();
    emit('done', p);
    deps.closeWindow('newCity');
  };

  const el = h('div', { cls: 'sc2k-win-body sc2k-win-newcity' },
    field(t('ui.cityName'), name), field(t('ui.mayorName'), mayor),
    field(t('ui.difficulty'), difficulty), field(t('ui.startYear'), startYear),
    h('div', { cls: 'sc2k-win-row' }, coast, river),
    field(t('ui.hills'), hills.el), field(t('ui.waterAmount'), water.el), field(t('ui.treeAmount'), trees.el),
    note,
    h('div', { cls: 'sc2k-win-buttons' },
      btn(t('ui.make'), make, { testid: 'newcity-make' }),
      btn(t('ui.done'), done, { testid: 'newcity-done' }),
      btn(t('ui.cancel'), () => deps.closeWindow('newCity'), { testid: 'newcity-cancel' })),
  );
  return {
    id: 'newCity', title: t('window.newCity'), el, width: 360,
    onShow: () => { generated = false; note.say(''); },
  };
};
