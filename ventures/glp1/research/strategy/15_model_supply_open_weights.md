# 15 开放权重模型：托管在大陆以外，或者自己部署（后来者策略调研 · 第二轮 · 专题十五）

日期：2026-11-22 · 范围：创始人已经定了方向，即模型不绑定某一家，这个任务不复杂，之后可以用 DeepSeek，量大了甚至自己部署；第一年不主动要大陆用户。本笔记不重新讨论这个方向，只把它落到实处：哪些权重公开的模型能用、在大陆以外谁在托管、多少钱、自己部署要什么机器、月活多少才划算、小模型靠不靠得住、代码要做什么准备。

几个词先解释一遍：

- **开放权重模型**：训练好的参数文件公开下载，任何人可以在自己的机器上运行，也可以由第三方公司代为运行后按量卖接口。
- **token**：模型处理和计费的最小文字单位，一个汉字大致算一到两个。
- **量化**：把模型参数压缩成更少的位数（例如从 16 位压到 8 位或 4 位），省显存，代价是准确率可能略降。
- **结构化输出**：让模型的回答严格符合一个事先给定的 JSON 格式。做法之一叫约束解码，即在模型逐字生成时就把不合格式的字挡掉。
- **vLLM**：一个常用的开源推理服务程序，把模型装进显卡并对外提供接口，能把多个请求合在一起算。

## 先说证据边界

- 本轮 14 次搜索全部用完。**所有事实都出自搜索结果摘要，没有一页是打开原文读的。**
- 直接抓取试了四个站点各一次：deepinfra.com、www.together.ai、openrouter.ai、huggingface.co，都不在本会话允许的网络范围内。cloud.google.com 的两个价目页（合作伙伴模型、显卡）能连上，但只返回了标题，没有正文。之后没有再试任何站点。要核对原文，需要先在网络设置里放行这些域名。
- 价格类来源大多是第三方价目站和厂商博客，同一个模型在不同来源上的价格经常对不上。凡是这类都标了"（未核实）"，并把互相矛盾的数字并排列出。
- 有几个数沿用第一轮补查 `gap_ai_supplier_region_options.md` 从 Google Cloud 价目页原文读到的结果，标"第一轮原文"。
- 用量假设沿用第一轮的反推，未实测：每个活跃用户每月 60 次文字记录（每次输入 2,500、输出 500 token）、30 次拍照（另加一张约 1,000 token 的图片，输出 600 token）。合计每人每月输入 255,000、输出 48,000 token。
- 我不是律师。对许可证和条款的解读标了"我的解读"。
- 本笔记不写任何个人信息。

---

## 一、一页结论

1. **方向成立，但要补一个细节：DeepSeek 只能管文字，看图和"自己部署"要靠 Qwen 或 Gemma 这一档。** DeepSeek V4（2026-04-24 发布，MIT 许可证）权重公开、可以商用，但最小的 V4-Flash 也有 2,840 亿参数，没有查到它能看图；按参数量推算，自己跑至少要 2 张、多半要 4 张 80GB 的显卡，月租约 4,200–8,400 美元（推算），1–2 人团队不现实。权重公开、能看图、一张 24–48GB 显卡跑得动、许可证是 Apache 2.0 的，是 Qwen3.6-27B、Qwen3.6-35B-A3B 和 Gemma 4。所以"用 DeepSeek"落到实处是"买 DeepSeek 权重的托管接口做文字"，"自己部署"落到实处是"自己跑 Qwen 或 Gemma"。
2. **按量付费的开放权重接口，每个活跃用户每月约 0.04–0.24 美元，和 PRD 便宜一档（0.050 美元）同一个量级。** 文字加图片用 Qwen3.6-35B-A3B 约 0.07 美元，用 Qwen3.6-27B 约 0.16–0.24 美元；只算文字，DeepSeek V4.1 Flash 约 0.04–0.08 美元（推算；价格出自第三方价目站，未核实）。500 月活时一个月不到 120 美元，5,000 月活时约 350–1,200 美元。模型钱在前两个阶段都不是决策变量。
3. **开放权重模型的许可证不分地区，香港的限制只可能来自托管平台自己的条款，而这一条本轮没有查到任何一家的官方说法。** MIT 和 Apache 2.0 都不带地域限制（我的解读），所以第一轮那种"模型厂商的名单把香港排除在外"的情况在这里不存在。但 Together、Fireworks、Groq、DeepInfra、Cerebras、SiliconFlow、Cloudflare 对香港注册主体和人在香港的用户怎么规定，两个方向都没查到。要靠"用香港主体注册一次、读条款、发书面问题"来确认，并且从第一天起同时接两家。
4. **自己部署的回本点：一张显卡大约对应 3,000–12,000 月活；真正值得动手，是在接口账单持续超过每月约 1,500–2,000 美元以后。** 一张 RTX 4090（24GB）在显卡云上月租约 250–500 美元，对比文字加图片的接口价，回本点是约 1,500–7,100 月活；只跑文字时接口更便宜，回本点是 3,100–12,400 月活；换成较正规的显卡云上的 A100（80GB），回本点是 9,000–50,000 月活（推算）。这些数都没算备份的第二张卡和人工。一张卡能撑住的人数（推算为 3,200–16,000 月活）和回本点在同一个量级，而这个吞吐量本轮没有查到实测；按悲观的一端算，"按高峰配卡"在任何规模都不比最便宜的接口省钱。
5. **流量有高峰低谷时，不要指望"没人用就关机"。** 查到的数据是：模型装进显卡要 1–2.5 分钟，一句话记录等不了。可行的做法是"自己的一张卡跑常量，超出的部分和故障时转给托管接口"。两边跑同一份公开权重，行为一致，这正是开放权重相对闭源模型的好处。
6. **小模型的问题不在格式，在内容。** 2026 年一项覆盖 21 个模型的评测发现，输出格式几乎都合规，但字段内容完全正确的比例，最好的模型在文字上只有 83.0%，在图片上只有 67.2%（它的题目比我们的记录复杂，这两个数是提醒，不是对我们的预测）。食物照片更弱：十个看图模型估热量的平均误差在 39.8%–120.4% 之间；开源看图模型估份量并不比"直接按常见一份算"更准。PRD 第 3.2 节的评测集只量蛋白误差，不够用来放心换模型，要补上剂量、体重、症状、越界提问这些字段的逐项对错。
7. **在手机浏览器里直接跑模型做文字解析，2026 年还不能当主路径。** 现成的浏览器内模型要下载约 0.7GB 以上；一份报告里，一个 17 亿参数的小模型输出的 JSON 能解析的比例只有 26%；iPhone 上除 Safari 以外的内置浏览器能不能用显卡加速，来源互相矛盾。更划算的做法是继续扩充现有的本机规则（`app/src/core/localParse.ts`）。
8. **代码上要做的准备不多，但要现在做。** `app/server/parse.ts` 里有六处写法只有 Claude 的接口才有。改成"一层自己的接口加可配置的供应商"以后，换模型只是改配置和重跑评测。另外，这些模型的输出单价是输入的 4–10 倍，输出 token 占成本的四成半到六成多，把输出格式里大量的 null 字段去掉是第一个省钱动作。

---

## 二、按问题分节的证据

### 问题 1：2026 年可以商用的开放权重模型，哪些适合我们的两类任务

#### 1.1 DeepSeek

- DeepSeek V4 在 2026-04-24 发布，权重放在 Hugging Face 和 ModelScope 上，许可证是 MIT；发布时称为预览版，同时提供基础版和指令微调版。来源：https://www.theregister.com/2026/04/24/deepseek_v4/ ；https://api-docs.deepseek.com/news/news260424/ ；https://rits.shanghai.nyu.edu/ai/deepseek-releases-v4-open-source-1-6t-moe-with-1m-context （搜索摘要）
- 这一代有两个模型，都是"混合专家"结构（一种把模型分成很多组、每次只动用其中一小部分的设计；全部参数仍要装进显存）：V4-Pro 总参数 1.6 万亿、每次激活 490 亿；V4-Flash 总参数 2,840 亿、每次激活 130 亿。两者都支持最多 100 万 token 的输入。权重是 8 位和 4 位混合精度。来源同上；另见 https://the-decoder.com/as-agentic-ai-pushes-rivals-to-raise-prices-and-cap-usage-deepseek-ships-a-good-enough-model-for-almost-nothing/
- **能不能看图：没查到。** 这次搜索返回的发布材料只讲文字、编程和推理，没有任何一处提到图片输入。在亲眼看到模型说明页之前，按"不能看图"来规划。
- 之后出现了 V4.1 Flash（第三方页面上的型号带"1017"字样，可能指 10 月 17 日的版本）。它的权重是否公开：**没查到**。旁证是 Google Cloud 把 DeepSeek-V4.1-Flash 当作托管的开放模型在卖（第一轮原文：https://cloud.google.com/model-garden/partner-models/pricing ）。
- 对我们的含义：MIT 许可证允许商用、修改和再分发，只要求保留版权和许可声明，没有地域条款（我的解读）。也就是说任何一家托管商都可以合法地跑 DeepSeek 的权重，"用 DeepSeek"不等于"用 DeepSeek 这家公司的接口"。

