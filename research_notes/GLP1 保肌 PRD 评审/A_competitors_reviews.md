# A. 竞品矩阵与用户口碑（GLP-1 相关 App）

> 研究日期：2026-11-19 ｜ 对照文档：`PRD_v1.0.txt`（GLP-1 保肌与周期管理 AI Agent）
> 方法与局限（先读这一段）：
> - 本环境无法直接抓取页面（apps.apple.com、meagain.com 均 DNS 拒绝；reddit.com 被搜索工具拒绝）。下面的信息全部来自 WebSearch 的结果摘要，共用了约 45 次搜索。
> - **引用规则**：「"..."」= 搜索摘要中出现的原文片段（verbatim snippet），可直接引用但建议上线前打开原页面核对。「(paraphrase)」= 摘要的转述，不是原话。「(unverified)」= 单一来源、来源有利益关系（竞品博客/厂商自述）或数字相互矛盾。
> - 来源编号 [Sx] 对应文末 **Sources** 列表中的 URL。
> - **Reddit 原帖一条都没拿到**。下面的“用户之声”主要来自 App Store、Google Play、Trustpilot 的评论片段，以及引用了评论的第三方文章。

---

## 0. 关键结论（TL;DR）

1. **记录类功能已经商品化，而且是免费的。** MyFitnessPal 于 2026-04-28 向所有用户免费上线 GLP-1 Support（用药记录、注射部位、提醒、副作用）[S24]。Oura 在 2026-06 推出 GLP-1 Insights，美国已有约 26 万会员开启（厂商自报）[S55]。Glapp 整个 App 基本免费，用户评价它是 "certainly the best FREE app available for GLP-1 tracking" [S15]。仅 2026 年就有至少 568 个标题含 "GLP-1" 的新 App 上架（AppMagic 数据，经 Benzinga）[S66]。
2. **头部专用 tracker Shotsy 的口碑很好，但持续涨价。** 年费从 $19.99（2025-02 种子轮时）[S8] 涨到 $29.99，再到 $39.99 或 $49.99 [S3][S4]。药物浓度曲线是付费功能 [S7]。竞品正拿“免费曲线”来打它 [S4]。
3. **用户投诉最多、最严重的三类：**
   - 付费墙、计费、取消订阅（MFP 把条码扫描收费、Cal AI 绑卡试用自动续费、Noom/WW 的 GLP-1 计费纠纷）；
   - AI 识餐不准（Cal AI 2026-10 头号投诉，主要是份量估错）；
   - 同步、启动、稳定性问题（Shotsy 多次发版修复启动失败、iCloud 同步、图表数据错误；WW 反复登出）。
4. **“保肌/力量训练”在专用 tracker 里基本是空白。** 唯一成体系的是 Noom 的 Muscle Defense（FitOn 静态训练库加蛋白目标）[S42][S43]。其余是 Hims & Hers 的合作权益（Ladder、iFIT、Tonal）[S57]，以及器械品牌发布的 GLP-1 训练内容 [S59]。**没有找到任何一款产品把训练强度和用药周期、副作用联动**，这正是 PRD 的核心差异点，方向成立。
5. **PRD 遗漏了竞品的“基本盘”功能：** 口服 GLP-1（Wegovy 药片 2026-01 上市、Lilly Foundayo）、复方/微剂量（mg/mL 换算单位）、药品库存与续药、桌面小组件/Watch、条码扫描、维持期/停药模式、多药物计划、显式的打针提醒（PRD 把推送限制在每天 ≤2 条，和打针提醒冲突）、隐私承诺。
6. **PRD 的 PK 模型过于简化。** 纯指数衰减会让注射当刻显示为 100%，和 PRD 自己定义的“D1–D3 峰值期”矛盾。行业已有批评，竞品 Glapp 宣称其模型包含 Tmax 和生物利用度 [S16][S67]。
7. **PRD 的蛋白目标可能过高。** 一项基于 App 数据的研究显示，GLP-1 用户日均蛋白只有 0.6 g/kg，88% 低于 0.9 g/kg [S69]。PRD 设定的“≥1.2 g/kg 达标率 ≥75%”很可能无法实现，需要分层目标。

---

## 1. 竞品矩阵

### 1a. 功能矩阵

图例：✓ 有来源确认；(P) 仅付费版；✗ 来源明确说没有；? 未找到证据（**不等于没有**）。

| App | 注射记录+提醒 | 药物浓度曲线 | 副作用记录 | 蛋白追踪 | AI 拍照识餐 | 条码 | 力量训练 | 体成分 | Apple Health / Garmin | 医生报告/导出 | 小组件 / Watch | 复方单位/浓度换算 | 库存/续药 | 口服 GLP-1 | 维持/停药模式 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Shotsy** | ✓ 免费 [S7] | ✓(P) [S7][S6] | ✓ [S7] | ✓ 从 Health 导入 [S1] | ? | ? | ? | 仅体重 | AH ✓(P) [S3]；Garmin ? | 导出 ✓(P) [S3]；PDF ✓ [S12] | 小组件 ✓ [S2]；Watch ? | ? | ? | ✓ Wegovy 药片、Rybelsus [S1][S8] | ✓ Maintenance Mode [S12][S2] |
| **Glapp** | ✓ 剂量/时间/部位 [S13] | ✓ 含 Tmax/生物利用度 [S16] | ✓ [S17] | 部分（营养建议；用户想要热量/宏量）[S13][S15] | ? | ? | ? | ? | ? | 周报 ✓ [S14] | ? | ✓ 复方 tirzepatide [S17] | ✓ 西林瓶/笔/BUD [S13] | ? | ? |
| **Pep**（Shred Apps） | ✓ [S18] | ? | ✓ [S18] | ✓ [S18] | ✓ 热量/蛋白/纤维/脂肪 [S18] | ? | ? | ? | AH 步数/消耗 ✓ [S18] | ? | ? | ? | ? | ✓ [S18] | ? |
| **MeAgain** | ✓ [S22] | ? | ✓ [S22] | ✓ 蛋白是首要目标，首页快捷加 [S12] | ? | ? | ? | ? | ? | ? | ? | 自营复方药 [S20] | ? | ✓ [S22] | ? |
| **MyFitnessPal** | ✓ 免费，2026-04 上线 [S24] | ✗（未见） | ✓ 上线时仅 iOS [S24] | ✓ | 有（Meal Scan，本次未核实） | ✓(P) [S31] | 2024 GLP-1 计划含保肌视频 [S26] | ? | ✓ | ? | ? | ✗ 不校验剂量 [S25] | ? | ? | ? |
| **Cal AI**（2026-03 被 MFP 收购） | ✗ 无用药功能（竞品说法）[S41] | ✗ | ✗ | ✓ | ✓ 核心功能 | ? | ✗ | ✗ | ? | ? | ? | ✗ | ✗ | ✗ | ✗ |
| **Noom**（GLP-1 Companion / Noom Med） | 部分 | ? | ? | ✓ 蛋白目标 [S43] | ? | ? | ✓ Muscle Defense（FitOn）[S42] | ? | ? | ? | ? | 卖 microdose 方案 [S45] | — | ? | 停药试点研究 [S70] |
| **WeightWatchers**（Med+/Core+） | 部分 | ? | ? | ? | ? | ? | 只有博客内容 | ? | ? | ? | ? | ✗ 只做品牌药 [S49] | — | 有博客 [S65] | ? |
| **Lose It!** | 2026 年加入 GLP-1 追踪 (unverified) [S51] | ? | 另一评测说没有 [S51] | ✓(P) [S51] | Snap It，识别准确率约 55% (unverified) [S86] | ✓ | ✗ | ✗ | ✓ | ? | ? | ✗ | ✗ | ? | ? |
| **MacroFactor** | ✗ 未见 GLP-1 功能 [S53] | ✗ | ✗ | ✓ | ? | ✓ | ✗ | ? | ✓ | ? | ? | ✗ | ✗ | ✗ | 用户自用来减停药 [S53] |
| **Cronometer** | ✗ 无专门用药流程 [S52] | ✗ | 用时间戳记症状（Gold）[S52] | ✓ | ? | ✓ | ✗ | ? | ✓ | ? | ? | ✗ | ✗ | ✗ | ✗ |
| **Oura GLP-1 Insights** | ✓ 周针、日服都支持 [S55] | ? | ✓ [S55] | ? | ? | ? | ? | 体重从体重秤导入 [S55] | ✓ 加睡眠/HRV 情境 | ? | 戒指 | ? | ? | ✓ Foundayo [S55] | ? |
| **Hims & Hers** | 远程医疗 | — | — | — | — | — | 合作权益：Ladder 3 个月免费、iFIT AI 教练、Tonal 减 $1,000 [S57] | — | — | — | — | 卖复方 | — | — | — |
| **Lilly Health app** | 用药日志 [S61] | ? | ? | ? | ? | ? | 活动记录 [S61] | ? | ? | ? | ? | — | LillyDirect 药房 [S62] | Foundayo [S62] | ? |
| **小众 tracker** | GlucoPal 自动轮换部位 [S76]；GLP3 Planner 免费浓度图 [S4]；Dosed 配药计算器 [S78]；ProteinDose 蛋白缺口 [S77]；GLP-1 AI 按 1.6 g/kg 蛋白优先 [S77] | | | | | | | | | | | | | | |

