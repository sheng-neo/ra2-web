# 缺口补查：模型供应商、公司主体和可服务地区

日期：2026-11-22 · 范围：在"官方《支持地区政策》不含香港、澳门和中国大陆"这个前提下，这款产品有哪些合规的模型供应路径；替代模型做"中文一句话或拍照记录"要多少钱；把主体换到新加坡、台湾或美国继续用 Claude，对股东和实际控制人有什么要求。

## 先说证据边界

- **直接打开了原文的**（2026-11-22 抓取）：Anthropic 的《支持地区政策》现行版和两个历史版、2025 年 9 月的公告、《商业服务条款》；Claude 官方价目和图片计费说明；Google Cloud 的模型价目页、合作伙伴模型价目页、《服务专用条款》。下文凡是写"原文"的，都出自这些页面。
- **只拿到搜索摘要的**：OpenAI、Microsoft Azure、AWS、Google 的 Gemini API 文档站（ai.google.dev）和 Google Cloud 文档站（docs.cloud.google.com）、阿里云。这些域名在本会话里打不开，各试了一次就停了。下文凡是出自摘要的，都写明"搜索摘要"。
- 共用了 8 次搜索。OpenAI 和 Azure 两家查到的最新材料停在 2024 年，2025–2026 年有没有变化没查到。
- 我不是律师。下面对条款的解读是我按字面读出来的，标了"我的解读"的地方需要律师或供应商书面确认。
- 本笔记不写任何个人信息。股东和实际控制人在哪里，按要求列成一个要问创始人的问题，没有猜。

---

## 一、一页结论

1. **"香港主体加 Claude"不成立，换成 AWS、Google Cloud、Microsoft 上的 Claude 也不成立。** 现行政策 2026-11-12 生效，开头就把"通过云平台和授权经销商提供的 Claude 模型"和直连 API 放在同一份名单下；名单上没有香港、澳门和中国大陆，在名单外注册或设总部的主体连同它的用户和人员都算不支持。原型里 `app/server/parse.ts` 现在调用的就是 Claude，公开上线前要换掉。
2. **换主体也救不了"人在香港或大陆的用户"。** 政策第一项按使用者"实际所在地"算，明文写了"包括受支持主体的用户和人员"；《商业服务条款》把"用户"定义为客户自己的客户和终端用户。所以即使主体迁到新加坡、台湾或美国，人在香港和大陆的用户仍然不能用由 Claude 驱动的万能输入栏（我的解读）。
3. **换主体继续用 Claude，要同时过三关，其中"多数持股或控制"一关取决于创始人自己的情况。** 三关是：主体不在名单外注册或设总部；主体不被名单外的"个人或实体"直接或间接多数持有或控制；用的人不在名单外。数字门槛只在 2025-09-04 的公告里出现过，是"超过 50%"；现行政策写的是"多数持有或控制"，没有数字，也没有定义"控制"和"个人在名单外地区"按什么算。
4. **OpenAI 同样不通。** 搜索摘要显示它的名单外一律不支持，在名单外使用或向名单外提供访问可能被封号；2024 年 7 月它开始拦截来自香港和大陆的 API 流量。2025–2026 年有没有放开，没查到。
5. **保留香港主体的前提下，最值得先验证的路径是经 Google Cloud 调用 Gemini（平台现在叫 Gemini Enterprise Agent Platform，原名 Vertex AI）。** 依据有三条：Google 的可用地区页建议名单外的开发者改用这个平台；香港本身是这个平台的一个区域；我通读了 Google Cloud《服务专用条款》里的生成式 AI 部分，没有找到按客户注册地或终端用户所在地的限制。证据强度是中等，上线前要拿到 Google 的书面确认。Azure OpenAI 是第二备选，依据只有 2024 年的一条声明。
6. **替代模型的单价落在 PRD 两档之间，便宜的一档和 Haiku 5.5 同一个量级。** 按我还原的 token 用量，每个活跃用户每月 60 次文字加 30 次拍照：Gemini 2.5 Flash Lite 约 0.045 美元（Haiku 档 0.050 美元的 0.9 倍），Gemini 3.1 Flash-Lite 约 0.137 美元（2.8 倍），Gemini 3.5 Flash-Lite 约 0.198 美元（4 倍）；贵的一档里 Gemini 4 Neon 约 1.50 美元（Opus 5.5 档 1.98 美元的 75%）（推算）。
7. **付费用户的成本基本不变，免费用户的成本对"哪一个便宜档通过评测"很敏感。** 记录用 Gemini 3.1 Flash-Lite、提问和周复盘用 Gemini 4 Neon 时，付费用户每月约 0.36–0.59 美元，和 PRD 的 0.35–0.65 美元几乎一样；但免费用户每月从约 0.025 美元升到约 0.068 美元，专题八那张表里 29.99 美元年票在 5% 付费率下的毛利会从约 47%–59% 掉到约 17%–26%（推算）。如果 Gemini 2.5 Flash Lite 通过评测，毛利表不用改。
8. **Google 的条款会带来三条新约束，要写进 PRD 和隐私政策。** 一是不得面向或可能被未满 18 岁的人使用；二是不得用于临床目的、不得替代专业医疗建议、不得用于需要监管机构批准的用途；三是标为 Google Frontier Models 的模型，提示词和输出会为安全审查保存最多 30 天。有利的一条是：未经客户许可，Google 不用客户数据训练模型。

