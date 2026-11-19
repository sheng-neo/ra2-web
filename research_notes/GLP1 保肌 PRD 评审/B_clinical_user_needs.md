# B. 临床假设核查与用户需求 — GLP-1 保肌与周期管理 PRD v1.0

- 核查日期：2026-11-19
- 范围：PRD 中的临床/科学假设（瘦体重流失、蛋白质、药代动力学、药物版图、停药与留存、安全红线、用户画像与痛点）
- 方法说明：本环境无法直接抓取 pubmed.ncbi.nlm.nih.gov、www.obesity.org、www.accessdata.fda.gov（DNS 被网络策略拦截），因此**绝大多数数字来自 WebSearch 摘要（snippet）**，未逐字核对原文。凡标注 **(unverified)** 的为单一来源、弱来源，或是我凭已有知识写入但本次未检索核实的内容。凡标注 **(own calc)** 的是我根据检索到的数字自行推算的结果。
- 共使用约 45 次检索。

---

## 0. 一页结论（给 PM 的 TL;DR）

| # | PRD 假设 | 结论 | 最需要改的点 |
|---|---|---|---|
| 1a | "临床未干预基线：瘦体重占减重 25–40%" | **数字大致对，措辞错** | 这是 GLP-1 **试验组**（且同时接受了生活方式指导）的比例，并非"未干预"；替尔泊肽约 25%，司美格鲁肽约 35–40%；单纯节食减重的比例也差不多 |
| 1b | 目标"瘦体重流失占比 ≤15%" | **没有证据支持，且用消费级设备测不出来** | 目前最好的生活方式 RCT（T-REx，有人监督的抗阻训练）只让瘦体重流失减少了约 25%（相对值），折算下来约 19%。建议改为"脂肪:瘦体重 ≥3:1"作为方向性参考，并把过程指标和力量指标设为主 KPI |
| 1c | 趋势页"瘦体重保留率（对比临床未干预均值 65%）" | **指标定义错误** | 65% 实际是"减掉的重量里脂肪占的比例"，不是"保留率"。真正的瘦体重保留率在试验中约为 89–90% |
| 2 | 蛋白质 1.2–1.6 g/kg（默认 1.4），"按目标体重或当前瘦体重" | **区间合理，计算基准有错** | 按瘦体重 × 1.4 会让目标偏低约 30–40%；应改用调整体重或参考体重，并设每日下限 ≥60 g、每餐 25–30 g；CKD 用户要设闸门；纤维和便秘缺失 |
| 3a | 半衰期：司美格鲁肽 168 h、替尔泊肽 120 h | **成立** | — |
| 3b | 纯指数衰减（无吸收相）模型 + "峰值期 D1–D3" | **自相矛盾，需要改** | 该公式的峰值落在注射那一刻（t=0），与 Tmax 1–3 天不符；应加入一级吸收相（Bateman 函数） |
| 3c | 食欲抑制/副作用集中在 D1–D3 | **没有可靠证据** | 胃肠道副作用主要集中在**加量期**，而不是周内某几天；稳态下周内浓度波动较小。分期应由用户自己的症状记录来个性化 |
| 4 | 只支持每周注射的司美格鲁肽/替尔泊肽，剂量单位为 mg | **不足以覆盖 2026 年的市场** | 已有每日口服的 Wegovy 片和 Foundayo（orforglipron）、Wegovy HD 7.2 mg、Zepbound 西林瓶和 KwikPen、通用名利拉鲁肽（每日注射）、复方药/"微剂量"（按 units/mL 计量），以及中国市场的玛仕度肽和司美格鲁肽仿制药 |
| 5 | 年订阅留存 ≥65% | **高风险** | 无糖尿病用户 1 年内的停药率约 50–65%；需要设计"停药后维持模式"和"暂停"功能 |
| 6 | 安全红线（PRD 仅有免责声明 + "严禁红色警告"） | **缺失** | 必须加入红旗症状分诊，并允许安全提示覆盖"无红色警告"的设计规则。NAION 已于 2026-11-09 成为全类别警告 |
| 7 | 目标用户"35–55 岁高收入职场人士" | **偏窄** | 实际用户以女性和 40–64 岁人群为主，对价格敏感；Medicare Bridge（2026-07 起）带来了大量 65 岁以上用户 |

---

## Q1. GLP-1 用药期间的瘦体重流失：比例、目标是否合理、干预证据与测量精度

### 证据

**关键试验中的 DXA 子研究**
- **STEP 1（司美格鲁肽 2.4 mg，68 周）DXA 子研究**：n=140（司美格鲁肽 95，安慰剂 45），基线体重 98.4 kg，76% 为女性。体重变化 −15.0% vs −3.6%。ClinicalTrials.gov 报告司美格鲁肽组瘦体重 −5.8 ± 4.6 kg（n=83），安慰剂组 −1.8 kg。另一份报告称总瘦体重较基线下降 9.7%，但瘦体重占体重的比例反而上升了 3.0 个百分点。
  - 来源：https://clinicaltrials.gov/study/NCT03548935 ；https://www.endocrine.org/news-and-advocacy/news-room/featured-science-from-endo-2021/semaglutide-reduces-excess-body-fat-in-people-with-obesity ；https://www.patientcareonline.com/view/semaglutide-2-4-mg-reduces-visceral-adiposity-improves-lean-body-mass-to-fat-mass-ratio
  - **(own calc)**：5.8 kg ÷（98.4 kg × 15%≈14.8 kg）≈ **39%**，即常说的"约 40% 是瘦体重"。
- **SURMOUNT-1（替尔泊肽，72 周）DXA 子研究**（Look et al., *Diabetes Obes Metab*, doi 10.1111/dom.16275）：n=160。体重 −21.3%，脂肪 −33.9%，瘦体重 −10.9%；安慰剂组分别为 −5.3%、−8.2%、−2.6%。替尔泊肽组和安慰剂组都是**约 75% 脂肪 / 25% 瘦体重**，在不同年龄亚组（<50、50–64、≥65）中基本一致。
  - 来源：https://www.citedrive.com/en/discovery/body-composition-changes-during-weight-reduction-with-tirzepatide-in-the-scpsurmountscp1-study-of-adults-with-obesity-or-overweight/ ；https://mdedge.com/content/tirzepatide-lowers-weight-across-all-groups-obesity

**2024–2026 汇总分析**
- **Karakasis 等，*Metabolism* 2025 网络 meta 分析**：纳入 22 个 RCT，2,258 人。瘦体重约占总减重的 **25%**；替尔泊肽 15 mg 和司美格鲁肽 2.4 mg 减重、减脂最多，但在保留瘦体重方面排名靠后。来源：https://pubmed.ncbi.nlm.nih.gov/39719170/
- ***Diabetes Obes Metab* 2026 meta 分析**：瘦体重占减重的比例为司美格鲁肽 **35.2%**（95% CI 31.5–38.9）、替尔泊肽 **25.4%**（22.8–28.0）、利拉鲁肽 26.8%。作者认为这一比例**与生活方式干预大致相当**。来源：https://pubmed.ncbi.nlm.nih.gov/41877354/ ；https://www.epocrates.com/online/article/acp-2026-incretin-based-weight-loss-often-cuts-into-lean-mass
- ***Annals of Internal Medicine* 2026-04 系统综述**：肠促胰素类药物组中，"肌肉相关"成分的中位占比为 34.9%；约一半的生活方式或安慰剂对照组也超过了肌肉流失基准。来源：https://www.healio.com/news/primary-care/20260417/obesity-drugs-tied-to-more-muscle-loss-vs-other-weight-loss-interventions
- **2025 年 9 个 RCT 的汇总**：30.8%。来源：https://www.healio.com/news/endocrinology/20250313/about-31-of-weight-lost-by-adults-during-glp1-therapy-comes-from-lean-mass
- **EASO/EFAD/ECPO 共识（*Lancet Diabetes Endocrinol*，2026-07-08，Dobbie et al.）**：现有试验中 24–30% 的减重是去脂体重；可以考虑以"脂肪:瘦体重 ≥3:1"作为参考，但直接证据有限；抗阻训练加充足蛋白质可能有帮助。来源：https://www.efad.org/easo-efad-ecpo-consensus-statement-on-incretin-based-therapies-in-obesity-care/ ；https://www.news-medical.net/news/20260708/New-consensus-outlines-best-practices-for-obesity-medications.aspx

