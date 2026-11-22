# 05 竞品用户迁移与进攻面（后来者策略调研 · 专题五）

日期：2026-11-22 · 范围：英文 GLP-1 伴侣 App 的用户从哪换到哪、为什么换、数据能不能带走，以及我们该接哪些人、用什么接。

**读之前先看这五条限制：**

1. 本专题以本地数据为主。主体证据是仓库里已有的 2,562 条商店评论（`research/store-reviews/reviews.csv`，2026-11-19 抓取，美区 App Store 1,850 条加 Google Play 712 条）。其中 GLP-1 专用 App（下称"A 组"，9 款）共 2,083 条，综合 App（MyFitnessPal、Noom、Lose It!、Oura、Cal AI，下称"B 组"）共 479 条。
2. 这批评论只来自美区商店，Google Play 一侧抓取时还限定了英文。所以它回答不了"中文用户怎么换 App"，只能回答"这个品类的用户因为什么换"。把这里的结论搬到中文市场，是推断，不是证据。
3. 评论是自己愿意写的人写的，不是用户抽样。下面所有"条数"都是"在这批评论里出现了几次"，不能换算成"有百分之几的用户流失"。
4. 条数分两种，文中分开标注："逐条读过"指我把正则命中的评论全文读完后人工归类的条数；"正则命中"指只按关键词统计、没有逐条判定的条数。
5. 本轮 8 次搜索全部用完。网页一个都没能直接打开（`meagain.com`、`shotsyapp.com` 不在会话的网络白名单里，iTunes Lookup 接口返回 403）。所有外部事实取自搜索结果摘要，摘要和具体链接的对应关系没有逐条核对，写进对外材料之前要打开原文再核一遍。

引用评论的格式是：原文（App，来源，星级，日期，review_id）。App Store 和 Google Play 的商店页地址见文末"来源"一节，用 review_id 可以在 CSV 里查回全文。

---

## 一、一页结论

1. **这个品类里换 App 是常态，而且方向是双向的，没有谁锁得住用户。** A 组 2,083 条评论里，有 54 条写到自己试过或同时用过好几款（正则命中）；逐条读过后，明确写出"从 A 换到 B"的有 15 条，其中从 Shotsy 换出去的 6 条，换回或选回 Shotsy 的 3 条；另有 2 条是离开 Shotsy 之后表示后悔或想回去。
2. **让人动手换 App 的头号原因不是"缺功能"，而是"被收回"和"被扣钱"。** 在 A 组 437 条 1–3 星评论里，带有离开、取消、劝别人别用这类措辞的有 107 条（正则命中）；这 107 条里排前四的触发原因是：试用即扣费或不付费不能用（24 条）、更新后打不开或卡死（24 条）、原来免费或已付费的功能被锁进付费墙（22 条）、食物记录不好用（19 条）。"维持期"是 0 条，"导不出数据"是 2 条。
3. **Shotsy 在 2026 年 8–11 月接连出了三件得罪老用户的事，这是本轮查到的最大一块进攻面。** 一是老付费用户续费后被要求加钱才能看原有功能（年费从约 20 美元到 40、60 美元，评论原话）；二是药物水平曲线从免费变付费；三是 10 月中旬的 3.4.0 版更新后，一批用户被要求重新走引导、历史数据看不到了（10-21 到 11-05 之间 7 条一星）。有用户直接写："If you’re going to put up a paywall, at least allow a way to download our data or give a warning!"
4. **MeAgain 最容易丢的是安卓端还没付过钱的新用户，其次是续费时被涨价的老用户。** Google Play 最近 200 条里一半是 1–3 星；其中 17 条是"装上就要先付费、没法试用"（逐条读过）。续费涨价有一条原话写的是 39.99 美元一年涨到 119.99 美元一年。它也是四家头部里唯一确认没有导出功能的，为此走掉的用户有 2 条一手评论。
5. **数据导出和导入的现状是：只有 Shotsy 确认能导出 CSV 和 PDF；MeAgain 确认导不出；Glapp 能导入 Shotsy 的数据（一条评论，机制没查到）；Pep 在 2026 年 9 月才加了备份。** CSV 的列格式一家都没查到。
6. **Apple Health 当不了"打针记录"的迁移桥梁。** 苹果在 iOS 26 开放的用药接口是只读的，第三方 App 不能把用药记录写进 Health（苹果开发者关系团队在论坛的答复）。Health 能桥接的只有体重、热量、蛋白、饮水这类数据。我们的网页版读不了 Health，这条路现在更走不通。
7. **迁移工具值得做，但要做成"通用的贴进来、拍进来"，而不是"某一家的专用导入器"；专用的只值得先做 Shotsy 一家。** 理由是：评论里"以前用备忘录、表格、纸"的条数（逐条读过 6 条）和"从别的 App 换过来"的条数（15 条）在同一个量级；中文用户的旧工具大概率是前者；而 Shotsy 是唯一确认有 CSV 可导、盘子最大、眼下又有人想走的一家。
8. **本轮没有查到 6 个新入场者的任何新动作，但查到一家不在原名单里的新入场者。** Bild Health 在 2026 年 10 月下旬同时上了 App Store 和 Google Play，定位是"用 GLP-1 时保住并增加肌肉"，基础免费，Pro 59.99 美元一年（PR Newswire 新闻稿，未核实）。"保肌"这块地继续变挤。

---

## 二、按问题分节的证据

### 问题 1：谁从哪个 App 换到了哪个，为什么

**方法。** 第一轮用换 App 的常见说法做正则（switched、moved to、going back to、alternative、deleted、uninstall、instead of、other apps、tried several、import、transfer 等），全库命中 283 条。第二轮对 A 组补了一组"要走"的说法（not renew、stop using、I'm out、hard pass、find something else、stick with 等），新增 46 条。A 组命中的评论我逐条读过（特别长的只读了前 900 到 1,200 个字符）；B 组的 93 条只读了关键词前后的上下文，没有逐条读全文。脚本在 `/tmp` 下本专题自己的目录里，没有放进仓库。

**1.1 明确写出来源和去向的（逐条读过，共 15 条）**

| 从 | 到 | 条数 | 评论里写的原因 | 代表原话 |
|---|---|---|---|---|
| Shotsy | Glapp | 4 | Glapp 当时免费；周报和解读更多；能把 Shotsy 的数据导进去 | "I was using Shotsy previously, and it was worse in every way while hiding a bunch of features behind a ridiculous subscription."（Glapp，App Store，5★，2026-05-07，14038339013）；"And as a bonus, I was able to easily import my data from shotsy."（Glapp，App Store，5★，2026-05-26，14109089585） |
| Shotsy | MeAgain | 1 | 打针日清单、连续打卡、蛋白和纤维放在首页、吉祥物聊天 | "Switched over from Shotsy — this is the one that stuck."（MeAgain，App Store，5★，2026-10-08，14643071839） |
| Shotsy | Pep | 1 | Shotsy 安卓版只能用 Google 账号登录，用户不想让 Google 知道自己用什么药（2025 年的评论，现在是否仍然如此没查到） | "I could only sign in with my Google account to use." "I deleted it and found Pep. Pep didn't ask anything identifying about me."（Pep，Google Play，5★，2025-09-29，590043a6…） |
| MeAgain | Shotsy（一条另加 Cronometer） | 2 | 条码扫描卡死；数据导不出；没法给医生看；通知太多 | "The only way to get data out is by sending a request to support." "So, I switched to Shotsy and Cronometer Gold."（MeAgain，App Store，2★，2026-10-04，14627842238）；"I don't want multiple notifications about drinking water or other things that is why I chose this over MeAgain."（Shotsy，Google Play，5★，2026-11-08，bdd60727…） |
| Pep | Shotsy | 1 | Pep 录入笨重、界面信息太多 | "I think I'm going to stick with Shotsy."（Pep，Google Play，2★，2025-10-17，4f4bb188…） |
| 没点名的另一款 GLP-1 App | Glapp | 4 | 朋友推荐；Glapp 出了安卓版；功能更全；原来那款免费版太简陋 | "Previously used two other apps before switching to this one when it became available on Android."（Glapp，Google Play，4★，2026-07-23，a2e116a6…） |
| MyFitnessPal、Lose It! | MeAgain | 2 | 并排用了一个月后选了 MeAgain；它有 GLP-1 专属内容 | "I was using Myfitness Pal for 5 months and stumbled upon MeAgain and really loved the graphics. I used both side by side for a month"（MeAgain，App Store，5★，2026-10-08，14643603900） |

另有 2 条是 Glapp 收费后想回 Shotsy 的（第一条和上表 Shotsy 到 Glapp 的 4 条里的一条是同一条评论）："No different than any other paid app so I wish I hadn't deleted shotsy because at this point it was a cheaper deal"（Glapp，App Store，1★，2026-06-18，14199604377）；"why would I choose glapp when shotsy is $30 a year?"（Glapp，Google Play，3★，2026-06-20，5b3e6647…）。

**1.2 写了要走、但没说去哪的（逐条读过）**

| 从 | 条数 | 触发事件 | 代表原话 |
|---|---|---|---|
| Glapp | 8 | 2026 年 6 月中旬上线付费档 Glapp Max，把原来免费的周报和解读收进付费墙 | "I will be moving to a different app"（Google Play，1★，2026-06-19，2f00110e…）；"I’m currently looking for another app to use that I don’t have to pay for to see progress and updated."（App Store，2★，2026-07-09，14282042017）；"Sadly, loyal users had to jump ship due to the cost."（App Store，4★，2026-09-21，14576930099） |
| Shotsy | 6 | 老付费用户续费后功能被模糊并要求加钱（3 条）；免费功能变付费（1 条）；安卓小组件坏了（1 条）；强制登录（1 条） | "I’ve been paying $19.99 yearly for the app which renewed end of September. Now I get a message that to get features I had paid for, I need to pay an additional $59.99/yr? Will not renew again and will be switching to a different app."（App Store，1★，2026-10-04，14628739378）；"Hard pass. Time to find a new app to use once my subscription expired."（App Store，1★，2026-09-15，14552213857）；"As soon as I have to login for data that should be stored locally... I'm out."（Google Play，1★，2026-09-28，d3981c70…） |
| MeAgain | 6 | 涨价；选了月付却被扣年费；不付费不能用；像蛋白棒广告 | "the Premium version I signed up for at $39.99/year went up to $119.99/year and if you go month to month it’s $14.99/month. I guess I’ll stay on free or move to another app."（App Store，4★，2026-09-29，14607846917）；"Going back to using Macros First."（Google Play，2★，2026-07-17，dc089209…）；"Using the Lilly app. Free and easy."（App Store，2★，2026-09-20，14572589961） |
| GLPTracker (C2M) | 3 | 2026 年 6 月把历史记录锁进 10 美元一个月的付费墙 | "Fortunately kept some records of my progress separate from app and screenshots of current data. Deleting the app now."（App Store，1★，2026-06-29，14241735233） |
| DreamMe | 4 | 更新后打不开；安卓版落后；记一杯水也要付费 | "might have to look elsewhere though if this one won't open anymore"（Google Play，3★，2026-07-26，2a3f91dc…） |
| Pep | 4 | 剂量被改回旧值且导不出；只有盎司没有毫升；选月付被扣年费；拍照和扫码识别不好用 | "I want a refund and to find an app that actually works correctly and can be exported for analysis."（Google Play，2★，2026-04-30，2d9b4fb3…） |