---

## 二、按问题分节的证据

### 问题 1：各家对"香港注册的主体"和"人在香港或大陆的终端用户"怎么规定

#### 1.1 Anthropic 直连（原文）

- 现行《支持地区政策》生效日期是 2026-11-12。来源：https://www.anthropic.com/legal/supported-regions
- 适用范围的原文是：产品和服务"including our apps (such as Claude.ai, Claude Code, and Cowork), our API and developer platform, and Claude models offered through cloud platforms and authorized resellers — are available only in the countries and regions listed below"。来源同上。
- "Any country or region not listed is unsupported. This includes"之后列了三项，原文如下。来源同上。
  - "Use by persons while physically located in an unsupported region, including users and personnel of otherwise supported entities."
  - "Use by entities incorporated or headquartered in an unsupported region and their users or personnel, regardless of whether such individuals are physically located in a supported region."
  - "Use by entities that are majority-owned or controlled, directly or indirectly, by persons or entities in unsupported regions, including use by their users or personnel, regardless of whether such individuals are physically located in a supported region."
- 名单里有 Taiwan、Singapore、United States of America、Japan、Malaysia；我在页面全文里检索 Hong Kong、Macau、Macao、China，三个版本都是 0 处命中。来源：https://www.anthropic.com/supported-countries ；https://www.anthropic.com/legal/supported-regions
- 政策页没有写执行方式、例外或申请豁免的流程。这一点是**查到确实没有**（指这一页上没有，不代表私下不能谈）。来源同上。
- 《商业服务条款》（2025-06-17 生效）把三件事连在了一起。来源：https://www.anthropic.com/legal/commercial-terms
  - A.1 条：客户可以用服务来驱动"products and services Customer makes available to its own customers and end users ("Users")"。也就是说，我们产品的终端用户就是条款里的"Users"。
  - D.2 条："Customer and its Users may only use the Services in compliance with these Terms, including ... our policy on the countries and regions Anthropic currently supports"；并且客户要配合合理的信息要求，"including to verify Customer's identity and use of the Services"。
  - I.3.a 条：如果供应商合理认为"Customer or any User"违反 D.2 条，可以暂停全部或部分服务。
- 我的解读：香港注册的主体不能当客户；人在香港或大陆的终端用户不能用由 Claude 驱动的功能，这一条和主体在哪里无关；供应商有权要求核实身份，也有权直接停服务。

#### 1.2 经云平台使用 Claude

- Anthropic 自己的政策已经把"cloud platforms and authorized resellers"写进适用范围（见 1.1）。所以 Amazon Bedrock、Google Cloud、Microsoft Foundry 上的 Claude 适用同一份名单。来源：https://www.anthropic.com/legal/supported-regions
- Google Cloud《服务专用条款》（2026-11-18 最后修改）里"Third-Party Enterprise Models"一节写明："Customer must use Anthropic models in compliance with ... Anthropic's policy on the countries and regions Anthropic currently supports"；Google 合理怀疑客户或终端用户违反时可以立即暂停或终止。这一节管的是 Gemini Enterprise 等产品里启用的第三方模型。来源：https://cloud.google.com/terms/service-terms
- Amazon Bedrock：一篇 AWS Builder Center 上的个人实测说，账单地址在东京的账号，接上香港的无线网络后，每一次调用 Anthropic 模型都被拒，报错是"Access to Anthropic models is not allowed from unsupported countries, regions, or territories"，作者的结论是 Bedrock 检查的是连接来源，不只是账号注册地。一个 GitHub 问题帖描述了从大陆访问时同样的报错。来源：https://builder.aws.com/content/3IKafAdgh3M4UNo5CS2xXWGPuOz/i-tested-bedrock-from-hong-kong-across-4-regions-description ；https://github.com/anthropics/claude-code/issues/2656 （搜索摘要，个人经历，未核实）
- AWS 官方对"按账号所在地限制 Claude"的书面规则：**没查到**。
- 政策把"授权经销商"也放在同一份名单下，所以找经销商或中转服务不构成合规路径（后半句是我的推断）。

#### 1.3 OpenAI（搜索摘要）

- OpenAI 的 API 支持地区页不单列"不支持"的名单，不在名单上的就是不支持；页面提示在名单外访问或向名单外提供访问，账号可能被封或被暂停。来源：https://help.openai.com/en/articles/5347006-openai-api-supported-countries-and-territories （搜索摘要，没有打开原文）
- 2024 年《南华早报》报道，OpenAI 向"不支持的国家和地区"的开发者发了通知，其中包括中国大陆和香港，限制自 2024-07-09 起生效；Vercel 的更新日志写明 OpenAI 不支持它在香港的函数区域。来源：https://scmp.com/tech/policy/article/3267971/tech-war-openai-further-block-access-mainland-china-hong-kong-based-developers ；https://vercel.com/changelog/openai-will-not-support-the-hong-kong-region-hkg1-for-functions （2024 年，搜索摘要）
- Google Cloud 的条款对经 Google 使用的 OpenAI 模型也要求遵守 OpenAI 的支持地区政策。来源：https://cloud.google.com/terms/service-terms （原文）
- OpenAI 对"主体注册地"和"股权"有没有像 Anthropic 那样的明文规定：**没查到**。2025–2026 年香港的状态有没有变化：**没查到**（本次摘要里没有任何 2026 年的材料显示香港已在名单上）。
- 我的解读：OpenAI 对人在香港和大陆的终端用户同样不通，因为"向名单外提供访问"本身就在封号理由里。

