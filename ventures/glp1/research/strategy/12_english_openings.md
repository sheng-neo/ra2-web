# 12 英文市场还有没有后来者的位置（后来者策略调研 · 第二轮 · 专题十二）

日期：2026-11-22 · 范围：英文 GLP-1 伴侣 App 头部最近 6 个月的动作；最近 12–18 个月进场的后来者做到的量级和渠道；被头部服务得最差的细分人群；没有英文渠道、没有预算的小团队在英文区的获客路径；英文市场后来者的现实天花板，以及"中文滩头做完再进英文"和"一开始就做双语"的比较。这份笔记回答的是第二轮总问题"规模从哪里来"里和英文市场有关的那一部分。

**读之前先看这六条限制：**

1. 本轮用了 12 次搜索（上限 12 次），关键词列在文末。来自网络的事实全部取自搜索结果的标题和摘要，没有一篇原文打开读过；摘要和具体链接的对应关系没有逐条核对，所以每条事实后面列的是"那一次搜索返回的相关链接"。对外引用之前要打开原文再核一遍。
2. 直接抓取试了 3 个站点，各一次：www.cdc.gov、thehiveindex.com、trustmrr.com，全部不在本会话允许的网络范围内，之后没有再试任何站点。要核对原文，需要先在网络设置里放行这些域名。
3. 标"（未核实）"的是单一来源或来源偏弱（营销稿、厂商自述、二手转述、第三方估算站）；标"（推算）"的是我自己算的，算法写在旁边；写"没查到"的意思是"这次搜了但没有结果"，不是"确认没有"，除非另外写明"查到确实没有"。
4. 标"（评论语料）"的来自 `ventures/glp1/research/store-reviews/reviews.csv`（2,562 条英文评论，美区 App Store 和 Google Play，最晚一条是 2026-11-18；其中 9 款专用记录 App 共 2,083 条，下文叫"专用组"）。条数是关键词正则命中后我逐条读过再数的；引用的原话后面带 App、商店、星级、日期和评论 ID 的前几位。语料只有美区、以英文为主，所以它天然看不到英国用户、西语用户和不写评论的人；"评论里没有"不能读成"需求不存在"。
5. `reddit.csv` 只有 20 条搜索摘要，没有日期和回帖（见 `store-reviews/summary.md` 的说明），本轮只用它确认一件事：Shotsy 当年是以社区成员身份在 r/Zepbound 里招内测的。
6. 第一轮已经查到的不再重查，引用时写明出处：换 App 的原因和进攻面（`05_switching.md`）、Glapp 和 MeAgain 的打法复盘（`04_latecomer_playbooks.md`）、口服药和维持期的头部支持情况（`10_market_shifts.md` 问题 5）、广告平台对减重类的限制和 ASO 基准（`c-business-compliance.md` 第 2 节）、Shotsy 的成长路径（创始人自述加第三方估算，见调研汇总第 5 节）。

---

## 一、一页结论

1. **用户在向两家集中，供给在分散，并购发生在"卖药加服务"那一层。** 在本地抓取的 12 款专用记录 App 里，Shotsy 和 MeAgain 合计占美区 App Store 评分人数的 92%、Google Play 的 84%，占最近四个月新写评论速度的约九成（推算）；同一年里标题带"GLP-1"的新 App 至少有 568 个（第一轮）。最近一年的收购是 MyFitnessPal 收 Cal AI、Noom 收复方药房、Oura 收问诊公司，没有查到任何一起收购记录工具的交易。
2. **最近 6 个月没有谁"吞掉"这个品类，但免费的底线被抬高了。** 苹果的 iOS 27 没有更新用药接口，也没有查到自带的打针记录；MyFitnessPal（2026-04）和 Noom（2026-06-24）已经把 GLP-1 记录免费给所有人；Shotsy 没有查到新融资，年费停在 39.99–59.99 美元，并把药量曲线收进了付费；MeAgain 自称完成 500 万美元种子轮、下载过百万（未核实）。
3. **不花钱的后来者，查到的最好成绩是头名的 3%–4%（iPhone）到 15%（安卓）。** Glapp 的原生 App 上架约 8 个月，评分人数是 Shotsy 的 3.1%（App Store）和 3.9%（Google Play）；Pep 上架约 25 个月，在 App Store 是 Shotsy 的 2.8%，在 Google Play 是 15%。两家的月度评论数都是冲高后回落，没有一家出现持续加速（评论语料，推算）。
4. **没有查到"靠单点切入、不买量、做到头名一成以上"的干净例子。** 最接近的是 Glapp（西林瓶库存、免费药量曲线、开发者泡 Reddit）。DreamMe 用 11 个月做到 Shotsy App Store 评分人数的一成，但它靠的是宠物养成加 TikTok 上的批量内容，评分和文字评论的比例也明显异常（推算）。唯一在评分人数上超过头名的后来者 MeAgain 走的是融资加投放。
5. **有评论证据的"服务得最差"的不是某个人口群体，而是不按"每周一针"走的人。** 拆针、一周两次、每 4 天一次、减量这类用法，在 Shotsy、MeAgain、Glapp 三家都各有被点名的缺口（相关评论共 14 条，其中 5 条是明确的"做不到"，1 条是这种用法下记录丢失）。复方药和单位换算有 150–600 万人的盘子（口径差得很远），但已经被 Glapp 和独立计算器占住，法律地位还在收紧。糖尿病、年长、男性、西语用户各有数百万到上千万人（推算），可是评论里几乎没有他们特有的未满足需求（各 0–2 条）。
6. **没有英文渠道、没有预算时，四条获客路都很窄。** 网页版没有应用商店搜索可做；用药 subreddit 里查到规则的两个（r/Mounjaro、r/GLPGrad）都禁止推广，r/Zepbound 等几个大版的规则没查到，能走通的只有"先当成员"；"best GLP-1 tracker"这类对比页已经被至少 10 个对手和联盟站写的页面占满；短视频受平台规则限制，用 AI 批量造号的做法已经招来一星评论。评论里写明自己从哪里知道 App 的：Reddit 8 条、广告 3 条、亲友 3 条、TikTok 2 条、AI 助手推荐 1 条。
7. **现实天花板：多数入场者每月 0–1,500 美元；做到第二梯队每月约 0.5–2 万美元（上限口径，推算）；再往上要靠投放。** 在英文区做到 Shotsy 的 1.5%，收入就超过在中文区做到和 Shotsy 同等的渗透率。所以英文的"普通结果"约等于中文的"最好结果"，英文的"好结果"是中文天花板的 5–10 倍，但我们在英文区没有任何渠道优势，而做到第二梯队的三家都有原生 App 和泡在社区里的开发者。
8. **建议"产品从第一天就双语，获客先中文、后英文"，不建议一开始就做双语获客，也不建议等中文做完才开始写英文。** 英文界面的成本接近零，海外华人和给医生看的报告本来就需要它；英文获客需要几个月的社区身份，1–2 人的团队没法和中文冷启动同时做。英文获客的启动条件写在第三节。

---

## 二、按问题分节的证据

### 问题 1：英文头部最近 6 个月的动作，以及品类是在集中还是在分散

时间窗是 2026-05 下旬到 2026-11-22。表里"评论语料"的格子是用户在评论里说出来的情况，日期是评论日期。

#### 1.1 逐家情况

| 产品 | 最近 6 个月的功能和定价 | 融资、收购、体量 |
|---|---|---|
| **Shotsy** | 美区 App Store 在 2026-10-05 的内购是每月 9.99–19.99 美元、每年 39.99–59.99 美元（对手博客的记录，和我们 11-19 抓到的一致）；免费档能记针，Apple Health 同步和药量曲线在付费档（未核实）。8–11 月有三件事：药量曲线从免费变付费、部分用户历史数据看不到、老付费用户被要求加钱（第一轮 `05_switching.md`）。iPhone 版在三个半月里出了 5 个版本（第二轮 `10_market_shifts.md`）。有 1 条评论说在 Instagram 上反复看到它的广告："I have seen ads on IG and actually was annoyed by seeing such redundant ads. Then AI suggested this app as a great Shot Tracker"（Shotsy，App Store，5★，2026-08-23，1446326117）。这是第一轮"2026 年是否已开始投放不清楚"之后查到的第一条线索，只有 1 条 | 没有查到 2026 年的新融资或收购；查到的仍是 2025-02 的种子轮，225 万美元、4 个投资方。第三方估算：每月下载约 4 万、健康健身类畅销榜第 59 位；另有播客简介说月收入 20 万美元以上（都未核实）。官网自称下载过百万（未核实） |
| **MeAgain** | 2026-08 的新闻稿发布了"Real-World Insights"和内置的互助网络（未核实）。Google Play 上 11 月的评论报的价格是每年 82.99 美元："APP is NOT free. wants $82.99/ year"（MeAgain，Google Play，1★，2026-11-16，980b803f）。口服药和空腹倒计时已有（第二轮专题十） | 招聘页自称"刚完成 500 万美元种子轮"，开发主体是 Dots；CB Insights 列为 Seed VC、投资方有 Freestyle Capital（融资日期没查到，未核实）。2026-08 新闻稿称下载超过 50 万、月活数十万；自家对比页后来写下载过百万、App Store 评分 4 万（厂商自述）。第三方估算互相矛盾：月收入 35 万、50 万、65 万美元三个数来自付费墙素材站，另一家估算站给的是月活约 7.5 万、月收入不到 1 万美元 |
| **Glapp** | 2026-06 把周报和解读收进 Glapp Max（每年 39.99 美元，第一轮）；11 月初加了经期记录（测试版）："They just added period tracking (beta phase)"（Glapp，App Store，5★，2026-11-01，1474004805）；到 11-13 仍没有口服药（第二轮专题十） | 融资没查到。商店页自称"第一个由真实用户共建的 GLP-1 App"，核心记录免费 |
| **Pep** | 自家对比页写 Pro 约每年 40 美元（2026-10）；9 月加了备份（第一轮） | 融资和收入没查到。月度评论数在 2025-10 和 2025-11 最高（35 条、39 条），2026-10 是 4 条（评论语料） |
| **MyFitnessPal** | GLP-1 Support 于 2026-04-28 免费上线（用药记录、注射部位、提醒；副作用记录先上 iOS）。6–11 月没有查到新的 GLP-1 功能公告 | 2026-03 收购 Cal AI；维基百科条目转述路透社 2026-04 的报道称公司在探索出售（未核实） |
| **Noom** | GLP-1 Companion 自 2026-06-24 起对所有 GLP-1 用户免费，不论处方来源（第一轮 `c-business-compliance.md`）。2026-11 宣布从 2027 年初起向雇主和保险方免费提供一款无屏手环（厂商口径） | 2026-04 完成收购复方药房 Tailor Made Compounding（未核实，来自第三方公司档案） |
| **WeightWatchers** | 只查到和 Personify Health 的企业渠道合作，日期不明。6–11 月的新动作：没查到 | 没查到 |
| **Oura** | GLP-1 Insights 2026-06 上线，美国约 26 万会员开启（第一轮，厂商自报）。搜索摘要提到它和 UC San Diego Health 做为期一年的 GLP-1 肥胖照护试验，并在收购 Counsel Health 以便在 App 里加入医生（日期和出处链接没能对应上，未核实） | 同左 |
| **Apple 健康** | iOS 27 的健康 App 加了 Apple Intelligence 的 Insights 页（汇总心脏、睡眠、健身、体征、经期数据）、更年期记录和重新设计的浏览页；苹果开发者论坛的答复是"iOS 27 没有用药接口的更新"。没有查到苹果自带的 GLP-1 打针或注射部位记录。苹果社区里有一个标题为"注射剂量功能被降级了？"的帖子，说明自带的用药记录对针剂并不顺手（只有标题，未核实） | 不适用 |