### 1b. 价格、评分与体量

| App | 定价 | App Store 评分（人数） | 体量 / 融资 |
|---|---|---|---|
| **Shotsy** | 核心功能免费，Shotsy+ 付费。年费演变：$19.99（2025-02）[S8] → $29.99 → $39.99 [S3] 或 $49.99 [S4]。月费 $7.99 → $9.99 [S3]。2026-10 美区内购列表：$9.99–$19.99/月，$39.99–$59.99/年 [S6] | 美区 4.9（1.7 万）[S1]；另一快照 4.8（约 2 万）[S2]；厂商称 4.8（3.4 万+）[S5] (unverified) | 2025-02 种子轮 $2.25M [S10]；当时 10 万下载、$1M 年化收入、已盈利 [S8][S9]；厂商称 100 万+ 用户 [S5] (unverified)。创始人 Aja Beckett，俄勒冈州 Salem [S9] |
| **Glapp** | 基本免费；宣布推出 "Glapp Max" 付费档，价格未知 [S13][S15] | Trustpilot 4.8（69–109 条）[S15]；App Store 评分未找到 | 未找到；iOS 和 Android 都有 [S14] |
| **Pep** | 免费 + 订阅 [S18] | 未找到 | 未找到 |
| **MeAgain** | App 约 $9.99–10/月；另卖复方司美 $129/月、替尔泊肽 $199/月 [S20]；软付费墙，无免费试用 [S21] | 4.8（1.5–1.7 万）(unverified，厂商自报) [S20] | 厂商自报 28.6–37.2 万用户，数字前后不一 (unverified) [S20] |
| **MyFitnessPal** | GLP-1 Support 免费 [S24]；Premium 约 $8.34–24.99/月 [S36]；常被引用 $19.99/月 | 平均分从 4.1（2024）降到 3.6（2026 Q1），竞品统计 (unverified) [S33] | 2026-03-02 宣布收购 Cal AI [S27] |
| **Cal AI** | 3 天试用必须绑卡，到期自动续费 [S39] | MyNetDiary 2026-10 评分卡记为 2.94 [S37] | 1500 万下载、过去 12 个月收入 $40M [S28]；联合创始人称 ARR 超 $50M [S29]；独立运营，已接入 MFP 2000 万+ 食物库 [S27] |
| **Noom Med** | 会员约 $99/月（首月约 $39），药费另计 [S44]；打包方案 microdose $179/月、标准 $249、Plus $299 [S45] | BBB 上 1,000+ 投诉（主要是计费/取消）[S46] | Muscle Defense 2024-01 上线 [S42]；与 LillyDirect 合作提供 Zepbound 西林瓶 [S92] |
| **WW Med+** | 首月 $25，之后 $74/月（12 个月）或 $84/月（6 个月），药费另计 [S49] | Trustpilot 约 3.9（1,660+）[S49] | 只做品牌药，不做复方 [S49] |
| **Lose It!** | Premium 约 $39.99/年（来源不一）[S51] | 未取得 | 未找到 |
| **Oura** | 含在 Oura 会员内（会员价本次未核实） | — | GLP-1 Insights 美国约 26 万人开启（厂商自报）[S55] |
| **PRD（参照）** | Freemium；7 天试用需绑卡；$69.99/年或 $12.99/月 | — | — |

---

## 2. 逐个 App 的发现

### 2.1 Shotsy（品类头部专用 tracker）

**定位与功能**
- 支持 Ozempic、Wegovy、**Wegovy Pill**、Mounjaro、Zepbound、Rybelsus、Saxenda、Victoza、Trulicity；较新版本还列出 retatrutide [S1][S8]。
- 数据存在设备本地，经 iCloud 同步 [S2]。仅 iPhone，要求 iOS 18 及以上 [S2]。
- 免费版：记录打针和剂量、提醒、注射部位轮换、副作用、体重 [S7]。
- Shotsy+：估算药物浓度曲线、Apple Health 同步、数据导出 [S3][S7]。
- 曲线说明原文："Using published pharmacokinetic data for each medication, Shotsy charts how your estimated medication level rises and fades between doses. The chart is an estimate for context, not a measurement." [S7]
- 有首页小组件（下一针倒计时）[S2]、Maintenance Mode 和维持期体重图 [S2][S12]、多药物计划和 PDF 导出（据竞品 MeAgain 的对比页）[S12]。

**口碑：好评**
- "clean, intuitive, and incredibly easy to use"（App Store 片段）[S1]
- 有人描述它把 GLP-1 治疗的关键数据都收在一起：日期、剂量、体重、副作用 (paraphrase) [S1]
- 一位长期用户转成年付，觉得“值这个价” (paraphrase) [S2]
- 一位用户在断药一段时间后，用浓度曲线规划“逐步重新滴定” (paraphrase) [S2]。注意：这说明用户会拿曲线来做剂量决策，PRD 合规上要预料到这种用法。
- 开发者响应快："recently left a negative review after a major update made the scheduling feel a bit glitchy"，开发者修好后用户撤回了差评 [S1]

**口碑：投诉**
- 启动慢："it can take a bit before your data shows up" [S1][S2]；另一条说 App "seemed stuck a few times before the data showed up" (paraphrase) [S2]
- 排期逻辑难懂："scheduling of next doses a little awkward at first (but I've got the hang of it now)" [S2]
- 发版说明暴露的质量问题：
  - "Improve startup reliability, including issues that could prevent the app from opening"
  - "improve iCloud sync reliability"
  - 修复 "weight chart occasionally showing incorrect data"
  - 修复 "estimated medication level charts for edge cases"
  - "Fixes a bug where the next shot countdown home screen widget gauge wasn't progressing" [S1][S2]
