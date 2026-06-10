#!/usr/bin/env bash
# 在 macOS 上下载红警2数据文件（需要你的 Steam 账号已购买该游戏）。
# 原理：steamcmd 可跨平台下载你已拥有的 Windows 游戏的文件，
#       我们只取 .mix/.bag/.idx 数据文件，不需要运行游戏本身。
# 用法：bash tools/fetch-game-files.sh
set -euo pipefail

APPID=2229850 # Command & Conquer Red Alert 2 and Yuri's Revenge
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/game-data"
DOWNLOAD_DIR="$DEST/_steam_download"
NEEDED=(ra2.mix language.mix multi.mix theme.mix audio.bag audio.idx)

echo "=== 网页版红警2 · 游戏文件下载助手 ==="
echo

if ! command -v steamcmd >/dev/null 2>&1; then
  echo "未检测到 steamcmd，正在用 Homebrew 安装……"
  brew install --cask steamcmd
fi

echo "请输入你的 Steam 用户名（购买了红警2的账号；下载过程可能要求输入 Steam Guard 验证码）"
read -r -p "Steam 用户名: " STEAM_USER
if [ -z "$STEAM_USER" ]; then
  echo "✗ 用户名不能为空"
  exit 1
fi

mkdir -p "$DOWNLOAD_DIR"
echo
echo "开始下载（约 2 GB，取决于网络可能需要几分钟到几十分钟）……"
# 注意：force_install_dir 必须在 login 之前；ForcePlatformType=windows 是关键
steamcmd \
  +@sSteamCmdForcePlatformType windows \
  +force_install_dir "$DOWNLOAD_DIR" \
  +login "$STEAM_USER" \
  +app_update "$APPID" validate \
  +quit

echo
echo "下载完成，提取所需文件到 game-data/ ……"
missing=0
for f in "${NEEDED[@]}"; do
  found=$(find "$DOWNLOAD_DIR" -iname "$f" -type f | head -1 || true)
  if [ -n "$found" ]; then
    cp -f "$found" "$DEST/$f"
    echo "  ✓ $f"
  else
    echo "  ✗ 未找到 $f"
    missing=1
  fi
done

echo
read -r -p "是否删除下载缓存 _steam_download（约 2GB）？[y/N] " CLEAN
if [[ "${CLEAN:-n}" =~ ^[Yy]$ ]]; then
  rm -rf "$DOWNLOAD_DIR"
  echo "已清理。"
fi

echo
if [ "$missing" -eq 0 ]; then
  echo "✓ 全部就绪！运行 pnpm check-assets 复核，然后打开客户端 #assets 页查看原版素材。"
else
  echo "⚠ 部分文件缺失，请把上面的输出发给 Claude 排查。"
fi
