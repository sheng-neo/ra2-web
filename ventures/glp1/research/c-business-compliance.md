# C. 商业 / 市场 / 合规假设核查 —— GLP-1 保肌与周期管理 AI Agent PRD v1.0

_编写日期：2026-11-19。范围：美国为主，附中国简述。_

**取证方式（先读）**
- 用了 45 次网页搜索（WebSearch，结果是摘要），直接抓取了 1 个页面：Apple App Review Guidelines 原文（developer.apple.com，2026-11-19 抓取成功）。其他发布方页面没有抓取。
- 数字多来自搜索摘要转述，出现冲突时在行内注明。只有单一来源或来源偏弱的条目标 **(unverified)**。
- 订阅基准优先引用已有笔记，避免重复搜索：
  - `ventures/us-app-store-research/notes/03_health_fitness_lifestyle.md`（下称 **N03**）
  - `ventures/us-app-store-research/notes/07_ai_native_winners_risks.md`（下称 **N07**）
- 标注「推算」的数字是本文自己算的，不是来源原文。

---

## 0. 结论速览（给 PRD Owner）

| PRD 假设 | 判定 | 一句话 |
|---|---|---|
| 目标用户「35–55 岁高收入职场人士」 | **需修正** | 真实主力是女性、40–64 岁。半数以上用户觉得药费难负担。2026-07 起 Medicare 新进入的 65+ 人群恰恰是肌少症风险最高的人。 |
| 药物只覆盖 Semaglutide / Tirzepatide 周注射 | **缺失** | 2026 年已上市两款每日口服药：Wegovy 片（1 月）和 Foundayo/orforglipron（4 月），且都进了 Medicare 覆盖。「峰值期 D1–D3」周期逻辑对每日口服用户不成立。 |
| 首月付费转化 ≥ 8% | **需修正 / 先定义口径** | 免费增值模式的中位数约 2.1%，硬付费墙约 10.7%（RevenueCat，全品类，D35）。8% 已接近硬付费墙水平，而 PRD 是带免费层的软墙。 |
| 年订阅留存 ≥ 65% | **不成立** | 健康健身类首次续订 30.3%，是所有品类中最低（Adapty）。AI 应用年付留存 21.1%（RevenueCat）。另外，超过一半 GLP-1 用户一年内停药。 |
| $69.99/年、$12.99/月 | **基本成立，但偏贵** | 与 MFP Premium（$79.99）、MacroFactor（$71.99）同档；是 Shotsy、Preserve 等 GLP-1 专用工具的 1.4–3.5 倍。MFP 和 Noom 2026 年已把 GLP-1 功能免费化。 |
| 「血药浓度曲线」+ 免责声明即可合规 | **部分成立** | Shotsy 有同类「估算药物水平」图表并已上架，说明 Apple 可以放行，前提是披露方法学。但 PRD 有几处措辞和功能会把产品推向 1.4.2 和 FDA 器械边界：「血药浓度」「供面诊调剂量」「副作用与血药浓度关联分布」。 |
| AI 拍照 / 语音识餐 | **缺失合规设计** | Apple 2025-11 起要求：向第三方 AI 发送个人数据前必须明示，并取得明确许可（5.1.2(i)）。 |
| 「联网后静默增量同步」 | **缺失约束** | 5.1.3(ii) 禁止把个人健康信息存进 iCloud。WA MHMDA 和 FTC HBNR 要求单独同意，并禁止经广告 SDK 外泄。 |
| 「瘦体重流失 ≤ 15%」写进核心指标 | **对外宣传有风险** | 任何对外的保肌效果宣称，按 FTC 标准都需要 RCT 级证据。 |

---

## Q1. 市场规模与用户结构

### 1.1 证据：美国用药人数与人群画像

