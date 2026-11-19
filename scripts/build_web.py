"""Build the static release site or a local developer edition."""
import argparse
import json
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'miku-live-archive' / 'dist'
DEVELOPER_FILES = {'catalog-editor.js', 'artwork-media.js'}


def build_web(destination, developer=False):
    app_info = json.loads((ROOT / 'app-info.json').read_text(encoding='utf-8'))
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', app_info['version']):
        raise ValueError('App version must use X.X.X')

    catalog = json.loads((SOURCE / 'catalog.json').read_text(encoding='utf-8'))
    cover_files = {Path(asset['file']).name for asset in catalog['coverAssets'].values()}
    def omit(directory, names):
        skipped = {'.DS_Store'}
        if Path(directory) == SOURCE:
            if not developer:
                skipped.update(DEVELOPER_FILES)
        elif Path(directory) == SOURCE / 'covers':
            skipped.update(set(names) - cover_files)
        return skipped

    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(SOURCE, destination, ignore=omit)
    (destination / 'edition.js').write_text(
        f'const DEVELOPER_EDITION = {str(developer).lower()};\n', encoding='utf-8')
    (destination / 'app-info.js').write_text(
        '// Generated from app-info.json; edit the root manifest.\nconst APP_INFO = '
        + json.dumps(app_info, ensure_ascii=False) + ';\n', encoding='utf-8')
    html = destination / 'index.html'
    markup = html.read_text(encoding='utf-8')
    replacement = r'\1' if developer else ''
    markup = re.sub(r'<!-- dev-only -->(.*?)<!-- /dev-only -->', replacement, markup, flags=re.S)
    if developer:
        markup = markup.replace('</title>', ' · 开发版</title>', 1)
    html.write_text(markup, encoding='utf-8')
    return app_info


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dev', action='store_true', help='include the catalog and cover editor')
    args = parser.parse_args()
    destination = ROOT / 'build' / ('web-dev' if args.dev else 'web-release')
    build_web(destination, developer=args.dev)
    print(f'Built: {destination}')


if __name__ == '__main__':
    main()
