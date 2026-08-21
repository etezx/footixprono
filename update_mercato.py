from urllib.parse import quote_plus
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
from pathlib import Path
import json

QUERY = 'mercato Ligue 1 when:7d'
URL = f'https://news.google.com/rss/search?q={quote_plus(QUERY)}&hl=fr&gl=FR&ceid=FR:fr'

req = Request(URL, headers={'User-Agent':'Mozilla/5.0 FootixProno/1.0'})
with urlopen(req, timeout=25) as response:
    xml = response.read()
root = ET.fromstring(xml)
items = []
for node in root.findall('./channel/item')[:18]:
    title = (node.findtext('title') or '').strip()
    link = (node.findtext('link') or '').strip()
    pub = (node.findtext('pubDate') or '').strip()
    source_node = node.find('source')
    source = (source_node.text or '').strip() if source_node is not None else ''
    try:
        published = parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat()
    except Exception:
        published = pub
    if title and link:
        items.append({'title': title, 'link': link, 'published': published, 'source': source})

out = {'updated_at': datetime.now(timezone.utc).isoformat(), 'query': QUERY, 'items': items[:12]}
path = Path(__file__).resolve().parent / 'mercato.json'
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'{len(out["items"])} actualités enregistrées dans {path}')