**"瘦体重"不等于"肌肉"**
- DXA 测的瘦组织包含水分、器官和结缔组织；文献中"去脂体重"和"瘦体重"等术语常被混用。BIA 则依赖"去脂体重含水 73%"这一假设。来源：https://pmc.ncbi.nlm.nih.gov/articles/PMC11450469/
- 有 2026 年报道称 GLP-1 主要减的是脂肪、对肌肉的保留较好（MRI/质量层面），但细节未核实 **(unverified)**：https://www.news-medical.net/news/20260513/GLP-1-obesity-drugs-mainly-reduce-fat-while-preserving-muscle-mass.aspx

**抗阻训练 / 蛋白质能否减少瘦体重流失（RCT）**
- **T-REx（*Nature Medicine*，2026-11-09）**：120 名 50–70 岁社区成人（男性及绝经后女性），40 周，全部使用替尔泊肽，随机分为每周 3 次有监督的抗阻训练组和常规活动组；两组都获得一般性的蛋白质和纤维建议。
  - 瘦软组织：训练组 −3.57 kg，未训练组 −4.67 kg，差值 1.09 kg（0.43–1.75），即**少流失约 25%**。
  - 四肢瘦组织：−2.9 kg vs −3.6 kg。
  - 力量：训练组 +10%，未训练组 −10%；高位下拉相差 12.97 kg。
  - 减重幅度不受影响，心代谢指标没有额外获益。
  - 训练在专用健身房、由认证运动生理师指导完成，日常环境能否复制尚待验证。
  - 来源：https://www.uwa.edu.au/news/article/2026/november/resistance-training-key-to-maintaining-muscle-function-during-glp1-weight-loss ；https://www.epocrates.com/online/article/weight-training-cut-lean-mass-loss-on-tirzepatide-by-almost-a-quarter ；https://www.news-medical.net/news/20261112/Muscle-benefits-of-lifting-weights-while-taking-tirzepatide.aspx
- **BELIEVE（bimagrumab + 司美格鲁肽，II 期，*Nature Medicine* 2026）**：第 72 周，司美格鲁肽单药瘦体重约 −7.4%，联合用药约 −2.9%；体重 −22.1% vs −15.7%。这是**药物**层面的保肌，不是生活方式干预。来源：https://pmc.ncbi.nlm.nih.gov/articles/13004672/ ；https://www.pharmacytimes.com/view/bimagrumab-semaglutide-combination-achieves-significant-weight-loss-while-preserving-muscle-mass
- **尚无结果的进行中试验**：LEAN-PREP（NCT06885736，抗阻训练和/或蛋白质，司美格鲁肽/替尔泊肽）https://clinicaltrials.gov/study/NCT06885736 ；HUSTLE（NCT07700030，蛋白质约 2.5 g/kg 去脂体重 ± 抗阻训练）https://clinicaltrials.gov/study/NCT07700030 ；另有 NCT07457437、NCT07777575。
- 本次检索**没有找到**任何证明"单纯补充蛋白质"能在 GLP-1 用户中保留瘦体重的已发表 RCT。AACE 的材料也指出，仅靠蛋白质可能无法充分保留骨骼肌。来源：https://pro.aace.com/nutritional-considerations-for-patients-on-obesity-medications

**消费级 BIA 体脂秤的精度**
- *JMIR mHealth* 2021：3 款智能秤与 DXA 对比，所有秤都低估体脂，脂肪量的中位绝对误差分别约 −2.2、−4.4、−3.7 kg。来源：https://mhealth.jmir.org/2021/4/e22487
- 多频 BIA 只有在进食、水合、运动和测量时间都严格控制时才"中等准确"；基于 BIA 的水合推算值会超出生理范围。来源：https://pmc.ncbi.nlm.nih.gov/articles/PMC11450469/ （以及同一次检索中的 Frontiers 文章 https://www.frontiersin.org/journals/endocrinology/articles/10.3389/fendo.2024.1386542/pdf）
- 本次**没有找到**消费级秤在 GLP-1 减重过程中"个体内变化值"与 DXA 一致性的验证研究。厂商自报的相关系数（例如 Withings 称瘦体重 r=0.98）不是独立验证。来源：https://support.withings.com/hc/article_attachments/43329491947409
- **(own calc)** 信号与噪声对比：减重 12 kg 时，瘦体重占比 25% 意味着流失 3.0 kg，15% 意味着 1.8 kg，两者只差 **1.2 kg**，小于消费级秤在横断面上 2–4 kg 的误差。GLP-1 用户常因呕吐、腹泻或饮水不足出现脱水，会进一步干扰 BIA 结果。

### 对 PRD 假设的判断
- "临床未干预基线 25–40%"：**需要改**。数值区间与证据相符（替尔泊肽约 25%，司美格鲁肽约 35–40%），但这些是**用药组**数据，而且 STEP 1 和 SURMOUNT-1 的受试者都同时接受了生活方式指导，所以不能叫"未干预"。另外，单纯生活方式减重的瘦体重比例与此相近（DOM 2026）。
- "≤15%"：**需要改**。目前没有任何生活方式 RCT 达到这个水平。**(own calc)** 以替尔泊肽约 25% 为基数，T-REx 的相对降幅约 23–25%，结果约为 19%。只有加用 bimagrumab 这类药物才接近 15%。而且这个目标用消费级 BIA 无法可靠测量。
- 趋势页"瘦体重保留率（对比临床未干预均值 65%）"：**需要改**。65% 是"减掉的重量里脂肪的占比"，不是保留率。真正的瘦体重保留率在 STEP 1 / SURMOUNT-1 中约为 90.3% / 89.1%（即 −9.7% / −10.9%）。
- PRD 把"瘦体重（肌肉）"和"骨骼肌"混为一谈：**缺失定义**。另外，HealthKit 只有 Lean Body Mass 类型，没有骨骼肌量类型（凭知识，**(unverified)**），各品牌秤的"骨骼肌"是私有算法，通常不会写入 Apple Health。

### 建议的 PRD 修改
1. **核心量化目标 1** 改为：
   - "瘦体重占减重比例 ≤25%（脂肪:瘦体重 ≥3:1，参考 EASO 2026 共识）"，并且**只在有 DXA 数据时作为结局指标展示**（支持上传或录入基线和 3–6 个月的 DXA 结果）。
   - 产品层面的主 KPI 换成**过程指标和功能指标**：每周抗阻训练 ≥2–3 次的达成率、蛋白质达标天数，以及力量进展（例如俯卧撑或深蹲次数、30 秒坐站测试、握力，或训练重量渐进）。T-REx 显示力量差异（±10%）比瘦体重差异更大，也更容易被用户感知。
