"""Apply reviewed official artwork by stable event ID; never guess future bindings."""
import json

def apply_covers(catalog, path):
    manifest = json.loads(path.read_text(encoding='utf-8'))
    catalog['coverAssets'] = manifest['assets']
    catalog['defaultCover'] = manifest['default']
    ids = {row['id'] for row in catalog['events'] + catalog['projects']}
    if set(manifest['events']) != ids:
        raise ValueError('Every event/project must have an explicit cover review decision')
    for row in catalog['events'] + catalog['projects']:
        decision = manifest['events'][row['id']]
        if decision['asset'] not in manifest['assets']:
            raise ValueError('Unknown cover asset: ' + decision['asset'])
        row['coverKey'] = decision['asset']
        row['coverNote'] = decision.get('note', '')
