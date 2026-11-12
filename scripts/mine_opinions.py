"""Mine published court opinions for commercial real estate case outcomes.

Jeff, 2026-11-11/12: the calculator cannot improve without many more
resolved state court cases; "38 state court filings since July 9 is
nothing." Appellate and trial-court opinions say what was claimed, what
the trial court awarded and what the appeal did, so they are the largest
free source of CRE outcomes. Source: CourtListener's quarterly bulk files
(Public Domain Mark; no API, no account), streamed so the 55 GB opinions
file never has to fit on disk.

Output goes to case_valuation_project/data/research/opinions/ (gitignored:
the outcome database is proprietary and must never enter the public repo).

  # pass 1: stream every opinion, keep likely CRE outcome opinions
  curl -s $BULK/opinions-2026-09-30.csv.bz2 | bzcat | \
      python3 scripts/mine_opinions.py filter OUT/candidates.jsonl.gz
  # pass 2/3: attach date, case name and court from the clusters and dockets files
  curl -s $BULK/opinion-clusters-2026-09-30.csv.bz2 | bzcat | \
      python3 scripts/mine_opinions.py clusters OUT/candidates.jsonl.gz OUT/clusters.json
  curl -s $BULK/dockets-2026-09-30.csv.bz2 | bzcat | \
      python3 scripts/mine_opinions.py dockets OUT/clusters.json OUT/dockets.json
"""
import csv
import gzip
import html
import json
import re
import sys
import time

csv.field_size_limit(sys.maxsize)

# Commercial real estate terms. A candidate needs two different ones, so a
# passing mention ("the hotel where the meeting took place") is not enough.
CRE = re.compile(
    r"\b(commercial lease|shopping (?:center|mall)|strip (?:center|mall)|office (?:building|space|tower|park)"
    r"|retail (?:space|center|premises|store|tenant)|warehouse|industrial (?:building|property|park|space)"
    r"|hotel|motel|apartment complex|multifamily|commercial (?:property|real estate|building|premises|space|tenant|landlord|tenancy|mortgage|loan|unit)"
    r"|ground lease|eminent domain|condemnation|just compensation|inverse condemnation|mechanic'?s lien|materialm[ae]n'?s lien"
    r"|construction defect|general contractor|rezoning|zoning (?:board|variance|ordinance|commission)|special use permit|site plan"
    r"|deed of trust|receivership|guarant(?:y|or) of (?:the )?lease|holdover|common area maintenance|triple[- ]net|tenant improvements?"
    r"|anchor tenant|rentable square|leasable|square feet|lease term|base rent|security deposit|right of first refusal|option to purchase"
    r"|premises liability|slip and fall|business invitee|self[- ]storage|data center|medical office|nursing home|senior living)\b",
    re.I,
)
DOLLARS = re.compile(r"\$\s?\d{1,3}(?:,\d{3})+")          # $1,000 and up
OUTCOME = re.compile(r"\b(?:judgment|awarded|verdict|damages)\b", re.I)
MODERN = re.compile(r"\b(?:199\d|20[0-2]\d)\b")           # cites a 1990+ year
TAGS = re.compile(r"<[^>]+>")
TEXT_FIELDS = ("plain_text", "html_with_citations", "html_columbia", "html_lawbox", "xml_harvard", "html", "html_anon_2020")


def _check(item):
    """Worker: keep an opinion if it reads like a CRE outcome (runs in a pool)."""
    oid, cluster, url, field, raw = item
    t = raw if field == "plain_text" else html.unescape(TAGS.sub(" ", raw))
    t = re.sub(r"[ \t]+", " ", t)
    if len(t) < 1500 or not MODERN.search(t) or not DOLLARS.search(t):
        return None
    terms = {m.lower() for m in CRE.findall(t)}
    if len(terms) < 2 or not OUTCOME.search(t):
        return None
    return {"id": oid, "cluster_id": cluster, "download_url": url, "terms": sorted(terms), "text": t}


def cmd_filter(out: str) -> None:
    import multiprocessing as mp
    r = csv.reader(sys.stdin, escapechar="\\", doublequote=False)
    head = next(r)
    idx = {h: i for i, h in enumerate(head)}
    fields = [(f, idx[f]) for f in TEXT_FIELDS]
    counts = {"read": 0, "kept": 0}
    t0 = time.time()

    def items():
        for rec in r:
            counts["read"] += 1
            if counts["read"] % 200000 == 0:
                print(f"{counts['read']:,} read, {counts['kept']:,} kept, {time.time()-t0:,.0f}s", file=sys.stderr, flush=True)
            if len(rec) != len(head):
                continue
            for f, i in fields:
                if len(rec[i]) > 200:
                    yield (rec[idx["id"]], rec[idx["cluster_id"]], rec[idx["download_url"]], f, rec[i])
                    break

    with gzip.open(out, "wt") as fo, mp.Pool(max(1, (mp.cpu_count() or 2) - 1)) as pool:
        for hit in pool.imap_unordered(_check, items(), chunksize=64):
            if hit:
                counts["kept"] += 1
                fo.write(json.dumps(hit) + "\n")
    print(f"done: {counts['read']:,} read, {counts['kept']:,} kept, {time.time()-t0:,.0f}s", file=sys.stderr)


def cmd_clusters(cands: str, out: str) -> None:
    want = set()
    with gzip.open(cands, "rt") as f:
        for line in f:
            want.add(json.loads(line)["cluster_id"])
    r = csv.reader(sys.stdin, escapechar="\\", doublequote=False)
    head = next(r)
    idx = {h: i for i, h in enumerate(head)}
    keep = ("docket_id", "date_filed", "case_name", "case_name_full", "precedential_status", "disposition", "posture", "syllabus", "judges")
    found = {}
    for rec in r:
        if len(rec) == len(head) and rec[idx["id"]] in want:
            found[rec[idx["id"]]] = {k: rec[idx[k]] for k in keep if k in idx}
    json.dump(found, open(out, "w"))
    print(f"{len(found):,} of {len(want):,} clusters found", file=sys.stderr)


def cmd_dockets(clusters: str, out: str) -> None:
    want = {c["docket_id"] for c in json.load(open(clusters)).values()}
    r = csv.reader(sys.stdin, escapechar="\\", doublequote=False)
    head = next(r)
    idx = {h: i for i, h in enumerate(head)}
    keep = ("court_id", "docket_number", "case_name", "appeal_from_str")
    found = {}
    for rec in r:
        if len(rec) == len(head) and rec[idx["id"]] in want:
            found[rec[idx["id"]]] = {k: rec[idx[k]] for k in keep if k in idx}
    json.dump(found, open(out, "w"))
    print(f"{len(found):,} of {len(want):,} dockets found", file=sys.stderr)


if __name__ == "__main__":
    cmd, *a = sys.argv[1:]
    {"filter": cmd_filter, "clusters": cmd_clusters, "dockets": cmd_dockets}[cmd](*a)