来源：
- Shotsy：https://tracxn.com/d/companies/shotsy/__z3Cor-TFUWmgZBZQHc-4SxmB8uSzv_e8kIy6K-ABZb4 ；https://startupintros.com/orgs/shotsy ；https://www.healthcount.app/us/blog/free-alternative-to-shotsy ；https://glp3planner.com/resources/shotsy-alternatives ；https://trendapps.dev/app/ios/6499510249/ ；https://podcasts.apple.com/us/podcast/app-marketing-by-app-masters/id643216602 ；https://shotsyapp.com/
- MeAgain：https://standout.work/companies/meagain ；https://www.cbinsights.com/company/meagain ；https://insider.fitt.co/press-release/meagain-app-launches-real-world-insights-a-built-in-support-network-for-glp-1-users/ ；https://meagain.com/best-glp-1-tracker-apps ；https://adapty.io/paywall-library/meagain/ ；https://screensdesign.com/apps/meagain-glp-1-all-in-one-app/ ；https://screensdesign.com/showcase/meagain-glp-1-all-in-one-app ；https://appgoblin.info/apps/6744178534
- Glapp、Pep：https://apps.apple.com/nz/app/glapp-smart-glp-1-tracker/id6756984097 ；https://pepglp1.com/best-glp-1-tracker-apps/
- MyFitnessPal、Noom、WeightWatchers：https://www.globenewswire.com/news-release/2026/04/28/3282728/0/en/MyFitnessPal-Launches-Comprehensive-GLP-1-Support-Helping-Users-Stay-Consistent-and-Build-Habits-Alongside-Medication-to-Maximize-Their-Experience.html ；https://en.wikipedia.org/wiki/MyFitnessPal ；https://sacra.com/c/noom/ ；https://the5krunner.com/2026/11/17/quick-read-noom-band/ ；https://www.mobihealthnews.com/news/weightwatchers-partners-personify-health-b2b-weight-health-offering
- Apple：https://apple.com/newsroom/2026/09/apple-advances-health-and-fitness-capabilities-using-apple-intelligence/ ；https://www.macrumors.com/guide/ios-27-health-app/ ；https://developer.apple.com/forums/thread/833045 ；https://discussions-jp-prz.apple.com/thread/256125835

#### 1.2 集中度：用本地数据算的三个数

下面三个数都是（推算），底数是 2026-11-19 抓到的商店评分人数（`store-reviews/summary.md` 第 1 节）和评论日期。样本是当时选进来的 12 款专用 App，不是全品类；选样偏向"看得见的"，所以真实的长尾只会更长。

| 指标 | Shotsy + MeAgain | 第二梯队（DreamMe、Glapp、Pep） | 其余 7 款 |
|---|---|---|---|
| 美区 App Store 评分人数（12 款合计 82,777） | 76,489，占 92.4% | 5,657，占 6.8% | 631，占 0.8%（其中 Preserve 和 Ember 是 0） |
| Google Play 评分人数（有安卓版并有评分的 5 款合计 20,547） | 17,215，占 83.8% | 3,332，占 16.2% | 没有安卓版，或者没有评分 |
| 最近新写评论的速度（App Store，条每天） | MeAgain 约 6.0，Shotsy 约 4.4，合计约 10.4 | Glapp 0.56，DreamMe 0.19，Pep 0.15，合计约 0.9 | Free.Well 0.13，GLPTracker 0.09，其余接近 0 |

算法：评论速度等于抓到的条数除以首尾两条评论相隔的天数。Shotsy 和 MeAgain 各取最近 500 条（分别跨 113 天和 84 天），其余各家取全部历史，所以小 App 的速度是"上架以来的平均"，头部的是"最近三四个月的平均"，两者不完全可比，但差了一个数量级这件事不受影响。

两点补充：

- **安卓那一侧没有 iPhone 那么集中。** Pep 在 Google Play 的评分人数（2,046）是 Shotsy（13,498）的 15%，而在 App Store 只有 2.8%。12 款里只有 6 款有安卓版（调研汇总第 1 节）。Shotsy 安卓版落后于 iPhone 版有 2 条评论直接对比（药量曲线不能点选历史、不支持 Wegovy 片），例如："On an iPhone, you can touch any part of the graph to see what your levels were during that time period but on a droid you cam only see exact levels in the present time."（Shotsy，Google Play，3★，2026-09-28，39330fa3）。MeAgain 的安卓评论里一星占四分之一（第一轮）。
- **卖药的一方自带的 App 在评论里已经被当成免费替代。** "Using the Lilly app. Free and easy."（MeAgain，App Store，2★，2026-09-20，1457258996）；"The tracker that came from my GLP-1 provider doesn't show past shots. Shotsy not only gives me the entire history"（Shotsy，App Store，5★，2026-09-05，1451632364）。前一条是流向卖药方，后一条是从卖药方流出来，各只有 1 条。

#### 1.3 判断

- **需求侧在集中。** 评分存量和新增评论都有约九成在两家手里；被别人推荐时默认推荐的也是头名（第一轮）。
- **供给侧在分散。** 2026 年新增至少 568 个标题带"GLP-1"的 App（第一轮引 Benzinga：https://www.benzinga.com/news/health-care/26/09/62011321/glp-1-pill-boom-apps-research-risks-lagging ）。本轮 12 次搜索里又冒出第一轮名单之外的名字：Lumi、Glippy、Pokii、GLP-1 Coach、Gila、Glowise、HealthCount、GLP3 Planner、Peptide Tracker（https://a12factor.com/blog/best-glp1-tracking-apps-2026 ；https://apps.apple.com/us/app/id6746722120 ；https://apps.apple.com/app/id6773481001 ；https://gila.coach/learn/best-glp1-tracking-apps-compared-2026 ；https://smollaunch.com/products/peptide-tracker-app ）。
- **资本没有往"记录工具"这一层集中。** 一年里查到的记录工具融资只有 MeAgain 的 500 万美元种子轮（自述）；Shotsy 在 2025-02 之后没有新一轮。并购都是平台在补"药和医生"：MyFitnessPal 买识餐，Noom 买药房，Oura 买问诊。第一轮写的"被先行者收购是现实终局之一"在这个品类里还没有先例，只能当假设。
- **免费的底线在抬高，苹果没有进场。** MyFitnessPal、Noom、Oura、礼来的 App 都把基础记录免费给了自己的用户；苹果这一年没有动用药接口。对后来者来说，这意味着"记一针"本身收不到钱，但也没有出现系统自带功能把专用 App 一次清场的情况。

### 问题 2：最近 12–18 个月进场的后来者做到了什么量级，靠什么渠道

第一轮已经复盘了 Glapp 和 MeAgain 的打法（`04_latecomer_playbooks.md`）。这里只补三样：把所有后来者放进同一张量级表；用月度评论数看它们的势头；回答"有没有不花钱起量的例子"。

#### 2.1 量级表

评分人数是 2026-11-19 的值；"相对 Shotsy"等于该 App 的评分人数除以 Shotsy 的（App Store 35,124，Google Play 13,498）；"折合月收入"是（推算），算法见表下。

| 后来者 | 语料里最早的评论（约等于上架） | App Store 评分 / 相对 Shotsy | Google Play 评分 / 相对 Shotsy | 折合月收入上限（推算） | 渠道证据 |
|---|---|---|---|---|---|
| **MeAgain** | 2025-04-11 上架（第一轮） | 41,365 / 118% | 3,717 / 28% | 第三方估算 35–65 万美元，另一家估不到 1 万美元（未核实） | Facebook 广告 2 条、TikTok 1 条、广告与实际不符 9 条（第一轮）；种子轮 500 万美元（自述） |
| **DreamMe** | 2025-12-21 | 3,574 / 10.2% | 763 / 5.7% | 约 1.8 万美元 | TikTok 上用 AI 生成的账号推广，1 条一星评论指出（第一轮）。文字评论只有 63 条，是评分人数的 1.8%，而 Glapp、Pep、Free.Well、GLPTracker 都在 7.5%–12%，说明它的评分多半是应用内弹窗催出来的，不能和别家直接比（推算） |
| **Glapp** | 网页版 2025 年底前后；App Store 2026-03-23；Google Play 2026-05-15 | 1,103 / 3.1% | 523 / 3.9% | 约 0.7 万美元 | 开发者在多个 subreddit 回帖，评论里 5 条提到 Reddit；可以导入 Shotsy 数据（第一轮） |
| **Pep** | App Store 2024-10-07；Google Play 2025-09-13 | 980 / 2.8% | 2,046 / 15.2% | 约 1.2 万美元 | Reddit 2 条："I've seen this on Reddit from iOS users, let's see how it is on Android!"（Pep，Google Play，5★，2025-09-27，7263057e）；不要登录是从 Shotsy 换来的理由（第一轮） |
| **Free.Well** | 2026-05-13 | 332 / 0.9% | 没有安卓版 | 约 1,400 美元 | 没查到。25 条评论里 16 条是三星以下 |
| **GLPTracker（C2M）** | 2026-02-23 | 277 / 0.8% | 没有安卓版 | 约 1,100 美元 | 没查到。2026-06 有评论说它从免费改成了收费，当月 6 条评论全部是三星以下 |
| **JellyPal** | 2026-04-19 | 14 / 0.04% | 无评分 | 约 60 美元 | 没查到 |
| **Preserve、Ember** | Preserve 2026-06-15 上架（第一轮） | 0 | 没有安卓版 | 0 | 没查到 |
| **Glowise**（不在本地样本里） | 没查到 | 没查到 | 没查到 | 第三方估算每月 1.5 万美元（未核实） | 没查到 |
| **一款名为"GLP-1 Tracker"的小 App**（不在本地样本里） | 没查到 | 没查到 | 没查到 | 最近 30 天收入 479 美元、月经常性收入 588 美元，由收入核验站对接 RevenueCat 后显示（单一来源，页面没能打开） | 没查到 |

"折合月收入上限"的算法：Shotsy 的月收入取第三方估算的约 20 万美元（调研汇总第 5 节，Similarweb 经 App Masters；本轮搜到的播客简介也是"20 万美元以上"），除以它两个商店的评分人数合计 48,622，得到每个评分约 4.1 美元每月；再乘以各家的评分人数合计。这个算法假设"评分人数和收入成正比、变现强度和 Shotsy 一样"，两条都很粗：Glapp 的核心功能免费、2026-06 才开始收费，实际收入应当明显低于表里的数；MeAgain 定价更高、付费墙更硬，按同一算法只有约 18.5 万美元，低于第三方估算的 35–65 万美元。所以这一列只能当"量级的上限"读。

来源：https://screensdesign.com/apps/glowise-glp-1-tracker-diary/?ts=0&vt=1&id=2624&av=3531 ；https://trustmrr.com/startup/glp ；其余为评论语料和 `store-reviews/summary.md`。

#### 2.2 势头：月度评论数都是"冲一下然后回落"

（评论语料；小 App 抓到的是全部历史，所以月度条数可以当势头看。写评论的人只是用户的一小部分，弹窗策略一改条数就会变，只能看形状。）

- **Glapp**：2026-03 到 2026-11 各月是 6、12、49、73、20、13、37、16、13 条。高点在 6 月，也就是安卓原生版上线后一个月、把周报收进付费墙的那个月（当月 73 条里 28 条是三星以下）；之后回到每月 13–37 条。
- **Pep**：2025-09 到 2025-12 是 18、35、39、21 条（安卓版上线后的四个月），2026 年各月在 2–19 条之间，10 月 4 条。
- **DreamMe**：2026-06 到 2026-08 是 15、22、21 条，之后 10、9、8 条；7 月的 22 条里 16 条是三星以下。
- **对照**：同一时期 Shotsy 在 App Store 每天新增约 4.4 条，MeAgain 约 6.0 条。

三家后来者都没有出现"越滚越快"的形状。新平台上线（安卓）或者一波内容带来一个高点，然后回到一个低得多的平台期。