#### 1.4 Google：两个产品要分开看

**Gemini API 和 Google AI Studio（ai.google.dev，面向开发者的那一套）**

- 官方的可用地区页写着：如果你不在这些国家或地区，可以试试 Gemini Enterprise Agent Platform 里的 Gemini API。来源：https://ai.google.dev/gemini-api/docs/available-regions （搜索摘要；这个域名打不开，香港是否在现行名单上没能亲眼确认）
- Google 开发者论坛上，版主回复过"AI Studio 在香港地区不可用"，并建议改用 Vertex AI 里的 Gemini API。来源：https://discuss.ai.google.dev/t/is-hong-kong-workspace-account-being-discriminated-for-using-ai/112867 （搜索摘要，日期不详）
- 一篇香港的第三方指南（搜索时显示约五天前发布）说，Gemini API 和 AI Studio 的名单上仍然没有香港，香港的开发者通过 Google Cloud 上的 Vertex AI 用 Gemini，面向消费者的 Gemini 应用现在已经在香港提供。来源：https://hongkongaipodcast.com/blog/gemini-hong-kong （单一来源，未核实）
- 论坛上有人问"部署在日本的 Gemini API 应用，能不能给人在香港的用户用"，唯一的回复是让他去看条款和地区说明，没有定论。来源：https://discuss.ai.google.dev/t/can-a-japan-hosted-gemini-api-application-be-used-by-users-physically-located-in-hong-kong/184016 （搜索摘要）

**Gemini Enterprise Agent Platform（Google Cloud 上的那一套，原名 Vertex AI）**

- 平台现在的官方名称是 Gemini Enterprise Agent Platform，价目页的标题是"Agent Platform Pricing"。来源：https://cloud.google.com/model-garden/pricing ；https://cloud.google.com/terms/service-terms （原文）。改名日期 2026-04-22 出自第三方页面。来源：https://hokai.io/hub/services/google-vertex-ai （未核实）
- 香港（asia-east2）在这个平台的区域列表里；除实时语音类以外的 Gemini 模型都可以走"global"位置。来源：https://docs.cloud.google.com/vertex-ai/docs/general/locations ；https://firebase.google.com/docs/ai-logic/locations?api=vertex （搜索摘要）
- 搜索摘要称 Google 2025-12-16 的更新说明把 asia-east2（香港）列在新增区域里，新增的是哪一项功能，摘要没有说明。来源：https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes （搜索摘要，未核实）
- asia-east2 这个区域里具体能跑哪些 Gemini 模型：**没查到**。这不影响使用，因为可以走 global 或新加坡、台湾等区域。
- 我通读了 Google Cloud《服务专用条款》的生成式 AI 部分，并在全文检索了 Hong Kong 和 China，都是 0 处命中；没有找到按客户注册地或终端用户所在地限制 Gemini 的条款。条款里唯一出现"禁止地区"的地方，是带 Google 地图数据的功能。来源：https://cloud.google.com/terms/service-terms （原文；"没有找到"只针对这一份条款，文档站的地区说明页没能打开）
- 同一份条款对生成式 AI 服务有几条和我们直接相关的限制。来源同上（原文）。
  - 年龄："Customer will not, and will not allow End Users to, use a Generative AI Service as part of a website, Customer Application, or other online service that is directed towards or is likely to be accessed by individuals under the age of 18."
  - 医疗：不得"for clinical purposes"，不得"as a substitute for professional medical advice"，也不得用于"overseen by or requires clearance or approval from any applicable regulatory authority"的方式；条款同时说明非临床研究、排期和其他行政性任务不受限。
  - 训练："Google will not use Customer Data to train or fine-tune any AI/ML models without Customer's prior permission or instruction."
  - 标为"Google Frontier Models"的模型，Google 会把提示词和生成结果保存最多 30 天，用自动化工具做安全审查，然后删除。哪些模型被标为 Frontier Models，条款里没有列，要在控制台或文档里看。
- 香港注册的主体用香港结算账号能不能开通 Gemini，Google 对人在香港和大陆的终端用户有没有另外的限制：**没查到明文**，两边都没有。

#### 1.5 Azure OpenAI（搜索摘要，材料停在 2024 年）

- 2024 年 6 月 OpenAI 收紧之后，微软香港表示："There has been no change to our Azure OpenAI service offerings in Hong Kong. We continue to provide access to eligible customers in Hong Kong through models deployed in regions outside Hong Kong." 来源：https://www.scmp.com/tech/big-tech/article/3268233/microsoft-maintains-ai-services-hong-kong-openai-curbs-api-access-china ；https://sg.finance.yahoo.com/news/microsoft-maintains-ai-services-hong-093000823.html （2024 年）
- 搜索摘要说"合资格客户"指企业客户。一家一两个人的香港公司算不算合资格：**没查到**。
- 2024 年 10 月《南华早报》有一篇标题为"微软关闭大陆个人通过 Azure 订阅访问 OpenAI"的报道，我只看到标题。来源：https://www.scmp.com/tech/big-tech/article/3283259/microsoft-closes-azure-subscription-individuals-access-openai-mainland-china （2024 年，未核实）
- 2025–2026 年微软对香港客户的安排有没有变、对人在香港和大陆的终端用户怎么规定：**没查到**。

