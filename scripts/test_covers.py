"""Offline checks for reviewed artwork, stable bindings and shipped images."""
import hashlib,json,re,struct
from pathlib import Path
from build_catalog import build_catalog
root=Path(__file__).resolve().parents[1]
m=json.loads((root/'scripts/references/event-covers.json').read_text())
c=build_catalog()
assert c==json.loads((root/'miku-live-archive/dist/catalog.json').read_text()), 'Rebuild catalog'
rows=c['events']+c['projects']
assert len(rows)==290 and len({e['id'] for e in rows})==290
assert set(m['events'])=={e['id'] for e in rows}
assert c['defaultCover']=='miku-kei' and m['assets']['miku-kei']['kind']=='generic'
for key,a in m['assets'].items():
 assert re.fullmatch(r'covers/[a-z0-9-]+\.png',a['file'])
 assert a['sourceUrl'].startswith('https://') and a['imageUrl'].startswith(('https://','http://'))
 assert a['credit'] and a['label'] and a['checkedAt']
 data=(root/'miku-live-archive/dist'/a['file']).read_bytes()
 assert data.startswith(b'\x89PNG\r\n\x1a\n') and hashlib.sha256(data).hexdigest()==a['sha256'],key
 w,h=struct.unpack('>II',data[16:24]);assert 0<w<=640 and 0<h<=640,(key,w,h)
 assert (w,h)==(a['width'],a['height'])
 assert 'focus' not in a, 'Bundled images must retain their original composition'
 if 'frame' in a:
  frame=a['frame'];assert abs(frame['x'])<=100 and abs(frame['y'])<=100 and .75<=frame['zoom']<=3
for e in rows:
 assert e['coverKey'] in m['assets']
 if e['coverKey']=='miku-kei':assert e['coverNote'],e['id']
byid={e['id']:e for e in rows}
assert byid['primary-14--hamamatsu']['coverKey']=='mirai-2026'
assert byid['moegirl-stage-088']['coverKey']=='mirai-2022', '10th Sapporo is 2022 artwork'
assert byid['symphony-2018--osaka']['coverKey']=='symphony-2018', 'Cross-year series'
assert byid['symphony-2020--osaka']['coverKey']!=byid['symphony-2020--yokohama']['coverKey']
assert byid['symphony-2023--yokohama']['coverKey']=='miku-kei', 'Do not copy Tokyo variant'
assert byid['mikutime-MWY2026--shanghai']['coverKey']=='mwy-2026'
assert byid['colorful-2022']['coverKey']=='colorful-1st-link'
assert 'kv_chara-5.png' in m['assets']['colorful-1st-link']['imageUrl'], 'Miku, not Rin or Len'
assert m['assets']['mwy-2024']['sourceUrl']=='https://blog.piapro.net/2024/06/zh2406141.html', 'Reject timeline image marked 2023'
count=sum(e['coverKey']!='miku-kei' for e in c['events'])
print(f'PASS: {len(m["assets"])} decoded-image manifests; {count}/263 event visuals, {263-count} explicit generic fallbacks; all 290 IDs covered')