MeAgain 的 6 条里，去向分别是 Macros First、Samsung Health、礼来的官方 App、MyFitnessPal 免费版、"其他免费的记录 App"和"留在免费档或另找一款"，没有一条去了别的付费 GLP-1 App。这说明它流失的人主要流向"免费的通用工具"。

**1.3 还没装稳就走的：MeAgain 安卓端的"付费墙劝退"**

MeAgain 在 Google Play 的 100 条 1–3 星里，有 17 条是"走完全部引导才发现要先付费、没有试用，于是删了"（正则命中 20 条，逐条读后剔除 3 条无关的）。原话："There is no trial period so I deleted it. It looked too be well designed and thoughtful but I didn't even get to use it."（Google Play，3★，2026-09-28，25796919…）；"nothing would work without paying the $83."（Google Play，1★，2026-11-16，980b803f…）。App Store 一侧同类只有 2 条。另有一条四星评论说免费档其实存在，只是要点付费页角落的关闭按钮才进得去（Google Play，4★，2026-09-27，763f00bd…）。也就是说，这批人不是嫌贵，是没看到免费入口。

**1.4 从"没有 App"或卖药方自带工具换过来的（逐条读过，8 条：备忘录、表格、纸 6 条，卖药方自带 App 2 条）**

| 从 | 到 | 原话 |
|---|---|---|
| 表格 | Shotsy | "I used to rely on a spreadsheet to track everything, but switching to the free version of this app has been a huge improvement."（App Store，5★，2026-08-23，14463294557） |
| 备忘录 | Shotsy | "I just used notes before LOL."（App Store，5★，2026-09-27，14601441912） |
| 表格 | Glapp | "I began using Glapp instead of a spreadsheet"（App Store，5★，2026-09-27，14601701165） |
| 备忘录 | Pep、JellyPal | 各 1 条（Pep，App Store，5★，2025-07-08，12867432781；JellyPal，App Store，5★，2026-07-08，14279899610） |
| 纸 | GLPTracker (C2M) | 1 条（App Store，5★，2026-03-01，13803030407） |
| 卖药方自带的 App | Shotsy | "So much better than the app provided by the company I order from."（App Store，5★，2026-11-11，14780074071）；"The tracker that came from my GLP-1 provider doesn’t show past shots."（App Store，5★，2026-09-05，14516323646） |

反方向也有：付费墙一出来，有人就退回手工记录。"I’ve used this app for over a year, but I can do the tracking on my darn calendar."（Shotsy，App Store，1★，2026-10-08，14641980778）；"One could use a free spreadsheet to track the things this app offers for free now. Plug that into your AI of choice and get the same quality report."（Glapp，Google Play，1★，2026-06-20，25a5e8da…）。

**1.5 "跟卖药的平台解绑"是留在独立 App 的理由**

- "And if I switch providers, I can keep using Shotsy."（Shotsy，App Store，5★，2026-08-08，14403433318）
- Noom 的远程医疗用户在取消或停掉项目后，App 里的记录跟着没了："I lost my last 3 weeks of dosing in the app."（Noom，App Store，1★，2026-09-14，14550793417）；"as soon as I did, they canceled my access to the full Noom app. So I am on medication without medical support and without the app"（Noom，App Store，5★，2026-04-08，13936258462）。
- 这一点对中文市场有直接对应：专题二查到的中文侧对手主要是药企小程序和互联网医院自带的记录功能，它们同样和"在哪买药"绑在一起。

**1.6 同时试几款再留一款**

A 组里有 54 条评论写到自己试过或并用过多款（正则命中；专题四用较窄的关键词数到的是 31 条）。典型说法："I've tried 6 different GLP1 apps and tried them all at the same time for the first 2 months"（Glapp，Google Play，5★，2026-05-18，c33b0dcf…）。含义是：新用户的选型期大约是头一两个月，这段时间里谁都没有数据壁垒。

### 问题 2：语言，以及带数字的价格承受点

**2.1 语言和地区**

- 提到 Chinese、Mandarin、Cantonese、Taiwan、Hong Kong 的评论是 0 条；含中文字符的评论是 0 条（专题二已查过，本轮复核一致）。
- 非英文评论只有 1 条，是西班牙语："Excelente aplicación"（Shotsy，App Store，5★，2026-10-11，14654136862）。
- 直接要求加语言的只有 1 条，而且不在 GLP-1 App 里："the lack of Russian language support is holding me back."（Oura，App Store，4★，2026-10-12，14658299319）。
- 因为单位不合用而卸载的有 1 条："water intake can only be measured in ounces which is fine if your in the USA but much of the world uses ml or litres."（Pep，Google Play，2★，2025-09-13，9bb84d02…）。另有 1 条抱怨千焦数值不对（Pep，Google Play，2★，2026-09-22，77811440…）。
- 和"认不认得亚洲食物"有关的 2 条专题二已引用，这里只记结论：DreamMe 因为认得出炸猪排饭拿到日本用户的五星，Cal AI 因为把大酱汤认成"鸡肉和蔬菜"拿到一星。
- **怎么读这个结果：** 语言在这批评论里几乎不出现，不能读成"没人需要中文"。样本本身就是美区、英文，不会英文的人不会来这里写评论。它能说明的只有一点：英文头部 App 的评论区里看不到有组织的非英语用户群，它们目前也没有被这类需求推着走。

**2.2 价格：接受的和拒绝的（全部是评论原话里带数字的）**

| 态度 | 价格点 | 原话 |
|---|---|---|
| 接受 | 20 美元一年 | "The annual cost of $20 is completely affordable and worth it."（Shotsy，App Store，5★，2026-08-26，14474087279） |
| 接受 | 30 美元一年 | "I paid the $30 for the year and its been worth it."（Shotsy，Google Play，5★，2026-10-19，76cba97e…） |
| 接受 | 39.99 美元一年 | "I was happy to pay $39.99 for a year once that update was released."（Glapp，App Store，5★，2026-06-18，14198938891） |
| 犹豫 | 10 美元一个月或 40 美元一年 | "10 a month, or 40 a year"，同一条里写"with low income it’s not really an easy purchase to decide on"（Pep，App Store，4★，2026-06-19，14201513704） |
| 嫌贵 | 39.99 美元一年 | "$39.99 is steep when many of us are paying hundreds a month for the meds."（Shotsy，App Store，2★，2026-08-08，14404584865） |
| 拒绝 | 40 美元一年（原来免费） | "It's worth 10$ a year, but not 40$, not by a long shot."（Glapp，Google Play，星级栏是 5★，正文自述一度降到 1 星、拿到折扣码后改回，2026-06-17，3831bfad…）；"I’d probably even pay $10 one time for a pro version"（Glapp，App Store，3★，2026-06-17，14195303593） |
| 拒绝 | 60 美元一年 | "I just didn’t see $60/yr worth there right"（Shotsy，App Store，3★，2026-09-20，14574794236）；"for 59.00 I can do it on my own"（MeAgain，Google Play，1★，2026-10-13，5bdde6d9…） |
| 拒绝 | 15 美元一个月 | "$15/month?! That’s how much Netflix is."（Shotsy，App Store，1★，2026-10-08，14641980778） |
| 拒绝 | 20 美元一个月 | "$20/mo for a widget is crazy."（MeAgain，App Store，3★，2026-10-21，14692876588） |
| 拒绝 | 83 美元一年 | "nothing would work without paying the $83."（MeAgain，Google Play，1★，2026-11-16，980b803f…） |
| 拒绝 | 119.99 美元一年（从 39.99 涨上来） | 见 1.2 节 MeAgain 那条（14607846917） |

三点观察：

1. **在这批评论里，20–40 美元一年有人明说值，60 美元一年以上没有一条明说值，倒是有多条明说不值。**（推算：按上表归类；样本是自愿写评论的人，不能当作价格弹性的测量。）
2. **比绝对价格更伤人的是"变"。** 同样是 40 美元一年，Glapp 的新订户说乐意付，老免费用户说只值 10 美元。Shotsy 的老用户原话是"The annual has increased from $19, to $39, to $59."（App Store，1★，2026-10-17，14677923512）。
3. **同一款 App 对不同人报不同的价，本身就是差评来源。** "My wife got 42% off and was told it was $40. I got 42% and it is $70?!"（DreamMe，App Store，1★，2026-06-04，14144958935）；MeAgain 在评论里出现过的年费数字有 24、39.99、49.99、56、59.99、60、65、70、74、82.99、85.58、119.99 美元（均为不同用户的原话，含税与否不明）。

### 问题 3：把"想要但没有"细化成"会让我换 App 的理由"

**方法。** 已有汇总按"提到某主题的条数"排序，正面提及和抱怨混在一起。这里换一个口径：只看 A 组的 1–3 星评论（437 条），再从中筛出带有离开、取消、卸载、另找、劝别人别用这类措辞的（107 条），按触发原因分类计数。一条评论可以同时算进多个原因。全部是正则命中，分类有噪音，适合看排序，不适合看精确数字。

**3.1 带"要走"措辞的 1–3 星评论，按原因和 App（正则命中）**

| 排名 | 会让人换 App 的理由 | Shotsy | MeAgain | Glapp | Pep | DreamMe | 其他三款 | 合计 |
|---|---|---|---|---|---|---|---|---|
| 1 | 试用即扣费、不付费不能用、退款难 | 5 | 11 | 1 | 2 | 3 | 2 | 24 |
| 1 | 更新后打不开、卡死、闪退 | 3 | 7 | 2 | 1 | 9 | 2 | 24 |
| 3 | 原来免费或已付费的功能被收进付费墙 | 4 | 2 | 10 | 0 | 1 | 5 | 22 |
| 4 | 食物记录不好用（库不全、条码或拍照不准、还得另开一个 App） | 1 | 7 | 0 | 6 | 4 | 1 | 19 |
| 5 | 通知、AI、吉祥物、求好评弹窗太烦，或界面太复杂 | 0 | 4 | 0 | 4 | 0 | 1 | 9 |
| 6 | 客服不回 | 0 | 2 | 1 | 1 | 3 | 1 | 8 |
| 7 | 和 Apple Health、Health Connect、体重秤同步出问题 | 0 | 3 | 0 | 0 | 2 | 2 | 7 |
| 8 | 价格太高或涨价（不含上面的付费墙和扣费） | 3 | 2 | 0 | 1 | 0 | 0 | 6 |
| 8 | 安卓版落后、小组件或手表缺失 | 1 | 2 | 1 | 0 | 1 | 1 | 6 |
| 10 | 数据丢失或被清空 | 2 | 1 | 0 | 0 | 2 | 0 | 5 |
| 11 | 口服药、复方、一周多针、其他肽类不支持 | 1 | 1 | 2 | 0 | 0 | 0 | 4 |
| 12 | 换手机或重新登录后出问题 | 2 | 0 | 0 | 0 | 1 | 0 | 3 |
| 12 | 单位或地区不合用 | 0 | 0 | 0 | 3 | 0 | 0 | 3 |
| 14 | 导不出数据、没法给医生 | 0 | 2 | 0 | 0 | 0 | 0 | 2 |
| 15 | 隐私或强制登录 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| 16 | 维持期或停药后没有功能 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

