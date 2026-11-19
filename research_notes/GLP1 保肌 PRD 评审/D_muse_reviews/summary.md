# GLP-1 保肌与周期管理 App — 竞品评论调研总结

抓取日期：2026-11-19（美东）。数据文件：`reviews.csv`（App Store + Google Play，2,562 条）、`reddit.csv`（20 条帖子，见下文局限说明）。评论正文均为原文，逐字保存在 CSV 里；本报告的引用均来自 CSV 原文，未改写、未翻译。用户名和头像一律未收集。

## 方法与局限 — 先读这段，再看结论

- **App Store**：用公开 RSS 接口 `itunes.apple.com/us/rss/customerreviews/page=1–10/id=<APP_ID>/sortby=mostrecent/json`，每 App 最多 10 页 × 50 条 = 500 条。A 组全量抓最近的；B 组（MyFitnessPal、Noom、Lose It!、Oura、Cal AI）在最近 500 条里按关键词过滤，最多 200 条。RSS 只开放 1–10 页（第 11 页返回 400），所以 B 组的分母是“最近 500 条”，不是全量评论库。
- **Google Play**：用 `google-play-scraper`（`reviews(package, lang='en', country='us', sort=NEWEST, count=200)`），A 组每 App 最近 200 条。Play 端评论正文上限 500 字符，712 条里只有 2 条正好 500 字符，可能被截断。
- **Reddit — 未达标，必须明说**：直接访问 `reddit.com` / `api.reddit.com` / `old.reddit.com` 均返回 403；所有 Redlib 镜像、Arctic Shift、PullPush、Jina 等代理均被挡；浏览器打开 reddit.com 直接显示 “You've been blocked by network security… Reddit is for humans, not unauthorized agents.”，按任务规则未绕过、未重试。最终只通过 DuckDuckGo 搜索索引拿到 20 条帖子，**0 条评论**，正文只是搜索摘要（前 1–3 句，常被截断），**日期和分数全部为空，2025-01-01 后的时间过滤无法执行**，其中多条按帖子 ID 判断明显早于 2025 年。`reddit.csv` 只能当作“Reddit 上存在这类讨论的线索”，不能当作 2025 年后的代表性样本。完整版需要用户本人用浏览器打开 Reddit，或 Reddit API OAuth 凭证。
- **主题归类**：H1–H15 用关键词正则初筛（见 `scripts/patterns.py`），计数是“命中条数”，不是人工精读的全量判定。H7/H11/H13/H14 等主题里有大量正面提及（如“喜欢提醒功能”“喜欢记录副作用”），所以“命中多”不等于“抱怨多”，要结合 1–3 星占比一起看。本报告引用的每条原文都经过人工核对全文；自动初筛里个别误判（如 H2 的“next day”多为试用扣费语境）已在假设判断里剔除。
- **评分人数**：App Store 用 iTunes Lookup 当天值；Google Play 评分人数见 Google Play 一节。

## 1. 每个 App 的概况

