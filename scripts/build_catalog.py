"""Build the atlas from the user-reviewed CSV. Never filter out incomplete entries."""
import csv
import json
from source_policy import resolve_sources, direct_website
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'miku-live-archive/dist'
REFERENCES = ROOT / 'scripts/references'

def build_catalog():
    metadata = json.loads((REFERENCES / 'catalog-links.json').read_text(encoding='utf-8'))
    snapshot = json.loads((REFERENCES / "vocadb-event-links.json").read_text(encoding="utf-8"))
    manual = json.loads((REFERENCES / "official-link-overrides.json").read_text(encoding="utf-8"))
    details = json.loads((REFERENCES / "event-details.json").read_text(encoding="utf-8"))
    events = []
    with (REFERENCES / 'live-catalog.csv').open(encoding='utf-8-sig', newline='') as file:
        for row in csv.DictReader(file):
            if not row['id'] or not row['name'] or not row['series']:
                raise ValueError('Every entry needs a stable id, name and series')
            event = dict(metadata.get(row['id'], {}))
            event.update({key: row.get(key, '').strip() for key in ['id','series','name','date','city','venue','kind']})
            event['year'] = int(row['year'])
            event['officialUrl'] = row.get('official_reference', '').strip()
            event['source'] = event['officialUrl'] or row.get('source', '').strip()
            event['researchSource'] = row.get('source', '').strip()
            event['verification'] = row.get('review', '').strip() or '待核实'
            event['notes'] = row.get('note', '').strip()
            event['status'] = '检索底稿收录'
            event.setdefault('level', '项目 / 场次，详见记录')
            event.setdefault('collectionIds', [])
            event.setdefault('tourRefs', [])
            event['sources'] = [dict(label='官网 / 主办方参考', url=event['officialUrl'])] if event['officialUrl'] else []
            if event['researchSource'] and event['researchSource'] != event['officialUrl']:
                event['sources'].append(dict(label='检索线索来源', url=event['researchSource']))
            enrichment = details.get(event['id'], {})
            event.update(enrichment)
            event['officialLinks'], event['sourceReferences'] = resolve_sources(event, snapshot, manual)
            for url in event.get('detailSources', []):
                if url not in [ref['url'] for ref in event['officialLinks']]:
                    from source_policy import official, research_rank
                    if official(url): event['officialLinks'].append(dict(url=url,label='日期 / 地点官方依据',scope='资料依据'))
                    elif url not in [ref['url'] for ref in event['sourceReferences']]:
                        event['sourceReferences'].append(dict(url=url,label='日期 / 地点补充依据',kind='record',priority=research_rank(url)))
            event['sourceReferences'].sort(key=lambda ref: ref['priority'])
            event['officialUrl'], event['websiteScope'] = direct_website(event)
            event['source'] = event['officialUrl'] or event['researchSource']
            events.append(event)
    if len({event['id'] for event in events}) != len(events):
        raise ValueError('Duplicate event IDs in live-catalog.csv')
    tours = json.loads((REFERENCES / 'mikutime-concert-index.json').read_text())['concerts']
    catalog = dict(version=4, updated='2026-11-17',
        coverage='以用户审阅的 195 条检索底稿为初始目录。城市站、巡演、年度项目及边界活动分别注明；资料缺项不隐藏条目。候选记录数量不等于实际演出场数，仍可持续修订。',
        sources=[dict(label='VocaDB（优先检索）',url='https://vocadb.net/'),dict(label='Vocaloid Wiki（其次）',url='https://vocaloid.fandom.com/'),dict(label='新创华：未来有你历届官方记录',url='https://www.scla.com.cn/Cn/Index/pageView/catid/15/ip/16.html'),dict(label='Crypton 官方活动目录',url='https://piapro.net/intl/en_event.html'),dict(label='MIKU EXPO 官方历史',url='https://mikuexpo.com/history'),dict(label='Vocawiki 辅助目录',url='https://voca.wiki/初音未来/演唱会'),dict(label='MikuTime 辅助巡演索引',url='https://mikutime.link/setlists/')],
        tourRecords=[tour for tour in tours if tour['tour'] not in {'KAGA14','MK15'}], events=events)
    return catalog

if __name__ == '__main__':
    catalog = build_catalog()
    (WEB / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Built {len(catalog['events'])} entries from reviewed CSV; no completeness filter")