各 App 这一类评论的总数：Shotsy 21、MeAgain 29、Glapp 18、Pep 16、DreamMe 15、其他三款（Free.Well、GLPTracker (C2M)、Superbrandnew）8。

不加"要走措辞"这道筛、只看全部 1–3 星时，排序略有不同：打不开或卡死 86 条、食物记录 63 条、试用扣费 61 条、付费墙收回 51 条、太烦或太复杂 36 条、客服 27 条、价格 25 条、换手机或登录 23 条、同步 23 条、药物形态 19 条、数据丢失 18 条。数据丢失在 Shotsy 一家就有 10 条。

**3.2 每家各自的"换 App 理由"，按出现次数**

- **Shotsy：** 付费墙收回（4）≈ 试用扣费（5）＞ 涨价（3）≈ 打不开（3）＞ 数据丢失（2）≈ 换手机或登录（2）。App Store 一侧以"收回"和"涨价"为主，Google Play 一侧以"试用扣费"为主。
- **MeAgain：** 不付费不能用和扣错钱（11）＞ 打不开或卡死（7）≈ 食物记录（7）＞ 太烦（4）＞ 同步（3）。Google Play 一侧占了 29 条里的 21 条。
- **Glapp：** 付费墙收回（10）一项独大，其余都是个位数。
- **Pep：** 食物记录（6）＞ 太复杂（4）＞ 单位（3）。
- **DreamMe：** 打不开（9）一项独大。
- **GLPTracker (C2M)：** 5 条全是"历史被锁进付费墙"。

**3.3 "有了它我就给五星、就付费"的功能（逐条读过，取的是 4–5 星和 3 星里带条件句的评论）**

这类不是"我要走"，而是"差这一样"。它们是把人留下或拉过来的钩子。

| 功能 | App | 原话 |
|---|---|---|
| 维持期 | Glapp | "This app desperately needs a maintenance setting. I’d get the paid version if it had that!"（App Store，3★，2026-09-08，14527344446）。另有一条"I wish you could pause treatment"（Glapp，App Store，5★，2026-05-21，14089126725） |
| 口服药 | Shotsy 安卓、Glapp | "the android version doesn't support the daily wegovy tablets yet, just the injections & I switched to the tablets last week."（Shotsy，Google Play，4★，2026-09-27，b6542ec4…）；"However I switched to the Wegovy pill and there are no options to enter for the pill, so the app is less helpful for me now."（Glapp，App Store，3★，2026-06-23，14217510330） |
| 复方、分次给药、一周两针 | Shotsy、Glapp | "I would give it five stars if it gave the option for compound meds as I am currently taking tirz and B6."（Shotsy，Google Play，4★，2026-10-14，26848a0e…）；"I liked the app until Dr wanted me to split the dose."（Shotsy，App Store，3★，2026-07-28，14358258552）；Glapp 不能按周二、周五排针（Google Play，1★，2026-06-20，1afa1ca2…） |
| 食物记录并进来，不用再开第二个 App | Shotsy | "So I still have to use the MFP app as well."（App Store，3★，2026-08-14，14426814127）；"Must calculate  eating from another app."（App Store，2★，2026-08-19，14447316003） |
| 库存、批号、有效期 | Shotsy | 2 条五星和 1 条四星都要（2026-11-11、2026-11-02、2026-08-24），其中一条说为此还留着一张表格 |
| 打针日具体怎么吃喝 | MeAgain | "I thought this app would give me more specific information to help me manage reactions and to plan out specifically what I should eat and drink on shot days such as amount of protein, electrolytes and water."（App Store，1★，2026-10-24，14707890466） |
| 只要记录、不要 AI 和提醒轰炸 | MeAgain | "I don’t need AI. I just need to be able to track things and see my history easily."（App Store，1★，2026-08-29，14488380302） |
| 体围、进度照片 | MeAgain、Shotsy | "I still need to keep them on paper."（MeAgain，App Store，4★，2026-08-28，14481885457） |

**3.4 和已有汇总对照，有两处要修正认识**

1. **维持期是"付费的钩子"，不是"离开的理由"。** 带"要走"措辞的评论里它是 0 条。用户不会因为没有维持期就走，但会因为有它而付费或留下。它适合做差异点和付费点，不适合拿来当"你现在的 App 没有"的进攻文案。
2. **导出也不是主流的离开理由（2 条），但它是出事时的保险。** 平时没人提；一旦付费墙或更新把数据锁住，它立刻变成最响的诉求，见问题 4。

### 问题 4：头部竞品的导出、导入能力，以及 Apple Health 能不能当桥

**4.1 四家对照**

| | 导出 CSV | 导出 PDF | 导入 | 账号与跨设备 | 来源 |
|---|---|---|---|---|---|
| **Shotsy** | 有。用户原话"I can export it all in a CSV file"（App Store，5★，2026-11-15，14794174834）；App Store 更新说明里有一句"CSV export now uses hundredths on weight values"（搜索摘要转述）。列格式没查到 | 有。"Biggest perk I think too is the PDF export function to send to my doctor for all my stats!"（App Store，5★，2026-10-31，14733615970） | 没查到文件导入。能从 Apple Health 自动读体重、热量、蛋白、饮水（App Store 页面描述） | iPhone 端数据在本机并经 iCloud 同步（已有研究 A）；安卓端要登录。有用户说从安卓换到 iPhone 时数据带不过去："there is no way to export your data if you switch from a PC phone to an Apple one."（App Store，5★，2026-08-28，14484072148） | https://apps.apple.com/ca/app/id6499510249 |
| **MeAgain** | 没有 | 没有。它自己的对比页把"还没有 PDF 导出"列为自家缺点（厂商自述，未核实） | 没查到文件导入。能和 Apple Health、Health Connect 同步（厂商自述） | 要账号。导出只能向客服提申请：见 1.1 节原话（14627842238）；另一条"you cannot export your data"（App Store，1★，2026-08-26，14475879709） | https://meagain.com/best-glp-1-tracker-apps |
| **Glapp** | 没查到直接证据。上面那条 MeAgain 一星评论把 Glapp 列在"能导出"的几款里（单一来源，未核实） | 有给医生看的周报（已有研究 A），是不是 PDF 文件没查到 | 能导入 Shotsy 的数据（一条评论，14109089585）。走的是文件还是别的方式，没查到 | 有网页版，账号通用，网页上的数据会带进 App："happy to see everything transferred to the app without a problem."（Google Play，5★，2026-05-19，c7172527…） | 评论语料 |
| **Pep** | 没查到。2026-04 有用户因为导不出而想走（2d9b4fb3…） | 没查到 | 没查到 | 早期不需要账号，换手机会丢数据："had to switch phones and all my weight loss and medication progress are gone."（Google Play，3★，2026-09-01，e8d32798…）。2026-09 下旬加了备份："New Back Up Feature"（App Store，5★，2026-09-28，14602933400） | 评论语料 |

关于 Shotsy 的导出是否免费，证据互相矛盾：一条评论写"I found that the export is available on the free version!"（App Store，5★，2026-08-09，14407375863），已有研究 A 引用的第三方评测写导出属于付费档 Shotsy+。2026 年 8–10 月它的付费边界一直在动，现状没查到。

**4.2 数据被锁住的那一刻，导出才被想起来**

- "I can no longer access the 2 years of data that had been stored in the app that I would regularly share with my healthcare providers. If you’re going to put up a paywall, at least allow a way to download our data or give a warning!"（Shotsy，App Store，1★，2026-11-01，14740023439）
- "They made this a paid app and now I can’t retrieve my information without paying for it."（GLPTracker (C2M)，App Store，1★，2026-06-29，14242800673）
- "at this point don’t feel I can trust you with my data."（Glapp，App Store，2★，2026-06-22，14212453174）

**4.3 Apple Health 能桥接什么**

- **体重、热量、蛋白、饮水可以。** Shotsy 的商店描述写明能从 Health 自动读这四样（https://apps.apple.com/ca/app/id6499510249 ）。用户也把它当桥用："sync data from other apps using apple health as a bridge"（Shotsy，App Store，5★，2026-11-04，14751593770）；有人用 Shotsy 管针、Noom 管饮食，靠 Health 互通（Shotsy，App Store，5★，2026-09-05，14513828458）。Shotsy 的 Health 同步至少一度是付费功能："I just wish it synced with apple health without the paid subscription."（App Store，5★，2026-08-30，14489994303）。
- **打针和服药记录不行。** 苹果在 iOS 26 开放了用药接口，第三方 App 可以在用户逐项授权后读取用户在"健康"App 里登记的药物和服药记录；但这个接口是只读的，第三方不能写入。苹果开发者关系团队在论坛答复里写的是：用药接口只读，不能把服药记录写进 HealthKit（https://developer.apple.com/forums/thread/789821 ；WWDC25 第 321 场 https://developer.apple.com/videos/play/wwdc2025/321/ ）。这条答复可能是测试版时期的，现行文档没有核对（未核实）。
- 评论侧的印证：MeAgain 用户希望它能把服药写进 Health，说明它没写："I wish the app would write that I took my pill to my apple health account."（App Store，5★，2026-11-14，14789948522）。
- **各家往 Health 里写了什么，基本没查到。** 能从评论里推断的只有两点（推算）：MeAgain 很可能写入饮食数据，因为有用户遇到"记一次、Health 又回灌一次"的重复（App Store，1★，2026-11-15，14795294927）；Pep 在 2026-08 被用户指为"doesn’t read or write to AppleHealth"（App Store，2★，2026-08-14，14426915558）。Shotsy、Glapp 写不写体重，没查到。
- **Health 本身也是差评来源。** Shotsy 提到 Apple Health 的评论正则命中 18 条，其中 4 条一星，读下来主要是两件事：更新后不再自动同步、热量被重复计算；Free.Well 有用户因为手表和戒指的步数被重复计入而弃用（App Store，2★，2026-07-24）。

**结论（推算）：** 一个用户从 Shotsy 换到任何别的 App，能通过 Health 带走的只有体重和饮食汇总；针剂历史、剂量阶梯、部位、副作用这些"换 App 最舍不得的东西"带不走，只能靠文件导出或截图。我们的网页版读不了 Health，所以对我们来说 Health 这条路在套原生壳之前不存在。

### 问题 5：最近 3 个月（2026-08-22 到 11-22）的新动作

**5.1 Shotsy**