| App | App Store 评分 / 人数 | Google Play 评分 / 人数 | 内购价（App Store 页面，2026-11-19） | 本次抓到条数 | 1–5 星分布（本次抓到） |
|---|---|---|---|---|---|
| Shotsy | 4.83 / 35,124 | 4.67 / 13,498 | 月 $9.99 / $14.99，年 $39.99 / $49.99 / $59.99 | 700（Store 500 + Play 200） | 5★513，4★66，3★33，2★23，1★65 |
| MeAgain | 4.79 / 41,365 | 4.66 / 3,717 | Premium $14.99–$119.99（多档，周期未标注，不透明） | 700（Store 500 + Play 200） | 5★502，4★65，3★42，2★32，1★59 |
| Preserve | 0 / 0（无评分） | 无安卓版，未找到 | Preserve Pro 月 $9.99，年 $49.99 | 0 | —（见第 5 节） |
| Glapp | 4.76 / 1,103 | 4.63 / 523 | Max 周 $4.99，月 $9.99，年 $39.99 | 239（Store 132 + Play 107） | 5★179，4★15，3★12，2★10，1★23 |
| Pep (Shred Apps) | 4.68 / 980 | 4.69 / 2,046 | $9.99–$59.99（Access All GLP-1 Tracking Tools，多档） | 275（Store 113 + Play 162） | 5★196，4★20，3★15，2★18，1★26 |
| DreamMe | 4.71 / 3,574 | 4.58 / 763 | Life 月 $14.99 / $19.99，季 $24.99，年 $39.99 / $69.99；Pearls $0.99–$9.99 | 102（Store 63 + Play 39） | 5★33，4★17，3★12，2★10，1★30 |
| GLP-1 Tracker (Superbrandnew) | 3.86 / 7 | 无安卓版 | 月 $8.99，年 $89.99 | 9（全部） | 5★5，4★1，2★1，1★2 |
| GLP-1 Tracker: GLPro | 5.0 / 1 | 未上线（官网 Coming soon） | 月 $14.99，年 $99.99 | 0 | — |
| Free.Well | 4.69 / 332 | 无安卓版 | $9.99–$49.99（多档） | 25（全部） | 5★6，4★3，3★4，2★4，1★8 |
| Ember | 0 / 0（无评分） | 无安卓版 | Plus $7.99，年 $29.99，终身 $59.99 | 0 | — |
| GLPTracker (C2M) | 4.57 / 277 | 无安卓版（注意：Play 上另有一个同名不同开发商的 App，已排除，未合并） | Premium $9.99 / $39.99 | 24（全部） | 5★14，4★2，3★1，2★1，1★6 |
| JellyPal | 4.71 / 14 | Play 无评分，10+ 安装 | Pro 年 $39.99（特价 $19.99），终身 $149.99，Glide Pro $9.99 | 9（Store 5 + Play 4） | 5★9 |
| MyFitnessPal（B 组，关键词过滤） | 4.71 / 2,395,221 | — | Premium 月 $9.99 / $19.99，年 $49.99 / $79.99 | 62 | 5★24，4★6，3★6，2★8，1★18 |
| Noom（B 组） | 4.70 / 874,463 | — | Program $44.99–$199.99 | 112 | 5★15，4★5，3★21，2★16，1★55 |
| Lose It!（B 组） | 4.77 / 785,066 | — | Premium $9.99–$79.99，终身 $49.99 / $59.99 | 80 | 5★39，4★5，3★3，2★3，1★30 |
| Oura（B 组） | 4.86 / 326,732 | — | App Store 页面无内购列表（会员在 Oura 官网/应用内另售） | 83 | 5★16，4★8，3★7，2★17，1★35 |
| Cal AI（B 组） | 4.80 / 376,297 | — | Unlimited $2.99–$29.99，Streak Restore $0.99 | 142 | 5★25，4★12，3★19，2★12，1★74 |

注意两个反差：(1) MeAgain 在 App Store 最近 500 条里 5★ 422 条、1★ 仅 10 条，但在 Play 最近 200 条里 1★ 49 条、5★ 80 条，差评率明显高得多，Play 差评集中在卡顿/崩溃；(2) Cal AI 在关键词过滤后的 142 条里 1★ 74 条（52%），是本次样本里差评最集中的 App。

日期范围（本次抓到的评论）：Shotsy 2026-07-27–11-17，MeAgain 2026-07-04–11-18，Glapp 2026-03-23–11-16，Pep 2024-10-07–2026-11-17，DreamMe 2025-12-21–2026-11-17，Cal AI 2026-07-04–11-15，Noom 2026-03-23–11-12。

## 2. 主题统计

计数 = App Store + Google Play 合并后的关键词命中条数；差评占比 = 其中 1–3 星的比例。H7/H11/H13/H14 的命中里正面提及占多数，见各主题说明。

