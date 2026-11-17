"""Build a standalone macOS application from the sibling web source directory.
Run: python3 miku-live-desktop/build.py
Requires macOS, Python 3 and Apple's Command Line Tools; no Python packages.
"""
from pathlib import Path
import json
import hashlib
import plistlib
import shutil
import subprocess
import tempfile

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
APP = ROOT / 'build' / 'MIKU Archive.app'
CONTENTS = APP / 'Contents'
RESOURCES = CONTENTS / 'Resources'
BINARY = CONTENTS / 'MacOS'
# A migrated compiler cache embeds absolute paths; use a location-specific cache.
CACHE = ROOT / 'build' / ('ModuleCache-' + hashlib.sha256(str(ROOT).encode()).hexdigest()[:10])


def run(*args):
    subprocess.run([str(arg) for arg in args], check=True)


def main():
    app_info = json.loads((ROOT / 'app-info.json').read_text(encoding='utf-8'))
    import re
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', app_info['version']):
        raise ValueError('App version must use X.X.X')
    (ROOT / 'miku-live-archive/dist/app-info.js').write_text('// Generated from app-info.json; edit the root manifest.\nconst APP_INFO = ' + json.dumps(app_info, ensure_ascii=False) + ';\n', encoding='utf-8')
    BINARY.mkdir(parents=True, exist_ok=True)
    RESOURCES.mkdir(parents=True, exist_ok=True)
    web = RESOURCES / 'Web'
    # Copy readable web source; embed seed data for file:// offline loading.
    shutil.copytree(ROOT / 'miku-live-archive' / 'dist', web, dirs_exist_ok=True)
    # Embed each catalog into its generated script for offline file:// loading.
    import re
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
        'CFBundleName': 'MIKU Archive',
        'CFBundleDisplayName': 'MIKU Archive',
        'CFBundleIdentifier': 'local.sora.mikuarchive',
        'CFBundleExecutable': 'MIKUArchive',
        'CFBundlePackageType': 'APPL',
        'CFBundleShortVersionString': app_info['version'],
        'CFBundleVersion': str(app_info['build']),
        'LSMinimumSystemVersion': '13.0',
        'NSHighResolutionCapable': True,
        'CFBundleIconFile': 'AppIcon',
        'NSHumanReadableCopyright': 'Unofficial personal collection manager.',
    }
    with (CONTENTS / 'Info.plist').open('wb') as file:
        plistlib.dump(info, file)
    run('xcrun', 'swiftc', '-module-cache-path', CACHE, '-O', '-target', 'arm64-apple-macos13.0',
        BASE / 'Main.swift', '-o', BINARY / 'MIKUArchive',
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
        run('iconutil', '-c', 'icns', iconset, '-o', RESOURCES / 'AppIcon.icns')
    # Local ad-hoc signature; distribution notarization is a separate step.
    run('xattr', '-cr', APP)
    run('codesign', '--force', '--deep', '--sign', '-', APP)
    run('codesign', '--verify', '--deep', '--strict', APP)
    print(f'Built: {APP}')


if __name__ == '__main__':
    main()
