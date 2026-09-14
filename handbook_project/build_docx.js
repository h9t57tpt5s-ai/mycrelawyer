const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  Header, Footer, PageNumber, TabStopType, TabStopPosition,
  TableOfContents, LevelFormat, convertInchesToTwip, VerticalAlign, PositionalTab,
  PositionalTabAlignment, PositionalTabLeader, SectionType
} = require('docx');

const DATA_DIR = path.join(__dirname, 'data');
const front = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'front_matter.json'), 'utf-8'));
const states = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'all_states.json'), 'utf-8'));
const appendixFacts = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'appendix_facts.json'), 'utf-8'));

const NAVY = '1B2A4A';
const GOLD = '9C7A32';
const INK = '222222';
const MUTED = '5A5A5A';
const GREEN = '1E7A34';
const RED = 'B3241C';
const GRAY = '5A5A5A';

const FONT_SERIF = 'Georgia';
const FONT_SANS = 'Calibri';

function classColor(c) {
  if (c === 'Landlord-Friendly') return GREEN;
  if (c === 'Tenant-Friendly') return RED;
  return GRAY;
}

// ---------- helpers ----------
function bodyPara(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 160, line: 288 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, font: FONT_SERIF, size: 22, color: INK })],
    ...opts,
  });
}

function sectionHeading(text) {
  return new Paragraph({
    spacing: { before: 220, after: 80 },
    children: [new TextRun({ text, bold: true, font: FONT_SANS, size: 21, color: NAVY })],
  });
}

function bulletPara(text) {
  return new Paragraph({
    numbering: { reference: 'lease-bullets', level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, font: FONT_SERIF, size: 22, color: INK })],
  });
}

function sourceNotePara(text) {
  return new Paragraph({
    spacing: { before: 160, after: 60 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'C9C9C9', space: 8 } },
    children: [
      new TextRun({ text: 'Source Notes.  ', bold: true, italics: true, font: FONT_SANS, size: 18, color: MUTED }),
      new TextRun({ text, italics: true, font: FONT_SANS, size: 18, color: MUTED }),
    ],
  });
}

function chapterOpener(stateObj) {
  const color = classColor(stateObj.classification);
  return [
    new Paragraph({
      pageBreakBefore: true,
      spacing: { before: 0, after: 40 },
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: stateObj.state, bold: true, font: FONT_SANS, size: 40, color: NAVY })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 6 } },
      children: [
        new TextRun({ text: stateObj.classification.toUpperCase(), bold: true, font: FONT_SANS, size: 18, color, characterSpacing: 20 }),
      ],
    }),
    ...(stateObj.classificationNote ? [new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: stateObj.classificationNote, italics: true, font: FONT_SERIF, size: 20, color: MUTED })],
    })] : []),
  ];
}

function buildStateChapter(stateObj) {
  const out = [...chapterOpener(stateObj)];
  for (const sec of stateObj.sections) {
    out.push(sectionHeading(sec.heading));
    out.push(bodyPara(sec.text));
  }
  if (stateObj.leaseConsiderations && stateObj.leaseConsiderations.length) {
    out.push(sectionHeading('Key Commercial Lease Drafting Considerations'));
    for (const b of stateObj.leaseConsiderations) out.push(bulletPara(b));
  }
  if (stateObj.sourceNotes) {
    out.push(sourceNotePara(stateObj.sourceNotes));
  }
  return out;
}

// ---------- front matter ----------
const titlePage = [
  new Paragraph({ spacing: { before: 2400 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text: front.title, bold: true, font: FONT_SANS, size: 64, color: NAVY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [new TextRun({ text: front.subtitle, font: FONT_SERIF, italics: true, size: 28, color: MUTED })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 3000 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: GOLD, space: 12 }, bottom: { style: BorderStyle.SINGLE, size: 4, color: GOLD, space: 12 } },
    children: [new TextRun({ text: front.edition, bold: true, font: FONT_SANS, size: 24, color: GOLD, characterSpacing: 30 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [new TextRun({ text: front.author, font: FONT_SANS, size: 24, color: INK })],
  }),
];

const copyrightPage = [
  new Paragraph({ pageBreakBefore: true, spacing: { before: 6000, after: 80 }, children: [new TextRun({ text: `Copyright © ${front.copyrightYear} ${front.copyrightHolder}. All rights reserved.`, font: FONT_SANS, size: 18, color: MUTED })] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: `${front.edition}. No part of this publication may be reproduced, distributed, or transmitted in any form or by any means, including photocopying, recording, or other electronic or mechanical methods, without the prior written permission of the copyright holder, except in the case of brief quotations embodied in critical reviews and certain other noncommercial uses permitted by copyright law.`, font: FONT_SANS, size: 18, color: MUTED })] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: front.disclaimer, font: FONT_SANS, size: 18, color: MUTED })] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: front.scopeNote, font: FONT_SANS, size: 18, color: MUTED })] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: front.revisionBasis, font: FONT_SANS, size: 18, color: MUTED })] }),
];

