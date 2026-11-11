"""Site menu (2026-11-11): one definition of the top navigation, written into
every page.

Jeff, 2026-11-11: the site was confusing, the Tracker menu had drifted from
its original plan, and finding anything took clicking around. The menu is
now organized by what a visitor is looking for:

  Litigation  lawsuits and rulings (the original Tracker)
  Distress    foreclosures, CMBS defaults, bankruptcies, bank credit
  Research    market data, reports, judges and companies
  Tools       calculators and checkers
  Guides      practical guides
  Alerts      everything that emails you
  About, Contact

Every page carries its own copy of the menu (no build step), so this script
rewrites the <ul class="nav-links"> block in each page, keeping the page's
link style (relative or root-absolute) and marking the section the page
belongs to as active. Pages built by scripts copy their menu from a template
page, so they pick it up on their next build too.

  python3 scripts/site_nav.py          rewrite every page
  python3 scripts/site_nav.py --check  exit 1 if any page differs
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# (label, landing page, [(group label or None, [(link label, href)])])
MENU = [
    ("Litigation", "tracker-overview.html", [(None, [
        ("All Matters", "litigation.html"),
        ("Latest Updates", "updates.html?recent=5"),
        ("Litigation Calendar", "calendar.html"),
        ("CRE Litigation Index", "litigation-index.html"),
        ("Office Foreclosure &amp; Receivership Tracker", "office-foreclosure-tracker.html"),
        ("New State Court Filings", "state-court-watch.html"),
        ("New Federal Lawsuits", "lawsuit-watch.html"),
        ("Regulatory Issues", "regulatory.html"),
    ])]),
    ("Distress", "distress-radar.html", [(None, [
        ("Distress Radar", "distress-radar.html"),
        ("Markets by State &amp; Metro", "markets.html"),
        ("Texas Foreclosure Sales", "texas-foreclosures.html"),
        ("CMBS Distress Watch", "cmbs-watch.html"),
        ("Chapter 11 Watch", "bankruptcy-watch.html"),
        ("Bank CRE Stress", "bank-cre-stress.html"),
    ])]),
    ("Research", "analysis-overview.html", [
        ("Market Data &amp; Reports", [
            ("Market Signals", "trends.html"),
            ("The CRE Distress Brief (Weekly)", "briefs.html"),
            ("Quarterly Report", "quarterly.html"),
            ("Property Type Insights", "property-types.html"),
            ("Litigation Patterns by State", "ada-litigation-patterns.html"),
        ]),
        ("People &amp; Companies", [
            ("Judges &amp; Courts", "judges.html"),
            ("Companies &amp; Parties", "companies.html"),
            ("Compare Companies", "compare-companies.html"),
        ]),
    ]),
    ("Tools", "tools-overview.html", [
        ("AI-Powered", [
            ("Case Value Calculator (Beta)", "case-valuation.html"),
            ("Calculator Track Record", "case-valuation-calibration.html"),
            ("Lease Clause Redline Checker (Beta)", "lease-clause-redline.html"),
        ]),
        ("Calculators &amp; Reference", [
            ("Settlement &amp; Verdict Benchmarks", "settlement-benchmarks.html"),
            ("Contribute a Settlement (Earn Credits)", "contribute-settlement.html"),
            ("Mechanic's Lien Deadline Calculator", "lien-deadline-calculator.html"),
            ("Lease Rejection Claim Calculator", "lease-rejection-claim-calculator.html"),
            ("ADA Title III Risk Flagging", "ada-risk-flagging.html"),
            ("Premises Liability Checklist (Manager Edition)", "premises-liability-checklist.html"),
        ]),
    ]),
    ("Guides", "guides-overview.html", [(None, [
        ("Commercial Eviction Handbook", "eviction-guide.html"),
        ("Premises Liability / Negligence Guide", "premises-liability-guide.html"),
        ("Insurance &amp; Risk Posture Guide", "insurance-risk-posture-guide.html"),
        ("Manager vs. Owner Liability", "manager-vs-owner-liability.html"),
        ("Algorithmic Pricing: A Manager's Guide", "algorithmic-pricing-manager-guide.html"),
        ("State-by-State Guides", "state-guides.html"),
    ])]),
    ("Alerts", "monitor.html", [(None, [
        ("Portfolio &amp; Counterparty Alerts", "monitor.html"),
        ("Distress Radar Alerts", "distress-radar.html#alerts"),
        ("Watchlists &amp; Portfolio", "account.html"),
        ("The Weekly Email", "newsletter.html"),
        ("Alert Log", "alert-log.html"),
    ])]),
]
PLAIN = [("About", "about.html"), ("Contact", "contact.html")]

# Which section a page belongs to (for the active marker), by file or folder.
SECTION_OF = {}
for label, landing, groups in MENU:
    SECTION_OF[landing.split("#")[0].split("?")[0]] = label
    for _, links in groups:
        for _, href in links:
            SECTION_OF.setdefault(href.split("#")[0].split("?")[0], label)
SECTION_OF.update({
    "matters": "Litigation", "state-cases": "Litigation", "federal-cases": "Litigation", "data-center-tracker.html": "Litigation",
    "markets": "Distress", "cmbs": "Distress", "chapter-11": "Distress", "properties": "Distress",
    "parties": "Research", "directory-overview.html": "Research", "brief-": "Research",
    "judge-": "Research", "company-": "Research",
})
for label, href in PLAIN:
    SECTION_OF[href] = label


def section_for(path: pathlib.Path) -> str:
    rel = path.relative_to(ROOT)
    if len(rel.parts) > 1:
        return SECTION_OF.get(rel.parts[0], "")
    name = rel.name
    if name in SECTION_OF:
        return SECTION_OF[name]
    for prefix in ("brief-", "judge-", "company-"):
        if name.startswith(prefix):
            return SECTION_OF[prefix]
    return ""


CARET = '<svg class="nav-caret" viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'


def render(prefix: str, active: str, page: str = "") -> str:
    act = lambda label: ' class="active"' if label == active else ""
    marked = [False]

    def here(href: str) -> str:
        # The page's own entry in a dropdown, once (main.js then marks its section).
        if not marked[0] and "#" not in href and href.split("?")[0] == page:
            marked[0] = True
            return ' class="active"'
        return ""
    out = ['<ul class="nav-links">']
    for label, landing, groups in MENU:
        out += [
            '      <li class="nav-item has-dropdown">',
            f'        <a href="{prefix}{landing}"{act(label)}>{label}</a>',
            f'        <button class="nav-caret-btn" aria-label="Toggle {label} submenu" aria-expanded="false">',
            f"          {CARET}",
            "        </button>",
            '        <div class="nav-dropdown">',
        ]
        for group, links in groups:
            if group:
                out.append(f'          <div class="nav-dropdown-label">{group}</div>')
            out += [f'          <a href="{prefix}{href}"{here(href)}>{text}</a>' for text, href in links]
        out += ["        </div>", "      </li>"]
    out += [f'      <li class="nav-item"><a href="{prefix}{href}"{act(label)}>{label}</a></li>' for label, href in PLAIN]
    out.append("    </ul>")
    return "\n".join(out)


FOOTER = re.compile(r'(<h4>Navigate</h4>)(.*?)(\n\s*</div>)', re.S)


def footer(prefix: str) -> str:
    links = [(label, landing) for label, landing, _ in MENU] + PLAIN
    return "".join(f'\n        <a href="{prefix}{href}">{label}</a>' for label, href in links)


BLOCK = re.compile(r'<ul class="nav-links">.*?</ul>(?=\s*\n\s*<div class="nav-cta">)', re.S)


def main() -> int:
    check = "--check" in sys.argv
    changed = 0
    for p in sorted(ROOT.rglob("*.html")):
        if any(part in (".git", "node_modules", ".task-tmp", ".claude") for part in p.relative_to(ROOT).parts):
            continue
        s = p.read_text()
        m = BLOCK.search(s)
        if not m:
            continue
        prefix = "/" if 'href="/litigation.html"' in m.group(0) or len(p.relative_to(ROOT).parts) > 1 else ""
        page = p.name if len(p.relative_to(ROOT).parts) == 1 else ""
        new = s[:m.start()] + render(prefix, section_for(p), page) + s[m.end():]
        new = FOOTER.sub(lambda f: f.group(1) + footer(prefix) + f.group(3), new, count=1)
        if new != s:
            changed += 1
            if not check:
                p.write_text(new)
    print(f"{changed} page{'s' if changed != 1 else ''} {'differ' if check else 'updated'}")
    return 1 if check and changed else 0


if __name__ == "__main__":
    sys.exit(main())
