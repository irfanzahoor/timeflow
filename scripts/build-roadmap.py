#!/usr/bin/env python3
"""Generate browser data from the canonical JSON; no server fetch required."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / 'data/roadmap_days.json').read_text(encoding='utf-8'))
output = ROOT / 'js/data/roadmap-days.js'
output.write_text(
    '// Generated from data/roadmap_days.json. Do not edit directly.\n'
    '// Regenerate with: python3 scripts/build-roadmap.py\n'
    'const ROADMAP_DAYS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n',
    encoding='utf-8',
)
print('Generated js/data/roadmap-days.js')
