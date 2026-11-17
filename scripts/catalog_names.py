"""Apply audited official titles and country/city labels without changing stable IDs."""
def apply_names(events, projects, policy):
    for event in events + projects:
        old_name = event['name']
        source_id = event.get('parentId', event['id'])
        entry = policy['stationTitles'].get(event['id'], policy['titles'].get(source_id))
        if not entry:
            raise ValueError('Missing naming entry for ' + event['id'])
        event['nameStatus'] = entry['status']
        event['officialName'] = entry['title'] if entry['status'] != '待核实' else ''
        event['officialNameSource'] = entry['source']
        event['aliases'] = list(dict.fromkeys([old_name, entry['title']]))
        if 'stationIds' in event:
            event['name'] = entry['title']
            continue
        location = policy['locations'].get(event['city'])
        if not location:
            raise ValueError('Missing country/city mapping for ' + event['id'])
        event['originalCity'] = event['city']
        event['country'] = location['country']
        event['cityName'] = location['city']
        event['locationMode'] = location['mode']
        event['city'] = (' '.join([location['country'], location['city']])
                         if location['country'] and location['country'] != location['city'] else location['city'])
        event['name'] = entry['title'] + ' · ' + event['city']
        # A performance slot is metadata, never an invented part of the official title.
        if event['id'] in {'moegirl-stage-009','moegirl-stage-010','moegirl-stage-011','moegirl-stage-012'}:
            event['sessionLabel'] = {'moegirl-stage-009':'昼场','moegirl-stage-010':'夜场','moegirl-stage-011':'昼场','moegirl-stage-012':'夜场'}[event['id']]