- **版本节奏（推算：按评论里版本号第一次出现的日期）：** iPhone 端 3.3.8（8-08）、3.3.9（9-16）、3.4.0（10-18）、3.4.1（11-08）；安卓端 2.8.0（9-08）、2.9.0（11-02，Play 页面显示 10-29 更新）。大约每月一版。
- **定价在动，而且同时挂着好几个价。** App Store 内购列表（2026-11-19 快照）是月付 9.99 或 14.99 美元，年付 39.99、49.99 或 59.99 美元。第三方聚合页记录年费在 2026-01-11 是 49.99 美元、2026-07-30 调到 39.99 美元（https://appshunter.io/ios/app/shotsy-glp-1-tracker/id6499510249/how-to-cancel-subscription ，未核实）；另一个付费墙收录站在 2026-10-25 记到的是月付 9.99、年付 39.99，另有 14.99 的月付档（https://adapty.io/paywall-library/shotsy-glp-1-tracker/ ，未核实）。评论里新用户被扣的年费多是 59.99–65 美元。
- **老用户的权益被重新划线。** 8-12、9-15、10-02、10-04 四条评论都是同一件事：原来付 19.99 或 20 美元一年能看全部，续费后一部分功能被模糊，要再付 40–60 美元。8-27、10-08、10-11 三条是免费用户发现药物水平曲线要付费了。8-13、9-14 两条是换了新手机后，原来能用的免费功能不见了。
- **10 月的 3.4.0 更新后出现数据看不到的问题。** 10-21、10-22、10-30、11-01、11-02（两条）、11-05 共 7 条一星，说法一致：更新后被要求重新走引导，像是变成了纯付费 App，原有数据看不到。例如"With the latest update all my information was deleted and 7 months of data gone."（App Store，1★，2026-10-21，14694540019）。厂商自己的网页仍写核心功能在 iPhone 和安卓上免费、不限时（https://shotsyapp.com/free-glp-1-tracker/ ，厂商自述）；同期也有用户在 11 月中旬说自己还在正常用免费版（例如 App Store，5★，2026-11-16，14798361516）。所以这更像是一次更新把部分用户的登录或付费状态弄错了，而不是取消免费档（推算）。官方有没有就此发过说明，没查到。
- **安卓端明显落后。** 口服 Wegovy 药片 9 月下旬在安卓上还不支持（b6542ec4…）；10 月小组件失效（49a37148…）；曲线不能点选查看历史值（Google Play，3★，2026-09-28）。
- **措辞从 shot 改成了 jab**，有用户反感（App Store，4★，2026-11-16，14799561023）。
- **融资和增长：** 最近 3 个月没查到新消息。已有汇总里的口径是 2026 年下载过 100 万、月活 35 万、付费订阅 10 万以上（创始人自述和第三方估算）。

**5.2 MeAgain**

- **2026-08-26 发了新闻稿**，标题是"MeAgain App Launches Real-World Insights & a Built-In Support Network for GLP-1 Users"，自称下载超过 50 万、月活"数十万"，是美国最大的 GLP-1 平台之一；同稿提到年内任命了一位注册营养师做营养负责人、一位医生做首席医疗官（厂商新闻稿，未核实。https://www.morningstar.com/news/business-wire/20260826820924/meagain-app-launches-real-world-insights-a-built-in-support-network-for-glp-1-users ；https://finance.yahoo.com/healthcare/articles/meagain-app-launches-real-world-130000996.html ）。
- **评论里能看到的新功能：** 吉祥物 AI 搬到了短信里（"all through iMessage"，14643071839；也有人不喜欢："I do not like that the AI not switching to text messages. It was better in the app."，App Store，4★，2026-10-13）；每日投票和评论区（Google Play，2026-10-22、11-01）；蛋白粉、蛋白棒等产品的评分和营养师推荐（App Store，5★，2026-11-15），同时有人说它"More of a protein bar ad"（14572589961）；11 月新加的动画被嫌拖慢录入（App Store，4★，2026-11-14，14791096107）。
- **版本节奏（推算，同上）：** 2.2.5、2.3.0（9-11）、2.4.0（iPhone 11-11，Play 页面显示 11-12 更新）。
- **定价：** 见 2.2 节。App Store 内购列表（2026-11-19 快照）是 14.99–119.99 美元多档。
- **评分人数的水分。** App Store 一侧抓到的 500 条里，2026-10-08 一天有 74 条、10-09 有 27 条，其余日子的中位数是 4 条。这两天几乎全是五星短评。这很像一次集中弹窗求好评（推算）。它在 App Store 的评分人数已经超过 Shotsy（41,365 对 35,124），但这个数字不能直接当成用户量。
- **收入的第三方估算：** 约 65 万美元一个月、约 8 万次安装一个月（https://screensdesign.com/apps/meagain-glp-1-all-in-one-app/ ，单一来源，未核实）。
- **融资：** 没查到。

**5.3 六个新入场者**

本轮用一次搜索把 StayBuilt、Preserve、staya、Habits、Steady、GLP-1 Lifestyle 六个名字一起查，返回的结果里没有任何一家的页面。所以是**没查到**，不是"查到确实没有动作"。11-21 汇总里的状态照旧：Preserve 当前版本 1.1.0（11-16 更新），美区 0 评分；GLP-1 Lifestyle 上架不到一周。

**5.4 这次搜索顺带查到的其他动作**

- **Bild Health（不在原名单里的新入场者，定位也是"保肌"）：** 2026 年 10 月下旬同时上了 App Store 和 Google Play；基础免费；Pro 59.99 美元一年，7 天试用，含 AI 蛋白估算、DEXA 报告导入、PDF 健康报告（厂商新闻稿，未核实。https://www.prnewswire.com/news-releases/bild-health-launches-app-to-help-people-on-glp-1s-keep-and-build-muscle-while-they-lose-weight-302919612.html ）。它有新闻稿、有安卓版、有免费档，三样都是 Preserve 没有的。
- **GLPro：** 核心记录免费；GLPro+ 14.99 美元一个月或 99.99 美元一年；安卓版在路线图上（厂商自述，https://appglpro.com/ ）。
- **MyNetDiary：** 2026-05-05 在付费档里上线了 GLP-1 Companion，订阅 9.99 美元一个月或 59.99 美元一年起（厂商自述，https://www.mynetdiary.com/mynetdiary-launches-glp-1-companion-for-ozempic-wegovy-and-mounjaro-users.html ）。
- **Noom 的 GLP-1 Companion 自 2026 年 6 月起免费**，Glapp 在 2026 年 6 月加了付费档 Glapp Max（均出自 Bild Health 的对比页，竞品说法，未核实，https://www.bildhealth.com/best-glp-1-tracker-apps ）。后一条和我们评论语料里 Glapp 差评集中在 2026-06-17 到 06-23 是对得上的。
- 评论里也有一条说明大平台的替代效应已经发生：一位用户卸掉了专用 App，因为"My food tracker app provides GLP-1 features that replicates a lot of what Glapp does."（发在 Shotsy 的 Google Play 页面下，2★，2026-10-22，046efe5d…）。

**5.5 一条对我们"网页版先行"很有用的旁证：Glapp 就是从网页版起家的**

Glapp 的 239 条评论里有 17 条提到它的网页版，其中 16 条写的是自己在原生 App 出来之前或之后一直在用网页版（逐条读过）。例如"been using the website for 5 months. Now the app is here"（Google Play，5★，2026-05-18，7901862c…）；"I used it from the website until it was an Android app."（Google Play，5★，2026-09-24）；还有人在出了 App 之后仍然"把网页加到主屏幕"并用（App Store，5★，2026-05-06，14034368756）。它在美区 App Store 的第一条评论是 2026-03-23，Google Play 的第一条是 2026-05-15（推算：按我们样本里最早的评论日期）。这说明在英文市场，GLP-1 用药者愿意连续几个月用一个网页来记针，原生 App 可以后补，数据平移过去不丢就行。

### 问题 6：最容易被抢走的是谁，用什么接，迁移工具做不做

**6.1 最容易被抢走的用户（App × 触发事件）**

排序依据是三样：评论里的条数、触发事件是否还在发生、这批人对"替代品"的要求我们现在能不能满足。"对中文产品的可用性"一栏是我的判断（推算）。

| 排名 | 谁 | 触发事件 | 证据 | 他们要什么 | 对中文产品的可用性 |
|---|---|---|---|---|---|
| 1 | Shotsy 的老付费用户（当初 20–30 美元一年） | 年度续费时发现功能被重新划线、要加钱 | 8–10 月 4 条一星到三星，其中 2 条明说要换、1 条说不再续费；续费是按年滚动的，未来 12 个月每个月都有一批人到期 | 原来有的别拿走；价格别变 | 低到中。只有其中的双语华人用得上我们，人数没查到 |
| 2 | Shotsy 的免费用户 | 药物水平曲线变付费；3.4.0 更新后数据看不到 | 曲线变付费 3 条（8-27、10-08、10-11）；数据看不到 7 条，集中在 10-21 到 11-05 | 曲线免费；数据拿得回来；能导出 | 同上 |
| 3 | MeAgain 的安卓新用户 | 装上后走完引导才发现要先付费 | Google Play 17 条 | 不付费先能用 | 低。这批人还没形成记录习惯，换的成本为零，但他们是英文用户 |
| 4 | 换了用药形态的人（针剂换口服、改成一周两针或分次、换复方） | 原来的 App 记不了新形态 | Shotsy 安卓 2 条、Shotsy iPhone 1 条、Glapp 2 条 | 口服、多次、自定义间隔都能记 | **高。** 这是事件触发，不分语言；中文区口服药和新药上市同样会制造这个时点 |
| 5 | 在卖药平台自带工具里记录的人 | 换平台、停项目、平台工具太简陋 | Shotsy 3 条正面、Noom 2 条负面 | 记录跟着人走，不跟着卖药的走 | **高。** 中文侧的主要对手正是药企小程序和互联网医院 |
| 6 | 还在用备忘录、表格、纸的人 | 记乱了、忘了上次打哪边 | 6 条 | 比备忘录省事；以前记的能搬进来 | **最高。** 专题二、四都判断这是中文用户最可能的现状 |
| 7 | MeAgain 的续费用户 | 续费价从 39.99 涨到 119.99 美元 | 1 条明确原话，另有多条价格混乱的投诉 | 便宜、透明 | 低 |
| 8 | 需要把记录交给医生的人（年纪偏大、有医生随访） | 现在的 App 导不出 | MeAgain 2 条 | PDF 或 CSV | 中到高。海外华人看英文医生，正好对上 PRD 的中英双语报告 |
| 9 | Glapp 的老免费用户 | 2026 年 6 月收费 | 8 条要走，但已经过去 5 个月，该走的多半已经走了 | 免费的周报和解读 | 低 |
| 10 | GLPTracker (C2M)、DreamMe 的用户 | 历史被锁；打不开 | 各 3–5 条，盘子很小（评分人数 277 和 3,574） | 能用、数据拿得回 | 低 |

读法：前三名是英文市场里最大的现成流量，但对一款中文产品，它们的价值主要是"告诉我们这个品类的用户会被什么逼走"。真正能直接转化成我们用户的是第 4、5、6、8 类，它们按"事件"而不是按"语言"定义。

**6.2 用什么信息去接**

| 触发事件 | 要说的一句话 | 必须有的功能作证 |
|---|---|---|
| 功能被收回、涨价 | 现在免费的功能以后也免费；将来如果收费，老用户的价格和权益不变 | 一个公开的"价格与承诺"页，带改动记录 |
| 数据看不到了、被锁了 | 不登录、不付费，任何时候都能把全部记录导出来 | 设置页第一屏就有导出；付费墙页面上也有 |
| 装上就要先付钱 | 不用注册、不用绑卡，打开就能记 | 已有（PRD 第 2.4 节） |
| 换了药、换了打法 | 打针、吃药片、一周两针都能记，换药不用换 App | 口服日服、自定义间隔、同一天分次、复方只记不换算 |
| 换了买药的地方 | 记录跟着你走，不跟着卖药的走 | 不卖药（已是底线）；导出 |
| 以前记在别处 | 把以前记的贴进来，或者拍张截图，历史就建好了 | 通用导入（见 6.3） |
| 要给医生看 | 一页中英双语报告，免费 | 已在 v0 第 2–3 天计划里 |
| 通知太多、太花哨 | 可以只留打针提醒，其他都关 | 提醒分级的一个开关 |
| 换手机后东西没了 | 换手机登录就恢复，权益也在 | 写进验收清单 |

