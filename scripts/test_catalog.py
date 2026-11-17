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
projects=c['projects']
source_records=[e for e in es if not e.get('parentId')]+projects
assert c['sourceCount']==len(source_records)==len(approved)==195
assert len(es)==263 and len(projects)==27
assert {e['id'] for e in source_records}=={e['id'] for e in approved}
assert not {e['id'] for e in projects} & {e['id'] for e in es}
assert sum(len(p['stationIds']) for p in projects)==95
for project in projects:
    stations=[e for e in es if e.get('parentId')==project['id']]
    assert {e['id'] for e in stations}==set(project['stationIds'])
    assert all(e['level']=='城市站' and ' / ' not in e['city'] for e in stations)
    assert len({e['city'] for e in stations})==len(stations)

assert len({e['id'] for e in es})==len(es)
assert not {'mikutime-KAGA14','mikutime-MK15'} & {e['id'] for e in es}
assert {e['year'] for e in es if e['series']=='未来有你'}=={2017,2018,2019,2020,2021,2024,2025,2026}
assert any('待' in e['date'] or '待' in e['venue'] for e in es)
assert {e['sourceIndex'] for e in es if 'sourceIndex' in e}==set(range(1,134))
seed=json.loads((root/'miku-live-archive/dist/seed.json').read_text())
assert all(id in {r['id'] for r in seed} for e in es for id in e['collectionIds'])
assert sum(r['collected']=='已收集' for r in seed)==13
print('PASS: 263 event records, 27 preserved projects, all 195 source IDs retained, MWY and stable BD links')

from source_policy import research_rank, official
assert research_rank('https://vocadb.net/E/1')==1
assert research_rank('https://vocaloid.fandom.com/wiki/Test')==2
assert research_rank('https://mzh.moegirl.org.cn/Test')==3
assert research_rank('https://voca.wiki/Test')==4
assert not official('https://vocaloid.fandom.com/wiki/Test')
for event in es+projects:
    assert event['officialLinks']
    assert 'blog.piapro.net' not in event['officialUrl']
    assert '/intl/en_event' not in event['officialUrl']
    assert event['sourceReferences'][0]['priority']==1
    assert [ref['priority'] for ref in event['sourceReferences']]==sorted(ref['priority'] for ref in event['sourceReferences'])
    assert all(ref['kind'] in {'record','search','unavailable'} for ref in event['sourceReferences'])
print('PASS: official references for events and projects, VocaDB/Wiki/Moegirl source priority, explicit lookup labels')

byid={e['id']:e for e in es+projects}
assert byid['primary-26']['city']=='日本札幌'
assert byid['primary-26']['venue']=='Zepp Sapporo'
assert len(byid['mikutime-ME2026NA']['schedule'])==15
assert byid['moegirl-stage-051']['venue']=='Axiata Arena(Bukit Jalil)'
assert byid['expo-2025']['officialUrl']=='https://mikuexpo.com/asia2025/index.html'
assert '11-27' in byid['mikutime-ME2026EU']['date']
print('PASS: source-backed venues, direct official links, tour schedules')

assert len(byid['primary-14']['stationIds'])==3
assert len(byid['expo-2025']['stationIds'])==8
assert len(byid['mikutime-ME2026NA']['stationIds'])==15
assert len(byid['mikutime-ME2026EU']['stationIds'])==8
assert byid['primary-14--tokyo']['date']=='2026-08-28 — 08-30'
assert byid['mikutime-MWY2026--chengdu']['venue']=='成都金融城演艺中心'
assert byid['mikutime-MWY2026--chengdu']['date']=='2026-12-26'
assert byid['colorful-5--tokyo']['year']==2026
assert byid['symphony-2018--osaka']['year']==2019
assert not byid['mikutime-GAGA']['stationIds']
html=(root/'miku-live-archive/dist/index.html').read_text()
assert '从 2009 年的舞台足迹，到下一次相遇。' in html
assert '记录每一次登台' in html
assert '只收藏完整 Live' not in html and '不单独收集单曲字幕封装' not in html
print('PASS: independent cities, cross-year dates, unknown tour preservation, atlas copy')