#### 2.3 有没有一个靠单点切入、不花钱买量而起量的例子

- **查到的最好例子是 Glapp 和 Pep，量级是头名的 3%–15%，不是"起量"。** Glapp 的单点是"西林瓶和库存管理、带 Tmax 的免费药量曲线、剂量计算器"，对象是复方药用户；Pep 的单点是"拍照记餐加记针、不要登录"，在安卓上吃到了 Shotsy 安卓版落后的那一段。两家都有开发者本人在 Reddit 上回帖的证据。
- **做到头名一成以上的两家都不干净。** DreamMe 靠宠物养成和 TikTok 上的 AI 批量内容，评分数有水分（见上表）；MeAgain 靠融资和投放。
- **头名自己才是"单点切入、不买量"的例子，但它是先行者。** Shotsy 在 2024 年春以 r/Zepbound 活跃成员的身份招内测（`reddit.csv` 里那条帖子的摘要是"Shotsy, the Zepbound dosage tracking tool many of you have been beta testing"，https://www.reddit.com/r/Zepbound/comments/1d49ijq/ ）；按第一轮查到的创始人自述，她当时已是版里的活跃成员，组内招内测 90 分钟来了 50 人。两年半以后，评论里的说法是它在 Reddit 上"被高度推荐"，后来者面对的是一个已经有默认答案的版，这个条件不再存在（后半句是推算）。
- **最近 12–18 个月里"不买量、做到头名一成以上"的例子：搜了一次，没查到。** 这是"没查到"，不是"确认没有"；搜索返回的全是估算站和对手的对比页，没有一篇独立开发者的复盘。

### 问题 3：被头部服务得最差的细分人群

先给总表，再给每一行的证据。人数口径不一、多数是二手转述，只能当量级。底数：美国正在用 GLP-1 的成年人约 2,900–3,200 万（Gallup 2026 年 5–6 月的调查，一个二手页写 12.4% 约 3,200 万，KFF Health News 转述的是 11% 正在用于减重、15% 曾用于减重；KFF 自己的口径是 18% 用过、12% 正在用，调查日期有 2025 年 10–11 月和 2026 年 2–3 月两种说法，没能核对）。下文统一按 3,000 万算。

| 人群 | 多少人（口径） | 聚集在哪里 | 本地评论（专用组 2,083 条里） | 判断 |
|---|---|---|---|---|
| **非每周节律：拆针、一周两次、每 4 天一次、微剂量** | 流行率没查到。CDC 2025 年调查的标题里有"改变用法"一项，原文没能打开 | r/tirzepatidecompound、各药的 subreddit、卖"microdose 方案"的远程医疗（Noom 每月 179 美元，第一轮） | 14 条（专用组 11 条，另有 Noom 3 条），其中 5 条是"做不到"：Shotsy 2 条、MeAgain 1 条、Glapp 2 条；另有 1 条 Shotsy 用户说每 4 天一针的记录会丢 | **证据最整齐的缺口：三家头部各有被点名的地方。** 人数不明 |
| **复方药和西林瓶（要换算单位）** | 150–600 万：CDC 口径是 2025 年约 2,700 万用过 GLP-1 的成年人里至少 23% 用过复方（约 620 万，推算），另有 9% 不确定；2026-09 一篇专栏说现在约 150 万（无方法，未核实）；2025-02 的行业诉状说 2023-11 到 2024-11 约 200 万 | r/tirzepatidecompound、卖复方的远程医疗平台、独立的换算网站 | 26 条：Glapp 15 条（几乎全是夸库存管理），Shotsy 6 条（其中 4 条在求复方录入或单位换算），Pep 1 条求按 units 记，MeAgain 1 条，另有 Noom 3 条 | **盘子不小，但已有人占住，而且在缩。** Glapp 的差异点就在这里；法院已支持 FDA"短缺结束"的认定（单一来源）。PRD 第 1.4 节明确不做剂量换算 |
| **多种肽类一起打（含未获批的 retatrutide）** | 没查到 | 肽类 subreddit、灰色渠道的卖家社群 | 21 条，全部在专用组；7 条在求"多加几种肽"（Shotsy 4、Pep 2、Glapp 1），5 条在夸能记 retatrutide | 评论里声量比糖尿病和年长用户加起来还大，但涉及未获批药物，**不该主动去要**（第二轮专题十同一结论） |
| **口服药** | 约 100 万人在吃口服减重药，约三分之二是新人（第二轮专题十，推算） | 卖药渠道自带的 App | 15 条（第二轮专题十）：Shotsy 安卓版和 Glapp 到 9–11 月仍不支持 | 缺口是真的，但随时会被补上，新人多半被卖药渠道截走（专题十） |
| **停药和维持期** | 用过但现在没在用的约 1,560 万（专题十，推算） | r/GLPGrad（查到这个版禁止推广）、r/loseit、通用减重 App | 维持期 8 条（专题十）；Glapp 2 条在求 | 需求在 Reddit 上比在评论里强；他们面前是 Noom、MyFitnessPal 这类通用产品（专题十） |
| **2 型糖尿病** | 约 800–1,350 万（推算：确诊糖尿病的成年人里 26%–45% 在用 GLP-1，分母按约 3,000 万成年人，这个分母是没有检索的常识数字）。NCHS 2025-08 的简报里，确诊糖尿病成年人的 GLP-1 针剂使用率是西语裔 31.3%、非西语裔黑人 26.5%、非西语裔白人 26.2%；二手页转述 KFF 的数有 45% 和 57% 两种 | 糖尿病社群、血糖仪和动态血糖仪的配套 App | 专用组 4 条，其中 2 条是功能请求（加 A1C 或空腹血糖；加血糖记录） | **人最多，付费最弱。** 第一轮结论是糖尿病最不适合照搬（记录器免费并捆在硬件里）。评论里的请求只是"多一个血糖字段" |
| **年长用户（65 岁以上）** | 约 540 万（推算：二手页转述 KFF 的 65 岁以上使用率约 9%，口径不清；乘以约 6,000 万人，这个人数是没有检索的常识数字）。Medicare 的过渡项目符合条件的约 380 万（专题十） | 医生诊室、家人、Facebook | 专用组自报年长的 4 条；没有一条抱怨字小或难用，抱怨的是价格和没法把数据给医生 | **没有"界面对老人不友好"的证据。** 有的是"要给医生看"和"预算有限" |
| **男性** | 约 1,100–1,200 万（推算：二手页转述 KFF 的"曾用过"是女性 22%、男性 14%，男性约占 39%；假设"正在用"的性别比相同） | r/Zepbound 等版里是少数；健身和睾酮替代的社群 | 专门的请求只有 1 条（想在同一个 App 里记睾酮替代）。提到"my wife"的 4 条，提到"my husband"的 2 条，男性在写评论的人里不是看不见 | **看不到未被满足的专门需求。** 头部在往女性方向加功能（Glapp 的经期记录），这是男性被忽略的间接迹象，不是需求证据 |
| **西班牙语用户** | 约 440 万西语裔成年人过去一年用过（推算：CDC 2025 年调查的使用率 9.8%，置信区间 7.9–12.1，乘以约 4,500 万西语裔成年人，这个人数是没有检索的常识数字）；其中偏好西语界面的比例没查到 | 没查到 | 2,562 条里只有 1 条西语评论："Excelente aplicación"（Shotsy，App Store，5★，2026-10-11）；没有一条在求西语 | **两头都没有证据。** 西语的记录 App 搜了一次，没有任何结果；Shotsy 号称 17 种语言（第一轮），是否含西语没核对 |
| **美国以外的英语用户（英国为主）** | 英国约 140–160 万：行业研究转述每月约 140 万人自费购买（无出处）；二手页转述 UCL 2026 年的研究是截至 2025 年初的一年里约 160 万成年人用过（含 NHS 和自费）；约八成自费者用 Mounjaro（未核实）。伦敦议会的说法是"没有确切数据" | r/mounjarouk（搜索结果里出现了它的指南页）、线上药房 | 美区语料里用英石或公斤报体重的有 3 条 | 任务没有点名，但它是"英语、自费、一种药为主"的一块；记录工具在英国的渗透和竞争：没查到 |

来源（人数）：
- 总体和人口分布：https://kffhealthnews.org/morning-breakout/pharma-and-tech-070826/ ；https://www.kff.org/health-costs/public-opinion-on-prescription-drugs-and-their-prices/ ；https://www.calorilator.com/blog/glp-1-usage-statistics-2026/ ；https://glplens.com/learn/how-many-americans-take-glp-1s/ ；https://www.glpwinner.com/insights/whos-using-glp-1s-now-the-2026-numbers-explained ；https://pabau.com/blog/glp-1-statistics/ ；https://wellness.goalbmi.com/glp-1-statistics-2026/ ；https://mealfan.com/glp-1-statistics-2026/
- 复方：https://healthcaredive.com/news/compounded-glp-1s-telehealth-debate-snake-oil-fda/874840 ；https://www.forbes.com/sites/sallypipes/2026/09/21/the-glp-1-shortage-is-over-mass-market-compounding-should-be-too/ ；https://kffhealthnews.org/health-industry/glp1-compounding-pharmacies-wegovy-zepbound-copycat-drugs-shortages/ ；https://pmc.ncbi.nlm.nih.gov/articles/PMC12403326/
- CDC 和 NCHS：https://www.cdc.gov/mmwr/volumes/75/wr/mm7544a1.htm ；https://www.cdc.gov/nchs/data/databriefs/db537.pdf ；https://www.patientcareonline.com/view/glp-1-ras-prescribed-for-more-than-one-third-of-us-adults-with-diabetes-in-middle-age-nchs-data-brief
- 西语裔：https://www.calonews.com/featured-topics/health/glp-1-medications-can-help-latinos-lose-weight-but-many-cannot-afford-them/article_e8674a88-3e59-4de6-b6b0-84a032dda787.html ；https://www.sciencedirect.com/science/article/pii/S1047279726001493
- 英国：https://img3.ibisworld.com/blog/weight-loss-drugs-uk/44/1126 ；https://www.heyslim.co.uk/blog/uk-weight-loss-medication-statistics-2026 ；https://slinic.co.uk/weight-loss-injections-uk-statistics-2026/ ；https://www.london.gov.uk/who-we-are/what-london-assembly-does/london-assembly-work/london-assembly-current-investigations/weight-loss-jabs-london

#### 3.1 非每周节律：三家头部各有一个被点名的缺口

- Shotsy："weirdly not customizable, for example can't set dosage for twice a week"（Google Play，3★，2026-09-25，ba1e296d）。
- Shotsy："I liked the app until Dr wanted me to split the dose. 5mg-3 ml on shot day then 5mg-2 ml on day 4. There isn't anyway to log this in the app."（App Store，3★，2026-07-28，1435825855）。
- Shotsy："I use a partial dose every 4 days, so I don't inject the same days each week. I'll check the app to see what day I last injected and the last record will be gone."（App Store，3★，2026-10-02，1462116980）。
- MeAgain："Are there plans to include twice a week half doses?"（Google Play，5★，2026-11-07，7885417e）。
- Glapp："My schedule is every Tuesday and Friday. If you're only doing 1 shot / week, then this app is for you. ... Support team said I can't schedule shots for specific weekdays."（Google Play，1★，2026-06-20，1afa1ca2）。
- Glapp："my plan is split doses Sun/Thur & the shot interval does not allow this to be entered. I can enter 3days12hours but that's not right either."（App Store，4★，2026-06-22，1421319696）。
- 反向证据也有：同样的用法，有人在 Shotsy 和 MeAgain 上是做得到的。"This app gives you the exact calculations of any way you want to split the dose."（Shotsy，App Store，5★，2026-10-29，1472564831）；"I take a smaller dose every 4 days and it helps me keep track since I do not always take on the same day."（MeAgain，App Store，5★，2026-10-24，1470551434）。所以缺口不是"完全不支持"，而是"按固定星期几排两针"和"一针拆成两次"这类排法在三家都不顺。
- Noom 在卖 microdose 方案，评论两极："The micro doses of GLP 1 have cut the noise with no side effects"（Noom，App Store，5★，2026-09-26，1459595726）；「Noom tried to sell me GLP-1s to "microdose", an off label and unvalidated application of a powerful new prescription medicine.」（Noom，App Store，1★，2026-07-01，1424976305）。