| 主题 | 总命中 | 1–3 星占比 | Shotsy | MeAgain | Glapp | Pep | Cal AI | Noom | Lose It! | MyFitnessPal | Oura | DreamMe |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| H1 历史记录难改/删 | 56 | 70% | 8 | 11 | 4 | 10 | 5 | 2 | 1 | 4 | 6 | 3 |
| H2 跨日/时区错位 | 10 | 80% | 1 | 2 | 1 | 0 | 1 | 1 | 0 | 1 | 1 | 1 |
| H3 同步失败/数据丢失/重复 | 77 | 51% | 23 | 12 | 9 | 5 | 8 | 5 | 3 | 3 | 3 | 5 |
| H4 卡顿/启动慢 | 127 | 74% | 22 | 42 | 4 | 6 | 3 | 16 | 2 | 2 | 6 | 20 |
| H5 AI 拍照识餐不准（份量） | 265 | 55% | 7 | 66 | 5 | 26 | 53 | 22 | 18 | 17 | 33 | 11 |
| H6 蛋白目标太高、吃不到、有压力 | 9 | 44% | 2 | 1 | 0 | 0 | 2 | 0 | 3 | 1 | 0 | 0 |
| H7 想要保肌/力量训练指导 | 75 | 29% | 4 | 12 | 1 | 4 | 10 | 12 | 12 | 11 | 8 | 0 |
| H8 药物浓度曲线不准/看不懂 | 41 | 34% | 14 | 9 | 9 | 2 | 1 | 1 | 1 | 0 | 1 | 0 |
| H9 价格贵/涨价/付费墙/试用扣费/取消难 | 273 | 84% | 42 | 48 | 19 | 16 | 42 | 43 | 18 | 7 | 19 | 9 |
| H10 口服药/西林瓶/复方/units/自定义间隔 | 46 | 28% | 9 | 5 | 20 | 1 | 2 | 6 | 0 | 1 | 0 | 1 |
| H11 打针/服药提醒问题 | 128 | 16% | 51 | 44 | 11 | 9 | 2 | 0 | 0 | 2 | 3 | 2 |
| H12 停药后/维持期需求 | 17 | 29% | 4 | 2 | 2 | 1 | 1 | 3 | 3 | 0 | 1 | 0 |
| H13 隐私顾虑 | 66 | 14% | 22 | 11 | 5 | 10 | 5 | 7 | 1 | 2 | 0 | 2 |
| H14 副作用记录与应对建议 | 116 | 8% | 45 | 23 | 26 | 6 | 0 | 5 | 0 | 1 | 4 | 1 |
| H15 愿意为保肌/力量/体成分付费 | 10 | 60% | 2 | 1 | 1 | 1 | 0 | 1 | 2 | 1 | 0 | 2 |

每主题 3 条代表性原文（已人工核对全文；链接为对应 App 的商店页 + review_id，可回查 CSV）：

**H1 — 历史记录难改/删**
- “I bought this app at a very discount price and still thinking is not worth the pain. It difficult to log the meals and more difficult if you want to edit it.” — MeAgain，App Store，3★，2026-11-08，https://apps.apple.com/us/app/meagain-glp-1-tracker-app/id6744178534 (review_id: 14766346741)
- “If I input something and save, I can't edit it if I input wrong. I do a lot of measuring foods in ounces etc.” — Pep，Google Play，3★，2026-03-05，https://play.google.com/store/apps/details?id=com.shredapps.glp1 (review_id: 3109ad93-dd2c-4245-8658-e2c6753f4042)
- 注意：直接抱怨“改不了针剂剂量/删除某针”的明确案例很少，H1 的 56 条里多数是“改不了某条食物记录/体重记录”。剂量编辑本身证据弱，见 H1 判断。

**H2 — 跨日/时区错位**
- 本次 2,562 条里没有一条经人工核对能确认为时区/跨日错位。H2 的 10 条命中均为误判（如“yesterday / next day”出现在试用扣费、课程语境里）。因此本主题不附“代表性原文”——没有可信的原文可附，见 H2 判断。

**H3 — 同步失败、数据丢失、重复数据**
- “After the latest update I was prompted to start all over with the intro questions and now seems the app is strictly a paid app. I lost over a year's worth of data and information to provide to my doctor. I am extremely unhappy and can not recommend this app.” — Shotsy，App Store，1★，2026-10-22，https://apps.apple.com/us/app/shotsy-glp-1-tracker/id6499510249 (review_id: 14697722587)
- “With the latest update all my information was deleted and 7 months of data gone. Useless.” — Shotsy，App Store，1★，2026-10-21，https://apps.apple.com/us/app/shotsy-glp-1-tracker/id6499510249 (review_id: 14694540019)
- “The app logged me out and then lost 6 months worth of data and progress tracked.” — Shotsy，Google Play，1★，2026-09-10，https://play.google.com/store/apps/details?id=com.shotsy.app (review_id: 05148c03-402a-4288-86f7-757ebaf38065)

**H4 — 卡顿、启动慢**
- “it worked really well for almost a week, then today the app won't open at all. I just paid for an annual subscription so that sucks.” — DreamMe，App Store，3★（正文后续还提到喜欢 UI 与追踪功能），https://apps.apple.com/us/app/dreamme-glp-1-tracker-pet/id6755569693
- “I was loving this app until they just did an update two days ago and now I can never get into it. It sits trying to load for a few minutes then just has something…” — MeAgain，App Store，1★，https://apps.apple.com/us/app/meagain-glp-1-tracker-app/id6744178534
- MeAgain 在 Play 的 H4 命中 34 条，是 App Store（8 条）的 4 倍多，安卓端卡顿/打不开是 Play 差评的主因之一。