#### 1.6 AWS Bedrock 上的非 Claude 模型

- AWS 对"按账号所在地开放哪些模型"的官方规则、Amazon Nova 等模型对香港账号是否开放、香港区域（ap-east-1）有没有 Bedrock：这一次搜索**都没查到**，返回的官方文档只有片段。

#### 1.7 其他在香港可用的模型

- Google Cloud 的合作伙伴模型价目页上，有一批以托管 API 形式提供的开放权重模型，包括 DeepSeek、Qwen、Kimi、GLM、MiniMax、gpt-oss 和 Meta 的 Muse 系列，价格见问题 2。来源：https://cloud.google.com/model-garden/partner-models/pricing （原文）
- 这些模型在条款里属于"Separate Offerings"，各自另有条款。来源：https://cloud.google.com/terms/service-terms （原文）。它们各自对香港主体和终端用户所在地有没有限制：**没查到**。它们支不支持图片输入，价目页上没有写，**没查到**。
- 阿里云百炼国际站有 qwen3-vl-flash，输入支持文本、图像和视频，另有带 -us 后缀的美国版本；国际站的计费文档里列了 deepseek-v4-flash 等模型，文档更新于 2026-07-15。来源：https://help.aliyun.com/en/model-studio/qwen3-vl-flash ；https://www.alibabacloud.com/help/en/model-studio/qwen3-vl-flash-us ；https://www.alibabacloud.com/help/zh/model-studio/model-training-and-deployment-billing （搜索摘要）
- 阿里云国际站和 DeepSeek 直连对香港主体的规定、qwen3-vl-flash 的国际站价格：**没查到**。
- 一个旁证：台湾的直接对手纖記 Slimly 把照片送 Google Gemini 分析（见 `06_compliance_regions.md` 第 124 行）。它用的是哪一套 Gemini 接口没查到。

#### 1.8 汇总

| 供应路径 | 香港注册的主体当客户 | 人在香港的终端用户 | 人在大陆的终端用户 | 证据强度 |
|---|---|---|---|---|
| Anthropic 直连 | 不支持 | 不支持 | 不支持 | 强（原文） |
| Bedrock、Google Cloud、Microsoft 上的 Claude | 不支持（同一份名单） | 不支持 | 不支持 | 强（原文），执行细节弱 |
| OpenAI 直连 | 不支持（名单外；注册地和股权的明文没查到） | 不支持 | 不支持 | 中（摘要加 2024 年报道） |
| Gemini API 和 AI Studio | 香港不在名单上 | 没有定论 | 没查到 | 弱 |
| Google Cloud 上的 Gemini | 没有找到限制，有可用的迹象 | 条款里没有找到限制 | 条款里没有找到限制 | 中，需书面确认 |
| Azure OpenAI | 2024 年称对香港合资格客户照常提供 | 没查到 | 没查到 | 弱（旧） |
| Bedrock 上的非 Claude 模型 | 没查到 | 没查到 | 没查到 | 无 |
| Google Cloud 上的开放权重模型 | 价目在列，地区规定没查到 | 没查到 | 没查到 | 弱 |
| 阿里云国际站、DeepSeek 直连 | 没查到 | 没查到 | 没查到 | 无 |

注意：表里"人在大陆的终端用户"一列只讲供应商条款。大陆法律对境外服务的要求是另一件事，见 `06_compliance_regions.md`。

---

### 问题 2：替代模型的单价，和 PRD 第 5.4 节的两档相比差多少

#### 2.1 先把 PRD 的两档还原成 token 用量

PRD 第 5.4 节的成本表注明"token 数是我假设的"，但没有写出假设。我反推了一组能同时对上两档数字的用量（推算）：

- 文字记录每次：输入 2,500 token（系统提示词、输出格式、用户当前药物和这句话），输出 500 token。
- 拍照记录每次：输入 2,500 token 加一张图，输出 600 token。Claude 的图片按每 28×28 像素一个 token 计，一张 1024×768 的图是 37 × 28 = 1,036 token。来源：https://platform.claude.com/docs/en/build-with-claude/vision （原文）
- 验算：Claude 官方价是 Opus 5.5 每百万 token 输入 4 美元、输出 20 美元，Haiku 5.5 输入 0.10 美元、输出 0.50 美元（提示词不超过 10 万 token 时）。来源：https://platform.claude.com/docs/en/about-claude/pricing （原文）。按上面的用量，Opus 5.5 文字每次 0.0200 美元、拍照每次 0.0261 美元，每月 60 次加 30 次是 1.98 美元；Haiku 5.5 文字每次 0.00050 美元、拍照每次 0.00065 美元，每月是 0.050 美元。PRD 写的是 Opus 档 1.1–2.1 美元（上限为缓存不命中）、Haiku 档约 0.05 美元，两档都对得上。