2. **BIA 数据的展示规则**：
   - 引导用户按标准流程测量：晨起、空腹、排尿后、同一台秤、每周同一时间。
   - 用 4 周滑动均值加不确定带显示趋势。
   - 体重下降不足 5% 或时间不足 4 周时，不计算瘦体重占比。
   - 当天记录了呕吐、腹泻或饮水不足时，标注该次读数"可能受水分影响"。
   - 字段统一叫"瘦体重（估算）"，不叫"骨骼肌"。
3. **删除"临床未干预均值 65%"**，改为"参考区间：GLP-1 试验中瘦体重约占减重的 25–40%（随药物和测量方法而异）"。
4. **营销和文案措辞**：只能说"有研究显示抗阻训练可减少约 1/4 的瘦体重流失"，不能说"保肌"或"防止肌肉流失"。

---

## Q2. 蛋白质、补水、纤维指南

### 证据

**指南与专家意见**
- **ACLM/ASN/OMA/TOS 联合建议**（2025-05-30，同时发表于 AJCN、*Obesity*、*Obesity Pillars*、AJLM）：八项优先事项中包括"充足蛋白质 + 力量训练以保留瘦体重"、预防微量营养素缺乏，以及管理胃肠道副作用。**原文中的 g/kg 数值本次未能抓取 (unverified)**。来源：https://pubmed.ncbi.nlm.nih.gov/40450457/ ；https://www.eurekalert.org/news-releases/1085638 ；https://www.acc.org/latest-in-cardiology/journal-scans/2025/05/30/16/10/nutritional-and-lifestyle-strategies-support-glp-1-obesity-treatment
- **Almandoz 等，*Obesity* 2024（TOS/OMA 等专家的营养建议）**：蛋白质 **>60–75 g/天**，**0.8–1.5 g/kg/天**，个体化情况下可考虑 >1.5 g/kg。来源：https://www.obesity.org/experts-develop-nutritional-recommendations-for-patients-treated-with-anti-obesity-medications/ ；https://pubmed.ncbi.nlm.nih.gov/38853526/
- **AACE 2025 资料**：**1.2–1.5 g/kg/天**；纤维逐步增加以减轻胃肠道副作用；全程保持充足饮水；仅靠蛋白质可能不足以保留肌肉。来源：https://pro.aace.com/nutritional-considerations-for-patients-on-obesity-medications
- **其他来源**：
  - >1.2 g/kg/天，并均匀分配到各餐：https://pmc.ncbi.nlm.nih.gov/articles/PMC12661421/
  - 借鉴减重手术的 80–120 g/天（作者承认缺乏前瞻性证据）：https://discovery.ucl.ac.uk/10217329/1/s41366-025-01952-w.pdf
  - 每餐 20–40 g、至少三餐：https://www.todaysdietitian.com/need-to-know-nutritional-considerations-for-glp-1s/
  - WeightWatchers：≥1 g/kg **当前**体重，并随体重下降重新计算：https://www.weightwatchers.com/us/blog/protect-muscle-on-glp-1
- **按什么体重计算**：有摘要提到"活跃减重期 1.0–1.5 g/kg **调整体重**，且 ≥60 g/天"，但无法确认出自哪份文件 **(unverified)**。来源：https://www.epocrates.com/online/article/when-weight-loss-drugs-work-dont-let-nutrition-and-muscle-fall-behind 。研究中以去脂体重为基准时，目标通常更高，例如 HUSTLE 用约 2.5 g/kg 去脂体重。来源：https://clinicaltrials.gov/study/NCT07700030
- **EASO/EFAD/ECPO 2026**：强调充足的蛋白质和维生素/矿物质，监测营养充足度、肌肉功能和营养不良迹象；通过缓慢加量减少胃肠道副作用。来源：https://www.efad.org/easo-efad-ecpo-consensus-statement-on-incretin-based-therapies-in-obesity-care/

**真实世界摄入量（为什么"蛋白质达标率 ≥75%"很难做到）**
- *JISSN* 2025，n=60 名 GLP-1 用户：平均 1,763 kcal/天，蛋白质占 17.5%；只有 **43%** 达到 ≥1.2 g/kg，10% 达到 ≥1.6 g/kg。来源：https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12419545/
- *Frontiers in Nutrition* 2025：按 g/kg 计蛋白质明显不足；**纤维仅 14.5 g/天**，钙、铁、镁、钾也偏低（GNC 相关作者）。来源：https://www.frontiersin.org/journals/nutrition/articles/10.3389/fnut.2025.1566498/pdf
- 意大利 App 真实世界研究（2026）：用户约 1,102 kcal/天，蛋白质 **0.6 g/kg**，88% 低于 0.9 g/kg，且更常跳餐。来源：https://www.news-medical.net/news/20260409/Study-finds-nutritional-risks-in-users-of-GLP-1-drugs.aspx

**注意事项与禁忌**
- **CKD**：KDIGO 2024 建议未透析的 CKD G3–G5 患者蛋白质约 0.8 g/kg/天，进展风险人群避免 >1.3 g/kg/天（凭知识写入，本次未检索，**(unverified)**）。https://kdigo.org/guidelines/ckd-evaluation-and-management/
- **补水 / AKI**：Wegovy 和 Zepbound 说明书都有"急性肾损伤（呕吐、腹泻或脱水导致容量不足）"警告（凭说明书知识；说明书地址 https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/215256s030lbl.pdf 、https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/217806s042lbl.pdf ，本次无法抓取原文）。
- **便秘**：在 Reddit 自报中占 15.3%（见 Q7）；STEP 试验中常见胃肠道副作用包括便秘（见 Q3）。

### 对 PRD 假设的判断
- 1.2–1.6 g/kg、默认 1.4：**区间成立**，处于专家意见的中上段。
- "按目标体重**或当前瘦体重**"计算：**需要改**。所有指南的 g/kg 都是以体重（实际、调整或参考体重）为基准。用瘦体重 × 1.4 会显著低估：例如瘦体重 55 kg × 1.4 = 77 g，而调整体重 80 kg × 1.4 = 112 g。
- 核心目标写"≥1.2 g/kg 体重"，公式写"1.4 × 目标体重或瘦体重"：**前后不一致**。
- **缺失**的内容：每日绝对下限（≥60 g）、每餐分配、上限、CKD 或肾功能闸门、老年人设置、纤维目标、便秘跟踪、乳糖不耐或素食替代（PRD 的一键补录默认是乳清蛋白），以及个体化的饮水目标（目前硬编码为 2,500 ml）。
- "蛋白质达标率 ≥75%"：作为产品目标可以保留，但现实基线很低（约 43% 的人能达到 1.2 g/kg），建议分阶段设定。

### 建议的 PRD 修改
1. **公式**：
   - 参考体重 = BMI ≥30 时用调整体重（IBW + 0.4 ×（实际体重 − IBW）），否则用实际体重；如果医生设定了目标体重，可改用目标体重。
   - 每日目标 = 1.2–1.5 g/kg × 参考体重，**下限 60 g，上限约 2.0 g/kg 参考体重**（约 160 g，具体上限需营养师确认）。
   - 每 4 周或体重变化 ≥5% 时重新计算。