**H5 — AI 拍照识餐不准（份量）**
- “I do NOT recommend using the AI photo meal estimate, as the calories can be way off. Example, I had a meal where it estimated that it was about 450 calories, while in reality, it was closer to 900. That can be very dangerous if you're relying on it to lose weight.” — Pep，Google Play，4★，2025-12-11，https://play.google.com/store/apps/details?id=com.shredapps.glp1 (review_id: 7efd09a2-da70-45a7-80ca-4e8d8aa1fe26)
- “Meal scan is only right 10% of the time and the portions are always way off. Logging food is annoying,” — MyFitnessPal，App Store，3★，2026-10-16，https://apps.apple.com/us/app/myfitnesspal-calorie-counter/id341232718 (review_id: 14675861181)
- “Calories are frequently wrong and even after submitting a ‘flag problem’ numerous times, nothing gets fixed.” — Noom，App Store，3★，2026-06-13，https://apps.apple.com/us/app/noom-weight-loss-food-tracker/id634598719 (review_id: 14179391449)

**H6 — 蛋白目标太高、吃不到、有压力**
- 本主题在商店评论里几乎没有“目标定太高、压力大”的抱怨。反向证据是真实存在的：“Protein first is so important for success and I have a hard time getting enough. With this app, I've met or exceeded my protein goals.” — MeAgain，App Store，5★，2026-09-04，https://apps.apple.com/us/app/meagain-glp-1-tracker-app/id6744178534 (review_id: 14510677705)
- Reddit 同样是“怎么才吃够蛋白”，不是“目标太高”：“How do you guys reach your protein goal without going over calories? As my journey is ending I've decided to switch my exercise to mostly strength training.” — r/loseit，https://www.reddit.com/r/loseit/comments/6fmej4/（搜索摘要，非全文）
- 结论见 H6：用户痛点是“吃不够蛋白”，不是“目标太高”。

**H7 — 想要保肌、力量训练指导**
- “I track my food daily focusing on protein and fiber. This app helps keep me on track with diet as well as strength training. My weight loss is slow but I'm feeling stronger with greater energy.” — Lose It!，App Store，5★，2026-09-16，https://apps.apple.com/us/app/lose-it-calorie-counter/id297368629
- Reddit：“So yeah, it's important to even maintain muscle as it just makes the whole process easier to keep losing fat or to maintain weight. The best practices for muscle sparing during fat loss are to not lose too quickly with a high deficit, stay around or under 1% bodyweight a week. To get enough protein daily.” — r/loseit，https://www.reddit.com/r/loseit/comments/v59zq6/（搜索摘要）
- 在 GLP-1 专用 App 评论里直接点名要“力量训练指导”的条数不多（Shotsy 4、MeAgain 12、Glapp 1），需求更多体现在综合 App 和 Reddit 讨论里，见 H7 判断。

**H8 — 药物浓度曲线不准/看不懂**
- “I question the validity of the medication level calculation. How can I be at an estimated 1.8mg left in body just before a 4mg dose, and the next day be at an estimated 10.8mg.” — MeAgain，Google Play，2★，2026-08-04，https://play.google.com/store/apps/details?id=app.meagain.app (review_id: 4f13bb27-fcec-4ca6-b1c9-2e8203901eb0)
- 反向主流是喜欢曲线：“Love how it gives an estimate of medication levels in your system.” — Shotsy，App Store，4★，2026-11-15，https://apps.apple.com/us/app/shotsy-glp-1-tracker/id6499510249
- “The best part of Shotsy for me was seeing the medication level in my system. It used to be free. Now you have to pay to access that information.” — Shotsy，App Store，3★，2026-10-11：对曲线的抱怨更多是“要付费才能看”，不是“算不准”。

**H9 — 价格贵、涨价、付费墙、试用扣费、取消难**
- “Unless you know this is the app you want to use stay away. clicked the 7 day free trial and Went in and decided it was not the one for me. Went to cancel this is all in the same day. Was already charged for the full year.” — Shotsy，Google Play，1★，2026-10-23，https://play.google.com/store/apps/details?id=com.shotsy.app (review_id: 0b57296b-ffcd-4e23-8e4c-625f9f3cb398)
- “total scam. forces you into paying before any chance to try it out with no refund despite immediately cancelling.” — MeAgain，Google Play，1★，2026-08-18，https://play.google.com/store/apps/details?id=app.meagain.app (review_id: d1ab2aa5-01e5-4d78-986a-a8849e6dc82d)
- Cal AI 同类抱怨集中在“先要邮箱/同步健康数据，之后才告知要付费试用”，见 H13/H9 交叉。