#### 1.2 Qwen（通义千问的开放权重系列）

- Qwen3.6-35B-A3B 在 2026-04-16 开放权重：混合专家结构，总参数 350 亿、每次激活 30 亿，多模态（能看图），许可证 Apache 2.0。来源：https://www.alibabacloud.com/blog/alibaba-open-sources-qwen3-6-35b-a3b-wan2-7-tops-design-arena_603042 ；https://llm-stats.com/models/qwen3.6-35b-a3b ；https://rits.shanghai.nyu.edu/ai/qwen3-6-35b-a3b-alibaba-open-sources-a-frontier-class-agentic-coder/ （搜索摘要）
- Qwen3.6-27B 在 2026-04-22 开放权重：270 亿参数的普通（非混合专家）结构，多模态，许可证 Apache 2.0。来源：https://gigazine.net/gsc_news/en/20260423-qwen-3-6-27b/ （搜索摘要）。OpenRouter 的模型页写它的输入类型是文字、图片和视频。来源：https://openrouter.ai/qwen/qwen3.6-27b （搜索摘要）
- 同系列的旗舰 Qwen3.6-Plus 不开放权重，只能通过阿里云调用。来源：https://www.alibabacloud.com/blog/alibaba-open-sources-qwen3-6-35b-a3b-wan2-7-tops-design-arena_603042
- Qwen3.5 系列在 2026 年 2 月发布；一篇香港博客说它是 Apache 2.0。来源：https://hongkongaipodcast.com/blog/hk-ai-wall （单一来源，未核实）。Qwen3.5 有哪些小尺寸、许可证原文：**没查到**。
- 2026 年 10 月的几个第三方页面标题里出现了"Qwen3.7""Qwen3.8"。来源：https://dev.to/rigbase/what-gpu-do-you-need-for-qwen38-qwen36-gemma-4-and-gpt-oss-locally-measured-oct-2026-1eg6 （未核实）。是否已经有比 3.6 更新的开放权重版本：**没查到**，选型前要在 Hugging Face 上看一眼。
- 专门的看图系列（Qwen3-VL 的各个尺寸）以及中文文字识别、文档问答的公开评测分数：**没查到**（搜索没有返回这部分）。

#### 1.3 Gemma（Google 的开放权重系列）

- Gemma 4 在 2026-04-02 发布，许可证第一次改成 Apache 2.0；Gemma 3 及以前用的是 Google 自己写的使用条款。来源：https://the-decoder.com/googles-gemma-4-is-now-available-with-apache-2-0-licensing-for-the-first-time/ ；https://en.wikipedia.org/wiki/Gemma_(language_model) （搜索摘要）
- 尺寸：发布时四个，即 E2B、E4B（给手机和边缘设备）、26B（混合专家结构）、31B（普通结构）；后来的页面列五个，多了一个 12B。全部支持文字和图片输入，小的三个还支持音频。来源：https://www.kaggle.com/models/google/gemma-4 ；https://www.lilachbullock.com/gemma-4/ （搜索摘要；12B 是否支持音频没有对照官方说明）
- Gemma 4 做中文的公开评测：**没查到**。

#### 1.4 GLM、MiniMax、Kimi、Llama、Mistral、gpt-oss

- 这几家的现行许可证和最新开放权重版本：**没查到**。一次搜索把它们和 Gemma 放在一起问，返回的只有 Gemma。
- 已知的只有第一轮从 Google Cloud 价目页原文读到的托管价（美元每百万 token，输入和输出）：GLM-4.7 是 0.60 和 2.20；MiniMax-M2 是 0.30 和 1.20；Kimi-K2-Thinking 是 0.60 和 2.50；gpt-oss-120b 是 0.09 和 0.36；Meta Muse Ember 1.0 是 0.10 和 0.50；Qwen3-Next-80B-Instruct 是 0.15 和 1.20。来源：https://cloud.google.com/model-garden/partner-models/pricing （第一轮原文）。它们能否看图，价目页没有写。
- 背景知识（未核实，不作依据）：Llama 系列历来用 Meta 自己的社区许可证，带可接受使用政策，不是标准的开源许可证；用之前要读原文。

#### 1.5 汇总：哪些适合我们

| 模型 | 许可证 | 大小 | 看图 | 适合的任务 | 证据强度 |
|---|---|---|---|---|---|
| DeepSeek V4-Flash（及 V4.1 Flash） | MIT（V4.1 没查到） | 总参数 2,840 亿 | 没查到，按不能算 | 文字记录、提问、周复盘；只买托管接口 | 中（多家报道） |
| DeepSeek V4-Pro | MIT | 总参数 1.6 万亿 | 没查到 | 提问一类要更强模型的路线；只买托管接口 | 中 |
| Qwen3.6-35B-A3B | Apache 2.0 | 总参数 350 亿，激活 30 亿 | 能 | 文字加图片；托管最便宜；自己部署时速度快 | 中 |
| Qwen3.6-27B | Apache 2.0 | 270 亿 | 能 | 文字加图片；托管和自己部署都可以 | 中 |
| Gemma 4（12B、26B、31B） | Apache 2.0 | 120–310 亿 | 能 | 文字加图片；自己部署的备选 | 中 |
| Gemma 4（E2B、E4B） | Apache 2.0 | 给手机用的小尺寸 | 能 | 浏览器或手机内运行的实验 | 中 |
| GLM、MiniMax、Kimi、Llama、Mistral | 没查到 | 没查到 | 没查到 | 暂不列入 | 无 |

读法：中文能力和图片能力的公开评测本轮一个分数都没拿到，所以这张表只回答"许可证上能不能用、机器上跑不跑得动、能不能看图"，不回答"准不准"。准不准只能靠自己的评测集（见问题 5）。

---

### 问题 2：在大陆以外托管这些模型的平台

#### 2.1 价格（美元每百万 token；2026-11-22 搜索摘要）

**Qwen3.6-27B（能看图）**

| 来源说的平台 | 输入 | 输出 | 来源和强度 |
|---|---|---|---|
| OpenRouter（模型页） | 0.25 | 2.00 | https://openrouter.ai/qwen/qwen3.6-27b （搜索摘要） |
| OpenRouter、DeepInfra（价目站的另一个说法） | 0.32 | 3.20 | https://pricepertoken.com/pricing-page/model/qwen-qwen3.6-27b （未核实） |
| Fireworks | 0.90 | 0.90 或 0.45 | 同一个价目站的两个页面互相矛盾（未核实） |
| Together | 0.45 或 0.60 | 一处没写，一处写 3.60 | https://www.maximem.ai/blog/qwen-api-pricing-2026 等，两个说法对不上（未核实） |

**Qwen3.6-35B-A3B（能看图）**

| 来源说的平台 | 输入 | 输出 | 来源和强度 |
|---|---|---|---|
| DeepInfra（8 位量化版） | 0.10 | 0.95 | https://artificialanalysis.ai/models/qwen3-6-35b-a3b/providers ；https://pricepertoken.com/pricing-page/model/qwen-qwen3.6-35b-a3b （搜索摘要，第三方） |
| Parasail | 0.10 | 0.90 | 同上 |
| 阿里云 Model Studio | 0.375 | 2.25 | https://www.maximem.ai/blog/qwen-api-pricing-2026 （未核实） |

**DeepSeek（只做文字）**

| 平台 | 输入 | 输出 | 来源和强度 |
|---|---|---|---|
| DeepSeek 官方，V4 Flash，2026 年 8 月以前 | 0.14 | 0.28 | https://packet.ai/blog/deepseek-v4-flash-api-pricing （未核实） |
| DeepSeek 官方，V4.1 Flash，低峰时段 | 0.15（缓存命中约 0.003） | 0.60 | https://felloai.com/deepseek-pricing/ ；https://shattered.io/deepseek-v4-1-flash-70-percent-price-cut-2026/ ；https://saygm.com/blog/deepseek-pricing （未核实） |
| DeepSeek 官方，V4.1 Flash，高峰时段 | 0.30 | 1.20 | 同上；https://crazyrouter.com/en/pricing/deepseek-v4-flash |
| Google Cloud，DeepSeek-V4.1-Flash | 0.30 | 1.20 | https://cloud.google.com/model-garden/partner-models/pricing （第一轮原文） |
| Azure，V4 Flash | 0.19（缓存 0.028） | 0.51 | 第三方页面对 10 月价目的转述：https://benchlm.ai/deepseek/api-pricing （未核实） |
| Together，V4 Flash 的 7 月 31 日版本 | 0.14 | 0.28 | 一家竞争对手的博客（未核实）：https://packet.ai/blog/deepseek-v4-flash-api-pricing |
| Amazon Bedrock，DeepSeek v3.2（上一代） | 0.62（美国东西部）；0.74（东京、孟买等） | 1.85；2.22 | https://aws.amazon.com/bedrock/pricing/ （官方页的搜索摘要） |
| 各种转售商，V4.1 Flash | 0.035–0.045 | 0.18–0.29 | https://pricepertoken.com/pricing-page/model/deepseek-deepseek-v4-flash 等（未核实；来源自己提醒要看限流和量化版本） |

