"""Merge attributed tour-level facts into stable event IDs; never infer BD releases."""
import json
from pathlib import Path
VOCA='https://voca.wiki/初音未来/演唱会#大型演唱会列表'
MIKU='https://mikutime.link/setlists/'

def enrich_catalog(rows, root):
    snapshot=json.loads((root/'scripts/references/mikutime-concert-index.json').read_text())
    tours=snapshot['concerts']
    mapping={
      'MIKUFES09':[2],'SANKYUGD':[3],'MP2011Tokyo':[4],'Mikunopolis':[5],'MP2011Sapporo':[6],'MP2011SG':[8],
      'MP2012Tokyo':[9,10],'SANKYUGDF':[11,12],'MP2012HKTW':[14,15],'MP2013Sapporo':[16],'MP2013Kansai':[17],
      'MM2013':[18],'ME2014IN':[19],'MM2014':[20,21],'ME2014LANY':[22,23],'SM2015':[24],'ME2015':[25],
      'MM2015':[26],'ME2016JP':list(range(27,32)),'ME2016NA':list(range(32,42)),'ME2016TW':[42],
      'MM2016':[44],'ME2016CN':[45,46],'KODO2017':[47],'MM2017':[49],'MWY2017':[50],'ME2017MY':[51],
      'SM2018':[52],'MM2018':[53,54],'MWY2018':[55,56,57],'ME2018EU':[58,59,60],
      'SM2019':[61],'ME2019TWHK':[62,64],'MM2019':[65,66],'MWY2019':[68,69,70,71],
      'ME2020EU':list(range(72,77)),'ZERO':[77],'MM2020':[78,79],'MWY2020':[80],'ME2021':[81],
      'MM2021':[82,83],'MWY2021':[84],'MM2022':[85,86],'MEREWINDPLUS':[87],'MM10Sapporo':[88],
      'Thunderbolt':list(range(89,94)),'KODO2023':[94],'MM2023':[96,97],'ME2023VR':[98],'MIKUFES24':[99],
      'ME2024NA':list(range(100,117)),'MWY2024':[117,118,119],'MM2024':[120,121,122],
      'ME2024EU':list(range(123,129)),'ME2024NZAU':list(range(129,134))}
    aliases={'GALAXY2020':'galaxy-2020','GALAXY2021':'galaxy-2021','ME2018NA':'expo-2018-na',
      'Blooming':'blooming-2025','MM2025':'mirai-2025','ME2025':'expo-2025','MWY2025':'mwy-2025',
      'LAWSON':'primary-40','DECO':'primary-42','VOLTAGE':'primary-41','MM2026':'primary-14','SM2027':'primary-23'}
    # Resolve primary IDs from names/series rather than assuming their old position.
    special={'LAWSON':'LAWSON 50th','DECO':'DECO*27','VOLTAGE':'宝可梦','MM2026':'魔法未来','SM2027':'SNOW MIKU LIVE'}
    for tour,series in special.items():
        year=2027 if tour=='SM2027' else 2026
        candidates=[r for r in rows if r['series']==series and r['year']==year]
        if len(candidates)==1:aliases[tour]=candidates[0]['id']
    series_map={'MIKU_EXPO':'MIKU EXPO','MAGICAL_MIRAI':'魔法未来','SNOW_MIKU':'SNOW MIKU LIVE','MIKU_WITH_YOU':'未来有你','KODO':'初音未来×鼓童','ANNIVERSARY':'Piapro 关联演出','NO_SERIES':'嘉宾 / 联合演出'}
    for r in rows:
        r['sources']=[{'label':'原有资料来源','url':r['source']}]
        if r.get('sourceIndex'):
            r['sources'].append({'label':f'Vocawiki 逐场表 #{r["sourceIndex"]}','url':VOCA})
        r['level']='城市 / 场次' if r.get('sourceIndex') else '年度 / 项目'
    for t in tours:
        targets=[r for r in rows if r.get('sourceIndex') in mapping.get(t['tour'],[])]
        if not targets and t['tour'] in aliases: targets=[r for r in rows if r['id']==aliases[t['tour']]]
        if not targets:
            r=dict(id='mikutime-'+t['tour'],year=int(t['date'][:4]),series=series_map.get(t['series'],'其他专场'),name=t['name'],date='待核实',city='待核实',venue='待核实',kind='专场 / 巡演',status='社区目录收录',verification='社区数据 · 待官方复核',source=MIKU,reference=VOCA,notes='MikuTime 巡演 / 项目级记录；不将歌单变体当成独立演出。',collectionIds=[],sources=[],level='巡演 / 项目')
            if t['tour'] in ['KAGA14','MK15']:r.update(kind='Piapro 关联演出',notes='Piapro 角色关联演出，不代表初音未来本人登台；与初音主演演出区分。')
            if t['tour']=='GAGA':r.update(kind='嘉宾参演',city='北美巡演（各站待补）')
            if t['tour']=='MEREWIND':r.update(kind='线上演出',city='线上')
            rows.append(r);targets=[r]
        for r in targets:
            r.setdefault('tourRefs',[]).append(dict(tour=t['tour'],name=t['name'],date=t['date'],last_date=t['last_date'],vocadbId=t['vocadbId'],source=snapshot['source']))
            r.setdefault('sources',[]).extend([{'label':'MikuTime 歌单目录','url':MIKU},{'label':'MikuTime 公开数据源码（快照见目录文件）','url':snapshot['source']}])
            if r['date']=='待核实':
                r['date']=t['date']+(' — '+t['last_date'] if t['last_date'] else '')+'（社区数据，待核实）'
            # Dates at tour scope are retained independently; do not overwrite city schedules.
            if t['tour']=='MEREWINDPLUS':r['name']='MIKU EXPO Rewind+ 2022';r['notes']+=' 与 2022-06-05 的 Rewind 分开建档。'
            if t['tour']=='ME2023VR':r['notes']+=' 来源日期差异：百科为 2023-11-12，MikuTime 为 2023-11-11；可能涉及放送时区，待官方复核。'
            if t['tour']=='ME2015':r['notes']+=' 来源日期差异：百科为 6/27–28，MikuTime 为 6/26–27；保留原值，待官方复核。'
    # The three extra Vocawiki rows enrich existing records, keeping personal-mark IDs stable.
    for idx,tour,city,venue,date in [(134,'LAWSON','日本横滨','横滨 Arena','2026-01-17 — 01-18'),(135,'DECO','日本东京','国立代代木竞技场第一体育馆','2026-02-14'),(136,'VOLTAGE','日本千叶','LaLa arena TOKYO-BAY','2026-03-20 — 03-22')]:
        r=next(r for r in rows if any(t['tour']==tour for t in r.get('tourRefs',[])))
        r.update(city=city,venue=venue,date=date,vocaIndex=idx)
        r['sources'].append({'label':f'Vocawiki 逐场表 #{idx}','url':VOCA})
        r['notes']+=' 城市、场馆来自 Vocawiki，未由本次官方复核；不推断 BD 状态。'
    for id,year,series,name in [('symphony-2026',2026,'初音未来交响乐','Miku Symphony 2026'),('colorful-4',2024,'COLORFUL LIVE','COLORFUL LIVE 4th -Unison-（2024–2025）'),('colorful-5',2025,'COLORFUL LIVE','COLORFUL LIVE 5th -Frontier-（2025–2026）')]:
        rows.append(dict(id=id,year=year,series=series,name=name,date='待核实',city='待核实',venue='待核实',kind='联动 / 交响乐' if '交响乐' in series else '联动演出',status='百科系列目录',verification='待补场次与官方核实',source=VOCA,reference=VOCA,notes='Vocawiki 系列目录新增项目；跨年项目按首年归档。',collectionIds=[],sources=[{'label':'Vocawiki 系列目录','url':VOCA}],level='年度 / 项目'))
    assert len({r['id'] for r in rows})==len(rows)
    assert {t['tour'] for t in tours}=={ref['tour'] for r in rows for ref in r.get('tourRefs',[])}
    return tours