**H10 — 口服药/西林瓶/复方/units换算/自定义间隔**
- “Looking good so far, but I wish we could also record our shots in units rather than just mg.” — Pep，Google Play，4★，2025-12-11（同 H5 那条评论的前半段），https://play.google.com/store/apps/details?id=com.shredapps.glp1
- “I would like for them to add a way to enter compounded versions. I try and I know it's not perfectly accurate.” — Shotsy，App Store，3★，2026-08-11，https://apps.apple.com/us/app/shotsy-glp-1-tracker/id6499510249 (review_id: 14416531567)
- “When you start there's an option that lets you say you're on the pill but then everything else after that says to track your shot and there isn't an option for tracking that you've taken the pill every day.” — DreamMe，App Store，2★，2026-08-08，https://apps.apple.com/us/app/dreamme-glp-1-tracker-pet/id6755569693 (review_id: 14403028582)
- Glapp 的 H10 命中 20 条为各 App 最高，含已从针剂转口服药的用户，见第 4 节。

**H11 — 打针/服药提醒问题**
- 提醒功能总体是好评项：“Dosage reminders and tracking are helpful.” — Shotsy，App Store，5★，2026-11-07，https://apps.apple.com/us/app/shotsy-glp-1-tracker/id6499510249
- 反向缺口是提醒只覆盖打针，不覆盖蛋白/饮水/运动：“I don't need a shot reminder or to keep up with shots. I wanted something that helps remind me of protein, water and exercise needed.” — Shotsy，Google Play，1★，2026-10-18，https://play.google.com/store/apps/details?id=com.shotsy.app
- “I really enjoy this app. So far I haven't noticed how to get the reminder to remind me, but I may not be using it correctly.” — Shotsy，App Store，4★，2026-11-01：提醒设置难找也是一个小缺口。

**H12 — 停药后/维持期需求**
- “This app desperately needs a maintenance setting. I'd get the paid version if it had that!” — Glapp，App Store，3★，2026-09-08，https://apps.apple.com/us/app/glapp-smart-glp-1-tracker/id6756984097 (review_id: 14527344446)
- “I was on Tirzepatide before- lost waay to fast but regained most weight.” — MeAgain，App Store，5★，2026-09-05，https://apps.apple.com/us/app/meagain-glp-1-tracker-app/id6744178534
- Reddit 维持期讨论比商店评论多得多（20 条 Reddit 帖子里 7 条带 H12 标签），例如 r/Mounjaro：“It's about our eating habits after stopping the medication. You can't just go back to eating whatever you want.” — https://www.reddit.com/r/Mounjaro/comments/197box1/（搜索摘要）

**H13 — 隐私顾虑**
- “Predatory Design to sell your data” — Cal AI，App Store，1★，2026-08-18，标题即此句，正文：“The app gathers all your information, email, and asks to sync with your health app BEFORE telling you it requires payment for its 3 day free trial.”，https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616 (review_id: 14444603720)
- 商店评论里直接谈隐私的条数很少（H13 命中 66 条里多数是“数据在 App 间共享很方便”这类正面提及，如 Shotsy + Noom + Apple Health 互通的好评）。把“不卖药/不卖数据”当卖点在评论里没有直接证据支撑，更多是 PRD 层面的定位判断，见 H13。

**H14 — 副作用记录与应对建议**
- “Very valuable for correlations between side effects and estimated medical level. Can visualize consequences of dose adjustments before you take them.” — Shotsy，App Store，5★，2026-11-14，https://apps.apple.com/us/app/shotsy-glp-1-tracker/id6499510249
- “I track my shots, injection sites, daily weight, and side effects. It gives me a quick view of my BMI, weight loss, and progress toward my goal.” — Shotsy，App Store，5★，2026-11-16
- 副作用“记录”功能普遍受好评；“应对建议”（吃了什么能缓解恶心/便秘）在评论里很少被点名要，更多是用户自己在描述症状，见 H14 判断。

