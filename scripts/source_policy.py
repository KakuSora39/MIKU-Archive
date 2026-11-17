"""Offline source resolution: official pages separate from ranked discovery sources."""
import json
from pathlib import Path
from urllib.parse import urlparse,quote
PRIMARY={'piapro.net','crypton.co.jp','mikuexpo.com','magicalmirai.com','snowmiku.com','scla.com.cn','wmg.jp','columbia.jp','sega.jp','project-voltage.jp','otoiro.co.jp','l-tike.com','atak.jp','ycam.jp','jpf.go.jp','chokabuki.jp','mikufes24spring.jp','thinkandsense.com','anisama.tv','bml.bilibili.com'}
def official(url):
 h=(urlparse(url).hostname or '').lower()
 return any(h==d or h.endswith('.'+d) for d in PRIMARY)
def research_rank(url):
 h=(urlparse(url).hostname or '').lower()
 if h=='vocadb.net' or h.endswith('.vocadb.net'):return 1
 if h in {'vocaloid.fandom.com','vocaloid.wiki'}:return 2
 if 'moegirl' in h:return 3
 return 4

def resolve_sources(event,snapshot,manual=None):
 officials=[];research=[]
 def add_off(url,label,scope,via=''):
  if url and official(url) and url not in [x['url'] for x in officials]:officials.append(dict(url=url,label=label,scope=scope,via=via))
 def add_ref(url,label,kind='record'):
  if url and not official(url) and url not in [x['url'] for x in research]:research.append(dict(url=url,label=label,kind=kind,priority=research_rank(url)))
 if manual and event['id'] in manual:
  entry=manual[event['id']]
  officials.append({k:entry[k] for k in ['url','label','scope','via'] if k in entry})
  if entry.get('vocadbId'):add_ref('https://vocadb.net/E/'+str(entry['vocadbId']),'VocaDB：'+event['name']+'（已匹配，条目可能仍为草稿）')
 # The CSV's explicit primary reference remains first when present.
 add_off(event.get('officialUrl',''),'官方 / 主办方资料','已收集的官方参考')
 for tour in event.get('tourRefs',[]):
  entry=snapshot.get(str(tour['vocadbId']),{})
  if 'name' in entry:
   add_ref(entry['url'],'VocaDB：'+entry['name']+'（关联条目）')
   for link in entry.get('links',[]):
    add_off(link['url'],'VocaDB 所列官方链接','关联项目官网 / 官方报道',entry['url'])
    add_ref(link['url'],link.get('description') or '第三方外链')
  else:add_ref(f"https://vocadb.net/E/{tour['vocadbId']}",'VocaDB 关联条目（本次未读取成功）','unavailable')
 # Fallbacks are verified series/organizer entry points, not invented event URLs.
 series=event['series'];year=event['year']
 if series=='魔法未来':
  add_off('https://magicalmirai.com/','魔法未来官方门户','系列入口，具体场次见活动页')
 if series=='MIKU EXPO':add_off('https://mikuexpo.com/history','MIKU EXPO 官方历史日程','系列历史档案')
 if series=='初音未来交响乐':add_off('https://sp.wmg.jp/mikusymphony/','初音未来交响乐官方网站','系列入口，历年场次需另核')
 if series=='未来有你':add_off('https://www.scla.com.cn/Cn/Index/pageView/catid/15/ip/16.html','新创华：初音未来 / 未来有你档案','主办 / 授权方档案')
 if series in {'感谢祭 / MIKUPA','MIKUNOPOLIS','HATSUNE Appearance','MIKU BREAK','初音未来×鼓童','JAPAN TOUR'}:add_off('https://piapro.net/intl/en_event.html','Crypton 官方活动档案','官方档案入口，需核对具体项目')
 if series=='MIKUFES' and year==2024:add_off('https://mikufes24spring.jp/','MIKUFES 2024 官方网站','项目官网')
 if series in {'COLORFUL LIVE','世界计划交响乐'}:add_off('https://pjsekai.sega.jp/','Project SEKAI 官方网站','关联企划入口，不能代替出演证明')
 if not research or not any(r['priority']==1 for r in research):add_ref('https://vocadb.net/Search?searchType=ReleaseEvent&query='+quote(event['name']),'VocaDB 检索入口（尚未匹配具体条目）','search')
 # A search URL is a lookup aid, never a citation asserting a page exists.
 if not any(r['priority']==2 for r in research):add_ref('https://vocaloid.fandom.com/wiki/Special:Search?query='+quote(event['name']),'Vocaloid Wiki 检索入口（尚未匹配具体条目）','search')
 add_ref(event.get('researchSource',''),'原检索资料')
 research.sort(key=lambda r:(r['priority'],r['kind']=='search'))
 return officials,research
