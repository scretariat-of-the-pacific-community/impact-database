"""Convert license-checker JSON output to a markdown table."""
from pathlib import Path
import json


def main() -> None:
    source = Path('/tmp/js_licenses.json')
    destination = Path(__file__).with_name('js_licenses.md')

    if not source.exists():
        raise SystemExit('Expected /tmp/js_licenses.json from license-checker')

    data = json.loads(source.read_text())
    rows = sorted(((pkg, meta.get('licenses', '')) for pkg, meta in data.items()))

    table = ['| Package | License |', '|---|---|']
    table.extend(f'| {pkg} | {license_} |' for pkg, license_ in rows)
    destination.write_text('\n'.join(table))
    print(f'Wrote {destination}')


if __name__ == '__main__':
    main()