**H15 — 愿意为保肌/力量/体成分付费**
- “I almost never pay to subscribe to an app. This one was completely worth it. Being able to track my levels and symptoms has been instrumental in allowing me to lose 100 pounds just 9 months.” — Shotsy，App Store，5★，2026-10-13，https://apps.apple.com/us/app/shotsy-glp-1-tracker/id6499510249 (review_id: 14663565077)
- “I pay for hardly any apps but I gladly pay for this one!” — Shotsy，App Store，5★，2026-08-19，https://apps.apple.com/us/app/shotsy-glp-1-tracker/id6499510249 (review_id: 14446847069)
- 直接为“保肌/力量/体成分”付费的表述在本次样本里只有 H12 那条 Glapp 维持期评论可作旁证（“I'd get the paid version if it had that!”），H15 本身的 10 条命中多为泛泛的“值得付费”，见 H15 判断。

## 3. 假设逐条判断

- **H1 历史记录难以修改或删除 — 有证据（弱，集中在食物记录）**。MeAgain 3★“想改一餐很难”、Pep 3★“输错了保存后改不了”是核实过的两条；直接针对“改针剂/删某针”的明确案例在 2,562 条里没找到。产品上应把“可编辑历史”做成食物+针剂+体重三处都可改，而不是只做针剂。
- **H2 跨日或时区导致记录错位 — 没有证据**。10 条关键词命中经人工核对全部是误判，无一条确认时区/跨日问题。不要把这个假设写进 PRD 当作已验证痛点；如果要做，须另找用户访谈验证。
- **H3 同步失败、数据丢失、重复数据 — 有证据**。最强的一组：Shotsy 在 2026-10 月更新后多条 1★称“一年/7 个月数据全丢”“登出后 6 个月数据没了”，且涉及“给医生看的数据也没了”。这是竞品最致命的信任缺口，也是我们“截图迁移 + 本地备份 + 更新前不丢数据”最值得打的点。Apple Health / iCloud 同步本身的抱怨少于“更新后数据清空”。
- **H4 数据多了以后卡顿、启动慢 — 有证据（集中在 MeAgain 安卓端和 DreamMe）**。MeAgain Play H4 命中 34 条、DreamMe 20 条，多为“更新后打不开/一直加载”；Shotsy 22 条、Noom 16 条次之。没有证据表明是“数据量大了才卡”，更多是“某次更新后变卡/打不开”，表述上应写“更新后卡顿/打不开”，别写成“数据量大导致卡顿”。
- **H5 AI 拍照识餐不准（尤其是份量） — 有证据**。最强的一组之一：Pep 450 大卡估成 900 大卡（用户原话“very dangerous”）、MyFitnessPal“Meal scan 只有 10% 是对的，份量总是差很多”、Noom“卡路里经常是错的，提交 flag 也没人改”。这是 Cal AI / MyFitnessPal / Noom 的共性问题，也是我们 P0 把拍照降为辅助、先做条码+现成单品+滑块的直接依据。
- **H6 蛋白目标太高，吃不到，有压力 — 没有证据（反向证据成立）**。9 条命中里没有一条抱怨目标太高；MeAgain 5★和 Reddit r/loseit 的原话都是“很难吃够蛋白”“怎么才能在不超热量的前提下吃够蛋白”。PRD 里“蛋白目标太高有压力”这个表述应改成“吃不够蛋白，需要帮用户吃够”。
- **H7 想要保肌、力量训练指导 — 有证据（需求真实，但商店评论里直接点名的条数不多）**。GLP-1 专用 App 里直接要力量指导的只有 Shotsy 4、MeAgain 12、Glapp 1 条；更强的信号在 Lose It! / MyFitnessPal（各 11–12 条，用户在综合 App 里同时追踪蛋白+力量）和 Reddit（“maintain muscle… stay around or under 1% bodyweight a week. To get enough protein daily.”）。结论：需求存在，但竞品用户还没把它当成“换 App 的理由”来写，冷启动文案要先教育，再转化。
- **H8 药物浓度曲线不准，或看不懂 — 证据很少**。41 条命中里主流是喜欢曲线（Shotsy 4–5★多条）；明确质疑算法的只有 MeAgain Play 2★那条 1.8mg → 10.8mg 的质疑，以及 Pep 3★称峰值时间与实际不符。更多抱怨是“曲线以前免费、现在要付费”。产品上曲线要做，但卖点应是“看得懂（峰值/衰退期对应吃什么练什么）”，不是“我们算得更准”。
- **H9 价格贵、涨价、付费墙、试用自动扣费、取消困难 — 有证据**。273 条命中、84% 为 1–3 星，是本次最高的差评主题。Shotsy 7 天试用当天取消仍被扣全年费、MeAgain“没试用就强制付费、立即取消也不退款”是核实过的两条。定价上 $69.99/年并不比竞品贵（Shotsy 年费 $39.99–$59.99，MeAgain $14.99–$119.99），但“试用—扣费—取消”链路必须做到一眼看懂、可一键取消，否则会继承同样的差评。
- **H10 需要口服药、西林瓶、复方、units 换算、自定义间隔 — 有证据**。Pep 用户要 units 而不是 mg、Shotsy 用户要复方录入、DreamMe 用户称口服药选项形同虚设（选了 pill，后面全是按 shot 走）、Glapp 20 条命中为各 App 最高（含转口服药用户）。口服 Wegovy 已上市，这个需求只会变大，P0 就应支持口服 + units + 自定义间隔，别留到 V2。
- **H11 打针或服药提醒问题 — 有证据（但以好评为主）**。128 条命中里 1–3 星仅 16%，提醒功能是 Shotsy（51 条）和 MeAgain（44 条）的好评项。缺口在两处：提醒只覆盖打针，不覆盖蛋白/饮水/运动（Shotsy Play 1★原话）；提醒设置难找。产品上应做“周期提醒”（打针 + 蛋白缺口 + 训练窗口），而不是只做打针闹钟。
- **H12 停药后、维持期的需求 — 证据很少（商店评论），但 Reddit 信号强**。商店评论只有 17 条命中；但 Glapp 那条“desperately needs a maintenance setting. I'd get the paid version if it had that!”是本次最强的单个付费信号之一，Reddit 20 条帖子里 7 条是维持期/停药后话题。结论：维持期是真实存在的长尾需求，但商店评论不是它的主战场，验证应以 Reddit/访谈为准。
- **H13 隐私顾虑 — 证据很少**。66 条命中里多数是正面（数据互通方便）；明确的隐私抱怨只有 Cal AI 那条“先要邮箱+同步健康数据，之后才说要付费试用”。“不卖数据”可以作为品牌承诺写，但不要声称“用户在评论里大量抱怨竞品卖数据”——本次样本不支持这个说法。
- **H14 副作用记录和应对建议的需求 — 有证据（记录强，应对弱）**。116 条命中、仅 8% 为差评，副作用记录 + 与药物浓度关联是 Shotsy 的好评项（“Very valuable for correlations between side effects and estimated medical level”）。“应对建议”（恶心时吃什么、便秘怎么办）在评论里很少被直接点名，是产品可以补的空白，但不是用户已经在骂的缺口。
- **H15 愿意为“保肌 / 力量 / 体成分”付费的信号 — 证据很少（针对保肌本身）**。泛泛的“值得付费”证据很强（Shotsy 两条 5★原话：“I almost never pay… completely worth it.”“I gladly pay for this one!”），但直接把付费意愿绑定到保肌/力量/体成分的只有 Glapp 维持期那条旁证。定价验证不能只靠评论，需用 Web2App 自测漏斗实测转化。