- 涨价：竞品称 "Shotsy recently raised prices from $29.99 to $49.99/year after receiving $2.25M in VC funding"（竞品说法）[S4][S84]

**隐私**：政策写明会分享匿名聚合数据用于观察性研究 [S11]。

### 2.2 Glapp（免费路线，周期解读）

- 支持 Mounjaro、Ozempic、Wegovy、Zepbound、tirzepatide、semaglutide。记录剂量、时间、部位；库存追踪覆盖西林瓶、笔和 BUD（超期使用日）[S13]。
- **"shot phases that predict hunger, cravings, and energy shifts"**，营养建议随用药周期变化 [S13]。这和 PRD 的峰值期/平台期/衰减期高度重叠，**“周期联动”本身不再独有**。
- "Weekly Progress Reports perfect for your next doctor's visit" [S14]
- 浓度模型宣称使用半衰期、Tmax、生物利用度三个参数（tirzepatide 半衰期约 5 天）[S16]
- 支持复方 tirzepatide [S17]；有 Android 版 [S14]

**好评**："certainly the best FREE app available for GLP-1 tracking"；"the other apps have subscriptions that can unlock more features, but Glapp offers many of these features for free" [S15]

**投诉**
- 已开封的西林瓶没有排在列表顶部（"...when they were not selected by oldest BUD date"）[S14]
- 希望支持更多肽类药 (paraphrase) [S14]
- 想要热量和宏量追踪 (paraphrase) [S15]
- 只有英文（德语用户反馈）(paraphrase) [S15]

### 2.3 Pep（GLP-1 Tracker: Pep，Shred Apps LLC）
- 功能："jab scheduling, nutrition tracking, side effect monitoring, progress logging" [S18]
- "AI Food Scanner – Snap a photo of your food and instantly get estimates for calories, protein, fibre, and fat" [S18]
- 后续版本支持口服药片；有订阅档 [S18]
- 没找到评分。有指南称 Pep 的 App Store 隐私标签写“不收集数据”，隐私政策却写收集健康数据 (unverified) [S80]

### 2.4 MeAgain（App 加自营复方远程医疗）
- 自称 "the leading GLP-1 app"，覆盖针剂或药片、饮食、副作用、体重、AI companion [S19][S22]
- 蛋白是首页首要目标并支持快捷加；有 shot-day checklist（打针日清单）[S12]
- 商业模式：App $10/月，另卖复方药 [S20]。软付费墙，没有免费试用 [S21]
- 用户评论：换手机迁移后出现重复通知 "Once migrated into the new phone, I was having duplicate notifications..." [S19]；有人称赞客服 [S20]
- 隐私：搜索摘要称其政策会收集健康数据和 AI 聊天数据，并可能用去标识化数据改进自家模型 (unverified，来自第三方转述) [S80]
- 注意：它自己发布的“2026 最佳 GLP-1 App”榜单把自己排第一 [S22]，learnmuscles 的榜单同样把 MeAgain 排第一 [S23]，两者都应按营销内容看待

### 2.5 MyFitnessPal（含 Cal AI）
- 2024-04 推出免费的 GLP-1 Nutrition Plan（7 天计划、食谱、保肌运动视频）[S26][S89]
- **2026-04-28 推出免费的 GLP-1 Support**：用药日志（剂量、注射部位、时间）和食物记录在同一屏，有提醒；副作用追踪上线时仅 iOS；仅美国 [S24]
- 帮助中心原文："does not verify medication, doses, timing, or safety" [S25]
- 2026-03-02 宣布收购 Cal AI，Cal AI 独立运营并接入 MFP 的 2000 万+ 食物库 [S27]。联合创始人称交易实际在 2025-12 完成 [S29][S30]
- 用户投诉（大多来自竞品博客，(unverified)）：
  - 条码扫描收费："MyFitnessPal's 2022 decision to paywall barcode scanning remains the loudest single complaint in the whole category, three years later" [S31]；"The barcode scanner (previously free on Android) now requires a premium subscription" [S32]；用户博客标题 "hey myfitnesspal we're not paying for a damn barcode scanner" [S35]
  - 广告："ads on the free tier intrusive and slow the app down significantly" [S32]
  - 付费用户也遇到："paying subscribers report the same logouts and crashes as free users" [S32]
  - 一位被引用的 Reddit 用户抱怨每月约 $20，觉得被多收了 (paraphrase) [S34]
  - 平均分从 4.1 降到 3.6 [S33]

**Cal AI**
- MyNetDiary 2026-10 评分卡原文："Cal AI fell 0.10 to 2.94, with scan accuracy replacing the paywall as its most frequent complaint" [S37]
- 有博客引用 Reddit 用户说它 "often doesn't understand portion size"，并称包装类或分层食物误差 30–40% 很常见 (unverified，单一博客) [S40]
- 3 天试用必须绑卡，"auto-renews to a full subscription the moment it ends"；删除 App 不会停止扣费 [S39]
- 厂商宣称整体准确率 90% [S39]
- 没有用药功能（竞品说法）[S41]
- MyNetDiary 2026-06 统计（1,379 条美区评论、10 个 App）：准确性投诉集中在以 AI 拍照为主要记录方式的 App [S38]

### 2.6 Noom（GLP-1 Companion、Muscle Defense、Noom Med）
- GLP-1 Companion 是 Noom Weight 内一个免费、可选的功能 [S43]
- Muscle Defense：FitOn 提供的力量训练库，配蛋白目标，2024-01 宣布，对所有会员开放 [S42][S43]
- 价格：Noom Med 约 $99/月 [S44]；打包方案含 microdose $179/月（2026-07-27 降价）[S45]。这说明**微剂量已是主流付费 SKU**
- 投诉集中在计费：
  - BBB 1,000+ 投诉，以计费和取消为主 [S46]
  - "advertised prices that don't reflect the true monthly cost"，多月计费藏在小字里 (paraphrase) [S47]
  - 发货延迟、很少能和医生直接沟通 [S48]
- 停药研究：39 名停用 GLP-1 的成人。常规护理组体重反弹约 10.75%，Noom App 组 3.6%，医疗餐组 3.58%。样本小 [S70]

### 2.7 WeightWatchers（Med+ / Core+ GLP-1 Success Program）
- Med+ 首月 $25，之后 $74–84/月；只做品牌药，不碰复方 [S49]
- Trustpilot 和 ConsumerAffairs 上的投诉 (paraphrase)：
  - GLP-1 计费和承诺期限注册时没讲清
  - 取消后仍被扣费
  - 入组后拿不到处方
  - App 反复登出、"unreliable"
  - 频繁更新让老年用户更难找到功能 [S50]

### 2.8 Lose It! / MacroFactor / Cronometer（通用营养工具）
- **Lose It!**：2026 年 "GLP-1 tracking joins the app listing" (unverified) [S51]，但另一评测称它没有用药、副作用、剂量功能 [S51]。Premium 约 $39.99/年，宏量和蛋白追踪在付费墙后 [S51]。Snap It 识别准确率约 55%（CNET 2025 测试，经竞品转述，unverified）[S86]
- **MacroFactor**：自适应消耗算法 [S53]，未找到 GLP-1 专属功能。一位用户在 App Store 写道 "began weaning off after 4 months on MF, and fully ended semaglutide 6 months ago" [S53]，说明**停药和维持期有需求**
- **Carbon**（同类自适应教练）官方承认：教练可能不断上调热量目标，而食欲抑制让用户吃不到；建议用户按实际进食记录，并设有热量下限 [S54]。**自适应算法和 GLP-1 低食欲存在系统性冲突**，PRD 的蛋白底线要避免同样的问题
- **Cronometer**：官方博客介绍用时间戳（Gold 功能）记录症状、提醒进食 [S52]；第三方称它没有 GLP-1 用药流程

