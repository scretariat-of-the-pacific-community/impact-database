# Open source dependency verification

The application dependencies were scanned to confirm they use open-source licenses. The audit covered both Python backend packages (`app/requirements.txt`) and frontend JavaScript packages (`package.json`).

## Python dependencies

- Tool: [`pip-licenses`](https://pypi.org/project/pip-licenses/) against the locked versions in `app/requirements.txt`.
- Command used: `pip-licenses --format=markdown > docs/open_source_compliance/python_licenses.md`
- Result: All Python dependencies are covered by OSI-approved licenses (MIT, BSD, Apache-2.0, LGPL, ISC, MPL-2.0, etc.). See the generated table in `python_licenses.md` for the full list.

## JavaScript dependencies

- Tool: [`license-checker`](https://www.npmjs.com/package/license-checker) against the packages installed via `package.json`.
- Command used: `npx --yes license-checker --production --json > /tmp/js_licenses.json` followed by a Markdown export script at `docs/open_source_compliance/js_licenses.md`.
- Result: All frontend dependencies resolve to open-source licenses (MIT, BSD, Apache-2.0, ISC, etc.). The table in `js_licenses.md` lists every production package with its license.

## How to re-run

1. Create and activate a fresh virtual environment.
2. Install backend requirements: `pip install -r app/requirements.txt`.
3. Run `pip install pip-licenses` and export the markdown file as above.
4. Ensure Node dependencies are installed (`npm install`), then run the `license-checker` command above and regenerate `js_licenses.md` using the helper script in this folder.

If any new dependency introduces a non–open-source license, the tables will surface it immediately so it can be removed or replaced.