2. **每餐分配**：目标是每餐 25–30 g（20–40 g），分 3–4 次进食。20:00 的推送应改为"距离上一餐 ≥3 小时且缺口 ≥25 g"时才触发，避免睡前大量进食加重反流。
3. **安全闸门**（Onboarding 增加 1 题）："是否有肾病、肝病，或医生要求限制蛋白质？"选"是"时关闭自动目标，显示"请与医生确认蛋白质目标"，默认 0.8 g/kg。
4. **纤维和排便**：增加纤维目标（逐步增加到约 25 g/天）和"排便"快捷记录。连续 ≥3 天未排便时给出饮水、纤维、活动建议；伴有腹痛或呕吐时进入红旗分诊（见 Q6）。
5. **补水**：用个体化目标（体重 × 系数，**(unverified)**，需临床确认）替代固定的 2,500 ml。当天记录了呕吐或腹泻时，自动提高饮水目标并提示补充电解质。
6. **一键补录选项**：提供乳清、植物蛋白、希腊酸奶等，并支持乳糖不耐或素食设置。

---

## Q3. 药代动力学模型与"峰值期 D1–D3"假设

### 证据

**说明书与药代参数**
- **司美格鲁肽（皮下注射）**：半衰期约 1 周；说明书称注射后 1–3 天达峰，4–5 周达稳态（该数值来自已有知识，本次检索未能显示说明书 12.3 节原文，**(unverified)**）。说明书地址：https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/215256s030lbl.pdf 。说明书还要求"计划怀孕前至少停药 2 个月"（因半衰期长）。
- **司美格鲁肽群体药代模型**：二室模型，含**一级吸收**和一级消除（9 项研究，353 名受试者）。来源：https://link.springer.com/article/10.1007/s13300-019-0581-y 、https://pmc.ncbi.nlm.nih.gov/articles/PMC6437231
- **司美格鲁肽稳态数据**（中国人群研究）：1.0 mg 时 AUC 7,961 nmol·h/L、Cmax 55.9 nmol/L；0.5 mg 时 AUC 4,000、Cmax 28.8，同一次检索结果，来源：https://link.springer.com/article/10.1007/s13300-018-0458-5
  - **(own calc)**：平均浓度 Cavg = AUC/168 h ≈ 47.4 nmol/L，Cmax/Cavg ≈ **1.18**（0.5 mg 时约 1.21），说明**稳态下周内波动较小**。
- **替尔泊肽**：半衰期约 5 天；Tmax 8–72 小时；生物利用度约 80%；二室模型，含一级吸收。来源：https://pmc.ncbi.nlm.nih.gov/articles/PMC10962491/ ；https://assets.publishing.service.gov.uk/media/669fc161fc8e12ac3edb02cf/FOI_24_252__Module_2.7.2_Summary-clin-pharm_Mounjaro_KwikPen_-_PLGB_148950340-0345.pdf

**(own calc) 模型对比**：采用一室模型，每周给药 30 次后取稳态，归一化到稳态峰值。临时脚本位于 /tmp/claude-0/-home-user-ra2-web/3f1a2b7e-6f1d-50b3-aa00-5d99c89afea3/scratchpad/pk.py，可能被清理；结果已全部写在下表中。

| 场景 | 峰值出现时间（注射后） | 稳态峰/谷比 | Cmax/Cavg | 第 5 天浓度（% 峰值） |
|---|---|---|---|---|
| 司美格鲁肽，PRD 纯指数模型 | **0 h** | 1.99 | 1.38 | 61% |
| 司美格鲁肽，含吸收相（Tmax 48 h） | 36 h | 1.61 | **1.20**（与实测的 1.18 吻合） | 76% |
| 替尔泊肽，PRD 纯指数模型 | **0 h** | 2.62 | 1.56 | 50% |
| 替尔泊肽，含吸收相（Tmax 24 h） | 20 h | 2.25 | 1.39 | 59% |

- 加量的影响远大于周内波动：司美格鲁肽按 0.25→0.5→1.0→1.7→2.4 mg、每 4 周加一次量时，每次加量后的周峰值大致翻倍（模拟中依次为稳态峰值的约 10%→20%→40%→69%→100%），**加量周的暴露变化远大于一周内的起伏**。

**副作用和食欲在时间上的分布**
- STEP 1–3 汇总分析：胃肠道不良事件 82.8% vs 63.2%（安慰剂）；98.1% 为轻到中度；呈一过性；**最常发生在加量期间或加量后不久**；4.3% 因胃肠道事件停药。STEP 4 中恶心 43.9% vs 16.1%。来源：https://pmc.ncbi.nlm.nih.gov/articles/PMC9293236 ；https://figshare.com/articles/journal_contribution/Gastrointestinal_tolerability_of_once-weekly_semaglutide_2_4_mg_in_adults_with_overweight_or_obesity_and_the_relationship_between_gastrointestinal_adverse_events_and_weight_loss_/16999075
- 替尔泊肽 SURPASS-2：恶心在早期相似，随后在 40 周内逐渐下降。来源：https://medical.lilly.com/us/products/answers/what-is-the-incidence-of-nausea-in-adults-with-type-2-diabetes-taking-mounjaro-tirzepatide-165643
- **周内（D1–D3）聚集**：本次**没有找到**同行评审的逐日症状日记研究。网上"第 3–5 天恶心最重"等说法来自复方药商家的页面，引用无法核实。"周末药效减弱、食欲回升"在用户和诊所博客中常见，但也没有研究证据 **(unverified)**。来源：https://formblends.com/articles/glp1-hub/how-does-semaglutide-make-you-feel-timeline-side-effects （弱来源）；https://www.weightlossrankings.org/research/glp1-dose-wearing-off-mid-week-evidence （弱来源）；https://health.clevelandclinic.org/how-long-does-it-take-for-glp-1s-to-suppress-appetite
- Reddit 大样本分析不含剂量和时间信息，无法支持周内分期（见 Q7）。

### 对 PRD 假设的判断
- 半衰期 168 h 和 120 h：**成立**。
- `C(t)=Σ Di·(1/2)^((t−ti)/t½)`：**需要改**。没有吸收相，所以峰值落在注射那一刻，与 PRD 自己定义的"峰值期 [12 h, 72 h]"相矛盾；还会高估周内波动（司美格鲁肽稳态峰谷比约 2.0，而实测接近 1.2–1.6）。
- 用剂量"mg"直接加和得到的"78% 当前预估体内浓度"：**需要改**。"百分比"没有定义基准；司美格鲁肽和替尔泊肽的 mg 不可比；不同剂量阶梯之间也不应该直接比较百分比。
- "峰值期 = 食欲强抑制、恶心、体能低谷；衰减期 = 适合常规训练"：**缺乏证据**。胃肠道副作用的主要驱动因素是**加量**，而不是周内的哪一天；稳态下周内浓度变化较小。把训练强度绑定到"药代阶段"没有证据支持（T-REx 是固定每周 3 次训练）。
- 冷启动只问"最近一次注射"：**缺失**。至少需要知道在当前剂量上用了几周，才能估计是否已达稳态。

### 建议的 PRD 修改
1. **PK 引擎改为一级吸收模型（Bateman 函数）**：`C(t)=Σ Di·ka/(ka−ke)·(e^(−ke·Δt) − e^(−ka·Δt))`。
   - 司美格鲁肽：ke=ln2/168 h，ka 按 Tmax 约 24–72 h 取值（默认约 48 h）。
   - 替尔泊肽：ke=ln2/120 h，ka 按 Tmax 约 24 h 取值。
   - 仍然只用于**相对**展示。