维持期不放在这张表里。它是让人付费和留下的理由，见 3.4 节。

**6.3 迁移工具值不值得做，先做哪一家**

**值得做，但顺序是：先通用，后 Shotsy，其他几家不单做。**

1. **先做通用导入（估计半天到一天）。** 入口叫"把以前的记录搬进来"。支持三种输入：粘贴一段文字（备忘录、微信聊天、表格里复制出来的行）、上传截图（任何 App 的历史列表）、上传 CSV 文件。解析后出一张预览表，用户逐行确认再入库；用药记录必须确认这条规则不变。这其实就是万能输入栏的批量版，解析接口已经有了。
   - 理由一：我们最可能的用户来自备忘录和表格，不是来自 Shotsy。
   - 理由二：MeAgain、GLPTracker (C2M)、早期的 Pep 根本导不出文件，它们的用户只能靠截图。评论里已经有人这么自救了（"screenshots of current data"，14241735233）。
2. **再给 Shotsy 的 CSV 做一个专门的列映射（估计半天，前提是拿到真实样本）。** 四家头部里只有它确认能导出 CSV，盘子最大，而且眼下有人想走。列格式本轮没查到，需要一份真实导出文件。办法是在发布帖里征集：谁在用 Shotsy，导出一份发来，换一个终身免费的承诺。
3. **Glapp、Pep 暂不单做。** Glapp 的导出格式没查到，盘子是 Shotsy 的百分之三到四；Pep 的导出没查到。等引导问卷里出现它们的名字再说。
4. **不做 Apple Health 桥。** 网页版读不了；即使将来套了原生壳，也只能读体重和饮食，读不到别的 App 的打针记录（问题 4.3）。原生壳阶段可以做的是"读取用户在苹果健康里自己登记的用药记录"，那是另一件事，放到 v1 再评估。
5. **别把"能导入 Shotsy"当头条卖点。** 在 2,083 条评论里，把导入当成好处提出来的只有 1 条，而且用的是"as a bonus"。导入是打消顾虑的保险，不是拉新的理由。
6. **先行指标和止损线（建议值）：** 引导里加一道单选题"之前用什么记"，选项是：没记过、备忘录或纸、表格、买药平台或药企的小程序、Shotsy、MeAgain、其他 App。前 100 个走完引导的用户里，选 Shotsy 加 MeAgain 的不到 10%，就不再投入任何专用导入器；达到 20%，再做 MeAgain 的截图导入流程和一个英文落地页。

---

## 三、对"后来者策略"的含义（具体到可以怎么做）

**1. 把"不收回"从一句底线变成一个可以被检查的公开页面。**
本轮证据最硬的一条是：Shotsy、Glapp、GLPTracker (C2M) 三家都在收回免费功能之后立刻出现成批的"我要走"。PRD 第 1.3 节已有"不把已经免费的功能收回去"，但现在只是文档里的一句话。做法：上线当天就放一个"价格与承诺"页，写明哪些功能永久免费（记针、提醒、药物水平曲线、副作用和分诊、导出、医生报告），写明将来收费时老用户不受影响，页面底部留一个改动记录。Glapp 的教训是它发过邮件说免费功能保持免费，然后没做到（"Users received an email saying previously free features would remain free. Not true."，Google Play，1★，2026-06-20，23e08a4d…）。承诺要写在收不回去的地方。

**2. 导出放到最显眼的位置，并且和登录、付费状态脱钩。**
具体到实现：未登录状态下也能导出本机数据；账号或将来的订阅状态异常时，导出入口仍然可用；将来的付费页上放一行"随时可以导出全部数据"。PRD 第 4.1 节的工程红线已经写了"登录或付费状态异常时，绝不隐藏或清空已有记录"，这里是把它延伸到导出入口。同时把 CSV 的列说明公开出来，让别人也能导入我们的数据。这是在告诉用户我们不靠锁数据留人。

**3. 用药形态的覆盖面要在第一版就比 Shotsy 的安卓端宽。**
评论里"换了口服药，原 App 记不了"是最干净的事件型触发。PRD 附录 A 已经含口服药和自定义。验收时加四个用例：每日口服；每周两次固定星期几；同一周内把一针拆成两次；一个人同时记两种药。剂量换算器按 PRD 第 1.4 节仍然不做，复方只记用户自己输入的数值和单位。

**4. 首屏文案从"功能"改成"处境"，一条处境配一条承诺。**
可以直接用的中文短句（对应 6.2 节）：
- "不用注册，打开就能记。"
- "现在免费的，以后也免费。"
- "记录随时能导出，换手机、换药、换医生都带得走。"
- "以前记在备忘录、表格或别的 App 里？贴进来，或者拍张截图。"
- "打针、吃药片、一周两针，都能记。"
- "可以只留打针提醒，别的都不打扰你。"
对外不要点名竞品说它丢数据或乱收费。评论是用户的一面之词，其中 Shotsy 10 月的问题更像是更新事故而不是有意为之；点名既有法律风险，也和"像一个懂行的朋友"的语气不合。

**5. 写两篇"怎么搬过来"的帮助文，当作长尾入口。**
英文同类产品都有"某某替代品"页面（MeAgain、Pep、GLP3 Planner 各有一页写 Shotsy）。我们写中文版的两篇就够：一篇"从 Shotsy 搬到这里"，一篇"从备忘录或表格搬到这里"，内容是实际步骤加截图。目的不是抢英文流量，而是让搜"Shotsy 中文"的双语用户有地方落脚。有没有人搜这个词，本轮没查，发出去以后看访问量再决定要不要写第三篇。

**6. 在产品里问一句"之前用什么记"，这是本专题最该补的数据。**
本轮所有关于"谁会来"的判断，到了中文市场都是推断。引导第 2 步加那道单选题（选项见 6.3 第 6 条），再加一道多选"为什么想换"（收费了、数据丢了、不好用、不支持我的药、没有中文、只是想试试）。前 100 个用户的答案就能替代本笔记里所有标了"推算"的排序。

**7. 提醒和 AI 都要能关到只剩最小集。**
MeAgain 的用户有人因为"通知太多"选了 Shotsy，有人明说"I don't need AI"；Shotsy 的用户有人嫌它只提醒打针。两头都有人。做法是在引导最后给三个档位：只提醒打针；打针加蛋白和喝水；全部。默认选第一个。PRD 已经允许拒绝 AI，这里补的是提醒分级。

**8. 上架原生版时，不在用户用起来之前求好评，不把免费入口藏在付费页的关闭按钮后面。**
MeAgain 安卓端 17 条"没法试用就要先付费"的差评里，至少一部分人其实可以进免费档，只是没看到入口。MeAgain 和 Shotsy 都有"还没用就让我打分"的差评。PRD 第 8 节已有"始终保留先用免费版的按钮"，补一条：打分请求不早于第 7 天，且不出现在记针这一步里。

**9. 把换手机和重新登录写进验收清单。**
Shotsy、Pep、DreamMe 都有"换手机后权益或数据不见了"的差评。PRD 验收清单加一条：在第二台设备上用同一个邮箱登录，全部记录、设置、提醒、将来的付费权益都要恢复；在微信内置浏览器里登录过的账号，到 Safari 里再登录，结果要一致。

**10. 对"网页版先行"可以更有把握，对"保肌"要更克制。**
Glapp 靠网页版攒下了第一批用了几个月的用户，再平移到原生 App，评论里没有人因为它是网页而走。这是支持 PRD 第 0 节第 2 个决定的一手证据。另一边，Bild Health 是又一个喊"保肌"的新入场者，并且带着新闻稿和安卓版来。PRD v2.0 已经把"保肌"从招牌降成四个承诺之一，这个决定不用改。

---

## 四、没查到的

1. **Shotsy 的 CSV 长什么样。** 有哪些列、一针一行还是一天一行、日期和单位怎么写，都没查到。做专用导入之前必须拿到一份真实文件。
2. **Shotsy 的导出现在是免费还是付费。** 两条证据互相矛盾（4.1 节）。
3. **Shotsy、Glapp 往 Apple Health 里写不写数据、写哪些类型。** 没查到。
4. **Glapp 导入 Shotsy 数据的具体方式，以及 Glapp 自己能导出什么格式。** 只有一条评论说"能导入"，一条评论间接说"能导出"。
5. **Pep 的导出能力，以及它 2026 年 9 月加的备份是本机备份还是云备份。** 没查到。
6. **MeAgain 通过客服拿到的数据是什么格式。** 没查到。
7. **六个新入场者（StayBuilt、Preserve、staya、Habits、Steady、GLP-1 Lifestyle）最近 3 个月的任何新动作。** 搜索结果里没有出现它们的页面。这是"没查到"，不是"查到确实没有"。
8. **Shotsy 和 MeAgain 最近 3 个月的融资。** 没查到任何报道。
9. **Shotsy 官方对 2026 年 10 月更新后数据问题的说明。** 没查到。问题的规模（影响了多少用户）也没查到，评论里是 7 条。
10. **苹果用药接口"只读"这一点在现行文档里的原文。** 只查到开发者论坛的答复和 WWDC 场次页面。安卓一侧 Health Connect 对用药记录的支持情况没有查。
11. **头部 App 的用户里有多少说中文的。** 美区英文评论里是 0 条提及，但这个样本回答不了这个问题。港区、台区、新加坡区的商店评论本轮没有抓。
12. **真实的流失率和换 App 的比例。** 评论只能给出"有人这样做了"，给不出分母。
13. **B 组五款综合 App 的换 App 评论没有逐条读全文**，只读了关键词上下文。其中和 GLP-1 直接有关的换 App 线索只找到 Noom 远程医疗用户的两条（1.5 节）。
14. **`meagain.com`、`shotsyapp.com` 的页面本身。** 两个站点都不在本会话的网络白名单里，文中引用的是搜索摘要对这些页面的转述。要核对原文，需要在会话的网络设置里放行这两个域名。

---

## 来源

**评论语料（一手）：** `ventures/glp1/research/store-reviews/reviews.csv`，2026-11-19 抓取。各 App 的商店页：

- Shotsy：https://apps.apple.com/us/app/shotsy-glp-1-tracker/id6499510249 ；https://play.google.com/store/apps/details?id=com.shotsy.app
- MeAgain：https://apps.apple.com/us/app/meagain-glp-1-tracker-app/id6744178534 ；https://play.google.com/store/apps/details?id=app.meagain.app
- Glapp：https://apps.apple.com/us/app/glapp-smart-glp-1-tracker/id6756984097 ；https://play.google.com/store/apps/details?id=io.glapp
- Pep：https://apps.apple.com/us/app/glp-1-tracker-pep/id6504788281 ；https://play.google.com/store/apps/details?id=com.shredapps.glp1
- DreamMe：https://apps.apple.com/us/app/dreamme-glp-1-tracker-pet/id6755569693
- Noom：https://apps.apple.com/us/app/noom-weight-loss-food-tracker/id634598719
- 其余 App（GLPTracker (C2M)、Free.Well、JellyPal、Oura、Cal AI 等）的评论按 review_id 在 CSV 里查。

