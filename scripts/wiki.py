import time
import requests
import json
import zlib
import sys
import slugify

# page_name = 'George W. Bush'
target = 500
page_name = sys.argv[1]
session = requests.Session()
url = "http://en.wikipedia.org/w/api.php"
params = {
    "action": "query",
    "prop": "revisions",
    "titles": page_name,
    "rvprop": "ids|timestamp|content",
    "rvslots": "main",
    "rvdir": "newer",
    "rvlimit": 20,
    "format": "json",
    "formatversion": "2",
}

ids_fn = f'.wiki-revs/{slugify.slugify_filename(page_name)}_ids'
ids = []
try:
    ids = json.load(open(ids_fn, 'r'))
except FileNotFoundError:
    pass

while True:
    r = session.get(url, params=params)
    r.raise_for_status()
    data = r.json()

    for page in data["query"]["pages"]:
        print(page["title"])
        if page["title"] != page_name:
            continue
        for rev in page["revisions"]:
            ids.append(rev['revid'])
            with open(f'.wiki-revs/{rev["revid"]}.zlib', 'wb') as fp:
                b = zlib.compress(json.dumps(rev).encode('utf8'))
                fp.write(b)
        open(ids_fn, 'w').write(json.dumps(ids))

    if "continue" not in data:
        break
    print(data["continue"]["rvcontinue"])
    params["rvcontinue"] = data["continue"]["rvcontinue"]
    print(len(ids))
    if len(ids) >= target:
        break
    time.sleep(1)
