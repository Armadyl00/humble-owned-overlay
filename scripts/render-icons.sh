#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for size in 16 32 48 96 128; do
  rsvg-convert --width "$size" --height "$size" \
    --output "$repo_root/icons/icon-$size.png" "$repo_root/icons/icon.svg"
done