**本轮 8 次搜索的关键词和返回的相关链接：**

1. Shotsy app export data CSV PDF "Apple Health" sync writes medication doses weight help —— 没有返回 Shotsy 的页面，无可用结果。
2. MeAgain GLP-1 app export data doctor report PDF "Apple Health" pricing premium 2026 —— https://meagain.com/best-glp-1-tracker-apps ；https://apps.apple.com/app/id6744178534
3. Shotsy GLP-1 tracker 2026 Shotsy+ price change free version features export CSV Apple Health Android update —— https://shotsyapp.com/free-glp-1-tracker/ ；https://glp3planner.com/resources/shotsy-alternatives ；https://helloregimen.com/blog/best-glp1-tracker-apps-2026 ；https://pepglp1.com/pep-vs-shotsy-which-glp-1-medication-tracking-app-reigns-supreme/ ；https://glp1nutrition.org/apps/shotsy-review/ ；https://www.glp1muscleloss.com/articles/shotsy-review/
4. Glapp GLP-1 tracker import data from Shotsy export CSV "Glapp Max" Apple Health Health Connect —— 只返回了 Shotsy 的各区 App Store 页面，例如 https://apps.apple.com/ca/app/id6499510249 ；没有 Glapp 的结果。
5. HealthKit Medications API iOS 26 third-party apps read medication dose events write not supported HKMedicationDoseEvent —— https://developer.apple.com/forums/thread/789821 ；https://developer.apple.com/forums/thread/803954 ；https://developer.apple.com/videos/play/wwdc2025/321/
6. MeAgain GLP-1 app funding raised users downloads 2026 Shotsy funding Series A news —— https://www.morningstar.com/news/business-wire/20260826820924/meagain-app-launches-real-world-insights-a-built-in-support-network-for-glp-1-users ；https://finance.yahoo.com/healthcare/articles/meagain-app-launches-real-world-130000996.html ；https://screensdesign.com/apps/meagain-glp-1-all-in-one-app/ ；https://shotsyapp.com/best-glp-1-tracker-apps/
7. GLP-1 muscle protein app StayBuilt OR "Preserve" forresTech OR "staya" habit coach OR "Steady: GLP-1 Tracker" Ohana Labs OR "Habits: GLP-1 Companion" OR "GLP-1 Lifestyle" app 2026 launch update pricing —— https://www.prnewswire.com/news-releases/bild-health-launches-app-to-help-people-on-glp-1s-keep-and-build-muscle-while-they-lose-weight-302919612.html ；https://www.bildhealth.com/best-glp-1-tracker-apps ；https://appglpro.com/ ；https://www.mynetdiary.com/mynetdiary-launches-glp-1-companion-for-ozempic-wegovy-and-mounjaro-users.html
8. Shotsy app October 2026 update new subscription Premium paywall existing subscribers data lost login account changes announcement —— https://adapty.io/paywall-library/shotsy-glp-1-tracker/ ；https://appshunter.io/ios/app/shotsy-glp-1-tracker/id6499510249/how-to-cancel-subscription

**本仓库内的已有材料：** `research/store-reviews/summary.md`、`googleplay_brief.md`；`research/a-competitors-search.md`（文中称"已有研究 A"）；`research/strategy/02_cn_competitors.md`（专题二）、`04_latecomer_playbooks.md`（专题四）；`docs/prd-v2.0.md`。

---

## 核查（独立核查员）

核查日期：2026-11-22。我通读了全文，从研究员列的 10 条承重结论里挑出对"后来者策略"影响最大的 6 条，逐条尝试反驳；其余 4 条和我另外看到的问题放在"顺带发现"里。用到的材料有：`reviews.csv`（重跑了统计，并把文中引用的评论按 review_id 逐条调出全文来读）、`store-reviews/summary.md`、`googleplay_brief.md`、调研汇总（2026-11-21）、`a-competitors-search.md`、`c-business-compliance.md`、PRD v2.0 第 0–2 节和第 7–9 节、同目录下的专题二和专题四（含它们末尾已有的核查）、专题八、专题九，以及 4 次网页搜索。

先说明我自己的证据边界：4 次搜索拿到的都是搜索工具给出的摘要，我同样没有打开任何一篇原文；其中两次针对 Shotsy 的搜索（老用户改价、3.4.x 版本说明）没有返回任何 Shotsy 的页面。凡是出自我的背景知识、没有经过搜索的内容，下面都单独标明。

**整体评价：可靠程度中等。** 原文开头的五条限制写得很老实，"逐条读过"和"正则命中"分得清楚。凡是出自评论语料的数字我都重跑了，没有发现编造或引错的原话，有几处条数还偏保守。问题集中在四处解读：第一，把 Shotsy 的"数据看不到"归到 3.4.0 一个版本上，而同样的症状从 8 月底就有，11 月 5 日之后在样本里又消失了；第二，把 4 条评论读成"Shotsy 在给老付费用户改档"，再外推成"未来 12 个月每个月都有一批人出走"；第三，把 Glapp 的网页版先例读得比它能证明的宽；第四，"60 美元以上没有一条说值"是统计口径造成的。另外，专题二已经核实的两件事（Shotsy 有中文界面并在港台在售、Shotsy 有 Maintenance Mode）本笔记没有接上。6 条里没有一条被判为不成立，6 条都是部分成立。

### 判定一览

| 编号 | 结论 | 判定 |
|---|---|---|
| 1 | 带"要走"措辞的差评里，触发原因前四位是试用扣费、打不开、付费墙收回、食物记录；维持期 0 条、导出 2 条，所以维持期和导出是钩子而不是拉人的理由 | partly（部分成立） |
| 2 | Shotsy 在 2026 年 8–10 月给老付费用户重新划档并要求加钱，续费滚动到期，未来 12 个月每月都有一批人碰到 | partly（部分成立） |
| 3 | Shotsy iPhone 端 3.4.0 版之后有 7 条一星称被要求重新走引导、历史数据看不到，更像一次更新事故 | partly（部分成立） |
| 4 | 四家头部里只有 Shotsy 确认能导出文件，所以专用导入器先做 Shotsy，其余靠截图 | partly（部分成立） |
| 5 | Glapp 从网页版起家，17 条评论提到网页版，数据平移到 App 没有丢，是"网页版先行"的一手先例 | partly（部分成立） |
| 6 | 20–40 美元一年有人明说值，60 美元以上没有一条明说值；"变价"比"价高"更伤人 | partly（部分成立） |

### 1. 离开的理由排序，以及"维持期和导出是钩子"

**判定：partly。** 计数和排序复核成立；"维持期不是离开的理由、只是付费的钩子"这半句证据不够。

理由：

- A 组 1–3 星评论我数到的也是 437 条。"要走"措辞我另写了一组更宽的关键词重跑，命中 125 条（原文 107 条），前四类和原文相同，只是次序略有出入：试用扣费或不付费不能用 42 条，打不开或卡死 24 条，食物记录 23 条，付费墙收回 22 条；维持期 0 条；导出 3 条（MeAgain 2 条，另 1 条是原文 1.2 节引过的 Pep 那条）。原文"适合看排序，不适合看精确数字"的自我评价是恰当的。
- 样本构成需要补一句。437 条里 MeAgain 占 133 条（其中 Google Play 100 条），Shotsy 占 121 条（其中 App Store 91 条），两家合计 254 条（58%）；而这两家在每个商店只抓到最近 200 到 500 条，时间窗是 2026 年 7 月到 11 月。所以这张排序表主要反映两家头部在这四个月里出的事，不是这个品类长期的流失原因。
- "维持期 0 条"不能读成"用户不会因为没有维持期而走"。停药的人多半只是不再打开 App，不会专门回来写一条差评，这类流失在商店评论里天然看不到。
- 头名并不缺这个功能。专题二的核查查到 Shotsy 自 3.0.1 版起就有 Maintenance Mode（内容是达到目标体重后的图表模式），`a-competitors-search.md` 在 2026-11-19 也已记录。语料里有两位 Shotsy 用户说自己进入维持期或开始减量后仍在用它（App Store，5★，2026-08-26，14474087279；Google Play，5★，2026-09-25，3931d9bf…）。本笔记通篇没有提到这一点。
- "有它我就付费"的正面证据只有 Glapp 的 1 条，加上 2 条许愿（2026-05-21 的"I wish you could pause treatment"和 2026-09-22 的"Please add a maintenance program"），全部来自一款没有这个功能的第二梯队 App。
- 这些都是"离开某款英文 App 的理由"，不等于"选择一款新 App 的理由"，更不等于中文用户的理由。原文开头第 2 条限制已经写明，但第三节第 4 条直接把它们写成了首屏文案。

修正后的说法：在这批以 2026 年 7–11 月的 Shotsy 和 MeAgain 为主的差评里，带"要走"措辞的评论最常见的触发原因是试用扣费或不付费不能用、更新后打不开、已有功能被收进付费墙、食物记录不好用；没有一条把缺少维持期当作离开的理由，但停药后的流失本来就不会出现在评论里，所以维持期的拉新和留人价值在这批语料里既没有被证实，也没有被否定。

对策略的影响：

- "不收回、不乱扣、不丢数据"作为底线和公开承诺站得住，专题四和专题八也各自得出了同样的结论。它们作为拉新文案是否有效，要靠第三节第 6 条那两道引导题来验证，现在只是假设。
- 维持期放在免费档还是付费档，不应以 3.1 节这张表为依据。对外也不能说"别家没有维持期"，这一点专题二的核查已经提醒过。

### 2. Shotsy 给老付费用户重新划档

**判定：partly。** 评论原话和条数成立；"Shotsy 把老付费用户重新划线"作为公司行为没有任何出处；"未来 12 个月每个月都有一批人碰到"是没有依据的外推。

理由：

- 4 条评论我逐条读了，日期、星级和原话都对：2026-08-12（3★，14421331621）、09-15（1★，14552213857）、10-02（2★，14621575152）、10-04（1★，14628739378）。明说要换 App 的是 09-15 和 10-04 两条，说不再续费的是 08-12 和 10-04 两条。"The annual has increased from $19, to $39, to $59"原话无误（14677923512）。
- 价格史有旁证。`c-business-compliance.md` 记录 Shotsy 在 2025-02 时是 19.99 美元一年，现在 App Store 内购是 39.99、49.99、59.99 美元三档。
- 但"重新划档"只来自这 4 位用户的自述。我专门搜了一次，没有返回任何 Shotsy 的官方说明或第三方报道。原文引用的两个第三方页面（appshunter、adapty）记的是新用户看到的价格，不涉及老用户的权益。
- 另一种解释至少同样说得通（推算）：Shotsy 对老用户做过保留，只是保留和付费状态在换手机或更新时会失效。语料里有 2 条评论显示老用户原本留着旧权益："I started with the app two years ago and it's still free form me"（App Store，1★，2026-10-25，14711297321）；"I got a new phone and can't see anymore, says I need to upgrade"（App Store，1★，2026-09-14，14551135936）。另有 2 条是已经付费却被当成没订阅：付了 39.99 美元的用户换了新 iPhone 之后（App Store，1★，2026-07-27，14357286025），以及一位 Shotsy+ 用户记针的时候（App Store，2★，2026-09-09，14529978013）。所以原文那 4 条里有多少是有意改档、有多少是权益识别出错，分不开。
- "续费滚动到期，每个月都有一批人碰到"撑不住。4 条里只有 2 条把事情和续费时点连在一起（09-15、10-04），另外 2 条没有提续费。10-04 之后到 11-17 的六周里，App Store 的 168 条评论中没有再出现同类投诉。受影响的只是当初按 19.99 美元订阅的早期用户，这个群体有上限，而且只会变小。
- 量级完全未知。同一时间窗的 500 条 App Store 评论里，四星和五星有 409 条；两个商店合计有 32 条四五星评论说这笔钱花得值。Shotsy 自称付费订阅 10 万以上（调研汇总，创始人自述）。4 条评论撑不起"头名正在自己制造流失"这个判断。
- "3 条免费用户发现曲线变付费"的构成要改，条数大体不变。08-27 那条只说"要付费才能看"，没有说以前免费；漏掉的 09-23（14584583550）和 10-17（14677923512）两条明说了以前免费。合计至少 4 条。

