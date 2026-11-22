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

1. 医生或药师审核：`src/core/triage.ts`（分诊规则和文案）、`src/web/content/`（应对卡、训练、建议）、`src/core/protein.ts`（蛋白公式）、`src/core/catalog.ts`（药名、剂量阶梯、药代参数。数字已在 2026-11-22 对照美国说明书读过一遍，出处在 `src/core/labelFacts.ts`，但还没有请审核人确认）、`src/core/foods.ts`（食物蛋白数值）。
2. 用真实密钥跑通 `/api/parse`，建 150 条的中文评测集（PRD 第 3.2 节）。
3. 部署（服务器、域名、HTTPS）。
4. 隐私政策和条款页面。

## Language (English first, Chinese kept)

The first market is the United States, in English. Chinese keeps working for existing users.

- `src/core/i18n.ts` defines `Lang = 'en' | 'hans' | 'hant'`. A profile's language is `profileLang(profile)`: its `lang` field if set, otherwise `'hans'`. A profile saved before `lang` existed therefore stays Chinese and looks exactly as it did (the older `script` field is not read for it, because the screens of that time never read it). A new profile starts with `lang: 'en'` and the region of the phone's time zone: `'US'` for American time zones, `'OTHER'` for a time zone the app does not know (`startRegion` in `src/core/profile.ts`). The region is never a fixed default, because for an unknown time zone it also picks the emergency number on the alert cards; `'OTHER'` shows "your local emergency number" and no call button.
- Every core function that builds text for the user takes a `Lang`: triage cards, drug and brand names, units, dates and times, schedule and countdown text, calendar reminders, symptom, site and food names.
- The Chinese text of the danger-symptom cards is locked by `src/core/triage.golden.hans.json`. The English cards in `src/core/triage.ts` are translations that still need clinical review. The English phrase lists are no longer translations of the Chinese lists: they follow the FDA Medication Guides (see "Warning signs from the Medication Guides" below), and they still need clinical review too.
- Drug numbers (dose steps, highest dose, half-life, time to peak, wait after a pill) are never written from memory. They were read from the current US labels on DailyMed on 2026-11-22. `src/core/labelFacts.ts` has one row per number and US brand: the label's own words, the section, the label version and its page address. `src/core/catalog.ts` holds the numbers, and `source` on an entry lists its label pages. A number may be added or changed only together with its row; tests fail when a number has no row, when a quote is empty, when an address is not on dailymed.nlm.nih.gov or www.accessdata.fda.gov, or when a number cannot be read in its own quote.
- What was read, and what follows from it:
  - Every US brand now has label-backed dose steps and a highest dose. Foundayo has its numbers. One definition of a step for every entry: every dose of the label's adult schedule, up to the highest dose the label gives to any adult, so the last step is the highest dose. A dose the label gives for one use only is still a step, and its row says who it is for (Wegovy 7.2 mg: weight reduction in adults, after at least 4 weeks on 2.4 mg).
  - Half-life and time to peak are kept for the weekly shots only (Wegovy, Ozempic, Zepbound, Mounjaro). The chart needs one number for each. Rule (`PK_RULE`): both are read from section 12.3 (Pharmacokinetics) of the label and from no other section; a single value or a median there is used as it is; a range is replaced by its midpoint. A midpoint is not an average, so no text calls these numbers averages. The Zepbound label says "approximately 5-6 days" in 12.3 and "approximately 5 days" in section 10; the app uses 12.3 (132 hours) and the row's note says so.
  - Zepbound and Mounjaro share one entry (`tirzepatide`) but their labels word the half-life and the time to peak differently, so each brand has its own pair under `byBrand`. Screens read numbers through `brandNumbers(entry, brand)`, with the brand from `regimenBrand(regimen, region)`. A tirzepatide regimen saved without one of the two brand names (a Chinese profile, the region "Other") has no chart: the app does not pick a label. In place of the chart the screens say why (`chartNeedsBrand` in `src/core/features.ts`); in the United States they say where to choose the brand, and the Chinese medication list there has one row for each of the two.
  - "Ozempic pill" is a new US brand with its own entry (`semaglutide-oral-t2d-ozempic`). It is the second tablet on the label that also covers Rybelsus, with its own doses.
  - The wait after a pill is kept only where the label states one (Wegovy pill, Rybelsus, Ozempic pill: 30 minutes). Foundayo has none: its label says "with or without food". The two lines that show the wait use the label's words ("wait at least ... before you eat, drink or take other oral medications") and say nothing the label does not, so nothing about water. A pill logged with a time that is still to come starts no countdown.
  - The typing check says whose number it uses: "the highest dose in the US prescribing information for" a US brand (`maxDoseLabelBrands` in `src/core/catalog.ts`). It also runs on the dose typed at setup.
  - The `liraglutide` entry carries the numbers of the Saxenda label, so its generic name says the use ("liraglutide for weight"), like the semaglutide entries. It has no Mainland China brand: the list there used the bare generic name, and other liraglutide products have other doses.
  - The dashed part of the chart holds only planned doses from now on. A planned dose that is overdue and not logged is not counted (`exposureCurve` in `src/core/pk.ts`).
  - One entry serves every region; the numbers are those of the US label. Labels of other regions have not been read.
