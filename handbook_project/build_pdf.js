const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { PDFParse } = require('pdf-parse');

const DATA_DIR = path.join(__dirname, 'data');
const OUT_DIR = path.join(__dirname, 'output');
fs.mkdirSync(OUT_DIR, { recursive: true });

const front = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'front_matter.json'), 'utf-8'));
const states = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'all_states.json'), 'utf-8'));
const appendixFacts = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'appendix_facts.json'), 'utf-8'));

const NAVY = '#1B2A4A';
const GOLD = '#9C7A32';
const INK = '#222222';
const MUTED = '#5A5A5A';
const GREEN = '#1E7A34';
const RED = '#B3241C';
const GRAY = '#5A5A5A';
const HAIRLINE = '#D8D3C4';
const PAPER = '#FEFDFB';

function classColor(c) {
  if (c === 'Landlord-Friendly') return GREEN;
  if (c === 'Tenant-Friendly') return RED;
  return GRAY;
}
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function slug(s) {
  return 'ch-' + s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function selfHelpQuick(stateObj) {
  return (appendixFacts[stateObj.state] || {}).selfHelp || 'See ch.';
}
function combinedQuick(stateObj) {
  return (appendixFacts[stateObj.state] || {}).combine || 'See ch.';
}

function stateChapterHtml(s, idx) {
  const color = classColor(s.classification);
  const sectionsHtml = s.sections.map(sec => `
    <h3>${esc(sec.heading)}</h3>
    <p>${esc(sec.text)}</p>
  `).join('\n');

  const bulletsHtml = s.leaseConsiderations && s.leaseConsiderations.length ? `
    <h3>Key Commercial Lease Drafting Considerations</h3>
    <ul class="lease-list">
      ${s.leaseConsiderations.map(b => `<li>${esc(b)}</li>`).join('\n')}
    </ul>
  ` : '';

  const sourceHtml = s.sourceNotes ? `
    <div class="source-notes"><strong>Source Notes.</strong> ${esc(s.sourceNotes)}</div>
  ` : '';

  return `
  <section class="chapter" id="${slug(s.state)}">
    <span class="tocmark">◆TOCMARK:${esc(s.state)}◆</span>
    <div class="chapter-kicker">Chapter ${String(idx + 1).padStart(2, '0')}</div>
    <h1>${esc(s.state)}</h1>
    <div class="classification-bar" style="border-color:${color}">
      <span class="classification-tag" style="color:${color}">${esc(s.classification).toUpperCase()}</span>
    </div>
    ${s.classificationNote ? `<p class="classification-note">${esc(s.classificationNote)}</p>` : ''}
    ${sectionsHtml}
    ${bulletsHtml}
    ${sourceHtml}
  </section>`;
}

function appendixTableChunkHtml(chunk) {
  const rows = chunk.map(s => `
    <tr>
      <td>${esc(s.state)}</td>
      <td style="color:${classColor(s.classification)};font-weight:600;">${esc(s.classification)}</td>
      <td>${selfHelpQuick(s)}</td>
      <td>${combinedQuick(s)}</td>
    </tr>`).join('\n');
  return `
    <table class="appendix-table">
      <thead>
        <tr><th>State</th><th>Classification</th><th>Self-Help Available?</th><th>Possession + Damages Combined?</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Chromium's print engine repeats <thead> on automatic page breaks but does not
// respect the page's top margin when doing so, which collides with the running-
// header overlay. Avoid native long-table pagination entirely by manually
// chunking the appendix into fixed-size, single-page tables instead.
const APPENDIX_CHUNK_SIZE = 20;
function appendixPagesHtml() {
  const chunks = [];
  for (let i = 0; i < states.length; i += APPENDIX_CHUNK_SIZE) {
    chunks.push(states.slice(i, i + APPENDIX_CHUNK_SIZE));
  }
  return chunks.map((chunk, idx) => `
  <div class="appendix-page">
    ${idx === 0 ? '<span class="tocmark">◆TOCMARK:__APPENDIX__◆</span>' : ''}
    <h1>${idx === 0 ? 'Appendix A: 50-State Quick-Reference Table' : 'Appendix A (continued)'}</h1>
    ${idx === 0 ? '<p>This table is a screening tool only. "Self-Help Available?" reflects the general statutory default for a commercial tenancy and can be altered by lease language in many states; "Possession + Damages Combined?" reflects whether a single proceeding can typically resolve both possession and money damages. Always confirm current chapter text and consult local counsel before acting.</p>' : ''}
    ${appendixTableChunkHtml(chunk)}
  </div>`).join('\n');
}

function tocHtml(pageMap) {
  const rows = states.map((s, idx) => {
    const pg = pageMap ? pageMap[s.state] : null;
    return `<li><span class="toc-num">${String(idx + 1).padStart(2, '0')}</span><a href="#${slug(s.state)}"><span class="toc-title">${esc(s.state)}</span></a><span class="toc-pagenum">${pg || ''}</span></li>`;
  }).join('\n');
  return `<ol class="toc-list">${rows}</ol>`;
}

function buildHtml(pageMap) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: Letter; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    color: ${INK};
    background: ${PAPER};
    font-size: 11.5pt;
    line-height: 1.55;
  }
  .page-pad { padding: 0.9in 1in; }
  h1, h2, h3, .chapter-kicker, .toc-title, .classification-tag { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }

  /* ---------- Title page ---------- */
  .title-page {
    page-break-after: always;
    height: 9.9in;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0 1in;
  }
  .title-page .kicker { letter-spacing: 4px; color: ${GOLD}; font-size: 10pt; font-weight: 600; margin-bottom: 26px; text-transform: uppercase; }
  .title-page h1 { font-size: 40pt; color: ${NAVY}; margin: 0 0 18px; font-weight: 700; letter-spacing: -0.5px; }
  .title-page .subtitle { font-size: 15pt; color: ${MUTED}; font-style: italic; margin-bottom: 60px; max-width: 6in; font-family: Georgia, serif; }
  .title-page .edition-badge { border-top: 1.5px solid ${GOLD}; border-bottom: 1.5px solid ${GOLD}; padding: 10px 34px; font-size: 12.5pt; letter-spacing: 3px; color: ${GOLD}; font-weight: 700; margin-bottom: 50px; }
  .title-page .author { font-size: 13pt; color: ${INK}; letter-spacing: 1px; }

  /* ---------- Copyright / front matter ---------- */
  .frontmatter-page { page-break-after: always; padding: 0.5in 1in 0.9in; font-size: 9.5pt; color: ${MUTED}; }
  .frontmatter-page p { margin: 0 0 11px; text-align: justify; }
  .frontmatter-page .label { font-weight: 700; color: ${INK}; }

  .toc-page { page-break-after: always; padding: 0.4in 1in; }
  .toc-page h1 { font-size: 24pt; color: ${NAVY}; margin: 0 0 30px; border-bottom: 2px solid ${GOLD}; padding-bottom: 14px; }
  .toc-list { list-style: none; margin: 0; padding: 0; }
  .toc-list li a { text-decoration: none; color: ${INK}; }
  .toc-list li {
    position: relative; margin: 0; padding: 7px 40px 7px 34px;
    border-bottom: 1px dotted ${HAIRLINE};
    font-size: 11pt; overflow: hidden;
  }
  .toc-num { position: absolute; left: 0; top: 7px; color: ${GOLD}; font-weight: 700; font-size: 9.5pt; }
  .toc-title { }
  .toc-pagenum { position: absolute; right: 0; top: 7px; color: ${MUTED}; font-variant-numeric: tabular-nums; }

  .preface-page { page-break-after: always; padding: 0.4in 1in; }
  .preface-page h1 { font-size: 22pt; color: ${NAVY}; margin: 0 0 20px; }
  .preface-page h2 { font-size: 13.5pt; color: ${NAVY}; margin: 26px 0 10px; }
  .preface-page p { text-align: justify; margin: 0 0 12px; }
  .preface-page ul { margin: 0 0 14px; padding-left: 22px; }
  .preface-page li { margin-bottom: 8px; text-align: justify; }

  /* ---------- Chapters ---------- */
  .chapter { page-break-before: always; padding: 0.3in 1in 0.6in; }
  .tocmark { font-size: 0.1pt; color: ${PAPER}; opacity: 0.01; line-height: 0.1pt; }
  .chapter-kicker { font-size: 9pt; letter-spacing: 3px; text-transform: uppercase; color: ${GOLD}; font-weight: 700; margin-bottom: 6px; }
  .chapter h1 { font-size: 30pt; color: ${NAVY}; margin: 0 0 14px; font-weight: 700; }
  .classification-bar { border-bottom: 2.5px solid; padding-bottom: 12px; margin-bottom: 16px; }
  .classification-tag { font-size: 10pt; font-weight: 700; letter-spacing: 2.5px; }
  .classification-note { font-style: italic; color: ${MUTED}; font-size: 10.5pt; margin: 0 0 18px; }
  .chapter h3 { font-size: 12.5pt; color: ${NAVY}; margin: 18px 0 6px; font-weight: 700; }
  .chapter p { text-align: justify; margin: 0 0 10px; }
  .lease-list { margin: 6px 0 14px; padding-left: 20px; }
  .lease-list li { margin-bottom: 5px; text-align: justify; }
  .source-notes { margin-top: 16px; padding-top: 10px; border-top: 0.75px solid ${HAIRLINE}; font-size: 9pt; color: ${MUTED}; font-style: italic; text-align: justify; }
  .source-notes strong { font-style: normal; }

  /* ---------- Appendix ---------- */
  .appendix-page { page-break-before: always; padding: 0.3in 1in; }
  .appendix-page h1 { font-size: 22pt; color: ${NAVY}; margin: 0 0 14px; }
  .appendix-page > p { text-align: justify; margin-bottom: 18px; color: ${MUTED}; font-size: 10pt; }
  .appendix-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  .appendix-table th { background: ${NAVY}; color: #fff; text-align: left; padding: 7px 9px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9pt; letter-spacing: 0.3px; }
  .appendix-table td { padding: 6px 9px; border-bottom: 0.75px solid ${HAIRLINE}; }
  .appendix-table tr:nth-child(even) td { background: #F4F1EA; }
</style>
</head>
<body>

  <div class="title-page">
    <div class="kicker">A Practitioner's Reference</div>
    <h1>${esc(front.title)}</h1>
    <div class="subtitle">${esc(front.subtitle)}</div>
    <div class="edition-badge">${esc(front.edition)}</div>
    <div class="author">${esc(front.author)}</div>
  </div>

  <div class="frontmatter-page">
    <p><span class="label">Copyright &copy; ${esc(front.copyrightYear)} ${esc(front.copyrightHolder)}.</span> All rights reserved.</p>
    <p>${esc(front.edition)}. No part of this publication may be reproduced, distributed, or transmitted in any form or by any means, including photocopying, recording, or other electronic or mechanical methods, without the prior written permission of the copyright holder, except in the case of brief quotations embodied in critical reviews and certain other noncommercial uses permitted by copyright law.</p>
    <p><span class="label">Disclaimer.</span> ${esc(front.disclaimer)}</p>
    <p><span class="label">${esc(front.scopeNote.split('.')[0])}.</span> ${esc(front.scopeNote.split('.').slice(1).join('.').trim())}</p>
    <p><span class="label">Revision basis.</span> ${esc(front.revisionBasis.replace('Revision basis. ', ''))}</p>
  </div>

  <div class="toc-page">
    <h1>Contents</h1>
    ${tocHtml(pageMap)}
  </div>

  <div class="preface-page">
    <h1>How to Use This Handbook</h1>
    <p>This handbook is organized as a jurisdiction-by-jurisdiction quick-reference guide for commercial landlords, in-house real estate counsel, and outside counsel evaluating how to recover possession of leased commercial premises following a tenant default. Each chapter addresses the same five core questions:</p>
    <ul>
      ${front.methodology.map(m => `<li>${esc(m)}</li>`).join('\n')}
    </ul>
    <p>Although statutory interpretation and case law relating to these issues is constantly evolving and counsel should be consulted for a complete evaluation of the circumstances relating to any specific landlord-tenant matter, this handbook provides a practical starting point for commercial landlords evaluating their options on a given default.</p>
    <h2>Landlord-Friendly / Tenant-Friendly / Neutral Classification</h2>
    <p>${esc(front.colorKeyIntro)}</p>
    <p>Landlord-Friendly chapters are marked in <strong style="color:${GREEN}">green</strong>, Tenant-Friendly chapters are marked in <strong style="color:${RED}">red</strong>, and Neutral chapters are marked in <strong style="color:${GRAY}">gray</strong>.</p>
  </div>

  ${states.map(stateChapterHtml).join('\n')}

  ${appendixPagesHtml()}

</body>
</html>`;
}

const FOOTER_TEMPLATE = `
  <div style="font-family: Helvetica, Arial, sans-serif; font-size: 8px; color: #8a8a8a; width: 100%; text-align: center; padding-top: 4px;">
    <span class="pageNumber"></span>
  </div>`;
const EMPTY_HEADER = `<div></div>`;

async function renderPdf(html, outPath) {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: outPath,
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: EMPTY_HEADER,
      footerTemplate: FOOTER_TEMPLATE,
      margin: { top: '0.62in', bottom: '0.45in', left: '0in', right: '0in' },
    });
  } finally {
    await browser.close();
  }
}

