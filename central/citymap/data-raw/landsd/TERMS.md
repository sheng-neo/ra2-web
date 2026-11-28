# 港府数据使用条款（data-raw/landsd/）

本目录的数据都由香港特区政府部门提供，经 **CSDI 空间数据共享平台（Common Spatial Data Infrastructure Portal）** 取得：

| 文件 | 数据集 | 提供部门 | CSDI 数据集 ID |
|---|---|---|---|
| `cedd-dtm-2020-1m.*` | LiDAR Data（2020 DTM 瓦片，重采样为 1 m） | 土木工程拓展署（CEDD）土力工程处 | `cedd_rcd_1629267205233_87895` |
| `landsd-buildings.geojson.gz` | Building（Building_Outline_Public v2026-10-20） | 地政总署（LandsD） | `landsd_rcd_1637211194312_35158` |
| `landsd-pedestrian-routes.geojson.gz` | 3D Pedestrian Network（PedestrianRoute，2026-06-17） | 地政总署（LandsD） | `landsd_rcd_1637222018065_52265` |
| `landsd-3dvm-parts.json.gz` | 3D Visualisation Map (Non-textured models) 可視化三維地圖（無紋理模型），只存屋面派生的分层轮廓（R2 新增，见第 7 节） | 地政总署（LandsD）测绘处 | `landsd_rcd_1742809441342_98380` |

条款原文检索日期：**2026-11-24**（由 M0 地形 agent 在云会话里抓取；页面 HTML 的 sha256 记在下表，便于日后对比是否改版）。
以下引文逐字照录英文原文，没有改动。**这不是法律意见**。本项目只作非商业的学习 / 研究（负责人 2026-11-26，D3，见 PLAN §1「品牌」行）：公开发布前由项目负责人本人打开下列网址核对一次；只有将来改为商业用途，才需请香港律师复核。

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
- **建筑图层的处理超出「复制」**（条款核对的重点）：地形只做了重采样、单位换算和异常值修补；
  但 LandsD 建筑除换算外，还按 0.3 m 简化轮廓、删掉 < 4 m² 碎片和有盖构筑物、为缺高程的块估算高度，
  并把 7 个块换成风格化地标。这些已不只是 “reproduce”，属于条款没有明文授予的 “modify / adapt”。
  署名里已逐项写明处理方式（`citymap/src/stages/terrain-refs.ts`），但是否需要另行取得许可，
  由项目负责人在公开发布前亲自核对条款后决定（只有将来改为商业用途才需咨询律师，D3）。
- **快照处理**：本目录不含楼名、行人通道别名等名称字段（`landsd_fetch.py` 只取几何、ID、高程和类别），以免带入真实企业名（PLAN §1 红线）。

## 6. 未能核对的条款

- 地政总署自己的开放数据条款页面在 `www.landsd.gov.hk`，本环境未放行，未能打开。
- CEDD 空间数据门户 `sdportal.cedd.gov.hk` 同样未放行。
- CSDI 下载接口 `portal.csdi.gov.hk/csdi-webpage/download/common/...`（含数据规格 PDF）被 WAF 拦截（HTTP 403 “The request is blocked”），所以数据字典未能读取。

上述数据都经 CSDI 取得，适用 CSDI 条款；部门条款如另有要求，应以部门条款为准，需人工补查。

## 7. 可視化三維地圖（無紋理模型）：3d.map.gov.hk 条款（细节一轮 R2 新增，逐字引文）

数据来源链：CSDI 图幅索引（`landsd_rcd_1742809441342_98380` 的 FeatureServer，元数据写 “Please refer to the Terms of Use and
Disclaimer of the platform”，即第 1 节的 CSDI 条款）→ 每幅 1:1000 图幅的 zip 由可視化三維地圖网站的下载接口
`https://download.map.gov.hk/api/3d-zip/GLTF0/<图幅>.zip?key=…` 提供（key 写在 CSDI 索引里，`landsd_3d_fetch.py` 每次从索引读，
仓库里不存 key）。只用 `GLTF0`（无纹理）；不带 0 的 `GLTF/` 是带照片纹理的版本，PLAN §1 不用。zip 里 `TERRAIN(TB)/` 的正射影像 JPG
从不打开、不解压、不保存。