- `verified` is false on every entry. Only a human reviewer sets it. The numbers were read by us and have not been confirmed by a clinician.
- Screen copy lives in `src/web/i18n/`: `en.ts` (English, the source of the message keys) and `zh.ts` (the Chinese text the screens always had; Traditional falls back to it). A screen calls `const t = useT()` and then `t('key', { placeholder })`; the parameters a key needs are checked at compile time, and `t.lang` is the `Lang` to pass to core functions. `App` gives the screens their language from the saved profile through `<I18nProvider>`. Code outside React uses `translator(lang)` or passes a message reference made with `msg()` (toasts).
- The longer content in `src/web/content/` (today's advice, coping cards, workouts, labels) holds both languages side by side. The Chinese text is locked by `src/web/content/content.golden.hans.json`. The English text is a translation that still needs clinical review. English copy makes no weight-loss or muscle claims; `src/web/copyRules.ts` lists the phrases the tests refuse.
- The language can be chosen on the first setup screen and under Me. Setup starts in the region of the phone's time zone in either language. For a US time zone English setup therefore starts with the United States, pounds, feet and inches, and the US brand list; Chinese setup works as it did before. The medication step of English setup has one row per brand (rules in `src/web/setupChoice.ts`), and redoing setup starts from the saved medication and schedule.
- `index.html` and `public/manifest.webmanifest` are English. For a Chinese profile the app switches the page language, title and manifest (`public/manifest.zh.webmanifest`) when it starts.
- Not translated: the prompt in `server/parse.ts` (it asks the model for Chinese food labels) and the Chinese paragraphs of this README.


## Build profiles (full and launch)

The app is built in one of two profiles. The build variable `VITE_BUILD_PROFILE` picks one: `full` (the default) or `launch`. Any other value stops the build.

```bash
pnpm build          # full build, to dist/ (as before)
pnpm dev            # full build, dev server
pnpm build:launch   # launch build, to dist-launch/, then scripts/check-launch.mjs checks the result
pnpm dev:launch     # launch build, dev server (nothing is forwarded to /api)
```

The two `:launch` scripts run Vite with `--mode launch`, which reads `.env.launch` (`VITE_BUILD_PROFILE=launch`). Setting the variable in the environment works too. To look at a launch build: `npx vite preview --mode launch`.

- **Full** is the whole app, as it was before profiles existed.
- **Launch** is the first public version: logging by buttons, no model calls, and none of the content that has not been reviewed by a clinician.

Each difference is one named boolean in `src/core/features.ts` (the tables `FULL` and `LAUNCH`). To change what a profile contains, flip its line there. The screens read the switches of the running build as `features.<name>` from `src/web/features.ts`.

| Switch | Launch | What it controls |
|---|---|---|
| `ai` | off | Everything that calls a model: reading a note or photo through `/api/parse`, the camera button, the AI step of setup, the AI setting |
| `freeTextNote` | off | The note box above the tabs. Off: three log buttons (shot or pill, weight, symptom) |
| `triageDetailCards` | off | Off: a danger-symptom alert shows one fixed card, "Contact your doctor right away" (`src/core/alert.ts`). It begins "What you logged ..." for a log entry and "What you wrote ..." for a question typed into the list of questions, where nothing is logged. A crisis alert keeps its own card. A hit of a mild level (the rules about pregnancy, an operation ahead, birth control pills and eating very little, which are reminders in the full build) shows nothing: the fixed card says "right away" and offers the emergency number, and that is not what those rules mean. Matching is the same in both builds |
| `copingCards` | off | Coping cards on the third tab and after a symptom is logged |
| `workouts` | off | Workout routines, logging a workout, the weekly count |
| `dailyAdvice` | off | The daily advice card on Today. Off: an alert from today stays on Today under the title of its card |
| `foodAndProtein` | off | Food logging, the protein target, the quick food buttons, and the setup questions only the protein target uses (height, kidney or liver disease) |
| `maintenanceContent` | off | The after-stopping notes and the weight-regain bands. The status choices (including paused and stopped) stay |
| `chineseChoice` | off | The Chinese choices in the language pickers. A profile that is already Chinese keeps working and can move to English |
| `curveNeedsSource` | on | On: the numbers of a catalog entry are used only when the entry is label-backed (`hasLabelSource`): it has a `source` and every number it carries has its row in `src/core/labelFacts.ts`, for every US brand. That covers the estimated medication level curve and every other place a catalog number reaches the screen: the dose example in setup, the typing check against the highest dose, and the wait after a pill (the line on the pill sheet and the countdown on Today). Today every US brand is label-backed. The launch build draws the chart for Wegovy, Ozempic, Zepbound and Mounjaro, and shows "An estimate for this medication is not available yet." for the daily medications, for "Other / custom" and for tirzepatide saved without a brand. An entry that loses a row shows none of its numbers and can only be logged |
| `under18EndsSetup` | on | On: checking "Under 18" ends setup; what was entered is dropped and nothing is saved. When setup is being redone, the earlier records are still stored, so the stop screen says so and has a "Delete all data" button |
| `loggingToolNotice` | on | The "logging tool, not a medical device" notice in setup and settings. It also replaces the older disclaimer line |
| `allRegions` | off | The full list of places on the first setup screen. Off: "United States" and "Other", plus a place the profile already uses |
| `hostServices` | off | Mirroring the records to the user's account, and saving files through the host, when the app runs as a private hosted page |
| `setupQuestions` | on | The three optional questions at the end of setup. The answers are saved in the profile |
| `proInterest` | on | The "Want Pro?" row in settings. Its sheet says Pro is not available yet; the one button unlocks nothing |
| `anonymousCounts` | on | Anonymous counting: the consent screen in setup, the setting, and the counts sent after a yes. It also needs `VITE_COUNT_URL` at build time; without it the build asks nothing and sends nothing |
| `guideWarningSigns` | on (also on in the full build) | The screen "Warning signs in the Medication Guide": a row under Me, and a button on every alert that is not the crisis card. It shows two parts of the FDA Medication Guide of the person's own medication, word for word. Off: no row, no button, no screen |

What to know:

- The switches are fixed when the bundle is built, so the launch bundle does not contain the code behind a switch that is off. `scripts/check-launch.mjs` fails the launch build if its script contains the note and photo reader, or any network call (`fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, ...) other than the one place that sends anonymous counts (`send()` in `src/web/counting.ts`). The check reads `VITE_COUNT_URL` the same way the build does. Without it the bundle must contain no `fetch(` at all. With it, exactly one is accepted, and it must be the counter (it is recognised by its options and by the count address). So run the check with the same `VITE_COUNT_URL` as the build; `VITE_COUNT_URL=... pnpm build:launch` does. When the launch build gets another feature that needs the network, describe its call in that script the way the counter is described, in the same change.
- Do not use `features` as a default parameter value (`f = features`): the bundler then keeps all the code behind every switch. Read one switch instead (`x = features.curveNeedsSource`), as `derive()` does. The check above catches the mistake.
- In the launch build the third tab is only the list of questions for the doctor, so it is labelled "Questions" and has its own box for adding one. Text typed there is still checked for danger signs: a serious hit shows the alert (it says "What you wrote", because nothing was logged), the question is kept, and no symptom is logged. A question that only matches a mild rule ("Do I need to stop before surgery?") is saved and shows nothing. So is a general question that describes no symptom ("What are the signs of low blood sugar?").
- Export is the second card of settings in both builds, with its buttons before its note, so it is on the first screenful.
- Records of a hidden kind (food, workouts) can still arrive with a restored backup. They stay in storage and in the export; the launch screens do not list them.
- Redoing setup ("Change medication or redo setup") starts every step from the saved profile and changes nothing unless an answer is changed: the weight, goal weight, height and safety answers are kept, settings that setup does not ask about (large text, start of day, protein target) are kept, the weight is not logged a second time, and the "most recent dose" is neither asked nor added when the log already has a dose of that medication. This is the same in both builds (`src/web/setupChoice.ts`).
- Tests: `src/core/features.test.ts` and `src/core/alert.test.ts` test each decision for both profiles. `src/web/launch.test.ts` runs the real screens as the launch profile. `src/web/features.test.ts` checks that the default build is still the full app. `src/web/counting.test.ts` runs the launch profile with a count address.

### Warning signs from the Medication Guides

Until a pharmacist or physician has signed off, the launch build shows no warning text of its own. What it shows comes from the FDA Medication Guides of the seven current US labels (nine brands), read on 2026-11-22.

- `src/core/medGuide.ts` is the table: for each guide its set id, version, effective date, date line and page address, the brands it covers, and its "most important information" items and serious side effects, word for word, each with an id and a reading of its instruction (`emergency`, `right_away`, `tell`, `none`). A second table in the same file holds the other places where a guide tells the patient to call someone; the app does not show those. **The file is written by a script and must not be edited by hand.** The script, and a second script that checks every string against the label files, are not in the repository. Its header has the quoting rules. `src/core/medGuide.test.ts` checks its shape: every US brand of every label-backed catalog entry has exactly one guide, no text is empty, ids are unique within a guide, and the page address matches the set id.
- The screen (`src/web/components/GuideSheet.tsx`) shows the list for the person's own medication and says where it is from. It adds no word to the list and sets nothing in bold. It always shows the whole list, also when it is opened from an alert, because the app does not say which item a person may have. A medication with no guide on file ("Other / custom", a medication with no US brand, a brand of another region) gets one line that says so. Tirzepatide saved without Zepbound or Mounjaro is asked to choose the brand, as for the chart (`guideChoice`). A Chinese screen shows the English original under one Chinese line.
- `src/core/guideCoverage.ts` ties the rules of `src/core/triage.ts` to the guides, both ways: for every sign a guide item names, the rule that raises the alert when a person describes it as their own, or the reason none does; and for every rule, the items it stands for. A rule, or part of one, with no guide behind it carries the mark "general emergency sign, not from a Medication Guide" and a reason (chest pain, the crisis rule, passing very little urine, blood in vomit or stool). `src/core/guideCoverage.test.ts` fails when a sign of a guide or a rule is not accounted for, and when a rule that shows a card in the launch build has neither a guide item nor the mark.
- The English matcher raises a rule when the text describes the person's own state, now or recently. A match does not count only when the text clearly is not that: a denial, someone else, a time long past, a general question, the size of a pill, or a symptom the person calls slight (dizziness, a racing heart, hoarseness). When in doubt it raises. `src/core/triage.en.corpus.test.ts` holds the phrases that draw the line: at least 12 that must raise the alert for each item family, in the words people type on a phone, and more than 150 that must raise nothing. A phrase moved from one side to the other must be moved there.
- The symptom buttons at "Severe": nausea, vomiting, diarrhea, stomach pain and dizziness raise the alert for everyone. Nausea and dizziness-for-everyone were added because a sign with "right away" in the guides had no button otherwise. The other buttons raise nothing; `guideCoverage.ts` says why for each.
- `pnpm review-packet` prints all of this for the clinical reviewer (sections 2.6 to 2.8 of the packet), with the status "Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer".
- When a label changes: read the guide again, write `medGuide.ts` again from it, update `MED_GUIDES_READ_ON`, then run the tests. They name every sign that is new or gone, and the packet build names every description that no longer fits.

## 两个版本、每周小结和匿名计数

**两个版本**

- 完整版：`pnpm build`，产物在 `dist/`。原来有的功能都在。
- 上架版：`pnpm build:launch`，产物在 `dist-launch/`。只用按钮记录，不调用模型，没审过的内容都藏起来。
- 两个版本的差别，是 `src/core/features.ts` 里的一排开关。这次新加了三个，上架版开、完整版关：`setupQuestions`（引导里的三个小问题）、`proInterest`（"我的"页的"想要 Pro 吗？"）、`anonymousCounts`（匿名计数）。
- 每周小结两个版本都有，在"趋势"页最上面。只列三个数字：记下的用药次数和计划次数、体重变化（这 7 天里称过两次以上才有）、记了症状的天数。不给建议。算法在 `src/core/weekly.ts`。
- "计划次数"只算到现在为止：今天晚些时候才到点的那一次先不算，记了才算，所以按时记的人不会被显示成"少一次"。"每隔几天"的排期没有固定时刻，计划次数跟着记录走：每记一次算一次，中间隔了两个以上间隔就把漏掉的补上，最后一次之后每满一个间隔再加一次。
- "想要 Pro 吗？"点开只说 Pro 还没有推出，不列任何功能。按钮"我想要"不解锁任何东西。

**匿名计数发什么**

每条消息都带四样：在手机上随机生成的安装编号、应用版本号、事件名、"设置完成后的第几天"（不发日期）。事件只有下面七种，别的一概不发。

| 事件 | 什么时候发 | 另外带的内容 |
|---|---|---|
| `setup_finished` | 走完引导 | 三个小问题的回答（没答的是 null）、针剂还是口服 |
| `activated` | 引导完成当天或之后 8 天内，记了一次新的用药。引导里补填的"上一次用药"不算 | 无 |
| `logged_week` | 激活后的每一周发一次 | 第几周、这一周有没有记过用药 |
| `week2_active` | 激活后第 8 到 14 天里记过用药 | 无 |
| `four_week_streak` | 激活后的 28 天按自己的排期切成一段一段（每周一针就是 4 周），每段算一次计划用药，这一段里记过就算完成。完成的达到四分之三就算达标（每周一针是 4 段里 3 段）。同一段里记几次都只算一次，所以第一周连记三天不算达标。28 天里计划用药不到两次的排期（比如每 30 天一次）不算。每天用的药：4 周里至少 3 周，每周至少有 4 天记过。只在这 28 天里判断，按这 28 天里见过的最严的排期算；28 天过完就不再看，之后改排期不会补发 | 无 |
| `paused_or_stopped` | 把用药标成暂停或停药 | 无 |
| `wants_pro` | 点了"我想要"（点的时候正在分享计数才发） | 无 |

- 不发：药名、剂量、体重、症状、任何手写的文字、时区、语言、日期和时间。（服务器会自己记下每条计数到达的日期，见下面"服务端"。）
- "记了"按在应用里记下的那一刻算，不按填写的用药时间算。"天"按手机当地的日历日算，激活当天是第 1 天。
- 只有"新的用药"才算数：引导完成之后记下的，而且填写的用药时间不早于引导完成那天。引导之后补记以前的老记录（用药时间在引导那天之前），不算激活，也不算"这一周记过"。
- 手机时钟被调快又调回来时，调快期间多报的那几周会在真正到来时重新报一次。服务器上同一个编号、同一周有两条时，以后到的那条为准。
- 定义和消息格式都在 `src/core/counts.ts`。手机入队之前、服务器存之前，用同一个函数 `parseCountMessage` 检查格式。

**同意**

- 引导最后一屏问一次：两个一样大的按钮（"分享使用计数"和"不分享"），没有默认选项，屏幕上逐条列出发送的内容。点"分享"之前，不生成编号，不排队，不发送。
- "我的"页有开关。打开时会先弹出同一份说明和同样的两个按钮。关掉只要点一下：清空本机队列，丢掉编号，向服务器发删除请求。请求没发出去会一直重试。之后再打开，用的是新编号。
- 分享开着的时候，"我的"页会显示这个随机编号。用户发邮件问自己的计数时，可以报这个编号。
- "删除全部数据"也会请服务器删掉这个编号的计数。
- 服务器不知道有多少人选了"不分享"。同意比例要拿商店后台的安装数来算。

**怎么打开计数**

1. 启动服务端时指定计数文件：`COUNT_FILE=data/counts.jsonl pnpm start`，一行一条。不设 `COUNT_FILE`（或填 `off`）就没有这两个接口：只托管完整版的服务端不接收任何计数。`COUNT_KEEP_DAYS` 是保存期限（天数）：超过这么多天的计数会被删掉，启动时删一次，之后每天删一次；不设就一直留到用户关掉计数为止。隐私政策里写了保存期限，上线时必须设这个值。应用和服务端不在同一个网址时，用 `COUNT_ALLOW_ORIGIN` 填应用的网址。
2. 构建上架版时给出服务器地址：`VITE_COUNT_URL=https://你的域名/api/count pnpm build:launch`。同一个网址下可以写 `/api/count`。地址写错（不是 https，也不是本站路径）会让构建直接失败。构建后的检查脚本读同一个变量：给了地址，产物里只允许有计数那一处联网；没给，一处都不允许。
3. 没给 `VITE_COUNT_URL`，上架版就不计数：不问，不排队，不发，产物里也没有任何联网的代码。完整版任何时候都不计数。

**服务端**（`server/count.ts`）

- `POST /api/count`：一次一条。多一个字段、少一个字段、值不在清单里、超过 1 KB，都拒收，什么也不存。
- `DELETE /api/count/<安装编号>`：删掉这个编号的全部记录。有没有这个编号，回答都一样。
- 存下来的只有消息本身，加上到达的日期（不带时刻）。同意页上写明了服务器会记下到达日期。按保存期限删除靠的就是这个日期。不存 IP 地址，不存浏览器信息。存储是一个接口（`CountStore`），默认实现是只在末尾追加的文本文件，只有删除时才重写。
- 一个编号被删除之后的一小时内，再收到这个编号的消息会直接丢掉（回答和平时一样）。这份"刚删过"的名单只放在内存里，不写进任何文件。
- "删除全部数据"和关掉计数一样，先停止计数、清空本机队列，等正在发送的那一条发完，再发删除请求，所以不会有计数在删除之后才到。
- 部署时，把反向代理对这两个接口的访问日志关掉，不然 IP 地址会留在代理的日志里。
- 同一条消息可能因为重试到达两次。统计时按"编号 + 事件 + 第几周 + 第几天"去重；同一个编号同一周有两条内容不同的 `logged_week` 时，取文件里靠后的那条。