这一条和第二轮专题十的结论（把"用药状态"而不是"每周一针"做成基本单位，间隔用任意天数）指向同一件事；本轮补上的是"三家头部都被点过名"和"固定星期几的两针"这个具体用例。

#### 3.2 复方药和单位换算：缺口在 Shotsy，位置在 Glapp 和独立计算器手里

- Shotsy 的四条请求："I would like for them to add a way to enter compounded versions."（App Store，3★，2026-08-11，1441653156）；"I would give it five stars if it gave the option for compound meds as I am currently taking tirz and B6."（Google Play，4★，2026-10-14，26848a0e）；「it'd be great to add a "dose" translator from mls to units for people who transition from brand name to compound」（App Store，5★，2026-08-01，1437550200）；以及一条点名了一个独立的换算网站："A calculator like is available at fatscientist.com for calculating dosage and reverse dosage calculator for units to MG."（App Store，5★，2026-10-12，1465973362）。
- Glapp 被夸的正是这一块，15 条里的代表："Prior to this, my supply tracking was manually adding mgs from looking at the vials in the fridge."（App Store，5★，2026-05-11，1405334540）；"the dosage calculators are incredibly helpful, as is the supply tracker"（App Store，5★，2026-05-07，1403809737）。它也还有没做到的："Please add a feature to account for multiple people sharing a vial."（App Store，5★，2026-10-24，1470750195）。
- 判断：这是英文区证据最多的"单点"，但它就是 Glapp 已经用了八个月的单点，换来的是头名的 3%–4%；独立的换算网站已经被用户点名；美国大规模复方的法律空间在收窄；我们的 PRD 第 1.4 节明确不做剂量换算。四条加在一起，它不是我们的切入点。

#### 3.3 糖尿病、年长、男性、西语：人多，但评论里没有专门的缺口

- 糖尿病的两条请求："I just wish that they also include A1C or fasting glucose as a data input especially for Mounjaro!"（Shotsy，App Store，4★，2026-09-27，1460086158）；"Only wish there was a spot to track blood sugars."（MeAgain，App Store，5★，2026-11-08，1476791155）。
- 年长用户说的是医生和钱，不是字号："I'm on the Bridge Program through Medicare and need to keep tabs on things to be able to communicate to my doctor."（Shotsy，App Store，5★，2026-08-03，1438496554，标题是"Great app for Seniors!"）；"Us older folks who use this are likely on medically supervised diets, yet there's no easy way to share data with my doctor. So, I switched to Shotsy and Cronometer Gold."（MeAgain，App Store，2★，2026-10-04，1462784223）；"As an older person already on a limited budget and spending money on meds and supplements I just can't pay for their max subscription"（Glapp，App Store，4★，2026-06-21，1421006438）。把记录带给医生在专用组里有 17 条（Shotsy 8 条、MeAgain 5 条），多数是好评，2 条是抱怨数据丢了或导不出来。
- 男性的唯一一条专门请求："I wish I could track my TRT regimen in the same app."（Shotsy，Google Play，5★，2026-11-03，815bc67b）。
- 西语：语料是美区英文评论，本来就看不到；网络搜索也没有返回任何西语记录 App。这一格是真空还是没人要，现有材料分不出来。

### 问题 4：没有英文渠道、没有预算的小团队，在英文区怎么获客，现实转化如何

#### 4.1 评论里写明"从哪里知道这款 App"的

（评论语料，专用组 2,083 条；关键词命中后逐条读过。写来源的人极少，只能说明渠道存在，不能估占比。）

| 渠道 | 条数 | 分布 | 说明 |
|---|---|---|---|
| Reddit | 8 | Shotsy 5、Pep 2、Glapp 1 | 第一轮核查过的数；Glapp 另有 2 条在夸开发者在 Reddit 上回复快 |
| 广告 | 3 | MeAgain 的 Facebook 广告 2 条，Shotsy 的 Instagram 广告 1 条 | 另有 9 条抱怨 MeAgain 的广告和实际不符（第一轮） |
| 亲友 | 3 | Shotsy 2（妻子、朋友）、MeAgain 1（女儿） | 第一轮用更宽的关键词数到 19 条 |
| TikTok | 2 | MeAgain 1、DreamMe 1 | MeAgain 那条没说是广告还是内容；DreamMe 那条是一星，骂的是 AI 批量账号 |
| AI 助手推荐 | 1 | Shotsy | "Then AI suggested this app as a great Shot Tracker"（App Store，5★，2026-08-23，1446326117） |
| 医生推荐 | 0 | | 反方向的有 1 条：用户把 MeAgain 推荐给了医生 |
| 应用商店里搜到 | 1 | Pep | "i searched forever for a app and this is the only one i found that does everything"（Google Play，5★，2025-09-25，983e2f02） |

AI 助手那一条值得单独记一笔：问 AI"用什么记针"的人会被推荐头名，这条渠道对后来者不利，因为模型的答案来自已有的网页提及量。只有 1 条，是线索不是结论。

#### 4.2 应用商店搜索优化

- **我们现在是网页版，这条路暂时不存在。** 没有上架就没有商店搜索；Glapp 的先例是网页版三个月后补了 iPhone 原生版、五个月后补了安卓版（第一轮）。
- **上架以后面对的是存量。** 两家头部握着九成以上的评分；2026 年新增至少 568 个同名标题；App 名和副标题只能用通用名，不能用药品商标（第一轮 `c-business-compliance.md` 第 2.3 节）。
- **安卓比 iPhone 松。** Pep 在 Google Play 做到 Shotsy 的 15%，在 App Store 只有 2.8%；Shotsy 安卓版功能落后、MeAgain 安卓版不稳定（见 1.2）。如果要靠商店搜索，先做安卓比先做 iPhone 更有可能排得上（推算，没有关键词排名数据）。
- GLP-1 相关关键词的搜索热度、难度、Apple Ads 的实际出价：没查到。

#### 4.3 Reddit：查到规则的版都禁止推广，能走通的只有"先当成员"

| 社区 | 查到的规则 | 执行情况 | 来源 |
|---|---|---|---|
| r/Mounjaro | 规则禁止利用该版推广或招揽任何内容；另有禁止讨论复方药的规则（来自第三方镜像站的搜索摘要，可能不是现行版本，未核实） | 没查到 | https://reddit.rtrace.io/r/Mounjaro/wiki/index |
| r/tirzepatidecompound | 规则原文没查到。社区分析站把"Self-Promotion"列为一个帖子类别，过去一个月有 1 帖，说明这类帖子存在但极少（未核实） | 没查到 | https://thehiveindex.com/communities/r-tirzepatidecompound/ |
| r/GLPGrad（停药和维持期） | "No Spam"规则覆盖重复推广和丢链接；第三方指南的结论是"凡是读起来像推广的都算"（未核实） | 没查到 | https://rankhog.com/subreddits/glpgrad |
| r/glp1meals | 成文规则没有明说；第三方指南建议把"没写"当成"不允许"（未核实） | 没查到 | https://www.threadotter.com/subreddit-rules/glp1meals |
| r/Zepbound、r/Semaglutide、r/Ozempic、r/WegovyWeightLoss | 搜了两次，**没查到** | 没查到 | 需要人工打开各版侧栏 |
| r/apps（通用） | 只有经版主许可或在指定帖子里才能推广；不带链接地回答问题通常受欢迎（未核实） | 没查到 | https://www.replyhey.com/subreddits/apps ；https://www.threadotter.com/subreddit-rules/apps |
| Reddit 以外：一个 GLP-1 用户的 Skool 社群 | 未经管理员批准不得推广自己的产品、服务或社群，私信也算（未核实） | 没查到 | https://www.skool.com/the-weekly-dose-8554 |

各版的成员数：没查到（社区分析站打不开）。各版对违规帖的实际处理（删帖、封号的比例）：没查到。Reddit 本身在本会话里打不开，第一轮和本轮都没有绕过。

能从评论里反推的"实际执行"只有一点：开发者以成员身份回帖是被容忍的，而且有效。Glapp 有 2 条评论夸开发者在 Reddit 上回复问题和采纳建议（第一轮核查过的数），例如"the developers are super responsive for questions, feature requests, etc on the various Reddit groups"（Glapp，App Store，5★，2026-05-07，1403809737）；Pep 有 1 条提到"The developer says on reddit that it is free"（Pep，Google Play，1★，2026-09-02，fd269247）。Shotsy 当年发的是"招内测"，不是"发产品"。

**现实转化。** 这条路走得最好的 Glapp，原生 App 八个月拿到 1,103 加 523 个评分；Pep 二十五个月拿到 980 加 2,046 个。这是"开发者是社区成员、产品免费或基本免费、有原生 App"三个条件都满足时的结果。我们三个条件现在一个都不满足：团队里没有英文用药社区的成员身份，第一轮的教训是不能先免费再收回，现在只有网页版。

#### 4.4 程序化 SEO：对比页已经被对手自己占满

本轮 12 次搜索本身就是一次观察。凡是带"Shotsy""best GLP-1 tracker""alternatives"的查询，返回的几乎全是对手或联盟站写的对比页：

- 对手自己写的：https://meagain.com/best-glp-1-tracker-apps ；https://pepglp1.com/best-glp-1-tracker-apps/ ；https://shotsyapp.com/best-glp-1-tracker-apps/ （第一轮）；https://glp3planner.com/resources/shotsy-alternatives ；https://www.healthcount.app/us/blog/free-alternative-to-shotsy ；https://gila.coach/learn/best-glp1-tracking-apps-compared-2026 ；https://a12factor.com/blog/best-glp1-tracking-apps-2026
- 评测和联盟站：https://glp1nutrition.org/apps/shotsy-review/ ；https://www.glp1muscleloss.com/articles/shotsy-review/ ；https://glp1match.com/blog/best-glp-1-shot-tracking-apps/
- "GLP-1 统计数字"这类信息页同样拥挤，一次搜索返回了 8 个不同站点的同题文章（pabau、calorilator、findlina、glplens、glpwinner、mealfan、goalbmi、singlecare）。
- MeAgain 还按"某某平台的替代品"批量做页面（第一轮记录过 meagain.com/alternatives/ 下的 Ro、Hers、Henry Meds 三页），并发"被评为第一"的付费新闻稿（https://www.barchart.com/story/news/36027020/meagain-named-the-1-zepbound-tirzepatide-tracking-app-for-weight-management-success ）。

判断：对比词和统计词已经是红海，新域名排不上去。还没有被占满的可能是按处境写的长尾（"一周两针怎么记""针换片那一周怎么记""减量期怎么排"），这和第二轮专题十建议的场景落地页一致；这些词的搜索量：没查到。工具型页面里流量最确定的是单位换算计算器（见 3.2 被用户点名的那个网站），但它在 PRD 的"明确不做"里。

#### 4.5 短视频

- TikTok 有禁止用户推广减重药的规定，搜索结果里有一篇专门讲这条规定实施后情况的报道（只有标题，未核实）：https://sg.finance.yahoo.com/news/happened-tiktok-said-users-t-133505087.html 。各平台对减重和 GLP-1 广告的规则有一篇 2026 年的汇总（代理商博客，未核实）：https://inbeat.agency/blog/glp-1-weight-loss-ad-rules-by-platform 。第一轮已查：减重类广告只能投 18 岁以上，处方类要书面许可（`c-business-compliance.md` 第 2 节）。
- 用 AI 批量造账号的做法有量也有反噬：DreamMe 的评分人数做到了 Shotsy 的一成，但有用户写"using disgusting ai slop to promote on tiktok ... it's not only incredibly deceptive, but dangerous to have ai give medical advice"（DreamMe，App Store，1★，2026-07-02，1425569215），它 102 条评论里三星以下占一半。
- 判断：短视频需要出镜的英文创作者或者预算，两样我们都没有；用 AI 代替出镜，在这个人群里风险和收益不成比例（第一轮同一结论）。