### 2.9 可穿戴与平台
- **Oura GLP-1 Insights**（2026-06 起在美国、阿联酋、印度推送）[S55][S56]：
  - 包括剂量追踪、副作用、体重、个性化洞察，Oura Advisor 会把 GLP-1 当作背景信息
  - "remind you to take your medication, whether you're on a weekly one like Zepbound or a daily like Foundayo"
  - 约 26 万美国会员开启（厂商自报）
  - 对 PRD 的威胁：Oura 已经把用药周期和睡眠/HRV 放在同一个 App 里
- **Garmin / Withings**：未找到面向消费者的 GLP-1 功能。Withings 只有停药后体重管理的营销文章（链接见 [S70] 第二条）

### 2.10 “保肌 / 力量”角度
- **Noom Muscle Defense**：见 2.6
- **Hims & Hers**：
  - 官方说法承认 GLP-1 期间肌肉流失常见 [S91]
  - 会员权益：Ladder 前 3 个月免费、iFIT AI 教练、Tonal 2 减 $1,000（2026-11）[S57]
  - 新增 "clinician-backed AI guidance" 用于提高 GLP-1 会员留存 [S57]
- **Peloton**：CEO Peter Stern 把 "cardio plus strength" 和 GLP-1 用户增长联系在一起，但没找到专门的 GLP-1 课程 [S58]
- **其他训练内容**：iFIT 6 周 GLP-1 力量系列、Tonal GLP-1 页面、PVOLVE GLP-1 Strength Training Series、Darebee 免费 GLP-1 计划 [S59]
- **Fitbod**：只有博客文章，没有对应功能 [S60]
- **Ladder、Future、Strava/Runna、Ro**：没有找到 GLP-1 专属产品，详见第 6 节
- **FuturHealth**：GLP-1 药加送餐、Apple Fitness+、营养师 [S83]
- **Omada**：12 周体成分研究，提供以力量为主的个性化方案 [S82]
- 行业观察：一份 2026-04 品类研究报告写道 "No protein or muscle-loss guidance"，指现有 App 缺乏蛋白和肌肉流失指导 (unverified) [S71]

### 2.11 药企
- **Lilly Health app**：用药和活动日志。评价两极，有人反映更新后出问题 (paraphrase) [S61]。LillyDirect 药房提供 Zepbound 和 **Foundayo**（每日口服）[S62]
- **NovoCare**：2026 年为 Wegovy 患者推出多项更新，被解读为对抗 Zepbound 的留存举措 [S63]
- **Wegovy 药片**：2026-01-05 在美国上市，每日 25 mg（起始 1.5 mg）[S64][S65]；服药后 30 分钟内不能进食饮水，送服水不超过约 4 oz [S65]；自费 $149–299/月 [S64]。未找到官方提醒或计时功能

---

## 3. 投诉主题（按频率与严重度排序）

排序依据：多少个来源、多少个 App 出现过；对留存和付费的伤害有多大；离 PRD 有多近。H/M/L 表示严重度。

| # | 主题 | 严重度 | 证据（App · 引文或转述 · 来源） | PRD 是否覆盖 |
|---|---|---|---|---|
| 1 | **付费墙、涨价、计费和取消** | H | MFP 条码收费是“全品类最响的投诉”[S31]；MFP 约 $20/月，用户觉得被多收 [S34]；Shotsy 年费涨了 2–2.5 倍 [S3][S4][S8]，浓度曲线是付费功能 [S7]；Cal AI 绑卡试用自动续费、删 App 不停扣费 [S39]；Noom BBB 1,000+ 计费投诉 [S46]；WW 取消后仍扣费 [S50]；Glapp 因免费受称赞 [S15] | 部分。PRD 免费版保留打针和曲线（好）；但 7 天试用**需绑卡**，正踩 Cal AI 的坑；$69.99/年高于 Shotsy |
| 2 | **AI 识餐不准（份量）** | H | Cal AI 2026-10 头号投诉 [S37]；"often doesn't understand portion size" [S40]；Lose It Snap It 约 55% [S86]；AI 拍照为主的 App 准确性投诉更集中 [S38] | 部分。有置信度 <70% 高亮和 ±5g 微调；**缺准确率验收指标**，**缺条码和营养标签识别**（蛋白粉、蛋白棒、乳制品是 GLP-1 人群蛋白主力） |
| 3 | **同步、启动、稳定性、数据异常** | H | Shotsy 启动失败、iCloud 同步、体重图数据错误等修复 [S1][S2]；"it can take a bit before your data shows up" [S1]；MFP 付费用户也登出和崩溃 [S32]；WW 反复登出 [S50]；GLPulse 改成只在启动和刷新时同步 [S73]；某 GLP-1 tracker 同步 Apple Health 后步数错误 [S87]；MeAgain 迁移后重复通知 [S19]；Peachy Progress 把 "no crashes, no data loss, no duplicate entries" 当卖点 [S74]（反过来说明这是行业痛点） | ✓ 覆盖较好：本地优先、时区绑定、HealthKit 去重、冷启动 ≤1.5s、365 天数据下仍 60 FPS |
| 4 | **排期和剂量逻辑复杂或出 bug** | M | Shotsy 排期 "glitchy"，"a little awkward at first" [S1][S2]；小组件倒计时不走 [S2]；Glapp 西林瓶排序 [S14] | 部分。PRD 改历史记录后会全量重算，但没提剂量递增、漏针、改注射日、多药物的场景 |
| 5 | **广告和臃肿（大平台）** | M | MFP 免费版广告 "intrusive and slow the app down" [S32]；WW 频繁更新让导航更难 [S50] | ✓ PRD 无广告、3 Tab、不做游戏化 |
| 6 | **通用 App 缺少 GLP-1 流程；自适应算法和低食欲冲突** | M | Cal AI 无用药功能 [S41]；Lose It 和 Cronometer 无专门流程 [S51][S52]；Carbon 承认会持续上调目标 [S54] | ✓ 专用；需注意蛋白底线别变成“压力源” |
| 7 | **蛋白目标难达成（低食欲）** | M-H | App 数据研究：日均 0.6 g/kg，88% 低于 0.9 g/kg [S69]；GLP-1 用户吃得更少，但宏量比例不变 [S69] | 部分。有快捷补录、高密度补救、“无负罪感”文案；但**目标 1.2–1.6 g/kg、达标率 ≥75% 偏激进** |
| 8 | **缺保肌和力量训练指导** | M | 品类报告 "No protein or muscle-loss guidance" [S71]；只有 Noom（静态库）和 Hims（合作权益）在做 [S42][S57] | ✓ **PRD 的核心差异点** |
| 9 | **药物浓度曲线的准确性和可信度** | M | 单指数衰减忽略吸收期是“错的”[S67]；Shotsy 修复曲线边界情况 [S2]；各家都只敢说是 "illustrative models"（Glyra）[S68] | ✗ PRD 用的正是被批评的单指数模型（见 5.2） |
| 10 | **隐私** | M | 2026 年新增 568 个 GLP-1 App，开发者隐私标准参差 [S66]；隐私标签和政策不一致（Pep）(unverified) [S80]；MeAgain 用聊天数据训练模型 (unverified) [S80]；Shotsy 分享聚合数据 [S11]；GitHub 小样本审计称 67% 带第三方广告 SDK (unverified) [S81] | ✗ PRD 只有医疗免责声明，没有隐私条款 |
| 11 | **复方、微剂量、单位换算** | M（PRD 目标人群里可能偏低） | Glapp 支持复方和西林瓶 [S13][S17]；专门的配药计算器 App 存在（Dosed、PepProCalc $6.99）[S78]；常见浓度 5/10/12.5/15/20 mg/mL，1 mg = 8 units（12.5 mg/mL 时）[S79]；Noom 卖 microdose 方案 [S45] | ✗ PRD 只能输入 mg，药物只有两种 |
| 12 | **口服 GLP-1** | M（上升中） | Wegovy 药片每天服、需 30 分钟空腹 [S65]；Foundayo 每天服 [S55][S62]；Shotsy、Pep、Oura 已支持 [S1][S18][S55] | ✗ PRD 只有注射，PK 也按针剂写 |
| 13 | **停药和维持期** | M | Shotsy 有 Maintenance Mode [S12]；MacroFactor 用户自己摸索减停药 [S53]；Noom 停药试点有效 [S70] | ✗ PRD 没有 |
| 14 | **多语言、平台覆盖** | L | Glapp 只有英文 [S15]；Shotsy 只有 iOS [S2] | PRD 支持中英混说语音；Android 放在 v1.1 |
| 15 | **远程医疗服务本身**（发货、医生沟通） | 本品不涉及 | [S48][S50][S61] | 不适用（PRD 不卖药，对用户反而是信任加分） |