**用药人数**
- KFF Health Tracking Poll（2025-10-27 至 11-02，n=1,350）：
  - 18% 的美国成年人用过 GLP-1，**12% 正在使用**（含糖尿病等用途）。
  - 2024-05 时这两个数字分别是 12% 和 6%。
  - 当前使用率最高的是 50–64 岁（**22%**）。65 岁以上只有 9%，KFF 归因于 Medicare 不覆盖减重用药。
  - 用药理由：慢病 38%、减重 30%、两者都有 32%。
  - 来源：[KFF 新闻稿](https://www.kff.org/public-opinion/poll-1-in-8-adults-say-they-are-currently-taking-a-glp-1-drug-for-weight-loss-diabetes-or-another-condition-even-as-half-say-the-drugs-are-difficult-to-afford/)；[KFF Poll Finding](https://www.kff.org/public-opinion/kff-health-tracking-poll-prescription-drug-costs-views-on-trump-administration-actions-and-glp-1-use/)
- KFF 2026-03 数据更新：约五分之一成年人用过 GLP-1（18%）；部分雇主在 2026 年收紧或取消了减重用药覆盖。— [KFF Public Opinion on Prescription Drugs](https://www.kff.org/health-costs/issue-brief/public-opinion-on-prescription-drugs-and-their-prices/)

**性别、年龄（Gallup 2025）**
- 「为减重使用 GLP-1」的比例从 2024-02 的 5.8% 升到 2025 年的 **12.4%**。
- 性别：女性 **15.2%**，男性 9.7%。KFF 的数字是女性 15%、男性 9%（来自搜索摘要转述）。
- 年龄：40–49 岁 16.2%，50–64 岁 **17.0%**，65 岁以上 11.1%。
- 全美肥胖率从 2022 年的 39.9% 降到 37.0%（自报身高体重）。
- 来源：[Gallup](https://news.gallup.com/poll/696599/obesity-rate-declining.aspx)；[NPR](https://www.npr.org/2025/10/28/nx-s1-5587805/glp-1-ozempic-zepbound-gallup-obesity-rate)

**支付方式与负担能力**
- 有保险的用户中，**27% 仍全额自费**买药。
- **56%** 的用户觉得药费难以负担，其中四分之一觉得「非常难」。
- 没找到 GLP-1 用户的收入分层数据。KFF 的通用处方药调查显示，家庭年收入低于 $40k 的人更常报告买药困难。
- 来源：[KFF](https://www.kff.org/health-costs/poll-1-in-8-adults-say-they-are-currently-taking-a-glp-1-drug-for-weight-loss-diabetes-or-another-condition-even-as-half-say-the-drugs-are-difficult-to-afford/)

**规模推算**
- 按约 2.6 亿美国成年人粗算（推算；人口基数未在本轮检索），12% ≈ **3,000 万+** 自报正在用药的人。
- 这是自报口径，处方口径会更低。用于 TAM 时建议取下限。

### 1.2 证据：2025–2026 价格与覆盖变化

**厂商直售（自费）**
- NovoCare Wegovy 注射笔：前 8 周（0.25/0.5 mg）**$199/月**，第 9 周起（1–2.4 mg）**$349/月**。— [Novo Wegovy Price Guide](https://www.novocare.com/content/dam/novonordisk/novocare/redesign/pdf/Wegovy_Price_Guide.pdf)
- Wegovy 片剂：$149 的价格只持续到 2026-04-15，之后 **$199/月**。— [NovoCare 条款](https://www.novocare.com/eligibility/obesity-pharmacy.html)
- Wegovy 口服片 **2026-01-05 上市**。— [Fierce Pharma](https://www.fiercepharma.com/pharma/lilly-answers-novos-glp-1-pill-highly-anticipated-fda-nod-foundayo)
- LillyDirect Zepbound 单剂量瓶（2025 年底降价后）：2.5 mg **$299**，5 mg **$399**，其余剂量 **$449**。— [Fierce Pharma](https://www.fiercepharma.com/marketing/lilly-joins-novo-glp-1-self-pay-price-cuts-lowering-costs-single-dose-zepbound-vials)
- **Foundayo（orforglipron，每日口服）**：
  - 2026-04-01 获 FDA 批准；自费最低剂量 **$149/月**。
  - 更高剂量的价格各来源不一致：Ro 列 $199 / $299；Pharmaphorum 写最高剂量 $349。
  - 来源：[Lilly](https://investor.lilly.com/news-releases/news-release-details/fda-approves-lillys-foundayotm-orforglipron-only-glp-1-pill)；[Pharmaphorum](https://pharmaphorum.com/news/lilly-bags-fda-okay-wegovy-pill-rival-orforglipron)；[Ro](https://ro.co/weight-loss/foundayo-cost/)
- NPR（2026-05）的现金价区间是 **$149–$699/月**；Zepbound KwikPen 最高 $699。— [NPR](https://www.npr.org/2026/05/06/nx-s1-5812662/medicare-bridge-glp1-drugs-copay)
- 本轮没有找到 2026 年 10–11 月的新一轮降价（检索未命中，不代表没有）。

**TrumpRx 协议（2025-11-06）**
- TrumpRx 现金价起步约 **$350/月**，官员称两年内降到约 $250。Lilly 自己公布的 Zepbound 是 $299 起、高剂量 $449。
- Medicare/Medicaid 采购价 **$245/月**，Medicare 受益人共付 **$50/月**。
- 来源：[NPR](https://www.npr.org/transcripts/nx-s1-5599122)；[AJMC](https://www.ajmc.com/view/trump-announces-deals-with-eli-lilly-novo-nordisk-for-lower-weight-loss-drug-prices)；[Kiplinger](https://www.kiplinger.com/retirement/medicare/medicare-to-cover-obesity-drugs-under-trump-deal)
- TrumpRx.gov 据称 2026-02-05 上线 (unverified：只在一条搜索结果的图片说明里看到)。

**Medicare GLP-1 Bridge（2026-07-01 起）**
- 资格：Part D 参保人，BMI ≥35，或 BMI ≥27 且有特定合并症。已因 2 型糖尿病走 Part D 覆盖的人除外。
- 覆盖药物：Wegovy（注射和片剂）、Zepbound KwikPen、Foundayo。共付 **$50/月**。
- 结束时间：多数来源（含 CMS 项目页）写 2027-12-31，但 CMS FAQ 摘要写 2026-12-31，存在冲突。
- 规模：KFF 估计约 **380 万人**符合条件；按 10–25% 参与率估算，即 **约 38 万–95 万**名老年用户（推算）。
- 来源：[CMS](https://www.cms.gov/medicare/coverage/prescription-drug-coverage/medicare-glp-1-bridge)；[KFF](https://www.kff.org/medicare/nearly-four-million-medicare-beneficiaries-could-be-eligible-for-the-temporary-medicare-glp-1-bridge-program-covering-these-drugs-for-weight-loss/)；[TechTarget](https://www.techtarget.com/healthcarepayers/news/366645372/38M-qualify-for-Medicare-GLP-1-Bridge-at-programs-July-start)

**雇主覆盖收缩**
- Business Group on Health：雇主覆盖 GLP-1 减重的比例从 2025 年的 72% 降到 2026 年的 60%。
- WTW：从 57% 降到 53%，三年来首次下降；仍覆盖的雇主中 30% 在考虑取消。
- Mercer：500 人以上企业中只有 44% 覆盖。
- 不同调查的口径不一致，但方向一致：在收缩，主要原因是成本。
- 来源：[SHRM](https://www.shrm.org/topics-tools/news/benefits-compensation/growing-number-of-employers-dropping-glp-1-coverage)；[SHRM 2027](https://www.shrm.org/topics-tools/news/benefits-compensation/1-in-10-employers-likely-will-stop-glp-1-coverage-in-2027)；[Becker's Payer](https://www.beckerspayer.com/?p=30226)

**停药率（直接影响留存，见 Q2）**
- JAMA Netw Open 2025（Rodriguez 等，n=125,474）：1 年停药率 **53.6%**，2 年 72.2%。
- 不合并 2 型糖尿病的人 1 年停药率更高，达 **64.8%**。
- 来源：[Healio](https://www.healio.com/news/endocrinology/20250131/most-adults-with-overweight-or-obesity-discontinue-glp1-therapy-within-2-years)；[News-Medical](https://www.news-medical.net/news/20250204/High-discontinuation-rates-of-GLP-1-agonists-found-among-patients-with-obesity.aspx)
- Cleveland Clinic 2026：停药后一年内 55% 的人体重回升。— [Cleveland Clinic](https://newsroom.clevelandclinic.org/2026/03/12/what-happens-when-patients-stop-taking-glp-1-drugs-new-cleveland-clinic-study-reveals-real-world-insights)

### 1.3 用户结构的变化（推算与解读）
- **自费用户在增加。** 有三股力量叠加：雇主收缩覆盖、厂商直售降价（$149–$449）、口服药上市。用户每月在药上花 $150–$450，$5.83/月的 App 只占药费的 1–4%，所以对 App 价格并不敏感。但 56% 的人觉得药费难负担，说明「高收入」并不是这个人群的普遍特征。
- **65 岁以上用户在增加。** Medicare Bridge 的 $50 共付会把 65+ 用户占比拉高。这是肌少症风险最高的人群，与「保肌」的定位高度契合。但这批人用 Apple Watch / Garmin 的比例和订阅意愿可能偏低（假设，未检索）。
- **口服药用户在增加。** 2026 年两款每日口服药上市，且都在 Medicare 覆盖之内。PRD 的「周注射 → 峰值期 / 平台期 / 衰减期」三段模型对每日口服用户不适用：每天服药，体内水平接近稳态，没有周内的波峰波谷（这是药代逻辑推论；具体半衰期本轮未检索）。

### 1.4 中国（简）
**药物供给**
- 司美格鲁肽中国专利 **2026-03-20 到期**。但 Novo 称，按中瑞自贸协定的数据保护期（至 2027-04），仿制药上市推迟到 2027 年；首个申请者杭州九源的审评已暂停。
- 约 16 家公司在研仿制药。
- 来源：[Swissinfo/Bloomberg](https://www.swissinfo.ch/eng/novo-sees-generic-ozempic-delayed-in-china-until-next-year/91373533)；[The Star](https://www.thestar.com.my/aseanplus/aseanplus-news/2026/03/27/chinas-weight-loss-drug-makers-take-on-global-giants-as-novo-nordisk-patent-expires)；[GlobalData](https://www.globaldata.com/media/pharma/semaglutide-patent-cliff-present-substantial-opportunity-companies-chinese-generics-market-says-globaldata/)

**价格**
- Wegovy 月费从上市时约 1,900 元降到 2026 年初部分西南地区医院的 <1,000 元。
- 司美格鲁肽在省级采购平台降价近半。
- 来源：[The Star](https://www.thestar.com.my/aseanplus/aseanplus-news/2026/03/27/chinas-weight-loss-drug-makers-take-on-global-giants-as-novo-nordisk-patent-expires)；[China Daily](https://www.chinadaily.com.cn/a/202604/02/WS69ce1a08a310d6866eb416e6.html)

**其他药物**
- 替尔泊肽（穆峰达）自 1 月 1 日起纳入国家医保，是全球首个进入公共医保的 GIP/GLP-1 双靶点药。医保覆盖的适应症是否包括减重未核实，很可能只覆盖 2 型糖尿病 (unverified)。— 同上来源
- 玛仕度肽（信尔美）2025-06 获批体重管理，适应人群为 BMI ≥28，或 BMI ≥24 且有合并症。— [PubMed](https://pubmed.ncbi.nlm.nih.gov/41028652/)；[Fierce Pharma](https://www.fiercepharma.com/pharma/china-approval-lilly-and-innovents-mazdutide-breaks-new-class-glp-1-obesity-drugs)
- orforglipron 于 2026-11 在中国获批 (unverified，单一来源)。— [Malay Mail](https://www.malaymail.com/amp/news/world/2026/11/14/chinas-630-million-weight-problem-first-glp-1-pill-gets-the-green-light/243155)

**市场规模与上架门槛**
- 中国 GLP-1 市场预计 2030 年达约 1,000 亿元人民币（约 140 亿美元）。没有可靠的用户数统计。— [The World of Chinese](https://www.theworldofchinese.com/2026/09/can-glp1-fix-china-obesity-problem/)
- 上架门槛：Apple 自 2023-10 起要求中国区新上架 App 提交 **ICP 备案**，通常需要本地实体或本地发行方。— [MacRumors](https://www.macrumors.com/2023/10/03/apple-adopts-tighter-china-app-store-rules/)
- 本轮未检索：生成式 AI 服务备案、互联网医疗相关规定。

### 1.5 判定与建议修改
- **目标用户：需修正。** 「35–55 岁高收入职场人士及企业主」与数据不符。主力是女性（15% 对 9–10%）、40–64 岁，且半数以上有负担压力。
  - **改为：**核心人群为 40–64 岁、以女性为主的自费或部分自费用户；第二人群为 Medicare Bridge 下的 65+ 用户（肌少症高风险）。「高收入 + 穿戴设备」只作为早期种子用户画像。
- **药物与剂型：缺失。**
  - **改为：**药物选择加入 Wegovy 片（口服司美格鲁肽）和 Foundayo（orforglipron）。增加「每日口服」模式：不显示周内峰谷曲线，改为「稳态 / 加量期」两状态。抗阻调档逻辑改用副作用、睡眠和 HRV 驱动，而不是注射后天数。
  - 补充：在剂量输入、保险或自费方式字段里预留 KwikPen 多剂量笔和单剂量瓶。
- **单位：缺失。** PRD 只有 kg / cm / ml，而美国用户默认用 lb、ft/in、fl oz（常识，无需引用）。
  - **改为：**v1.0 必须支持英制和公制切换，默认跟随系统区域设置。
- **地区：需明确。**
  - **改为：**v1.0 只上美国区（以及英语区）。中国区需要另立项（ICP 备案、本地主体、生成式 AI 备案、本地大模型），不放进 v1.0 范围。中英混说的语音输入保留，服务对象定为美国华人用户。

---

## Q2. 商业模式核查

### 2.1 证据：订阅基准（优先引用 N03 / N07）

**付费墙类型（RevenueCat 2026，全品类）**
- D35 转化率中位数：硬付费墙 **10.7%**（2025 年为 12.1%），免费增值 **2.1%**。
- 一年留存：硬付费墙 27%，免费增值 28%，基本持平。
- D60 每安装收入（RPI）：硬付费墙 **$3.09**，免费增值 $0.38。
- RevenueCat 自己的材料对这个指标的叫法不统一，有时写「download-to-paid」，有时写「trial-to-paid」。
- 来源：[RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps-2026/)；[PPC Land](https://ppc.land/the-app-middle-class-is-dying-and-revenuecats-data-shows-exactly-how-fast/)；[SaaStr](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/)

**健康健身类变现**
- 健康健身类前期变现在所有品类中最高：D14 RPI 中位数 **$0.48**，D60 **$0.66**。— N03，引自 [RevenueCat 2026](https://www.revenuecat.com/state-of-subscription-apps-2026/)

**AI 应用的留存与退款**
- AI 应用年付留存 **21.1%**，非 AI 应用 30.7%；月付 12 个月留存 6.1% 对 9.5%。
- 退款率中位数 4.2% 对 3.5%。
- 来源：N07，引自 [PPC Land](https://ppc.land/ai-apps-earn-41-more-per-user-but-churn-30-faster-revenuecat-finds/)；[TechCrunch](https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows)

**健康健身类漏斗（Adapty）**
- 健康健身类首次续订 **30.3%**，所有品类中最低。— N03，引自 [Adapty](https://adapty.io/state-of-in-app-subscriptions/)
- Adapty 健康健身类数据：
  - 试用转付费 **35.0%**（全品类均值 25.6%）。
  - 安装转试用：全球 11.2%，北美 **14.5%**。
  - 年付贡献约 61% 的收入。
  - 另有一张年付漏斗图：安装→试用 27.8%，试用→付费 59.2%，首次续订 45.1%，第二次续订 37.1%。该图未说明样本口径，可能偏向头部应用 (unverified)。
  - 来源：[Adapty H&F benchmarks](https://adapty.io/blog/health-fitness-app-subscription-benchmarks/)
- RevenueCat 续订率分类表中，健康健身类年付续订中位数约 **25%** (unverified：所指口径不清)。— [RevenueCat blog](https://www.revenuecat.com/blog/growth/average-subscription-renewal-rates-by-app-category/)

**试用时长（RevenueCat 2026）**
- 年付试用转付费率：≤4 天 24%，5–9 天 **33%**，10–16 天 43%，17–32 天 45%。
- 健康健身类头部应用中 81% 用 ≤4 天的试用。— [RevenueCat blog](https://www.revenuecat.com/blog/growth/free-trial-length)

**GLP-1 停药率**
- 1 年停药率 53.6%，不合并 2 型糖尿病的人 64.8%（见 1.2）。

### 2.2 证据：竞品定价（美区）

| 产品 | 价格 | 备注 / 来源 |
|---|---|---|
| Shotsy（GLP-1 记录 + 估算药物水平曲线） | 2025-02 时为 **$19.99/年**；竞品页称融资后涨到 $49.99/年 (unverified) | 2025-02 种子轮 $2.25M；10 万+ 下载、$1M ARR、已盈利（单一来源）；App Store 4.9 分、约 1.7 万评分。[Silicon Florist](https://siliconflorist.com/2025/02/20/shotsy-lands-2-million-for-weight-loss-shot-tracking-app/)；[BI via Ground News](https://ground.news/article/a-software-engineer-built-an-app-for-tracking-her-weight-loss-shots-in-8-months-its-crossed-100-000-downloads-and-has-2-million-from-vcs)；[竞品页 glp3planner](https://glp3planner.com/resources/shotsy-alternatives)；[App Store](https://apps.apple.com/us/app/shotsy-glp-1-tracker/id6499510249) |
| Glapp | 免费 (unverified) | [glp3planner](https://glp3planner.com/resources/shotsy-alternatives) |
| Pep | 免费；Premium 约 $10/月 (unverified) | 某 2026 年测评汇总，例如 [speakrj](https://speakrj.com/?p=25475) |
| MeAgain | 未查到价格 | 仅有自家排名页 [MeAgain](https://meagain.com/best-glp-1-tracker-apps) |
| Preserve: GLP-1 Muscle Tracker（直接竞品：注射 + 蛋白质 + 力量训练） | **$9.99/月，$49.99/年** | [App Store](https://apps.apple.com/us/app/-/id6766536655) |
| MuscleGuard / GLP AI / Bild Health（保肌方向初创） | 未知 | [Product Hunt](https://www.producthunt.com/products/muscleguard)；[Indie Hackers](https://www.indiehackers.com/product/glp-ai)；Bild Health 只有一篇宣传稿 (unverified) |
| MyFitnessPal Premium | **$79.99/年**；**GLP-1 Support 于 2026-04-28 起对所有美国用户免费** | [App Store](https://apps.apple.com/us/app/-/id341232718)；[MFP 新闻稿](https://www.globenewswire.com/news-release/2026/04/28/3282728/0/en/MyFitnessPal-Launches-Comprehensive-GLP-1-Support-Helping-Users-Stay-Consistent-and-Build-Habits-Alongside-Medication-to-Maximize-Their-Experience.html) |
| MacroFactor | **$71.99/年，$11.99/月**；与 Workouts 捆绑 $89.99/年 | [第三方](https://nutriscan.app/blog/posts/myfitnesspal-vs-macrofactor-2026-which-paid-tracker-b86a2f0b87)；[MacroFactor](https://macrofactor.com/workouts/price/) |
| Noom GLP-1 Companion | **2026-06-24 起对所有 GLP-1 用户免费**（不论处方来源）；Noom Med 处方计划 $129–$299/月 | [Noom](https://www.noom.com/med/glp1-companion/)；[Noom 价格页](https://www.noom.com/blog/weight-management/how-much-does-noom-cost/) |
| WeightWatchers | 会员 $74/月（12 个月计划）；GLP-1 方案「$149/月起（片）、$199/月起（笔）」 | [WW GLP-1](https://www.weightwatchers.com/us/glp1)；[WW self-pay](https://www.weightwatchers.com/us/self-pay-medication) |

### 2.3 证据：获客现实

**Meta**
- 减重类广告必须定向 18 岁以上。
- 处方类减重产品归入 Drugs & Pharmaceuticals 政策，需要书面许可并按地域定向。
- 禁止「捏脂肪特写」类素材。
- 来源：[Meta Health & Wellness policy](https://transparency.meta.com/policies/ad-standards/restricted-goods-services/health-wellness)
- 2025-12，**35 位州总检察长**联名致信 Meta，要求只允许 FDA 批准药品投放处方药广告、强制风险披露、禁止减重药广告使用 AI 生成内容。行业面临更严审查。— [AG 联名信](https://www.attorneygeneral.gov/wp-content/uploads/2025/12/Ltr-to-Meta-re-GLP-w-AG-office-seals_compressed.pdf)；[CT AG](https://portal.ct.gov/ag/press-releases/2025-press-releases/attorney-general-william-tong-pushes-meta-to-act-on-misleading-ai-weight-loss-ads)
- 2025 年初起，Meta 限制被归为「健康与保健」类广告主回传下游转化事件（购买、自定义事件），影响按购买或试用优化投放和再营销。来源是代理商博客 (unverified)。— [Haus](https://www.haus.io/blog/meta-announces-new-health-wellness-conversion-restrictions)；[Search Engine Land](https://searchengineland.com/meta-ads-restrictions-health-wellness-campaigns-453094)

**TikTok**
- 体重管理政策（2026-09 更新）：减重手术、补剂、代餐类广告需要销售代表审批；不得宣称产品是「唯一解决方案」。— [TikTok Ads policy](https://ads.tiktok.com/help/article/tiktok-ads-policy-weight-management)
- 北美手册：禁止减重补剂广告，只能定向 18 岁以上。— [TikTok NA Handbook](https://ads.tiktok.com/help/article/ad-policy-handbook-north-america?lang=en)

**Google**
- 限制在广告、着陆页和关键词中使用处方药名；远程医疗和线上药房需要认证；2025-10 更新了处方药名词规则（细节未取到）。
- 「Ozempic」能否作为关键词投放，需按 Restricted drug terms 页面逐词核对。
- 来源：[Google Healthcare & medicines](https://support.google.com/adspolicy/answer/176031)；[Restricted drug terms](https://support.google.com/adspolicy/answer/15595717)；[2025-10 更新](https://support.google.com/adspolicy/answer/16606361)

**Apple Ads**
- 禁止为安全性或有效性未充分证实的健康产品或方案做广告。— [Apple Ads prohibited content](https://support.apple.com/guide/adguide/apd527d891a8/icloud)
- 美国 CPI 中位数 **$4.06**：品牌词 $2.84，通用词 $5.31，竞品词 $6.78。
- 健康健身类单次试用成本（CPT）$1.20–$3.00（供应商给的区间，非美国专属）。
- Meta 全球 CPI 中位数在 $7.10–$23.76 之间波动（2025）。
- 来源：N07，引自 [Admiral Media](https://admiral.media/apple-search-ads-benchmarks/)；[RocketShip HQ](https://www.rocketshiphq.com/meta-cost-benchmarks-mobile-app-installs/)

**商标**
- App Review **2.3.7**：不得在元数据中堆砌商标词或热门 App 名；副标题不得作无法证实的产品宣称。
- **5.2.1**：未经许可不得使用第三方商标。
- 来源：[Apple 指南原文](https://developer.apple.com/app-store/review/guidelines/)
- 现有做法：Shotsy 的 App 名是「Shotsy - GLP-1 Tracker」，品牌药名只出现在描述中，并带 ® 标记。— [App Store](https://apps.apple.com/us/app/shotsy-glp-1-tracker/id6499510249)
- Preserve 在描述里声明与 Novo / Lilly 无关联、未获其背书。— [App Store](https://apps.apple.com/us/app/-/id6766536655)
- Novo 和 Lilly 维权非常积极：Lilly 提起了数十起联邦诉讼和至少 5 起 NAD 挑战；Novo 对复配药商提起商标诉讼，2026-02 还以专利起诉 Hims。被告都是卖药方，本轮没有找到起诉记录类 App 的案例。
  - 来源：[Becker's](https://www.beckershospitalreview.com/glp-1s/lilly-novo-nordisks-fight-against-glp-1-copycats/)；[MediaPost](https://www.mediapost.com/publications/article/408024/glp-1-update-novo-nordisk-sues-compounders-lilly.html)；[VA Lawyers Weekly](https://valawyersweekly.com/2026/02/10/novo-nordisk-sues-hims-wegovy-patent-infringement/)

### 2.4 推算：PRD 目标隐含了什么
- **8% 首月付费意味着什么。**若口径是「安装 → 付费」，按年付 $69.99、八成用户选年付粗算，D30 RPI ≈ $4–5。这大约是硬付费墙 D60 中位数（$3.09）的 1.5 倍，是健康健身类 D60 中位数（$0.66）的 6–8 倍（推算）。
- **软墙的现实水平。**用 Adapty 北美安装→试用 14.5% × 健康健身类试用→付费 35%，得到 ≈ **5.1%** 的安装→付费（推算；两个比例口径不同，只作量级参考）。PRD 的免费层把注射记录、血药曲线和手动录入都放成「完整可用」，实际更接近免费增值模式，现实区间是 **2–5%**。
- **65% 年留存为什么不现实。**超过一半用户在 12 个月内停药，非糖尿病用户停药率接近三分之二。停药后，「周期管理」的核心价值随之消失。行业最好的健康健身类首次续订也只有约 45%（Adapty 头部样本）。
- **单位经济粗算（推算）。**
  - 获客成本：Apple Ads 健康健身类 CPT $1.2–3.0 ÷ 试用转付费 35% ≈ 每个付费用户 $3.4–8.6，这是最乐观的渠道。Meta 的 CPI $7–24，加上下游事件受限，单个付费用户成本可能到 $50–$100+（N07 引 AdWave：健身类每个付费用户 $25–$100+）。
  - 收入：年付 $69.99 扣除 15–30% 平台佣金后约 $49–59。首年续订按 30% 算，LTV ≈ $65–80。
  - 结论：只有 Apple Ads、ASO 和创作者 / UGC 渠道算得过来。

### 2.5 判定与建议修改
- **「首月付费转化率 ≥ 8%」：需修正，并先定义口径。**
  - **改为：**
    - 口径写清：美区 iOS，「新安装 → 首次付费（含试用转正），D35 内」。
    - 基线目标 **3–5%**，冲刺目标 8%。8% 只适用于硬付费墙实验组（引导结束即「开始 7 天试用 / 退出」，不提供免费层入口）。
    - 另设两个独立指标：安装→试用 ≥ 14%（北美基准），试用→付费 ≥ 35%（健康健身类基准）。
- **「年订阅留存率 ≥ 65%」：不成立。**
  - **改为：**
    - 年付首次续订目标定为 **30–35%**（健康健身类中位水平），冲刺 45%。
    - 另设「停药后 90 天留存」指标。
  - 产品上**新增「停药 / 减量维持模式」**：停药后体重和肌肉的维持期（55% 的人停药后体重回升），让周期管理价值消失后，订阅仍有理由存在。可以 v1.1 交付，但定位要现在写进 PRD。
- **定价 $69.99 / $12.99：基本成立，但必须 A/B 测试。**
  - **改为：**
    - 年付测试 $49.99 / $59.99 / $69.99 三档。Preserve 和 Shotsy 已把 GLP-1 专用工具的价格锚定在 $20–$50。
    - 月付 $12.99 可以保留，作为年付的价格锚。
    - 试用：保持 7 天（5–9 天档转化约 33%，高于 ≤4 天档的 24%）。iOS 的试用本来就要绑 Apple ID 支付方式，「需绑卡」不需要另做。
- **免费层的切分：需修正。**MFP（2026-04）和 Noom（2026-06）已把 GLP-1 记录免费化，注射记录和曲线免费是正确的，但付费钩子需要更锋利。
  - **改为：**
    - 付费墙卖点集中在三项：AI 识餐（免费每天 1 次，保留）、动态训练调档、体成分双轴与临床 PDF。
    - 「终身限导 1 份 PDF」改为「首份免费，之后 Pro」，并在用户复诊前 3 天推送引导。
- **获客：缺失。**PRD 没有获客章节。
  - **新增 §06 获客与 ASO：**
    - 主渠道：Apple Ads 加 ASO，用通用词（GLP-1 tracker、semaglutide、tirzepatide、protein tracker、muscle loss），以及创作者 / UGC 渠道（Cal AI 的打法，见 N07）。
    - Meta / TikTok 只做品牌和内容加热，不依赖下游转化优化。
    - 素材红线：18 岁以上；不出现处方药品牌名、注射笔特写、捏脂肪画面、体重前后对比；不说「唯一方案」，也不用未证实的百分比。
- **商标：需写明规则。**
  - **改为：**
    - App 名和副标题只用通用名（GLP-1、semaglutide、tirzepatide），不用 Ozempic / Wegovy / Mounjaro / Zepbound。
    - 关键词字段不填品牌药名（2.3.7）。
    - 描述中可以在识别用途下提及品牌名，加 ® 标记，并声明「与 Novo Nordisk / Eli Lilly 无关联、未获背书」。
    - 投放品牌药名关键词前先做法务评估。

---

## Q3. 监管与 App Store 风险（逐功能）

### 3.1 Apple 1.4.1 / 1.4.2（医疗类 App、药物剂量计算器）

**指南原文（2026-11-19 从 developer.apple.com 抓取）**
- **1.4.1：**医疗类 App 如果可能提供不准确数据，或可能用于诊断、治疗，会受到更严格审查。凡涉及健康测量准确性的宣称，必须清楚披露数据和方法学；准确性或方法学无法验证的会被拒。App 应提醒用户在做医疗决定前咨询医生。已获监管许可的，应提交许可文件链接。
- **1.4.2：**药物剂量计算器必须来自药企、医院、大学、保险公司、药房或其他获批机构，或获得 FDA 或其他国家对应机构的批准。
- **5.1.1(ix)：**医疗等高度监管领域，或需要敏感用户信息的 App，应由法人实体提交，而不是个人开发者。
- 来源：[Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

**先例**
- Shotsy 已上架，其「估算药物水平」图表覆盖司美格鲁肽、替尔泊肽、利拉鲁肽和度拉糖肽，描述中写明「基于同行评议的临床数据」。说明人群均值 PK 曲线 + 方法学披露可以通过 1.4.1 审核。— [Shotsy App Store](https://apps.apple.com/us/app/shotsy-glp-1-tracker/id6499510249)
- 1.4.2 的边界不清。有开发者在论坛询问「只对用户输入的剂量做基本换算」是否算剂量计算器，Apple 没有正面回答；也有开发者因「1.4.2 Safety – Physical Harm」被拒，同时指出许多同类 App 仍在架上。— [Apple 论坛 774177](https://developer.apple.com/forums/thread/774177)；[论坛 802978](https://developer.apple.com/forums/thread/802978)
- 至少从 2012 年起，Apple 就只接受药企提供的剂量信息。— [MobiHealthNews 2012](https://www.mobihealthnews.com/news/apple-gets-tough-medication-dosage-apps)
- PepCal 等「GLP-1 / 多肽换算」App 已上架，自我定位为「只转换你输入的数字，不提供剂量建议」，但是否曾被审核拦截无从得知。— [PepCal](https://apps.apple.com/app/id6787431329)
- 有开发者反映，自认是 wellness 类的 App 仍被按 1.4.1 标为医疗类。— [论坛 807508](https://developer.apple.com/forums/thread/807508)

**本文判断**
- **血药浓度曲线：可以上架，但措辞和方法学要改。**
  - 不要叫「血药浓度」，也不要显示「78% 当前预估体内浓度」这种像实测值的读数。
  - 应命名为「估算药物水平（人群平均模型）」，并配一页方法学说明：公式、半衰期文献来源、不考虑吸收相和个体差异、不能用于调整剂量。
  - **PRD 自身的问题：**§3.1 的公式是纯一级消除（注射时刻即最大值），推不出「注射后 12–72h 为峰值期」。用户和审核员都能看出这一点，与 1.4.1 要求的「方法学可验证」相冲突。需要与 PK 评审结论统一。
- **复配药「单位 ↔ mg」换算器：v1.0 不要做。**PRD 已把复配药排除在外，但用户会在注射日志里输入「units」。
  - 允许用户分别手填「mg」和「units / 浓度」，App 只做记录、不做计算。
  - 如果以后要做换算，需走 1.4.2 的「获批机构」路线，例如与药房或远程医疗合作方联名提交。
- **1.4.1 的「提醒咨询医生」：**PRD 现有的免责声明只写了「不构成医疗诊断或处方建议」。需要补上「任何用药或训练改变前请咨询医生」。
- **5.1.1(ix)：**必须以公司（法人）名义提交，不能用个人开发者账号。

### 3.2 Apple 5.1.2(i)（2025-11 第三方 AI 条款）——影响 AI 识餐和语音

**证据**
- 指南原文：必须清楚披露个人数据会与哪些第三方共享，**包括第三方 AI**，并在共享前取得明确许可。不得以授权为条件才提供功能。— [Apple 指南](https://developer.apple.com/app-store/review/guidelines/)
- 该条款 2025-11-13 更新。— [TechCrunch](https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai)
- 开发者论坛上已有因第三方 AI 被拒的案例，包括「首屏已放同意页，但审核员没看到仍被拒」。— [论坛 816140](https://developer.apple.com/forums/thread/816140)；[论坛 820209](https://developer.apple.com/forums/thread/820209)
- 解读：从后端调用托管大模型 API 也算向第三方共享；用户拒绝后，核心功能不应失效 (unverified：开发者社区解读)。— [DEV](https://dev.to/arshtechpro/apples-guideline-512i-the-ai-data-sharing-rule-that-will-impact-every-ios-developer-1b0p)

**判定：缺失。**PRD 没有任何 AI 数据共享同意设计。

**建议修改**
- 在首次点击「AI 采集」时弹出**即时（just-in-time）同意页**，写明：
  - 发送什么：照片、语音转写、当前药物和剂量（如果附带）。
  - 发给谁：写出模型供应商名称。
  - 是否用于训练：「否」，需与供应商签零数据保留或不训练条款。
  - 保存多久。
- 用户拒绝时回落到手动录入，且不影响其他功能。
- 在给审核员的 Review Notes 里写明同意页的位置和触发路径。
- 默认不把 HealthKit 数据发给大模型。确有必要时单独授权，并做最小化和去标识。
- 「P95 ≤ 4.0 秒」的延迟预算要把同意页和图片压缩时间算进去。

### 3.3 Apple 5.1.3（HealthKit / 健康数据）

**指南原文**
- **(i)** 通过 HealthKit 等渠道获得的数据，不得用于广告、营销或「基于使用的数据挖掘」，健康管理和经同意的研究除外；必须披露所采集的具体健康数据。
- **(ii)** 不得向 HealthKit 写入虚假或不准确的数据；**不得把个人健康信息存进 iCloud**。
- 来源：[Apple 指南](https://developer.apple.com/app-store/review/guidelines/)

**判定：PRD 有两处冲突。**
1. **写回 HealthKit。**PRD 计划把 AI 估算的蛋白质写入 HealthKit，而置信度低于 70% 的估算可能被认定为「不准确数据」。
   - **改为：**只写入用户确认后的数值，并在 metadata 中标注数据来源。
2. **同步方式。**「联网后静默增量同步」如果走 CloudKit 或 iCloud Drive，就违反 5.1.3(ii)。
   - **改为：**健康数据只走自建后端（加密存储）或纯本地。在 NFR 中写明「禁止 CloudKit / iCloud 存储任何健康字段」。
3. **广告用途。**HealthKit 和体成分数据不得进入任何广告或归因 SDK。在 NFR 中写明禁止。

### 3.4 FDA：一般健康（General Wellness）、临床决策支持（CDS）与「药物水平估算 + 给医生的 PDF」

**证据**
- 2026-01-06，FDA 未经征求意见稿，直接发布修订后的 General Wellness 和 CDS 最终指南。
  - 非侵入式可穿戴设备估算 HRV 等生理参数，只要按 wellness 语境呈现并经过验证，可以按一般健康产品处理。
  - CDS 指南取消了「单一建议不能豁免」的限制，其余基本是澄清。
  - 来源：[Greenberg Traurig](https://www.gtlaw.com/en/insights/2026/01/fda-updates-two-digital-health-final-guidance-documents)；[King & Spalding](https://www.kslaw.com/insights/articles/fda-updates-general-wellness-and-clinical-decision-support-guidance-documents)；[Morgan Lewis](https://www.morganlewis.com/de/blogs/asprescribed/2026/02/new-year-new-guidance-fda-revisits-wellness-and-cds-boundaries)
- FDA《Policy for Device Software Functions and Mobile Medical Applications》：
  - 「帮助用户整理和追踪健康信息」「不提供具体治疗建议的自我管理」类 App 适用执法裁量（不主动监管）。
  - 「用患者个体参数计算剂量或制定给药方案」的软件属于受监管器械。
  - 给吃饭记录的人推荐热量或碳水摄入，不在 FDA 监管重点内。
  - 以上示例出自 2013 版，2022 现行版的附录措辞未逐字核对。
  - 来源：[FDA 指南 PDF](https://www.fda.gov/media/80958/download)；[Fish & Richardson 摘要](https://www.fr.com/news-insights/articles/mobile-medical-apps-fda-issues-final-guidance/)
- **器械先例（同类功能如何被监管）：**
  - myPKFiT（Shire / Takeda）用于估算血友病患者个体 PK 曲线并辅助定剂量，2017 年按 **510(k) 二类器械**获批。
  - FDA 为此设有产品分类「sparse sample PK profile and dosing software」（产品代码 PHY，21 CFR 868.1890）。
  - 来源：[Medical Device Network](https://www.medicaldevice-network.com/news/fda-clears-shires-dosing-software-haemophilia/)；[FDA 分类库 PHY](https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpcd/classification.cfm?id=PHY)
- **PDURS 最终指南（2026-10-20/21）：**由药企或代表药企分发、与其药品相关的软件，其输出被视为处方药标签；推广性输出要通过 Form 2253 提交。这会影响与药企的合作（见 Q4）。— [Akin Gump](https://www.akingump.com/en/insights/alerts/fda-finalizes-guidance-on-prescription-drug-use-related-software)；[Orrick](https://www.orrick.com/en/Insights/2026/10/Theres-an-App-for-That-and-Now-FDA-Has-a-Framework-for-It)

**判定：目前大体可以放在执法裁量 / wellness 一侧，但 PRD 有三处措辞把产品往器械方向推。**
1. **「1 页临床 PDF……供面诊调剂量使用」。**明说用于剂量调整，等于宣称支持治疗决策。
   - **改为：**「用药与生活方式记录摘要，便于你与医生沟通」。删除所有「调剂量」字样。
2. **「④ 副作用发生频次与血药浓度关联分布」。**这是基于个体化药物水平模型的分析，与 myPKFiT 的「个体 PK 估算」思路相近。
   - **改为：**「副作用 × 注射后第 N 天」的时间分布，只基于实际记录，不引入模型浓度。
3. **「⚡ 峰值期 · D2 → 自动降档、改流质饮食」。**训练和饮食调整属于 wellness 范畴，问题不大；但文案不能写成「因药物浓度高，所以……」这类因果性医疗判断。
   - **改为：**「注射后第 1–3 天，很多人食欲更低、体能更差 → 今天推荐轻量训练」，并允许用户一键改回。
- **宣称词表（写进 PRD 附录）：**
  - 可以用：support muscle maintenance、protein goal、strength training plan、track、log、share with your clinician、estimated, population-average model。
  - 禁止用：diagnose / prevent / treat sarcopenia、clinically proven、prevents muscle loss、blood level、dose adjustment、titration recommendation、optimizes your dose。

### 3.5 隐私法：FTC HBNR、州消费者健康数据法、HIPAA

**FTC Health Breach Notification Rule（HBNR）**
- 2024 年修订版于 2024-07-29 生效，明确覆盖健康 App。「违规」不限于黑客攻击，**未经授权向广告平台披露**也算。— [Federal Register](https://www.federalregister.gov/documents/2024/05/30/2024-10855/health-breach-notification-rule)；[Carlton Fields](https://www.carltonfields.com/insights/publications/2024/4-tips-for-health-tech-apps-after-the-ftcs-revised-breach-notification-rule)
- 2026-09-09，FTC 撤回了 2021 年的相关政策声明，理由是 2024 年修订的规则已经覆盖，声明已过时。**规则本身仍然有效。**— [FTC 新闻稿](https://www.ftc.gov/news-events/news/press-releases/2026/09/ftc-withdraws-obsolete-policy-statement)；[AHA](https://www.aha.org/news/headline/2026-09-10-ftc-rescinds-policy-statement-extending-breach-notification-rule-apps-devices-collect-health)
- **执法先例：**
  - GoodRx：$1.5M 民事罚款，是 HBNR 下的首例执法，并被永久禁止为广告目的共享健康数据。
  - BetterHelp：$7.8M 消费者退款，依据是 FTC Act，涉及把健康信息共享给广告平台。
  - Premom：HBNR 下的第二例（条款细节本轮未取到）。
  - 来源：[Proskauer](https://privacylaw.proskauer.com/2023/03/articles/data-privacy-laws/ftcs-one-two-punch-on-data-tracking-and-health-privacy/)；[WSGR](https://www.wsgr.com/en/insights/ftc-announces-settlement-with-betterhelp-for-disclosing-consumers-health-information-to-third-party-advertisers.html)；[Hinshaw](https://www.hinshawlaw.com/en/insights/privacy-cyber-and-ai-decoded-alert/ftc-gives-notice-to-health-apps-youre-subject-to-the-health-breach-notification-rule)

**Washington My Health My Data Act（MHMDA）**
- 允许个人起诉，可主张实际损害、律师费，并可能按 WA CPA 获得三倍赔偿。
- 首起集体诉讼 *Maxwell v. Amazon*（2025-02-10，W.D. Wash.）针对嵌入第三方 App 的 Amazon SDK。案件后续进展未知。
- 来源：[WilmerHale](https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20250220-first-lawsuit-filed-under-washingtons-my-health-my-data-act)；[Washington State Standard](https://washingtonstatestandard.com/2025/02/21/lawsuit-against-amazon-provides-first-test-of-was-health-data-privacy-law/)
- 康涅狄格、内华达（SB 370）有类似法律，但不允许个人起诉。— [NatLawReview](https://natlawreview.com/article/first-class-action-filed-under-washingtons-my-health-my-data-act-draws-parallels)

**纽约 Health Information Privacy Act**
- 2025-12-19 被州长 Hochul 否决。— [Inside Privacy](https://www.insideprivacy.com/health-privacy/new-york-governor-vetoes-restrictive-health-privacy-law/)；[Healthcare Brew](https://www.healthcare-brew.com/stories/2026/01/12/new-york-governor-vetoes-health-data-privacy-bill)
- 2026 年修订版（A.10357/S.9269）重新提出，ATA 于 2026-07 致信请求再次否决，最终结果未查到。— [MoFo](https://www.mofo.com/pdf/resources/insights/260316-nyhipa-returns-in-2026-revised-bill)；[ATA Action](https://www.americantelemed.org/policies/ata-action-letter-requesting-a-veto-of-the-new-york-health-information-privacy-act/)

**HIPAA**
- 按 HHS OCR 的「Health App Use Scenarios」，用户自行下载、直接面向消费者的 App **不是**业务伙伴（business associate）；即使用户把数据发给医生、或医生推荐了这个 App，也不改变这一点。
- 只有受医疗机构或保险方雇用、付费并受其指示时，App 才构成业务伙伴。
- 同一开发商的 B2B 版和直接面向消费者的版本，只要数据分开，可以分别认定。
- 来源：[HHS OCR PDF](https://hhs.gov/sites/default/files/ocr-health-app-developer-scenarios-2-2016.pdf)；[HHS Health Apps](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-apps/)

**判定：缺失。**PRD 的 NFR 只写了免责声明，没有隐私架构。

**建议修改（写进 §04 NFR）**
1. App 内**不集成**任何会上报健康事件的广告或归因 SDK，包括 Meta SDK 自定义事件和带事件参数的 MMP。归因只用 SKAdNetwork / AdAttributionKit 加服务端「安装 / 试用」这类非健康事件，并经法务确认。理由：就连「某人安装了 GLP-1 App」本身都可能被视为消费者健康数据（MHMDA 定义很宽，这是推断）。
2. 同意设计：先单独同意「收集」，再单独同意「共享」（MHMDA 要求）。另外单独发布一份 Consumer Health Data Privacy Policy。设置 WA / NV / CT 用户的删除和撤回同意通道。
3. 建立 HBNR 事件响应流程：60 天内通知用户和 FTC 的预案。
4. 为 B2B2C 预留 HIPAA-ready 架构：数据分区，可签 BAA。

### 3.6 营销宣称风险（FTC / FDA 对 GLP-1 行业的执法）

**证据**
- FTC《Health Products Compliance Guidance》（2022-12）明确适用于「health-related apps」。健康益处宣称需要「competent and reliable scientific evidence」，通常指 RCT。— [FTC PDF](https://www.ftc.gov/system/files/ftc_gov/pdf/Health-Products-Compliance-Guidance.pdf)；[Cooley](https://www.cooley.com/news/insight/2023/2023-03-02-ftc-revises-health-products-compliance-guidance)
- **FTC 诉 NextMed（GLP-1 远程医疗）：**
  - 2025-07 起诉，2026-01 前后达成同意令。
  - 违规点：未经证实的「平均减重 53 磅 / 23%」宣称；使用非真实客户的前后对比照；伪造推荐和 Trustpilot 评价；隐瞒药费。
  - 结果：$150K 退款；今后对「平均或典型效果」的宣称必须有充分证据。
  - 来源：[Fox Rothschild](https://advertisinglaw.foxrothschild.com/2026/01/when-too-good-to-be-true-really-is-too-good-to-be-true-ftc-settles-with-nextmed-regarding-deceptive-advertising-practices/)；[Foley](https://www.foley.com/insights/publications/2025/08/health-care-marketing-enforcement-ftc-targets-telehealth-company-for-deceptive-w/)
- **FDA：**
  - 2025-09 发出约 80 封警告信和 40 封无标题信，针对直接面向消费者的药品广告。
  - 2026-03 向 30 家远程医疗公司发警告信：暗示复配药与获批药等同、贴牌掩盖药品来源。
  - 2026-06 再发 25 封：「clinically studied ingredients」「FDA-approved pharmacy」等宣称。
  - 来源：[FDA](https://www.fda.gov/news-events/press-announcements/fda-warns-30-telehealth-companies-against-illegal-marketing-compounded-glp-1s)；[Sheppard Mullin](https://www.sheppard.com/insights/blogs/fdas-focus-returns-to-compounding-and-telehealth-another-wave-of-warning-letters)；[Foley](https://www.foley.com/insights/publications/2026/03/glp1-compliance-fda-targets-telehealth-marketing-in-30-new-warning-letters/)
- **专门针对「保肌」宣称的执法：本轮没有找到。**
- **科学背景：**保肌宣称的科学基础仍有争议。2026-06 Nature Medicine 的 apitegromab 试验未显示体能或力量改善 (unverified：搜索摘要未明确出处，链接为最接近的结果)。— [Epocrates](https://www.epocrates.com/online/article/new-approach-preserves-lean-mass-during-glp-1-weight-loss)
- WW 博客引用的 2026 年荟萃分析称，瘦体重约占减重的 25–39%（二手转述）。— [WW](https://www.weightwatchers.com/us/blog/protect-muscle-on-glp-1)

**判定：内部 KPI 可以保留，对外宣称不能用。**「瘦体重流失 ≤ 15%（临床基线 25–40%）」可以作为产品目标；一旦出现在 App Store 描述、广告或 Paywall 上，就是需要 RCT 级证据的效果宣称。

**建议修改**
- 在 PRD 中把这一项标注为「内部北极星指标，禁止对外宣传」。
- Paywall 只陈述功能（「每日蛋白质目标 + 按周期调整的力量训练」），不承诺结果。
- 所有用户评价和前后对比必须来自真实用户，并有书面授权。
- 不使用「clinically proven / doctor-designed」，除非确有可证明的事实。
- §2.5「瘦体重保留率（对比临床未干预均值 65%）」放在用户自己的图表里问题不大，但要注明数据来源和「个体差异大」；不得进入营销素材。

---

## Q4. 退出与合作信号（2025–2026）

### 4.1 证据

**收购与整合**
- **MyFitnessPal 收购 Cal AI（2026-03-02）。**Cal AI 约 1,500 万下载、过去 12 个月营收约 $30–40M，团队 7 人。收购后保持独立运营，接入 MFP 的食物数据库。— N03 / N07，引自 [TechCrunch](https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens)；[MLQ](https://mlq.ai/news/myfitnesspal-announces-acquisition-of-teen-founded-cal-ai-app/)
- 随后 MFP 于 2026-04-28 推出免费的 GLP-1 Support。— [GlobeNewswire](https://www.globenewswire.com/news-release/2026/04/28/3282728/0/en/MyFitnessPal-Launches-Comprehensive-GLP-1-Support-Helping-Users-Stay-Consistent-and-Build-Habits-Alongside-Medication-to-Maximize-Their-Experience.html)
- **Noom：**
  - 2026-04 收购 503A 复配药房 Tailor Made Compounding（覆盖 46 个州）。
  - 2026-06-24 起 GLP-1 Companion 对所有 GLP-1 用户免费。
  - Noom for Work 与药品福利管理商（PBM）Liviniti 合作，向雇主销售数字 GLP-1 Companion。
  - 对外把 Companion 定位为适配 PDURS 的产品。
  - 来源：[MobiHealthNews](https://www.mobihealthnews.com/news/noom-liviniti-partner-glp-1-companion-platform)；[Noom](https://www.noom.com/med/glp1-companion/)
- **Hims & Hers：**
  - 2026-02-19 宣布以最高 $1.15B 收购 Eucalyptus（约 77.5 万客户、年化收入约 $450M）。
  - GLP-1 约占 Hims 收入的 31%。
  - 来源：[PharmExec](https://www.pharmexec.com/view/hims-hers-enters-1-billion-agreement-acquire-eucalyptus)；[HLTH](https://hlth.com/insights/news/hims-and-hers-acquires-eucalyptus-health-in-1-15bn-international-expansion-2026-02-20)
  - Novo 与 Hims 和解后成为合作伙伴，Hims 平台提供 Novo 品牌司美格鲁肽。— [Pharmaceutical Technology](https://www.pharmaceutical-technology.com/news/novo-and-hims-hers-become-partners-to-end-legal-feud/)

**药企渠道**
- Novo 的 Wegovy 片剂远程医疗合作方共 8 家，包括 Ro、GoodRx、LifeMD、Knownwell、WeightWatchers。— [MobiHealthNews](https://www.mobihealthnews.com/news/novo-nordisk-launches-wegovy-pill-taps-knownwell-novocare-provider)
- Novo 推出忠诚度计划，合作方包括 Whoop、Factor 等，并计划推出带治疗追踪功能的新 App。— [eMarketer](https://www.emarketer.com/content/loyalty-program-gives-novo-new-tool-combat-glp-1-patient-attrition)
- Lilly 与 Welldoc 合作开发用药提醒和剂量记录 App；LillyDirect 2025 年服务超过 100 万患者 (unverified，来自路透 Insight 转载摘要)。— [AOL/Reuters](https://www.aol.com/articles/insight-pills-tiktok-weight-loss-110843082.html)

**更早或小规模的信号**
- 2024 年 Click Therapeutics 收购 Better Therapeutics 资产，用于 GLP-1 伴随治疗。— [STAT](https://www.statnews.com/2024/05/22/click-therapeutics-acquire-better-diabetes-assets-glp1-treatment/)
- Shotsy 的规模：2025-02 时 $1M ARR、10 万下载、种子轮 $2.25M。没有找到 2025–2026 年独立 GLP-1 记录类 App 被收购的案例。— 见 Q2 表

**行业格局**
- WW 2025 年破产重组后转向临床和用药业务。— N03，引自 [Shropshire Star](https://www.shropshirestar.com/uk-news/2025/07/08/weightwatchers-emerges-from-bankruptcy-after-slimming-down-debts)

### 4.2 解读与判定
- **价值在向两端集中：**一端是处方和药房（Noom 收购药房、Hims 收购 Eucalyptus），另一端是拥有大流量和数据的记录类巨头（MFP 收购 Cal AI 后把 GLP-1 功能免费化）。独立 GLP-1 记录类 App 的规模普遍很小（Shotsy 是百万美元级 ARR）。
- **可行的退出买家：**
  1. 远程医疗 / 处方平台（Ro、Hims、LifeMD、WW、Noom），它们需要「留存工具」来降低停药率。
  2. 记录类巨头（MFP、Lose It!、MacroFactor），它们需要垂直功能。
  3. 雇主或 PBM 渠道，可以授权或白标，参照 Noom 与 Liviniti 的合作。
- **与药企合作要谨慎。**PDURS 最终指南生效后，药企分发或赞助的 App 输出要按药品标签管理并提交 2253，品牌中立的定位会受影响。更现实的做法是保持跨品牌中立，通过远程医疗或 PBM 走 B2B2C。
- **PRD 判定：缺失。**PRD 没有渠道和合作章节，也没有 B2B 的数据与合规预案。

### 4.3 建议修改
- **新增「§07 合作与 B2B2C」：**
  - v1.x 预留「诊所 / 远程医疗白标」能力：机构品牌页、患者邀请码、多租户数据隔离、HIPAA BAA 架构。
  - 外部 KPI 可以借用合作方最在意的「用药依从 / 持续用药天数」，但只能在合作方体系内使用，不对消费者宣传。
- **把差异化写清楚：**明确「保肌 = 蛋白质 + 抗阻 + 体成分闭环」，这是 MFP 和 Noom 免费版不做、Preserve 等新锐做得较浅的部分。
- **把「停药后维持」写成产品路线图要素。**这既能撑住留存，也是远程医疗平台最看重的价值。

---

## 附：未能核实 / 后续待查
- RevenueCat 健康健身类的分付费墙类型转化率和年付续订率（本轮只拿到全品类数据和一个口径不清的 25%）。
- Shotsy 当前美区价格（$19.99 或 $49.99）；Pep、MeAgain 的价格。
- Apple Ads 对商标关键词的竞价规则；Google 2025-10 处方药名词规则的具体内容。
- Premom 和解条款；*Maxwell v. Amazon* 的后续进展；纽约 HIPA 2026 修订版最终结果。
- Medicare Bridge 实际参保人数（2026-07 之后）；TrumpRx 当前价格。
- 中国：替尔泊肽医保覆盖的适应症；生成式 AI 备案、互联网医疗相关规定；orforglipron 在华获批（单一来源）。
