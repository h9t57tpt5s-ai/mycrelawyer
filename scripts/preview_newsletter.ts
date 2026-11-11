// Local preview of the weekly email from the repo's own data files:
//   deno run --allow-read --allow-write scripts/preview_newsletter.ts [YYYY-MM-DD] [out.html]
// Writes the HTML issue (default .task-tmp/newsletter-preview.html) and prints the subject.
import { buildIssue, type Inputs, renderIssue } from "../supabase/functions/newsletter/issue.ts";

const read = async <T>(p: string): Promise<T | undefined> => {
  try { return JSON.parse(await Deno.readTextFile(p)) as T; } catch { return undefined; }
};
const src = await Deno.readTextFile("js/data-lite.js");
const data = JSON.parse(src.slice(src.indexOf("const RELAW_DATA = ") + 19, src.lastIndexOf(";")));
const today = Deno.args[0] && Deno.args[0] !== "today" ? new Date(Deno.args[0] + "T13:00:00Z") : new Date();
const issue = buildIssue({
  data, today,
  activity: await read<Inputs["activity"]>("ops/docket-activity.json"), ch11: await read<Inputs["ch11"]>("ops/ch11-petitions.json"),
  fed: await read<Inputs["fed"]>("ops/federal-suits.json"), cmbs: await read<Inputs["cmbs"]>("ops/cmbs-distress.json"),
  tx: await read<Inputs["tx"]>("ops/tx-foreclosures.json"), pulse: await read<Inputs["pulse"]>("ops/market-pulse.json"),
});
const { html, text, subject } = renderIssue(issue, "https://credocket.com/newsletter.html", "CREdocket · 901 Main Street, Suite 5200, Dallas, TX 75202");
const out = Deno.args[1] || ".task-tmp/newsletter-preview.html";
// The public copy (email-preview.html, shown on newsletter.html) stays out of search results.
await Deno.writeTextFile(out, out.endsWith("email-preview.html")
  ? html.replace("<head>", '<head><meta name="robots" content="noindex"><base target="_top">') : html);
if (!out.endsWith("email-preview.html")) await Deno.writeTextFile(out.replace(/\.html$/, ".txt"), text);
console.log(subject);
console.log(`${issue.matters.length} matters, ${issue.insights.length} insights, ${issue.radar.length} radar items -> ${out}`);