> “历史记录难修改”“跨日归因错位”这两条是 PRD 第 2.2 节和第 4 节写的竞品痛点，**本次没找到直接证据**。不代表不存在，但 PRD 不应写成“竞品高频投诉”，除非团队另有评论数据。

---

## 4. 好评主题（用户认为的“基本盘”）

1. **简洁、快、一屏看全**："clean, intuitive, and incredibly easy to use"（Shotsy）[S1]；一处收齐日期、剂量、体重、副作用 [S1]。Gala 用户说之前 "gone through probably 10 different apps" [S72]，说明同类可替代性强、迁移成本低。
2. **免费的核心记录**：Glapp 因免费受称赞 [S15]；MFP 的 GLP-1 Support 免费 [S24]。**打针、副作用、体重的记录在 2026 年已默认免费。**
3. **药物浓度曲线和“打针相位”**：用户用来理解食欲和精力的波动、规划断药后的重新滴定 [S2][S13]。用户喜欢，但它是付费点（Shotsy）还是免费引流（GLP3 Planner [S4]），各家做法不同。
4. **提醒、倒计时、小组件**：Shotsy 下一针倒计时小组件 [S2]；各家都有提醒 [S7][S18][S55]。
5. **Apple Health 自动导入**：体重、热量、蛋白、饮水 [S1]。
6. **给医生看的报告**：Glapp 周报 [S14]、Shotsy PDF 导出 [S12]。这是基本盘，不算差异点。
7. **开发者和客服响应快**：Shotsy 修完 bug 后用户撤回差评 [S1]；MeAgain 客服受称赞 [S20]。
8. **蛋白是首要目标、可以一键加**：MeAgain [S12]、ProteinDose 蛋白缺口 [S77]。PRD 的卡片 2 和快捷胶囊与此一致。
9. **多药物、多剂型支持**：Shotsy 覆盖 9 种以上药物，含药片和 retatrutide [S1][S8]。

---

## 5. PRD 对照：已解决的、遗漏的

### 5.1 PRD 已覆盖，且有用户证据支撑

| PRD 条目 | 对应痛点或基本盘 | 证据 | 评价 |
|---|---|---|---|
| 抗阻训练库，按周期和副作用自动降档（3.3、2.4） | 缺保肌和力量指导 | [S71][S42][S57] | **最强差异点**。竞品只有静态训练库（Noom/FitOn）或合作权益（Hims），没有任何一家把训练和用药周期联动 |
| 本地优先、时区绑定、HealthKit 去重（第 4 节） | 同步、启动、数据异常 | [S1][S2][S73][S19][S74] | 方向正确。建议把“数据不丢、不重复”写进商店文案和隐私承诺 |
| 冷启动 ≤1.5s；365 天数据下仍 60 FPS | "it can take a bit before your data shows up" | [S1][S2] | 正中 Shotsy 的弱点 |
| 免费版保留打针记录和基础曲线 | Shotsy 把曲线放进付费墙后被竞品攻击 | [S7][S4] | 好。注意 MFP、Oura、Glapp 已把记录做成免费，付费理由必须全部落在保肌这一侧 |
| 记录 ≤5 秒；拍照、语音、快捷胶囊；左滑原地修改 | 记录摩擦 | [S1][S12] | 好；语音支持中英混说是差异点 |
| ±5g 微调，置信度 <70% 高亮 | AI 识餐不准 | [S37][S40] | 方向对，但缺准确率指标，见 5.2 |
| 推送每天 ≤2 条、无广告、不做游戏化 | MFP 广告和臃肿 | [S32] | 好。但会和打针提醒冲突，见 5.2 |
| “无负罪感”降级、禁止红色警告 | 低食欲下目标带来的压力 | [S54][S69] | 好 |
| 1 页临床 PDF | 医生报告是基本盘 | [S14][S12] | 是基本盘。免费版“终身 1 份”可能被拿来和 Glapp 免费周报比较 |
| 医疗免责、不给调剂量指令 | 行业惯例 | [S25][S2][S68] | 与行业一致 |
| 注射部位轮换和推荐 | 基本盘 | [S7][S76] | 与行业持平 |

### 5.2 PRD 遗漏或有风险（按优先级）

**P0（上线前应补）**

1. **打针/服药提醒没有明确写出，而且和推送上限冲突。** 所有竞品都有提醒 [S7][S18][S24][S55]。PRD 3.2 把“系统推送”限制在每天 ≤2 条，且只定义了蛋白检查点。建议把“用药提醒、补打提醒”列为不计入上限的用户主动提醒。
2. **口服 GLP-1 不支持。** Wegovy 药片已上市 [S64]，Lilly Foundayo 每天服 [S62][S55]，Shotsy、Pep、Oura 都已支持 [S1][S18][S55]。PRD 只覆盖司美和替尔泊肽两种针剂，PK 也只按针剂计算。口服药每天服、生物利用度低，mg 数和针剂不可比；还需要 30 分钟空腹计时 [S65]。
3. **PK 模型要改。**
   - PRD 用 C(t)=Σ Dᵢ·(1/2)^((t−tᵢ)/t½)，注射当刻就是最大值，和 PRD 自己定义的 “D1–D3 峰值期（12–72h）” 矛盾。
   - 行业已有批评："single exponential decay ... wrong because it ignores absorption" [S67]。Glapp 宣称使用 Tmax 和生物利用度 [S16]。
   - 建议改用一阶吸收加一阶消除（Bateman 函数），参数取说明书的群体均值。两药的 Tmax 和半衰期需要对照 FDA 说明书核对，本次未抓取。
   - 同时明确“%”的分母：是相对稳态峰值，还是相对当前维持剂量？
   - 支持剂量递增、漏针、改注射日。
   - 用户确实会拿曲线做重新滴定之类的决策 [S2]，文案要更谨慎。
