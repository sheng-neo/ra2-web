# GLP-1 竞品 — Google Play 侧情况

抓取日期：2026-11-20（美西）。方法：`google-play-scraper` 的 `app()` 端点（公开商店信息，无登录）+ 2026-11-19 抓的 712 条 Play 评论（`reviews.csv`，source=googleplay）。Play 评论正文上限 500 字符；Shotsy / MeAgain 只抓了最新 200 条（有截断），其余 App 为全量。

## 1. 先说大局：12 个 A 组 App 里只有 6 个上了 Google Play

| 在 Play 上 | 不在 Play 上（2026-11-20 重新探测，仍为 404） |
|---|---|
| Shotsy、MeAgain、Glapp、Pep、DreamMe、JellyPal | Preserve、GLPro、Ember、Free.Well、Superbrandnew GLP-1 Tracker、GLPTracker（C2M） |

关键点：**Preserve（定位和我们最像的对手）没有安卓版**，今天重测仍是 404。GLPro 也没有（官网仍是 Coming soon）。安卓端我们真正的对手只有 Shotsy 和 MeAgain。

## 2. 六个安卓 App 的现状（2026-11-20 当天拉的商店数据）

| App | 评分 / 评分人数 | 安装量级 | 最近更新 | 版本 | Play 内购价区间 | 广告 |
|---|---|---|---|---|---|---|
| Shotsy | 4.67 / 13,534 | 100,000+ | 2026-10-29 | 2.9.0 | $12.99–$39.99 | 无 |
| MeAgain | 4.67 / 3,721 | 100,000+ | 2026-11-12 | 2.4.0 | $14.99–$119.99 | 无 |
| Glapp | 4.63 / 527 | 10,000+ | 2026-11-09 | 1.1.52 | $4.99–$39.99 | 无 |
| Pep | 4.68 / 2,046 | 10,000+ | 2026-11-05 | 3.1.5 | $9.99–$39.99 | 无 |
| DreamMe | 4.58 / 763 | 10,000+ | 2026-10-05 | 1.5.4 | $0.99–$69.99 | 无 |
| JellyPal | 无评分 / 无人数 | 10+ | 未知 | 随设备而异 | $8.49–$49.99 | 无 |

- 全部免费下载、全部无广告。分类除 Pep 是 Medical 外均为 Health & Fitness。
- 与 11-19 相比评分人数几乎没动（Shotsy 13,498→13,534；MeAgain 3,717→3,721；Glapp 523→527），一天的增量可以忽略。
- 安卓盘子比 iOS 小得多：Shotsy Play 评分 13.5k，对应 App Store 35.1k；安装量 100,000+，而它全平台下载已过 100 万。粗估安卓用户占其总量约 1/4–1/3。
- JellyPal 在 Play 上基本是死的：10+ 安装、无评分、无评分人数，只有 4 条评论（全是 5★）。上了架不等于有用户。

## 3. Play 评论口碑（712 条，只看 Play 端）

| App | 抓到条数 | 1–3★ 占比 | Play 端最突出的主题 |
|---|---|---|---|
| Shotsy | 200（最新 200，上限） | 15%（30/200） | H9 试用扣费 10、H14 副作用 8、H1 改记录 7、H11 提醒 7 |
| MeAgain | 200（最新 200，上限） | **50%（100/200）** | H4 卡顿/崩溃 34、H9 价格 26、H5 拍照不准 15 |
| Glapp | 107（全量） | 19%（20/107） | H9 价格 7、H14 副作用 7、H10 排针 6、H8 曲线 5 |
| Pep | 162（全量） | 20%（32/162） | H5 拍照不准 9、H1 改记录 8 |
| DreamMe | 39（全量） | **62%（24/39）** | H4 卡顿 11、H5 拍照 3 |
| JellyPal | 4（全量） | 0% | 无主题命中 |

Play 端主题总排名：H4 卡顿/打不开 55 条 > H9 价格/试用扣费 49 条 > H5 拍照识餐不准 31 条 > H1 历史难改 26 条。

### 3.1 MeAgain：Play 端是它的软肋