#### 2.2 官方价目（Google Cloud，原文，美元每百万 token，global 端点）

| 模型 | 输入 | 输出 | 备注 |
|---|---|---|---|
| Gemini 2.5 Flash Lite | 0.10 | 0.40 | 2.5 代，较旧 |
| Gemini 3.1 Flash-Lite | 0.25 | 1.50 | 非 global 端点 0.275 和 1.65 |
| Gemini 3.5 Flash-Lite | 0.30 | 2.50 | 非 global 端点 0.33 和 2.75 |
| Gemini 2.5 Flash | 0.30 | 2.50 | |
| Gemini 3.8 Flash | 0.75 | 3.75 | 优惠价到 2026-12-31；2027-01-01 起 1.50 和 7.50 |
| Gemini 4 Hydrogen | 1.50 | 7.50 | |
| Gemini 4 Neon | 3.00 | 15.00 | 缓存读取 0.15 |

来源：https://cloud.google.com/model-garden/pricing （原文，由 https://cloud.google.com/vertex-ai/generative-ai/pricing 跳转而来）。同一页写明：只对返回 200 的请求收费；Gemini 3 及以后的模型，非 global 端点比 global 贵 10%；输出价包含推理 token。

合作伙伴和开放权重模型（同为 Google Cloud 托管，原文）：DeepSeek-V4.1-Flash 输入 0.30、输出 1.20；Qwen3-Next-80B-Instruct 0.15 和 1.20；MiniMax-M2 0.30 和 1.20；Kimi-K2-Thinking 0.60 和 2.50；GLM-4.7 0.60 和 2.20；gpt-oss-120b 0.09 和 0.36；Meta Muse Ember 1.0 0.10 和 0.50。来源：https://cloud.google.com/model-garden/partner-models/pricing

OpenAI 的价目只有第三方转述，而且互相矛盾（未核实）：GPT-5 nano 输入 0.05、输出 0.40，GPT-5 mini 0.25 和 2.00，这两个模型据一条摘要将在 2026-12-11 停用；GPT-5.4 nano 0.20 和 1.25，GPT-5.4 mini 0.75 和 4.50；最新的小模型，一处写 0.10 和 0.50，另一处写 0.20 和 1.20，模型名也不一致。来源：该次搜索返回的 https://developers.openai.com/api/docs/pricing （官方页，没能打开）以及 https://benchlm.ai/openai/api-pricing 、https://morphllm.com/openai-api-pricing 、https://www.requesty.ai/blog/openai-api-pricing 等第三方页面。因为 OpenAI 本身对香港不通，这一组数只作参照。

Azure OpenAI、Amazon Nova、阿里云国际站 Qwen-VL 的官方价目：**没查到**。

#### 2.3 对比（推算）

算法：文字每次 =（2,500 × 输入价 + 500 × 输出价）÷ 1,000,000；拍照每次 =（（2,500 + 图片 token）× 输入价 + 600 × 输出价）÷ 1,000,000；每月 = 60 × 文字 + 30 × 拍照。Gemini 的图片按每张 1,120 token 算，这是价目页对 Gemini 3.1 Flash-Lite Image 等模型写明的每张输入图片的 token 数，我把它当作通用假设；普通文本模型默认每张多少 token，价目页没有写。

| 模型 | 文字每次 | 拍照每次 | 每月（60 加 30 次） | 相当于 Haiku 5.5 档 | 相当于 Opus 5.5 档 |
|---|---|---|---|---|---|
| Claude Opus 5.5（PRD 高档） | $0.0200 | $0.0261 | $1.98 | 40 倍 | 100% |
| Claude Haiku 5.5（PRD 低档） | $0.00050 | $0.00065 | $0.050 | 1 倍 | 2.5% |
| Gemini 2.5 Flash Lite | $0.00045 | $0.00060 | $0.045 | 0.9 倍 | 2.3% |
| Gemini 3.1 Flash-Lite | $0.00137 | $0.00180 | $0.137 | 2.8 倍 | 6.9% |
| Gemini 3.5 Flash-Lite | $0.00200 | $0.00259 | $0.198 | 4.0 倍 | 10% |
| Gemini 3.8 Flash（优惠价） | $0.00375 | $0.00496 | $0.374 | 7.5 倍 | 19% |
| Gemini 3.8 Flash（2027 年起） | $0.00750 | $0.00993 | $0.748 | 15 倍 | 38% |
| Gemini 4 Hydrogen | $0.00750 | $0.00993 | $0.748 | 15 倍 | 38% |
| Gemini 4 Neon | $0.0150 | $0.0199 | $1.50 | 30 倍 | 75% |

只做文字记录时（开放权重模型能不能看图没查到）：gpt-oss-120b 每次约 0.0004 美元，Qwen3-Next-80B 约 0.0010 美元，DeepSeek-V4.1-Flash 约 0.0014 美元，都在 Haiku 5.5 的 0.8–2.7 倍之间（推算，同一算法）。

一句话：便宜档的差距是每个活跃用户每月多 0–0.15 美元；贵的一档比 Opus 5.5 便宜 25%–62%。

#### 2.4 提问和周复盘

