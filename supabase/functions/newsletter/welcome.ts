// Welcome email for new CREdocket accounts (2026-11-16).
//
// 12 real people signed up by mid-November and none had set up an alert:
// after the confirmation email they heard nothing. This is one short note
// sent once, after the address is confirmed, pointing at the three things
// that bring a reader back: company alerts, topic alerts and the weekly
// brief, plus the free tools. Plain wording, no claims about any company,
// and no mention of how write-ups are produced.

const SITE = "https://credocket.com";
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

const STEPS = [
  {
    title: "Follow the companies you work with",
    body: "Enter tenants, borrowers, guarantors, lenders or owners. We email you when one of them shows up in a new commercial real estate lawsuit, Chapter 11 filing or SEC filing.",
    cta: "Add companies",
    href: `${SITE}/account.html#portfolio`,
  },
  {
    title: "Get alerts for your case types and states",
    body: "Pick a category, such as lease disputes or construction, and the states you care about. New matters that match come to your inbox.",
    cta: "Set up an alert",
    href: `${SITE}/account.html#watchlist-form`,
  },
  {
    title: "Read the weekly brief",
    body: "Every Monday: the week's new commercial real estate cases and rulings, what they mean, and the numbers behind them.",
    cta: "Get the weekly email",
    href: `${SITE}/newsletter.html`,
  },
];

const TOOLS = [
  { name: "Case value calculator", href: `${SITE}/case-valuation.html`, note: "a damages range for your own dispute, from both sides' facts" },
  { name: "Court outcomes by state", href: `${SITE}/outcomes.html`, note: "how lease, loan, condemnation and construction cases have ended" },
  { name: "Lease clause checker", href: `${SITE}/lease-clause-redline.html`, note: "compare a clause to market practice" },
  { name: "Lien deadline calculator", href: `${SITE}/lien-deadline-calculator.html`, note: "notice and filing deadlines in every state" },
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function renderWelcome(postalAddress: string): { subject: string; html: string; text: string } {
  const subject = "Welcome to CREdocket: three ways to stay on top of your cases";
  const steps = STEPS.map((s, i) => `
    <tr><td style="padding:0 0 18px;">
      <div style="font:600 12px/1.3 ${SANS};color:#3355ff;letter-spacing:.06em;text-transform:uppercase;">Step ${i + 1}</div>
      <div style="font:700 17px/1.35 ${SERIF};color:#0b1020;margin-top:4px;">${esc(s.title)}</div>
      <div style="font:400 14.5px/1.6 ${SANS};color:#3d4453;margin-top:6px;">${esc(s.body)}</div>
      <a href="${s.href}" style="display:inline-block;margin-top:10px;background:#3355ff;color:#ffffff;text-decoration:none;font:600 14px/1 ${SANS};padding:11px 16px;border-radius:6px;">${esc(s.cta)}</a>
    </td></tr>`).join("");
  const tools = TOOLS.map((t) => `<li style="margin:0 0 6px;"><a href="${t.href}" style="color:#1b2e99;font-weight:600;">${esc(t.name)}</a>: ${esc(t.note)}</li>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#f2f3f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f3f6;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;">
  <tr><td style="background:#10131c;border-radius:10px 10px 0 0;padding:26px 28px;">
    <div style="font:700 26px/1.2 ${SERIF};color:#ffffff;">Welcome to CREdocket</div>
    <div style="font:400 14.5px/1.55 ${SANS};color:#b9c2da;margin-top:8px;">Commercial real estate lawsuits and rulings, explained in plain English.</div>
  </td></tr>
  <tr><td style="padding:26px 28px 8px;">
    <p style="font:400 15px/1.6 ${SANS};color:#0b0d12;margin:0 0 20px;">Thanks for signing up. Your free account reads every write-up in full. Three things take a minute to set up and make the site work for you:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${steps}</table>
  </td></tr>
  <tr><td style="padding:0 28px 22px;">
    <div style="border-top:1px solid #e2e5eb;padding-top:18px;font:700 15px/1.3 ${SERIF};color:#0b1020;">Free tools</div>
    <ul style="font:400 14px/1.55 ${SANS};color:#3d4453;padding-left:18px;margin:10px 0 0;">${tools}</ul>
    <p style="font:400 14.5px/1.6 ${SANS};color:#0b0d12;margin:18px 0 0;">What are you following? Reply to this email and tell us. We read every reply, and it shapes what we cover next.</p>
  </td></tr>
  <tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e5eb;font:400 12px/1.55 ${SANS};color:#626b7d;">
    You're getting this one-time email because you created a CREdocket account. CREdocket summarizes public records and reporting and is not legal advice.<br>${esc(postalAddress)}
  </td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    "Welcome to CREdocket",
    "Commercial real estate lawsuits and rulings, explained in plain English.",
    "",
    "Thanks for signing up. Your free account reads every write-up in full. Three things take a minute to set up:",
    "",
    ...STEPS.flatMap((s, i) => [`${i + 1}. ${s.title}`, s.body, `${s.cta}: ${s.href}`, ""]),
    "Free tools:",
    ...TOOLS.map((t) => `- ${t.name} (${t.note}): ${t.href}`),
    "",
    "What are you following? Reply to this email and tell us. We read every reply.",
    "",
    "You're getting this one-time email because you created a CREdocket account. CREdocket summarizes public records and reporting and is not legal advice.",
    postalAddress,
  ].join("\n");
  return { subject, html, text };
}
