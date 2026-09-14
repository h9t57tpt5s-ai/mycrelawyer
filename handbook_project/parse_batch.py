#!/usr/bin/env python3
"""Parse a batch_output.md file (agent research output) into structured JSON
matching the schema used by tx_ca.json."""
import re
import json
import sys

def parse_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split into state blocks on "### State Name — Classification" or "### State Name - Classification"
    state_pattern = re.compile(r'^###\s+(.+?)\s+[—\-]\s+(.+?)\s*$', re.MULTILINE)
    matches = list(state_pattern.finditer(content))

    states = []
    for i, m in enumerate(matches):
        name = m.group(1).strip()
        classification_raw = m.group(2).strip()
        # normalize classification
        cl = classification_raw.lower()
        if 'landlord' in cl:
            classification = 'Landlord-Friendly'
        elif 'tenant' in cl:
            classification = 'Tenant-Friendly'
        else:
            classification = 'Neutral'

        start = m.end()
        end = matches[i+1].start() if i+1 < len(matches) else len(content)
        block = content[start:end].strip()

        # Split block into "**Heading.**" sections
        heading_pattern = re.compile(r'\*\*(.+?)\.\*\*')
        h_matches = list(heading_pattern.finditer(block))

        sections = []
        lease_considerations = []
        source_notes = ""

        for j, hm in enumerate(h_matches):
            heading = hm.group(1).strip()
            sec_start = hm.end()
            sec_end = h_matches[j+1].start() if j+1 < len(h_matches) else len(block)
            text = block[sec_start:sec_end].strip()

            if heading.lower().startswith('key commercial lease'):
                # parse bullets
                bullets = re.findall(r'^\s*[-*]\s+(.+)$', text, re.MULTILINE)
                lease_considerations = [b.strip() for b in bullets]
            elif heading.lower().startswith('source notes'):
                source_notes = text.strip()
            else:
                sections.append({"heading": heading, "text": text})

        states.append({
            "state": name,
            "classification": classification,
            "classificationRaw": classification_raw,
            "sections": sections,
            "leaseConsiderations": lease_considerations,
            "sourceNotes": source_notes
        })
    return states

if __name__ == '__main__':
    path = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else None
    result = parse_file(path)
    js = json.dumps(result, indent=2, ensure_ascii=False)
    if out:
        with open(out, 'w', encoding='utf-8') as f:
            f.write(js)
        print(f"Parsed {len(result)} states -> {out}")
        for s in result:
            n_sections = len(s['sections'])
            n_bullets = len(s['leaseConsiderations'])
            flag = "⚠" if "could not" in json.dumps(s).lower() or "⚠" in json.dumps(s) else " "
            print(f"  {flag} {s['state']:25s} [{s['classification']:16s}] sections={n_sections} bullets={n_bullets} source_notes={'YES' if s['sourceNotes'] else 'MISSING'}")
    else:
        print(js)
