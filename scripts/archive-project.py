import os, re, subprocess, zipfile, hashlib, pathlib, json
def write_entry(archive, name, data):
    entry = zipfile.ZipInfo(name)
    archive.writestr(entry, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=8)


pathlib.Path('dist').mkdir(exist_ok=True)
paths = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
blocked = re.compile(r'(^|/)(\.env[^/]*|\.claude|\.git|\.npmrc|\.pypirc|credentials[^/]*|secrets?[^/]*|private[-_]?key[^/]*|personal[-_]?data[^/]*)($|/)|\.(pem|p12|pfx|key|sqlite|db)$', re.I)
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD']).decode().strip()
version = json.loads(pathlib.Path('app.json').read_text())['expo']['version']
archive = f'dist/activity-balance-source-{version}-{commit}-privacy-filtered.zip'
included, excluded, redacted = [], [], []
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=8) as z:
    for p in paths:
        if not p or blocked.search(p) or p == 'docs/hand-portion-method.md' or os.path.islink(p) or not os.path.isfile(p):
            if p:
                excluded.append(p)
            continue
        raw = pathlib.Path(p).read_bytes()
        try:
            content = raw.decode('utf-8')
        except UnicodeDecodeError:
            write_entry(z, p, raw)
            included.append(p)
            continue
        sanitized = content
        # Identity and address strings in test fixtures/docs are not part of a portable project backup.
        sanitized = sanitized.replace('Карэн', 'Test User').replace('Karen Tatarov', 'Test User')
        sanitized = re.sub(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'redacted@example.invalid', sanitized)
        # Refuse to export obvious private keys or credential tokens.
        if re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{24,}', sanitized):
            raise RuntimeError('Potential private credential in ' + p)
        if sanitized != content:
            redacted.append(p)
        write_entry(z, p, sanitized.encode('utf-8'))
        included.append(p)
    manifest = {
        'project': 'Activity Balance', 'version': version, 'git_commit': commit,
            'files': len(included), 'excluded_sensitive_files': excluded,
        'sanitized_text_files': redacted,
        'note': 'Portable privacy-filtered backup; the canonical complete version is the Git commit. Never store environment keys or personal calibration notes in the Drive archive.'
    }
    write_entry(z, 'RELEASE_MANIFEST.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
with open('dist/SHA256SUMS.txt', 'w') as f:
    f.write(hashlib.sha256(pathlib.Path(archive).read_bytes()).hexdigest() + '  ' + os.path.basename(archive) + '\n')
print(f'{len(included)} files archived, {len(excluded)} private paths excluded, {len(redacted)} text files sanitized')