- DeepSeek 官方接口在 2026 年里改了至少三次价：先是每百万 token 0.14 和 0.28 美元的统一价；2026-08-16 起分高峰和低峰，低峰是高峰的一半，V4 Flash 的低峰输入价变成 0.22 美元；之后推出 V4.1 Flash，价格见上表。来源同上表（未核实，几家博客说法大体一致）。**高峰是哪几个小时：没查到。** 如果高峰对着北京时间的白天，台湾和香港用户的三餐时间正好全在高峰里。
- Amazon Bedrock 上另有：Qwen3 32B 约 0.15 和 0.60；Qwen3 VL 235B A22B（能看图）约 0.53 和 2.66。来源：https://pricepertoken.com/endpoints/bedrock ；https://builder.aws.com/content/3JMGosWc2bn6FL0I2tlUWLOq2ZQ/know-your-models-amazon-bedrock-cheat-sheet （第三方和个人整理，未核实）
- 一个参照价：阿里云国际站的 qwen3-vl-flash（能看图；是阿里云自己的商用型号，不是开放权重）是 0.022 和 0.215。来源：`13_mainland_paths.md` 第 2.3 节引的 https://www.alibabacloud.com/help/en/model-studio/qwen3-vl-flash
- **没查到价目的平台**：Groq、Cerebras、Cloudflare Workers AI、SiliconFlow 国际站、Azure AI Foundry 的官方价目；Fireworks、Together、DeepInfra 的官方价目页（只有第三方转述）。一次合并搜索只返回了 Bedrock。

#### 2.2 换算成每个活跃用户每月的成本（推算）

算法：文字每月 =（150,000 × 输入价 + 30,000 × 输出价）÷ 1,000,000；拍照每月 =（105,000 × 输入价 + 18,000 × 输出价）÷ 1,000,000。不计缓存折扣。

| 方案 | 文字每月 | 拍照每月 | 合计 | 相当于 PRD 便宜档（0.050 美元） |
|---|---|---|---|---|
| Qwen3.6-35B-A3B，0.10 和 0.95 | $0.044 | $0.028 | $0.071 | 1.4 倍 |
| Qwen3.6-27B，0.25 和 2.00 | $0.098 | $0.062 | $0.160 | 3.2 倍 |
| Qwen3.6-27B，0.32 和 3.20 | $0.144 | $0.091 | $0.235 | 4.7 倍 |
| DeepSeek V4.1 Flash 低峰，只做文字 | $0.041 | 不能 | — | — |
| DeepSeek V4.1 Flash 高峰或 Google Cloud，只做文字 | $0.081 | 不能 | — | — |
| 文字用 DeepSeek V4.1 Flash 低峰，拍照用 Qwen3.6-35B-A3B | $0.041 | $0.028 | $0.068 | 1.4 倍 |
| 文字用 DeepSeek V4.1 Flash 高峰，拍照用 Qwen3.6-27B | $0.081 | $0.062 | $0.143 | 2.9 倍 |
| gpt-oss-120b（Google Cloud），只做文字 | $0.024 | 没查到 | — | — |
| Bedrock 上的 Qwen3 VL 235B | $0.159 | $0.104 | $0.263 | 5.3 倍 |
| 参照：阿里云国际站 qwen3-vl-flash | $0.010 | $0.006 | $0.016 | 0.3 倍 |
| 参照：Gemini 2.5 Flash Lite（第一轮） | $0.027 | $0.018 | $0.045 | 0.9 倍 |

四点读法：

- 文字加图片的合理区间是每人每月 **0.07–0.24 美元**；只做文字是 **0.02–0.08 美元**。
- "文字用 DeepSeek、拍照用 Qwen"比"全部用同一个能看图的 Qwen"每人每月只便宜不到一美分。分两个模型的理由只能是准确率，不是价格。
- 在这些价目下，输出 token 占成本的四成半到六成多。Qwen3.6-35B-A3B 每人每月输出 4.8 万 token，按每百万 0.95 美元算是 0.046 美元，占 0.071 美元的 64%；Qwen3.6-27B 约 60%；DeepSeek V4.1 Flash 约 44%。现在的输出格式每条记录要写出 15 个字段，其中大半是 null，压缩输出是最直接的省钱办法。
- 提问和周复盘不在本专题的用量假设里。按一组能对上 PRD"0.3–0.6 美元"区间的用量反推（每月 10 次提问各输入 6,000、输出 800 token，4 次复盘各输入 2,000、输出 400 token；这组数是我假设的），换成 Qwen3.6-27B 或 DeepSeek V4.1 Flash 这一档是每人每月约 0.03–0.05 美元（推算）。提问的回答质量比价格重要，要单独评测，不能因为便宜就换。

#### 2.3 图片和结构化输出

- DeepInfra 的模型列表写 Qwen3.6-27B 接受文字、图片和视频输入，支持函数调用和结构化输出。来源：https://openrouter.ai/provider/deepinfra ；https://pricepertoken.com/pricing-page/model/qwen-qwen3.6-27b （搜索摘要）
- Fireworks、Together 以及其他平台上，同一个模型是否开了图片输入、是否支持按 JSON 格式约束输出：**没查到**。同一个模型在不同平台上开放的功能可以不同，这一点要逐家在控制台里确认。
- Google Cloud 上托管的开放权重模型是否支持图片：第一轮没查到，本轮页面只返回了标题，**仍然没查到**。

#### 2.4 数据保留和训练政策

下面全部出自第三方对比文章，互相之间有矛盾，都算"未核实"。来源：https://www.morphllm.com/fireworks-alternative ；https://www.morphllm.com/openrouter-alternative ；https://www.spheron.network/blog/zero-data-retention-for-llm-inference-what-a-fixed-plan-guar/ ；https://github.com/abubakarsiddik31/zdr ；https://getoffgridai.co/articles/best-private-llm-apis-in-2026-prompts-never-stored-or-trained-on/ ；https://aibizhub.io/articles/openrouter-vs-together-vs-fireworks-2026/

| 平台 | 来源的说法 |
|---|---|
| Fireworks | 开放模型默认不记录提示词和生成内容；例外是它的 Response 接口，默认会把对话状态保存 30 天 |
| Together | 两个说法：一说默认就不保留；一说默认会保存提示词，要管理员在组织设置的隐私页里关掉"提示词存储"才是不保留。训练默认关闭 |
| Groq | 可以在控制台的数据控制页里打开"零数据保留"；不打开时，防滥用日志最多保留 30 天；不用于训练 |
| DeepInfra | 提示词和结果在很短的时间后删除；例外是经它转接的 Google 模型 |
| OpenRouter | 默认不记录提示词；用户如果选择允许记录，可以换 1% 的折扣，同时把数据的商业使用权给了它；可以限定只走承诺零保留的上游 |

- 一条要记住的提醒：OpenRouter 这类转接平台自己的承诺管不到它背后的上游托管商。来源：https://www.morphllm.com/fireworks-alternative （未核实）
- Bedrock、Google Cloud、Azure 上的开放权重模型，数据保留是否和各自平台的通用承诺一致：**没查到**（Google 的通用训练承诺见第一轮补查）。
- 各家的官方隐私文档原文：**一份都没打开**。隐私政策里不能照这张表写，要以注册后看到的设置页和条款为准。

#### 2.5 对香港注册主体和人在香港的终端用户