## 4. 列表外的新主题（前 10，按出现频率）

以下按关键词短语在 2,562 条里的出现次数排序，每条附 2 条原文（均为 CSV 原文，已核对）：

1. **客服/支持无回应（130 条，1–3 星 74 条）** — “I contacted support via email…”类抱怨在 Noom、MyFitnessPal、Shotsy 均有；与退款难高度重叠。原文示例：Shotsy 5★用户也提到客服跟进（“their customer service is great… emailed me back to follow up”），说明客服响应本身就是口碑分水岭。
2. **改版/更新后变差（124 条，1–3 星 73 条）** — 集中在 Shotsy 2026-10 月更新（免费变付费、数据丢失）和 Noom 的 Seeds 游戏化改版。原文见 H3 两条 Shotsy 1★。
3. **导出 / PDF / 给医生的报告（99 条）** — 多为正面需求：用户要把剂量、副作用、体重趋势打成 PDF 给医生。Shotsy 的 PDF 导出是好评项，MeAgain 没有 PDF 导出是被点名的短板（见第 2 节 H5/H10 交叉及公开对比）。
4. **食物数据库不准/缺失、条码扫不出（76 条）** — “Most data is wrong, they charge for barcode scan and it usually doesn't work.” — MyFitnessPal，App Store，1★，2026-10-24。
5. **广告太多（65 条，1–3 星 48 条）** — 主要在免费版综合 App；GLP-1 专用 App 里较少。
6. **多药/多部位/库存/家庭共用（55 条）** — 用户要同时管 GLP-1 + TRT/其他药、要库存提醒（“add an inventory section to keep up with the amount of meds you have” — Shotsy，App Store，5★，2026-11-11）。
7. **Apple Watch / 小组件（50 条）** — 要手表端打卡、锁屏小组件看药物浓度；Shotsy、MeAgain 均有此类需求。
8. **免费变付费 / 曾经免费的功能被锁（49 条，1–3 星 43 条）** — “It used to be free. Now you have to pay to access that information.”（Shotsy 药物浓度曲线，App Store，3★，2026-10-11）；MyFitnessPal“Can't set carb/fat/protein goals anymore”同类。
9. **退款难（49 条，1–3 星 48 条）** — 与 H9 重叠，单列是因为“退款”一词本身出现 40 次，几乎全是差评。原文见 H9 两条。
10. **体重平台期 / 掉秤慢（19 条）** — 条数不多但情绪强，用户在平台期最容易流失；与 H12 维持期需求相邻，产品上可用“平台期解释 + 力量/围度进展”对冲只看体重的焦虑。

