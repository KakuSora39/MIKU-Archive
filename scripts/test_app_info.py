"""The web UI and app package derive their version from one manifest."""
import json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
info=json.loads((root/'app-info.json').read_text())
assert re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+',info['version'])
assert isinstance(info['build'],int) and info['build']>0
js=(root/'miku-live-archive/dist/app-info.js').read_text()
assert json.loads(js.split('const APP_INFO = ',1)[1].rstrip().removesuffix(';'))==info
print('PASS: single X.X.X version manifest and web metadata')

versions=[info['version']]+[entry['version'] for entry in info.get('history',[])]
assert len(versions)==len(set(versions)), 'Duplicate versions in changelog'
assert all(re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+',version) for version in versions)
assert all(entry['changes'] for entry in info.get('history',[]))
print('PASS: unique version history with nonempty release entries')