### 问题 5：结论

#### 5.1 英文市场后来者的现实天花板

三档，全部是（推算），依据是 2.1 的量级表：

| 档 | 相当于 Shotsy 的 | 折合月收入 | 依据 | 需要什么 |
|---|---|---|---|---|
| 多数入场者 | 不到 1% | 0–1,500 美元 | 样本里 10 家非头部 App 有 6 家评分不到 300 个（其中 2 家是 0）；收入核验站上一款同类小 App 最近 30 天 479 美元；2026 年新增 568 个同名标题 | 上架即可 |
| 第二梯队 | 3%–15% | 约 0.5–2 万美元（上限口径；核心免费的会低得多） | Glapp、Pep、DreamMe 三家；第三方对 Glowise 的估算是 1.5 万美元 | 原生 App（最好含安卓）、一个被说得出口的单点、开发者长期泡在社区里；用 8–25 个月 |
| 头部 | 100% 上下 | 20 万美元以上 | Shotsy（先行者，社区起家）和 MeAgain（融资加投放） | 先发，或者几百万美元的投放 |

和中文滩头放在一起看：

- 第一轮补查的结论是，在大陆以外的中文区做到和 Shotsy 在美国同等的渗透率，是每月约 900–1,750 美元。
- 在英文区每月 3,000 美元，大约相当于 Shotsy 评分存量的 1.5%（推算：3,000 ÷ 4.1 ≈ 730 个评分，730 ÷ 48,622），在样本里排在 Pep、Glapp 之后，Free.Well 之前。
- 所以两句话都成立：**英文区的"普通结果"和中文区的"最好结果"是同一个量级；英文区做到第二梯队，是中文天花板的 5–10 倍（按两边区间的中段算）。** 但样本里做到第二梯队的是"10 家里 3 家"，而且这 10 家是因为看得见才被选进样本的；放到 568 个新标题里，比例只会低得多（没有数据）。

#### 5.2 如果要进，最有胜算的两个切入点和前提

**切入点一：不按"每周一针"走的人，先从安卓和网页做起。**

- 是什么：一周两针（固定星期几）、一针拆两次、每 4 天一次、减量、针换片、暂停再开始。对外的话是"你的用法不是每周一针，也接得上"。
- 为什么是它：三家头部各有被点名的缺口（3.1）；Shotsy 安卓版落后、Glapp 没有口服药（专题十）；提到 Glapp 网页版的 19 条评论里有 17 条来自当时没有原生版可用的安卓用户（第一轮），说明安卓用户愿意先用网页；这是和中文产品完全相同的一套功能，不需要为英文单独做东西。
- 前提：排程引擎真的支持任意间隔和"固定星期几的多针"（专题十列的验收用例，再加上 3.1 的两个）；网页版在安卓上装到桌面、收提醒是可靠的；中文用户里处于这些状态的人留得住（专题十定的信号：至少 30 人、第 8 周留存不低于周针用户）。
- 弱点：人数查不到；这类缺口对头部只是排期问题（专题十），窗口可能只有一两个季度；它解决的是"为什么换过来"，不解决"怎么让人知道"。

**切入点二：美国以外的英语用户，作为"按地区的药物目录"的副产品。**

- 是什么：英国（约 140–160 万人，约八成用 Mounjaro，自费为主）、加拿大（2026 年有了仿制司美格鲁肽，专题十）、澳洲、新加坡。动作只有三件：英文界面，当地的商品名和笔的规格进目录，体重单位支持公斤和英石。
- 为什么是它：这些地方和我们第一批够得着的海外华人在同一批地区（第一轮补查：美加澳华人约 4–14 万），目录本来就要做；头部的重心在美国（定价、保险、复方、Medicare 都是美国语境）；美区语料里已经能看到用英石和公斤的人在用 Shotsy 和 Pep（3 条）。
- 前提：先人工核对 Shotsy 和 MeAgain 在英国区、加拿大区、澳洲区 App Store 的评分人数（办法同第一轮补查的清单：用 itunes.apple.com/lookup 加 country=gb 等参数看 userRatingCount）。如果英国区的评分已经是美区的一成以上，这个切入点就不成立。还要先查英国对处方药面向公众宣传的限制，本轮没有查。
- 弱点：证据是全表最弱的一档，人数全是二手转述；英国本地的记录 App 和线上药房自带的工具：没查到。

**不建议当切入点的：** 复方和单位换算（已被占、在缩、PRD 不做）；多种肽类（未获批药物）；糖尿病（人多但付费最弱，第一轮结论）；西语（没有需求证据，团队也没有这个语言）；男性和年长用户（看不到专门的缺口，适合当文案里的一个画面，不适合当定位）。

#### 5.3 和"中文优先"相比的利弊

| | 中文优先（大陆以外） | 英文 |
|---|---|---|
| 盘子 | 约 15 万人（7–28 万，第一轮推算） | 美国约 3,000 万，英国约 150 万 |
| 做到头名同等渗透的月收入 | 约 900–1,750 美元（第一轮推算） | 约 20 万美元以上（第三方估算） |
| 现成的渠道 | 有一个约 8 万中文粉丝的账号，粉丝里有多少用药者待验证（第一轮） | 没有 |
| 对一手人群的了解 | 有 | 没有英文社区的成员身份 |
| 对手 | Shotsy 的中文界面和三个没查到起量证据的本地 App；真正的对手是"不记"和"发帖当日记"（第一轮） | 两家握着九成评分的头部、三家把记录免费送的平台、每年几百个新入场者 |
| 用户有没有"记针工具"这个概念 | 公开讨论里几乎没人谈（第一轮） | 有，而且已经有默认答案 |
| 单点差异能维持多久 | 没有人追，但也可能说明没人要 | 头部三个半月出 5 个版本，缺口按季度消失 |
| 合规和供应商 | 香港用户用不了现在的 AI；主体问题待定（第一轮） | 美国、加拿大、澳洲在模型供应商的支持地区名单里（第一轮补查读过的名单；英国没有核对；主体问题同样待定）；美国的健康数据法规见第一轮 `c-business-compliance.md`，本轮没有重查 |

一句话：中文区小而我们有一点优势，英文区大而我们没有任何优势；英文区的吸引力全部来自盘子，不来自我们。

#### 5.4 "中文滩头做完再进英文"和"一开始就做双语"哪个更站得住

把"双语"拆成两件事，答案就不一样：

- **产品双语，应当从第一天就有。** 理由有四条。第一，成本接近零：团队写代码快，界面文案不多。第二，第一批用户本来就需要：海外华人给医生看的报告要英文，第一轮定下的三个赢法之一就是"按地区的药物目录加中英双语报告"。第三，它是读信号的仪器：不做任何英文推广，看有多少人自己选了英文界面、来自哪些地区。第四，它让"换一种语言"将来只是打开一个开关，不是一次重做（专题十：切换与维持期这条路"同一个产品，换一种语言"）。
- **获客双语，不应当从第一天就做。** 理由也是四条。第一，英文区唯一对小团队有效的路是"先当几个月社区成员"，1–2 个人没法同时在中文和英文两边做这件事。第二，网页版在英文区没有商店搜索可用，等于放弃了那里最大的一个发现入口。第三，英文区的免费底线更高（MyFitnessPal、Noom、Glapp 都免费记针），我们的收费边界还没有经过任何用户验证。第四，中文滩头要证明的三件事（留得住、有人付钱、切换期用户不流失）正是英文切入点一的前提，先后顺序是逻辑上的，不是保守。
- **"中文做完再开始写英文"也站不住。** 中文滩头按第一轮的推算永远"做不完"到一个像样的收入，把英文推到那之后等于没有规模路径；而且到那时再加英文界面，会错过这中间自己找上门的英文用户所携带的信号。

所以更站得住的是第三种说法：**产品从第一天双语，获客分先后，英文获客由信号触发。** 信号写在下一节。

---

## 三、对"后来者策略"的含义

### 3.1 现在就可以做的（不用等信号，几乎不花时间）

1. **界面和报告从第一版就带英文，语言跟随浏览器并且可以手动切换。** 引导里已经建议记地区、来源、剂型、状态四个字段（第一轮和专题十），再加一个不用问的字段：界面语言。这五个字段合起来能回答"英文用户自己来了多少、从哪来、处在哪个状态"。
2. **把 3.1 的两个用例加进排程的验收清单。** "固定星期几的一周两针"（周二和周五、周日和周四）和"同一周一针拆成两次、两次剂量不同"。三家头部在这两个排法上都被点过名。剂量怎么拆仍然不给建议，只记录（PRD 第 1.4 节）。
3. **体重单位支持公斤、磅、英石、斤；药物目录按地区列商品名和规格。** 这是切入点二的全部产品成本，也是海外华人本来就需要的。
4. **做一次 15 分钟的人工核对，决定切入点二要不要留着。** 看 Shotsy、MeAgain、Glapp 在英国区、加拿大区、澳洲区、新加坡区 App Store 的评分人数，和美区的 35,124、41,365、1,103 比。读法：英国区如果不到美区的 3%（英国用药者约是美国的 5%，推算），说明头部在那里的渗透低于美国，切入点二值得留；如果已经超过 10%，就划掉。
5. **人工读四个 subreddit 的侧栏规则并存一份截图。** r/Zepbound、r/Semaglutide、r/tirzepatidecompound、r/mounjarouk。本轮搜了两次没有拿到原文；这件事决定英文社区这条路有没有入口，花不了十分钟。
6. **写 3–5 篇按处境命名的英文说明页，不做对比页。** 例如"一周两针怎么记""针换片那一周怎么记""减量期的记录怎么接上"。内容和中文说明页是同一套，只讲怎么记，不讲怎么用药。目的是读信号（有没有自然搜索进来的人），不是冲流量。守第一轮定的三条线：不写效果数字和前后对比、不放购药信息、不用推荐码。

### 3.2 等信号出现再启动的

| 要启动的事 | 启动信号 | 不该做的情况 |
|---|---|---|
| **英文社区的冷启动（切入点一）** | 同时满足三条：（一）专题十的信号成立，即处于减量、换药、暂停、口服维持这些状态的激活用户至少 30 人，第 8 周留存不低于周针用户；（二）不做任何英文推广的前 12 周里，选英文界面的激活用药者自己来了至少 30 人，或者占到激活用药者的 15%；（三）团队里有人已经以真实的用药者或照护者身份，在一个英文社区里不带产品地参与了至少三个月，并且读过该版的规则。动作是在那个版里招内测（Shotsy 当年的做法），不是发产品 | 团队里没有人具备真实身份可以参与；目标版的规则明文禁止（r/Mounjaro 就是）；需要靠新注册的账号发帖 |
| **原生安卓壳先于 iPhone** | 网页版上安卓用户的第 4 周留存不低于 iPhone 用户，并且至少有 20 位用户把网页装到了桌面；或者英文界面的用户里安卓占多数 | 网页版的提醒在安卓上不可靠还没解决；账号和数据平移没有验收过（第一轮：浏览器清数据是网页版最确定的风险） |
| **接住头部的事故** | Shotsy 或 MeAgain 出现新一轮"收回免费功能""涨价""丢数据"（每月读一次两家最新的一星评论）。动作是把"贴进来、拍进来就能建好历史"的导入页翻成英文并放到首屏（导入本身第一轮已建议做） | 没有原生壳，也没有英文社区的身份：这时候接不住，窗口只有约三个月（第一轮：Glapp 的差评潮持续约三个月，Shotsy 的数据事故 11 月初之后就没再出现） |
| **英国等地的专门动作（切入点二）** | 3.1 第 4 条的核对结果是"头部在英国区的评分不到美区的 3%"，并且地区字段里英国或加拿大的用户自己出现了至少 10 人 | 需要当地的支付、客服时段或者内容运营；没有先查清当地对处方药宣传的规定 |