async function findMarkerPages(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  await parser.destroy();
  const map = {};
  const markerRe = /◆TOCMARK:(.+?)◆/;
  (result.pages || []).forEach((pg, idx) => {
    const text = typeof pg === 'string' ? pg : (pg.text || '');
    const m = text.match(markerRe);
    if (m) map[m[1].trim()] = idx + 1; // 1-based page number
  });
  return map;
}

async function overlayRunningHeaders(inPath, outPath, pageMap) {
  const bytes = fs.readFileSync(inPath);
  const pdfDoc = await PDFDocument.load(bytes);
  const helv = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvR = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  // Build page -> current chapter label by forward-fill from marker pages
  const sortedEntries = Object.entries(pageMap).sort((a, b) => a[1] - b[1]);
  const firstChapterPage = sortedEntries.length ? sortedEntries[0][1] : Infinity;

  function labelForPage(pageNum1based) {
    let label = null;
    for (const [name, pg] of sortedEntries) {
      if (pg <= pageNum1based) label = name; else break;
    }
    return label;
  }

  pages.forEach((p, i) => {
    const pageNum = i + 1;
    if (pageNum < firstChapterPage) return; // skip title/copyright/toc/preface
    const label = labelForPage(pageNum);
    if (!label) return;
    const { width, height } = p.getSize();
    const rightText = `${front.title.toUpperCase()}`;
    const leftText = label === '__APPENDIX__' ? 'APPENDIX A' : label.toUpperCase();
    p.drawText(leftText, {
      x: 72, y: height - 32, size: 7.5, font: helv,
      color: rgb(0x1B / 255, 0x2A / 255, 0x4A / 255),
    });
    const rtWidth = helvR.widthOfTextAtSize(rightText, 7.5);
    p.drawText(rightText, {
      x: width - 72 - rtWidth, y: height - 32, size: 7.5, font: helvR,
      color: rgb(0x5A / 255, 0x5A / 255, 0x5A / 255),
    });
    p.drawLine({
      start: { x: 72, y: height - 38 }, end: { x: width - 72, y: height - 38 },
      thickness: 0.5, color: rgb(0xD8 / 255, 0xD3 / 255, 0xC4 / 255),
    });
  });

  const outBytes = await pdfDoc.save();
  fs.writeFileSync(outPath, outBytes);
}

(async () => {
  console.log('Pass 1: rendering without page numbers...');
  const html1 = buildHtml(null);
  const pass1Path = path.join(OUT_DIR, '_pass1.pdf');
  await renderPdf(html1, pass1Path);

  console.log('Scanning for chapter page numbers...');
  const pageMap = await findMarkerPages(pass1Path);
  console.log('Found', Object.keys(pageMap).length, 'markers (expected', states.length + 1, 'incl. appendix)');
  if (Object.keys(pageMap).length !== states.length + 1) {
    console.warn('WARNING: marker count mismatch.');
  }

  console.log('Pass 2: rendering with real page numbers...');
  const html2 = buildHtml(pageMap);
  const pass2Path = path.join(OUT_DIR, '_pass2.pdf');
  await renderPdf(html2, pass2Path);

  console.log('Overlaying running headers...');
  const finalPath = path.join(OUT_DIR, 'Commercial_Eviction_Handbook_2026_Edition.pdf');
  await overlayRunningHeaders(pass2Path, finalPath, pageMap);

  fs.unlinkSync(pass1Path);
  fs.unlinkSync(pass2Path);
  console.log('Wrote', finalPath);
})().catch(e => { console.error(e); process.exit(1); });
