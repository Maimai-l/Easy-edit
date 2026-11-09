#!/bin/bash
# Compile the Swift shell and assemble "build/Easy Edit.app". Needs only the Xcode Command Line Tools.
set -euo pipefail
cd "$(dirname "$0")"
VERSION="$(cat VERSION)"
APP="build/Easy Edit.app"
rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -O -swift-version 5 -target "$(uname -m)-apple-macos12.0" \
  -framework Cocoa -framework WebKit \
  -o "$APP/Contents/MacOS/EasyEdit" app/main.swift
sed "s/__VERSION__/$VERSION/g" app/Info.plist > "$APP/Contents/Info.plist"
cp app/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
cp -R web "$APP/Contents/Resources/web"
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true
echo "$APP"