表里的门槛（30 人、15%、三个月、20 人、10 人）是我为了让信号可以判定而定的，没有外部依据，可以和第一轮的止损线一起调。

### 3.3 不该做的

- **不做英文区的付费投放和付费博主。** 没预算，平台规则受限，而且头部已经在投（Shotsy 的 Instagram 广告、MeAgain 的 Facebook 和 TikTok 广告）。
- **不写"best GLP-1 tracker""Shotsy alternatives"这类对比页，不发"被评为第一"的新闻稿。** 这些词已经被至少 10 个对手和联盟站写的页面占满，新域名排不上去，还会把我们放进一个我们功能最少的比较表里。
- **不做单位换算计算器当引流工具。** 它是英文区流量最确定的单点，但已有独立网站和 Glapp 的免费版，美国复方药的法律空间在收窄，PRD 第 1.4 节明确不做。
- **不主动要多种肽类和未获批药物的用户。** 评论里声量不小（21 条），但自定义药名已经能让他们自己记；目录里不列未获批的药。
- **不把糖尿病、西语、男性、年长用户当成英文区的定位。** 可以做的只是顺手的事：一个可选的血糖或 A1C 字段、给医生的报告、不默认用户是女性的文案。
- **不用 AI 批量生成推广账号或内容。** DreamMe 的例子说明这条路有量也有一星评论，在一个对"AI 给医疗建议"敏感的人群里不值得。
- **不把英文区的任何数字写进 12 个月的收入预期。** 天花板表是"如果做到会有多大"，不是计划数；第一轮定下的"用激活用药者的绝对人数写节奏"在英文区同样适用。

### 3.4 对整份策略的一句话

"规模从哪里来"在英文区的诚实答案是：盘子在那里，路不在我们手里。能做的是让产品从第一天起就不挡路（双语、任意节律、按地区的目录），用自己找上门的英文用户来读信号，等中文滩头证明了"切换期的人留得住"、并且团队里有人真的成了某个英文社区的成员，再去招第一批英文内测用户。在那之前，英文区对我们的价值主要是一面镜子：头部在哪里被骂，我们就别在哪里犯同样的错。

---

## 四、没查到的

**头部动作**

- Shotsy 2026 年的融资、收购、团队人数、是否系统性投放广告（只有 1 条提到 Instagram 广告的评论）、官方披露的用户数和收入：没查到。第三方的下载和收入估算互相没有印证。
- MeAgain 种子轮的日期和投资方全名、投放规模、真实收入：没查到。第三方估算从每月不到 1 万美元到 65 万美元，差了近两个数量级。
- Glapp、Pep 的融资、团队和收入：没查到。
- WeightWatchers 最近 6 个月的 GLP-1 动作：没查到。Oura 收购 Counsel Health 的日期和出处、和 UC San Diego Health 试验的细节：只有搜索摘要里的一句话。MyFitnessPal"探索出售"只有维基百科条目转述。
- 苹果健康 App 在 iOS 26 和 iOS 27 里对针剂的具体支持（注射部位、剂量单位）：没查到原文；"没有自带的 GLP-1 记录"是"搜了没有"，不是"确认没有"。
- Sensor Tower、Appfigures、AppMagic 对这个品类的下载和收入数据：搜了一次，只返回二手转述。品类集中度只能用本地 12 款样本的评分人数推算。

**后来者**

- 最近 12–18 个月里"不买量、做到头名一成以上"的例子：搜了一次，没查到。
- 任何一位独立开发者公开的 GLP-1 记录 App 复盘（下载、收入、渠道）：没查到。收入核验站上那款月入 479 美元的 App 是谁做的、上架多久、靠什么渠道：页面打不开。
- Glowise、Lumi、Glippy、Pokii、GLP-1 Coach、Gila、HealthCount 的评分人数和上架日期：没有抓。
- DreamMe 是否付费投放：没查到；"评分靠弹窗催出来"是从评分和文字评论的比例推的。

**细分人群**

- 微剂量、拆针、拉长间隔这些用法在用药者里的比例：没查到。CDC 2025 年调查（MMWR 第 75 卷第 44 期）的标题里有这一项，原文打不开。
- 复方药用户现在的人数：150 万、200 万、620 万三个数口径和年份都不同，没有一个是 2026 年的调查数。
- 各 subreddit 的成员数、r/tirzepatidecompound 的规模和增长：没查到。
- 确诊糖尿病的成年人数、65 岁以上人口、西语裔成年人数：没有检索，表里用的是常识数字并已注明。KFF 的性别和年龄分布只有二手页转述，"9%"是正在用还是曾用过不清楚。
- 西语裔用药者里偏好西语界面的比例、任何西语的 GLP-1 记录 App、拉美市场的规模：没查到。Shotsy 的 17 种语言里有没有西语：没核对。
- 英国自费用药者的可靠人数（官方口径是"没有确切数据"）、英国本地的记录 App、Shotsy 等在英国区的评分人数、英国对处方药面向公众宣传的规定：没查到。加拿大、澳洲同样没查。
- 男性、年长用户在专用 App 用户里的占比：没有数据；评论不带人口信息。

**获客**

- r/Zepbound、r/Semaglutide、r/Ozempic、r/WegovyWeightLoss 的自我推广规则：搜了两次，没查到。r/Mounjaro 的规则来自第三方镜像站的搜索摘要，可能不是现行版本。各版对违规帖的实际处理：没查到。
- "GLP-1 tracker"等关键词在两个商店的搜索热度和难度、Apple Ads 的实际出价、Google Play 的排名因素：没查到。
- 按处境写的长尾词（一周两针怎么记、针换片怎么记）的搜索量：没查到。
- 从 Reddit 帖子到安装、从安装到留存的任何转化率：没有数据。文中的"现实转化"只有两个结果数（Glapp 八个月、Pep 二十五个月的评分人数）。
- TikTok 关于减重药内容的现行规定原文、执行情况：只有一篇报道的标题。
- AI 助手推荐作为发现渠道的规模：只有 1 条评论。

**方法上的限制**

- 所有网络事实取自搜索摘要，没有一篇原文打开读过。www.cdc.gov、thehiveindex.com、trustmrr.com 各试一次直接抓取，都不在本会话允许的网络范围内；apps.apple.com、reddit.com 等在前几轮已确认打不开，本轮没有再试。
- 评论语料只有美区、以英文为主、以 2026 年 7–11 月为主；小 App 的全部历史和头部最近 500 条放在一起比，速度口径不完全一致。
- "折合月收入"一列把评分人数按比例换成收入，假设很粗，只能读量级。

---

## 附：本轮的 12 次搜索

1. Shotsy GLP-1 tracker 2026 funding OR acquired OR "Series A" OR pricing OR "new feature"（加创始人姓名）
2. MeAgain GLP-1 app 2026 funding raised users revenue founders capybara
3. GLP-1 tracker apps 2026 downloads revenue Appfigures OR "Sensor Tower" OR AppMagic Shotsy MeAgain market share category
4. MyFitnessPal Noom WeightWatchers Oura GLP-1 feature launch acquisition announcement 2026 (June OR July OR August OR September OR October OR November)
5. KFF poll 2026 GLP-1 use share adults by gender age 65+ Hispanic diabetes vs weight loss compounded source where obtained
6. Apple Health Medications app GLP-1 injection tracking iOS 27 OR "iOS 26" injection site semaglutide tirzepatide feature
7. how many Americans use compounded GLP-1 semaglutide tirzepatide 2026 estimate million patients after FDA crackdown microdosing share survey
8. subreddit rules self-promotion app developers r/Zepbound r/Mounjaro r/Semaglutide r/tirzepatidecompound r/GLP1 tracker app posts removed moderators members
9. indie developer "GLP-1" tracker app "MRR" OR "revenue" OR "downloads" built solo no ads organic Reddit ASO 2026
10. "r/Zepbound" OR "r/Mounjaro" OR "r/Semaglutide" OR "r/tirzepatidecompound" self-promotion rules members "no self-promotion" OR "promotion" guide threadotter OR rankhog OR replyhey OR gummysearch
11. UK private Mounjaro Wegovy users 2026 million people weight loss jabs estimate tracker app KwikPen clicks "golden dose" microdosing
12. Hispanic Latino adults GLP-1 use percent 2026 survey; app GLP-1 en español seguimiento de inyecciones Ozempic Mounjaro tracker Spanish-speaking users

本地分析用的脚本放在会话的临时目录里，没有入库；做的事情是按关键词正则在 `reviews.csv` 里数各细分人群、各发现渠道的命中条数，按 App 和月份统计评论数，以及用首尾评论日期算评论速度。所有引用的原话都逐条读过。

---

## 核查（独立核查员）

日期：2026-11-22。

**做法。** 我通读了全文；重跑了评论语料里和本笔记有关的计数（两个商店的评分人数占比、各 App 的月度评论数和评论速度、非每周用法、复方与单位、发现渠道、四类人群），逐个查了原文引用的 33 个评论 ID；和第一轮汇总（`00_digest.md` 第 4、5、10、11 节）、`a-competitors-search.md`、`c-business-compliance.md`、`gap_non_mainland_market_size.md`、`store-reviews/summary.md`、PRD，以及同一轮专题十的核查对了一遍；用了 5 次搜索（上限 5 次），关键词列在本节末尾。我查到的网络事实同样只来自搜索结果的标题和摘要，没有打开原文，对外引用前要再核。

**总评：可靠度中等。** 本地数据这一半是扎实的：33 个评论 ID 全部存在，App、商店、星级、日期和原话都对得上；评分人数占比、月度评论数、评论速度、发现渠道和四类人群的条数，我重跑的结果和原文一致。问题出在三处。第一，把存量当成了现状（Pep 在安卓的 15%）。第二，非每周用法这一条只引了少数反向证据，实际上反向证据比正向的多。第三，"结论"一节把上限口径的收入数当成了可以拿来比较的中心值，并且低估了英文版的成本。网络事实和原文一样，全部停在搜索摘要这一层。

下面挑了 6 条对后来者策略影响最大的结论来判定：1 条成立，5 条部分成立。

### 判定一：两家头部握着九成评分

**原文说法：** 12 款专用 App 里，Shotsy 和 MeAgain 合计占美区 App Store 评分人数的 92.4%、Google Play 的 83.8%；其余 10 款里 6 款不到 300 个评分，其中 2 款为 0；一页结论据此写"用户在向两家集中"。

**判定：holds（数字成立，读法要收窄）。**

理由：

- 我按 `store-reviews/summary.md` 第 1 节重算：App Store 合计 82,777，两家 76,489，占 92.4%；Google Play 有评分的 5 款合计 20,547，两家 17,215，占 83.8%；不到 300 个评分的是 6 款，其中 2 款为 0。都对。按头名的 1% 划线，10 款里有 7 款在线下（Free.Well 是 0.9%）。
- 用同一时间窗的评论流量再算一次，结论不变：2026-08-25 到 11-17 的 App Store 评论里两家占 91.7%，2026-09-08 到 11-17 的 Google Play 评论里两家占 86.0%（推算）。
- 但这是"12 款样本里的占比"，不是品类集中度。原文和我的搜索里又出现了二十多个样本以外的专用 App（Glowise、Lumi、Pokii、GLP3 Planner、GlucoPal 的 Mounjaro Tracker、Weightly、Flux、GLPify、GLP Pal、GLP1-GO、Akoma 等），它们的评分人数一个都没抓。其中 Glowise 被第三方估到每月 1.5 万美元，和原文的第二梯队同级。所以"第二梯队只有三家"没有依据，真实的中间层可能更挤。
- "在向两家集中"是趋势说法，而数据是 2026-11-19 的一次快照，没有时间序列。存量占比（92.4%）和近三个月的流量占比（91.7%）几乎一样，看不出是在继续集中还是在分散。另外，用 MyFitnessPal、Noom、礼来自带工具记针的人不在这个分母里。