2. **展示方式**：把"体内浓度 78%"改为"相对药物暴露指数（以你当前剂量的稳态峰值为 100）"，并显示"加量后第 X 周（尚未稳态）"。删除"食欲强抑制/低体能"这类由浓度推断出的状态标签。
3. **周期分期改为个性化**：
   - 前 3–4 个周期只记录，不下结论。
   - 根据用户自己的恶心、食欲、疲劳打分，拟合出"个人高症状日"，再用于训练降档和蛋白质策略。
   - 默认提示语改为"很多人在注射后 1–3 天症状较明显"，并标注"个体差异大"。
4. **新增最高优先级状态"加量周（Escalation week）"**：每次加量后的前 1–2 周默认降低训练强度，加强少量多餐和补水提示。
5. **训练调档以症状为主、阶段为辅**：矩阵第一列改为"症状评分 + 睡眠/HRV"，"药代阶段"只作参考。保证每周至少 2–3 次抗阻训练机会（降档而不是取消）。
6. **漏针和换日逻辑**（凭说明书知识，**(unverified)**，需按最新说明书核对）：
   - Wegovy：漏针时若距下次注射 >48 h 则尽快补打，否则跳过；连续漏打多次时需要重新评估是否从低剂量重新加量。
   - Zepbound：漏针 4 天（96 h）内可补打；更换注射日时两次注射需间隔 ≥72 h。
   - App 只提示"请参照说明书或咨询医生"，并在曲线上如实反映。
7. **注射部位**：说明书允许腹部、大腿、**上臂**，应增加左/右上臂。

---

## Q4. 2026 年末的药物版图对产品范围的影响

### 证据
- **Wegovy 口服片**（司美格鲁肽，每日一次，25 mg 维持剂量）：FDA 于 2025-12-22 批准，2026-01-05 起在美国全面供应。自费价：1.5 mg 起始剂量约 $149/月；4 mg 在 2026-04-15 前为 $149，之后 $199；高剂量 $299。OASIS 4 中坚持用药者减重约 17%。从每周 2.4 mg 注射换为口服片时，停针一周后开始服药。来源：https://www.fiercepharma.com/pharma/novo-nordisk-wins-fda-approval-wegovy-pill-introducing-first-oral-glp-1-option-obesity ；https://www.ajmc.com/fda-approves-oral-semaglutide-as-first-glp-1-pill-for-weight-loss ；https://www.novonordisk-us.com/media/news-archive/news-details.html?id=916476
- **Foundayo（orforglipron，Lilly，每日口服，非肽类）**：2026-04-01 获 FDA 批准，经国家优先审评券约 50 天完成审评；服用不受进食或饮水限制；自费起价 $149/月，最高 $299（45 天内续药）或报道称 $349；2026-04-06 起通过 LillyDirect 发货。来源：https://www.statnews.com/2026/04/01/eli-lilly-obesity-pill-approved-orforglipron ；https://www.managedhealthcareexecutive.com/view/the-fda-has-approved-eli-lilly-s-oral-glp-1-let-the-heated-rivalry-with-oral-wegovy-begin ；https://www.scientificamerican.com/article/how-eli-lillys-new-glp-1-pill-stacks-up-against-wegovy-and-other-weight-loss/
- **Wegovy HD 7.2 mg（每周注射）**：2026-03-19 获 FDA 批准；STEP UP 中减重 18.7%（2.4 mg 为 15.6%）；需先耐受 2.4 mg 至少 4 周；**感觉异常/皮肤感觉改变发生率 22%**。来源：https://www.fda.gov/news-events/press-announcements/fda-approves-fourth-product-under-national-priority-voucher-program-higher-dose-semaglutide ；https://hcplive.com/view/fda-approves-higher-dose-semaglutide-wegovy-hd-injection-7-2-mg-for-obesity
- **Zepbound 西林瓶和 4 剂量 KwikPen**：
  - 2026-02 起，所有剂量的 KwikPen 和单剂量西林瓶均可通过 LillyDirect 自费购买，同价，2.5 mg 起价 $299/月。
  - 2025-12 的西林瓶自费价：2.5 mg $299、5 mg $399、7.5–15 mg $449（需 45 天内续药）。
  - 西林瓶需要用户自己用注射器抽取，KwikPen 是多剂量笔。
  - 来源：https://investor.lilly.com/node/53951 ；https://investor.lilly.com/node/53466 ；https://medical.lilly.com/us/products/answers/how-do-i-get-zepbound-tirzepatide-vials-or-multidose-kwikpens-250061
- **通用名利拉鲁肽（Saxenda 仿制药，Teva，每日注射）**：2025-08-28 获批并上市，WAC $1,165/月。来源：https://www.fiercepharma.com/pharma/saxenda-knockoff-teva-launches-first-generic-glp-1-obesity ；https://www.managedhealthcareexecutive.com/view/teva-launches-first-generic-glp-1-drug-for-obesity
- **复方司美格鲁肽/替尔泊肽**：短缺结束后，FDA 于 2026-02 表示将限制大规模营销的复方 GLP-1，点名 Hims & Hers（其复方口服司美格鲁肽上线后撤回；Novo 于 2026-02-09 起诉；涉及移交 DOJ 的报道），并陆续发出约 30 封警告信。2026-03 之后的情况本次未检索到。来源：https://www.thefdalawblog.com/2026/02/the-governments-warning-shot-fda-and-hhs-turn-up-the-pressure-on-compounding/ ；https://www.fiercepharma.com/pharma/fda-ramps-crackdown-glp-1-drug-compounders-fresh-batch-30-warning-letters ；https://www.bipc.com/oral-semaglutide-and-the-glp-1-compounding-reckoning-from-regulatory-ambiguity-to-fda-enforcement,-doj-referrals,-and-novo-nordisk%E2%80%99s-case-against-hims-and-hers
- **"微剂量"（microdosing）趋势**：Tebra 2025 调查（n=640）称 36% 的用户尝试过 **(unverified)**；Evidant 调查称约 1/7 **(unverified)**。医生普遍警告缺乏证据，且与复方药的可得性相关。来源：https://www.aarp.org/health/drugs-supplements/microdosing-glp1-drugs-for-weight-loss/ ；https://wtop.com/news/2026/07/glp-1-microdosing-risks-benefits-and-what-to-know-before-changing-your-dose/ ；https://www.fingerlakes1.com/2026/08/20/local-doctors-warn-against-growing-glp-1-microdosing-trend/
- **Medicare GLP-1 Bridge**：2026-07-01 起至 2027-12-31，月自付 $50，覆盖 Foundayo、Wegovy（注射和片剂）以及 Zepbound **KwikPen**；需要事先授权。来源：https://www.cms.gov/newsroom/press-releases/cms-launches-medicare-glp-1-bridge-expanding-access-glp-1-medications ；https://www.kff.org/quick-take/what-medicares-temporary-program-covering-glp-1s-for-obesity-means-for-beneficiaries/
- **中国市场**（PRD 为中文，可能面向华语用户）：
  - 司美格鲁肽在华核心专利于 **2026-03-20** 到期，至少 10 家本土药企已申报（九源基因、华东医药、丽珠、齐鲁等）；诺和的产品在省级挂网价格下降近一半。来源：https://www.scmp.com/business/china-business/article/3347869/chinas-weight-loss-drug-makers-take-global-giants-novo-nordisk-patent-expires ；https://www.thestar.com.my/aseanplus/aseanplus-news/2026/03/27/chinas-weight-loss-drug-makers-take-on-global-giants-as-novo-nordisk-patent-expires
  - 信达的**玛仕度肽**（GLP-1/胰高糖素双受体激动剂，每周一次）已获 NMPA 批准用于体重管理；获批日期和商品名本次未核实 **(unverified)**。来源：https://en.jiemian.com/article/14207496.html （同一次检索结果）