修正后的说法：2026 年 8–10 月，有 4 位自称按约 20 美元一年订阅的 Shotsy 老用户在评论里说，部分原有功能被划进更高档位、要再付 40–60 美元，其中 2 人明说要换 App；这是不是公司的统一政策、影响多少人、是否还在发生，都没有出处，10-04 之后样本里没有再出现同类评论。

对策略的影响：

- "老用户价格和权益不变"写成公开承诺仍然值得做，它的依据不只这 4 条，还有 Glapp 和 GLPTracker (C2M) 收回免费功能后的成批差评。
- 不要把"Shotsy 老付费用户"当作一个会持续 12 个月的迁移来源来排期。6.1 节把它排在第一位，背后的条数只有 4。
- Shotsy 的例子还多了一条工程教训：给老用户的保留要绑在账号上，不能绑在设备或安装上，否则换手机就等于收回。第三节第 9 条的验收用例可以直接覆盖这一点。

### 3. Shotsy 3.4.0 版之后数据看不到

**判定：partly。** 事情是真的，而且条数被低估了；但它不是 3.4.0 一个版本的事，也可能已经结束。"更像事故、不是有意为之"的推断我认为成立，证据比原文写的更多。

理由：

- 3.4.0 在评论里首次出现于 2026-10-18，复核一致。原文列的 7 条都在，引用的那句原话无误（14740023439）。
- 3.4.0 期间我数到的是 9 条，不是 7 条。漏掉的两条是 10-20 的"App no longer works or loads past a question page, and there is no login for existing customers"（14691737481）和 10-23 的"it's gone. And I'm being asked newcomer info and to pay"（14702797432）。
- 同样的症状在 3.4.0 之前就有，至少 6 条。08-29"it lost all my prior data … and asked me to upgrade to plus"（14488034232）；09-09 一位 Shotsy+ 用户说 App 时常把他当成没订阅并丢掉已记的针（14529978013）；09-22 有两条、10-10 有一条把数据全没归因于升级 iOS 27（14579977738、14580903619、14652309075），其中一条写"It wants me to create a new account and there is no longer a free version"；Google Play 在 09-10 也有一条"logged me out and then lost 6 months worth of data"（05148c03…）。调研汇总第 2.1 节早就把安卓那条和 10 月的几条并列，本笔记只取了 10 月的。
- 所以把它写成"3.4.0 更新后"是窄了。更准确的描述是：从 8 月底到 11 月初，iPhone 和安卓两端都有用户反映记录看不到并被当成新用户，评论里提到的触发点有升级 iOS 27、被登出和 3.4.0 更新。
- 11 月 5 日之后样本里再没有这类评论。3.4.1 在评论里首次出现于 11-08；11-06 到 11-17 的 30 条 App Store 评论全是四星和五星，一条 1–3 星都没有，而此前每周有 4 到 11 条。这可能是修好了，也可能只是样本太短（推算），但"这个进攻面眼下还开着"没有证据。
- "事故"这个推断成立。付费用户同样中招（10-30"Unacceptable for a paid health app"；11-05 付了 65 美元的用户四次从头录入；09-09 的 Shotsy+ 用户），这和"故意把免费用户赶去付费"对不上。
- 用户之所以读成"变成纯付费 App"，有一个原文没有点出的原因：Shotsy 的新用户引导本身就很难看到免费入口。08-19 到 09-22 有 6 条评论说填完资料才看到价格、找不到免费版或免费试用（例如 14457722079、14491654847、14582302348）。老用户被打回引导流程，看到的就是一堵付费墙。原文把"藏免费入口"只算在 MeAgain 头上，Shotsy 也有同样的问题。
- 厂商网页"核心功能免费"是搜索摘要转述的厂商自述，我没能打开。有 2 条评论（09-22、09-26）也提到官网写着免费，可以互相印证"官网这么写"，不能印证"实际如此"。

修正后的说法：2026 年 8 月底到 11 月初，Shotsy 的 iPhone 和安卓两端都有用户反映历史记录看不到、被要求重新走引导，我数到 App Store 14 条、Google Play 1 条，其中 9 条集中在 3.4.0 版（10-18 到 11-05），3 条归因于升级 iOS 27；免费和付费用户都受影响；11-05 之后样本里没有再出现，官方说明和影响规模没查到。

对策略的影响：

- "导出与登录、付费状态脱钩"和"更新不丢数据"仍然值得做，PRD 第 4.1 节已有工程红线，这一条不受影响。
- 策略里不要把它写成一个可以持续利用的窗口。它更适合当作我们自己的验收用例：系统大版本升级、换手机、被登出、数据结构迁移这四个场景下，旧记录都要在。
- 原文"对外不点名"的建议是对的，我补一个理由：这件事有可能已经修复，点名会让我们说的话很快过时。

### 4. 数据可携带性，以及专用导入器先做哪一家

**判定：partly。** 每一条事实都能在语料里找到原话，但几乎都是单条评论，而且有三处限定没有写进结论；"其余几家只能靠截图"说得比证据满。

理由：

- Shotsy 的 CSV 导出只有 1 条评论（14794174834）加搜索摘要转述的一句更新说明，PDF 导出有 1 条评论（14733615970）加 1 条"export data to show your doctor"（14751593770）。3 条全部来自 App Store，也就是 iPhone 端。
- 安卓端能不能导出没有任何证据。Shotsy 两端的版本号各走各的（安卓 2.9.0，iPhone 3.4.1），数据存法也不同（原文 4.1 节：iPhone 走本机加 iCloud，安卓要登录）；唯一相关的一条评论说从安卓换到 iPhone 时数据带不走（14484072148，原文 4.1 节已引用）。所以"Shotsy 能导出 CSV"目前只对 iPhone 端成立。
- 导出是免费还是付费，原文已如实写明两条证据互相矛盾。如果导出在付费档里，"想走的免费用户"恰好是拿不到文件的那批人，专用导入器能接住的人会比设想的少。
- MeAgain"导不出"的两条里，14627842238 写得很清楚；14475879709 的原话是"you cannot export your data from other apps"，语义含糊，读成"不能导出"是合理的，但不能算一条干净的证据。
- Glapp 的导出是"没查到"，不是"没有"，仅有的一条间接证据还指向"能导出"。Pep 在 2026-09 下旬加了备份（14602933400），此前 09-08 还有人抱怨没有备份（Google Play，3d82cf06…），这一点复核成立；备份是什么格式没查到。所以"其余几家的用户只能靠截图"只对 MeAgain 有证据。
- 专题二的核查已经确认 Shotsy 带简体和繁体中文界面，并且在港台以本地货币在售（专题八记的是香港 248 港币一年、台湾 1,290 新台币一年）。本笔记 6.1 节却写"只有其中的双语华人用得上我们"，第三节第 5 条把目标写成"搜 Shotsy 中文的双语用户"。这两处要改：用中文界面的 Shotsy 用户是直接的迁移对象；同时"中文"对 Shotsy 不再是差异点。
- "没查到"清单的第 1、2、3 条（CSV 的列格式、导出是否免费、往 Health 里写什么）和专题二留下的问题（中文翻译质量、药名是否本地化、Maintenance Mode 的实际内容）都不需要再搜。创始人有一手经验，装一次 Shotsy、录两针、试着导出一份文件，十几分钟就能回答其中大部分（安卓端要另找一台安卓手机）。这比"在发布帖里征集导出文件、换终身免费"更快，也不必先许出一个终身承诺。

修正后的说法：Shotsy 的 iPhone 端能导出 CSV 和 PDF（各 1 到 2 条评论），安卓端能否导出、导出是否免费、文件格式都没查到；MeAgain 有 1 条明确、1 条含糊的评论说导不出；Glapp 能导入 Shotsy 数据（1 条评论），它自己能否导出没查到；Pep 在 2026-09 下旬加了备份，格式没查到。

对策略的影响：

- "先通用（粘贴、截图、CSV），后 Shotsy"这个顺序不用改，理由还更充分了：连 Shotsy 自己都只有一半平台确认有文件可导。
- 动手做 Shotsy 专用列映射之前，先由创始人实机导出一份。如果导出在付费档或者安卓端没有，专用导入器就可以再往后放。

### 5. Glapp 的网页版先例

**判定：partly。** 事实成立，条数还略偏保守；但它能证明的比"网页版先行可以更有把握"要窄。

理由：

- 我用自己的关键词数到 19 条提到网页版（原文 17 条），引用的原话都对。"数据平移没有丢"有 1 条明确原话（c7172527…），没有找到反例。
- "从网页版起家"成立，时间线可以补全（推算）：2026-05-18 有人写"用了 5 个月网站"，所以网页版不晚于 2025 年 12 月；App Store 的第一批评论是 2026-03-23 和 03-24，版本号是 1.0，其中一条写"I've been using Glapp since before it was an app"（13882099118）；Google Play 的第一条是 2026-05-15。也就是说，网页版只比 iPhone 原生版早了大约三个月，比安卓版早了大约五个月。
- 提到网页版的 19 条里，17 条来自 Google Play，其中 16 条集中在安卓版上架后的五周内（05-16 到 06-22）。写"用了几个月网页"的人，绝大多数是当时没有原生版可用的安卓用户。原话如"started using glapp through web browser since it wasn't available for Android till recently"（Google Play，2★，2026-06-21）。
- 评论里有一条反向信号，原文没有引："so glad its now an app. so helpful that its an app i actually remember to use all the time"（Google Play，5★，2026-05-23，f9e06e15…）。这位用户的意思是变成 App 之后才记得用。也有 3 条说网页版更好用（05-06、05-20、06-22），所以两头都有人。
- 幸存者偏差。能在商店里写评论的，都是从网页版一路留到原生 App 的人；在网页版阶段流失的人不会出现在这里。第三节第 10 条写"评论里没有人因为它是网页而走"，这句话在这个数据源里不可能被证伪，不能当证据用。
- 规模要摆在旁边看：Glapp 在 Google Play 的安装量级是 10,000 以上，评分 527 人。这个先例证明"做得通"，不证明"做得大"。
- 使用场景也不同（推算）。Glapp 的网页用户多半是从 Reddit 点进手机或电脑浏览器，有人还把它加到了主屏幕；我们的入口是 X 和微信的内置浏览器，PRD 第 4.1 节自己列了本地数据被清、各浏览器数据不相通这两个风险，这些风险 Glapp 的评论回答不了。