条款检索日期：**2026-11-25**。3d.map.gov.hk 是单页应用，条款文字在它的 JS 包里（“About”弹窗与 Download API 页共用），
下面按页面显示的文字逐字照录（去掉 HTML 标签与列表编号）：

| 来源 | 网址 | 抓取内容 sha256 |
|---|---|---|
| 网站外壳（`/` 与 `/download-api` 返回同一页） | <https://3d.map.gov.hk/download-api> | `70f7e0f25a7acdaa070e6d8838910b851eb5ef813bbf95053ce88b04fb76b30b` |
| 条款正文（“Terms and Conditions of Use”各节，英 / 繁 / 简） | <https://3d.map.gov.hk/mapviewer/app/js/app.d1a5765b.js>（`window.OpenUp.VERSION` “V1.0.2”） | `a3958941f935bb40458af598922a41ffb38e649db02e9269054e563190ab5693` |
| Download API 页面组件（勾选 “I have read and agreed to the Terms and Conditions of Use” 后才显示接口说明） | <https://3d.map.gov.hk/mapviewer/app/js/174.bbc58423.js> | `7a077091c508af229be31b9c87f6b28c20072fc00fe57640768e322747a57f4b` |

**一般规定、使用本网站所载的资料（核心条款）**

> This website is an online geospatial information service provided by the Lands Department of the Government of the Hong Kong Special Administrative Region (the “Government”) to the public for obtaining geo-referenced information.
>
> In these Terms and Conditions of Use of this website (“Terms of Use”): “Data” include the “Spatial Data ” (Note 1) and all other contents provided by the Government and / or other organisations (such organisations are referred to as “the relevant organisations”) to the public on this website; “Spatial Data” include all data in the form of digital maps, text, graphics, drawings, diagrams, photographs, compilation of data, data specifications and metadata and Application Programming Interface (“API”).

> You are allowed to browse, download, distribute, reproduce, hyperlink to and print the Data for both commercial and non-commercial purposes on a free-of-charge basis on the condition that:
>
> you shall comply with the Terms of Use;
>
> you shall identify clearly the Government and this website as the source of the Data and acknowledge the Government  and the relevant organisations’ ownership of the intellectual property rights in the Data and in all copies thereof including but not limited to paper copies, digital copies and copies placed on other websites;
>
> you shall indemnify the Government and the relevant organisations against any allegations or claims of infringement of the rights of any person and all costs, losses, damages and liabilities incurred by the Government and the relevant organisations, which in any case arise directly or indirectly in relation to your use, reproduction and/or distribution of the Data.

**免责（节选）、知识产权**

> The Data are provided by the Government and the relevant organisations to you on an “as is” and “as available” basis. No statement, representation or warranty of any kind (whether express or implied) is given by the Government or the relevant organisations in relation to the Data (including its accuracy, correctness, completeness, non-infringement, reliability, security, timeliness and appropriateness of the use of the Data in any particular circumstances).

> In consideration of the Government and the relevant organisations providing the Data on this website, by using this website, you hereby unconditionally accept the Terms of Use. IF YOU DO NOT AGREE TO THE TERMS OF USE, PLEASE DO NOT USE THIS WEBSITE OR THE DATA PROVIDED THEREON. The Terms of Use may be revised and/or amended from time to time by the Government or the relevant organisations without prior notice to any person.

> Unless otherwise indicated, the Government is the owner of the intellectual property rights of all contents available on this website, including but not limited to all Data.

> The Terms of Use shall be governed and construed in accordance with the laws of the Hong Kong Special Administrative Region of the People’s Republic of China (“Hong Kong”). You also agree to submit to the exclusive jurisdiction of the Hong Kong Courts.

**合理使用（接口）**

> The bandwidth of API services is shared by all API users and utilisation by each user will be different. In order to ensure all users can enjoy the best possible experience, a fair usage policy will be applied to manage service performance.

> We may monitor usage of your API service. If in our reasonable opinion, the use of your API service is excessive or adversely affected our API services provided to other users, we may manage access of the API service in a reasonable manner.

**Download API 页的 “Terms and Conditions of Use” 框（逐字）**