**品牌名的实际使用**：用户在日常交流中多用品牌名（Ozempic/Wegovy、Mounjaro/Zepbound），而且 Ozempic 和 Mounjaro 这两个糖尿病适应症品牌常被超适应症用于减重（常识，**(unverified)**）。

### 对 PRD 假设的判断
- "药物类型：Semaglutide / Tirzepatide；剂量 mg；每周注射"：**需要改，且有缺失**。
  - 每日口服的 Wegovy 片和 Foundayo、每日注射的利拉鲁肽都无法用"每周注射 + 半衰期"模型表达。
  - 西林瓶、复方药和"微剂量"用户按 **units/mL** 抽取，按 KwikPen "格数（clicks）"计量。
  - Wegovy HD 7.2 mg 有新的副作用（感觉异常）。
  - 中国市场还有玛仕度肽（双激动剂，不是 GLP-1/GIP）和多个司美格鲁肽仿制药。
- "v1.0 不做复方药比价与导购"：**合理**（降低合规风险）。但复方药用户确实存在，**记录**他们的用药仍然需要支持。

### 建议的 PRD 修改
1. **药物模型参数化**：建立药物目录，字段包括品牌名、通用名、给药途径（皮下/口服）、频率（每周/每日）、剂量阶梯、t½、Tmax 和说明书规则。
   - v1.0 至少覆盖：Wegovy、Ozempic、Wegovy HD、Wegovy 片、Zepbound（笔/西林瓶/KwikPen）、Mounjaro、Foundayo、利拉鲁肽、"复方/其他"。
   - 口服每日药物只做"服药打卡 + 依从性"，不画周期曲线，或者展示近似平稳的曲线。
2. **剂量录入支持三种方式**：mg、"mL + 浓度（mg/mL）→ 自动换算 mg"、"units（U-100 胰岛素注射器）+ 浓度 → mg"；KwikPen 支持"格数"录入（需按产品说明确认换算，**(unverified)**）。必须加防错校验：换算出的单次剂量超过该药最高剂量时，强制二次确认。
3. **剂量阶梯和非标准剂量**：允许自定义剂量和间隔（例如每 10 天一次），但 App 不给出任何调整建议，只做记录。
4. **中国版**：药物目录加入国内上市产品（诺和盈、穆峰达，以及玛仕度肽、司美格鲁肽仿制药等，名称需逐一核实）。双激动剂的 PK 参数需单独核实。

---

## Q5. 持续用药率、停药原因、停药后反弹，以及对订阅留存的含义

### 证据
- **Prime Therapeutics（商业保险，无糖尿病，用于肥胖）**：
  - 1 年持续率总体 31.5%；2 年 15%（另有报道称 20%）；3 年 **8.1%**（约 1/12），其中司美格鲁肽 14.3%。
  - 高效药物的 1 年持续率按起始年份逐年改善：2021→2024 年队列分别为 33.2%、34.1%、40.0%、**62.7%**，Zepbound 2024 年为 62.6%；Prime 将改善主要归因于短缺缓解。
  - 来源：https://www.primetherapeutics.com/w/read-prime-therapeutics-glp-1-year-3-data-press-release ；https://www.biospace.com/press-releases/prime-therapeutics-leading-research-shows-only-1-in-12-remain-on-a-glp-1-drug-for-obesity-at-three-years ；https://www.pharmexec.com/view/research-how-long-glp1-users-keep-using-medication-weight-loss
- **Rodriguez 等，*JAMA Netw Open* 2025（Truveta，n=125,474）**：
  - 1 年停药率：无 2 型糖尿病 **64.8%**，有 2 型糖尿病 46.5%。
  - 中重度胃肠道事件增加停药风险（HR 1.19–1.38）；体重每多下降 1%，停药风险降低约 3%。
  - 停药后 1 年内重新开始用药的比例：无 2 型糖尿病 36.3%，有 2 型糖尿病 47.3%。
  - 未直接测量费用因素。
  - 来源：https://www.truveta.com/blog/research/stopping-restarting-glp1-jama ；https://www.healthday.com/healthpro-news/weight-loss/many-with-overweight-obesity-discontinue-glp-1-receptor-agonists-within-one-year
- **停药原因**：KFF 2025-11 调查显示，56% 的现用或曾用者认为药费难以负担（有保险者中也有 55%），费用是最常见的停药原因之一。来源：https://www.kff.org/public-opinion/poll-1-in-8-adults-say-they-are-currently-taking-a-glp-1-drug-for-weight-loss-diabetes-or-another-condition-even-as-half-say-the-drugs-are-difficult-to-afford/ 。副作用（见上方 JAMA 研究）和 2022–2024 年的供应短缺（见 Prime）也是重要原因。
- **停药后反弹**：
  - **SURMOUNT-4**（*JAMA* 2024）：36 周导入期减重 20.9%；之后 52 周，换安慰剂组 **+14.0%**，继续用药组 −5.5%；安慰剂组 82% 的人反弹超过 25%。来源：https://jamanetwork.com/journals/jama/fullarticle/2812936 ；https://www.acc.org/latest-in-cardiology/journal-scans/2025/12/09/16/51/surmount-4
  - **BMJ 2026（West et al.，37 项研究，n=9,341）**：停药后平均每月反弹 0.4 kg，约 1.7 年回到基线；司美格鲁肽/替尔泊肽为每月 **0.8 kg**，约 1.5 年回到基线；比停止行为干预后的反弹每月快约 0.3 kg。来源：https://ox.ac.uk/news/2026-01-08-new-study-finds-stopping-weight-loss-drugs-linked-faster-regain-ending-diet ；https://www.news-medical.net/news/20260107/Stopping-weight-loss-drugs-leads-to-rapid-weight-regain-and-health-reversal.aspx
  - STEP 1 延伸研究：停药 1 年后反弹约 2/3（凭知识，本次未检索到，**(unverified)**）。
  - 老年人停药后有"肌少性肥胖"风险（反弹的多为脂肪）。来源：https://pubmed.ncbi.nlm.nih.gov/40819408/

### 对 PRD 假设的判断
- "年订阅留存率 ≥65%"：**高风险，需要重新定义**。App 的核心价值（周期曲线、加量期管理）与"正在用药"强绑定，而无糖尿病用户 1 年内停药率为 50–65%（2024 年 Zepbound 新用户约 37% 停药）。如果不为停药用户提供价值，订阅留存的上限会接近用药持续率。
- **缺失**：停药、暂停、重新开始用药的状态，以及停药后的维持方案。

### 建议的 PRD 修改
1. **用药状态机**：`加量中 → 维持 → 暂停（缺货/保险/手术/怀孕计划）→ 停药维持期 → 重新开始（从低剂量重新加量）`。每个状态对应不同的首页卡片。
2. **"停药后维持模式"作为付费价值的延续**：
   - 抗阻训练加蛋白质，用于减缓反弹并保护肌肉。
   - 体重反弹监测：例如相对最低体重上升超过 5% 时，提示和医生讨论，不给出用药建议。
   - 每周体重趋势和力量趋势。
   - 文案依据 BMJ 2026 和 SURMOUNT-4 的数据设定合理预期。