4. **没有条码和营养标签识别。** MFP 条码收费是全品类最大投诉 [S31][S35]。蛋白粉、蛋白棒、希腊酸奶这类包装食品，拍照估份量本身就不准 [S37][S40]，扫条码才准。建议条码扫描免费。
5. **试用需绑卡，价格偏高。**
   - 绑卡试用加自动续费是 Cal AI、Noom、WW 投诉的核心 [S39][S46][S50]。建议试用到期前推送提醒，在 App 内一键说明如何取消。
   - $69.99/年比 Shotsy 的 $39.99–49.99 [S3][S4] 和 Lose It 的约 $39.99 [S51] 都贵，MFP 和 Oura 的 GLP-1 功能是免费或已含在会员里 [S24][S55]。溢价必须由保肌功能来撑起来。
   - Shotsy 的几次涨价已在竞品文章里被当作攻击点 [S4][S84]。

**P1（v1.0 或 v1.1）**

6. **复方、微剂量。** Noom 卖 microdose 方案 [S45]，MeAgain 和 Hims 卖复方 [S20][S57]，Glapp 支持西林瓶 [S13]。需要：mg/mL 加 units 的换算、任意 mg 剂量（如 1.25 mg）、西林瓶 BUD。即便目标人群以品牌药为主，LillyDirect 的 Zepbound 西林瓶也需要按“抽取量”记录 [S92]。
7. **库存和续药**（西林瓶、笔、药片剩余量和续药日期）：Glapp 已做 [S13]。
8. **小组件、锁屏、Live Activity、Apple Watch**：Shotsy 的倒计时小组件是被高频使用的功能 [S2]。PRD 定位“3 秒看决策”，小组件比打开 App 更快。
9. **维持期和停药模式**：Shotsy 有 Maintenance Mode [S12]，用户有减停药需求 [S53]，Noom 试点显示 App 支持能减少反弹 [S70]。**停药后正是保肌最关键的阶段**，和 PRD 主线高度契合，适合作为留存抓手和年付理由。
10. **隐私条款**：本地优先之外，PRD 应写明：无广告和第三方追踪 SDK、不出售或共享数据、照片和语音上传的处理与保留期限、一键导出和删除、App Store 隐私标签与政策一致 [S66][S80]。
11. **多药物和更多药物**：Shotsy 支持 9 种以上药物和 retatrutide [S1][S8]。PRD 至少应支持 Wegovy 药片、Foundayo、Zepbound 西林瓶和自定义药物。
12. **蛋白目标分层**：真实摄入均值只有 0.6 g/kg [S69]，“≥1.2 g/kg 达标率 ≥75%”很可能达不到，还会造成挫败。建议分“最低线”（如 0.8–1.0 g/kg）和“理想线”（1.2–1.6）；北极星指标用“周均达到最低线的天数”。同时追踪纤维和饮水（便秘是常见副作用；MeAgain 和 Pep 已追踪纤维 [S12][S18]）。

**P2（定位与竞争）**

13. **Oura 是“可穿戴加 GLP-1”路线的直接对手**（26 万用户，把 GLP-1 当作 Advisor 的背景信息）[S55]。PRD 的 HRV 和睡眠联动需要做到 Oura 做不到的程度：具体到训练处方，并且读得到 Oura、Whoop、Garmin 写进 Apple Health 的数据。
14. **Glapp 已经在讲“打针相位预测食欲和精力”** [S13]。PRD 的卖点要从“周期联动”收窄为“周期 × 副作用 × HRV → 今日训练处方 + 蛋白补救”。
15. **Garmin**：PRD 写了 Garmin 同步，但 Garmin 没有消费者 GLP-1 生态（本次未找到）。Garmin 数据通常要走 Garmin Health API 合作或经 Apple Health 中转，需要另行确认可行性和工期。
16. **“竞品历史数据难修改”“跨日错位”是 PRD 写的投诉前提，本次未找到证据**，建议在评审中标为假设，或补充评论样本。

---

## 6. 本次研究的缺口

- **Reddit 原帖为零**：reddit.com 被搜索工具拒绝，WebFetch 也不可用。r/Zepbound、r/Mounjaro、r/Semaglutide、r/loseit 上对这些 App 的讨论没有直接样本。建议人工补抓（关键词：`Shotsy`、`app to track shots`、`medication level chart`、`protein goal`、`MyFitnessPal GLP-1`）。
- **App Store 评论只看到少量片段**，以好评为主（搜索结果偏向列表页）。没拿到 1–2 星评论的系统样本，也没拿到 Shotsy、MeAgain、Pep、Glapp 在 App Store 的完整差评。评分快照互相矛盾（Shotsy 1.7 万 / 2 万 / 3.4 万）。
- **没有 Sensor Tower 或 Appfigures 的 GLP-1 App 下载和收入数据。** 体量数字多为厂商自报。
- **未覆盖或未确认**：Dose Day（没搜到）、Juniper、Voy、Ro Body Program（未找到体成分项目）、Ladder、Future、Strava/Runna 的 GLP-1 内容（未找到）、NovoCare App 的功能细节、MFP Meal Scan 是否针对 GLP-1、Cal AI 美区确切价格、Lose It 2026 年 GLP-1 功能（单一来源）、Lilly Foundayo 的确切通用名（推测是 orforglipron，未核实）。
- **很多来源是竞品营销**：nutrola、unstar、MyNetDiary、meagain.com、shotsyapp.com、glp3planner、HAVIT 都在卖自家产品。相关数字已标 (unverified)，结论层面只采信多方一致的部分（例如“条码收费”“Cal AI 份量不准”“Shotsy 涨价”）。
- **未研究消费级体脂秤（BIA）测瘦体重的准确性。** PRD 的“瘦体重保留率对比临床 65%”依赖这个数据，建议另开课题。
- **未抓取 FDA 说明书核实 PK 参数**（Tmax、t½、口服生物利用度）。

---

## Sources