- Together、Fireworks、Groq、DeepInfra、Cerebras、SiliconFlow、Novita、Cloudflare Workers AI：官方的支持地区或禁止地区条款，**没查到**。这是"没查到"，不是"查到确实没有限制"。
- OpenRouter：一个二手页面说，自 2026 年 3 月起，它对关联到中国大陆、香港等地的账号屏蔽了一部分美国厂商的闭源模型（Claude、GPT、Gemini、Grok），做法是对这些模型返回错误，不是封号。来源：https://grokipedia.com/page/OpenRouter （单一来源，未核实）。这条如果属实，说明限制跟着闭源模型的厂商走；它对开放权重模型有没有同样的屏蔽，来源没有说。
- 两篇香港本地的博客说，DeepSeek 的模型开源、没有地域限制，Qwen 可以经阿里云和 Hugging Face 取得；它们把美国 AI 工具对香港的限制归因于厂商自己的合规选择。来源：https://hongkongaipodcast.com/blog/hk-ai-wall ；https://doodhk.com/blog/ai-model-access-in-hong-kong/ （博客，未核实）
- 阿里云的 Model Studio 设有香港区域。来源：https://www.maximem.ai/blog/qwen-api-pricing-2026 （第三方，未核实）
- Amazon Bedrock 在香港区域（ap-east-1）有没有这些模型、香港账号能不能用：**没查到**。Azure 对香港的安排仍然只有第一轮查到的 2024 年声明。
- 我的解读：第一轮那两堵墙（供应商的地区名单按主体注册地和用户所在地排除香港）是闭源模型的厂商立的。开放权重模型的许可证里没有这种条款，所以墙只可能立在托管平台那一层，而且换一家托管商、甚至自己跑，模型还是同一个。这是"模型不绑定某一家"这个方向在香港问题上的实际好处。但在拿到至少一家的书面确认之前，不能写"香港可用"。

---

### 问题 3：自己部署

#### 3.1 什么档次的显卡能跑哪个模型

| 显卡（显存） | 能跑什么 | 依据 |
|---|---|---|
| 24GB（RTX 4090、RTX 3090 这一档） | Qwen3.6-27B 的 4 位量化版（文件约 16.8GB，剩下的显存够约 4.8 万 token 的上下文）；Qwen3.6-35B-A3B 的 4 位量化版（350 亿参数都要进显存，余量很紧，上下文只有约 0.8–1.6 万 token）；Gemma 4 31B 的量化版（上下文约 1.6–3.2 万） | https://willitrunai.com/blog/qwen-3-6-27b-vram-requirements ；https://runaihome.com/blog/best-local-llm-24gb-vram-2026/ （第三方，未核实） |
| 48GB（L40S 这一档） | Qwen3.6-27B 的 8 位版（要 32GB 以上） | https://sanj.dev/post/qwen3-6-27b-dense-coding-breakthrough/ （未核实；同一页说 vLLM 要 0.19.0 以上的版本） |
| 80GB（A100、H100） | Qwen3.6-27B 的原始精度版（要 60GB 以上） | 同上 |
| 2–4 张 80GB | DeepSeek V4-Flash。2,840 亿参数，全按 4 位算是 142GB，全按 8 位算是 284GB，实际是两者混合 | 推算：参数量 × 每个参数的字节数；没有查到实测 |

- 我们每次请求只有约 3,000–4,000 token，上表里"上下文很紧"的限制对我们影响不大（推算）。
- Gemma 4 的 12B 和更小的尺寸在 24GB 显卡上应当很宽裕（推算，没有查到实测）。

#### 3.2 速度

- 单个请求、不合并处理时（用的是 llama.cpp 和 Ollama 这类个人电脑上的运行程序，不是 vLLM），RTX 4090 上：Qwen3.6-27B 每秒约 38–42 个 token；Qwen3.6-35B-A3B 每秒约 107–120 个；Gemma 4 31B 每秒约 38–44 个。来源：https://canitrun.dev/gpus/rtx-4090/ ；https://willitrunai.com/blog/qwen-3-6-27b-vram-requirements ；https://runaihome.com/blog/best-local-llm-24gb-vram-2026/ ；https://dev.to/rigbase/what-gpu-do-you-need-for-qwen38-qwen36-gemma-4-and-gpt-oss-locally-measured-oct-2026-1eg6 （社区实测，未核实）
- 这个速度对我们意味着什么（推算）：一次记录按输出 500 token 算，Qwen3.6-27B 单独跑要 12–13 秒，Qwen3.6-35B-A3B 要 4–5 秒。一句话记录应当两三秒内出结果，所以在 24GB 显卡上，普通结构的 270 亿参数模型偏慢，混合专家结构的或者更小的模型更合适；同时也再次说明要压缩输出。
- 用 vLLM 把多个请求合在一起算时，总吞吐量高得多。一个论坛帖子的实测（模型是较小的 Qwen2.5-7B）：L40S 上，同时 8 个请求时每秒共输出 354 个 token，32 个请求时 1,082 个，64 个请求时 1,887 个；H100 上分别是 776、2,566、4,515 个。来源：https://discuss.huggingface.co/t/vllm-on-three-gpus-qwen2-5-7b-tokens-per-second-and-cost-per-1m-tokens-on-rtx-a6000-l40s-and-h100/191025 （单一来源）
- 一家显卡云的博客说，L40S 上跑 8 位版的 Qwen3 32B，单个请求每秒约 220 个 token，同时 8 个请求时共约 1,500 个；A100 80GB 上是约 300 和 870 个。来源：https://www.spheron.network/blog/l40s-vs-a100/ ；https://www.spheron.network/blog/nvidia-l40s-for-ai-inference/ （厂商自述，未核实；它比上一条论坛实测乐观得多，两者对不上）
- Qwen3.6 和 Gemma 4 在 vLLM 上多个请求同时处理的实测吞吐量：**没查到**。下面的推算取一个保守到乐观的区间：一张 24–48GB 的卡每秒共输出 300–1,500 个 token（推算：保守端按 7B 模型在 32 个并发时的 1,082 除以三到四；乐观端取厂商数字）。
- 换算成请求数（推算）：每次输出 500 token，相当于每秒 0.6–3 个请求。

#### 3.3 租显卡的价格（美元每小时；2026 年年中的第三方汇总，未核实）

| 显卡 | 便宜的显卡云 | 较正规的显卡云 | 来源 |
|---|---|---|---|
| RTX 4090（24GB） | Vast.ai 约 0.14（低的到 0.08）；RunPod 社区档约 0.34 | RunPod 机房档约 0.69 | https://www.spheron.network/blog/gpu-cloud-pricing-comparison-runpod-vs-vastai-2026/ |
| RTX 5090、L40S（48GB） | Vast.ai 各约 0.53 | 没查到 | https://klymentiev.com/blog/runpod-vs-lambda-vs-vast |
| A100（80GB） | Vast.ai 中位数约 1.00 | Lambda 约 1.99–2.79 | 同上；https://www.promptquorum.com/local-llms/cloud-gpu-rental-comparison-2026 |
| H100（80GB） | Vast.ai 最低约 1.49 | RunPod 约 2.89–3.29；Lambda 单张约 4.29 | https://www.hostinger.com/my/tutorials/cloud-gpu-pricing/ ；https://tech-insider.org/runpod-vs-lambda-vs-vast-ai-2026/ |

- 换成月费（推算，按每月 730 小时不关机）：RTX 4090 约 100–500 美元；L40S 约 390 美元（只有 Vast.ai 一个数）；A100 约 730–2,040 美元；H100 约 1,090–3,130 美元。
- 包月和预留：Vast.ai 称承诺 1–6 个月最多便宜 50%；Lambda 的预留集群从每张每小时约 5.54 美元起、16 张起租，和我们无关。来源：https://www.hostinger.com/my/tutorials/cloud-gpu-pricing/ （未核实）
- 主流云（AWS、Google Cloud、Azure）上 L4、A10G、L40S 这一档的小时价和包年价：**没查到**（搜索没有返回；Google Cloud 的显卡价目页只返回了标题）。
- 背景知识（未核实）：Vast.ai 是撮合平台，机器来自各种第三方出租人；RunPod 的社区档也类似，机房档才是正规数据中心。健康相关的文字和照片不应当放在来历不明的第三方机器上处理，所以下面算回本点时，把 RunPod 机房档和 Lambda 当作"可以用的"，把 Vast.ai 和社区档只当作价格下限。

#### 3.4 用 vLLM 的运维负担

本轮查到的硬数据只有三条：

- 冷启动（从开机到能接请求）要一到两分半钟。一个实测里，L40S 下载 15GB 的模型用了 78 秒，vLLM 启动到就绪又用了 67 秒；H100 上是 13 秒和 54 秒。另一个对比给的数是 H100 上冷启动约 62 秒。来源：https://discuss.huggingface.co/t/vllm-on-three-gpus-qwen2-5-7b-tokens-per-second-and-cost-per-1m-tokens-on-rtx-a6000-l40s-and-h100/191025 ；https://www.spheron.network/blog/vllm-vs-tensorrt-llm-vs-sglang-benchmarks/
- 打开 JSON 约束以后，vLLM 0.23 的吞吐量慢到原来的 1.05–1.27 分之一；对准确率的影响因模型而异，Qwen3-8B 掉 1.2 分，Llama-3.1-8B 掉 25.3 分。来源：https://arxiv.org/pdf/2611.10845 （搜索摘要）
- 约束解码背后的几种开源实现，合规率不一样：一项专门的评测里 guidance 最高，Outlines 因为生成超时而偏低。来源：https://arxiv.org/pdf/2501.10868 （2025 年，模型较旧）