3. **KPI 分层**：按用药状态分层统计留存，例如"在用药用户 12 个月留存"和"停药后 3 个月留存"；首月付费转化另行监测。年付方案可以在用户使用满 8–12 周后再主推，并提供"暂停订阅"。
4. **重新开始支持**：36–47% 的人会在一年内重新用药，因此要保留历史数据，并支持"重新开始从 2.5 mg / 0.25 mg 加量"的记录模板。

---

## Q6. App 必须上报或转诊的安全红线

### 证据
- **说明书警告与注意事项**（Wegovy/Zepbound 类别，凭说明书知识，**(unverified)**，本次无法抓取原文）：
  - 甲状腺 C 细胞肿瘤（MTC 或 MEN2 病史为禁忌）
  - 急性胰腺炎（持续剧烈腹痛，可放射至背部，伴或不伴呕吐）
  - 急性胆囊疾病（胆石症、胆囊炎）
  - 与胰岛素或磺脲类合用时的低血糖
  - 脱水导致的急性肾损伤
  - 严重胃肠道反应（不推荐用于严重胃轻瘫）
  - 超敏反应
  - 2 型糖尿病患者的糖尿病视网膜病变并发症（司美格鲁肽）
  - 心率增加
  - 全麻或深度镇静时的肺误吸
  - 说明书地址：https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/215256s030lbl.pdf ；https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/217806s042lbl.pdf
- **NAION（非动脉炎性前部缺血性视神经病变）**：FDA 于 **2026-11-09** 要求所有 GLP-1 受体激动剂（含替尔泊肽和 Foundayo）在"警告和注意事项"中加入 NAION 风险。FDA 汇总 126 项试验，估计年发生率约 6/10 万（对照约 4/10 万）。确诊 NAION 时应考虑停药。EMA 已于 2025 年将其列为"非常罕见"不良反应。来源：https://www.pharmacytimes.com/view/fda-requires-class-wide-glp-1-ra-labeling-changes-for-potential-naion-risk ；https://www.ophthalmologytimes.com/view/fda-requires-naion-warning-across-the-glp-1-receptor-agonist-class ；https://www.reviewofoptometry.com/news/article/fda-adds-naion-risk-warning-to-glp1-labeling
- **自杀意念警告已删除**：FDA 于 2026-01-13 要求 Saxenda、Wegovy、Zepbound 删除该警告（综合审查未发现风险增加）。但情绪和心理健康筛查仍属于共识中的建议（见下）。来源：https://www.fda.gov/drugs/drug-safety-communications/fda-requests-removal-suicidal-behavior-and-ideation-warning-glucagon-peptide-1-receptor-agonist-glp
- **替尔泊肽与口服避孕药**：开始用药后 4 周内、以及每次加量后 4 周内，应改用非口服避孕方式或加用屏障避孕（原因是胃排空延迟）。来源：https://medical.lilly.com/us/products/answers/can-adults-with-obesity-or-overweight-taking-zepbound-tirzepatide-also-take-oral-contraceptives-211019
- **怀孕**：司美格鲁肽（Wegovy）需在计划怀孕前至少 2 个月停药。来源：https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/215256s030lbl.pdf （同一次检索摘要）
- **进食障碍和心理**：EASO/EFAD/ECPO 2026 建议在有临床指征时筛查进食障碍、酒精滥用、情绪症状和心理脆弱性；大幅减重可能诱发既往的进食障碍模式。来源：https://www.efad.org/easo-efad-ecpo-consensus-statement-on-incretin-based-therapies-in-obesity-care/ ；https://www.epocrates.com/online/article/european-obesity-guideline-pair-glp-1s-with-nutrition-muscle-mental-health
- **老年人和肌少症**：老年人肌肉流失可能加重衰弱，停药后有肌少性肥胖风险。来源：https://pubmed.ncbi.nlm.nih.gov/40819408/ ；https://mdpi.com/2072-6643/18/4/632
- **Wegovy HD 7.2 mg**：感觉异常发生率 22%（见 Q4）。

### 对 PRD 假设的判断
- PRD 只写了"免责声明 + 不给剂量调整指令"：**这部分成立，但远远不够**。
- "严禁展示红色警告或扣分"：**需要改**。这条规则必须排除安全红旗，否则会掩盖急症。
- 把"中/重度恶心或疲劳"统一处理为"恢复日 + 流质蛋白"：**需要改**。持续呕吐可能导致急性肾损伤，"极度疲劳"可能是低血糖或脱水；这些情况应该分诊，而不是只降低训练档位。

### 建议的 PRD 修改：红旗分诊表（在 [记副作用] 和 [恶心/降级] 中触发）

| 用户记录或回答 | App 动作 |
|---|---|
| 持续剧烈上腹痛，或放射至背部，伴或不伴呕吐 | **立即就医**提示（可能是胰腺炎），并暂停所有训练和饮食推送 |
| 右上腹痛、发热、皮肤或眼白发黄 | 尽快就医（可能是胆囊问题） |
| 24 小时以上无法进食或饮水，或反复呕吐/腹泻，伴尿少、头晕 | 提示联系医生或急诊（脱水/急性肾损伤风险）；**不要**只给"流质蛋白" |
| 正在使用胰岛素或磺脲类，并出现颤抖、出汗、意识模糊 | 按低血糖处理流程（15 g 速效糖），并提示联系医生；Onboarding 需询问合并用药 |
| 突发单眼视力下降或视野缺损（常在晨起时发现） | **立即就医（眼科/急诊）**，提及 NAION |
| 颈部肿块、吞咽困难、持续声音嘶哑 | 就医 |
| 皮疹、面部或喉咙肿胀、呼吸困难 | 急诊（过敏反应） |
| 计划手术或胃肠镜 | 提示把正在用 GLP-1 的情况告知麻醉医生 |
| 怀孕、计划怀孕或哺乳 | 提示联系医生；司美格鲁肽需提前至少 2 个月停药；暂停减重相关目标 |
| 女性、替尔泊肽、口服避孕药 | 开始用药和每次加量时，推送"4 周内加用屏障或非口服避孕"提醒（属于说明书信息，不是医疗建议） |
| 进食障碍风险筛查阳性（Onboarding 用 SCOFF 等简短问卷，**(unverified)** 需临床确认），或 BMI <18.5–20 仍想继续减重，或热量长期过低 | 关闭"减重目标"与热量相关内容，只保留营养充足和力量训练；建议寻求专业帮助 |
| 年龄 ≥65，或体重下降过快（例如每周 >1–1.5%，阈值需临床确认），或力量测试明显下降 | 加强抗阻训练和蛋白质提示，建议做 DXA 或肌力评估 |
| 未满 18 岁 | v1.0 不服务 |

- 文案统一为"可能需要医疗关注"，不做诊断。红旗卡片**可以使用警示色**，这是"无红色警告"规则的唯一例外。
- 合规：建议法务评估"浓度曲线 + 症状分诊"是否落入 FDA 对医疗器械软件或临床决策支持软件的监管范围，以及 App Store 医疗类 App 的审核要求（**(unverified)**，本次未检索）。

---

## Q7. 用户画像与日常痛点

### 证据

