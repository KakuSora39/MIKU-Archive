"""Reviewed CSV is authoritative; keep stable links and all incomplete entries."""
import csv
import json
from pathlib import Path
from build_catalog import build_catalog
root=Path(__file__).resolve().parents[1]
c=build_catalog()
saved=json.loads((root/'miku-live-archive/dist/catalog.json').read_text())
assert saved==c, 'Generated catalog is stale'
with (root/'scripts/references/live-catalog.csv').open(encoding='utf-8-sig',newline='') as f: approved=list(csv.DictReader(f))
es=c['events']
assert len(es)==len(approved)==195
assert {e['id'] for e in es}=={e['id'] for e in approved}
assert len({e['id'] for e in es})==len(es)
assert not {'mikutime-KAGA14','mikutime-MK15'} & {e['id'] for e in es}
assert {e['year'] for e in es if e['series']=='未来有你'}=={2017,2018,2019,2020,2021,2024,2025,2026}
assert any('待' in e['date'] or '待' in e['venue'] for e in es)
assert {e['sourceIndex'] for e in es if 'sourceIndex' in e}==set(range(1,134))
seed=json.loads((root/'miku-live-archive/dist/seed.json').read_text())
assert all(id in {r['id'] for r in seed} for e in es for id in e['collectionIds'])
assert sum(r['collected']=='已收集' for r in seed)==13
print('PASS: all 195 approved rows, incomplete entries retained, MWY complete, stable IDs/BD links')

from source_policy import research_rank, official
assert research_rank('https://vocadb.net/E/1')==1
assert research_rank('https://vocaloid.fandom.com/wiki/Test')==2
assert research_rank('https://mzh.moegirl.org.cn/Test')==3
assert research_rank('https://voca.wiki/Test')==4
assert not official('https://vocaloid.fandom.com/wiki/Test')
for event in es:
    assert event['officialUrl'] and event['officialLinks']
    assert event['sourceReferences'][0]['priority']==1
    assert [ref['priority'] for ref in event['sourceReferences']]==sorted(ref['priority'] for ref in event['sourceReferences'])
    assert all(ref['kind'] in {'record','search','unavailable'} for ref in event['sourceReferences'])
print('PASS: official references for 195 entries, VocaDB/Wiki/Moegirl source priority, explicit lookup labels')
