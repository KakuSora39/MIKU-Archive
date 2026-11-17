"""Build the atlas from the user-reviewed CSV. Never filter out incomplete entries."""
import csv
import json
from source_policy import resolve_sources, direct_website, official, research_rank
from copy import deepcopy
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
                    if official(url): event['officialLinks'].append(dict(url=url,label='日期 / 地点官方依据',scope='资料依据'))
                    elif url not in [ref['url'] for ref in event['sourceReferences']]:
                        event['sourceReferences'].append(dict(url=url,label='日期 / 地点补充依据',kind='record',priority=research_rank(url)))
            event['sourceReferences'].sort(key=lambda ref: ref['priority'])
            event['officialUrl'], event['websiteScope'] = direct_website(event)
            event['source'] = event['officialUrl'] or event['researchSource']
            events.append(event)
    if len({event['id'] for event in events}) != len(events):
        raise ValueError('Duplicate event IDs in live-catalog.csv')
    source_count = len(events)
    station_groups = json.loads((REFERENCES / 'event-stations.json').read_text(encoding='utf-8'))
    original_ids = {event['id'] for event in events}
    if station_groups.keys() - original_ids:
        raise ValueError('Station groups reference missing source projects')
    projects, expanded = [], []
    for event in events:
        if event['id'] not in station_groups:
            expanded.append(event)
            continue
        project = deepcopy(event)
        project['level'] = '巡演 / 年度项目资料（城市站另列）'
        project['status'] = '项目资料' if station_groups[event['id']] else '站点待补'
        project['stationIds'] = []
        for stop in station_groups[event['id']]:
            station = deepcopy(event)
            for key in ['schedule','sourceIndex','vocaIndex','websiteUrl']:
                station.pop(key, None)
            station.update({key: value for key, value in stop.items() if key != 'key'})
            station['id'] = event['id'] + '--' + stop['key']
            station['parentId'] = event['id']
            station['name'] = stop.get('name', event['name'] + ' · ' + stop['city'])
            station['year'] = int(stop['date'][:4])
            station['level'] = '城市站'
            station['status'] = '独立城市站'
            station['notes'] = stop.get('notes', '同站连续演出日期合并维护；原巡演资料、旧标记与备注见关联项目。')
            station['verification'] = '城市站独立建档；影像发行及出演细节仍按各自证据核实。' + (' 日期待核实。' if '待' in stop['date'] else '')
            for url in stop.get('detailSources', []):
                if official(url) and url not in [ref['url'] for ref in station['officialLinks']]:
                    station['officialLinks'].append(dict(url=url,label='该站官方日程 / 场馆依据',scope='城市站资料'))
            project['stationIds'].append(station['id'])
            expanded.append(station)
        projects.append(project)
    events = expanded
    if len({event['id'] for event in events}) != len(events):
        raise ValueError('Duplicate station IDs')
    tours = json.loads((REFERENCES / 'mikutime-concert-index.json').read_text())['concerts']
    catalog = dict(version=5, sourceCount=source_count, projects=projects, updated='2026-11-17',
        coverage=f'以 {source_count} 条审阅底稿为基础，将已知城市站独立建档。当前 {len(events)} 条演出档案、{len(projects)} 条项目资料；同站连续日期仍合并记录，档案数量不等于演出场次数。旧项目记录及未拆分线索保留在项目资料中。',
        sources=[dict(label='VocaDB（优先检索）',url='https://vocadb.net/'),dict(label='Vocaloid Wiki（其次）',url='https://vocaloid.fandom.com/'),dict(label='新创华：未来有你历届官方记录',url='https://www.scla.com.cn/Cn/Index/pageView/catid/15/ip/16.html'),dict(label='Crypton 官方活动目录',url='https://piapro.net/intl/en_event.html'),dict(label='MIKU EXPO 官方历史',url='https://mikuexpo.com/history'),dict(label='Vocawiki 辅助目录',url='https://voca.wiki/初音未来/演唱会'),dict(label='MikuTime 辅助巡演索引',url='https://mikutime.link/setlists/')],
        tourRecords=[tour for tour in tours if tour['tour'] not in {'KAGA14','MK15'}], events=events)
    return catalog

if __name__ == '__main__':
    catalog = build_catalog()
    (WEB / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Built {len(catalog['events'])} event records and {len(catalog['projects'])} preserved projects")