PRD 里这两条路线仍用 Opus 5.5，每月合计 0.3–0.6 美元。Gemini 4 Neon 的输入和输出价都是 Opus 5.5 的 75%，Gemini 4 Hydrogen 都是 37.5%，输入输出比例相同，所以可以直接按比例换算：换成 Neon 是每月 0.23–0.45 美元，换成 Hydrogen 是 0.11–0.23 美元（推算；前提是 token 用量相同）。

#### 2.5 对专题八毛利表的影响（推算）

算法沿用 `08_monetization.md` 第 5.3 节：综合毛利率 =（标价 − 手续费 − 付费用户自己的 AI − 分摊的免费用户 AI）÷ 标价；29.99 美元年票扣手续费后是 27.71 美元；免费用户的用量按付费用户记录量的一半、不带提问和周复盘。

| 组合 | 付费用户每月 | 免费用户每月 | 付费率 5% 时的毛利 | 付费率 10% 时的毛利 |
|---|---|---|---|---|
| PRD 原方案：记录 Haiku 5.5，其余 Opus 5.5 | $0.35–0.65 | $0.025 | 48%–60%（专题八原数 47%–59%） | 57%–69% |
| 记录 Gemini 2.5 Flash Lite，其余 Gemini 4 Neon | $0.27–0.50 | $0.023 | 55%–64% | 64%–73% |
| 记录 Gemini 3.1 Flash-Lite，其余 Gemini 4 Neon | $0.36–0.59 | $0.068 | 17%–26% | 44%–53% |
| 记录 Gemini 3.1 Flash-Lite，其余 Gemini 4 Hydrogen | $0.25–0.36 | $0.068 | 26%–30% | 53%–58% |
| 记录 Gemini 3.5 Flash-Lite，其余 Gemini 4 Neon | $0.42–0.65 | $0.099 | −9%–0% | 31%–40% |

读法：付费用户自己的成本几乎不动，变化全在免费用户身上。免费用户每月多 4 美分，在 5% 付费率下每个付费用户一年要多分摊约 10 美元。这张表继承了专题八自己指出的弱点："免费月活每月 30 次文字、15 次拍照"没有依据，多半偏高。

#### 2.6 这组数字的四个限制

- token 用量是我反推的，不是实测。不同厂家的分词器对中文的切法不同，图片的计法也不同，实际数字可能偏差三成上下（估计，没有数据）。
- Gemini 的输出价包含推理 token。如果某个模型默认的推理量比较大，输出会超过我假设的 500–600 token。
- Gemini 3.8 Flash 的优惠价 2026-12-31 到期，之后翻倍。Gemini 2.5 Flash Lite 是上上代模型，什么时候下线**没查到**。
- 价格只回答"多少钱"。哪个便宜档能认对牛肉面、能把"刚打了 7.5，右大腿"拆对，要用 PRD 第 3.2 节的评测集跑了才知道，本笔记没有任何准确率数据。

---

### 问题 3：把主体换到新加坡、台湾或美国继续用 Claude，对股东和实际控制人的要求

#### 3.1 三个地方都在名单上

Singapore、Taiwan、United States of America 都在现行名单里。来源：https://www.anthropic.com/supported-countries （原文）

#### 3.2 三项要同时满足

按 1.1 引的原文，新主体要同时做到下面三条，缺一条都算"不支持"（我的解读）：

1. 主体不在名单外"注册或设总部"。两个词是"或"的关系：在新加坡注册、实际从香港管理的公司，有可能被认定为总部在香港。政策没有定义"总部"。
2. 主体不被名单外的"个人或实体""直接或间接""多数持有或控制"。
3. 用的人不在名单外。这里的"人"包括主体的人员，也包括主体的用户；按《商业服务条款》A.1 条，产品的终端用户就是用户。

第 3 条意味着：即使第 1、2 条都过了，人在香港和大陆的终端用户仍然要被挡在 AI 功能之外。

#### 3.3 "多数持股"的门槛：三个版本怎么变的

政策页内嵌的版本记录显示有三个版本，生效日期是 2023-05-12、2025-09-04、2026-11-12。来源：https://www.anthropic.com/legal/supported-regions （原文，页面数据）

| 版本 | 关于股权的原文 | 性质 | 来源（原文） |
|---|---|---|---|
| 2023-05-12 | 只有一份名单，没有股权条款 | 不涉及股权 | https://www.anthropic.com/legal/archive/cd634bbe-a04b-4d6e-9c74-712f85080ad6 |
| 2025-09-04 | "Anthropic reserves the right to not provide its products or services to entities whose majority direct or indirect ownership is attributable to nations other than those listed" | 供应商"保留权利"拒绝 | https://www.anthropic.com/legal/archive/d392c743-1299-4406-982c-a8b9c727684f |
| 2026-11-12（现行） | "entities that are majority-owned or controlled, directly or indirectly, by persons or entities in unsupported regions" | 直接定义为"不支持" | https://www.anthropic.com/legal/supported-regions |

2025-09-04 的公告是唯一出现数字的地方："This includes entities that are more than 50% owned, directly or indirectly, by companies headquartered in unsupported regions"，并说明限制"regardless of where they operate"。公告里举的例子是通过在其他国家注册子公司来访问服务的公司。来源：https://www.anthropic.com/news/updating-restrictions-of-sales-to-unsupported-regions （原文）

