// ===== events.ts =====
// sim → 外界的事件（CONTRACTS §L）：全部可 JSON 化；core 的事件缓冲由 app 每帧 drain。
import type { CityMode } from './grid';
import type { BudgetLine, OrdinanceId, WeatherState } from './state';
import type { DestroyCause } from './actions';
import type { ModalId } from './commands';
import type { SoundId } from './audio';
export type SimEvent =
  // 时钟 / UI 节拍
  | { type: 'dayTick'; age: number } | { type: 'monthTick'; year: number; month: number } | { type: 'yearClosed'; year: number } | { type: 'uiRefresh' }
  | { type: 'modal'; id: ModalId; payload: unknown }                     // 阶段已挂起（core 已 modalPause++）；UI 关闭后 host.modalClosed()
  | { type: 'goto'; x: number; y: number; smooth: boolean }              // autoGoto / 事件居中
  | { type: 'sound'; id: SoundId }
  | { type: 'actor'; op: 'spawn' | 'move' | 'remove'; slot: number }     // 渲染据此从 q.disasters.things() 读位置
  | { type: 'toolbar'; reason: 'tech' | 'reward' | 'ordinance' | 'funds' | 'mode' }   // 可用性需刷新
  | { type: 'message'; key: string; args?: Record<string, string | number>; level: 'info' | 'reject' | 'alert' }
  | { type: 'complaint'; key: string | null }                            // 状态栏第二行诉求（services cityStatus）
  // 经济
  | { type: 'monthSettled'; funds: number; net: number } | { type: 'budgetWindow' }
  | { type: 'insufficientFunds'; cost: number } | { type: 'bondIssued'; rateRaw: number } | { type: 'bondRepaid' } | { type: 'bondRefused'; reason: 'max' | 'rating' }
  | { type: 'fedRate'; direction: 'up' | 'down'; rateRaw: number } | { type: 'ordinance'; id: OrdinanceId; enacted: boolean }
  | { type: 'underfunded'; line: BudgetLine } | { type: 'taxGripe'; rate: number; severe: boolean } | { type: 'impeached'; funds: number }
  // 电 / 水
  | { type: 'brownout'; unpowered: number } | { type: 'waterShortage'; unwatered: number } | { type: 'needPower' } | { type: 'needWater' }
  | { type: 'plantAging'; anchor: number } | { type: 'plantExpired'; anchor: number } | { type: 'plantAutoRebuilt'; anchor: number; cost: number }
  // 服务 / 分区
  | { type: 'citizenDemand'; key: string } | { type: 'milestone'; progression: number } | { type: 'reward'; bit: number } | { type: 'militaryOffer' }
  | { type: 'approval'; pct: number; gripes: number[] } | { type: 'fundEducation' } | { type: 'fundPrison' } | { type: 'arcoExodus'; count: number }
  // 事件 / 灾害 / 科技 / 报纸 / 物件
  | { type: 'weatherChanged'; weather: WeatherState } | { type: 'disasterStarted'; kind: number; x: number; y: number } | { type: 'disasterEnded'; kind: number; deaths: number }
  | { type: 'structureDestroyed'; x: number; y: number; oldId: number; cause: DestroyCause } | { type: 'explosion'; x: number; y: number }
  | { type: 'techInvented'; slot: number } | { type: 'newsStory'; storyType: number /*NewsType*/; value: number } | { type: 'paper'; extra: boolean }   // paper：版面经 q.news.currentPaper() 读取；订阅 / 号外选项关闭时只发事件不挂起
  | { type: 'thingSpawned'; slot: number; thingType: number } | { type: 'thingRemoved'; slot: number; reason: string } | { type: 'helicopterReport'; x: number; y: number; level: number }
  | { type: 'bridgeCollapse'; x: number; y: number } | { type: 'connectionOffer'; at: number }
  | { type: 'scenario'; result: 'won' | 'lost' } | { type: 'modeChanged'; mode: CityMode };
/** 报纸事件类型（spec:disasters §2.10.2 的 67 种，数值 = 表中 #）。Actions.news(type, value)、SimEvent newsStory.storyType、NewsStoryView.type 与 strings 键 news.<NewsType> 都用它；v1 必含子集见 WORKPLAN WP13。 */
export const enum NewsType {
  Weather = 0, Junk, Founding, Growth, Invention, Innovation, War, Market, Sports, FedRateUp, FedRateDown, Politics, Diplomacy, Disaster, Medical, Upbeat,
  HighCrime, HighTraffic, HighPollution, PoorEducation, PoorHealth, PoorEmployment,
  DisasterFire, DisasterFlood, DisasterPlaneCrash, DisasterHelicopterCrash, DisasterTornado, DisasterEarthquake, DisasterMonster, DisasterMeltdown, DisasterMicrowave, DisasterVolcano,
  DisasterPollution, DisasterChemicalSpill, DisasterHurricane, DisasterRiot,
  PowerPlantEol, OvercrowdedPrisons, AngryTeachers, BridgeCollapse, AngryBulldozer, Ordinance, OpinionGuest, OpinionEditor, Survey, AdviceColumn,
  DemandPower, DemandTransit, DemandPolice, DemandFire, DemandWater, DemandHospital, DemandSchool, DemandSeaport, DemandAirport, DemandZoo, DemandStadium, DemandMarina, DemandPark,
  DemandIndustrialConnection, DemandCommercialConnection, LowCrime, LowTraffic, LowPollution, GoodEducation, GoodHealth, GoodEmployment }
export const NEWS_TYPE_COUNT = 67;
export interface EventBus {
  on<K extends SimEvent['type']>(type: K, fn: (e: Extract<SimEvent, { type: K }>) => void): () => void;
  publish(e: SimEvent): void;
}
