#!/bin/bash
# Easy Edit: sync this folder into your local repo, commit + push to GitHub, build the app, install it.
# Run it again with a newer package to update. Safe to re-run.
#
#   EASY_EDIT_DIR   where the local repo lives   (default: ~/Developer/Easy-edit)
#   EASY_EDIT_NO_PUSH=1   commit but don't push
set -euo pipefail

REPO_URL="https://github.com/Maimai-l/Easy-edit.git"
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${EASY_EDIT_DIR:-$HOME/Developer/Easy-edit}"
VERSION="$(cat "$SRC/VERSION")"

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
note() { printf '  %s\n' "$1"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$1"; exit 1; }

bold "1/4 检查工具"
xcode-select -p >/dev/null 2>&1 || fail "没有找到 Xcode 命令行工具。先运行：xcode-select --install，装好后再运行这个脚本。"
command -v swiftc >/dev/null || fail "没有找到 swiftc（它属于 Xcode 命令行工具）。"
command -v git >/dev/null || fail "没有找到 git。"
note "swiftc: $(swiftc --version 2>&1 | head -1)"

bold "2/4 同步代码到 $DEST"
if [ "$SRC" != "$DEST" ]; then
  if [ -e "$DEST" ] && [ ! -d "$DEST/.git" ]; then
    fail "$DEST 已经存在但不是 git 仓库。换个位置：EASY_EDIT_DIR=/你想放的路径 bash \"$0\""
  fi
  if [ ! -d "$DEST/.git" ]; then
    mkdir -p "$(dirname "$DEST")"
    if git clone -q "$REPO_URL" "$DEST" 2>/dev/null; then
      note "已克隆 $REPO_URL"
    else
      note "克隆失败，改为新建本地仓库并关联远程"
      mkdir -p "$DEST" && git -C "$DEST" init -q && git -C "$DEST" remote add origin "$REPO_URL"
    fi
  fi
  rsync -a --exclude .git --exclude build --exclude node_modules --exclude .DS_Store "$SRC/" "$DEST/"
  note "已复制文件"
else
  note "就在仓库里运行，跳过同步"
fi

cd "$DEST"
git add -A
if git diff --cached --quiet; then
  note "代码没有变化，不用提交"
elif [ -z "$(git config user.name || true)" ] || [ -z "$(git config user.email || true)" ]; then
  note "git 还没设置用户名和邮箱，这次先不提交。设置方法："
  note "  git config --global user.name \"你的名字\"; git config --global user.email \"你的邮箱\""
  note "设置好后重新运行这个脚本即可。"
else
  git commit -q -m "Easy Edit $VERSION"
  note "已提交：Easy Edit $VERSION"
fi

if git rev-parse --verify -q HEAD >/dev/null; then
  git branch -M main
  if [ "${EASY_EDIT_NO_PUSH:-}" = "1" ]; then
    note "按要求跳过推送"
  elif git push -q -u origin main; then
    note "已推送到 $REPO_URL"
  else
    note "推送没有成功（多半是还没登录 GitHub）。App 照常安装；登录后在 $DEST 里运行 git push 即可。"
  fi
fi

bold "3/4 编译 App"
APP_BUILT="$(bash "$DEST/build.sh" | tail -1)"
note "编译完成：$DEST/$APP_BUILT"

bold "4/4 安装"
TARGET="/Applications"
[ -w "$TARGET" ] || { TARGET="$HOME/Applications"; mkdir -p "$TARGET"; }
pkill -x EasyEdit 2>/dev/null && sleep 0.5 || true
rm -rf "$TARGET/Easy Edit.app"
ditto "$DEST/$APP_BUILT" "$TARGET/Easy Edit.app"
note "已安装到 $TARGET/Easy Edit.app"
open "$TARGET/Easy Edit.app"

bold "完成。工作目录：~/Easy Edit"