- [S1] Shotsy US App Store — https://apps.apple.com/us/app/shotsy-glp-1-tracker/id6499510249 （另：https://apps.apple.com/us/app/shotsy-glp-1-%E6%B3%A8%E5%B0%84%E8%B7%9F%E8%B8%AA%E5%99%A8/id6499510249?l=en-US ）
- [S2] Shotsy 其他区 App Store 页 — https://apps.apple.com/app/id6499510249 ; https://apps.apple.com/gb/app/id6499510249 ; https://apps.apple.com/au/app/shotsy-glp-1-tracker/id6499510249 ; https://apps.apple.com/us/app/-/id6499510249 ; https://apps.apple.com/ca/app/id6499510249
- [S3] glp1nutrition.org Shotsy review — https://glp1nutrition.org/apps/shotsy-review/
- [S4] GLP3 Planner, Shotsy alternatives（竞品）— https://glp3planner.com/resources/shotsy-alternatives
- [S5] Shotsy 自家对比页 — https://shotsyapp.com/best-glp-1-tracker-apps/
- [S6] pepglp1.com 对比（2026-10）— https://pepglp1.com/best-glp-1-tracker-apps/ ; https://pepglp1.com/free-glp-1-tracker/
- [S7] Shotsy 官网功能页 — https://shotsyapp.com/free-glp-1-tracker/ ; https://shotsyapp.com/glp-1-tracker/
- [S8] Business Insider 报道（via Ground News）— https://ground.news/article/a-software-engineer-built-an-app-for-tracking-her-weight-loss-shots-in-8-months-its-crossed-100-000-downloads-and-has-2-million-from-vcs
- [S9] Silicon Florist — https://siliconflorist.com/2025/02/20/shotsy-lands-2-million-for-weight-loss-shot-tracking-app/ ; Greyb — https://greyb.com/startups/shotsy/
- [S10] PitchBook — https://pitchbook.com/profiles/company/749273-23
- [S11] Shotsy 隐私政策 — https://shotsyapp.com/privacy/
- [S12] MeAgain vs Shotsy（竞品写的）— https://meagain.com/alternatives/shotsy
- [S13] Glapp App Store — https://apps.apple.com/app/id6756984097
- [S14] Glapp Google Play — https://play.google.com/store/apps/details?id=io.glapp
- [S15] Glapp Trustpilot — https://ca.trustpilot.com/review/glapp.io ; https://no.trustpilot.com/review/glapp.io?page=3
- [S16] Glapp 博客：药物浓度 — https://glapp.io/blog/understanding-your-glp1-medication-levels/
- [S17] Glapp tirzepatide 页 — https://glapp.io/tirzepatide-app
- [S18] GLP-1 Tracker: Pep App Store — https://apps.apple.com/us/app/glp-1-tracker-pep/id6504788281
- [S19] MeAgain App Store — https://apps.apple.com/app/id6744178534
- [S20] MeAgain 价格对比页（自家）— https://meagain.com/alternatives/ro-weight-loss ; https://meagain.com/alternatives/hers-glp1 ; https://meagain.com/alternatives/henry-meds
- [S21] ScreensDesign MeAgain showcase — https://screensdesign.com/showcase/meagain-glp-1-all-in-one-app
- [S22] MeAgain “Best GLP-1 Tracker Apps 2026”（自家）— https://meagain.com/best-glp-1-tracker-apps
- [S23] LearnMuscles 6 Best GLP-1 Tracking Apps — https://learnmuscles.com/?p=169359
- [S24] MyFitnessPal GLP-1 Support 新闻稿（2026-04-28）— https://www.globenewswire.com/news-release/2026/04/28/3282728/0/en/MyFitnessPal-Launches-Comprehensive-GLP-1-Support-Helping-Users-Stay-Consistent-and-Build-Habits-Alongside-Medication-to-Maximize-Their-Experience.html
- [S25] MyFitnessPal 帮助中心 GLP-1 Support — https://support.myfitnesspal.com/hc/en-us/articles/40936733058445-GLP-1-Support
- [S26] MyFitnessPal 2024 GLP-1 工具新闻稿 — https://prnewswire.com/news-releases/myfitnesspal-announces-tools-and-content-to-support-the-health-and-wellness-of-members-on-glp-1-medications-302124616.html ; TMCnet — https://www.tmcnet.com/usubmit/2024/04/23/9998797.htm
- [S27] MyFitnessPal 收购 Cal AI — https://news.myfitnesspal.com/myfitnesspal-expands-its-position-as-the-leading-player-in-digital-nutrition-tracking-with-cal-ai-acquisition/
- [S28] Aakash Gupta on X — https://x.com/aakashgupta/status/2028621423535902893
- [S29] Zach Yadegari（Cal AI 联合创始人）on X — https://x.com/zach_yadegari/status/2028473704359874652
- [S30] healthcare.digital 分析 — https://www.healthcare.digital/single-post/strategic-consolidation-of-digital-nutrition-analysis-of-the-myfitnesspal-acquisition-of-cal-ai
- [S31] Unstar：MFP Premium paywall（竞品）— https://unstar.app/blog/is-myfitnesspal-premium-worth-it-paywall-app-reviews-2026
- [S32] Unstar：calorie apps ranked by 1-star reviews（竞品）— https://unstar.app/blog/calorie-tracking-apps-ranked-1-star-reviews-2026
- [S33] Nutrola：50,000 条评论分析（竞品）— https://nutrola.app/en/blog/we-analyzed-50000-calorie-tracker-reviews-what-users-actually-complain-about-2026
- [S34] Nutrola：Reddit 用户怎么评价 MFP（竞品）— https://nutrola.app/en/blog/what-do-reddit-users-say-about-myfitnesspal-2026
- [S35] Punished Backlog — https://punishedbacklog.com/hey-myfitnesspal-were-not-paying-for-a-damn-barcode-scanner/
- [S36] FitBudd：MFP 价格 — https://fitbudd.com/post/myfitnesspal-app-cost
- [S37] MyNetDiary Diet App Scorecard 2026-10（竞品）— https://www.mynetdiary.com/diet-app-scorecard-october-2026.html
- [S38] MyNetDiary Diet App Scorecard 2026-06（竞品）— https://www.mynetdiary.com/diet-app-scorecard-june-2026.html
- [S39] eesel.ai：Cal AI 价格和评测 — https://www.eesel.ai/en/blog/cal-ai-pricing ; https://www.eesel.ai/blog/cal-ai
- [S40] Cal AI 评论汇总博客（“portion size”引文出处，无法确定是哪一篇，unverified）— https://myclaw.ai/blog/cal-ai-reviews ; https://nutrola.app/en/blog/cal-ai-got-worse-after-update
- [S41] HAVIT：Cal AI 与 GLP-1（竞品）— https://www.aihavit.com/blog/en/cal-ai-alternative-glp-1
- [S42] Noom Muscle Defense 新闻稿（2024-01）— https://www.businesswire.com/news/home/20240119119542/en/Noom-GLP-1-Companion-to-Add-%E2%80%9CMuscle-Defense%E2%80%9D-to-Promote-Safer-GLP-1-Use ; https://www.noom.com/in-the-news/noom-adds-muscle-defense-to-its-glp-1-companion-program-to-help-prevent-muscle-mass-loss-while-taking-glp-1s/
- [S43] Noom GLP-1 Companion FAQ — https://www.noom.com/support/faqs/using-the-app/daily-features/2025/10/glp-1-companion/ ; https://www.noom.com/support/faqs/premium-features/my-program/2024/04/glp1-companion/
- [S44] Fortune：Noom Med review — https://fortune.com/article/noom-med-review/
- [S45] Middleway Nutrition：Noom GLP-1 review — https://www.middlewaynutrition.com/glp-1/noom-glp-1-review
- [S46] Better Results：Noom GLP-1 reviews — https://betterresultsbook.com/noom-glp-1-reviews/ ; PlexusDx（竞品）— https://plexusdx.com/pages/plexusdx-vs-noom
- [S47] Vaccine Alliance：Noom review — https://www.vaccinealliance.org/reviews/noom/
- [S48] U.S. News：Noom GLP-1 — https://health.usnews.com/best-diet/medication/noom
- [S49] WW GLP-1 评测 — https://trytrimi.com/blog/is-weightwatchers-glp1-legit ; https://www.glp1picks.com/reviews/weightwatchers ; https://www.cravingwise.com/reviews/weight-watchers-glp-1/
- [S50] WW Trustpilot / ConsumerAffairs — https://uk.trustpilot.com/review/weightwatchers.com?page=7 ; https://www.consumeraffairs.com/nutrition/weight_watchers.html?page=3
- [S51] Lose It! — https://yespress.io/lose-it ; https://www.weightlossrankings.org/reviews/lose-it ; https://nutrola.app/en/blog/weight-loss-app-pricing-guide-2026 ; https://speakrj.com/?p=25475
- [S52] Cronometer 博客：GLP-1 — https://cronometer.com/blog/glp-1-drugs-how-cronometer-can-help
- [S53] MacroFactor App Store — https://apps.apple.com/app/id1553503471
- [S54] Carbon 帮助中心：GLP-1 — https://help.joincarbon.com/en/articles/16300107-how-to-use-carbon-diet-coach-while-on-a-glp-1-ozempic-wegovy-mounjaro-and-others
- [S55] Oura GLP-1 Insights — https://ouraring.com/blog/glp-1-insights/
- [S56] HIT Consultant（Oura Ring 5 / GLP-1）— https://hitconsultant.net/?p=96516
- [S57] Hims & Hers 权益与 AI 指导 — https://www.hims.com/benefits ; https://www.ifit.com/partnerships/himshers ; https://www.modernretail.co/?p=175182 ; https://www.emarketer.com/content/hims---hers-adds-clinician-backed-ai-guidance-keep-glp-1-members-engaged ; https://athletechnews.com/hims-hers-adds-major-fitness-wellness-brands-to-growing-benefits-program/
- [S58] Athletech News（Peloton）— https://athletechnews.com/peloton-low-impact-strength-training-rebecca-kennedy-hilit/
- [S59] GLP-1 力量训练内容 — https://www.ifit.com/blog/strength-training-while-on-glp-1-6-week-plan ; https://tonal.com/pages/strength-training-glp-1 ; https://app.pvolve.com/series/glp-1-strength-training-series-GLP0325 ; https://darebee.com/plans/glp-1.html
- [S60] Fitbod 博客 — https://fitbod.me/blog/glp-1-muscle-loss/
- [S61] Lilly Health App Store — https://apps.apple.com/us/app/-/id6744534749
- [S62] WTOP：LillyDirect（Zepbound / Foundayo）— https://wtop.com/news/2026/08/how-to-use-lillydirect-for-zepbound-and-foundayo-prescriptions/
- [S63] eMarketer：NovoCare — https://www.emarketer.com/content/loyalty-program-gives-novo-new-tool-combat-glp-1-patient-attrition ; WTOP NovoCare — https://wtop.com/news/2026/08/how-to-use-novocare-to-get-ozempic-and-wegovy/
- [S64] Novo Nordisk：Wegovy 药片上市新闻稿 — https://www.novonordisk-us.com/media/news-archive/news-details.html?id=916476
- [S65] Wegovy 药片用法 — https://www.healthline.com/nutrition/glp1-pill-hl ; https://www.epocrates.com/online/article/fda-approves-oral-wegovy-pill-for-weight-loss ; https://www.weightwatchers.com/us/blog/wegovy-pill ; https://www.noom.com/?p=26011225
- [S66] Benzinga（2026-09）：口服药带动 GLP-1 App 热潮及安全隐忧 — https://www.benzinga.com/news/health-care/26/09/62011321/glp-1-pill-boom-apps-research-risks-lagging
- [S67] dev.to：GLP-1 PK 建模 — https://dev.to/navidmosleminiya/i-modeled-glp-1-pharmacokinetics-in-typescript-and-open-sourced-it-1167
- [S68] Glyra App Store — https://apps.apple.com/app/id6772534068
- [S69] Robin Health App 数据研究 — https://www.bariatricnews.net/post/ai-based-monitoring-reveals-protein-deficiencies-in-people-taking-glp-1s ; https://www.healio.com/news/endocrinology/20260422/glp1-users-eat-less-but-do-not-change-macronutrient-composition-of-diet ; https://www.news-medical.net/news/20260409/Study-finds-nutritional-risks-in-users-of-GLP-1-drugs.aspx
- [S70] 停药后体重反弹试点研究 — https://www.news-medical.net/news/20261011/Stopping-GLP-1-drugs-often-brings-weight-back-A-small-trial-suggests-ways-to-slow-it.aspx ; Withings 停药后管理 — https://www.withings.com/en-hk/blogs/health-solutions-insights/part-3-supporting-safe-and-sustainable-weight-loss-with-glp-1s-managing-weight-after-medication
- [S71] GLP-1 Health App 品类研究报告（2026-04-21，unverified）— https://dreamseeds-pipeline.pages.dev/research_GlpCompanion_2026-04-21.html
- [S72] Gala GLP-1 Tracker App Store — https://apps.apple.com:443/us/app/gala-glp-1-tracker/id6504834561
- [S73] GLPulse App Store — https://apps.apple.com/se/app/glpulse/id6749462665
- [S74] Peachy Progress App Store — https://apps.apple.com/us/app/-/id6757675502
- [S75] Shed App Store — https://apps.apple.com/app/id6766642624
- [S76] GlucoPal App Store — https://apps.apple.com/app/id6670317407
- [S77] 蛋白优先类 tracker — ProteinDose https://apps.apple.com/app/id6785082362 ; GLP-1 AI https://apps.apple.com/app/id6762843495 ; Vivy https://apps.apple.com/us/app/vivy-glp1-glp-1-tracker/id6736508784
- [S78] 配药计算器 — Dosed https://apps.apple.com/us/app/id6753125648 ; PepProCalc https://apps.apple.com/app/id6753655817
- [S79] 复方单位换算 — https://www.noom.com/?p=26022556 ; https://formblends.com/tools/peptide-calculator/tirzepatide ; https://healthrx.com/tools/tirzepatide-dose-calculator
- [S80] 隐私对比（厂商写的指南，unverified）— https://mywhy.net/blog/glp1-companion-app-guide ; https://www.akomahealthcare.com/journal/best-glp-1-tracker-apps-2026 ; https://glpcompanion.app/privacy/
- [S81] GitHub GLP-1 App 基准测试（方法不明，unverified）— https://github.com/EugeneFinch/glp1-companion-benchmarks-2026
- [S82] Omada 体成分 — https://www.omadahealth.com/resource-center/the-relationship-between-glp-1s-and-body-composition-its-complicated-1
- [S83] Sahha（FuturHealth）— https://sahha.ai/blog/glp1-digital-weight-management/
- [S84] ShotLock 对比（竞品）— https://shotlock.pages.dev/compare/best-glp1-tracker-apps
- [S86] Nutrola：Lose It 准确性（转引 CNET 2025，unverified）— https://nutrola.app/en/blog/why-is-lose-it-so-inaccurate
- [S87] “GLPTracker”步数同步错误评论：出现在 GLP-1 tracker 的 App Store 搜索结果中，无法确定是哪一个页面 (unverified)
- [S89] Wikipedia：MyFitnessPal — https://en.wikipedia.org/wiki/MyFitnessPal ; APKMirror MFP 26.46.0 — https://apkmirror.com/apk/myfitnesspal-inc/calorie-counter-myfitnesspal/myfitnesspal-calorie-counter-26-46-0-release
- [S91] Hims 新闻室：GLP-1 健身与营养 — https://news.hims.com/newsroom/new-to-glp-1s-heres-how-to-build-fitness-and-nutrition-routines-to-set-you-up-for-success
- [S92] Noom × LillyDirect — https://www.mobihealthnews.com/news/noom-lillydirect-pharmacy-provider-partner-increase-access-zepbound
