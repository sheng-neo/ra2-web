# 港府数据使用条款（data-raw/landsd/）

本目录的数据都由香港特区政府部门提供，经 **CSDI 空间数据共享平台（Common Spatial Data Infrastructure Portal）** 取得：

| 文件 | 数据集 | 提供部门 | CSDI 数据集 ID |
|---|---|---|---|
| `cedd-dtm-2020-1m.*` | LiDAR Data（2020 DTM 瓦片，重采样为 1 m） | 土木工程拓展署（CEDD）土力工程处 | `cedd_rcd_1629267205233_87895` |
| `landsd-buildings.geojson.gz` | Building（Building_Outline_Public v2026-10-20） | 地政总署（LandsD） | `landsd_rcd_1637211194312_35158` |
| `landsd-pedestrian-routes.geojson.gz` | 3D Pedestrian Network（PedestrianRoute，2026-06-17） | 地政总署（LandsD） | `landsd_rcd_1637222018065_52265` |

条款原文检索日期：**2026-11-24**（由 M0 地形 agent 在云会话里抓取；页面 HTML 的 sha256 记在下表，便于日后对比是否改版）。
以下引文逐字照录英文原文，没有改动。**这不是法律意见**；商业化前请香港律师复核，并由项目负责人本人打开下列网址核对一次。

| 条款 | 网址 | 版本 | 抓取 HTML sha256 |
|---|---|---|---|
| CSDI Portal Terms and Conditions of Use | <https://portal.csdi.gov.hk/csdi-webpage/doc/TNC> | 页面未标版本号，页脚 “Copyright © 2024” | `53594dd98d9fc2177b0f53db04d80eda999b3c0cfca318ba5ef92e123c6dae0a` |
| DATA.GOV.HK Terms and Conditions | <https://data.gov.hk/en/terms-and-conditions> | “Version 1.2 (last updated on 26 May 2025)” | `c901a8f56c42a4cbcb2502c10d3623309529500e38f5d6c247aab68c6149dde0` |

数据本身是从 CSDI 取得的，所以**约束我们的是 CSDI 条款**。地政总署 DTM 的元数据写明 “Please refer to the Terms of Use and Disclaimer of the platform”。DATA.GOV.HK 也收录了同类数据集，它的条款与 CSDI 基本一致，一并记录备查。

## 1. CSDI Portal Terms and Conditions of Use（逐字引文）

**定义**

> In these Terms and Conditions of Use of the CSDI Portal (“Terms of Use”):
>
> “Data” include the “Spatial Data#” and all other contents provided by the Government and/or other organisations (such organisations are referred to as “the relevant organisations”) to the public on the CSDI Portal;
>
> “Spatial Data” include all data in the form of digital maps, text, graphics, drawings, diagrams, photographs, compilation of data, data specifications, metadata and Application Programming Interface (“API”).

**使用、再分发、商业用途、署名（核心条款）**

> Use of Data on CSDI Portal
>
> You are allowed to browse, download, distribute, reproduce, hyperlink to and print the Data for both commercial and non-commercial purposes on a free-of-charge basis on the condition that:-
>
> you shall comply with the Terms of Use;
>
> you shall identify clearly the Government and the CSDI Portal as the source of the Data and acknowledge the Government and the relevant organisations’ ownership of the intellectual property rights in the Data and in all copies thereof including but not limited to paper copies, digital copies and copies placed on other websites;
>
> you shall indemnify the Government and the relevant organisations against any allegations or claims of infringement of the rights of any person and all costs, losses, damages and liabilities incurred by the Government and the relevant organisations, which in any case arise directly or indirectly in relation to your use, reproduction and/or distribution of the Data

**免责（节选）**

> The Data are provided by the Government and the relevant organisations to you on an “as is” and “as available” basis. No statement, representation or warranty of any kind (whether express or implied) is given by the Government or the relevant organisations in relation to the Data (including its accuracy, correctness, completeness, non-infringement, reliability, security, timeliness and appropriateness of the use of the Data in any particular circumstances).

> The Terms of Use may be revised and/or amended from time to time by the Government or the relevant organisations without prior notice to any person. Accessing or using or linking to the CSDI Portal or using any Data after such amendments constitutes acceptance of such amendments. Please check the Terms of Use regularly for any revisions and/or amendments which may be made.

> The Government reserves the right to revise, omit or edit the Data or to suspend or terminate the provision of the Data, the CSDI Portal or any part thereof at any time in its absolute discretion without giving any reason or prior notice to any person (including you).

**知识产权、准据法、语言**

> Unless otherwise indicated, the Government is the owner of the intellectual property rights of all contents available on the CSDI Portal, including but not limited to all Data.

> The Terms of Use shall be governed and construed in accordance with the laws of the Hong Kong Special Administrative Region of the People’s Republic of China (“Hong Kong”). You also agree to submit to the exclusive jurisdiction of the Hong Kong Courts.

> In the event of any conflict or inconsistency between the English text and the Chinese translation of these Terms of Use, the English text shall prevail.

## 2. DATA.GOV.HK Terms and Conditions，Version 1.2（逐字引文）