**1–2 人团队自己部署的踩坑记录：没查到。** 搜索额度用完之前没有找到第一手的复盘文章。下面这张清单来自一般工程常识（背景知识，未核实），只作为动手前的检查表：

- 单张卡就是单点故障。显卡云的机器会被回收、会掉线，要么租第二张，要么保留托管接口作兜底。
- 模型、vLLM、显卡驱动三者的版本要对得上；新模型往往要求新版本的 vLLM，升级前要先在另一台机器上试。
- 要自己做监控和告警：排队长度、每次请求的耗时、显存、出错率。
- 量化版本和托管商用的版本不一定相同，换了量化就要重跑评测。
- 每一次模型升级、每一次安全补丁都是自己的活，没有人替你做。

#### 3.5 DeepSeek 自己部署这件事

- 按 3.1 的推算，V4-Flash 至少要 2 张、多半要 4 张 80GB 的显卡。按 RunPod 的 H100 每小时 2.89 美元算，月租约 4,200–8,400 美元（推算：2.89 × 730 × 2 或 4）。
- 对比只做文字的接口价每人每月 0.04–0.08 美元，回本点在 5 万到 20 万月活之间（推算：4,200 ÷ 0.081 ≈ 5.2 万；8,400 ÷ 0.0405 ≈ 20.8 万）。
- 结论：创始人说的"量大了甚至自己部署"，在这款产品可预见的规模里，部署的对象应当是 Qwen3.6 或 Gemma 4 这一档，不是 DeepSeek 本身。

---

### 问题 4：盈亏平衡

#### 4.1 回本点（推算）

算法：回本月活 = 显卡月租 ÷ 每个活跃用户每月的接口费。显卡按一张、每月 730 小时不关机算。接口费取问题 2 的四个价位：文字加图片取 0.071 美元（最便宜的 Qwen3.6-35B-A3B）和 0.160 美元（Qwen3.6-27B）；只跑文字取 0.041 美元（DeepSeek V4.1 Flash 低峰）和 0.081 美元（高峰或 Google Cloud）。

| 显卡和来源 | 月租 | 文字加图片，对比 0.071 | 文字加图片，对比 0.160 | 只跑文字，对比 0.041 | 只跑文字，对比 0.081 |
|---|---|---|---|---|---|
| RTX 4090，RunPod 社区档（仅作下限） | $248 | 3,500 | 1,550 | 6,100 | 3,100 |
| L40S，Vast.ai（仅作下限） | $387 | 5,450 | 2,400 | 9,550 | 4,800 |
| RTX 4090，RunPod 机房档 | $504 | 7,100 | 3,150 | 12,400 | 6,200 |
| A100 80GB，Lambda | $1,453–2,037 | 20,500–28,700 | 9,100–12,700 | 35,900–50,300 | 17,900–25,100 |
| H100，RunPod | $2,110 | 29,700 | 13,200 | 52,100 | 26,000 |

读法：

- "只跑文字"的回本点反而更高，因为文字接口本来就更便宜，而显卡的月租不变。自己部署如果只为了文字，几乎永远不划算；要部署就部署一个能看图的模型，文字和图片一起跑。
- 用得上的那一行是"RTX 4090，机房档"：回本点约 3,000–7,000 月活（文字加图片）。
- 这张表没有算三样东西：备份（第二张卡，或者保留一条托管接口）；人工；以及模型在自己的卡上要通过同一套评测。

#### 4.2 一张卡撑得住多少人（推算）

- 每个活跃用户每月 90 次请求、输出 48,000 token。5,000 月活就是每月 45 万次请求，平均每秒 0.17 次，平均每秒输出 93 个 token。
- 高峰假设为平均值的 5 倍（假设：用户集中在东八区，记录集中在三餐前后；没有数据）。5,000 月活的高峰是每秒约 0.9 次请求、约 460 个输出 token。
- 按 3.2 的区间，一张卡每秒共输出 300–1,500 个 token，对应高峰时能撑住约 **3,200–16,000 月活**。区间这么宽，是因为 Qwen3.6 和 Gemma 4 在 vLLM 上的并发吞吐量没查到实测。
- 所以一张卡的容量上限和它的回本点落在同一个量级：用户数刚过回本点时，卡也快满了。

换一个角度看同一件事（推算）：显卡是按时间收钱的，不管有没有人用。RTX 4090 机房档每小时 0.69 美元，如果一直跑满，每百万输出 token 的成本是 0.13–0.64 美元（0.69 ÷ 每小时输出的 token 数；吞吐量取每秒 1,500 和 300）。最便宜的接口（Qwen3.6-35B-A3B）把输入也折算进来，相当于每百万输出 token 1.48 美元（0.95 + 5.3 × 0.10；我们的输入量是输出量的 5.3 倍）。两者相除，自己的卡全天平均要用到 **9%–43%** 以上才比这个接口便宜；对比贵一些的 Qwen3.6-27B 接口（折算后 3.33 美元），门槛是 4%–19%。

- 如果按高峰来配卡，全天平均利用率最多只有两成（高峰是平均的 5 倍）。吞吐量落在悲观一端时，两成够不到 43% 的门槛，自己部署反而更贵。
- 这就是为什么自己的卡只能按"常量"来配、让它尽量跑满，高峰交给接口（见 4.4）。

#### 4.3 把张数算进去以后，什么时候才值得（推算）

算法：显卡张数 = 月活 ÷ 一张卡能撑的人数（3,200–16,000），向上取整，按高峰配；每张按 RTX 4090 机房档 504 美元一个月；接口月费 = 月活 × 0.071–0.235 美元。

| 月活 | 接口月费 | 显卡张数 | 显卡月费 | 自己部署比接口 |
|---|---|---|---|---|
| 500 | $36–118 | 1 | $504 | 每月亏 390–470 美元 |
| 5,000 | $355–1,175 | 1–2 | $504–1,008 | 亏 650 到省 670 美元 |
| 20,000 | $1,420–4,700 | 2–7 | $1,008–3,528 | 亏 2,100 到省 3,700 美元 |
| 50,000 | $3,550–11,750 | 4–16 | $2,016–8,064 | 亏 4,500 到省 9,700 美元 |

读法：

- 区间两头差得很远，原因有两个：一张卡到底能撑多少人没有实测；哪一档模型能过评测还不知道（过评测的模型越贵，自己部署越划算）。
- 悲观的一端（每张卡只撑 3,200 人，对比的又是最便宜的接口）在任何规模都亏。乐观的一端从 5,000 人起就省钱。
- 5,000 月活时，最好的情况每月省几百美元，换来的是一套要自己看管的服务，不值。到接口账单持续超过每月 1,500–2,000 美元时（约 6,000–28,000 月活，取决于过评测的是哪一档模型），省下的钱才可能抵得上一个人每月花在运维上的几天时间。
- 决定之前先花一两天、几十美元，租一张卡，用我们自己的请求测出真实吞吐量。这一个数能把上表的区间收窄到可以做决定的程度。

#### 4.4 流量有高峰低谷时怎么办

- **按需伸缩到零**（没人用就关机，有人来再开）：不适合一句话记录。冷启动要一到两分半钟（见 3.4），用户等不了。
- **排队**：拍照记录可以排队。PRD 本来就要求照片结果让用户确认，显示"正在识别"等十几秒可以接受。文字记录不能排，但可以先用本机规则给出能认的部分，剩下的稍后补上（设计建议，未验证）。
- **夜间关机**：只在按小时计费、并且夜里确实没人用时才省钱。东八区的用户夜里睡觉，但海外读中文的用户分布在北美和欧洲，他们的白天正好是东八区的夜里。每天关 6 小时最多省四分之一的显卡钱，同时这 6 小时的请求要转给托管接口。有了实际的分时段数据再决定。
- **推荐的做法**：自己的卡只按"常量"来配，高峰溢出的部分和故障时的全部请求转给托管接口。两边跑同一份公开权重，这样用户看不出差别。这要求代码里的供应商切换是自动的（见第三节）。
- 托管商自己也卖"专用实例"（按分钟租一张装好模型的卡，运维由托管商做），介于按量接口和完全自己部署之间。它的价格：**没查到**。

---

### 问题 5：小模型做这类任务靠不靠得住