修正后的说法：在本地抓取的 12 款专用 App 里，Shotsy 和 MeAgain 握着九成左右的评分存量和近三个月的评论流量；样本外还有二十多个没有抓评分的同类 App，品类层面的集中度和变化方向没有数据。

对策略的影响：基准预期不变，只会更低。一个新入场的专用 App 默认落在头名的 1% 以下。

### 判定二：不买量的后来者，最好成绩是头名的 3%–4%（iPhone）到 15%（安卓）

**原文说法：** Glapp 约 8 个月做到 Shotsy 评分人数的 3.1% 和 3.9%；Pep 约 25 个月做到 2.8%（App Store）和 15.2%（Google Play）；两家月度评论数都是冲高后回落；并由此推出"安卓比 iPhone 松，先做安卓更有可能排得上"。

**判定：partly。**

理由：

- 存量数字和月度评论数我重跑后全部一致（Glapp 2026-03 到 11 月为 6、12、49、73、20、13、37、16、13；Pep 2025-09 到 12 月为 18、35、39、21，2026-10 为 4）。"没有一家持续加速"成立。
- Pep 的 15% 是旧存量，不是现状。Pep 在 Google Play 的 162 条评论里有 98 条写于 2025-09 到 2025-12 这四个月。按同一时间窗（2026-09-08 到 11-17）比评论流量，Pep 在 Google Play 是 Shotsy 的 3.5%（7 条对 200 条），和它在 App Store 的 2.5%（9 条对 358 条，2026-08-25 到 11-17）差不多。"安卓一侧更松"在 Pep 身上只是上线头四个月的一次性高点。
- Glapp 则被存量口径低估了。同样的时间窗里，Glapp 的评论流量是 Shotsy 的 12.6%（App Store，45 条对 358 条）和 10.5%（Google Play，21 条对 200 条）。这和第一轮核查"按月摊开约为 Shotsy 的一成"一致。第一轮"核查后必须改"的第一条已经写明不能把 3%–4% 当成这种打法的成绩上限，一页结论第 3 条又用回了存量口径。反过来也要留意：Glapp 的用户更爱写评论（评论数是评分人数的 12%–20%），所以"一成"也可能偏高。
- "不买量"是没查到，不是查到没有。Glapp 和 Pep 有没有投放，全文没有任何来源。Pep 有 1 条评论说功能"和宣传的不一样"（Google Play，1★，2026-01-02，1f3ad609），指的是商店页还是广告分不清。
- Pep 不是"最近 12–18 个月进场的后来者"。它的 iPhone 版在 2024-10 上架，只比 Shotsy 晚四个多月。它在 App Store 做了 25 个月只有头名的 2.8%，这是"几乎同时起步、没有社区位置"的结果，比"后来者"的读法更差。

修正后的说法：没有查到投放证据的后来者里，Glapp 的评分存量是头名的 3%–4%，近三个月的评论流量约为头名的一成，两个商店差不多；Pep 的近期流量在两个商店都只有头名的约 3%，它在 Google Play 的 15% 是 2025 年秋天上线时攒下的。两家都没有持续加速。现有数据不支持"安卓比 iPhone 容易"。

对策略的影响：3.2 节"原生安卓壳先于 iPhone"不能拿 Pep 的 15% 当理由，只能看我们自己用户的机型和留存。Glapp 这个参照要同时写两个数，并注明它靠的是"核心免费"加"复方药和西林瓶"这个单点，这两样我们都不打算给。

### 判定三：收入折算，以及"英文的普通结果约等于中文的最好结果"

**原文说法：** Shotsy 月收入约 20 万美元除以两店评分 48,622，每个评分约 4.1 美元每月；第二梯队折合每月约 0.5–2 万美元，长尾不到 1,500 美元；英文区做到 Shotsy 的 1.5% 就是每月 3,000 美元，超过中文区同等渗透的 900–1,750 美元；所以英文的"普通结果"约等于中文的"最好结果"，英文的"好结果"是中文天花板的 5–10 倍。

**判定：partly（算术成立，推论不成立）。**

理由：

- 算术我重算过，都对：每个评分 4.11 美元；Glapp 约 6,700、Pep 约 12,400、DreamMe 约 17,800、Free.Well 约 1,400 美元；3,000 美元对应约 730 个评分，即 1.5%。
- 底数只有一个第三方估算，而估算之间差 30 倍。我的搜索返回的数是：AppGoblin 估 iPhone 端每月 1 万美元出头（月活约 15.4 万），Adapty 估约 30 万美元；原文用的 20 万来自 Similarweb 经 App Masters（都是搜索摘要，方法不明）。换成这三个底数，第二梯队分别是每月约 300–900 美元、0.7–1.8 万美元、1–2.7 万美元（推算）。全文唯一经过核验的同类小 App 收入是 30 天 479 美元。
- 评分是累计存量，收入是当月流量，相除再乘回去，对走下坡的 App 会高估。Pep 的存量折出每月 1.2 万美元，但它近期的评论流量只有头名的约 3%，按流量折是约 6,000 美元。Glapp 核心免费、2026-06 才开始收费，原文自己也写了实际收入"应当明显低于表里的数"。
- "普通结果"这个词用错了地方。按原文 5.1 节的表，多数入场者在头名的 1% 以下，每月 0–1,500 美元，而且是上限口径。1.5% 这条线在样本里只有 3 家越过，这 3 家都有原生 App，做了 8–25 个月，样本又是按"看得见"选的。所以英文区的中位结果不是 3,000 美元，而是不高于中文区的参照值（900–1,750 美元），很可能只有几百美元。
- "中文的最好结果"也不是最好结果。900–1,750 美元是"做到 Shotsy 在美国的渗透率"这个参照值，补查给的区间上限约 3,300 美元。它用的是"月活 35 万、付费 10 万"这组数，汇总第 10 节已经把这组数降为"自述、未核实，不进入任何判断线"。两边都压在没有核实的 Shotsy 数字上，"5–10 倍"是两个上限口径相除，没有精度。

修正后的说法：按自报在用人数，美国的盘子约是大陆以外中文区的两百倍，这一点不依赖任何收入估算。但按现有样本，英文区多数入场者的月收入不高于中文区的参照值；只有进到样本的前三成，并且是在有原生 App 和社区身份的前提下做了 8–25 个月，才到每月几千美元的量级。再往上的数字没有可靠的底数。

对策略的影响：英文可以写成"唯一有规模的方向"，不能写成"期望值更高的方向"。天花板表里的美元数不进入任何计划、对比或止损线。要比较中文和英文，用"激活用药者的人数"比，不用美元比。

### 判定四：最近 6 个月没有谁吞掉品类，但免费的底线抬高了

**原文说法：** iOS 27 没有更新用药接口，没有查到苹果自带的 GLP-1 记录；MyFitnessPal（2026-04-28）和 Noom（2026-06-24）把 GLP-1 记录免费给所有人；一年里没有记录工具被收购，资本没有流向这一层。

**判定：partly。**

理由：

- 日期和本地材料一致（`a-competitors-search.md` 第 14、133 行，`c-business-compliance.md` 第 186、188、432–435 行）。我的一次搜索没有找到任何 GLP-1 记录 App 被收购的报道，返回的全是 App Store 上的同类 App 页面；第一轮 `c-business-compliance.md` 第 452 行同样写"没有找到"。两轮都是"搜了没有"，不是"确认没有"。
- 地区口径漏了一处。MyFitnessPal 的 GLP-1 Support 只对美国用户开放（第一轮两份笔记都写了"仅美国"），原文写成"免费给所有人"。这对切入点二有影响：美国以外的英语用户面前没有这条免费底线。
- "苹果没有进场"有保质期。我的搜索显示，重新设计的健康 App 在 2026-09 还处在 iOS 27.2 的测试版里，有报道说它不会随 27.2 正式发布，要到今年晚些时候才上线；另有两篇报道的标题说新版健康 App 能预约验血、要把 iPhone 变成远程医疗的入口（只有标题，未核实）。没有任何一条提到自带的打针或注射部位记录。准确的说法是"到 2026-11 为止没有查到"，而且苹果正在这个方向上动。
- "资本没有流向记录工具"说得略满。两家头部都拿过种子轮（225 万美元和自述的 500 万美元），同一年新增至少 568 个同类 App。更准确的是"没有查到种子轮之后的融资，也没有查到收购"。

修正后的说法：到 2026-11 为止，没有查到苹果自带的 GLP-1 记录，也没有查到记录工具被收购；苹果的健康 App 改版还没有正式发布。基础记录在美国已经由 MyFitnessPal（仅美国）、Noom 和卖药方的 App 免费提供。

对策略的影响：方向不变（"记一针"收不到钱；被收购只能当假设）。要加一个每季度复查的项目：苹果健康 App 改版正式发布后有没有针剂记录。

### 判定五：不按"每周一针"走的人是三家头部共同的缺口（切入点一的依据）

**原文说法：** 这类用法在专用组有 11 条评论，其中 5 条是明确的"做不到"（Shotsy 2、MeAgain 1、Glapp 2），另有 1 条 Shotsy 用户说这种用法下记录丢失；这是三家头部同时被点名的唯一一类缺口。

**判定：partly。**

理由：

- 原文引的原话都在，逐字对得上。但我用更宽的关键词重数，专用组里相关的评论至少有 17 条，原文漏掉的主要是反方向的。
- Shotsy 一侧，说"做得到"的有 7 条，说"做不到"的只有 2 条。7 条是："it works with twice weekly dosing"（App Store，5★，2026-10-09，1464857378）；"So many options from custom dosing to split dosing to reverse dosing"（App Store，5★，2026-08-29，1448613586）；"Great for micro dosing GLP-1 meds"（App Store，5★，2026-08-01，1437504035）；"decided to split the dose every 3 to 4 days"（Google Play，5★，2026-10-27，1f1b4510）；"I loved it when taking injections (even twice a week ones)"（Google Play，4★，2026-09-27，b6542ec4）；"It works perfect for tracking my shot with split dosing and compound dosage variations"（App Store，5★，2026-10-12，1465973362）；以及原文已引的 1472564831。原文只引了其中 1 条，并且把 1465973362 只算进了"求单位换算"。安卓上那条"can't set dosage for twice a week"（ba1e296d）和两天后另一位安卓用户的说法（b6542ec4）正好相反。
- "记录丢失"那一条不能算在这类用法头上。原话后半段是"For a year and a half of using this app I never had this problem and now it does it almost every time"。也就是说，每 4 天一针的记法用了一年半没有问题，出事是在 2026 年 9–10 月，和第一轮查到的 Shotsy 数据事故是同一段时间。
- 真正被点名"排不了"的是 Glapp：2 条说不能按固定星期几排两针，另有 1 条说计划功能只支持固定剂量和固定的每周间隔（App Store，4★，2026-11-07，1476224811）；同时也有 1 条 Glapp 用户说拆针时药量估算很有用（App Store，5★，2026-09-25，1459248539）。而 Glapp 不是头部，按原文自己的表它是头名的 3%–4%。MeAgain 是 1 条提问对 1 条"做得到"。
- 所以全部证据是 2,083 条里的 6 条"做不到"，其中一半在 Glapp。这类用法在用药者里的比例没查到（原文已写）。