对比之后，现行版比 2025 年版严在四处（我的解读）：

- 持有人从"公司"扩到"个人或实体"。自然人股东也算。
- 在"多数持有"之外加了"或控制"。持股不到一半但有控制权，也在范围内。
- 从"保留权利不提供"变成"属于不支持的使用"。
- "直接或间接"保留。中间隔几层控股公司或者找人代持，按字面都穿透。

#### 3.4 政策没有定义的三件事

- "个人在名单外地区"按什么算：实际居住地、国籍还是当时人在哪里，政策没有写。
- "控制"指什么：董事席位、表决权、协议安排还是唯一董事，政策没有写。
- 多个名单外股东的持股要不要合并计算，政策没有写；原文用的是复数"persons or entities"。

这三件事只能问供应商或律师。在有书面答复之前，不能假定"换个注册地就行"。

#### 3.5 要问创始人的一个问题

> 公司现在和计划中的全部直接、间接股东，以及能实际决定公司事务的人（董事任免、表决权、协议控制都算），各自常住在哪里、是哪里的居民、平时人在哪里办公；其中和香港、澳门、中国大陆或其他名单外地区有关的个人和机构，合计持股是否超过 50%，是否有控制权；另外，公司的日常管理和团队成员使用模型与开发工具时，人实际在哪里？

说明：政策没有定义"个人在名单外地区"的口径，所以常住地、居民身份和实际所在地三种都要答。问到团队成员，是因为同一份政策的适用范围写明包括 Claude Code 这类应用。这个问题的答案在公开资料里查不到，本笔记没有做任何猜测。

---

## 三、对"后来者策略"的含义

### 3.1 先做四件事，都排在其他专题的行动之前

1. **把模型调用改成可换供应商的接口。** `app/server/parse.ts` 现在写死了 `@anthropic-ai/sdk` 和 `claude-opus-5-5`。改成一层自己的接口，第一个实现接 Google Cloud 上的 Gemini。PRD 第 5.4 节的实现要点（结构化输出、拒答处理、缓存、服务端回退）都是按 Claude 的接口写的，要逐条重写。
2. **用香港主体开一个 Google Cloud 结算账号，花一天实测。** 测三件事：能不能开通 Gemini 模型；从部署服务器的区域能不能稳定调用；global 端点和新加坡或台湾区域端点各自的延迟。
3. **同时给 Google Cloud 的销售或支持发书面问题，拿到书面答复再公开上线。** 问三句：香港注册、香港结算地址的客户能不能在 Agent Platform 上使用 Gemini 模型；我们的应用能不能向人在香港的终端用户提供；能不能向人在中国大陆的终端用户提供。再加一句：一款不给剂量建议、带"不构成医疗建议"声明的用药记录工具，是否触碰条款里的医疗限制。
4. **用 PRD 第 3.2 节的评测集跑四档模型。** 记录路线跑 Gemini 2.5 Flash Lite、3.1 Flash-Lite、3.5 Flash-Lite 和 3.8 Flash；提问路线跑 Gemini 4 Hydrogen 和 Neon。原来"Opus 对 Haiku"的评测计划作废。这一步现在同时决定定价，见 3.3。

### 3.2 公司主体：不要为了继续用 Claude 而迁主体

- 迁主体解决不了人在香港和大陆的终端用户，解决不了团队成员人在哪里使用的问题，"多数持有或控制"能不能过还取决于 3.5 节那个问题的答案。三条里只要有一条过不了，迁了也白迁。
- 迁主体的代价是专题八的 Stripe 费率、收款方式和税都要重做。新加坡、美国主体的 Stripe 费率本轮**没查**。
- 建议的默认方案是：主体留在香港，供应商换成 Google Cloud 上的 Gemini。这样专题八里"香港主体收款"那张费率表不用动，只改 AI 成本那几行。
- 只有一种情况值得重新考虑迁主体：创始人对 3.5 节问题的回答显示三项都能满足，并且愿意对香港和大陆的访问关掉 AI 功能。即使如此，也建议先问供应商拿书面确认。

### 3.3 定价和毛利：把"评测是定价的开关"换成新的两个结果

专题八的结论是"Haiku 评测是定价的开关"。换供应商后，开关变成：

- **Gemini 2.5 Flash Lite 通过评测**：免费用户成本和原方案一样，专题八的定价阶梯（年票 29.99 美元）和毛利表可以原样保留。要补查这个模型的下线时间。
- **只有 Gemini 3.1 Flash-Lite 或更贵的档通过**：免费用户成本是原来的 2.7–4 倍。按专题八的假设，5% 付费率下 29.99 美元年票的毛利只剩 17%–26% 甚至为负。这时要在三件事里选：免费档的 AI 记录限到每天 1–3 次；年票底价提到 39.99 美元；或者接受前期低毛利，等实际用量数据出来再调。专题八原来为"评测不通过"准备的预案正好能用。
- 无论哪种结果，专题八"免费档的提问不走贵模型"的结论不变。

### 3.4 可服务地区：香港可以回到第一批，但要等书面确认