#### 5.1 结构化输出：格式基本不出错，内容才是问题

- 2026 年一项评测（21 个闭源和开放权重模型，开放的那些用 vLLM 运行）的结论是：模型的格式合规率接近满分；但字段内容完全正确的比例，最好的模型在文字输入上是 83.0%，图片输入上是 67.2%，音频输入上是 23.7%。来源：https://arxiv.org/pdf/2604.25359 （搜索摘要）。这项评测的题目是从多种来源的长材料里抽取很多字段，比我们的"一句话拆成几条记录"复杂，所以这几个数不能直接套到我们身上；它说明的是方向：换模型时要查的是字段内容，不是 JSON 能不能解析。
- 不加任何约束时，一项测试里输出合乎格式的比例已经有 90%–94%。来源：https://blog.squeezebits.com/guided-decoding-performance-vllm-sglang （单一数据集）
- 很小的模型是另一回事。一份 2026 年 4 月的报告（不算严谨）里：Gemma 3 4B 的 JSON 可解析率是 100%，格式合规率在 4 位量化下降到 87%；SmolLM2 1.7B 的 4 位量化版可解析率只有 26.1%，格式合规率 4.3%。来源：https://ascentcore.com/2026/04/01/small-llm-performance-benchmark/ （未核实；模型是上一代的）
- 加约束有代价：吞吐量略降，个别模型的准确率明显下降（见 3.4）。所以评测时的设置必须和线上一致，开着约束测，就开着约束上线。
- Qwen3.6、Gemma 4、DeepSeek V4 做"中文口语转结构化记录"的公开出错率：**没查到**，也不太可能有人替我们测过。

#### 5.2 食物识别和份量估计

- 一项在 Nutrition5k 数据集（西式餐食，带称重真值）上比较十个看图模型的研究：即使食物种类认对了，热量和重量的误差仍然很大，热量的平均绝对百分比误差在 39.8%–120.4% 之间，重量的平均绝对误差在 53.7–97.6 克之间；给 GPT-4o 加上一个专门估体积的模块以后，热量误差是 43.4%。来源：https://www.biorxiv.org/content/10.64898/2026.07.26.740845v1.full （预印本，搜索摘要）
- 一项专门比较开源看图模型的研究：认食物最好的是 qwen2.5vl:7b，综合得分（F1）0.68；估份量时，各模型的平均绝对误差是 35–54 克、中位百分比误差 12%–16%，而"直接按常见一份算"的参照是 33–39 克和 12%–16%。也就是说，模型估份量并不比按常见一份算更准。来源：https://pmc.ncbi.nlm.nih.gov/articles/PMC13764829 （搜索摘要）
- DiningBench 评测里，Claude Sonnet 4.5 的蛋白质平均绝对百分比误差是 33.15%，热量 35.01%，碳水 51.52%，脂肪 50.82%；小模型不稳定，多给几张图反而可能更差。来源：https://arxiv.org/html/2604.10425 （搜索摘要；只看到这一行）
- 另一篇论文的题目本身就是结论：单张照片估食物重量的模型，换一个数据集，克数的尺度就对不上。来源：https://arxiv.org/pdf/2610.29025
- **中餐、蛋白质克数、Qwen 或 Gemma 对比闭源模型**这个组合的公开数据：**没查到**。药笔和药盒照片认药名和剂量的公开评测：**没查到**。
- 对照 PRD 的目标：PRD 第 3.2 节要求照片类误差的中位数不超过 35%。上面最强的闭源模型在蛋白质上的平均误差是 33%（平均数和中位数不是一个口径，中位数通常更低）。这说明 35% 这条线贴着当前最好水平，小一档的开放权重模型很可能过不了线；这是照片估算这件事本身的上限，不是换模型能解决的。

#### 5.3 需要什么样的评测集才能放心换模型

PRD 现有的设计是 150 条（100 条文字加 50 张照片），只量蛋白克数的误差。换模型要放心，至少补四样（建议，依据是上面两小节的证据）：

1. **按字段判对错，不只看蛋白。** 剂量的数字和单位、注射部位、体重（含斤、磅换算）、症状种类和轻重、一句话里拆出几条、越界提问有没有被标出来、认不出时有没有老实给 unknown，每一项单独算正确率。依据是 5.1："格式对"和"内容对"差着十几到三十几个百分点。
2. **剂量和体重的样本要多。** 记错剂量是这款产品最不能出的错。要证明出错率低于 1%，需要大约 300 条全对的样本（统计上的"三倍法则"：连续 n 条不出错，只能说明出错率有 95% 的把握低于 3 ÷ n）。这类句子是纯文字，可以用真实说法加模板批量造，成本很低。
3. **覆盖我们用户实际的说法和画面。** 繁体和简体、台湾用语、粤语口语、中英夹杂、各地的药名和商品名；照片要有台式便当、茶餐厅、自助餐夹菜，以及台湾、香港、日本、美国四种营养标签，还有各地在售的药笔和药盒。公开评测集全是西式餐食，对我们没有参考价值（依据：5.2 的"换数据集就对不上"）。
4. **同时记下成本和速度。** 每次调用实际用了多少输入和输出 token、耗时多少、有没有触发重试。第一轮的 token 用量是反推的，这一步顺便把它换成实测值。

换模型的门槛（建议）：新模型在剂量和体重两项上不能比现用的差；蛋白误差的中位数仍在 PRD 的线内；越界提问的漏标数为零。每一家托管商单独跑一遍，因为同一个模型在不同托管商那里可能是不同的量化版本（2.1 里 DeepInfra 标明了自己用的是 8 位量化版）。

#### 5.4 在手机或浏览器里直接跑小模型，现在是否现实

- 浏览器里跑模型的主流工具是 WebLLM。它在 2026-09-08 发布的 0.2.85 版只能靠 WebGPU（浏览器调用显卡的接口）运行，自带 163 个预先打包好的模型，最大到 130 亿参数；一个 10 亿参数、4 位量化的模型要下载 695MB，占约 880MB 显存。支持的模型包括 Qwen3、Gemma 等。来源：https://pinggy.io/blog/run_llm_in_browser_webgpu/ ；https://dev.to/creeta/qwen3-in-the-browser-zero-keys-webllm-0283-hands-on-3ai2 （搜索摘要）
- iPhone 上的支持，来源互相矛盾。WebKit 官方博客说 Safari 26 在 iOS 上带了 WebGPU。来源：https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/ 。但一篇 2026 年 6 月前后的实测文章说，iPhone 上所有非 Safari 的浏览器和应用内置浏览器用的那个组件（WKWebView）不开放 WebGPU。来源：https://dev.to/creeta/qwen3-in-the-browser-zero-keys-webllm-0283-hands-on-3ai2 （未核实）。这一条对我们很要紧：专题三和汇总都写了，用户多半是从 X、微信这些应用的内置浏览器里点进来的。
- 手机上的实际速度：只查到一个没说明硬件的数（8 亿参数的 Qwen 3.5 每秒 180 个 token）。来源：https://github.com/offlinecv/OfflineCV/issues/116 （未核实）。Chrome 内置的 Gemini Nano 和它的 Prompt API 是否支持中文和结构化输出：**没查到**。
- 判断（推算）：手机装得下的模型在 10–20 亿参数这一档，按 5.1 的数据，这一档的格式可靠性从"勉强可用"到"基本不可用"都有；用户第一次用要先下载 0.7GB 以上；一部分 iPhone 入口可能根本跑不了。所以 2026 年它不能当主路径。
- 更现实的"数据不出手机"做法是现在已经有的本机规则：`app/src/core/localParse.ts` 已经能认体重、打针和速查表里的食物。每多认一种说法，就少发一次请求，既省钱又少一次数据外发。
- 以后可以留一个口子：在电脑版 Chrome 上做一个可选的"本机解析"实验开关，用 Gemma 4 的 E2B 或 E4B，结果同样过评测集。这件事排在所有其他事之后。

---

## 三、对产品和策略的含义

### 3.1 分阶段的模型供应路线

