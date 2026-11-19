"""Build a standalone macOS application from the sibling web source directory.
Run: python3 miku-live-desktop/build.py
Requires macOS, Python 3 and Apple's Command Line Tools; no Python packages.
"""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import re
import subprocess
import sys
import tempfile

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from build_web import build_web

# A migrated compiler cache embeds absolute paths; use a location-specific cache.
CACHE = ROOT / 'build' / ('ModuleCache-' + hashlib.sha256(str(ROOT).encode()).hexdigest()[:10])


def run(*args):
    subprocess.run([str(arg) for arg in args], check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dev', action='store_true', help='build the catalog maintenance edition')
    args = parser.parse_args()
    name = 'MIKU Archive Dev' if args.dev else 'MIKU Archive'
    app = ROOT / 'build' / f'{name}.app'
    contents = app / 'Contents'
    resources = contents / 'Resources'
    binary = contents / 'MacOS'
    binary.mkdir(parents=True, exist_ok=True)
    web = resources / 'Web'
    app_info = build_web(web, developer=args.dev)
    # Embed each catalog into its generated script for offline file:// loading.
    for json_name, script_name in [('seed.json', 'app.js'), ('catalog.json', 'atlas.js')]:
        payload = json.loads((web / json_name).read_text(encoding='utf-8'))
        script_path = web / script_name
        script = script_path.read_text(encoding='utf-8')
        pattern = r"await\s*\(await\s+fetch\((['\"])" + re.escape(json_name) + r"\1\)\)\.json\(\)"
        script, replacements = re.subn(pattern, lambda _: json.dumps(payload, ensure_ascii=False), script)
        if replacements != 1:
            raise RuntimeError(f'Cannot find {json_name} loading expression in {script_name}.')
        script_path.write_text(script, encoding='utf-8')
    css_path = web / 'style.css'
    css = css_path.read_text(encoding='utf-8')
    css = re.sub(r'@import\s+url\([^;]+;', '', css)
    css = css.replace('"Noto Sans SC", sans-serif', '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif')
    css = css.replace("'Noto Sans SC',sans-serif", '-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif')
    css_path.write_text(css, encoding='utf-8')
    info = {
        'CFBundleName': name,
        'CFBundleDisplayName': name,
        'CFBundleIdentifier': 'local.sora.mikuarchive.dev' if args.dev else 'local.sora.mikuarchive',
        'CFBundleExecutable': 'MIKUArchive',
        'CFBundlePackageType': 'APPL',
        'CFBundleShortVersionString': app_info['version'],
        'CFBundleVersion': str(app_info['build']),
        'LSMinimumSystemVersion': '13.0',
        'NSHighResolutionCapable': True,
        'CFBundleIconFile': 'AppIcon',
        'NSHumanReadableCopyright': 'Unofficial personal collection manager.',
    }
    with (contents / 'Info.plist').open('wb') as file:
        plistlib.dump(info, file)
    developer_sources = ['-D', 'MIKU_DEV', BASE / 'CoverCapture.swift'] if args.dev else []
    run('xcrun', 'swiftc', '-parse-as-library', '-module-cache-path', CACHE, '-O', '-target', 'arm64-apple-macos13.0',
        BASE / 'Main.swift', *developer_sources, '-o', binary / 'MIKUArchive',
        '-framework', 'Cocoa', '-framework', 'WebKit')
    with tempfile.TemporaryDirectory(prefix='miku-icon-') as temporary:
        temp = Path(temporary)
        png = temp / 'icon.png'
        iconset = temp / 'AppIcon.iconset'
        iconset.mkdir()
        run('xcrun', 'swift', '-module-cache-path', CACHE, BASE / 'Icon.swift', png)
        for size in (16, 32, 128, 256, 512):
            for scale in (1, 2):
                suffix = '@2x' if scale == 2 else ''
                run('sips', '-z', size * scale, size * scale, png,
                    '--out', iconset / f'icon_{size}x{size}{suffix}.png')
        run('iconutil', '-c', 'icns', iconset, '-o', resources / 'AppIcon.icns')
    # Local ad-hoc signature; distribution notarization is a separate step.
    run('xattr', '-cr', app)
    run('codesign', '--force', '--deep', '--sign', '-', app)
    run('codesign', '--verify', '--deep', '--strict', app)
    print(f'Built: {app}')


if __name__ == '__main__':
    main()
