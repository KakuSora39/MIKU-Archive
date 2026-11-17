"""Generate an event atlas from attributed factual index data, without inferring BD availability."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'miku-live-archive/dist'
original='https://mzh.moegirl.org.cn/初音未来/演唱会'
mirror='https://moegirl.uk/初音未来'
series_source='https://moegirl.uk/初音未来/演唱会'
rows=[]
def event(n,year,series,title,date,city,venue='待核实',**kw):
 rows.append(dict(id=f'moegirl-stage-{n:03}',year=year,series=series,name=title,date=date,city=city,venue=venue,kind='线上演出' if '线上' in city else ('嘉宾参演' if series=='嘉宾 / 联合演出' else '专场 / 巡演'),status='百科收录',verification='百科线索 · 未逐场官方复核',source=mirror,reference=original,sourceIndex=n,notes='',collectionIds=[],**kw))
def block(text):
 for line in text.strip().splitlines():
  n,y,s,t,d,c,v=line.split('|');event(int(n),int(y),s,t,d,c,v)
block('''1|2009|嘉宾 / 联合演出|Animelo Summer Live 2009 -RE:BRIDGE-|2009-08-22|日本埼玉|埼玉超级竞技场
2|2009|MIKUFES|ミクFES'09(夏)|2009-08-31|日本东京|Studio Coast
3|2010|感谢祭 / MIKUPA|ミクの日感謝祭 39’s Giving Day|2010-03-09|日本东京|Zepp Tokyo
4|2011|感谢祭 / MIKUPA|MIKUPA 2011 東京|2011-03-09|日本东京|Zepp Tokyo
5|2011|MIKUNOPOLIS|MIKUNOPOLIS in LOS ANGELES|2011-07-02|美国洛杉矶|NOKIA Theater
6|2011|感谢祭 / MIKUPA|MIKUPA 2011 札幌|2011-08-16 — 08-17|日本札幌|札幌市文化教育会馆大厅
7|2011|感谢祭 / MIKUPA|MIKUPA 2011 Bangkok|2011-10-30（百科原表，举办状态待核实）|泰国曼谷|待核实
8|2011|感谢祭 / MIKUPA|MIKUPA 2011 Singapore|2011-11-11|新加坡|Suntec Exhibition Hall 402
9|2012|感谢祭 / MIKUPA|ミクの日大感謝祭 · ミクパ 昼场|2012-03-08|日本东京|TOKYO DOME CITY HALL
10|2012|感谢祭 / MIKUPA|ミクの日大感謝祭 · ミクパ 夜场|2012-03-08|日本东京|TOKYO DOME CITY HALL
11|2012|感谢祭 / MIKUPA|最後のミクの日感謝祭|2012-03-09|日本东京|TOKYO DOME CITY HALL
12|2012|感谢祭 / MIKUPA|最後のミクの日感謝祭 Final|2012-03-09|日本东京|TOKYO DOME CITY HALL
13|2012|其他专场|夏の終わりの39祭り|2012-08-29|日本横滨|户外演出
14|2012|感谢祭 / MIKUPA|MIKUPA 香港首次演唱会|2012-10-02|中国香港|KITEC Star Hall
15|2012|感谢祭 / MIKUPA|MIKUPA 台湾首次演唱会|2012-10-06|中国台北|台北展演二馆
16|2013|感谢祭 / MIKUPA|MIKUPA 2013 in Sapporo|2013-02-09 — 02-10|日本札幌|札幌市民ホール
17|2013|感谢祭 / MIKUPA|MIKUPA 2013 in Kansai|2013-03-09|日本和歌山|和歌山ビッグホエール
18|2013|魔法未来|MAGICAL MIRAI 2013|2013-08-30|日本横滨|横滨 Arena
19|2014|MIKU EXPO|MIKU EXPO 2014 Indonesia|2014-05-28 — 05-29|印度尼西亚雅加达|Jakarta Convention Center
20|2014|魔法未来|MAGICAL MIRAI 2014 大阪|2014-08-30|日本大阪|INTEX 大阪 5号馆
21|2014|魔法未来|MAGICAL MIRAI 2014 东京|2014-09-20|日本东京|东京体育馆
22|2014|MIKU EXPO|MIKU EXPO 2014 Los Angeles|2014-10-11 — 10-12|美国洛杉矶|NOKIA Theater
23|2014|MIKU EXPO|MIKU EXPO 2014 New York|2014-10-17 — 10-18|美国纽约|Hammerstein Ballroom
24|2015|SNOW MIKU LIVE|SNOW MIKU LIVE! 2015|2015-02-07 — 02-08|日本札幌|Zepp Sapporo
25|2015|MIKU EXPO|MIKU EXPO 2015 Shanghai|2015-06-27 — 06-28|中国上海|上海风云电竞馆
26|2015|魔法未来|MAGICAL MIRAI 2015|2015-09-04 — 09-06|日本东京|日本武道馆''')
for n,city,d,v in [(27,'福冈','03-23 — 03-24','Zepp Fukuoka'),(28,'大阪','03-29','Zepp Namba'),(29,'名古屋','03-31','Zepp Nagoya'),(30,'札幌','04-05','Zepp Sapporo'),(31,'东京','04-09 — 04-10','Zepp Tokyo')]:event(n,2016,'MIKU EXPO',f'MIKU EXPO 2016 Japan Tour · {city}','2016-'+d,'日本'+city,v)
for n,city,d,v in [(32,'美国西雅图','04-23','WaMu Theater'),(33,'美国旧金山','04-30','The Warfield'),(34,'美国洛杉矶','05-06','Microsoft Theater'),(35,'美国达拉斯','05-14','The Bomb Factory'),(36,'美国休斯敦','05-17','NRG Arena'),(37,'加拿大多伦多','05-20','Sony Centre'),(38,'美国芝加哥','05-25','The Chicago Theatre'),(39,'美国纽约','05-28','Hammerstein Ballroom'),(40,'墨西哥蒙特雷','06-01','Auditorio Banamex'),(41,'墨西哥墨西哥城','06-04 — 06-05','El Plaza Condesa')]:event(n,2016,'MIKU EXPO','MIKU EXPO 2016 North America · '+city,'2016-'+d,city,v)
block('''42|2016|MIKU EXPO|MIKU EXPO 2016 Taiwan|2016-06-25 — 06-26|中国台湾新北|新北市工商展览中心
43|2016|初音未来交响乐|Miku Symphony 2016|2016-08-27|日本东京|东京国际论坛 Hall A
44|2016|魔法未来|MAGICAL MIRAI 2016|2016-09-09 — 09-11|日本千叶|幕张 Messe 9号馆
45|2016|MIKU EXPO|MIKU EXPO 2016 China Tour · 上海|2016-12-03 — 12-04|中国上海|上海欢乐谷华侨城大剧院
46|2016|MIKU EXPO|MIKU EXPO 2016 China Tour · 北京|2016-12-10 — 12-11|中国北京|北京展览馆剧场
47|2017|初音未来×鼓童|初音未来×鼓童特别演唱会 2017|2017-03-04 — 03-05|日本东京|NHK Hall
48|2017|嘉宾 / 联合演出|香蕉计划 B.I.G 嘉年华 LIVE MUSIC|2017-04-22|中国上海|上海世博公园
49|2017|魔法未来|MAGICAL MIRAI 2017|2017-09-01 — 09-03|日本千叶|幕张 Messe 3号馆
50|2017|未来有你|未来有你 2017 上海|2017-11-25|中国上海|上海新国际博览中心
51|2017|MIKU EXPO|MIKU EXPO 2017 Malaysia|2017-12（百科日期有冲突，待核实）|马来西亚吉隆坡|场馆待官方复核
52|2018|SNOW MIKU LIVE|SNOW MIKU LIVE! 2018|2018-02-09 — 02-10|日本札幌|Zepp Sapporo
53|2018|魔法未来|MAGICAL MIRAI 2018 大阪|2018-08-25 — 08-26|日本大阪|INTEX 大阪 5号馆A
54|2018|魔法未来|MAGICAL MIRAI 2018 东京|2018-09-01 — 09-02|日本千叶|幕张 Messe 9号馆
55|2018|未来有你|未来有你 2018 北京|2018-10-13|中国北京|五棵松华熙LIVE·M空间
56|2018|未来有你|未来有你 2018 成都|2018-10-20|中国成都|华熙LIVE·528
57|2018|未来有你|未来有你 2018 上海|2018-10-27 — 10-28|中国上海|1862时尚艺术中心
58|2018|MIKU EXPO|MIKU EXPO 2018 Europe · Paris|2018-12-01|法国巴黎|La Seine Musicale
59|2018|MIKU EXPO|MIKU EXPO 2018 Europe · Cologne|2018-12-04|德国科隆|Lanxess Arena
60|2018|MIKU EXPO|MIKU EXPO 2018 Europe · London|2018-12-08|英国伦敦|Olympia London
61|2019|SNOW MIKU LIVE|SNOW MIKU LIVE! 2019|2019-02-09 — 02-10|日本札幌|Zepp Sapporo
62|2019|MIKU EXPO|MIKU EXPO 2019 台湾站|2019-05-11|中国台湾新北|新北市工商展览中心
63|2019|嘉宾 / 联合演出|Bilibili Macro Link - VISUAL RELEASE 2019|2019-07-19|中国上海|梅赛德斯奔驰文化中心
64|2019|MIKU EXPO|MIKU EXPO 2019 香港站|2019-07-27|中国香港|Star Hall
65|2019|魔法未来|MAGICAL MIRAI 2019 大阪|2019-08-10 — 08-11|日本大阪|INTEX 大阪 5号馆A
66|2019|魔法未来|MAGICAL MIRAI 2019 东京|2019-08-30 — 09-01|日本千叶|幕张 Messe 3号馆
67|2019|嘉宾 / 联合演出|DIVE XR FESTIVAL|2019-09-22 — 09-23|日本千叶|幕张 Messe 3号馆
68|2019|未来有你|未来有你 2019 上海|2019-11-02 — 11-03|中国上海|1862艺术中心
69|2019|未来有你|未来有你 2019 成都|2019-11-09|中国成都|华熙LIVE528·M空间
70|2019|未来有你|未来有你 2019 北京|2019-11-16|中国北京|华熙LIVE·M空间
71|2019|未来有你|未来有你 2019 广州|2019-11-23 — 11-24|中国广州|广东艺术剧院''')
for n,city,d,v in [(72,'英国伦敦','01-11','O2 Academy Brixton'),(73,'法国巴黎','01-16','Le Zénith Paris'),(74,'德国柏林','01-20','Verti Music Hall'),(75,'荷兰阿姆斯特丹','01-24','Ziggo Dome'),(76,'西班牙巴塞罗那','01-28','Sant Jordi Club')]:event(n,2020,'MIKU EXPO','MIKU EXPO 2020 Europe · '+city,'2020-'+d,city,v)
block('''77|2020|其他专场|HATSUNE MIKU LIVE UNTITLED ver.0|2020-08-09|线上|—
78|2020|魔法未来|MAGICAL MIRAI 2020 大阪|2020-11-28 — 11-29|日本大阪|INTEX 大阪 5号馆A
79|2020|魔法未来|MAGICAL MIRAI 2020 东京|2020-12-18 — 12-20|日本千叶|幕张 Messe 9号馆
80|2020|未来有你|未来有你 2020 特别感谢 LIVE|2020-12-25|线上|—
81|2021|MIKU EXPO|MIKU EXPO 2021 Online|2021-06-06|线上（多地区放送）|—
82|2021|魔法未来|MAGICAL MIRAI 2021 大阪|2021-10-22 — 10-24|日本大阪|INTEX 大阪 5号馆A
83|2021|魔法未来|MAGICAL MIRAI 2021 东京|2021-11-05 — 11-07|日本千叶|幕张 Messe 9号馆
84|2021|未来有你|未来有你 2021|2021-12-25|线上|—
85|2022|魔法未来|MAGICAL MIRAI 10th Anniversary 大阪|2022-08-12 — 08-14|日本大阪|INTEX 大阪 5号馆A
86|2022|魔法未来|MAGICAL MIRAI 10th Anniversary 东京|2022-09-02 — 09-04|日本千叶|幕张 Messe 9号馆
87|2022|MIKU EXPO|MIKU EXPO Rewind 2022|2022-11-06|线上|—
88|2023|魔法未来|MAGICAL MIRAI 10th Anniversary 札幌|2023-02-04 — 02-05|日本札幌|札幌文化艺术剧场 hitaru
89|2023|JAPAN TOUR|THUNDERBOLT · Nagoya|2023-02-23|日本名古屋|Zepp Nagoya
90|2023|JAPAN TOUR|THUNDERBOLT · Osaka|2023-03-04|日本大阪|Zepp Namba
91|2023|JAPAN TOUR|THUNDERBOLT · Fukuoka|2023-03-11|日本福冈|Zepp Fukuoka
92|2023|JAPAN TOUR|THUNDERBOLT · Tokyo|2023-03-18 — 03-19|日本东京|Zepp DiverCity
93|2023|JAPAN TOUR|THUNDERBOLT · Sapporo|2023-03-25|日本札幌|Zepp Sapporo
94|2023|初音未来×鼓童|初音未来×鼓童特别演唱会 2023 ～结～|2023-06-03 — 06-04|日本东京|NHK Hall
95|2023|嘉宾 / 联合演出|Bilibili Macro Link 2023|2023-07-22|中国上海|梅赛德斯奔驰文化中心
96|2023|魔法未来|MAGICAL MIRAI 2023 大阪|2023-08-11 — 08-13|日本大阪|INTEX 大阪 5号馆A
97|2023|魔法未来|MAGICAL MIRAI 2023 东京|待核实（百科原表日期存在疑点）|日本千叶|幕张 Messe 9号馆
98|2023|MIKU EXPO|MIKU EXPO 2023 VR|2023-11-12|线上|—
99|2024|MIKUFES|MIKUFES’24 (春) ～Happy 16th Birthday～|2024-03-31|日本东京|日本武道馆''')
na=[('Vancouver','04-04','加拿大温哥华','Thunderbird Arena'),('Portland','04-06','美国波特兰','Keller Auditorium'),('San Jose','04-08 — 04-09','美国圣何塞','San Jose Civic'),('Phoenix','04-14 — 04-15','美国菲尼克斯','Mullett Arena'),('Los Angeles','04-17','美国洛杉矶','Shrine Auditorium'),('Denver','04-21 — 04-22','美国丹佛','Mission Ballroom'),('Dallas','04-24 — 04-25','美国达拉斯','The Factory in Deep Ellum'),('Austin','04-27','美国奥斯汀','H-E-B Center'),('Atlanta','04-30','美国亚特兰大','Gateway Center Arena'),('Orlando','05-02','美国奥兰多','Walt Disney Theatre'),('Washington DC','05-05','美国华盛顿','The Anthem'),('Newark','05-07','美国纽瓦克','Prudential Center'),('Boston','05-09','美国波士顿','The Wang Theatre'),('Detroit','05-12','美国底特律','Fisher Theatre'),('Chicago','05-14','美国芝加哥','Auditorium Theatre'),('Toronto','05-16','加拿大多伦多','Coca-Cola Coliseum'),('Mexico City','05-21','墨西哥墨西哥城','Pepsi Center WTC')]
for n,(city,date,region,v) in enumerate(na,100):event(n,2024,'MIKU EXPO','MIKU EXPO 2024 NA · '+city,'2024-'+date,region,v)
block('''117|2024|未来有你|未来有你 2024 上海|2024-07-13 — 07-14|中国上海|前滩31
118|2024|未来有你|未来有你 2024 北京|2024-07-20 — 07-21|中国北京|五棵松华熙LIVE·M空间
119|2024|未来有你|未来有你 2024 广州|2024-07-27 — 07-28|中国广州|广东艺术剧院
120|2024|魔法未来|MAGICAL MIRAI 2024 福冈|2024-08-17 — 08-18|日本福冈|福冈太阳宫
121|2024|魔法未来|MAGICAL MIRAI 2024 东京|待核实（百科原表日期存在疑点）|日本千叶|幕张 Messe 3号馆
122|2024|魔法未来|MAGICAL MIRAI 2024 大阪|2024-10-12 — 10-14|日本大阪|INTEX 大阪 5号馆A''')
for n,city,d,v in [(123,'英国伦敦','10-26','OVO Arena Wembley'),(124,'比利时布鲁塞尔','10-28','ING Arena'),(125,'法国巴黎','10-29','Zénith Paris'),(126,'荷兰阿姆斯特丹','10-30','AFAS'),(127,'德国杜塞尔多夫','11-01','Mitsubishi Electric Halle'),(128,'德国柏林','11-02','Uber Eats Music Hall'),(129,'新西兰奥克兰','11-15','Spark Arena'),(130,'澳大利亚布里斯班','11-18','Convention & Exhibition Centre'),(131,'澳大利亚悉尼','11-20','ICC Sydney Theatre'),(132,'澳大利亚墨尔本','11-22','John Cain Arena'),(133,'澳大利亚珀斯','11-26','RAC Arena')]:event(n,2024,'MIKU EXPO','MIKU EXPO 2024 · '+city,'2024-'+d,city,v)
assert {r['sourceIndex'] for r in rows}==set(range(1,134))
# Series index entries cover editions absent from the city-level table.
def edition(id,y,s,name,city='待核实',kind='专场 / 巡演',source=series_source):
 rows.append(dict(id=id,year=y,series=s,name=name,date='待核实',city=city,venue='待核实',kind=kind,status='百科系列目录',verification='百科线索 · 待补场次',source=source,reference=original,notes='年度 / 项目级条目；取得城市与场次信息后可继续拆分。',collectionIds=[]))
for y in range(2017,2026):edition(f'symphony-{y}',y,'初音未来交响乐',f'Miku Symphony {y}')
for y in [2020,2021]:edition(f'galaxy-{y}',y,'GALAXY LIVE',f'HATSUNE MIKU GALAXY LIVE {y}','线上','VR / 线上')
for y in [2021,2022,2023,2024]:edition(f'sekai-symphony-{y}',y,'世界计划交响乐',f'Sekai Symphony {y}',kind='联动 / 交响乐')
for y,n in [(2022,'1st -Link-'),(2023,'2nd -Will-'),(2024,'3rd -Evolve-')]:edition(f'colorful-{y}',y,'COLORFUL LIVE',f'Project SEKAI COLORFUL LIVE {n}',kind='联动演出')
for y,n in [(2021,'ver.0.9'),(2022,'ver.1.0'),(2022,'ver.1.1（跨 2022–2023）'),(2023,'ver.2.0')]:edition(f'break-{y}-{len(rows)}',y,'MIKU BREAK','MIKU BREAK '+n,kind='舞蹈 / 联合演出')
for id,y,s,n in [('appearance-2013',2013,'HATSUNE Appearance','夏祭初音鑑'),('appearance-2014',2014,'HATSUNE Appearance','雪祭初音鑑'),('afa-2009',2009,'嘉宾 / 联合演出','Anime Festival Asia 2009'),('expo-2018-na',2018,'MIKU EXPO','MIKU EXPO 2018 USA & Mexico'),('mirai-2025',2025,'魔法未来','MAGICAL MIRAI 2025'),('expo-2025',2025,'MIKU EXPO','MIKU EXPO 2025'),('mwy-2025',2025,'未来有你','未来有你 2025'),('blooming-2025',2025,'JAPAN TOUR','JAPAN TOUR 2025 ～BLOOMING～')]:edition(id,y,s,n,source=mirror if y==2025 or id=='afa-2009' else series_source)
# Existing records with independent primary evidence remain linked as separate BD records.
seed=json.loads((WEB/'seed.json').read_text())
for old in seed:
 if old['series'] in ['LAWSON 50th','宝可梦','DECO*27'] or (old['series']=='SNOW MIKU LIVE' and old['year']==2027) or (old['series']=='魔法未来' and old['year']==2026):
  edition('primary-'+old['id'],old['year'],old['series'],old['name'],source=old['source'])
  r=rows[-1];r.update(date=old['date'],notes=old['notes'],verification='原有来源记录 · 需持续复核',status='官方来源线索')
for r in rows:
 for old in seed:
  if r['series']==old['series'] and (2022 if r.get('sourceIndex')==88 else r['year'])==old['year']:
   if r['series']=='MIKU EXPO' and r['year']==2014 and r.get('sourceIndex')!=23:continue
   if r['series']=='感谢祭 / MIKUPA' and r['year']==2013 and ('Sapporo' in r['name'])!=('Sapporo' in old['name']):continue
   r['collectionIds'].append(old['id'])
  elif r['series']=='初音未来交响乐' and old['series']=='其他正式 Live' and r['year']==old['year']:r['collectionIds'].append(old['id'])
 if '待核实' in r['date'] or r.get('sourceIndex')==7:
  r['verification']='日期 / 举办状态待核实'
# Correct known conflicts using primary event schedules, while retaining source row IDs.
corrections = {
  51: ('2017-12-16', 'https://piapro.net/intl/en_event.html', '百科原表写为 12 月 6 日，按 piapro 官方活动目录更正为 12 月 16 日。场馆仍待复核。'),
  97: ('2023-09-01 — 09-03', 'https://magicalmirai.com/2023/tokyo_ticket_en.html', '百科原表日期有误；按官方 TOKYO Live 日程更正。'),
  121: ('2024-08-30 — 09-01', 'https://magicalmirai.com/2024/tokyo_ticket.html', '百科原表日期有误；按官方 TOKYO 日程更正。'),
}
for r in rows:
 if r.get('sourceIndex') in corrections:
  d,u,n=corrections[r['sourceIndex']];r.update(date=d,source=u,notes=n,verification='日期已由官方资料复核',status='官方日期复核')
from enrich_catalog import enrich_catalog
tours=enrich_catalog(rows, ROOT)
rows.sort(key=lambda r:(r['year'],r['id']))
(WEB/'catalog.json').write_text(json.dumps({'version':2,'updated':'2026-11-17','coverage':'原有 133 条逐场记录保留稳定编号；补充 Vocawiki 逐场表至第 136 项和系列目录，并关联 MikuTime 的 75 项巡演索引。城市站与巡演项目不重复新增；不保证涵盖所有历史活动。','tourRecords':tours,'sources':[{'label':'Vocawiki 演唱会表与系列目录','url':'https://voca.wiki/初音未来/演唱会#大型演唱会列表'},{'label':'MikuTime 歌单与演出索引','url':'https://mikutime.link/setlists/'},{'label':'MikuTime 公开演出数据说明','url':'https://concert-data.39music.dance/'},{'label':'MikuTime 数据源码','url':'https://github.com/talisein/songbot/blob/main/src/concerts-raw_data.cppm'},{'label':'用户提供的萌娘百科演唱会页','url':original},{'label':'演唱会系列目录镜像（旧版）','url':series_source},{'label':'初音未来主条目镜像·逐场表及年度导航','url':mirror}],'events':rows},ensure_ascii=False,indent=2))
print(f'{len(rows)} events; 133 legacy source rows; {len(tours)} tour references')
