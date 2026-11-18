"""Explicit maintenance command: download reviewed URLs and rebuild thumbnails.
Run only after editing and reviewing references/event-covers.json. Normal builds
never access the network. Requires macOS, Python 3 and Apple Command Line Tools.
"""
import concurrent.futures,hashlib,json,struct,subprocess,tempfile,urllib.request,urllib.parse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/'scripts/references/event-covers.json'
def main():
 manifest=json.loads(MANIFEST.read_text())
 with tempfile.TemporaryDirectory(prefix='miku-covers-') as temp:
  folder=Path(temp);(folder/'raw').mkdir()
  (folder/'selection.json').write_text(json.dumps(manifest['assets']))
  def download(item):
   key,asset=item
   req=urllib.request.Request(urllib.parse.quote(asset['imageUrl'],safe=':/?=&%'),headers={'User-Agent':'Mozilla/5.0','Referer':asset['sourceUrl']})
   with urllib.request.urlopen(req,timeout=40) as response:data=response.read(16_000_001)
   if len(data)>16_000_000 or not (data.startswith(b'\x89PNG') or data.startswith(b'\xff\xd8') or data[:4]==b'RIFF'):raise ValueError('Invalid image: '+key)
   (folder/'raw'/(key+'.img')).write_bytes(data)
  list(concurrent.futures.ThreadPoolExecutor(max_workers=6).map(download,manifest['assets'].items()))
  subprocess.run(['xcrun','swift','-module-cache-path',str(folder/'ModuleCache'),str(ROOT/'scripts/PrepareCovers.swift'),str(folder),str(ROOT/'miku-live-archive/dist/covers')],check=True)
  profiles=json.loads(subprocess.check_output(
   ['xcrun','swift','-module-cache-path',str(folder/'ModuleCache'),str(ROOT/'scripts/ProfileCovers.swift'),str(ROOT/'miku-live-archive/dist/covers')],
   text=True))
 for key,asset in manifest['assets'].items():
  asset['transparent']=profiles[key]
  data=(ROOT/'miku-live-archive/dist'/asset['file']).read_bytes()
  asset['sha256']=hashlib.sha256(data).hexdigest();asset['width'],asset['height']=struct.unpack('>II',data[16:24])
 MANIFEST.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 subprocess.run(['python3',str(ROOT/'scripts/build_catalog.py')],check=True)
 print('Review the rebuilt thumbnails and run scripts/test_covers.py before release.')
if __name__=='__main__':main()
