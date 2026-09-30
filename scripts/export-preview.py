"""Export the built React interface as a self-contained, labelled design preview.

Contains only fictional SQL seed data and an in-browser preview adapter.
Never reads .env, .secrets, live databases, or credentials.
"""

import base64
import datetime
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dashboard/dist"
target = (
    Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dashboard/design-preview.html"
)
target.parent.mkdir(parents=True, exist_ok=True)
html = (DIST / "index.html").read_text(encoding="utf-8")
js_file = re.search(r'src="([^"]+\.js)"', html).group(1)
css_file = re.search(r'href="([^"]+\.css)"', html).group(1)
javascript = (DIST / js_file.lstrip("/")).read_text(encoding="utf-8")
css = (DIST / css_file.lstrip("/")).read_text(encoding="utf-8")


def data_url(path, mime):
    return "data:" + mime + ";base64," + base64.b64encode(path.read_bytes()).decode()


def inline_font(match):
    raw = match.group(1).strip("\"'")
    path = DIST / raw.lstrip("/") if raw.startswith("/") else DIST / "assets" / raw
    if path.exists():
        return (
            "url("
            + data_url(path, "font/woff2" if path.suffix == ".woff2" else "font/woff")
            + ")"
        )
    return match.group(0)


css = re.sub(r"url\(([^)]+)\)", inline_font, css)
mark = data_url(ROOT / "dashboard/public/mark.svg", "image/svg+xml")
javascript = javascript.replace('"/mark.svg"', json.dumps(mark))
assets = {
    p.stem: data_url(p, "image/jpeg")
    for p in (ROOT / "dashboard/public/images").glob("*.jpg")
}
travels = []
for line in (
    (ROOT / "infra/postgres/002-sample.sql").read_text(encoding="utf-8").splitlines()
):
    match = re.search(
        r"INSERT INTO travel\.(travels|stops)\((.*?)\) VALUES \((.*?)\);", line
    )
    if not match:
        continue
    values = [
        value.replace("''", "'") for value in re.findall(r"'((?:[^']|'')*)'", match[3])
    ]
    row = dict(zip(match[2].split(","), values))
    if match[1] == "travels":
        row.update(
            price=float(row["price"]),
            capacity=int(row["capacity"]),
            version=0,
            participantIds=[],
            stops=[],
            duration=(
                datetime.date.fromisoformat(row["end_date"])
                - datetime.date.fromisoformat(row["start_date"])
            ).days
            + 1,
        )
        travels.append(row)
    else:
        next(t for t in travels if t["id"] == row["travel_id"])["stops"].append(row)
sample = {
    "travels": list(reversed(travels)),
    "users": [
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "name": "Workspace admin",
            "email": "admin@travelplan.local",
            "role": "ADMIN",
            "status": "ACTIVE",
            "created_at": "2026-09-13",
        }
    ],
    "gateways": [
        {
            "id": "20000000-0000-0000-0000-00000000000" + str(i + 1),
            "provider": provider,
            "name": name,
            "currency": "USD",
            "enabled": False,
            "configured": False,
            "mode": "sandbox",
        }
        for i, (provider, name) in enumerate(
            [("STRIPE", "Stripe checkout"), ("PAYPAL", "PayPal checkout")]
        )
    ],
}
runtime = (ROOT / "dashboard/preview-runtime.js").read_text(encoding="utf-8")
setup = (
    "window.TRAVEL_PLAN_ASSETS="
    + json.dumps(assets)
    + ";window.TRAVEL_PLAN_SAMPLE="
    + json.dumps(sample)
    + ";"
    + runtime
)


def safe_script(value):
    return value.replace("</script", "<\\/script")


result = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Travel Plan · Interactive design preview</title><link rel="icon" href="'
    + mark
    + '"><style>'
    + css
    + '</style></head><body><div id="root"></div><script>'
    + safe_script(setup)
    + '</script><script type="module">'
    + safe_script(javascript)
    + "</script></body></html>"
)
licenses = "\n\n".join(
    (ROOT / "docs/licenses" / name).read_text(encoding="utf-8")
    for name in ["Fraunces-OFL.txt", "DM-Sans-OFL.txt"]
)
result = result.replace("</head>", "<!-- Embedded font licenses:\n" + licenses.replace("--", "—") + "\n--></head>")
target.write_text(result, encoding="utf-8")
print(
    f"Preview exported: {target.name} ({target.stat().st_size:,} bytes). Sample data only; no credentials read."
)