修正后的说法：拆针、一周两针、每 3–4 天一针这类用法，评论里说 Shotsy 做得到的（7 条）多于说做不到的（2 条）；被明确点名排不了固定星期几的是第二梯队的 Glapp（3 条）。它是一个应当写进验收清单的用例，不是头名留下的缺口。

对策略的影响：切入点一不能再用"三家头部都被点名"当理由，对外也不能说"别家接不上你的用法"。3.1 节第 2 条（把两个用例加进验收清单）可以保留。另外，按原文自己的数，这个窗口"可能只有一两个季度"，而 3.2 节的三条启动信号最快也要半年以上才能同时满足；等到能启动的时候，缺口多半已经不在了。

### 判定六：产品从第一天双语、获客先中文后英文，以及切入点二（英国等地）

**原文说法：** 英文界面的成本接近零；英文获客唯一有效的路是先当几个月社区成员，所以排在中文之后，由三条信号触发；美国以外的英语用户是第二个切入点，产品成本只有英文界面、当地商品名和体重单位三件事。

**判定：partly（先后顺序成立，成本和信号偏乐观）。**

理由：

- 先后顺序本身站得住：团队没有英文社区的成员身份，网页版没有商店搜索，这两条是事实。
- "成本接近零"只对界面文案成立。PRD 第 0 节写的是"英文只用在给医生的报告里"；第 3.5 节的问答是"用中文回答"；第 2.2 节"今天这样过"的卡片文案是事先写好并审核的；第 4.3 节要求附录 B、C 和蛋白公式经医生或药师审核后才能发布。PRD 第 6 节自己写了：代码一天能写完，占日历时间的是内容审核、评测集标注、隐私和条款页面。英文版这三件都要再做一遍。面向美国用户，还要补 `c-business-compliance.md` 第 3.5 节列的单独的消费者健康数据隐私政策、分步同意和 60 天通报预案。美国用户常要的复方和单位换算又在 PRD"明确不做"里（专题十的核查已指出）。
- 启动信号（二）会被污染。原文 3.1 节建议"语言跟随浏览器"，而在英语国家的华人，浏览器多半是英文的。只做中文渠道时，"选英文界面的激活用药者占 15%"很可能由双语华人触发，测到的不是英文市场的需求。反过来，没有任何英文渠道时，真正来自英文市场的人接近零（专题十一的核查对印度测试提过同样的问题）。这个信号要改成"来源不是中文渠道、地区在英语国家"的人数。
- Reddit 这条路的入口仍然没有查清。我搜了一次，r/Zepbound 的规则还是没有拿到；r/Mounjaro 的规则在两个第三方镜像站上摘要一致（禁止利用该版推广或招揽任何内容，禁止讨论复方），但仍然不是 Reddit 原文。如果这条规则现行有效，"招揽"也包括招内测。原文 4.3 节写"Shotsy 当年发的是招内测，不是发产品"也不准确：`reddit.csv` 里那条帖子的原话是"is now available on the iOS App Store"，是一条上架公告。它只能说明 2024 年的 r/Zepbound 容得下成员发上架帖，说明不了现在。"Reddit 是唯一有效的渠道"是排除法得出的；评论里写明从 Reddit 来的 8 条里有 5 条去的是 Shotsy，这条渠道现在主要在给头名送人。
- 英国不是空地。原文写英国本地的记录 App"没查到"。我的一次搜索返回了：一个自称专为英国用户设计的网页版加 iPhone 记录工具 DoseDiary；至少 4 个以 Mounjaro 命名的记录 App（Flux、Weightly、Mounjaro Care、GlucoPal 的 Mounjaro Tracker）；一个英国域名的"Mounjaro 记录 App 对比页"（站方在推自己的工具）；Shotsy 在澳洲区在架，Glapp 也出现在结果里（都是搜索摘要，各家的评分人数没查到）。原文说英国约八成自费者用 Mounjaro，这些 App 正是冲着这一点起的名字。
- 切入点二的产品成本也不止三件事。原文第 11 次搜索的关键词里有"clicks"和"golden dose"，正文没有交代结果。按我的背景知识（没有检索），英国的 Mounjaro 用户里流行按笔的"咔哒数"取非标准剂量，这正落在 PRD 第 1.4 节"数格子、剂量换算"的不做范围里。英国对处方药面向公众宣传的限制，原文已写明没有查。

修正后的说法：产品从第一天带英文界面是合理的，但它的成本是"英文安全内容再审一遍、英文评测集、美国的隐私文件"，不是零；这三件做完之前，英文界面只应当给已经进来的用户选，不对外推。英文获客排在中文之后成立，但触发信号要按来源和地区重写。英国等英语地区已有本地的记录工具，只能当"目录顺手覆盖"，不能当切入点。

对策略的影响：3.1 节第 1 条要加上"英文安全文案和知识库的审核"这个前置条件。3.1 节第 4 条的人工核对要把 DoseDiary 和几个以 Mounjaro 命名的 App 一起看。5.2 节的"最有胜算的两个切入点"应改成"一个验收用例和一个待核对的假设"。

### "结论"一节的更保守读法

把上面的修正合起来，原文 5.1–5.4 节在三个地方替英文路径说了好话：

- **规模。** 原文：第二梯队每月约 0.5–2 万美元，是中文天花板的 5–10 倍。保守读法：这是三家有原生 App、有社区身份的对手做了 8–25 个月的上限口径，底数取自相差 30 倍的第三方估算里偏高的一头。对一个没有英文渠道的网页版后来者，中位结果是头名的 1% 以下，每月几百美元以内，不高于中文区的参照值。
- **成本。** 原文：英文界面成本接近零，切入点二只要三件事。保守读法：英文版要重做内容审核、评测和美国隐私文件。要进第二梯队还需要原生 App，以及一个人连续几个月泡在英文社区里；对 1–2 人的团队，这等于从中文冷启动里抽走一大块人力。
- **时间。** 原文没有给总时长。保守读法：三条启动信号（切换状态的用户 30 人并读到第 8 周留存、12 周的自然英文用户、三个月的社区身份）最快也要发布后 6–9 个月才能同时满足（推算）。Glapp 从原生 App 上架到现在的位置用了 8 个月，Pep 用了 25 个月。所以英文区即使顺利，看到每月几千美元也是发布后两年左右的事，而原文认定的非每周用法窗口只有一两个季度。

原文 3.3 节"不把英文区的任何数字写进 12 个月的收入预期"是对的，可以再进一步：24 个月内也不写。

### 其余承重结论（没有逐条判定，只记重跑结果）

- **复方和单位换算。** 条数大体复现（Shotsy 的 4 条请求都在；按我的宽口径，Glapp 有 29 条评论提到西林瓶、库存或计算器）。620 万是"2025 年用过的人里用过复方的"，属于曾用口径，和"现在约 150 万"不是同一种数，不宜并成"150–600 万的盘子"。"不当切入点"的结论不依赖这个数，可以保留。
- **对比类搜索词饱和。** 我的 5 次搜索返回的也几乎全是 App 商店页、估算站和站方自己写的对比页，和原文的观察一致。"新域名排不上去"是推断，没有任何排名数据。
- **四类人群。** 条数完全复现（糖尿病 4 条提及、其中 2 条是请求；自报年长 4 条；睾酮替代 1 条；西语评论 1 条）。人数的分母原文已注明是常识数字。"评论里没有"只能说明已经在用这些 App、又愿意写英文评论的人没有提，对没有在用的人（尤其是西语用户）什么也说明不了。原文第 4 条限制已经写了这一点，结论里应当保持同样的措辞。
- **发现渠道。** Reddit 8 条、广告 3 条、亲友 3 条、TikTok 2 条、AI 助手 1 条，都复现。

### 制定策略的人必须知道的五条修正

1. "英文区的普通结果约等于中文区的最好结果"不成立：按原文自己的表，多数入场者在头名的 1% 以下，折合每月 0–1,500 美元而且是上限口径，不高于中文区的参照值 900–1,750 美元；收入折算的底数又是相差 30 倍的第三方估算里的一个，所以英文区对我们的中位预期应写成"每月几百美元以内"，天花板表里的美元数不进入任何计划或对比线。
2. "安卓比 iPhone 松"的主要依据（Pep 在 Google Play 是 Shotsy 的 15%）是 2025 年秋天攒下的存量：按最近 70 天的评论流量，Pep 在 Google Play 只有 Shotsy 的约 3.5%，Glapp 在两个商店都是约一成，所以"先做安卓"不能凭这个数来定，Glapp 的参照值应写成"存量 3%–4%、近期流量约一成"。
3. 切入点一的证据比原文写的弱：评论里说 Shotsy 能记拆针、一周两针、每 3–4 天一针的有 7 条，说不能的只有 2 条，被明确点名排不了的是第二梯队的 Glapp，所以它只能当我们自己的验收用例，不能当从头名手里拉人的理由。
4. "英文界面成本接近零"只对界面文案成立：英文的分诊规则、应对卡和知识库要再经医生或药师审核，还要补英文评测集和美国的消费者健康数据隐私文件；"选英文界面的用户占 15%"这个启动信号会被浏览器是英文的海外华人触发，要改成按来源和地区统计。
5. 切入点二（英国等地）不是空地，苹果也不是确定不进场：一次搜索就查到面向英国用户的记录工具 DoseDiary 和至少 4 个以 Mounjaro 命名的记录 App；MyFitnessPal 的免费 GLP-1 记录只在美国提供；苹果重新设计的健康 App 到 2026-09 还在测试版里，没有查到针剂记录只是到 2026-11 为止的情况。

### 本次核查的 5 次搜索

1. Shotsy GLP-1 tracker app monthly revenue downloads estimate 2026 MeAgain Glapp Pep market share —— https://adapty.io/paywall-library/shotsy-glp-1-tracker/ ；https://appgoblin.info/apps/6499510249 ；https://www.appbrain.com/dev/Shotsy/
2. iOS 27 Health app Medications GLP-1 injection site tracking weekly injection new feature —— https://www.macrumors.com/guide/ios-27-health-app/ ；https://macrumors.com/2026/09/16/ios-27-2-beta-health-app ；https://9to5mac.com/2026/09/16/ios-27-2-introduces-apple-health-app-overhaul-heres-wha ；https://www.digitaltrends.com/phones/apples-health-app-is-a-proper-health-dashboard-it-can-even-book-your-blood-work/ ；https://wccftech.com/ios-27-will-transform-the-apple-iphone-into-a-telehealth-powerhouse/amp/
3. GLP-1 tracker app acquired acquisition 2026 "GLP-1 tracking app" acquires medication tracker startup —— 没有返回任何收购报道，返回的是约 20 个同类 App 的 App Store 页面，例如 https://apps.apple.com/app/id6751098658 ；https://apps.apple.com/app/id6749314641 ；https://apps.apple.com/app/id6766524031
4. r/Zepbound subreddit rules "self-promotion" OR "no advertising" OR "solicitation" app developers surveys rule list —— https://reddit.rtrace.io/r/Mounjaro/wiki/index ；https://pol1.lr.ggtyler.dev/r/Mounjaro/wiki/index ；https://thehiveindex.com/communities/r-mounjaro/
5. UK Mounjaro tracker app 2026 best GLP-1 tracking app UK KwikPen stone NHS Shotsy UK alternative —— https://monj.co.uk/mounjaro-tracker-apps/ ；https://apps.apple.com/app/id6759365748 ；https://apps.apple.com/app/id6743134664 ；https://apps.apple.com/app/id6756684818 ；https://apps.apple.com/py/app/zepbound-tracker-by-glucopal/id6670317407?l=en-GB ；https://apps.apple.com/au/app/shotsy-glp-1-tracker/id6499510249

本地重算用的脚本放在会话的临时目录里，没有入库；做的事情是按 App、商店和月份统计评论数，在同一时间窗里比各家的评论流量，按关键词正则重数非每周用法、复方与单位、发现渠道和四类人群的命中条数，并逐个核对评论 ID。