App Store 最新 500 条里 MeAgain 只有 10 条 1★，Play 最新 200 条里 1★ 有 49 条、1–3★ 共 100 条。Play 差评集中在两件事：

- **卡顿/崩溃/打不开**（34 条，Play 端第一）：“app freezes up and stops working, can't stand paying for a service that causes me to spend an hour trying to log my water intake”（2026-10-31，2★）；“Very expensive, no trial option, took the leap and paid but it has constant crashes and bugs.”（2026-09-24，1★）
- **强制付费、扣费不透明**（26 条）：“APP is NOT free. wants $82.99/year… If you advertise it as FREE... it SHOULD be FREE. nothing would work without paying the $83.”（2026-11-16，1★）；“I clicked on the option to pay monthly and they still charged me for the full year… now im stuck with a $65 app I wont be using.”（2026-10-27，2★）；广告主推的水豚挂件也要订阅才给：“you don't get the capybara tamogatchi unless you pay for a subscription ($30 a month??? or only $82 a year 🙄)”（2026-11-08，2★）

### 3.2 Shotsy：Play 口碑比 MeAgain 稳，但试用扣费跨端都存在

- 1–3★ 只占 15%，是两个大 App 里 Play 口碑最好的。
- 但 H9 的抱怨和 App Store 同源：“I canceled this in the free trial and was still charged.”（2026-11-17，1★）；“clicked the 7 day free trial… decided it was not the one for me. Went to cancel this is all in the same day. Was already charged for the full year.”（2026-10-23，1★）
- 数据丢失也有 Play 端证据：“The app logged me out and then lost 6 months worth of data and progress tracked.”（2026-09-10，1★，见 summary H3）
- 提醒缺口：“I don't need a shot reminder… I wanted something that helps remind me of protein, water and exercise needed.”（2026-10-18，1★）

### 3.3 DreamMe：样本小但差评率最高

39 条里 1–3★ 占 62%，主要是打不开/记不了体重：“I'm unable to log my weight”（2026-11-13，2★）；“the app asks for a rating before even using it.”（2026-10-18，1★）。量级太小（763 个评分），不能当作大结论，但说明它安卓端体验有问题。

### 3.4 Glapp 与 Pep

- Glapp：排针不支持一周两针是 Play 端点名的问题：“My schedule is every Tuesday and Friday… Only useful feature (for me)”（2026-06-20，1★）。其余是价格和曲线。
- Pep：Play 端最出圈的一条是 H5 拍照估算翻车：“it estimated that it was about 450 calories, while in reality, it was closer to 900. That can be very dangerous if you're relying on it to lose weight.”（2025-12-11，4★）

## 4. 对我们的启示

1. **安卓端竞争比 iOS 端松**：12 个对手里一半没有安卓版，包括定位最像我们的 Preserve。同步上安卓，我们在安卓端直接面对的只有 Shotsy、MeAgain 两个成规模的对手。
2. **MeAgain 的安卓用户最容易抢**：Play 端一半差评、卡顿+强制年费是主因。一个稳定的安卓 App + 月付透明定价，直接对着它的软肋打。
3. **试用—扣费—取消链路必须干净**：Shotsy 在 Play 端也被同一类投诉缠着（当天取消仍扣全年费）。我们的 P0 必须做到试用规则一眼看懂、可一键取消，否则会继承同样的差评。
4. **安卓盘子小，别指望它当主力增长盘**：Shotsy 安卓评分人数只有 iOS 的约 38%，安装量级 100,000+。安卓是补充市场和防守位，不是第一增长曲线。
5. **JellyPal 的教训**：上了 Play、10+ 安装、4 条评论——只上架不获客等于不存在。Preserve 在 iOS 上 5 个月 0 评论也是同一个教训。

## 附录

- 商店详情快照：`raw/gp_details_20261120.json`（`app()` 端点原始返回值，含 summary、developer、released、version、IAP 区间等）。
- 评论数据：`reviews.csv`（source=googleplay 的 712 行），主题归类见 `summary.md` 第 2–3 节。
- 抓取脚本：`scripts/gp_details_20261120.py`。
