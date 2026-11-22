# 稳瘦 · 代码说明

PRD：`../docs/prd-v2.0.md`。独立的 pnpm 项目，不属于外层红警游戏的 workspace。

## 怎么跑

```bash
cd ventures/glp1/app
pnpm install
pnpm test
pnpm typecheck
pnpm build         # 前端构建到 dist/
pnpm start         # 服务端：托管 dist/ + /api，默认端口 8787
# 开发时：一个终端 pnpm dev:server，另一个终端 pnpm dev（Vite，端口 5180，/api 转发到 8787）
```

AI 识别需要服务端环境变量 `ANTHROPIC_API_KEY`。没有它时 `/api/parse` 返回 503，前端自动回落到手动记录，其他功能都能用。

## 目录

| 路径 | 内容 |
|---|---|
| `src/core/` | 纯逻辑，全部有测试：药物目录、药物水平曲线、排期、蛋白目标、危险症状分诊、体重趋势、个人高症状日、"今天这样过"规则、本地解析、日历提醒 |
| `src/web/` | 前端（React + IndexedDB）：引导、今天、趋势、问问、我的；输入栏和各个记录面板 |
| `src/web/content/` | 文案：今日建议、应对卡、训练动作、标签。**全部待医生或药师审核** |
| `server/` | 服务端（Hono）：`/api/health`、`/api/parse` |

## 第一版做到哪了（对照 PRD v2.0 第 6 节）

| 第 1 天的内容 | 状态 |
|---|---|
| 引导（地区、单位、药物、剂量、排期、身高体重、安全确认、AI 告知） | 完成 |
| 今天页（状态、今日建议、蛋白、药物水平、今天的记录、撤销） | 完成 |
| 万能输入栏：分诊 → 本地解析 → AI；用药必须确认，超量二次确认；剂量问题转"想问医生" | 完成；AI 部分没有用真实密钥跑过 |
| 拍照识别 | 前端和服务端写好了，没有用真实密钥跑过 |
| 记针、药物水平曲线、加量周 | 完成 |
| 副作用记录、4 张应对卡、危险症状分诊（含当天暂停建议） | 完成 |
| 日历提醒（.ics） | 完成 |
| 导出（JSON、CSV）和从备份恢复 | 完成 |
| 邮箱登录同步 | **没做**：需要邮件服务。暂时用导出和恢复代替，"我的"页有提醒 |
| 反馈入口 | 没做 |

第 2–3 天的内容里已经做了：轻量训练、维持期（用药状态切换、体重回升分级）、问问页的应对卡和"想问医生的问题"。还没做：中英双语医生报告、AI 问答、评测集、隐私政策页。

## 上线前必须做

1. 医生或药师审核：`src/core/triage.ts`（分诊规则和文案）、`src/web/content/`（应对卡、训练、建议）、`src/core/protein.ts`（蛋白公式）、`src/core/catalog.ts`（药名、剂量阶梯、药代参数）、`src/core/foods.ts`（食物蛋白数值）。
2. 用真实密钥跑通 `/api/parse`，建 150 条的中文评测集（PRD 第 3.2 节）。
3. 部署（服务器、域名、HTTPS）。
4. 隐私政策和条款页面。

## Language (English first, Chinese kept)

The first market is the United States, in English. Chinese keeps working for existing users.

- `src/core/i18n.ts` defines `Lang = 'en' | 'hans' | 'hant'`. A profile's language is `profileLang(profile)`: its `lang` field if set, otherwise `'hans'`. A profile saved before `lang` existed therefore stays Chinese and looks exactly as it did (the older `script` field is not read for it, because the screens of that time never read it). A new profile starts with `lang: 'en'` and the region of the phone's time zone: `'US'` for American time zones, `'OTHER'` for a time zone the app does not know (`startRegion` in `src/core/profile.ts`). The region is never a fixed default, because for an unknown time zone it also picks the emergency number on the alert cards; `'OTHER'` shows "your local emergency number" and no call button.
- Every core function that builds text for the user takes a `Lang`: triage cards, drug and brand names, units, dates and times, schedule and countdown text, calendar reminders, symptom, site and food names.
- The Chinese text of the danger-symptom cards is locked by `src/core/triage.golden.hans.json`. The English cards and English phrase lists in `src/core/triage.ts` are translations that still need clinical review.
- Drug numbers (dose ladder, maximum dose, half-life, Tmax) are never written from memory. A number may be added or changed only together with a `source` URL of the FDA label it was read from; a test enforces this. No entry has a `source` yet.
- Screen copy lives in `src/web/i18n/`: `en.ts` (English, the source of the message keys) and `zh.ts` (the Chinese text the screens always had; Traditional falls back to it). A screen calls `const t = useT()` and then `t('key', { placeholder })`; the parameters a key needs are checked at compile time, and `t.lang` is the `Lang` to pass to core functions. `App` gives the screens their language from the saved profile through `<I18nProvider>`. Code outside React uses `translator(lang)` or passes a message reference made with `msg()` (toasts).
- The longer content in `src/web/content/` (today's advice, coping cards, workouts, labels) holds both languages side by side. The Chinese text is locked by `src/web/content/content.golden.hans.json`. The English text is a translation that still needs clinical review. English copy makes no weight-loss or muscle claims; `src/web/copyRules.ts` lists the phrases the tests refuse.
- The language can be chosen on the first setup screen and under Me. Setup starts in the region of the phone's time zone in either language. For a US time zone English setup therefore starts with the United States, pounds, feet and inches, and the US brand list; Chinese setup works as it did before. The medication step of English setup has one row per brand (rules in `src/web/setupChoice.ts`), and redoing setup starts from the saved medication and schedule.
- `index.html` and `public/manifest.webmanifest` are English. For a Chinese profile the app switches the page language, title and manifest (`public/manifest.zh.webmanifest`) when it starts.
- Not translated: the prompt in `server/parse.ts` (it asks the model for Chinese food labels) and the Chinese paragraphs of this README.