> In order to maintain the quality of the Map API service, your application shall not invoke the API with large amount of requests within a short period.
>
> The use of the Map APIs (including base map details) provided on this website is subject to the Terms and Conditions as well as the IP Rights Notice of LandsD Map API. You are required to include Lands Department logo on the map face and Copyright Notice to attribute Lands Department’s data in your map applications.
>
> Copyright Notice: Map from Lands Department; Aerial Photograph from Lands Department; Earth Image from NASA Earth Observatory; Satellite Imagery from USGS/NASA Landsat
>
> Disclaimer Notice: The map information provided on this web site is protected by copyright owned by the Government of the Hong Kong Special Administrative Region (the “Government”). No express or implied warranty is given to the accuracy or completeness of such map information or its appropriateness for use in any particular circumstances. The Government is not responsible for any loss or damage whatsoever arising from any cause in connection with such map information or with this web site.

**结论（不是法律意见）**

- **允许**：与 CSDI 条款同一套措辞——“browse, download, distribute, reproduce … for both commercial and non-commercial purposes on a free-of-charge
  basis”，无 NC、无 share-alike。没有任何一句禁止从模型派生简化几何或在免费网页游戏里再分发，所以没有停手的理由。
- **条件**：① 写明**政府**与**本网站**（3d.map.gov.hk）是来源——署名写成「经可視化三維地圖网站（3d.map.gov.hk）及 CSDI 平台取得」；
  ② 声明知识产权属政府；③ indemnity；④ 下载接口不得短时间大量请求：`landsd_3d_fetch.py` 一幅一幅串行下载，幅间停 3 s，全范围共 16 幅。
- **Map API 的 logo 要求**针对的是在“map face”上显示地政总署底图（Map API / base map details）的“map applications”。我们不调用
  Map API、不显示地政总署底图，只用下载接口取模型，所以按网站一般条款署名（上面 ①②）。是否仍需在鸣谢页放地政总署标志
  （与 PLAN §1「不放任何 logo」的红线冲突），上线前由负责人决定；本轮不放。
- **处理方式超出「复制」**：只留屋面派生的分层轮廓（每栋楼按 0.25 m 栅格求最高屋面 → 聚层 → 轮廓 0.25 m 简化；管线再合层、
  套合 2D 轮廓、0.5 m 简化（曲线轮廓逐次放大到最多 4 m；简化后自交的环改用 1 m / 0.5 m 简化或原像素边界环）），不存网格、贴图、名称。与第 5 节建筑图层同样属于条款没有明文授予的 “modify / adapt”，
  署名里如实写明（`REF_LANDSD_3DVM`，`citymap/src/stages/terrain-refs.ts`），条款核对（将来改为商业用途时的法律复核）的范围一并包括它。
- **第 4 节署名的 3D 版本**（原样使用；写进 `meta.sources` 与 ATTRIBUTION.txt）：

> Contains 3D building data from the Lands Department, HKSAR Government (3D Visualisation Map, Non-textured models), obtained from the 3D Visualisation Map website (3d.map.gov.hk) through the Common Spatial Data Infrastructure (CSDI) Portal (portal.csdi.gov.hk). Intellectual property rights in the data are owned by the Government of the Hong Kong Special Administrative Region. The data have been processed (roof surfaces of the 3D models converted to simplified stacked outlines and fitted to the 2D building footprints; no meshes or textures kept) for this game; the Government is not responsible for, and does not endorse, this game.

> 部分資料來源：香港特別行政區政府地政總署「可視化三維地圖（無紋理模型）」，經可視化三維地圖網站（3d.map.gov.hk）及空間數據共享平台（CSDI，portal.csdi.gov.hk）取得；資料的知識產權屬香港特別行政區政府所有。資料已為本遊戲轉換（三維模型的屋面簡化為分層輪廓並套合二維建築輪廓，不保留網格及紋理），政府不對本遊戲負責，亦不代表政府認可。


## 8. 可視化三維地圖（個別模型，带照片纹理）：同一网站、同一条款（真实贴面一轮 R3 新增）

负责人 2026-11-26 的决定（PLAN §1 已改）：楼宇要用真实的物理贴面，越真实越好。第 7 节里「不带 0 的 `GLTF/` 是带照片纹理的版本，
PLAN §1 不用」一句由此作废：`fetch/landsd_3d_tex_bake.py` 下载的正是 `https://download.map.gov.hk/api/3d-zip/GLTF/<图幅>.zip?key=…`
（带纹理的个别模型；key 每次从 CSDI 图幅索引 `landsd_rcd_1671676915450_88604` 读，不进仓库）。