修正后的说法：Glapp 先上网页版，大约三个月后出 iPhone 原生版、五个月后出安卓版；有 19 条评论提到网页版，其中 17 条来自当时没有原生版可用的安卓用户，至少 1 人写明数据完整带进了 App。这说明用药者愿意在没有原生 App 的头几个月用网页记针，而且账号数据可以平移；它不能说明网页版本身的留存如何。

对策略的影响：PRD 第 0 节第 2 个决定不用改，但依据应当写成"同品类里有人这样起步并顺利平移"，不要写成"网页版留得住人"。Glapp 自己在三个月内就补了原生版，所以 PRD 第 7 节的第 4 周决策线不宜因为这个先例而放宽，原生壳不宜拖太久。

### 6. 价格承受点

**判定：partly。** 三条"值得"的原话都对；"60 美元以上没有一条明说值"是统计口径造成的；"新订户乐意、老用户不乐意"那组对比贴错了标签。

理由：

- 20、30、39.99 美元三条原话复核无误。原文自己把强度标为"弱"，这是恰当的。
- "60 美元以上没有一条明说值"只在"评论里写了数字"的前提下成立。我用"worth it、worth the money、worth every penny"这类说法重跑：四星和五星评论里，Shotsy 有 30 条、MeAgain 有 20 条说这笔钱花得值，但没有写金额（MeAgain 的 20 条里有 5 条出自 10-08 那批集中出现的好评）。这个时间窗里 Shotsy 在 iPhone 上对新用户的年费是 39.99 到 59.99 美元；MeAgain 在评论里出现过的 12 个年费数字，有 9 个不低于 56 美元。例如"Worth every penny! … It is expensive but it has worked!"（MeAgain，App Store，5★，2026-11-16，14799019193）。
- 这约 50 条没法归到具体价位，其中有人可能是按旧价或折扣价订阅的。所以这批语料既不能证明 60 美元以上有人觉得值，也不能证明没人觉得值；原文那句话的实际含义只是"写了数字的人里没有"。
- 一个旁证（推算）：Shotsy 自称有 10 万以上付费订阅（调研汇总，创始人自述），而它对新用户的年费至少从 2026 年 1 月起就在 40–60 美元（原文 5.1 节引的第三方页面）。如果这个价位普遍不被接受，这个数字很难维持。
- 那条 30 美元的原话来自 Google Play。`googleplay_brief.md` 记录 Shotsy 在 Play 上的内购上限是 39.99 美元，iPhone 上是 59.99 美元。原文 2.2 节的价格表把两个平台的价格放在一起比，没有标注。
- "同样 40 美元，Glapp 的新订户乐意付，老免费用户说只值 10 美元"贴错了标签。说乐意付的那位（14198938891）原话是"I started using the free version of the app when I began my GLP-1 journey … I was happy to pay $39.99 for a year once that update was released"，他同样是老免费用户。所以这组对比说明的是老用户内部有分歧，不是"新老有别"。
- "变价比价高更伤人"仍然有别的证据撑着：专题四的核查数到 Glapp 在 2026 年 6 月有 28 条 1–3 星评论，全部出现在 06-16 上付费档之后；MeAgain 续费从 39.99 涨到 119.99 美元那条原话也在。这个结论可以保留，只是不要再引上面那组对比。
- 所有价格原话都来自美区英文用户，对中文区的付费意愿没有直接意义。专题八已经改用港台本地价格和成本测算来定价。

修正后的说法：带数字的原话里，20、30、39.99 美元一年各有 1 条明说值得，60 美元以上没有带数字的"值得"；但另有约 50 条四五星评论说 Shotsy 或 MeAgain 的订阅值得而没有写金额，无法归到具体价位，所以这批语料给不出价格上限。能确定的只有：已有功能被收进付费墙或续费涨价之后，会成批出现差评。

对策略的影响：`08_monetization.md` 一页结论第 1 条引用了"美区评论里 20–40 美元一年有人明说值，60 美元以上没有一条说值"，这半句应当删掉或改写；它推荐的 29.99 美元年票另有港台锚点和毛利测算支撑，不受影响。PRD 第 8 节的 19.99–29.99 美元也不应引本节作依据。

### 其余结论的顺带发现（没有逐条核查）

- **MeAgain 安卓端"先付费才能用"。** Google Play 200 条里 100 条是 1–3 星，复核一致。"17 条"是偏保守的下限：我把这 100 条里和付费有关的 57 条逐条读了，说"走完引导就要付费、没有试用、找不到免费版"的大约有 30 条。"这批人不是嫌贵，是没看到免费入口"说得太满：那条四星评论（763f00bd…）确实说点关闭按钮就能进免费档，但 11-05、11-12、11-15 各有一条说关掉付费页之后一记录又弹回来、或者根本没有关闭按钮（1199e293…、d59d6f18…、a230e3f2…）。免费档在安卓上到底能不能用，语料里是两种说法。这不影响"不注册、不绑卡、打开就能记"这条结论。
- **苹果用药接口只读。** 我搜了一次：WWDC25 第 321 场的摘要写的是"读取"用药数据；论坛帖 789821 确实存在，标题是"How to save medication dose with new HealthKit apis?"，苹果工程师的答复内容我的摘要里没有显示；另一个论坛帖（https://developer.apple.com/forums/thread/833045 ）的摘要显示苹果工程师答复"iOS 27 里用药接口没有更新"。所以"只读"到 iOS 27 大概率仍然成立，但两条都是论坛答复的摘要，现行文档我同样没有核对。另有两处要对齐：调研汇总第 2.3 节写的是"Shotsy 的 Apple Health 双向同步是付费功能"，而本笔记写"Shotsy 写不写体重没查到"，两处说法不一致；安卓的 Health Connect 没有查，按我的背景知识（没有搜索，可能不准），它有一套可由第三方写入的医疗记录类型，所以"健康平台当不了打针记录的桥"目前只对苹果一侧核实过。这两点对网页版阶段没有影响。
- **MeAgain 的新闻稿和求好评。** 2026-08-26 的新闻稿我搜到了另一份转载（https://insider.fitt.co/press-release/meagain-app-launches-real-world-insights-a-built-in-support-network-for-glp-1-users/ ，搜索摘要），日期和"下载超过 50 万、月活数十万"的说法一致，仍然是厂商自述。10-08 和 10-09 的 101 条复核一致（74 加 27），全部是 2.3.0 版，95 条五星，10-08 当天有 23 条集中在同一个小时里。"很像集中求好评"是合理的推断。但"评分人数有水分"不能只算在 MeAgain 头上：Shotsy 也有 4 条差评抱怨它反复弹窗求好评（例如"The app nags you to write a review almost every time you open it"，14493818329）。两家的评分人数都不能当用户量，原文拿这一点去单独打折 MeAgain 是不对称的。
- **两条迁移原话来自那批求来的好评。** 1.1 节里"Shotsy 换到 MeAgain"的唯一一条（14643071839）和"MyFitnessPal 换到 MeAgain"的一条（14643603900）都发在 10-08。前一条的行文很像宣传稿（推算）。"从 Shotsy 换到 MeAgain"因此没有一条干净的证据。
- **漏掉的一条 MeAgain 新动作。** 我的搜索返回了 MeAgain 在 2026-11-16 发的另一篇新闻稿，宣布按季度发布"MeAgain Index"，给 GLP-1 相关的品牌、产品和药物做排名，数据来自它"数十万用户"的使用记录（https://www.retaildive.com/press-release/20261116-meagain-announces-a-new-quarterly-benchmark-for-trending-glp-1-products-and-1/ ，厂商新闻稿，搜索摘要）。这落在原文 5.2 节的时间窗里。它说明 MeAgain 在把用户数据做成面向品牌方的生意（推算），和评论里"More of a protein bar ad"对得上，也正好是我们"不带货、数据归你"可以对照的地方。
- **Bild Health：unverifiable。** 我的搜索没有返回任何关于它的结果，上架日期、价格和功能都无法核实。它也不是本轮才出现的：`c-business-compliance.md`（2026-11-20）已经把它列为"保肌方向初创，只有一篇宣传稿"。"保肌继续变挤"这句话目前只靠一篇厂商新闻稿的摘要；PRD 把保肌降为四个承诺之一的决定不依赖它。
- **"换 App 是常态"说重了。** 明确写出来源和去向的是 2,083 条里的 15 条（0.7%），正则命中"试过多款"的是 54 条（2.6%）。15 条里有几条是"装上就放弃"（例如因为只能用 Google 登录而删掉 Shotsy 的那条），不是带着数据搬家。能说的是"评论里看得到双向流动，没有看到谁靠数据把人锁住"，说不了"常态"。
- **语言。** 我重跑了一次：含中文字符的评论 0 条，A 组里没有任何一条在谈界面语言，和原文一致。PRD 第 0 节"评论里也有人抱怨只有英文"在这批语料里没有对应的原话，专题二已经指出它的出处是 Trustpilot 上的德语用户。

### 制定策略的人必须知道的五条修正

1. Shotsy 的"数据看不到"不是 3.4.0 一个版本的事：同样的症状从 8 月底就有，其中 3 条归因于升级 iOS 27，3.4.0 期间是 9 条而不是 7 条，11 月 5 日之后样本里再没有出现，11-06 到 11-17 的 30 条 App Store 评论没有一条低于四星，所以它应当被当作一次可能已经修复的事故来吸取教训，不能当作一个仍然敞开的进攻面。
2. "Shotsy 在给老付费用户改档"只有 4 条评论作证，没有任何官方或第三方出处，其中只有 2 条和续费时点有关，10 月 4 日之后没有再出现同类评论，所以"未来 12 个月每个月都有一批老用户到期出走"是没有依据的外推，不能写进策略当作流量来源。
3. Glapp 的网页版先例成立，但要读窄：它的网页版只比 iPhone 原生版早了大约三个月，提到网页版的 19 条评论里有 17 条来自当时没有原生版可用的安卓用户，评论里只看得到一路留到 App 的幸存者，所以它证明的是"网页版能撑过头几个月并且数据可以平移"，不是"网页版本身留得住人"。
4. "60 美元一年以上没有一条明说值"是只统计带数字的评论造成的：同一批语料里另有约 50 条四五星评论说 Shotsy 或 MeAgain 的订阅值得而没有写金额，无法归到具体价位，这批评论给不出价格上限，所以专题八一页结论里引用的这半句应当删掉，定价只以它自己的港台锚点和毛利测算为准。
5. 专题二已经核实 Shotsy 带简体和繁体中文界面、在港台以本地货币在售，并且自 3.0.1 版起有 Maintenance Mode，本笔记没有接上：用中文界面的 Shotsy 用户是直接的迁移对象而不只是"双语华人"，维持期也不能因为差评里是 0 条就被认定为我们独有的付费钩子；这些加上 Shotsy 导出文件的格式和是否免费，由创始人实机装一次 Shotsy 就能一并查清。