- 如果 Google 书面确认可以向人在香港的终端用户提供，"香港主体、香港用户、万能输入栏"这条线就重新成立，专题六的地区排序可以恢复，但要在排序前加一道"供应商条款"的关。
- 如果用 Claude 或 OpenAI，就要对香港和大陆的访问关掉 AI 功能。从 X 来的大陆用户本来就在翻墙，按网络地址识别不出来，而政策按的是"实际所在地"，这个缺口补不上。这是不选这两家的另一个理由。
- 大陆用户仍然是另一档。供应商条款之外还有大陆自己的法规，结论沿用 `06_compliance_regions.md`。

### 3.5 隐私政策和 AI 告知页要写的内容

- 供应商写 Google Cloud 的签约实体名（以结算账号上显示的为准，本轮没查），不再写 Anthropic。
- 处理地点：走 global 端点时，请求可能被路由到任何区域。如果落地页要承诺"数据不在中国大陆处理"或者指定地区，就选新加坡或台湾的区域端点，价格贵 10%，把问题 2 的数字乘以 1.1。
- "不用于训练"可以写，依据是条款里的训练限制原文。
- "服务器不保存照片"只能说我们自己的服务器。如果选用的模型被标为 Google Frontier Models，要如实写"模型供应商为安全审查保存最多 30 天"。上线前在控制台确认所选模型是否属于这一类。
- PRD 第 4.3 节已有"未满 18 岁不提供服务"和"不构成医疗建议"，和 Google 的年龄、医疗限制方向一致。要补一条：提问路线的系统提示词和页面文案里，不出现"替代医生""诊断"这类说法。

### 3.6 备选方案和启用条件

- **Azure OpenAI**：Google 书面答复为"不可以"或迟迟没有答复时启用。先确认香港的小公司算不算"合资格客户"，以及 2025–2026 年的安排有没有变。
- **Google Cloud 上的开放权重模型**（Qwen、DeepSeek、gpt-oss 等）：可以当文字记录的低价备份，数据仍然只到 Google。前提是先查清它们各自的条款和是否支持图片。
- **阿里云国际站的 Qwen-VL 或 DeepSeek 直连**：最后的备选。它对香港主体多半没有障碍（背景知识，未核实），但要考虑台湾和海外用户对数据去向的观感，这一点没有数据。

### 3.7 对"后来者"定位的一点含义

- 英文头部产品的 AI 功能如果建在 Claude 或 OpenAI 上，按这两家的条款同样不能合规地服务人在香港的用户。它们实际用哪家**没查到**，所以这只是一个待验证的假设：香港有可能是英文对手的 AI 功能够不着、而我们能合规服务的地方。
- 直接对手纖記 Slimly 已经在用 Gemini。换到 Gemini 之后，模型本身不构成差异点，差异还是要落在中文记录的准确率、药名和食物库、"不乱收费、不丢数据"这些地方。

### 3.8 要同步修改的文件

| 文件 | 要改的地方 |
|---|---|
| PRD 第 5.4 节 | 模型和 SDK 换掉；实现要点重写；成本表换成问题 2 的数字，并写明 token 假设 |
| PRD 第 8 节 | "记录如果能用 Haiku 5.5"一段改成新的评测开关 |
| PRD 第 4.2、9 节 | 供应商名字、处理地点、30 天保存；"模型供应商的地区条款"列为上线前必须核实的第一项 |
| `08_monetization.md` 第 5 节 | 毛利表按 2.5 节重算；手续费表在主体不变时不用动 |
| `06_compliance_regions.md` | 地区排序前加"供应商条款"这一关；香港的结论改成"等 Google 书面确认" |

---

## 四、没查到的

1. Google 是否书面允许香港注册、香港结算地址的客户在 Agent Platform 上使用 Gemini，以及是否允许向人在香港和大陆的终端用户提供。本轮只做到"条款里没有找到限制"，文档站的地区说明页打不开。
2. Gemini API（ai.google.dev）现行可用地区名单的原文，以及它对终端用户所在地的规定。
3. OpenAI 现行名单的原文、它对主体注册地和股权有没有明文规定、2025–2026 年香港有没有变化；OpenAI 官方价目。
4. Azure OpenAI 在 2025–2026 年对香港客户的安排、"合资格客户"的门槛、对终端用户所在地的规定、官方价目。
5. AWS 对"按账号所在地开放模型"的官方规则；Amazon Nova 等非 Claude 模型对香港账号是否开放；Bedrock 的官方价目。
6. 阿里云国际站 Qwen-VL、DeepSeek 直连的价格和对香港主体的规定；Google Cloud 上的开放权重模型是否支持图片、各自的地区条款。
7. Anthropic 对"个人在名单外地区""控制""总部"的定义，多个股东是否合并计算，实际怎么核查，有没有豁免流程。政策页和商业条款里都没有写。
8. 股东、实际控制人和团队成员实际在哪里。按要求没有查，列成了 3.5 节的问题。
9. 各档 Gemini 模型做中文饮食和用药记录的准确率。本轮没有任何数据，要靠 PRD 第 3.2 节的评测。
10. Gemini 2.5 Flash Lite 的下线日期；普通 Gemini 文本模型默认每张图片计多少 token；哪些模型属于 Google Frontier Models。
11. 新加坡、台湾、美国主体的 Stripe 费率和设立成本。本轮没有分配搜索。
12. Shotsy、MeAgain 等英文对手用的是哪一家模型。
