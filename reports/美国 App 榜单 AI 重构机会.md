# AI 正在拆解美国 App 榜单的人工内容层

在美国 App Store，AI 重构机会最大的不是"把人工内容换成更便宜的 AI 内容"这件事本身，而是三种结构。第一种是按集付费的连载内容：有声剧、短剧、网文、可玩短剧。第二种是轻监管的一对一人工建议，原本每月 $150–$300，现在可以压到 $10 左右：细分语言口语、健身私教、占星与灵性解读、职业考试题库、饮食记录。第三种是价格锚高、不需要执照的一次性人工服务，例如职业头像、商品图和垂直场景速记。本报告用六个维度给 38 个细分品类打分，前五名是：连载有声剧（84 分）、AI 短剧（81 分），以及同为 78 分的细分语言口语、AI 健身私教和占星/灵性解读。垫底的有两类：一类是通用助手或系统已经免费给出同等结果的品类（新闻摘要、行程规划、天气、导航、清理/扫描工具）；另一类的价值锁在版权、网络效应或执照里（授权有声书、音乐收听、约会、投资顾问）。大背景是钱确实在从人工内容流向 AI。2025 年美国非游戏 App 消费 **$33.6B，同比 +26.8%**（[TechCrunch](https://techcrunch.com/2026/01/14/app-downloads-declined-again-in-2025-but-consumer-spending-soared-to-nearly-156b)）；截至 2026-11-07，ChatGPT 已**连续 54 天位居美国畅销总榜第一**（[Applyra](https://www.applyra.io/tools/top-charts/app-store/us/overall/grossing)）。但新增价值的大头被通用助手拿走。Chegg 的人工题库被 ChatGPT 和 Google 免费替代，接手它的不是另一个垂直 App。对小团队而言，真正的约束是获客和留存，不是内容成本：AI App 每个付费用户多赚约 41%，流失却快约 30%（[PPC Land](https://ppc.land/ai-apps-earn-41-more-per-user-but-churn-30-faster-revenuecat-finds/)）；新 App 只有 4.6% 能在两年内做到 $1 万月收入（[Subscription Insider](https://www.subscriptioninsider.com/blog/revenuecat-data-shows-subscription-app-growth-concentrating-at-the-top-news)）。所以最值得做的组合是：AI 生成的内容，加上习惯闭环或按集付费墙，再放进一个通用助手不愿做的细分场景。

> **阅读须知**：本报告综合了 7 份研究笔记（2026-11-19 汇编）。笔记作者无法直接打开 Sensor Tower、Appfigures、TechCrunch、SEC、a16z 等多数原始页面，绝大多数数字来自搜索结果摘要，而不是完整的原始文件。第三方收入数据都是估算，各家口径不同（毛收入或净收入、美国或全球、仅 iOS 或双平台），多处互相冲突。排行榜分数是基于这些笔记的分析判断，不是统计模型。笔记中标注为 "UNVERIFIED" 的背景知识清单（例如各品类头部 App 地图）没有被当作事实使用。详见文末"数据局限"一节。

## 美国 App 消费正在从人工内容转向 AI，但新增价值的大头落进了通用助手

2025 年美国仍是全球最大的 App 市场，Sensor Tower 估算其消费"接近 $600 亿"（[Sensor Tower](https://sensortower.com/blog/q4-digital-market-index-app-2026)）。按 Appfigures 口径，美国**非游戏 App 消费 $33.6B，游戏 $21.9B**（[TechCrunch](https://techcrunch.com/2026/01/14/app-downloads-declined-again-in-2025-but-consumer-spending-soared-to-nearly-156b)），非游戏约占美国 App Store 消费的六成。全球非游戏 IAP 达到 $85.6B，首次超过游戏的 $81.8B，增量来自生成式 AI、社交、视频流媒体和生产力工具（[AdTechEdge](https://adtechedge.com/news/mobile-app-spending-hits-167b-in-2025-as-generative-ai-apps-surge-says-sensor-tower/)）。2025 年生成式 AI App 的 IAP 增长近两倍，**超过 $5B**（[Sensor Tower](https://sensortower.com/press/sensor-tower-state-of-ai-2026-report-global-time-spent-on-generative-ai-apps-projected-to-more-than-double-year-over-year)）；2026 年第二季度又同比增长 108%，是非游戏增长的主要来源（[MacTrast](https://www.mactrast.com/2026/08/non-gaming-apps-drove-mobile-spending-growth-in-q2-games-spending-not-so-much/)）。

这些新增的钱高度集中。AppCurrents 估算 ChatGPT 在美国的月收入为 $28M–$94M；排第 10 的 Claude 为 $4.2M–$14M（[AppCurrents](https://appcurrents.com/charts/us)）。2026 年 4 月，ChatGPT 全球移动端消费约 $301M，是 Gemini、Claude、Grok、Copilot、Perplexity 五家合计（约 $138M）的两倍多（[Appfigures](https://appfigures.com/resources/insights/chatgpt-ai-chatbot-revenue-rivals)）。笔记据此推算，AI App 在 2025 年约占美国非游戏消费的 6–7%，2026 年可能升到 10–12%。这是推算值，没有任何供应商发布过美国口径的 AI 占比。垂直 AI 的体量则小得多：AI 陪伴整个品类 2025 年全球约 $120M（[TechCrunch](https://techcrunch.com/2025/08/12/ai-companion-apps-on-track-to-pull-in-120m-in-2025)），Sora 上线三个月后就掉出了美国 iOS 前 100（[TechCrunch](https://www.techcrunch.com/2026/01/29/openais-sora-app-is-struggling-after-its-stellar-launch/)）。

榜单上的"人工内容"生意正在被侵蚀，但侵蚀者通常不是另一个垂直 App。Chegg 的产品是付费专家写的分步解答。它在 2025 年先后裁员 22% 和 45%（[CO/AI](https://getcoai.com/news/edtech-takes-the-f-as-chegg-cuts-22-of-workforce-due-to-ai)；[Fox Business](https://www.foxbusiness.com/technology/chegg-lay-off-45-workforce-ai-google-traffic-shifts-batter-business)），2026 年第三季度收入只剩 **$46.5M，同比 −40%**，学术服务正在关停（[Morningstar](https://www.morningstar.com/news/globe-newswire/9868915/chegg-reports-third-quarter-2026-earnings)）。同一时期，ByteDance 的 Gauth 一度连续六天登上美国教育类下载榜第一（[FoxData](https://foxdata.com/en/blogs/bytedances-gauth-ai-study-companion-dominates-2025-us-education-charts-as-top-ai-homework-helper/)），但 2024 年截至 9 月的净收入只有约 $2.3M（[Appfigures](https://appfigures.com/resources/insights/20240920?f=2)）。被摧毁的价值主要流向了 ChatGPT、Gemini 和 Google AI Overviews 这类免费入口。

新进入者的胜率本来就低。RevenueCat 数据显示，2026 年 1 月每月新上架的订阅 App 超过 14,700 个（[RevenueCat](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)），但只有 4.6% 能在两年内做到 $1 万月收入；2020 年以前上线的 App 拿走了 69% 的订阅收入（[Subscription Insider](https://www.subscriptioninsider.com/blog/revenuecat-data-shows-subscription-app-growth-concentrating-at-the-top-news)）。AI App 首单转化更高（试用转付费中位数 8.5%，非 AI 为 5.6%）（[Geoly](https://www.geoly.ai/blog/ai-apps-retention-revenuecat-report)），但年付留存只有 **21.1%，非 AI 为 30.7%**，退款率也更高（[PPC Land](https://ppc.land/ai-apps-earn-41-more-per-user-but-churn-30-faster-revenuecat-finds/)）。所以评估"AI 重构机会"，不能只算人工成本能省多少，还要看替代品能不能卖出去、留得住、会不会被通用助手顺手做掉。下面的打分体系就是从这里出发的。

## 六维打分把 38 个细分品类排成一张机会榜

Apple 的原始分类会误导判断。YouTube 和 Instagram 被归在 Photo & Video（[Sensor Tower](https://sensortower.com/blog/2025-q4-ios-top-5-photo-and-video-units-us-615c8a30ad269d38a8b6acd0)），ChatGPT 在 Productivity 畅销榜排第一（[Marlvel](https://marlvel.ai/rankings/us/ios/productivity-grossing/2026-03-17)），一个分类里常混着几种完全不同的生意。因此本报告把 26 个 App Store 分类拆成 38 个按"替代哪种人工"划分的功能型细分品类。SVOD 流媒体（HBO Max、Disney+）、社交平台（TikTok、YouTube）和 AI 助手本身不参与评分：前两者的价值在 IP 版权或用户网络，本轮没有收集它们被 AI 替代的证据；AI 助手是"吸收者"，不是"被替代者"。

**评分维度与权重**（每项先按 1–5 分打分，再按权重折算，满分 100）：

| 维度 | 权重 | 5 分代表 | 1 分代表 |
|---|---|---|---|
| A 人工可替代度与价差 | 25 | 产品价值主要由人工生产，AI 已经"够用"，人工价格锚远高于 AI 成本 | 价值来自原创报道、版权、网络效应，或本来就几乎没有人工 |
| B 美国已验证的付费池 | 15 | 有来源显示美国 IAP 或订阅池达数亿美元且在增长 | 主要靠广告或佣金，或者规模不明、正在萎缩 |
| C 平台吸收风险（反向计分） | 20 | ChatGPT、Gemini、Apple 系统功能和在位者都难以直接提供同等产品 | 通用助手或系统已经免费提供同等结果 |
| D 监管与信任壁垒（反向计分） | 10 | 无牌照要求，法规轻 | 有州法禁令、FDA、COPPA、UPL 或版权诉讼等硬约束 |
| E 留存与变现机制 | 15 | 有按集解锁、年付或强习惯闭环 | 一次性需求、低频，或只能靠广告 |
| F 小团队可执行性 | 15 | 不需要自研模型、牌照或独家数据，可以靠达人和 UGC 获客 | 需要资本、牌照、版权或自研模型 |

总分 = Σ（单项分 ÷ 5 × 权重）。同分时按证据强度排序。证据强度反映的是笔记中支撑该品类判断的来源质量：公司财报或监管文件为"高"，多家第三方估算为"中"，单一估算或缺乏数据为"低"。

**AI 重构/替代机会排行榜**

| 排名 | 细分品类 | A | B | C | D | E | F | 总分 | 证据 | 一句话判断 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 连载有声剧/音频小说 | 5 | 3 | 4 | 5 | 5 | 3 | **84** | 中 | Pocket FM 已验证模式，可按题材和语种切细分 |
| 2 | AI 短剧（奇幻/动画/漫剧、多语种、互动） | 5 | 5 | 3 | 4 | 5 | 2 | **81** | 中 | 美国最大的人工内容付费池之一；只做实拍拍不了的题材，比拼投放效率 |
| 3 | 细分语言口语陪练 | 4 | 5 | 3 | 5 | 4 | 3 | **78** | 中高 | Duolingo 已自我颠覆，只能打考试、职场、继承语等细分 |
| 4 | AI 健身私教 | 5 | 3 | 3 | 4 | 4 | 4 | **78** | 中 | 价差 10–25 倍且监管轻，难点在续费率 |
| 5 | 占星/塔罗/灵性解读 | 5 | 2 | 3 | 4 | 4 | 5 | **78** | 低 | 人工可完全替代、监管轻，但盘子小、数据弱 |
| 6 | 连载网文/言情小说 | 4 | 3 | 4 | 4 | 5 | 3 | **77** | 中 | AI 辅助写作已在 Galatea 跑通，文本还能改编成音频和视频 |
| 7 | 职业资格考试题库 | 5 | 2 | 4 | 3 | 3 | 5 | **77** | 低 | 被低估的高付费意愿品类，准确率是门槛 |
| 8 | 职业头像/商品图等摄影服务替代 | 5 | 3 | 2 | 5 | 2 | 5 | **73** | 中 | 已验证能让小团队赚钱，但正被通用图像模型商品化 |
| 9 | 饮食记录与营养教练 | 4 | 4 | 2 | 4 | 4 | 4 | **72** | 中 | Cal AI 已跑通并被收购，剩营养师和 GLP-1 用户等细分 |
| 10 | 可玩短剧/互动故事 | 4 | 2 | 4 | 4 | 4 | 3 | **71** | 低 | 旧视觉小说在萎缩，"短剧付费墙 + 选择 + 角色对话"的混合形态是空白 |
| 11 | 垂直场景 AI 速记与转写 | 5 | 3 | 2 | 3 | 4 | 3 | **69** | 中 | 人工已被替代，只剩原本有付费速记员的垂直场景 |
| 12 | 信仰与祈祷内容 | 3 | 2 | 4 | 3 | 4 | 4 | **67** | 低 | AI 可低成本生成，但权威与信任是护城河 |
| 13 | 书籍摘要/微学习 | 4 | 3 | 2 | 5 | 3 | 3 | **65** | 中 | 内容已商品化，比拼的是增长营销 |
| 14 | 冥想/睡眠/功能音频 | 3 | 2 | 3 | 5 | 3 | 4 | **64** | 中 | 优势在个性化而非价格，品类需求偏软 |
| 15 | 报税（AI 准备 + 人工签字） | 4 | 5 | 3 | 2 | 2 | 2 | **63** | 高 | 人工专家池约 $2.8B，但在位者本身就是"AI + 人工" |
| 16 | 在线课程/技能 | 4 | 3 | 2 | 4 | 3 | 3 | **63** | 中 | 讲师视频库可被替代，但流量正流向聊天机器人 |
| 17 | 心理咨询/治疗 | 5 | 4 | 2 | 1 | 3 | 2 | **62** | 高 | 价差最大，但州法、FDA 和责任风险最重 |
| 18 | AI 理财教练（含现金预支） | 3 | 4 | 4 | 2 | 4 | 1 | **62** | 中高 | 已验证，但本质是放贷生意 |
| 19 | 菜谱/膳食计划 | 3 | 2 | 2 | 5 | 3 | 4 | **60** | 中 | 菜谱内容没人付费，只剩"整理 + 规划 + 采购"工具 |
| 20 | 儿童教育 | 4 | 3 | 4 | 1 | 3 | 1 | **59** | 中 | COPPA、IP 授权、家长信任三重门槛 |
| 21 | 法律文书 | 4 | 3 | 3 | 1 | 3 | 2 | **58** | 高 | UPL 和 FTC 限制"AI 律师"，只能做文书 + 律师网络 |
| 22 | 音乐创作 | 4 | 4 | 3 | 1 | 3 | 1 | **58** | 中高 | Suno 已证明需求，但需要自研模型和唱片公司授权 |
| 23 | 作业解答/知识问答 | 5 | 2 | 1 | 3 | 2 | 3 | **56** | 高 | 已被彻底颠覆，价值归通用助手 |
| 24 | 设计模板 | 3 | 4 | 1 | 5 | 3 | 2 | **56** | 中高 | 模板已商品化，Canva 掌握分发 |
| 25 | 体育内容/梦幻体育研究 | 2 | 4 | 3 | 2 | 4 | 2 | **56** | 中 | 文字战报近乎零价值，钱在转播权和博彩 |
| 26 | 授权有声书/电子书 | 3 | 4 | 2 | 2 | 4 | 1 | **54** | 中 | 版权是护城河，Audible 自己在用 AI 旁白 |
| 27 | 约会 | 2 | 5 | 2 | 3 | 3 | 1 | **51** | 高 | 网络效应保护在位者，AI 只是功能 |
| 28 | 通用修图/视频剪辑 | 2 | 5 | 1 | 5 | 2 | 2 | **51** | 中高 | CapCut、Canva、Meitu 用补贴推 AI，红海 |
| 29 | 旅行规划/本地指南 | 4 | 2 | 1 | 4 | 1 | 3 | **50** | 高 | 编辑型攻略已被颠覆，价值流向 ChatGPT 和 OTA |
| 30 | 购物/造型顾问 | 4 | 2 | 1 | 4 | 2 | 2 | **50** | 中 | 平台内置的助手（Rufus）免费提供 |
| 31 | AI 陪伴/角色聊天 | 3 | 2 | 2 | 1 | 3 | 3 | **49** | 中 | 监管与诉讼风险最高，变现弱 |
| 32 | 新闻聚合/摘要 | 3 | 2 | 1 | 3 | 3 | 3 | **49** | 中 | 摘要已是平台标配功能 |
| 33 | 原创新闻 | 1 | 4 | 3 | 2 | 4 | 1 | **48** | 高 | 原创报道无法由 AI 复制，在位者仍在增长 |
| 34 | 投资顾问 | 2 | 3 | 3 | 1 | 3 | 1 | **45** | 中高 | 人工早在 2010 年代就被 robo-advisor 替代 |
| 35 | 天气 | 1 | 2 | 1 | 5 | 3 | 3 | **43** | 低 | 数据公开，系统自带 |
| 36 | 音乐收听 | 1 | 4 | 2 | 1 | 4 | 1 | **42** | 中 | 版权与习惯锁定，AI 曲目被当作欺诈处理 |
| 37 | 清理/扫描/VPN 等工具 | 1 | 3 | 1 | 3 | 2 | 4 | **42** | 低 | 几乎没有人工可替代，系统功能与 4.3 下架风险高 |
| 38 | 导航 | 1 | 1 | 1 | 4 | 3 | 1 | **32** | 低 | 非编辑型品类，地图数据和系统默认是护城河（本轮未研究） |

下表把 Apple 分类大致对应到上述细分品类，方便对照原始榜单。部分 App 的实际分类未经核实，Reference、Medical、Developer Tools 三个分类本轮没有研究。

| App Store 分类 | 对应细分品类（排名） |
|---|---|
| Books | 连载有声剧 (1)、连载网文 (6)、书籍摘要 (13)、授权有声书 (26) |
| Entertainment | AI 短剧 (2)、AI 陪伴 (31)；SVOD 流媒体未评分 |
| Education / Kids | 语言口语 (3)、考试题库 (7)、在线课程 (16)、儿童教育 (20)、作业解答 (23) |
| Health & Fitness | AI 私教 (4)、饮食营养 (9)、冥想睡眠 (14)、心理咨询 (17) |
| Lifestyle | 占星灵性 (5)、信仰 (12)、约会 (27) |
| Games | 可玩短剧/互动故事 (10) |
| Photo & Video / Graphics & Design | 摄影服务替代 (8)、设计模板 (24)、通用修图剪辑 (28) |
| Productivity / Business | 垂直速记转写 (11)；AI 助手未评分 |
| Finance | 报税 (15)、理财教练 (18)、投资顾问 (34) |
| Music | 音乐创作 (22)、音乐收听 (36) |
| Food & Drink / Sports / Travel / Shopping | 菜谱 (19)、体育 (25)、旅行 (29)、购物 (30) |
| News / Magazines & Newspapers | 新闻聚合 (32)、原创新闻 (33) |
| Weather / Utilities / Navigation | 天气 (35)、工具 (37)、导航 (38) |
| Social Networking | 未评分（价值在用户网络，不是人工生产的内容） |

这张榜单有三个规律。第一，前十名几乎都同时具备三个条件：有按集付费墙或强习惯闭环，有高的人工价格锚，监管轻。第二，人工与 AI 价差最大的品类（心理咨询、报税、法律）只排在中游，因为人工价格高正是执照造成的，执照同时挡住了 AI 替代者。第三，垫底的品类要么已经被通用助手和系统功能免费覆盖，要么价值本来就不在人工内容上。

## 第一梯队：按集付费的连载内容是 AI 最确定的主场

| 品类 | 美国规模信号 | 头部 App 与价格 | 人工成本构成 | 已发生的 AI 颠覆 | 壁垒与平台风险 |
|---|---|---|---|---|---|
| 连载有声剧（第 1） | Pocket FM 年化收入约 $500M，约 $415M 来自按集解锁，约 $85M 来自广告（[Yahoo Finance](https://finance.yahoo.com/technology/ai/articles/india-pocket-fm-doubles-revenue-174500297.html)）；美国占比本轮未核实 | Pocket FM、Kuku FM，按集解锁（单价未取得） | 配音演员和编剧；现在由 55 万创作者提供点子，AI 制作成片 | 93% 的目录、99% 的新内容由 AI 驱动（[Outlook Business](https://www.outlookbusiness.com/corporate/pocket-entertainment-crosses-500-mn-annual-revenue-run-rate-ai-reshaping-content-creation)）；Audible 开放 100+ 种 AI 声音（[TechCrunch](https://techcrunch.com/2025/05/13/audible-is-expanding-its-ai-narrated-audiobook-library/)） | 获客：Kuku FM 的 FY25 营销支出 ₹285 crore，超过收入 ₹242 crore（[Entrackr](https://entrackr.com/fintrackr/kuku-fm-reports-rs-240-cr-revenue-in-fy25-spends-rs-285-cr-on-marketing-10943137)）；"slop" 口碑风险（[Asia Tech Review](https://www.asiatechreview.com/p/ai-helped-pocket-fm-double-its-revenue)） |
| AI 短剧（第 2） | 2025 年全球 IAP $2.98B，+115%（[Filmustage](https://filmustage.com/blog/short-drama-apps-compared-reelshort-vs-dramabox-in-2026/)）；2025 年 Q1 美国占 49%，约 $350M（[Sensor Tower](https://sensortower.com/blog/state-of-short-drama-apps-2025)；[CherryBowl](https://cherrybowl.io/intelligence/700-million-in-a-quarter-short-drama-apps-hit-escape-velocity-20260806)）；2026 年 7 月美国月收入 $68.41M（[白鲸出海](https://www.baijing.cn/article/56249)） | ReelShort 每集约 60 金币，500 金币 $4.99，周 VIP $6.99–$19.99，年费约 $199（[ReelPulse](https://reelpulse.net/guides/reelshort-pricing)）；DramaBox 每集约 $0.36–$0.50（[ShortDramaTop](https://shortdramatop.com/best/dramabox-vs-reelshort.html)） | 实拍 60 集需 $100K–$300K（[Variety](https://variety.com/2026/tv/news/microdramas-brands-cannes-lions-preview-1236770634/)）；SAG-AFTRA 主演最低 $250/天（[Legal500](https://www.legal500.com/intelligence/united-states/media-telecoms-it-entertainment/sag-aftra-verticals-agreement-five-key-aspects-you-need-to-know)）；获客约占 ReelShort 收入 55% | FlexTV 停掉全部传统拍摄（[MIT Technology Review](https://www.technologyreview.com/2026/05/15/1137326/chinese-short-dramas-ai/)）；单部成本降到原约 $200K 的 10–20%（[TechTimes](https://www.techtimes.com/articles/317008/20260522/chinas-ai-short-drama-boom-hit-industrial-scale-470-titles-day-faces-stolen-jobs-gone.htm)） | 获客；在约 22 万部 AI 剧中，破亿播放的不到 0.5%（[人人都是产品经理](https://www.woshipm.com/ai/6473856.html)）；SAG-AFTRA 合成演员条款 |
| 连载网文（第 6） | GoodNovel 美国 iOS 周收入峰值 $662K（[Sensor Tower](https://sensortower.com/blog/2025-q4-ios-top-5-books-revenue-us-6042071f241bc16eb8c33b77)）；Inkitt 月收入约 $10M（[Bloomberg](https://www.bloomberg.com/features/2025-ai-romance-factory/)） | GoodNovel、Galatea、Wattpad、Webtoon，按章金币（单价未取得） | 作者；Galatea 只把净收入的 6% 分给作者 | Inkitt 用 AI 做编辑、情节建议、翻译、有声书旁白和封面 | 作者合同争议（[Theo Reads](https://theo-reads.ghost.io/author-beware-theo/)）；Webtoon 2025 年收入 $1.38B（+2.5%），MAU −7.1%（[WEBTOON IR](https://ir.webtoon.com/news-releases/news-release-details/webtoon-entertainment-inc-reports-fourth-quarter-and-full-year-0)） |
| 可玩短剧/互动故事（第 10） | 2024 年 Q2，Episode 美国 iOS 周收入 $524K–$668K，Choices $113K–$232K（[Sensor Tower](https://sensortower.com/blog/2024-q2-ios-top-5-interactive%20story%20games-revenue-sk-6019ed6a241bc16eb869f511)）；Love and Deepspace 美国周收入峰值约 $2.8M（[Sensor Tower](https://sensortower.com/blog/2025-q4-unified-top-5-interactive-story-games-revenue-us-6019ed6a241bc16eb869f511)） | Episode、Choices、Chapters | 每章的美术和剧本；Pixelberry 的主要成本是内容生产和获客 | Choices 的开发商 Pixelberry 被 AI 游戏公司 Series Entertainment 收购（[Upptic](https://upptic.com/pixelberry-acquisition-hints-at-ai-driven-future-for-interactive-fiction/)） | Apple 要求含恋爱或性内容的虚拟伴侣应用评级至少 18+（[Gizmodo](https://gizmodo.com/apple-to-place-stricter-age-restrictions-on-dating-apps-and-some-ai-chatbots-2000834362)） |

连载内容排在最前面，是因为它同时满足三个条件。第一，人工曾是主要成本。第二，"前几集免费、悬念处收费"的按集付费墙，让每个用户的生命周期价值远高于普通订阅。第三，通用助手不会把故事做成连载、配好音，再按集收费。笔记还指出，AI App 流失更快，需要持续的新鲜感来抵消，而能不断生成新剧集的品类天然适合这一点。

**Pocket FM 是这一模式的样板。** 它的年化收入从一年前约 $250M 增长到约 $500M。93% 的目录和 99% 的新内容由 AI 驱动：55 万创作者负责点子和故事，AI 把它们做成成片（[Yahoo Finance](https://finance.yahoo.com/technology/ai/articles/india-pocket-fm-doubles-revenue-174500297.html)）。CEO 表示，公司已经靠 AI 实现盈利（[YourStory](https://yourstory.com/2025/11/we-are-profitable-today-with-ai-pocket-fm-ceo-rohan-nayak)）。反面例子是 Kuku FM：内容变便宜之后，营销支出超过了收入，获客成了最大的成本项。Audible 和 Spotify 已经接纳 AI 旁白（[ElevenLabs](https://elevenlabs.io/blog/spotify-is-now-accepting-audiobooks-narrated-by-elevenlabs)），但它们卖的是"书"，不是为付费墙设计的连载剧，所以这个形态被大平台吸收的风险较低。对小团队来说，可行的路径是做 Pocket FM 覆盖不足的题材或语种，而不是在它的优势题材上正面竞争。

**短剧是美国最大的人工内容付费池之一，也是 AI 替代实拍最快的品类。** 2026 年第一季度，DramaBox 和 ReelShort 的全球 IAP 各约 $140M，Sensor Tower 称 ReelShort 仍是美国收入和参与度的领头者（[Sensor Tower](https://sensortower.com/blog/state-of-short-drama-apps-2026-report)）。MPA 估算 ReelShort 的总收入从 2023 年的 $97M 增长到 2025 年的 $785M，预计 2026 年达到 $1.05B 并首次盈利（[Deadline](https://deadline.com/2026/08/microdrama-reelshort-revenue-profit-1237027492/)）。按 ReelShort 的定价，看完一部 80 集的剧要花 $37–$47 的金币（[VerticalCharts](https://verticalcharts.com/micro-drama-cost-to-finish-reelshort-dramabox-coins-vip-vertical-52/)），付费深度远高于一般订阅。

供给端的变化非常剧烈。FlexTV 已经全面转向 AI 剧（也有二手来源说只停了北美的实拍）。昆仑万维旗下的 DramaWave 和 FreeReels 有 1,000 多部 AI 剧，2026 年 6 月其 AI 短剧平台的月流水超过 $65M。到 2026 年 9 月底，中国出海微短剧中 AI 剧的占比已超过六成（[剧短短](https://www.juduanduan.com/2026/0910/4974.shtml)）。按 Veo 3.1 Fast 每秒 $0.10–$0.12 的价格（[CloudZero](https://www.cloudzero.com/blog/veo-3-pricing/)）粗算，一部 80 集、每集 90 秒的剧，原始生成成本约 $720–$860；即使返工几倍，也远低于实拍的 $100K 以上。这是推算，不含剧本、配音、剪辑和人工审片。

但成本下降并没有显著降低进入门槛。ReelShort 约 55% 的收入花在获客上（[Filmustage](https://filmustage.com/blog/short-drama-apps-compared-reelshort-vs-dramabox-in-2026/)），短剧 60% 以上的安装来自付费广告（[Sensor Tower overseas report](https://investgame.net/wp-content/uploads/2025/11/State-of-Short-Drama-Apps-Overseas-2025-Report.pdf)），在位者也在用同一套 AI 工具。AI 的主要作用是让每一美元投放能测试更多剧目和素材。小团队的差异化应该放在以下几个方向：实拍拍不了或太贵的题材（奇幻、狼人或吸血鬼特效、古装、动画/漫剧），西语、葡语等多语种长尾，以及互动或个性化剧。DataEye 预测，2026 年出海微短剧市场超过 $6B，其中 AI 剧加漫剧约占七成（[剧短短](https://www.juduanduan.com/2026/0910/4974.shtml)）。这是中国机构口径的预测，不能直接和 Sensor Tower 的 IAP 数字比较。

文字和互动形态的证据方向一致。Inkitt 的月收入从一年前的 $3M 涨到 $8M 以上，随后又在次年 3 月达到 $10M，AI 贯穿编辑、翻译到旁白的全流程，但公司因为昂贵的影视业务尚未盈利（[Bloomberg](https://www.bloomberg.com/features/2025-ai-romance-factory/)）。老一代的选择式视觉小说在萎缩，Choices 的母公司已被卖给 AI 游戏公司。"让我当主角"这个需求部分转移到了 AI 角色聊天，但那个品类 2025 年全球只有约 $120M（[TechCrunch](https://techcrunch.com/2025/08/12/ai-companion-apps-on-track-to-pull-in-120m-in-2025)），原因是无限制的聊天缺少悬念式付费墙。因此，"短剧付费墙 + 分支选择 + 角色对话"的可玩短剧是一个没人占住的空白，不过目前没有任何 AI 原生产品的收入数据可以证明它。

这一梯队有三条壁垒。第一，SAG-AFTRA 的 Verticals 协议覆盖预算低于 $300K 的工会制作；据 Legal500 解读，完全合成的演员不得在未经谈判的情况下替代真人角色，但另一来源称协议没有 AI 条款（[Legal500](https://www.legal500.com/intelligence/united-states/media-telecoms-it-entertainment/sag-aftra-verticals-agreement-five-key-aspects-you-need-to-know)；[TopDrama](https://topdrama.app/guides/micro-drama-regulation/)）。最稳妥的做法是使用原创合成演员，并保证训练数据来源干净。第二，Apple 2026 年 11 月出台的 18+ 规则会把恋爱向的 AI 产品推进成人分发渠道，压缩投放范围。第三，中国出海公司在 AI 生产上走得最远，而中国业内自己也在说，西方市场越来越要求本地化叙事，简单翻译和换脸已经不够。美国本土团队真正的差异化是文化贴合度和自有流量。2026 年 3 月走红 TikTok 和 YouTube 的 AI 微短剧 "Fruit Love Island"（[Wikipedia](https://en.wikipedia.org/wiki/Fruit_Love_Island)）说明，社交平台原生 IP 可以绕开昂贵的买量。

## 第二梯队：把每月数百美元的一对一人工建议压到十美元级

| 品类 | 美国规模信号 | 头部 App 与价格 | 人工成本构成 | 已发生的 AI 颠覆 | 壁垒与平台风险 |
|---|---|---|---|---|---|
| 细分语言口语（第 3） | Duolingo FY2025 收入 $1,037.6M，+39%（[10-K](https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm)）；2026 年 Q3 收入 $309.0M，付费用户 13.1M（[8-K](https://www.sec.gov/Archives/edgar/data/0001562088/000162828026069474/q3fy26duolingo9-30x26share.htm)） | Duolingo、Speak（约 $100M，[Benzinga](https://www.benzinga.com/news/topics/25/11/48975908/this-1-billion-ai-startup-backed-by-openai-khosla-ventures-just-hit-100m-revenue-racing-to-beat-duolingo)）、Praktika、Babbel；价格本轮未核实 | 课程编写、翻译、真人外教 | Duolingo 约一年上线 148 门 AI 课程，而前 100 门用了 12 年（[TechCrunch](https://techcrunch.com/2025/04/30/duolingo-launches-148-courses-created-with-ai-after-sharing-plans-to-replace-contractors-with-ai)）；Babbel 于 2025 年 7 月关闭面向消费者的真人课（[Wikiwand](https://www.wikiwand.com/en/articles/Babbel)） | Duolingo 的规模（6,490 万 DAU）和习惯；ChatGPT 语音模式；语音推理成本影响毛利 |
| AI 健身私教（第 4） | 美国占 2024 年全球健康健身消费的一半以上（[Sensor Tower](https://sensortower.com/blog/state-of-mobile-health-and-fitness-in-2025)）；Ladder 2025 年末美国 iOS 周收入约 $1.1M（[Sensor Tower](https://sensortower.com/blog/2025-q4-ios-top-5-health-and-fitness-revenue-us-600af518241bc16eb8dce802)） | Future 约 $199/月（年付 $149/月）；纯 AI 竞品 $6.99/月或 $69.99/年；Freeletics 约 $13/月（[SensAI](https://www.sensai.fit/blog/future-app-review-2026)；[PowerliftingTechnique](https://powerliftingtechnique.com/best-personal-training-apps/)）；Strava + Runna $149.99/年（[Sacra](https://sacra.com/research/strava)） | 真人教练本身就是产品 | Strava 收购 Runna 和 The Breakaway；Peloton App 付费订阅下降 11%，至 55.2 万（[Peloton](https://www.barchart.com/story/news/35966405/peloton-announces-q1-2026-financial-results-raises-full-year-2026-adjusted-ebitda-guidance)） | 健康健身类的首次续费率是所有品类中最低的，30.3%（[Adapty](https://adapty.io/state-of-in-app-subscriptions/)）；可穿戴设备厂商的捆绑 |
| 占星/灵性（第 5） | Nebula 是 2024 年 7 月美国收入最高的占星 App（[Statista](https://statista.com/statistics/1451664/top-horoscope-apps-us-market-revenue)）；Nebula 约 $550K/月（[Screensdesign](https://screensdesign.com/apps/nebula-horoscope-astrology/)），而 Co–Star 的估算从约 $400K/月到 iOS "$10K+/月" 不等（[AppGoblin](https://appgoblin.info/apps/com.costarastrology)） | Nebula、Co–Star | 占星文案作者，以及 Nebula 式按分钟收费的真人咨询师（价格未取得） | 没有取得 AI 原生占星 App 的收入数据 | 监管轻；市场小；数据冲突大 |
| 考试题库（第 7） | CDL Prep、Pocket Prep EMS 在美国 Google Play 教育畅销榜上紧随 Duolingo（[AppBrain](https://www.appbrain.com/stats/google-play-rankings/top_grossing/education/us)）；美元规模未取得 | CDL Prep、Pocket Prep；AnkiMobile 是 2025 年美国付费榜第 4（[Apple](https://apps.apple.com/us/iphone/room/6756333301)） | 人工编写的题库和解析 | 没有发现 AI 颠覆的证据 | 准确率和考纲对齐；考完即流失；教育类首日转化占比最低，为 28.5%（[RevenueCat](https://www.revenuecat.com/state-of-subscription-apps-2026-education)） |
| 饮食营养（第 9） | MyFitnessPal 美国 iOS 周收入峰值约 $2.8M–$3M（[Sensor Tower](https://sensortower.com/blog/2025-q4-ios-top-5-health-and-fitness-revenue-us-600af518241bc16eb8dce802)） | MyFitnessPal、Cal AI、Noom；价格未核实 | 用户手动记录；Noom 教练时薪 $19–$24，每人服务 300–400 名用户（[Sacra](https://sacra.com/c/noom)） | Cal AI 不到两年做到 1,500 万次下载、年收入 $30M+，2026 年 3 月被 MyFitnessPal 收购（[TechCrunch](https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens)） | Apple 可能把拍照识别食物并入 Health App（[Gigazine](https://gigazine.net/gsc_news/en/20260206-apple-project-muberry-scaled-back)）；MyFitnessPal 有 2,000 万种食物的数据库（[eWeek](https://www.eweek.com/de/news/myfitnesspal-acquires-cal-ai-teen-founders/)） |
| 信仰（第 12） | Hallow 2025 年 App Store 净收入约 $40M，趋势持平（[Appfigures](https://appfigures.com/resources/insights/hallow-lent-surge-prayer-app-revenue)） | Hallow $69.99/年 | 祈祷朗读（含名人声音）和编辑 | "AI 圣经聊天" 类 App 存在，但没有量化数据 | 教派权威与信任 |
| 书籍摘要（第 13） | Headway 2025 年约 $160M（Latka 估算），一半以上来自美国（[Headway](https://websummit.com/wp-media/2025/11/Headway_Inc_Emerges_as_One_of_the_Worlds_Fastest-Growing_EdTech_Companies.pdf.pdf)） | Headway、Blinkist | 摘要作者、朗读者 | Headway 用 AI，每月做 100 多次产品实验 | 聊天机器人能总结任何一本书 |
| 冥想/睡眠（第 14） | Calm 美国周收入约 $1M（[Sensor Tower](https://sensortower.com/blog/2025-q1-unified-top-5-health%20and%20fitness-revenue-us-600af518241bc16eb8dce802)）；2023 年约 $300M，−15%（[Business of Apps](https://www.businessofapps.com/?p=60332)） | Calm、Headspace；Finch $39.99–$69.99/年（[Adapty](https://adapty.io/paywall-library/finch/)） | 一次性投入的脚本、朗读和名人睡眠故事 | Headspace 裁员 13%，把治疗师转为合同工，并推出 AI 陪伴 Ebb（[eMarketer](https://www.emarketer.com/content/headspace-cuts-13--of-its-workforce--transitions-staff-therapists-contract-part-time-roles)） | 品类需求偏软；在位者的品牌和 B2B 渠道 |

这一梯队的核心是价差。真人私教 Future 每月约 $199，纯 AI 竞品每月 $6.99，相差近 30 倍，而健身指导几乎不受监管。但并不是所有"人工建议"的价差都这么大。按 Noom 的数据推算，一名时薪约 $21.5 的教练服务 300–400 名用户，每名用户每月的人工成本只有约 $9–$11（[Sacra](https://sacra.com/c/noom)）。在大众减重市场，人工本来就很薄，AI 全面替代能省下的是毛利，而不是带来价格颠覆。真正的大价差集中在"人就是产品"的一对一场景。

**语言口语说明，在位者如果主动自我颠覆，留给新进入者的只剩细分市场。** Duolingo CEO 在 2025 年 4 月宣布"逐步停止让合同工做 AI 能做的工作"（[Entrepreneur](https://entrepreneur.com/business-news/duolingo-will-replace-contract-workers-with-ai-ceo-says/490812)）。FY2025 毛利率从 72.8% 降到 72.2%，10-K 把原因归于 Video Call 等功能的 AI 成本上升（[10-K](https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm)）。也就是说，过去随外包人数增长的内容成本，已经变成随推理用量增长的成本。另一方面，Duolingo 2026 年 Q3 的收入增速已放缓到约 14%（[8-K](https://www.sec.gov/Archives/edgar/data/0001562088/000162828026069474/q3fy26duolingo9-30x26share.htm)）；Speak 在 ChatGPT 有语音模式的情况下仍做到约 $100M 收入。Praktika 有约 $55M ARR 的说法（[arr.club](https://www.arr.club/praktika/praktika-hit-55m-arr-profitable)），但第三方估算从每月约 $5 万到超过 $100 万不等（[AppGoblin](https://appgoblin.info/apps/1624701477/trends)），无法核实。笔记给出的空白方向是：考试英语（IELTS/TOEFL）、职场英语、继承语和年长学习者。

**健身私教是价差大、监管轻，同时还有时间窗口的品类。** 笔记把 Ladder 与 Future、Fitbod 一起归入一对一训练类；Ladder 在美国 iOS 上每周收入约 $1.1M，说明美国用户愿意为结构化的训练计划付钱。Strava 用收购 Runna 和 The Breakaway 的方式补上了 AI 训练计划。Apple 原本计划推出的 AI 健康教练服务，在 2026 年 2 月被大幅收缩（[Gigazine](https://gigazine.net/gsc_news/en/20260206-apple-project-muberry-scaled-back)），这给基于 HealthKit 数据的第三方 AI 教练留出了空间。主要风险是留存：健康健身类首次续费率只有 30.3%，AI App 的年付留存又比非 AI 低约 10 个百分点。

**饮食记录展示了小团队的完整路径，包括退出方式。** Cal AI 用"拍一张照片就出热量"这一个动作，替代了繁琐的手动记录。它靠付费达人和 UGC 短视频获客（[Technology Ripple](https://technologyripple.com/2026/10/cal-ai/)），最后被 MyFitnessPal 收购，收购方看重的是把它接入自己的食物数据库（[MLQ](https://mlq.ai/news/myfitnesspal-announces-acquisition-of-teen-founded-cal-ai-app/)）。Cal AI 的收入说法从约 $10M ARR（[Sacra](https://sacra.com/c/cal)）到年收入 $30M+ 不等，员工数有 7 人和 30 人两种说法。这个楔子现在已经很拥挤，剩下的机会在 AI 营养师、膳食计划和 GLP-1 用户的营养陪伴。

**占星、信仰和考试题库的共同点是：人工几乎可以完全替代，但证据最弱。** 真人咨询师按分钟收费的服务，可以用接近零边际成本的大模型解读来替代，而且监管很轻。但现有的收入数据只有几个互相冲突的第三方估算，也没有任何 AI 原生占星 App 的收入数据。Hallow 在 $69.99/年的价位上做到了约 $40M 净收入，但趋势持平，说明信仰类的天花板取决于权威和信任，而不是内容产量。考试题库的付费意愿很高，在 Google Play 教育畅销榜上排在 Duolingo 之后，AI 生成题目和解析的成本也极低，但准确率是硬门槛。笔记把它列为"有待验证的被低估机会"。

**书籍摘要和冥想说明，AI 能让内容达到同等水平，却不能制造价差。** Headway 的增长靠的是每月 100 多次实验和投放，而不是摘要本身。Calm 的收入在 2023 年已经下滑。Finch 这类低压力的自我关怀陪伴估算每月收入约 $1M，90 天内下载 234 万次，其中 62% 来自美国（[FoxData](https://foxdata.com/en/blogs/finch-as-app-store-editors-choice-a-self-care-companion/)）。AI 原生产品在这里的优势是个性化生成，而不是更低的价格。

## 摄影师和速记员已被替代，红利正被平台和系统功能收走

| 品类 | 美国规模信号 | 头部 App 与价格 | 人工成本构成 | 已发生的 AI 颠覆 | 壁垒与平台风险 |
|---|---|---|---|---|---|
| 摄影服务替代（第 8） | Aragon 两年做到 $10M ARR，团队约 9 人（[arr.club](https://www.arr.club/aragon-ai/aragon-ai-arr-at-10m-in-2-years-with-9-people)）；HeadshotPro 累计收入 $10M+（[HeadshotPro](https://www.headshotpro.com/about)）；PhotoRoom 2024 年 ARR €50M 且盈利（[Sifted](https://sifted.eu/articles/photoroom-interview-gen-ai-profit)） | 摄影师拍头像中位价 $250（[HeadshotPro](https://headshotpro.com/blog/how-much-does-a-headshot-cost)），Thumbtack 均价 $304（[Thumbtack](https://www.thumbtack.com/p/corporate-headshot-prices)）；Aragon 套餐 $35–$75（[Aragon](https://www.aragon.ai/blog/how-much-do-professional-headshots-cost)） | 摄影师、修图师 | Poshmark 的 AI 上架工具让上架时间减少 48%（[Modern Retail](https://www.modernretail.co/technology/marketplace-briefing-poshmark-is-the-latest-platform-to-use-ai-to-help-create-product-listings/)） | ChatGPT 图像生成在 28 天内带来约 1,200 万次增量下载（[Sensor Tower](https://sensortower.com/blog/mmm-the-ai-ghibli-effect-propels-chatgpt-usage-and-revenue)）；Remini 收入下滑（[Finviz](https://finviz.com/news/381628/bending-spoons-announces-q2-2026-results)） |
| 垂直速记转写（第 11） | Otter ARR $100M（[BusinessWire](https://www.businesswire.com/news/home/20250325249430/en)）；Plaud 软件 ARR 超过 $100M（[CryptoBriefing](https://cryptobriefing.com/plaud-100m-arr-ai-notetakers/)） | Rev 人工转写 $1.99/分钟，AI 转写 $0.25/分钟（[Sonix](https://sonix.ai/resources/rev-pricing.md)）；人工翻译 $0.15–$0.30/词（[Translated](https://translated.com/resources/professional-translation-cost-2026-guide)） | 速记员、口译和笔译 | 替代已经完成 | iOS 26 自带实时翻译和 Preview 扫描（[Apple](https://www.apple.com/os/pdf/All_New_Features_iOS_26_Sept_2025.pdf)）；Otter 被诉秘密录音（[Sacra](https://sacra.com/research/otter-at-100m-arr/)） |
| 设计模板（第 24） | Canva ARR 约 $4B，付费用户 3,100 万+（[TechCrunch](https://techcrunch.com/2026/02/18/canva-gets-to-4b-in-revenue-as-llm-referral-traffic-rises/)） | Canva、Adobe Express | 模板设计师、创作者市场 | 生成式 AI 让模板的边际成本接近零 | Canva 掌握分发；Adobe 的 AI-first ARR 只是刚超过 $250M（[Adobe](https://www.sec.gov/Archives/edgar/data/796343/000079634326000045/adbe2025annualreporta.pdf)） |
| 通用修图剪辑（第 28） | CapCut 美国周收入约 $4M–$4.8M，笔记推算年化约 $210M–$250M（[Sensor Tower](https://sensortower.com/blog/2025-q4-unified-top-5-photo-and-video-revenue-us-615c8a30ad269d38a8b6acd0)） | CapCut、Canva、Picsart、Remini（年化约 $93M，[Appfigures](https://appfigures.com/resources/insights/the-company-squeezing-money-from-apps-you-used-to-love)） | 本来就是工具，人工很少 | Lightricks 把 Facetune 拆分出来并裁员（[StartupFortune](https://startupfortune.com/lightricks-splits-itself-in-two-as-ai-costs-force-a-reset/)） | Meitu 照片业务 +41.6%（[Meitu](https://www.meitu.com/en/media/436)）；ByteDance 推出 Hypic（[Appfigures](https://appfigures.com/resources/insights/20251219?f=3)） |
| 工具类（第 37） | Cleanup 在 2026 年 5 月登上美国 Utilities 畅销榜第一（[AppPricingLab](https://www.apppricinglab.com/reports/UTILITIES)）；Utilities 类 73.6% 的订阅收入来自周订阅（[Adapty](https://adapty.io/state-of-in-app-subscriptions/)） | 清理、扫描、VPN、传真 | 几乎没有人工 | — | Apple 把 4.3 条款扩大到"低价值内容"（[MacRumors](https://macrumors.com/2026/06/09/app-store-guidelines-low-quality-apps/)） |

摄影服务是最清楚的"消费者级人工服务被替代"案例。$250–$300 的摄影师头像被 $35–$75 的 AI 套餐取代，便宜 75–90%，而且是小团队的成功故事：Aragon 两年做到 $10M ARR，团队约 9 人，没有融资。问题在于留存和吸收。头像是一次性需求；ChatGPT 的 GPT-4o 图像生成和 Gemini 的 Nano Banana 先后登顶下载榜（[Gigazine](https://gigazine.net/gsc_news/en/20251018-chatgpt-app-slowing-download-growth-daily-use)），Remini 这类单一特效 App 的收入随之下滑；第一波 AI 照片 App Lensa 在两个月内就回落到峰值前的水平（[TechCrunch](https://techcrunch.com/2023/02/13/the-ai-photo-app-trend-has-already-fizzled-new-data-shows)）。还在增长的是嵌在工作流里的产品，例如面向电商卖家批量处理商品图的 PhotoRoom。所以这个品类剩下的机会在高频、批量的职业场景（卖家上架、房源照片），而不在一次性的趣味特效。

速记和翻译的人工已经被替代：一小时音频的人工转写约 $119，AI 约 $15，系统自带功能则免费。这些价值已经转移到工作流（Otter）和"硬件 + 订阅"（Plaud）上。剩下的机会只在原本有付费速记员或助理的垂直职业场景，并且要警惕录音同意方面的诉讼。通用修图、设计模板和清理扫描工具排在后段，原因很直接：这些品类里人工本来就很少，或者已经被 CapCut、Canva、Meitu 这类拥有分发的平台用补贴吸收。笔记推算，CapCut 一家在美国的收入就超过 Picsart、Remini 和 Facetune 级别 App 的总和。

## 价差最大的品类，被执照、版权和网络效应锁住

| 品类 | 美国规模信号 | 头部 App 与价格 | 人工成本构成 | 已发生的 AI 颠覆 | 壁垒与平台风险 |
|---|---|---|---|---|---|
| 心理咨询（第 17） | BetterHelp FY2025 收入约 $950M，−9%（[MarketBeat](https://www.marketbeat.com/earnings/reports/2026-2-25-teladoc-health-inc-stock/)）；Talkspace 面向消费者的收入 −30%，降至 $17.5M（[Talkspace](https://investors.talkspace.com/static-files/3974b412-0bb2-4c5d-b4e2-643038100d36)） | BetterHelp 隐含每用户约 $205/月（笔记推算）；Ash 免费 | 持证治疗师 | Ash 融资 $93M（[BusinessWire](https://www.businesswire.com/news/home/20250722566346/en/Slingshot-Launches-Ash-the-First-AI-Designed-for-Therapy)）；Woebot 关闭消费者 App（[STAT](https://www.statnews.com/2025/07/02/woebot-mental-health-chatbot-shuts-down-founder-says-ai-moving-faster-than-regulators/)） | Illinois 禁止 AI 提供治疗（[Becker's](https://www.beckershospitalreview.com/healthcare-information-technology/illinois-bans-ai-therapy-without-clinician-oversight/)）；Nevada、Utah 也有限制（[Engadget](https://www.engadget.com/ai/illinois-is-the-first-state-to-ban-ai-therapists-145755797.html)）；FDA 尚未授权任何用于心理健康的生成式 AI 设备（[Orrick](https://www.orrick.com/en/insights/2025/11/fdas-digital-health-advisory-committee-considers-generative-ai-therapy-chatbots-for-depression)） |
| 报税（第 15） | TurboTax 收入 $5.3B，其中 Live 占 53%、同比 +37%（[01net/Intuit](https://www.01net.it/intuit-reports-fourth-quarter-and-full-year-fiscal-2026-results-sets-fiscal-2027-guidance/)） | CPA 收费 $280、EA $228、无证人员约 $185（[NATP](https://dam.natptax.com/m/5f112786acbd1130/original/2025_NATP_Fee_Study_MediaHighlights.pdf)）；TurboTax Full Service 联邦报税 $129 起（[NerdWallet](https://www.nerdwallet.com/p/reviews/taxes/turbo-tax)） | 报税员的时间、签字和审计支持 | H&R Block 的 AI Tax Assist 处理了 410 万条消息，+88%（[Nasdaq](https://www.nasdaq.com/articles/hr-block-q3-earnings-call-highlights)）；Instead 拿到全部辖区的电子申报批准（[Instead](https://instead.com/news/instead-first-new-tax-platform-100-percent-us-efile-approvals-all-jurisdictions)） | 电子申报授权和责任；IRS Direct File 2026 年不提供（[Kiplinger](https://www.kiplinger.com/taxes/a-free-tax-filing-option-just-disappeared)） |
| AI 理财教练（第 18） | Cleo ARR 从 $250M 增至 $400M（[BusinessWire](https://www.businesswire.com/news/home/20250729690058/en)；[arr.club](https://www.arr.club/cleo/cleo-arr-hit-400m-in-6-months-after-300m)）；Dave FY2025 收入 $554.2M（[Dave](https://dave.com/press/news-releases/news-release-details/dave-reports-fourth-quarter-full-year-2025-financial-results)） | Cleo、Dave；Rocket Money 美国周收入从 $158K 降到 $111K（[Sensor Tower](https://sensortower.com/blog/2025-q3-unified-top-5-personal%20finance%20budgeting%20and%20planning-revenue-us-63e363f0e1714cfff1979caa)） | 理财教练 | AI 教练已经跑通，靠现金预支和订阅变现 | JPMorgan 向数据聚合商收费（[American Banker](https://www.americanbanker.com/news/jpmorganchase-reaches-deal-to-charge-plaid-for-customer-data)）；SEC 处罚"AI 洗白"（[O'Melveny](https://omm.com/insights/alerts-publications/sec-targets-ai-washing-in-charges-against-two-investment-advisers)） |
| 投资顾问（第 34） | Wealthfront FY2025 收入 $308.9M，75% 来自现金管理（[S-1](https://www.sec.gov/Archives/edgar/data/1524566/000162828025043113/wealthfront-sx1.htm)） | 人工顾问中位收费 1%（[Kitces](https://www.kitces.com/?p=20228)），robo 收费 0.25% | 顾问 | 2010 年代已经完成替代 | SEC 监管；利润池在现金息差 |
| 儿童教育（第 20） | 2025 年 Q1 美国 iOS 周收入：ABCmouse 约 $441K、Lingokids 约 $409K、Kiddopia 约 $266K（[Sensor Tower](https://sensortower.com/blog/2025-q1-ios-top-5-educational%20games-revenue-us-642f2824e1714cfff1ed8590)） | ABCmouse $9.99–$12.99/月（[App Store](https://apps.apple.com/us/app/abcmouse-com-early-learning-academy/id586328581)） | 课程设计、动画、插画和授权角色 | AI 睡前故事 App 大多每月收入不到 $10K（[AppGoblin](https://appgoblin.info/apps/6747600063)） | 修订后的 COPPA 自 2026-04-22 起全面执行，把数据用于 AI 训练需要单独取得家长同意（[Finnegan](https://www.finnegan.com/en/insights/articles/coppas-amended-rule-is-now-in-full-effect-what-operators-need-to-know.html)）；Lingokids 走授权 IP 路线（[PocketGamer.biz](https://www.pocketgamer.biz/lingokids-surpasses-500m-plays-across-disney-activities/)） |
| 法律文书（第 21） | LegalZoom FY2025 收入 $756.0M，订阅 ARPU $266，有机增长只有 3%（[Seeking Alpha](https://seekingalpha.com/pr/20406677)） | LegalZoom | 律师咨询、注册代理 | 订阅以"人工把关"为卖点 | FTC 对 DoNotPay 的处罚令（[FTC](https://www.ftc.gov/node/87474)）；各州 UPL 规则不统一（[NCSC](https://www.ncsc.org/sites/default/files/media/document/AI_UPL_WhitePaper.pdf)） |
| 音乐创作（第 22） | Suno ARR $300M，200 万付费用户（[MBW](https://www.musicbusinessworldwide.com/suno-hits-2m-paid-subscribers-300m-annual-revenue/)）；在美国消费者 AI 支出中排第 7（[a16z](https://a16z.com/100-gen-ai-apps-7/)） | Suno、Udio | 音乐人、制作人 | AI 原生产品已经胜出 | UMG、Sony 的诉讼仍在进行；Udio 改为封闭生态（[We Rave You](https://weraveyou.com/2026/05/suno-udio-umg-copyright-lawsuit-musicians-2026/)） |
| 授权有声书（第 26） | Audible 美国 iOS 周收入约 $4.4M–$4.8M（[Sensor Tower](https://sensortower.com/blog/2025-q4-ios-top-5-books-revenue-us-6042071f241bc16eb8c33b77)） | Audible；ElevenReader $11/月，含约 20 万本授权有声书（[texxr](https://texxr.com/1169448)） | 旁白、翻译 | 据一份报道，Audible 上约有 6 万本 AI 配音书（[TechCentral](https://techcentral.co.za/ai-voiced-audiobooks-are-coming-to-audible/263519/)） | 版权；ElevenLabs 也必须授权真人旁白目录 |
| 约会（第 27） | Match FY2025 收入约 $3,487M，付费用户 −5%（[Match IR](https://ir.mtch.com/investor-relations/news-events/news-events/news-details/2026/Match-Group-Announces-Fourth-Quarter-and-Full-Year-Results)）；Bumble −9.9%（[MarketChameleon](https://marketchameleon.com/articles/b/2026/3/12/bumble-average-revenue-user-increase-profitability-cash-flow-2025)） | Tinder、Hinge、Bumble；AI 僚机 Rizz $3.99–$9.99/周，估算每月 $150K–$300K（[Adapty](https://adapty.io/paywall-library/rizz/)） | 用户资料（UGC）；高端红娘 | Bumble 推出 AI "Dates"（[Fortune](https://dc.fortune.com/2026/03/12/bumble-2025-earnings-stock-increase-whitney-wolfe-herd-comeback)） | 网络效应；Apple 对约会类 App 要求 18+ |
| AI 陪伴（第 31） | 2025 年全球约 $120M，前 10% 的 App 拿走 89% 的收入（[TechCrunch](https://techcrunch.com/2025/08/12/ai-companion-apps-on-track-to-pull-in-120m-in-2025)） | Character.AI 的 c.ai+ $9.99/月（[Sacra](https://sacra.com/research/character-ai/)）；Talkie 母公司 MiniMax FY2025 收入 $79.04M（[Wikipedia](https://en.wikipedia.org/wiki/MiniMax_Group)） | 取代的是同人作者，不是付费人工 | 本身就是 AI 原生 | Character.AI 于 2026 年 10 月申请 Chapter 11，40 位州总检察长介入（[CBS News](https://www.cbsnews.com/news/character-ai-files-bankruptcy-disney-license/)）；Apple 18+ 规则 |

这一组品类有一个共同的悖论：人工价格越高，往往越是执照、版权或网络效应造成的，而这些同样会挡住 AI 替代者。**心理咨询的价差最大。** 按 BetterHelp 的数据推算，每名付费用户每月约 $205，而 AI 产品 Ash 是免费的，面向消费者的人工治疗需求也确实在下滑。但 Illinois 自 2025-08-04 起禁止 AI 提供治疗或作出治疗决定，Ash 随即屏蔽了 Illinois 用户（[Gizmodo](https://gizmodo.com/illinois-bans-ai-from-providing-therapy-2000639042)）。Woebot 的创始人在退出消费者市场时说，AI 的发展速度已经超过了监管（[STAT](https://www.statnews.com/2025/07/02/woebot-mental-health-chatbot-shuts-down-founder-says-ai-moving-faster-than-regulators/)）。小团队唯一可行的位置是"自助/陪伴"，而不是"治疗"：Illinois 的法律明确豁免不自称治疗的自助材料，参照 Finch 的定价，每年约 $40–$70。另一条路是像 Talkspace 的 TalkAI 那样，在临床监督下通过医保渠道销售，但这不是小团队能走的路（[Motley Fool](https://www.fool.com/earnings/call-transcripts/2026/02/19/talkspace-talk-q4-2025-earnings-call-transcript/)）。

**报税和法律说明，AI 首先放大了在位者的人工产能。** TurboTax Live 的收入同比增长 37%，超过四分之三的新增 Live 客户来自 DIY 用户升级。按 53% × $5.3B 推算，这是约 $2.8B 的"AI + 人工专家"收入。H&R Block 用 AI 处理客户消息，LegalZoom 把"人工把关"写进订阅卖点，CEO 的说法是："AI 能帮你开始，LegalZoom 帮你完成。"新进入者的空间也是真实的：IRS Direct File 在 2026 年申报季停止提供，Instead 用约两个月的公开进度就拿下了全部辖区的电子申报批准，Perplexity 也推出了报税代理（[PYMNTS](https://www.pymnts.com/taxes/2026/perplexity-launches-ai-agent-that-drafts-tax-returns/)）。笔记给出的定位是：AI 准备、持证人员签字，收费 $50–$100，对标人工报税员的 $185–$280。但这需要电子申报授权和审计责任体系，已经不属于"小团队做个 App"的范畴。法律方向的教训来自 DoNotPay：FTC 认定其"机器人律师"从未与真人律师的表现做过对比测试，并禁止它在没有证据的情况下作此宣称。

**理财、儿童、音乐和授权内容的门槛各不相同，但都很硬。** Cleo 和 Dave 证明 AI 理财教练能赚钱，但利润来自现金预支，本质是放贷，而 JPMorgan 已开始对银行数据访问收费。投资顾问的人工早在 robo-advisor 时代就被替代，Wealthfront 75% 的收入来自现金管理，而不是投资建议。儿童教育的付费池不小，ABCmouse 和 Lingokids 在美国 iOS 上每周各有约 $40 万收入，但 COPPA 修订、授权 IP（Lingokids 的 Blippi 和 Disney 内容）和家长信任叠加在一起，而 AI 睡前故事 App 大多每月收入不到 $1 万。Suno 证明了音乐创作需求的规模，但它需要自研模型，也要和唱片公司谈授权。Spotify 已删除超过 7,500 万首"垃圾"曲目（[MBW](https://www.musicbusinessworldwide.com/spotify-has-deleted-75m-spammy-tracks-as-it-unveils-new-ai-music-policies/)）。约会和陪伴的问题是，网络效应保护在位者，而年龄与诉讼风险会压垮新进入者。Character.AI 申请破产时，法院文件摘要显示其 FY2025 收入约 $23.6M（[Bondoro](https://bondoro.com/character-ai/)），远低于此前 $30M–$50M 年化的说法。

## 通用助手已经免费回答的品类，不值得正面进攻

| 品类 | 美国规模信号 | 头部 App 与价格 | 人工成本构成 | 已发生的 AI 颠覆 | 壁垒与平台风险 |
|---|---|---|---|---|---|
| 作业解答（第 23） | Chegg 2026 年 Q3 收入 $46.5M，−40%（[Morningstar](https://www.morningstar.com/news/globe-newswire/9868915/chegg-reports-third-quarter-2026-earnings)） | Chegg、Gauth $11.99/月（[Implicator](https://www.implicator.ai/bytedances-homework-app-gauthmath-quietly-conquers-american-classrooms/)） | 付费专家写的解答 | Course Hero 流量 −59%（[Digital Information World](https://www.digitalinformationworld.com/2025/03/ai-tools-revolutionize-markets-driving.html)）；Quizlet 网站访问量 −29%（[PPC Land](https://ppc.land/ai-chatbots-drive-traffic-decline-for-major-online-course-platforms/)） | ChatGPT、Gemini、AI Overviews 免费提供 |
| 在线课程（第 16） | Coursera 与 Udemy 合并后 2025 年收入超过 $1.5B（[Panabee](https://www.panabee.com/news/coursera-completes-udemy-combination-1-5-billion-combined-revenue-and-115-million-synerg)）；Skillshare $78M（[Fueler](https://www.fueler.io/blog/skillshare-usage-revenue-valuation-growth-statistics)） | Coursera、Udemy、Skillshare | 讲师录制视频 | 课程平台流量流向聊天机器人 | 学历证书；收入多在网页端，不经过 App Store |
| 原创新闻（第 33） | NYT 订阅用户 1,376 万，数字版 ARPU $9.93（[Quartr](https://quartr.com/events/the-new-york-times-company-nyt-q3-2026_3PJgPSrf)） | NYT、WSJ | 约 2,300 名新闻编辑部记者（[TheWrap](https://www.thewrap.com/media-platforms/journalism/new-york-times-newsroom-2300-journalists/)） | NYT 向 Amazon 授权内容，每年 $20M–$25M（[eWeek](https://www.eweek.com/news/amazon-new-york-times-licensing-deal-ai-training/)） | 原创报道无法复制 |
| 新闻聚合（第 32） | NewsBreak 以广告变现 | NewsBreak、Yahoo News、Particle（融资约 $15M，[TechCrunch](https://techcrunch.com/2024/06/11/ai-news-reader-particle-adds-publishing-partners-and-10-9m-in-new-funding)） | 编辑 | NewsBreak 的 AI 生成报道出错，并向 Patch 支付 $1.75M 和解金（[NBC News](https://www.nbcnews.com/tech/tech-news/top-news-app-us-chinese-origins-writes-fiction-help-ai-rcna155567)）；Artifact 被卖给 Yahoo（[BusinessWire](https://www.businesswire.com/news/home/20240402939591/en/Yahoo-announces-the-acquisition-of-Artifact-the-news-discovery-platform-created-by-Instagram-cofounders-Kevin-Systrom-and-Mike-Krieger)） | 出现 AI 摘要时，用户点击传统结果的比例从 15% 降到 8%（[Pew](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-)）；ChatGPT Pulse 主动推送简报（[Analytics India Mag](https://analyticsindiamag.com/ai-news-updates/chatgpt-enters-the-super-app-era-with-apps-sdk/)） |
| 旅行/本地（第 29） | Tripadvisor 2026 年 Q3 收入约 $436M，−11%，核心业务 −23%（[MarketBeat](https://www.marketbeat.com/instant-alerts/transcript-tripadvisor-q3-earnings-call-highlights-2026-11-06/)）；Yelp 广告收入 −6%（[PPC Land](https://ppc.land/yelp-ad-revenue-drops-6-as-clicks-fall-8-in-third-quarter/)） | Layla（种子轮 €3M，[PhocusWire](https://www.phocuswire.com/layla-launch-funding-ai-travel-planner)）、Mindtrip；AllTrails Peak $79.99/年（[TechCrunch](https://techcrunch.com/2025/05/12/alltrails-debuts-a-80-year-membership-that-includes-ai-powered-smart-routes)） | 攻略编辑、点评审核 | Expedia、Booking 进入 ChatGPT 的应用平台（[eMarketer](https://www.emarketer.com/content/expedia-booking-com-integrations-push-chatgpt-deeper-commerce)） | 68% 的旅客仍倾向在可信品牌处预订（[Hospitality Net](https://www.hospitalitynet.org/news/4131919/expedia-group-reveals-the-ai-trust-gap-travelers-embrace-ai-for-planning-but-rely-on-trusted-brands-to-book)）；使用频率低 |
| 菜谱/膳食（第 19） | AI 菜谱 App 大多每月收入不到 $10K（[AppGoblin](https://appgoblin.info/apps/6752574211)）；Paprika 是 2025 年美国付费榜第 5（[Apple](https://apps.apple.com/us/iphone/room/6756333301)） | Allrecipes、NYT Cooking、Paprika | 菜谱编辑、测试厨房 | Allrecipes 母公司 People Inc 的 Google 流量占比从 54% 降到 24%（[TechCrunch](https://techcrunch.com/2025/11/04/people-inc-forges-ai-licensing-deal-with-microsoft-as-google-traffic-drops/)）；Yummly 关闭（[The Spoon](https://thespoon.tech/whirlpool-lays-off-entire-team-for-cooking-and-recipe-app-yummly/)） | Instacart 等大品牌进入 ChatGPT 的应用平台（[OpenAI](https://openai.com/hi-IN/index/introducing-apps-in-chatgpt/)） |
| 体育（第 25） | Underdog 2025 年净收入 $441M（[SBC Americas](https://sbcamericas.com/2026/10/08/underdog-investors-prediction-markets/)）；ESPN Select $13.99/月（[NewscastStudio](https://www.newscaststudio.com/2026/08/24/espn-dtc-streaming-price-hike-826/)） | ESPN、The Athletic、Underdog | 记者、分析师 | ESPN 的 AI 战报出现事实错误（[Front Office Sports](https://frontofficesports.com/espn-ai-generated-soccer-lacrosse/)） | 转播权、官方数据授权、各州博彩法规 |
| 购物/造型（第 30） | Stitch Fix 活跃客户 −7.9%（[SEC](https://www.sec.gov/Archives/edgar/data/1576942/000162828025042587/exhibit991-q425.htm)） | Stitch Fix | 人工造型师 | Amazon Rufus 预计带来超过 $10B 的年化增量销售（[Fortune](https://fortune.com/2025/11/02/amazon-rufus-ai-shopping-assistant-chatbot-10-billion-sales-monetization/)） | 平台免费内置 |
| 天气、导航、音乐收听（第 35、38、36） | Weather Company 每月覆盖约 4.15 亿人（[Verdict](https://www.verdict.co.uk/ibm-sell-weather-company-francisco/)）；导航本轮未研究 | The Weather Channel、Google Maps、Spotify | 几乎没有编辑人工 | 在 Deezer，峰值日新上传的歌曲中超过一半是全 AI 曲目，其中最多 70% 的播放被判定为欺诈（[Stability AI](https://stability.ai/explainers/ai-music-streaming-platform-policy-how-each-service-treats-ai-generated-music)） | 系统默认 App、公开数据、音乐版权 |

这一组品类最容易让人误判。人工内容确实被摧毁了，但价值没有留给新的垂直 App。旅行最典型：Tripadvisor 核心业务收入下降 23%，计提 $369M 商誉减值；在 Anthropic、OpenAI、Gemini、Meta 等 AI 助手里的集成，转化率约为平均水平的 5 倍，但只带来不到 1% 的流量。同期，AI 行程规划公司在 2024 年还处在"融资艰难"的种子轮或 A 轮阶段（[Skift](https://skift.com/2024/09/17/mindtrip-raises-12-million-in-tough-funding-environment-for-ai-trip-planners/)）。新闻也一样：Artifact 由 Instagram 联合创始人打造，AI 个性化做得很好，最终也只是把技术卖给了 Yahoo。笔记的结论是："内容一样、由 AI 写、更便宜"在这些品类里都不是可防守的切入点，因为 Google AI Overviews 和 ChatGPT 已经把 AI 生成的通用内容的边际价格压到接近零。

真正能做的，是这些在位者一直没做好的 App 级实用工具，并且要有自己的数据或闭环。菜谱方面，可以做"从 TikTok、Instagram、网页导入菜谱 → 整理 → 膳食计划 → 生成采购清单"，而不是 AI 写的菜谱。户外旅行方面，AllTrails 有 1 亿会员的轨迹数据，可以支撑 $79.99/年的 AI 层级。体育方面，可以做梦幻体育研究工具，那里的付费意愿已经被 Underdog 证明，但需要官方数据授权，还要面对各州的博彩规则。新闻方面，现实的做法是用授权内容源做个性化或多视角呈现，但 ARPU 会很低。笔记估算 Particle 定价约 $3/月，这个数字未经证实。

## 小团队的八个切入点、定价公式与避坑清单

下表把排行榜的结论落到具体机会上。定价建议是基于笔记中的基准数据推导出来的，不是已验证的价格。

| 切入点 | 替代的人工 | 定价思路（建议） | 必须盯住的指标 | 最该避开的坑 |
|---|---|---|---|---|
| 美国本土题材的 AI 有声连载（romantasy、狼人、悬疑，或面向美国西语用户） | 配音演员、编剧 | 前几集免费，之后金币按集解锁，加周 VIP；参照 ReelShort 每集约 $0.6、看完一部 $30–$50 | 投放回本周期（业内估计约 30–90 天）、单剧付费率 | 把预算押在内容产量上，而不是选题测试和投放；"slop" 口碑 |
| AI 奇幻/动画短剧，或"可玩短剧" | 实拍剧组、演员、特效 | 同上；互动分支和角色对话作为加价项 | 单部生成成本、爆款命中率、素材测试速度 | 用真人演员的数字替身（SAG-AFTRA）；恋爱内容被 Apple 18+ 规则限制分发 |
| 可穿戴数据驱动的细分人群 AI 私教（GLP-1 用户保肌、产后、50 岁以上、单项运动） | 每月 $149–$199 的真人私教 | 主推年付，$69.99–$149.99/年，锚点是纯 AI 竞品的 $69.99 和 Strava + Runna 的 $149.99 | 首次续费率（行业最低 30.3%） | 做医疗或伤病承诺；被 Strava、可穿戴厂商或 Apple 捆绑 |
| 职业资格考试 AI 题库（CDL、EMS 等） | 人工题库编写 | 按备考周期卖一次性"通关包"或 1–3 个月订阅，试用 5–9 天 | 题目错误率、用户通过率 | 使用真题侵权；考后流失；一次准确率事故就可能毁掉口碑 |
| 考试英语、职场英语、继承语等口语陪练 | 真人外教 | 订阅制，并按语音分钟数设上限 | 每用户口语分钟数、7 日留存 | 与 Duolingo Video Call、ChatGPT 语音正面竞争 |
| 占星/塔罗/灵性日更 + AI 深度解读 | 占星文案、按分钟收费的真人咨询师 | 周订阅，加单次深度解读 | 每日打开习惯、退款率 | 同质化，被 4.3 条款下架；订阅暗模式 |
| 职业头像、商品图、房源图的"摄影师替代" | 每次 $250–$300 的摄影师 | 一次性套餐（参照 Aragon 的 $35–$75），加面向卖家的批量订阅 | 获客成本对比一次性客单价 | ChatGPT 和 Gemini 的图像生成免费化；电商平台自带同类功能 |
| 原本有付费速记员的垂直职业场景的 AI 速记 | 速记员、助理 | 月订阅，超额部分按分钟收费 | 重度用户的毛利 | 录音同意方面的诉讼；医疗场景受 HIPAA 约束；系统自带转写 |

**定价应按品类的付费机制来定，而不是只看 AI 成本。** 硬付费墙的第 35 天转化率中位数是 10.7%，免费增值模式只有 2.1%，两者留存相近（[Subscription Insider](https://www.subscriptioninsider.com/blog/revenuecat-data-shows-subscription-app-growth-concentrating-at-the-top-news)）。5–9 天的试用转化率中位数为 46.8%，高于 10–16 天的 40.4%（[RevenueCat](https://www.revenuecat.com/blog/growth/free-trial-length)）。订阅周期上，周订阅一年后（第 380 天）的留存只有 5.5%，年付为 19.9%（[Adapty](https://adapty.io/state-of-in-app-subscriptions/)）；健康健身是唯一一个年付占主导（60.6%）的品类。不过周订阅是 AI App 唯一留存反超非 AI App 的周期：12 个月留存 2.5%，非 AI 为 1.7%，另一来源给出的数字是 1.2%（[TechCrunch](https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows)）。由此得出三套方案：连载娱乐用"金币按集解锁 + 周 VIP"，教练和学习类用年付优先，一次性服务用套餐包。

推理成本已经不是文本和图片类产品的瓶颈，但视频类和重度用户需要单独设计。Gemini 2.5 Flash Image 每张图 $0.039（[Google](https://developers.googleblog.com/en/gemini-2-5-flash-image-now-ready-for-production-with-new-aspect-ratios/)）；在固定性能水平下，大模型价格每年下降约 13 倍（[Epoch AI](https://epoch.ai/publications/the-plunging-price-of-thought)）。但 AI 产品的平均毛利率只有约 45%，传统 SaaS 为 80–90%（[Ertas](https://www.ertas.ai/blog/ai-startup-gross-margins-inference)）。有一个案例里，8% 的用户消耗了 61% 的推理成本（[Medium](https://medium.com/gptalk/your-best-ai-customers-are-probably-your-least-profitable-ones-8ad56de9f7b9)）。所以视频和语音必须用积分或时长上限控制，不能做无限量订阅。

获客决定了生死。美国 Apple Ads 的 CPI 中位数是 $4.06，通用词 $5.31，竞品词 $6.78（[Admiral Media](https://admiral.media/apple-search-ads-benchmarks/)）；Meta 全球 CPI 在 2025 年 6 月一度达到 $23.76（[RocketShip HQ](https://www.rocketshiphq.com/meta-cost-benchmarks-mobile-app-installs/)）；健身 App 获取一个付费订阅用户要花 $25–$100（[AdWave](https://adwave.com/resources/fitness-app-advertising)）。用一个推算说明问题：一份 $69.99 的年付，扣掉约 30% 的商店分成后剩约 $49；按 AI App 21.1% 的年付留存，第二年的期望收入只有约 $10，两年 LTV 约 $59。这只能覆盖付费获客成本区间的低端。Cal AI 和 Blake Anderson 旗下的 App 之所以能赚钱，主要靠付费达人和 UGC 短视频，而不是效果广告；Blake Anderson 自报 Umax 月收入约 $35–50 万、Plug AI 约 $20 万，均未经审计（[Scale Nuggets](https://scalenuggets.beehiiv.com/p/23yearold-whos-making-11myear-ai-apps)）。

需要避开的坑大多已经有人踩过。第一，只卖"更便宜的内容"：Chegg 和 Gauth 说明，免费的通用助手会把付费意愿压到零。第二，追逐病毒式峰值：Sora 的下载量在 2025 年 12 月环比下降 32%，2026 年 1 月又下降 45%，随后掉出前 100。第三，进入受监管的品类：Woebot 退出、Character.AI 破产、Illinois 的禁令、COPPA 的单独同意要求，都会把小团队拖进合规成本。第四，Apple 审核：2026 年 6 月，Apple 把 4.3 条款扩大到"低价值内容"，在饱和品类里，不更新、没有用户的 App 可能被下架（[MacRumors](https://macrumors.com/2026/06/09/app-store-guidelines-low-quality-apps/)）；对恋爱向 AI 伴侣的 18+ 声明截止日期是 2027-01-12。第五，版权和肖像：NewsBreak 为复制内容支付了 $1.75M 和解金，Suno 仍在和 UMG、Sony 打官司。第六，品牌反噬：Duolingo 宣布"AI 优先"后遭遇公开抵制（[TechCrunch](https://techcrunch.com/2025/04/30/duolingo-launches-148-courses-created-with-ai-after-sharing-plans-to-replace-contractors-with-ai)），面向用户时应该强调"更个性化"，而不是"不再用人"。最后，退出路径值得提前规划：Cal AI 被 MyFitnessPal 收购，Runna 被 Strava 收购，Pixelberry 被 AI 游戏公司收购。在内容型品类里，被手握数据或分发的在位者收购，往往是比独立做大更现实的结局。

## 数据局限：哪些数字能直接引用，哪些必须先核实

这份报告的证据基础有四个结构性弱点。第一，笔记作者在研究时无法直接访问 Sensor Tower、Appfigures、TechCrunch、SEC、a16z、Deadline 等多数原始页面，几乎所有数字都来自搜索结果对这些页面的摘要；共享搜索额度又在研究中途用完，导航、天气、工具类收入、音乐流媒体、Reference、Medical 等品类的覆盖很薄。第二，没有获得任何供应商发布的"美国按 App Store 分类"的消费表，报告中的品类规模要么是单个 App 的代理指标，要么是"全球品类规模 × 美国占比"的推算。第三，第三方收入都是估算，Sensor Tower 的周收入多为毛收入，Appfigures 多为扣除商店分成后的净收入，各家还分美国或全球、iOS 或双平台，不能混在一起比较。第四，排行榜的六维分数是分析判断，不是统计模型，权重可以按读者的资源禀赋调整。例如资金充足的团队可以降低 F、提高 B 的权重，短剧会因此升到第一。

此外，许多在位 App 的价格本轮没有核实，包括 Duolingo、Babbel、Speak、Calm、Headspace、Audible、MasterClass、BetterHelp 的标价，报告中的价差只用了有来源的价格点。笔记里还有两份标注为 "UNVERIFIED" 的分析师背景清单：美国畅销榜候选名单和 26 个分类的头部 App 地图。本报告没有把它们当作事实引用。以下是正文涉及的主要数据冲突：

| 指标 | 说法 A | 说法 B | 本报告的处理 |
|---|---|---|---|
| ReelShort 2025 年收入 | $785M（MPA，经 [Deadline](https://deadline.com/2026/08/microdrama-reelshort-revenue-profit-1237027492/)） | 约 $1.2B 消费者总支出（Appfigures，经 [Filmustage](https://filmustage.com/blog/short-drama-apps-compared-reelshort-vs-dramabox-in-2026/)） | 口径不同，正文用 MPA |
| 短剧 2025 年全球规模 | $2.98B IAP（Sensor Tower） | 约 $11B（[Drama.so](https://drama.so/en/blog/short-drama-statistics)） | 用 Sensor Tower |
| 短剧 2026 年 Q1 增速 | 约 +20%（[Sensor Tower](https://sensortower.com/blog/state-of-short-drama-apps-2026-report)） | 按 2025 年 Q1 近 $700M 计算约 +7% | 基数可能已被修订 |
| Character.AI 收入 | FY2025 约 $23.6M（破产文件摘要，[Bondoro](https://bondoro.com/character-ai/)） | 2025 年中年化 $30M、目标 $50M（[Sacra](https://sacra-pdfs.s3.us-east-2.amazonaws.com/character-ai.pdf)） | 倾向法院文件 |
| Cal AI 收入与人数 | 年收入 $30M+，7 名员工（[TechCrunch](https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens)；[MLQ](https://mlq.ai/news/myfitnesspal-announces-acquisition-of-teen-founded-cal-ai-app/)） | 约 $10M ARR（[Sacra](https://sacra.com/c/cal)）；另有 30 人的说法 | 用 $30M+，并注明存在冲突 |
| Chegg 2026 年 Q3 收入 | $46.5M，−40%（[Morningstar](https://www.morningstar.com/news/globe-newswire/9868915/chegg-reports-third-quarter-2026-earnings)） | 约 $51.8M，−51%（另一份笔记，引 [GlobeNewswire](https://globenewswire.com/news-release/2026/11/03/3394197/0/en/chegg-reports-third-quarter-2026-earnings.html)） | 用 $46.5M；$51.8M 与 Q2 的 $51.85M（[Barchart](https://www.barchart.com/story/news/3692956/chegg-nysechgg-surprises-with-q2-cy2026-sales-but-stock-drops)）几乎相同，疑为混入 |
| Praktika 收入 | 约 $55M ARR（arr.club，单一来源） | 每月 $5 万到 $100 万以上（AppGoblin 等） | 标为未核实 |
| PhotoRoom ARR | 2024 年 €50M（公司，经 Sifted） | $65M 或 $94M（[Sacra](https://sacra.com/c/photoroom) 两个页面互相冲突） | 用公司数字 |
| Co–Star 收入 | 约 $400K/月（Screensdesign） | iOS "$10K+/月"（AppGoblin） | 只作量级参考 |
| 美国 2026 年 Q2 App 消费 | −3%（单一二手来源，[iDrop News](https://www.idropnews.com/news/q2-2026-mobile-gaming-revenue-decline/267257)） | 2025 年美国非游戏 +26.8% | 待核实，可能反映游戏下滑 |
| 健康健身 IAP 规模 | $4.5B，+13%（[MobileMarketingReads](https://mobilemarketingreads.com/?p=50285)，未注明美国还是全球） | 2025 年全球预计超过 $4B（[Sensor Tower](https://sensortower.com/blog/state-of-mobile-health-and-fitness-in-2025)） | 视为全球口径 |

还有几类数字只适合作为方向参考，不能当作精确值引用：2026 年 Q1 美国短剧 IAP 年化 $0.8–1.4B、AI App 占美国非游戏消费 6–12%、CapCut 美国年化收入 $210–250M、BetterHelp 每用户每月约 $205、Noom 每用户每月约 $9–11 的教练成本、AI 短剧单部生成成本。这些都是笔记或本报告的推算，不是供应商发布的数字。占星、信仰、考试题库、可玩短剧这四个品类排名靠前，主要依据的是劳动结构和价格锚，而不是已经观测到的 AI 原生产品收入，在投入资源之前应优先补充数据，并用小规模投放做验证。

## 结论

这份榜单显示，AI 把内容的生产成本推向零之后，App 生意的护城河从供给侧移到了需求侧。谁能生产内容已经不重要，重要的是谁能把内容卖出去、留住用户、并装进合规的外壳。这就解释了一个反直觉的现象：人工价差最大的品类（心理咨询、报税、法律）并不是小团队的最佳战场。执照越硬，AI 越先被在位者拿来扩大人工产能，TurboTax Live 增长 37%、LegalZoom 把"人工把关"写进订阅，都是例子。没有执照的品类则正好相反，AI 原生产品可以直接替代人工，例如 Pocket FM 和 Cal AI。

对小团队来说，现实的目标是在一个"按集付费或习惯闭环 + 轻监管 + 通用助手不屑做"的细分里做到 $1M–$10M ARR，并把"被手握数据或分发的在位者收购"当作正常的退出路径，而不是失败。未来 12 个月有三个外部变量最值得跟踪。第一是 Apple 18+ 规则在 2027 年 1 月落地后，恋爱向 AI 内容的投放空间会收缩多少。第二是 ChatGPT Apps SDK 会不会从分发渠道变成截流入口，Speak 和 Quizlet 已经接入。第三是视频生成的每秒单价还会降多少。一旦它再降一个数量级，AI 短剧的主导权有可能从中国出海巨头向小型内容工作室分散。
