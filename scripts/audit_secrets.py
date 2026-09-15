#!/usr/bin/env python3
"""Offline credential audit. Reports fingerprints only; never prints secret values."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = {
    'ark-key': re.compile(r'ark-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', re.I),
    'volc-access-id': re.compile(r'AKLT[A-Za-z0-9]{20,}'),
    'supabase-secret': re.compile(r'sb_secret_[A-Za-z0-9_-]{20,}'),
    'jwt': re.compile(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'),
    'assigned-secret': re.compile(r'''(?:apiKey|api_key|secretKey|secret_key|accessToken|access_token|VOLC_SECRET_ACCESS_KEY|ARK_API_KEY)\s*[=:]\s*["']([A-Za-z0-9_+/=-]{28,})["']''', re.I),
    'volc-secret': re.compile(r'''\bSK\s*(?:[=:]|</[^>]+>\s*<[^>]+>)\s*["']?([A-Za-z0-9+/]{30,}={0,2})'''),
}

def findings(content):
    for kind, pattern in PATTERNS.items():
        for match in pattern.finditer(content):
            value = match.group(1) if kind in ('assigned-secret','volc-secret') else match.group()
            if kind == 'jwt':
                try:
                    payload = value.split('.')[1]
                    if json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4))).get('role') != 'service_role':
                        continue
                except Exception:
                    continue
            if value.lower().startswith(('your-', 'your_', 'replace_', 'example_')):
                continue
            yield {'line': content[:match.start()].count('\n') + 1, 'type': kind,
                   'fingerprint': hashlib.sha256(value.encode()).hexdigest()[:12]}

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def audit(history=False):
    results = []
    for name in git('ls-files', '--cached', '--others', '--exclude-standard', '-z').decode().split('\0'):
        path = ROOT / name
        if not name or not path.is_file():
            continue
        for found in findings(path.read_text(errors='ignore')):
            results.append({'file': name, **found})
    if history:
        objects = git('rev-list', '--objects', '--all').decode().splitlines()
        for entry in objects:
            oid, _, name = entry.partition(' ')
            if not name or git('cat-file', '-t', oid).strip() != b'blob':
                continue
            for found in findings(git('cat-file', 'blob', oid).decode(errors='ignore')):
                results.append({'historyBlob': oid, 'file': name, **found})
    return results

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--history', action='store_true')
    args = parser.parse_args()
    results = audit(args.history)
    print(json.dumps({'findingCount': len(results), 'findings': results}, ensure_ascii=False, indent=2))
    raise SystemExit(bool(results))
