#!/bin/bash
# One-time fix for double-encoded Dropbox token in rclone.conf
set -e

echo "[NikkoMusicHub] 更新 rclone.py 並修復 rclone.conf..."

# Update rclone.py from latest main
rm -rf /tmp/nikkoupdate
git clone --depth 1 --branch main https://github.com/s7808200772/nikkomusichub.git /tmp/nikkoupdate
sudo systemctl stop nikko-music-hub-web nikko-music-mqtt
sudo cp /tmp/nikkoupdate/app/services/rclone.py /srv/nikko-music/app/services/rclone.py
sudo touch /srv/nikko-music/app/services/rclone.py
sudo rm -rf /srv/nikko-music/app/services/__pycache__

# Fix existing rclone.conf if it is double-encoded
python3 << 'PYEOF'
import json
import re
from pathlib import Path

p = Path('/srv/nikko-music/data/rclone.conf')
if not p.exists():
    print('rclone.conf 不存在，請到網頁重新儲存 token')
    exit(0)

content = p.read_text(encoding='utf-8')
m = re.search(r'^token = (.+)$', content, re.MULTILINE)
if not m:
    print('找不到 token 行')
    exit(0)

token_str = m.group(1).strip()
# Unwrap as many layers of JSON-string encoding as needed
while token_str.startswith('"') and token_str.endswith('"'):
    token_str = json.loads(token_str)

token = json.loads(token_str)
new_content = re.sub(
    r'^token = .+$',
    'token = ' + json.dumps(token),
    content,
    flags=re.MULTILINE
)
p.write_text(new_content, encoding='utf-8')
print('rclone.conf 已修復')
PYEOF

sudo systemctl restart nikko-music-hub-web nikko-music-mqtt

echo "[NikkoMusicHub] 完成。請重新整理瀏覽器並測試 Dropbox 連線。"
