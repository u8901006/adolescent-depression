#!/usr/bin/env node
/**
 * Fetch latest adolescent depression research papers from PubMed E-utilities API.
 * Uses search terms from the Adolescent Depression Research Toolkit.
 * Filters out already-summarized PMIDs.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PUBMED_SEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const PUBMED_FETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
const HEADERS = { "User-Agent": "AdolescentDepressionBot/1.0 (research aggregator)" };

const DEPRESSION_BLOCK = `(depress*[tiab] OR "major depressive disorder"[tiab] OR MDD[tiab] OR "depressive symptoms"[tiab] OR "depressive episode"[tiab] OR "subthreshold depression"[tiab] OR anhedoni*[tiab] OR dysthymi*[tiab] OR "low mood"[tiab] OR irritab*[tiab] OR "depressive disorder"[tiab])`;

const ADOLESCENT_BLOCK = `(adolescen*[tiab] OR teen*[tiab] OR youth*[tiab] OR "young people"[tiab] OR "young person"[tiab] OR student*[tiab] OR "middle school"[tiab] OR "high school"[tiab] OR "secondary school"[tiab] OR puberty OR pubertal OR "young adult*"[tiab] OR pediatric*[tiab] OR paediatric*[tiab])`;

function getDateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10).replace(/-/g, "/");
}

function getTodayTaipei() {
  const now = new Date();
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return taipei.toISOString().slice(0, 10);
}

function sanitize(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .slice(0, 200);
}

function buildQuery(days = 7) {
  const fromDate = getDateNDaysAgo(days);
  const toDate = getDateNDaysAgo(0);
  const datePart = `"${fromDate}"[Date - Publication] : "${toDate}"[Date - Publication]`;
  return `${DEPRESSION_BLOCK} AND ${ADOLESCENT_BLOCK} AND ${datePart}`;
}

async function searchPapers(query, retmax = 50) {
  const url = `${PUBMED_SEARCH}?db=pubmed&term=${encodeURIComponent(query)}&retmax=${retmax}&sort=date&retmode=json`;
  try {
    const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data?.esearchresult?.idlist || [];
  } catch (e) {
    console.error(`[ERROR] PubMed search failed: ${e.message}`);
    return [];
  }
}

async function fetchDetails(pmids) {
  if (!pmids.length) return [];
  const ids = pmids.join(",");
  const url = `${PUBMED_FETCH}?db=pubmed&id=${ids}&retmode=xml`;
  try {
    const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const xml = await resp.text();
    return parseXml(xml);
  } catch (e) {
    console.error(`[ERROR] PubMed fetch failed: ${e.message}`);
    return [];
  }
}

function parseXml(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) => ["PubmedArticle", "AbstractText", "Keyword"].includes(name),
  });
  const parsed = parser.parse(xml);
  const articles = parsed?.PubmedArticleSet?.PubmedArticle || [];
  const papers = [];

  for (const article of articles) {
    try {
      const medline = article.MedlineCitation;
      const art = medline?.Article;
      if (!art) continue;

      const title = String(art.ArticleTitle || "").trim();

      const abstractParts = [];
      const absTexts = art.Abstract?.AbstractText;
      if (absTexts) {
        for (const absEl of Array.isArray(absTexts) ? absTexts : [absTexts]) {
          const label = absEl["@_Label"] || "";
          const text = typeof absEl === "string" ? absEl : String(absEl["#text"] || absEl || "");
          if (label && text) abstractParts.push(`${label}: ${text}`);
          else if (text) abstractParts.push(text);
        }
      }
      const abstract = abstractParts.join(" ").slice(0, 2000);

      const journal = String(art.Journal?.Title || "").trim();

      let dateStr = "";
      const pd = art.Journal?.JournalIssue?.PubDate;
      if (pd) {
        const parts = [pd.Year, pd.Month, pd.Day].filter(Boolean);
        dateStr = parts.join(" ");
      }

      const pmid = String(medline?.PMID || "");
      const link = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "";

      const keywords = [];
      const kwList = medline?.KeywordList?.Keyword;
      if (kwList) {
        for (const kw of Array.isArray(kwList) ? kwList : [kwList]) {
          const kwText = typeof kw === "string" ? kw : String(kw["#text"] || kw || "");
          if (kwText) keywords.push(kwText.trim());
        }
      }

      papers.push({
        pmid: sanitize(pmid),
        title: sanitize(title),
        journal: sanitize(journal),
        date: sanitize(dateStr),
        abstract,
        url: link,
        keywords: keywords.map(sanitize).slice(0, 10),
      });
    } catch {
      continue;
    }
  }
  return papers;
}

function loadSummarized() {
  const path = join(ROOT, "data", "summarized.json");
  if (!existsSync(path)) return {};
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return data.pmids || {};
  } catch {
    return {};
  }
}

function saveSummarized(pmids, date) {
  const path = join(ROOT, "data", "summarized.json");
  const existing = loadSummarized();
  for (const pmid of pmids) {
    if (!existing[pmid]) existing[pmid] = [];
    existing[pmid].push(date);
  }
  writeFileSync(path, JSON.stringify({ pmids: existing, lastUpdated: date }, null, 2), "utf-8");
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { days: 7, maxPapers: 50, output: "papers.json" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--days" && args[i + 1]) opts.days = parseInt(args[++i], 10);
    else if (args[i] === "--max-papers" && args[i + 1]) opts.maxPapers = parseInt(args[++i], 10);
    else if (args[i] === "--output" && args[i + 1]) opts.output = args[++i];
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  const date = getTodayTaipei();
  const summarized = loadSummarized();

  console.error(`[INFO] Searching PubMed for adolescent depression papers (last ${opts.days} days)...`);
  const query = buildQuery(opts.days);
  let pmids = await searchPapers(query, opts.maxPapers);
  console.error(`[INFO] Found ${pmids.length} papers`);

  const newPmids = pmids.filter((id) => !summarized[id]);
  console.error(`[INFO] After filtering summarized: ${newPmids.length} new papers`);

  if (!newPmids.length) {
    console.error("[INFO] No new papers to summarize");
    const output = { date, count: 0, papers: [] };
    writeFileSync(opts.output, JSON.stringify(output, null, 2), "utf-8");
    return;
  }

  const papers = await fetchDetails(newPmids);
  console.error(`[INFO] Fetched details for ${papers.length} papers`);

  const output = { date, count: papers.length, papers };
  writeFileSync(opts.output, JSON.stringify(output, null, 2), "utf-8");
  console.error(`[INFO] Saved to ${opts.output}`);
}

main().catch((e) => {
  console.error(`[FATAL] ${e.message}`);
  process.exit(1);
});