| 阶段 | 用什么 | 记录的月成本（推算） | 数据去向 | 关键动作 |
|---|---|---|---|---|
| 月活 0–500 | 只用按量付费的托管接口。文字和图片先用同一个能看图的开放权重模型（Qwen3.6 一档），或者文字用 DeepSeek 权重、图片用 Qwen，由评测决定。同时接两家托管商，一主一备 | 0–120 美元（500 人 × 0.07–0.24 美元） | 我们的服务器 → 大陆以外的一家托管商 | 用香港主体注册并读条款；跑评测；把代码改成可换供应商 |
| 月活 500–5,000 | 仍然只用托管接口。把"零数据保留"的设置逐家打开并截图留档；按实测用量校准成本；每次换模型或换托管商都重跑评测 | 35–1,200 美元 | 同上；备用的那一家也要写进隐私政策 | 每周看每个活跃用户的实际模型成本，免费和付费分开；压缩输出 |
| 月活 5,000 以上 | 默认还是托管接口。接口账单持续超过每月约 1,500–2,000 美元（约 6,000–28,000 月活，取决于过评测的是哪一档模型），并且实测吞吐量够用时，加自己租的显卡跑常量，高峰和故障转给托管接口 | 5,000 人时 355–1,175 美元；2 万人时接口 1,420–4,700 美元，或显卡 1,000–3,500 美元加溢出部分的接口费 | 自己租的显卡（要选定地区的正规机房）加一家备用托管商 | 先在自己的卡上通过同一套评测，再切流量；先切拍照（可以排队），后切文字 |

提问和周复盘另算，每人每月约 0.03–0.05 美元（推算，见 2.2），三个阶段都走托管接口。

### 3.2 第一步具体选哪家：三类候选，按这个顺序验证

1. **大云上的开放权重模型（Google Cloud）。** 第一轮已经读过它的条款，没有找到按注册地或用户所在地的限制；上面有 DeepSeek-V4.1-Flash（每百万 token 0.30 和 1.20 美元）。优点是一个账号、一份条款，还能和第一轮建议验证的 Gemini 放在同一处。要补查的是这些模型能否看图、各自的附加条款。
2. **专做开放模型的托管商（DeepInfra、Fireworks、Together、Parasail 等）。** 开放权重模型里价格最低，Qwen3.6 能看图，DeepInfra 写明支持结构化输出。香港主体能不能注册、条款怎么写，本轮没查到，要动手试。
3. **阿里云国际站。** 所有候选里价格最低（参照型号每人每月约 0.016 美元），设有香港区域，香港主体多半没有障碍（未核实）。问题是台湾和海外用户对"数据交给一家大陆背景的云"的观感，这一点没有数据；第一轮已把它列为最后的备选，本轮没有新证据改变这个排序。

DeepSeek 官方接口（由 DeepSeek 公司自己运营的那一个）暂时不排进这三类，理由有三条：它的数据存放地和对香港主体的条款本轮没查（`13_mainland_paths.md` 试过它的文档站，打不开）；它在 2026 年里至少改了三次价，现在还分高峰和低峰（未核实）；第一年不主动要大陆用户，而它由一家大陆公司运营（背景知识），台湾和香港的用户看到会怎么想没有数据。"之后可以用 DeepSeek"这个方向不受影响：用大陆以外的托管商跑它公开的权重，模型是同一个。如果以后想直连官方接口，先补查数据存放地、香港条款和高峰时段这三件事。

验证动作（每家一到两小时）：用香港主体和香港账单地址注册；在条款里找"禁止地区""出口管制"一节；给支持邮箱发两句话的书面问题，即香港注册的公司能否使用、能否向人在香港的终端用户提供；在控制台里确认所选模型能否传图片、能否按 JSON 格式约束输出、数据保留的设置在哪里。

### 3.3 什么时候才值得自己部署

满足下面任何一条，才开始认真评估；否则不做。

- **钱**：记录这条路线的接口账单连续三个月超过每月 1,500–2,000 美元，并且租一张卡实测的吞吐量显示，一张卡能吸收的流量超过它的回本点（RTX 4090 机房档约 3,000–7,000 月活）。
- **断供**：两家托管商里有一家因为地区原因停了我们，并且找不到第三家。开放权重保证了这时至少还有"自己跑"这条退路，这是它相对闭源模型的保险价值。
- **隐私承诺**：决定把"文字和照片只在我们自己租的机器上处理"当作卖点。这是产品决定，不是成本决定，并且要接受 4.3 那张表里 5,000 月活时每月可能多花一百多美元。
- **微调**：评测发现通用模型在中餐或药名上过不了线，需要用自己的数据微调一个小模型。托管商对自带模型通常按专用实例收费（价格没查到），那时自己部署和托管的价差会缩小。

动手时的顺序：先在租来的一张卡上跑通评测；再把拍照这条线的一部分流量切过去（它能排队，出了问题影响小）；稳定一个月后再切文字。

### 3.4 代码上要做的准备

现状：`app/server/parse.ts` 直接调用 Claude 的接口，`app/server/index.ts` 里的出错处理也写死了同一家的错误类型。下面是要改的地方，按先后排。

1. **抽一层自己的接口。** 定义"给一句话或一张图，返回记录数组、是否无法处理、用了多少 token、耗时、是哪家哪个模型"。`toEvents` 那段校验和夹紧范围的代码与供应商无关，原样保留，它是最后一道闸。
2. **写一个通用的适配器，走业内通用的那种聊天接口格式。** 多数托管商和 vLLM 都提供与 OpenAI 的聊天接口兼容的调用方式（背景知识，逐家确认），所以一个适配器可以覆盖大部分候选。
3. **供应商、模型名、接口地址、密钥全部走配置，文字和图片分开配。** 这样"文字用 DeepSeek、图片用 Qwen"或者"全部用一个模型"只是改两行配置。
4. **替换六处只有 Claude 才有的写法。** 它们是：结构化输出的专用辅助函数（`betaZodOutputFormat` 和 `messages.parse`）；服务端回退（`fallbacks` 和对应的 beta 头）；`effort` 参数；`cache_control` 缓存标记；用 `stop_reason === 'refusal'` 判断拒答；以及 `index.ts` 里按 `Anthropic.RateLimitError` 等类型分流的出错处理。替换办法分别是：把现有的 Zod 定义转成 JSON Schema 传给接口的格式约束参数（项目用的 `zod/v4` 自带转换函数，动手时确认）；自己写"主用失败就换备用"的回退；关掉模型的"思考"模式或给它设上限；固定不变的系统提示词继续放最前面；把"输出为空或过不了校验"当作无法处理，提示用户手动录入；出错类型改成自己的三种，即上游忙、上游连不上、其他。
5. **格式约束不能只靠托管商。** 有的托管商不支持严格的格式约束。兜底做法是：要求输出 JSON，把格式写进提示词，用现有的 Zod 定义校验，不合格重试一次，再不行就换备用。
6. **压缩输出。** 现在每条记录要写出 15 个字段，其中大半是 null。可以改成"只写有值的字段"，或者把字段名缩短。输出 token 占成本的六成，也决定用户等几秒（依据：2.2 和 3.2）。改完要重跑评测。
7. **每次调用记一行日志，只记数字。** 供应商、模型、输入和输出 token 数、耗时、是否通过校验、是否用了备用。不记用户的文字和照片。这一行日志同时回答"每个活跃用户实际花多少钱"和"什么时候到自己部署的线"。
8. **把评测做成一条命令。** 指定供应商和模型，跑完输出 5.3 里的各项正确率、成本和耗时，结果存进仓库。以后换模型的流程就是：改配置，跑命令，对比上一次的结果。
9. **拍照的提示词要补药笔和药盒。** 现在的写法是"不是食物就记 unknown"，而产品要求里有"药笔或药盒照片认药名和剂量"。认药名和剂量的结果必须让用户确认，不能直接入库。
10. **继续扩充本机规则。** 每多认一类说法，就少一次外发和一次计费。

### 3.5 隐私政策和 AI 告知页怎么写

通用原则：只写亲眼在供应商的条款或设置页里看到的内容；供应商的名字和服务器地区从配置里读出来显示，换供应商时页面跟着变，并保留一份更新记录；继续沿用汇总里的结论，对外不说"数据不到服务器"。

- **用托管接口的阶段**，可以写成："你输入的文字或照片，连同你当前用的药和单位，会经过我们的服务器发送给模型托管服务商 [名称]，在 [地区] 的机房里处理。我们使用的是权重公开的模型，由该服务商代为运行。按它的条款，请求内容 [不保存 / 最多保存 N 天]，不用于训练模型。高峰或故障时，请求会改发给备用服务商 [名称]，条件相同。照片识别完成后，我们的服务器不保存。"方括号里的内容，没有核实之前不要填"不保存"。
- **如果经过 OpenRouter 这类转接平台**，要把转接平台和它背后实际运行模型的托管商都写上，并在转接平台的设置里限定只走承诺零保留的上游（依据：2.4）。更简单的做法是不经转接，直接和托管商签。
- **自己部署以后**，可以写成："文字和照片在我们租用的服务器上处理，机器由 [云厂商] 提供，位于 [地区]；不发送给任何模型公司。高峰或故障时会临时改发给备用服务商 [名称]。"注意：提供显卡的云厂商仍然是数据处理方，不能写成"数据只在我们手里"。
- **不要写的话**："使用 DeepSeek"但不说明是谁在哪里运行。对台湾和香港的读者，这句话会被读成"数据去了大陆"。要写就写全："使用 DeepSeek 公开发布的模型，由 [名称] 在 [地区] 运行。"
- 各地对健康数据跨境传输的要求，见 `06_compliance_regions.md`，本笔记没有新查。

