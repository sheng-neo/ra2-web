# game-data —— 红警2 原版游戏文件（自备）

本目录存放你自己的《红色警戒2》（原版，非尤里的复仇）游戏文件，供解析器读取。
**整个目录已被 .gitignore 排除，绝不会提交到代码仓库。**

## 需要哪些文件

从红警2 安装目录拷贝以下文件到本目录：

| 文件 | 内容 | 必需 |
|------|------|------|
| `ra2.mix` | 主资源包（套娃包含 cache/conquer/local/isotemp 等子包：规则、贴图、地形、体素） | ✅ |
| `language.mix` | 界面文字、字符串表、部分 UI 素材 | ✅ |
| `multi.mix` | 官方遭遇战/多人地图 | ✅ |
| `theme.mix` | 背景音乐 | 建议 |
| `audio.bag` | 音效数据包 | 建议 |
| `audio.idx` | 音效索引 | 建议 |

拷贝完成后在仓库根目录运行 `pnpm check-assets` 校验。

## 怎么获得红警2

EA 从未免费开放红警2（免费的只有初代 C&C、红警1、泰伯利亚之日）。合法途径：

1. **Steam**（推荐，单卖）：[Command & Conquer Red Alert 2 and Yuri's Revenge](https://store.steampowered.com/app/2229850/)，经常打折；或买《The Ultimate Collection》合集。
2. **EA App**（仅 Windows）同样有售。
3. 你过去购买的原版光盘/数字版也可以，从旧电脑拷出上述文件即可。

### Mac 用户：不需要 Windows，两步搞定

红警2 在 Steam 上是 Windows 游戏，但**本项目只需要它的数据文件，不需要运行游戏**：

1. 在 Mac 浏览器里打开上面的 Steam 链接，登录购买（网页即可完成）；
2. 在仓库根目录运行 `bash tools/fetch-game-files.sh` —— 脚本会用 Valve 官方的
   steamcmd 下载你已购的游戏文件，并自动把所需的 6 个文件提取到本目录。

（Windows 电脑用户：安装游戏后从安装目录手动拷贝上述文件即可。）

## 法律说明

- 游戏素材版权归 EA 所有，本项目仅在你的设备上本地解析你自己的拷贝；
- 请勿将这些文件上传到任何公开仓库或服务器。