条款核对日期：**2026-11-26**。重新抓取第 7 节的三个网页，内容 sha256 与第 7 节**完全相同**（条款没有变）：

| 来源 | 网址 | 抓取内容 sha256 |
|---|---|---|
| 网站外壳 | <https://3d.map.gov.hk/download-api> | `70f7e0f25a7acdaa070e6d8838910b851eb5ef813bbf95053ce88b04fb76b30b` |
| 条款正文（`app.d1a5765b.js`，V1.0.2） | <https://3d.map.gov.hk/mapviewer/app/js/app.d1a5765b.js> | `a3958941f935bb40458af598922a41ffb38e649db02e9269054e563190ab5693` |
| Download API 页面组件 | <https://3d.map.gov.hk/mapviewer/app/js/174.bbc58423.js> | `7a077091c508af229be31b9c87f6b28c20072fc00fe57640768e322747a57f4b` |
| CSDI 数据集页（个别模型） | <https://portal.csdi.gov.hk/geoportal/?datasetId=landsd_rcd_1671676915450_88604> | `7e6cb38071aab5b5d75ecb257bb059ff41642a16be2b12ff748cf07e24626bc9` |
| CSDI 元数据 XML（个别模型，R1 时抓取） | `csdi_landsd_rcd_1671676915450_88604.xml` | `37ef4a2890d3c88152c610de37eb0fae13754083e2227a731dc9f334ecb3137b` |

**带纹理与无纹理在同一个下载页、同一个「Terms and Conditions of Use」框后面**（`174.bbc58423.js` 的格式选单，逐字）：

> `{value:"textured",label:"Textured",isCategory:!0},{value:"CESIUM",label:"CESIUM"},{value:"FBX",label:"FBX"},{value:"GLTF",label:"GLTF"},{value:"MAX",label:"MAX"},{value:"OBJ",label:"OBJ"},{value:"OSGB",label:"OSGB"},{value:"nonTextured",label:"Non-Textured",isCategory:!0},{value:"FBX0",label:"FBX"},{value:"GLTF0",label:"GLTF"},{value:"MAX0",label:"MAX"}],this.format=this.formatOption[2]`

（默认选中的 `formatOption[2]` 就是带纹理的 GLTF。）

**CSDI 元数据（个别模型，逐字）**