### 3.6 对定价和毛利的影响（推算）

算法沿用 `08_monetization.md` 第 5.3 节和第一轮补查：综合毛利率 =（标价 − 手续费 − 付费用户自己的模型费 − 分摊的免费用户模型费）÷ 标价；29.99 美元年票扣手续费后是 27.71 美元；免费用户的记录用量按付费用户的一半、不带提问和周复盘；付费用户占月活 5% 时每个付费用户背后有 19 个免费用户，10% 时有 9 个。付费用户的模型费 = 记录加上提问和周复盘（按 2.2 的 0.03–0.05 美元）。

| 过评测的是哪一档 | 付费用户每月 | 免费用户每月 | 付费占月活 5% 时的毛利 | 10% 时的毛利 |
|---|---|---|---|---|
| Qwen3.6-35B-A3B 一档（记录 0.071 美元） | $0.10 | $0.036 | 约 61% | 约 76% |
| Qwen3.6-27B，低价说法（记录 0.160 美元） | $0.20 | $0.080 | 约 24% | 约 56% |
| Qwen3.6-27B，高价说法（记录 0.235 美元） | $0.29 | $0.118 | 约 −8% | 约 39% |

读法：

- 结论和第一轮对 Gemini 的结论是同一个形状：付费用户自己的成本很小，变化全在免费用户身上，"哪一档模型过评测"仍然是定价的开关。
- 好的一面：如果提问和周复盘也能换到开放权重这一档，付费用户每月的模型费从 PRD 的 0.35–0.65 美元降到 0.10–0.29 美元。前提是提问的回答质量过得了单独的评测，这一点没有任何数据。
- 这张表继承了专题八"免费用户用量是付费用户一半"的假设，专题八的核查已经指出它多半偏高。

### 3.7 和其他文件的关系

| 文件 | 要改或要注意的地方 |
|---|---|
| `gap_ai_supplier_region_options.md` 第 3.6 节 | "Google Cloud 上的开放权重模型"从"低价备份"升为和 Gemini 并列的一条主线；"是否支持图片"仍然没查到 |
| PRD 第 5.4 节 | 模型一栏改成"可配置的供应商"；实现要点按 3.4 的第 4 条重写；成本表的便宜一档改成每人每月 0.04–0.24 美元 |
| PRD 第 3.2 节 | 评测集按 5.3 扩充：加字段级的对错、300 条剂量和体重样本、成本和耗时 |
| PRD 第 4.2 节 | 告知页按 3.5 的模板写；供应商名和地区从配置读取 |
| `08_monetization.md` 第 5 节 | 毛利表按 3.6 重算；"哪一档模型过评测"仍然是定价的开关 |
| `13_mainland_paths.md` | 没有冲突。它查的是大陆境内已备案模型的人民币价；本笔记查的是大陆以外的托管和自己部署。阿里云国际站的参照价引自它 |

---

## 四、没查到的

1. **各托管平台对香港的官方规定。** Together、Fireworks、Groq、DeepInfra、Cerebras、SiliconFlow 国际站、Novita、Cloudflare Workers AI、Bedrock（非 Claude 模型）、Azure AI Foundry 对香港注册主体和人在香港的终端用户怎么规定，一家的官方原文都没有看到。
2. **Groq、Cerebras、Cloudflare Workers AI、SiliconFlow 国际站、Azure AI Foundry 上有哪些模型和价格。** 完全没有查到。Fireworks、Together、DeepInfra 只有第三方转述的价格，而且互相矛盾。
3. **所有价格的官方原文。** 本轮没有一个价格是从厂商自己的价目页上读到的（Google Cloud 的几个数沿用第一轮）。
4. **各平台数据保留和训练政策的官方原文**，以及零数据保留是默认还是要手动打开。
5. **DeepSeek V4 和 V4.1 能否看图；V4.1 Flash 的权重是否公开；官方接口的高峰时段是哪几个小时；官方接口的数据存放地和条款。**
6. **Qwen 有没有比 3.6 更新的开放权重版本（3.7、3.8）；Qwen3.5 的小尺寸和许可证；专门的看图系列各尺寸；GLM、MiniMax、Kimi、Llama、Mistral 的现行许可证。**
7. **中文能力和图片能力的公开评测分数。** 一个都没拿到，包括中文文字识别、中餐识别、药盒识别。
8. **Qwen3.6 和 Gemma 4 在 vLLM 上多个请求同时处理时的实测吞吐量**；3.2 里的区间是从别的模型推过来的，两个来源还互相对不上。
9. **主流云（AWS、Google Cloud、Azure）上 L4、A10G、L40S 的小时价和包年价**；托管商"专用实例"的价格；L40S 在正规显卡云上的价格。
10. **1–2 人团队自己部署的第一手踩坑记录。** 3.4 的清单是常识，不是证据。
11. **手机上跑小模型的实测速度和耗电；iPhone 应用内置浏览器到底能不能用 WebGPU；Chrome 内置模型对中文和结构化输出的支持。**
12. **我们自己的任务上任何一个模型的准确率、实际 token 用量、实际高峰倍数。** 全部要靠评测集和上线后的日志。回本点的每一个数都依赖"每月 60 次文字加 30 次拍照"和"高峰是平均的 5 倍"这两个没有实测的假设。

要让 AI 读原文，需要在网络设置里放行：huggingface.co、openrouter.ai、deepinfra.com、www.together.ai、fireworks.ai、groq.com、api-docs.deepseek.com、aws.amazon.com，以及 Google Cloud 价目页实际加载数据的域名。

---

## 附：本轮的 14 次搜索

1. DeepSeek V4 open weights license MIT Hugging Face release 2026 model sizes parameters vision multimodal
2. Qwen3-VL open weights Apache 2.0 sizes 2B 4B 8B 32B benchmark OCR Chinese DocVQA; Qwen 3.5 / Qwen3.6 open-source release 2026 license
3. Qwen3.6-27B Qwen3.6-35B-A3B API pricing per 1M tokens DeepInfra Together Fireworks OpenRouter image input structured output providers
4. DeepSeek V4 Flash pricing per million tokens third-party providers Together AI Fireworks DeepInfra Novita vs official DeepSeek API price 2026 off-peak cache
5. Gemma 4 license Apache 2.0 sizes E2B E4B 12B 27B multimodal; Llama 4 community license restrictions; Mistral Small 4 license; GLM open weights MIT; MiniMax M2 license commercial use 2026
6. Together AI Fireworks DeepInfra Groq OpenRouter zero data retention policy training on customer prompts 2026 supported countries Hong Kong China restricted
7. GPU cloud rental price per hour 2026 RunPod Lambda Vast.ai L4 A10G RTX 4090 RTX 5090 L40S A100 H100 on-demand vs reserved monthly; AWS g6e.xlarge L40S price
8. vLLM Qwen3.6-27B OR Qwen3.6-35B-A3B OR "Gemma 4" VRAM requirements quantization AWQ FP8 single GPU L40S 48GB RTX 4090 throughput tokens per second concurrent requests benchmark
9. small open-weight LLM structured output JSON schema failure rate benchmark constrained decoding vLLM guided json Qwen Gemma 2026 JSONSchemaBench schema compliance percent providers differ
10. vision language model food photo nutrition estimation accuracy benchmark protein portion size error MAPE 2025 2026 open-weight Qwen-VL Gemma vs GPT Gemini Chinese food dataset
11. WebLLM WebGPU in-browser LLM 2026 iOS Safari support Gemma 4 E2B Qwen small model download size tokens per second phone; Chrome Prompt API Gemini Nano structured output Chinese language support
12. "Hong Kong" inference API open-source models available OR restricted Groq OR "Together AI" OR Fireworks OR DeepInfra OR Cerebras OR SiliconFlow OR Novita supported countries terms export sign up 2026
13. vLLM benchmark concurrent requests total throughput tokens per second single GPU L40S OR A100 OR H100 27B-32B model 2026; self-hosting LLM vs API break-even small team lessons cold start scale to zero
14. Amazon Bedrock Qwen DeepSeek open-weight models pricing regions Hong Kong ap-east-1 2026; Groq Cerebras Cloudflare Workers AI model list pricing per million tokens vision JSON mode Qwen Gemma

另有六次直接访问尝试：deepinfra.com、www.together.ai、openrouter.ai、huggingface.co 四个站点连不上；cloud.google.com 的两个价目页只返回了标题。之后没有再试。