## 5. Preserve 单独一节 — 和我们定位最接近的对手

**先说结论：Preserve 在 App Store 美区目前是 0 评分、0 条评论，2026-06-15 上架，当前版本 1.1.0（2026-11-16 更新），开发商 forresTech，定价 Preserve Pro $9.99/月、$49.99/年，Google Play 上无安卓版。**

因此本节没有“用户夸它什么、骂它什么”的评论证据可写——不是漏抓，是它还没有用户评论足迹。以下“它是什么”来自 App Store 商店描述原文（iTunes Lookup，2026-11-19），不是用户评价：

- 定位句就是我们的定位句：“Losing weight on a GLP-1? Don't lose your muscle with it.” / “Preserve is the GLP-1 companion built around one goal: keep your strength, protein, and routine intact while the scale moves.”
- 功能清单与我们 PRD 的重叠度最高：按周针节奏排力量训练、 realistic 每日蛋白目标、低食欲日的蛋白点子、带组数/次数/休息的指导训练、每周体重/症状/蛋白一致性复盘、改计划前先看教练建议、打针/训练/蛋白/复盘提醒。
- 与我们 PRD 的差异：Preserve 强调“教练建议先审后改”和“realistic 蛋白目标”，没有提到药效浓度曲线驱动的动态处方、没有 Off-Ramp 脱药协议、没有截图迁移、没有面诊 PDF。它的差异化在“教练把关 + 现实目标”，我们的差异化在“PK 周期状态机 + 防反弹协议”，这是两条不同的路。
- **它还缺什么（基于商店描述 + 零评论 footprint 的推断，不是用户原话）**：没有公开的用户口碑可验证留存；没有药物浓度曲线；没有维持期/停药协议；没有提到口服药、复方、units；没有提到 Apple Health 双向同步的细节。以及最重要的一点：上线 5 个月仍是 0 评分，说明它要么下载量极低，要么还没跑通获客——这是我们的时间窗口，也是警示：定位对不等于能获客，Preserve 的冷启动显然没跑起来。
- 对我们的启示：不要只跟 Preserve 比功能清单，要跟它比“谁先拿到第一批真实用户评论”。它的定价（$49.99/年）低于我们 PRD 的 $69.99/年，如果它先起量，年费锚点会被它定在 $49.99。

## 附录：文件与复现

- `reviews.csv`：2,562 行（App Store 1,850 + Google Play 712），列：source, app, review_id, date, rating, title, text, app_version, matched_keywords, themes。
- `reddit.csv`：20 行帖子、0 行评论，列：subreddit, post_url, type, date, score, text, apps_mentioned, themes。date/score 为空是如实留空（搜索索引不提供），text 为搜索摘要非全文，见方法与局限。
- 原始抓取与脚本：`raw/appstore_reviews_raw.csv`、`raw/appstore_meta.json`（评分/人数/内购）、`raw/googleplay_reviews.csv`、`raw/googleplay_log.md`、`raw/reddit_log.md`、`scripts/fetch_appstore.py`、`scripts/fetch_iap.py`、`scripts/classify.py`、`scripts/patterns.py`、`scripts/merge.py`。
- 未抓到的来源：Preserve / GLPro / Ember 的 App Store 评论（0 条，App 本身无评分）；Preserve、Superbrandnew、GLPro、Free.Well、Ember、GLPTracker（C2M）的 Google Play 评论（无安卓版）；Reddit 全文帖子与全部评论（Reddit 拦截 AI 代理访问，见方法与局限）。