> The 3D Visualisation Map (Individualised models) is a set of digital data of 3D models featuring geometry models and texture maps to represent the geometrical shape, appearance and position of different types of ground objects, including building, infrastructure, vegetation, waterbody, terrain and generic (others). The dataset covers the whole territory of Hong Kong. You can click the link below to access the 3D Visualisation Map (https://3d.map.gov.hk).

> Please refer to the Terms of Use and Disclaimer of the platform

**条款里与照片有关的定义（第 7 节已引，逐字重复）**

> “Data” include the “Spatial Data ” (Note 1) and all other contents provided by the Government and / or other organisations (such organisations are referred to as “the relevant organisations”) to the public on this website; “Spatial Data” include all data in the form of digital maps, text, graphics, drawings, diagrams, photographs, compilation of data, data specifications and metadata and Application Programming Interface (“API”).

> You are allowed to browse, download, distribute, reproduce, hyperlink to and print the Data for both commercial and non-commercial purposes on a free-of-charge basis on the condition that: […] you shall identify clearly the Government and this website as the source of the Data and acknowledge the Government  and the relevant organisations’ ownership of the intellectual property rights in the Data and in all copies thereof […]

**结论（不是法律意见）**

- 照片纹理是条款定义的 “Spatial Data”（“photographs”），与无纹理模型同一网站、同一条款：允许下载、分发、复制，商业或非商业，
  条件是署名（政府 + 本网站）与声明知识产权。条款没有禁止，所以继续。
- **处理方式**：不分发模型、网格、原始贴图或 zip。`landsd_3d_tex_bake.py` 把每栋楼的照片按我们自己的简化墙面 / 屋面重新投影、
  按 4 px/m（墙）/ 3 px/m（屋顶）重新取样、去掉白天日照（低频亮度归一）、分出玻璃 / 实墙 / 独立窗（alpha 码），打包成
  `client/public/city/facades/*.webp`（文件名带内容哈希）。这同样属于条款没有明文授予的 “modify / adapt”，署名如实写明，条款核对（将来改为商业用途时的法律复核）的范围一并包括它。
- **不贴照片的楼**：敏感区（军事 / 政府）里的楼与模型（模型本身也不当作邻楼的贴图来源）、地标替换掉的楼（`landmarks[].replaces`，本来就不在楼表里）、
  照片里有脚手架 / 绿网 / 工地围板的楼（自动检测 + 人工复查，清单的 `excluded.scaffold`）。
- **合理使用**：后台线程一幅一幅顺序下载（同一时刻一条连接、幅间停 3 s），断线按 HTTP Range 续传，不重复下载已缓存的幅。
- **模型编号**：带纹理模型的编号与无纹理快照（`landsd-3dvm-parts.json.gz`）只差倒数第二个字母（如 `…063A0` 对 `…063C0`）；
  本轮按几何投影，不靠编号对应，所以不需要这条规则。
- **署名**（原样使用；写进 `meta.sources`（`REF_LANDSD_3DVM_TEX`）、ATTRIBUTION.txt 与 `sources.json`）：

> Contains 3D building data and photo textures from the Lands Department, HKSAR Government (3D Visualisation Map, Individualised models), obtained from the 3D Visualisation Map website (3d.map.gov.hk) through the Common Spatial Data Infrastructure (CSDI) Portal (portal.csdi.gov.hk). Intellectual property rights in the data are owned by the Government of the Hong Kong Special Administrative Region. The photo textures have been processed (projected onto simplified building walls and roofs, resampled, re-lit for night and reduced) for this game; the Government is not responsible for, and does not endorse, this game.

> 部分資料來源：香港特別行政區政府地政總署「可視化三維地圖（個別模型）」的三維建築及照片紋理，經可視化三維地圖網站（3d.map.gov.hk）及空間數據共享平台（CSDI，portal.csdi.gov.hk）取得；資料的知識產權屬香港特別行政區政府所有。照片紋理已為本遊戲處理（投影到簡化的建築牆面及屋頂、重新取樣、按夜景重新打光及縮小），政府不對本遊戲負責，亦不代表政府認可。

### 8.1 电车走廊高清街面层与雨篷（R4 新增）：同一数据集、同一条款、同一署名

条款核对日期：**2026-11-27**（数据集、下载口、条款页与第 8 节相同；本轮只是同一批照片的另一种派生方式）。
`fetch/landsd_3d_hires_bake.py` 只处理电车沿线的街墙（走廊：轨道 60 m 内正对、35 m 内街角看得见的墙面，离地 0–45 m），
把同一批带纹理模型的照片按我们的墙面重新投影成较高密度的贴图（街面段 24 px/m、上段 12 px/m；下载口不可用时退回 R3 已缓存的 6 px/m 投影），
并派生夜景所需的逐纹素分类（店面开口、招牌、玻璃 / 独立窗）、墙面后退深度，与从模型近水平板简化出来的雨篷（贴墙扁盒：位置、伸出、高度、厚度、三种取样颜色）。
仓库里仍然**只有派生结果**（`client/public/city/facades/h*.webp` 与 `landsd-3dvm-hires.json.gz`），没有模型、网格、原始贴图或 zip。

- 照片里真实的招牌、楼名按原样出现（负责人决定 D1，PLAN §1）；广告、车身仍是虚构的。
- 不做高清层的楼：敏感区与敏感区 3 m 内的楼、六座地标、R3 已排除的脚手架 / 绿网 / 围板楼；高清下再查一次绿网（`netting_faces`），
  整面不用高清（清单 `excluded.faces`），退回 R3 的 4 px/m 贴面。另外逐页人工看过全部高清页（联系表），把竹棚（常常没有绿网）、
  灰色棚网、像围板的大片平板、临时节庆横幅，以及源数据贴图错误（竖墙贴了航拍俯视图、拉成斜条纹）的面 / 楼写进
  `MANUAL_EXCLUDE_FACES` / `MANUAL_EXCLUDE_BUILDINGS`（脚本里，带原因；清单 `excluded` 里同样记着）。管线把整面排除的面记进
  `Building.hires.x`、整栋排除的楼连 R3 贴面一起删掉，客户端这些面 / 楼在所有档位都不贴照片（画程序立面；R4 整合）。
  R4 复审修正：离六座地标外环 3 m 内的楼（镜面大厦旁的裙楼）也整栋不做高清、不用 R3 贴面；两处围板面另行排除；
  R3 绿网检测排除、但在走廊 25 m 内的 29 栋按高清投影逐栋人工复查，12 栋没有竹棚 / 绿网 / 围板的放行做高清（`R3_RELEASE`，
  R3 的 4 px/m 贴面照旧不用）；街面带（离地 0–4.6 m）里空白、拉花的竖条 / 斜条、伸出墙外的东西（招牌侧面、帘状网格）按 3 m 一窗
  自动剔除（`gf_quality`），另有人工列出的航拍俯视图街面（`MANUAL_GF_REJECT`），这些地方画暗的程序铺面。
- 下载仍是一幅一幅、Range 续传、幅间停顿；key 只在内存里。2026-11-27 下载口 `download.map.gov.hk` 的 TLS 证书曾过期
  （2026-11-26 08:20 UTC 到期）：**没有绕过证书校验**，等它在 2026-11-27 更新后才下载（11-SW-8D / 8B / 8A / 14B / 14A，
  sha256 与 R3 记录的同一修订一致）；11-SW-9C 用本机已有的同一修订 zip。投影完 zip 即删。
- 署名与第 8 节完全相同（`meta.sources` 里同一条 `REF_LANDSD_3DVM_TEX`）；处理说明「projected onto simplified building walls and roofs,
  resampled, re-lit for night and reduced」也涵盖高清层；雨篷是模型几何的简化派生，与第 7 节的分层屋面同类。
- 铺位清单 `landsd-3dvm-hires-bays.json.gz`（R4 整合）只是从已打包的街面页（上面的派生结果）读出的每间铺的位置与种子，
  给路面的铺面溢光用；同一条款、同一署名，不含任何原始数据。

## 9. 六座地标的网格与照片纹理（真实地标一轮 R5 新增）

负责人 2026-11-27 的决定（D5，PLAN §1「地标」一行已改）：六座地标换成真实外观。`fetch/landsd_3d_landmark_bake.py` 用的是第 8 节同一批
带纹理的个别模型（图幅 11-SW-8B、11-SW-8D、11-SW-9C、11-SW-14A，zip 的 sha256 与 `sources.json` 里 R3 那条的 `derivedFrom` 相同），
同一网站、同一条款，本轮没有重新下载、也没有新的条款文字（第 7、8 节的核对仍然有效；key 照旧不进仓库）。

**与第 8 节不同的一点**：第 8 节写的是「不分发模型、网格」。R5 起**分发由六座原型楼派生的网格**：`client/public/city/landmarks/*`
是清理（删去独立雕塑、碎件与轮廓外的低矮附属）、减面（六座原模型合计 274,841 个三角形 → HIGH 98,971、LOW 10,030（R5b 修正二后、与清单 `landsd-3dvm-landmarks.json.gz` 的 stats 一致；R5 初版是 94,237 / 11,130）；mirror-block、porthole-house 这类本来就简单的几乎不减）、
平移到本地坐标、墙脚压到地形、重新展开并重新取样、去日照、压缩成 BC3 / ETC2 / WebP 的派生数据；不含原模型的网格原文、原始贴图或 zip。
这同样是条款没有明文授予的 “modify / adapt”（第 5、8 节已记），也属于将来改为商业用途时法律复核的范围。署名用第 8 节的同一条
（`REF_LANDSD_3DVM_TEX`），ATTRIBUTION.txt 的「Changes made」另写明这一步。

- **名字**：D5 只放开外观；负责人 2026-11-27 D6 起六座地标在 `central.json` 里用建筑的真名（只在地标名处，见 `citymap/src/redlines.ts`
  的 `LANDMARK_REAL_NAMES`）。名字来自负责人的决定，不来自地政总署的数据：本清单与网格、图集文件里仍只有地标 id 与地政总署模型号；
  照片纹理里本来就有的字（楼名、标志）按 D1 随照片出现，不另加。
- **敏感区**：管线不给敏感区里的地标接网格；烘焙时任何落进敏感区的三角形一律删掉（本轮 0 个，最近的离政府区 27.5 m）。
- **雕塑**：《版权条例》第 71 条（公众地方永久展示的建筑物与雕塑）是否覆盖 3D 游戏模型，没有判例【摘要】；独立雕塑（原型广场上的两只铜狮）删掉不用。
- 以上都不是法律意见；本项目只作非商业的学习 / 研究（D3）。