**人群规模与画像**
- **KFF**：
  - 2025-11：**12%** 的成人正在使用 GLP-1；50–64 岁使用率最高（**22%**）；女性 15% vs 男性 9%；56% 的现用或曾用者认为难以负担。
  - 2026-03：18% 曾经使用，12% 正在使用。
  - 来源：https://www.kff.org/public-opinion/poll-1-in-8-adults-say-they-are-currently-taking-a-glp-1-drug-for-weight-loss-diabetes-or-another-condition-even-as-half-say-the-drugs-are-difficult-to-afford/ ；https://www.kff.org/public-opinion/public-views-on-prescription-drug-costs-regulation-affordability-and-trumprx/
- **Gallup 2025-10**：12.4% 的成人为减重使用注射类 GLP-1（2024-02 为 5.8%）；女性 15.2% vs 男性 9.7%；40–49 岁 16.2%，50–64 岁 17.0%，65 岁以上 11.1%；成人肥胖率从 39.9% 降至 37.0%。本次未获得按收入的细分数据。来源：https://news.gallup.com/poll/696599/obesity-rate-declining.aspx ；https://www.consumeraffairs.com/news/the-glp-1-effect-us-obesity-rate-falls-for-the-first-time-in-years-110525.html
- **Medicare Bridge**（2026-07 起，$50/月）会带来大量 65 岁以上新用户（见 Q4）。

**社区自报的副作用**
- **Reddit 大样本研究**（Penn，arXiv 2603.12341 / *Nature Health* 2026；41 万帖子、6.7 万名自报用户）：
  - 43.5% 报告至少一种副作用。
  - 在报告副作用的用户中：恶心 36.9%、**疲劳 16.7%**、便秘 15.3%、腹泻 12.6%、精神类症状 12.9%（焦虑 4.2%、抑郁 2.8%）、月经紊乱约 4%，另有冷热感异常。
  - 局限：Reddit 用户偏年轻、偏男性、以美国为主；无剂量和时间信息。
  - 来源：https://arxiv.org/abs/2603.12341 ；https://www.engineering.upenn.edu/stories/penn-researchers-use-ai-to-surface-unreported-glp-1-side-effects-in-reddit-posts/ ；https://www.healthday.com/2026-physicians-briefing/social-media-captures-glp-1-receptor-agonist-side-effects-not-seen-in-clinical-trials-2
- **脱发**：
  - Wegovy 说明书 3.3% vs 1.0%；替尔泊肽试验约 4–5% vs 1%；Zepbound 汇总数据中女性 7.1%、男性 0.5%。
  - 真实世界预印本：替尔泊肽 4.24% vs 司美格鲁肽 3.33%。
  - 多为快速减重引起的休止期脱发，可逆。
  - 来源：https://www.ctvnews.ca/health/article/hair-loss-with-glp-1-drugs-is-rare-but-real-studies-find/ ；https://medrxiv.org/content/10.1101/2025.02.23.25322568v2.full.txt ；https://pmc.ncbi.nlm.nih.gov/articles/PMC12965749/
- **"食物噪音"（food noise）**：
  - Novo 赞助的 EASD 2025 调查（n=550，无对照）：持续想食物的比例从 62% 降到 16%。
  - Penn State 2026（n=1,000，单题）：现用或曾用 GLP-1 者报告频繁食物噪音的概率反而高约 50%（可能与认知度有关）。
  - 来源：https://www.patientcareonline.com/view/semaglutide-quells-food-noise-improves-mental-health-among-adults-on-treatment-for-obesity-and-overweight ；https://www.medicinenet.com/constant_food_noise_plagues_1_in_5_people/news.htm ；https://www.news-medical.net/news/20260513/Adding-GLP-1-drugs-to-behavioral-interventions-silences-food-noise.aspx
- **食欲低下时难以吃够蛋白质**：见 Q2 的 43%、0.6 g/kg 数据。

**其他痛点**
- 费用和保险（见 Q5）；微剂量和剂量拉长（见 Q4）。
- 周末食欲回升（"wearing off"）：网上讨论多，但缺乏研究（见 Q3）。
- 平台期，注射部位反应（未检索到具体发生率，**(unverified)**），怕肌肉流失和"Ozempic face"（媒体高频话题，本次未检索到量化数据，**(unverified)**）。

### 对 PRD 假设的判断
- 目标用户"35–55 岁高收入职场人士及企业主"：**需要改或补充**。
  - 作为早期付费人群可以理解：这类人更可能自费，并使用 Apple Watch、Garmin 和体脂秤。
  - 但主流用户**以女性为主，集中在 40–64 岁**，65 岁以上也在增加，而且对价格敏感（56% 觉得难以负担）。
  - Reddit 上的活跃讨论者又偏年轻、偏男性。
  - 高收入自费人群恰恰更可能使用西林瓶、复方药或微剂量，需要 units/mL 录入（见 Q4）。
- PRD 已覆盖的痛点：蛋白质难吃够、恶心时降级、记录要快。
- PRD **缺失**的痛点：便秘和排便、疲劳的来源、脱发、加量期、费用和断药、反弹，以及女性特有的问题（月经紊乱、避孕、围绝经期骨健康）。

### 建议的 PRD 修改
1. **画像扩展为 2 个**：
   - 主画像："40–64 岁女性、上班族、自费或商业保险，关心肌肉和外貌，体脂秤加手表"。
   - 次画像："35–55 岁高收入男性或女性，健身习惯强"。
   - v1.1 再考虑 ≥65 岁的 Medicare 用户（加入力量和平衡测试、骨健康内容）。
2. **训练库**：增加女性和初学者友好的渐进方案、绝经后女性的骨骼负重内容（T-REx 纳入了绝经后女性）；动作说明避免只用"俯卧撑"这类门槛较高的动作。
3. **副作用快捷记录扩展**：恶心、呕吐、便秘、腹泻、反流或硫磺嗝、疲劳、头晕、脱发、注射部位反应、情绪、月经，打分 0–3。这些数据用于个性化的周期分期（见 Q3）和红旗分诊（见 Q6）。
4. **内容卡片**（基于证据、不制造恐慌）：
   - "脱发多为暂时性"
   - "加量期反应通常一过性"
   - "力量提升比秤上的瘦体重数字更重要"
   - "停药后体重通常会反弹，这是生理现象，不是失败"
5. **医生简报的第 ④ 部分**改为"副作用频次 × 加量时间线"（证据更强），"× 血药浓度"仅作为附图。

---

## 附：本次无法核实、建议后续补查的清单
1. ACLM/ASN/OMA/TOS 2025 联合建议原文中的蛋白质具体数值（g/kg、按什么体重计算、每日或每餐下限）。需要 pubmed 或 obesity.org 的访问权限。
2. Wegovy/Zepbound 说明书 12.3 节（Tmax、稳态时间）、2.x 节（漏针和换日规则）、5.x 节完整警告清单（本次凭知识写入）。需要 accessdata.fda.gov 的访问权限。
3. STEP 1 延伸研究中"约 2/3 反弹"的原文数字。
4. 消费级 BIA 秤在 GLP-1 减重过程中个体内变化与 DXA 的一致性（目前似乎没有这类研究，建议做内部验证或与研究机构合作）。
5. HealthKit 是否有骨骼肌量数据类型（凭知识判断没有）。
6. 玛仕度肽的获批日期、商品名和 PK 参数；中国司美格鲁肽仿制药的获批情况。
7. KDIGO CKD 蛋白质建议的原文。
8. 进食障碍筛查工具的选择（需临床顾问确认）。