> You are allowed to browse, download, distribute, reproduce, hyperlink to, and print the Data for both commercial and non-commercial purposes on a free-of-charge basis on condition that:-
>
> you shall comply with the Terms of Use;
>
> you shall identify clearly the source of the Data and acknowledge the Government and the Relevant Organisations’ ownership of the intellectual property rights in the Data and in all copies thereof including but not limited to paper copies, digital copies and copies placed on other websites;
>
> you shall indemnify the Government and the Relevant Organisations against any allegations or claims of infringement of the rights of any person and all costs, losses, damages and liabilities incurred by the Government and the Relevant Organisations, which in any case arise directly or indirectly in relation to your use, reproduction and/or distribution of the Data;
>
> you shall also give proper attribution to the Government, the Relevant Organisations and DATA.GOV.HK.

> Unless otherwise indicated, the Government is the owner of the intellectual property rights in all contents available on DATA.GOV.HK, including but not limited to all Data.

## 3. 数据集元数据里的附加说明（逐字）

- LandsD DTM（`landsd_rcd_1638158088368_93806`，**未采用**）：“Please refer to the Terms of Use and Disclaimer of the platform”。
- CEDD LiDAR Data：“The definition of the ground under trees may be less accurate.”
- LandsD Building：“Please note that the position accuracy of data varies from about 0.015m in the best to 1.500m to the worst.”
- 3D Pedestrian Network：元数据没有附加使用限制。

## 4. 我们必须显示的署名（加载页 / 鸣谢页 / ATTRIBUTION.txt）

条款没有规定固定措辞，只要求：① 写明数据来源是**香港特区政府**和 **CSDI 平台**；② 声明政府（及提供部门）拥有数据的知识产权。按此拟定如下，原样使用：

> Contains data from the Lands Department and the Civil Engineering and Development Department, HKSAR Government, obtained from the Common Spatial Data Infrastructure (CSDI) Portal (portal.csdi.gov.hk). Intellectual property rights in the data are owned by the Government of the Hong Kong Special Administrative Region. The data have been processed (resampled/converted) for this game; the Government is not responsible for, and does not endorse, this game.

> 部分資料來源：香港特別行政區政府地政總署及土木工程拓展署，經空間數據共享平台（CSDI，portal.csdi.gov.hk）取得；資料的知識產權屬香港特別行政區政府所有。資料已為本遊戲重新取樣及轉換，政府不對本遊戲負責，亦不代表政府認可。

只用到其中一部分数据时，可删去未用部门的名字（例如只用地形就只写土木工程拓展署）。中英两段已原样写进 `sources.json` 的 `attribution`。
括号里的处理方式按实际做过的事改写：产物里地形写「重采样、换算、修补异常值与小空洞、海面设 0」，
建筑写「换算、简化与筛选轮廓、部分高度估算、部分建筑以风格化地标取代」（见第 5 节）。

## 5. 结论：能不能把派生数据（高程、楼高）放进游戏数据文件再分发？

**可以，但有条件。**

- **允许的行为**：条款明文允许对 Data 进行 “distribute, reproduce”，且 “for both commercial and non-commercial purposes”，免费，无 NC（非商业）限制，也没有 share-alike（相同方式共享）要求。“Data” 的定义包含 “compilation of data”。所以，把重采样后的地形（`terrain.bin`）、LandsD 楼底/楼顶高程（写进 `city.json`）随游戏公开分发，属于条款允许的复制和分发。
- **必须满足的条件**：① 遵守条款；② 显示第 4 节的署名，并声明知识产权属政府，所有副本都要带上（包括仓库、网页、离线包）；③ 承担 indemnity（因我们使用或分发数据引起的侵权索赔，由我们赔偿政府）。
- **不明确之处**：条款列出的动词里没有 “modify / adapt”，也没有明确授予再许可（sublicense）的权利。重采样、换算单位，我们视为 “reproduce” 的技术处理，实践中普遍这样理解，但没有判例。因此：
  - 不要给这些数据另加许可证（例如不能把它们声明为 ODbL 或 CC-BY 发布），只能写“依 CSDI 条款使用”；
  - **与 ODbL 数据分层**：地形单独放在 `terrain.bin`；若 M2 决定用 LandsD 建筑，就**整层**替换 Overture 建筑，不逐栋混合，避免港府数据成为 ODbL 衍生数据库的一部分（与 PLAN §3.5 一致）；
  - 不暗示政府认可或合作（第 4 节署名里已写明）。
- **建筑图层的处理超出「复制」**（上线前法律核对的重点）：地形只做了重采样、单位换算和异常值修补；
  但 LandsD 建筑除换算外，还按 0.3 m 简化轮廓、删掉 < 4 m² 碎片和有盖构筑物、为缺高程的块估算高度，
  并把 7 个块换成风格化地标。这些已不只是 “reproduce”，属于条款没有明文授予的 “modify / adapt”。
  署名里已逐项写明处理方式（`citymap/src/stages/terrain-refs.ts`），但是否需要另行取得许可，
  由项目负责人在上线前亲自核对条款或咨询律师后决定。
- **快照处理**：本目录不含楼名、行人通道别名等名称字段（`landsd_fetch.py` 只取几何、ID、高程和类别），以免带入真实企业名（PLAN §1 红线）。

## 6. 未能核对的条款

- 地政总署自己的开放数据条款页面在 `www.landsd.gov.hk`，本环境未放行，未能打开。
- CEDD 空间数据门户 `sdportal.cedd.gov.hk` 同样未放行。
- CSDI 下载接口 `portal.csdi.gov.hk/csdi-webpage/download/common/...`（含数据规格 PDF）被 WAF 拦截（HTTP 403 “The request is blocked”），所以数据字典未能读取。

上述数据都经 CSDI 取得，适用 CSDI 条款；部门条款如另有要求，应以部门条款为准，需人工补查。