const tocPage = [
  new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, spacing: { after: 200 }, children: [new TextRun({ text: 'Contents', bold: true, font: FONT_SANS, size: 32, color: NAVY })] }),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-1' }),
];

const prefacePage = [
  new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, spacing: { after: 200 }, children: [new TextRun({ text: 'How to Use This Handbook', bold: true, font: FONT_SANS, size: 32, color: NAVY })] }),
  bodyPara('This handbook is organized as a jurisdiction-by-jurisdiction quick-reference guide for commercial landlords, in-house real estate counsel, and outside counsel evaluating how to recover possession of leased commercial premises following a tenant default. Each chapter addresses the same five core questions:'),
  ...front.methodology.map((m, i) => bulletPara(m)),
  bodyPara('Although statutory interpretation and case law relating to these issues is constantly evolving and counsel should be consulted for a complete evaluation of the circumstances relating to any specific landlord-tenant matter, this handbook provides a practical starting point for commercial landlords evaluating their options on a given default.'),
  sectionHeading('Landlord-Friendly / Tenant-Friendly / Neutral Classification'),
  bodyPara(front.colorKeyIntro),
  bodyPara('Landlord-Friendly chapters are marked in green, Tenant-Friendly chapters are marked in red, and Neutral chapters are marked in gray.'),
];

// ---------- appendix quick-reference table ----------
function buildAppendixTable() {
  const headerCells = ['State', 'Classification', 'Self-Help Available?', 'Possession + Damages Combined?'].map(h =>
    new TableCell({
      shading: { type: ShadingType.CLEAR, fill: NAVY },
      width: { size: 2500, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, font: FONT_SANS, size: 18, color: 'FFFFFF' })] })],
    })
  );

  const rows = [new TableRow({ tableHeader: true, children: headerCells })];

  states.forEach((s, idx) => {
    const shade = idx % 2 === 0 ? 'FFFFFF' : 'F4F1EA';
    const color = classColor(s.classification);
    const facts = appendixFacts[s.state] || {};
    const selfHelpText = facts.selfHelp || 'See chapter';
    const combinedText = facts.combine || 'See chapter';

    const cells = [s.state, s.classification, selfHelpText, combinedText].map((val, i) =>
      new TableCell({
        shading: { type: ShadingType.CLEAR, fill: shade },
        width: { size: 2500, type: WidthType.DXA },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: val, font: FONT_SANS, size: 18, color: i === 1 ? color : INK, bold: i === 1 })] })],
      })
    );
    rows.push(new TableRow({ children: cells }));
  });

  return new Table({
    width: { size: 10000, type: WidthType.DXA },
    columnWidths: [2500, 2500, 2500, 2500],
    rows,
  });
}

const appendixPage = [
  new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, spacing: { after: 80 }, children: [new TextRun({ text: 'Appendix A: 50-State Quick-Reference Table', bold: true, font: FONT_SANS, size: 32, color: NAVY })] }),
  bodyPara('This table is a screening tool only. "Self-Help Available?" reflects the general statutory default for a commercial tenancy and can be altered by lease language in many states; "Possession + Damages Combined?" reflects whether a single proceeding can typically resolve both possession and money damages. Always confirm current chapter text and consult local counsel before acting.'),
  new Paragraph({ spacing: { before: 120 }, children: [] }),
  buildAppendixTable(),
];

// ---------- header / footer ----------
const header = new Header({
  children: [
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C9C9C9', space: 4 } },
      children: [
        new TextRun({ text: front.title, font: FONT_SANS, size: 16, color: MUTED }),
        new TextRun({ text: '\t' + front.edition, font: FONT_SANS, size: 16, color: MUTED }),
      ],
    }),
  ],
});

const footer = new Footer({
  children: [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ children: [PageNumber.CURRENT], font: FONT_SANS, size: 16, color: MUTED }),
      ],
    }),
  ],
});

// ---------- assemble ----------
const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'lease-bullets',
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(0.35), hanging: convertInchesToTwip(0.2) } } } },
        ],
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: FONT_SERIF, size: 22, color: INK } },
    },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: FONT_SANS, size: 40, bold: true, color: NAVY },
        paragraph: { spacing: { before: 0, after: 120 }, outlineLevel: 0 },
      },
    ],
  },
  sections: [
    // Title + copyright: no header/footer, no page numbers
    {
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
        titlePage: true,
      },
      children: [...titlePage, ...copyrightPage],
    },
    // Main body with header/footer + TOC
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
      },
      headers: { default: header },
      footers: { default: footer },
      children: [
        ...tocPage,
        ...prefacePage,
        ...states.flatMap(buildStateChapter),
        ...appendixPage,
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  const outPath = path.join(__dirname, 'output', 'Commercial_Eviction_Handbook_2026_Edition.docx');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buffer);
  console.log('Wrote', outPath, buffer.length, 'bytes');
});
