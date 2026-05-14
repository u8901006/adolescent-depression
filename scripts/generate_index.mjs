#!/usr/bin/env node
/**
 * Generate index.html listing all adolescent depression daily reports.
 */

import { readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DOCS = join(ROOT, "docs");

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function getReportFiles() {
  try {
    return readdirSync(DOCS)
      .filter((f) => f.startsWith("report-") && f.endsWith(".html"))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function formatDate(filename) {
  const date = filename.replace("report-", "").replace(".html", "");
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const wd = WEEKDAYS[d.getDay()] || "";
  return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日（週${wd}）`;
}

function main() {
  const files = getReportFiles();
  const total = files.length;

  const links = files
    .slice(0, 60)
    .map((f) => `    <li><a href="${f}">\uD83D\uDCC5 ${formatDate(f)}</a></li>`)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Adolescent Depression · 青少年憂鬱症文獻日報</title>
<style>
  :root { --bg: #f6f1e8; --surface: #fffaf2; --line: #d8c5ab; --text: #2b2118; --muted: #766453; --accent: #8c4f2b; --accent-soft: #ead2bf; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: radial-gradient(circle at top, #fff6ea 0, var(--bg) 55%, #ead8c6 100%); color: var(--text); font-family: "Noto Sans TC", "PingFang TC", "Helvetica Neue", Arial, sans-serif; min-height: 100vh; }
  .container { position: relative; z-index: 1; max-width: 640px; margin: 0 auto; padding: 80px 24px; }
  .logo { font-size: 48px; text-align: center; margin-bottom: 16px; }
  h1 { text-align: center; font-size: 24px; color: var(--text); margin-bottom: 8px; }
  .subtitle { text-align: center; color: var(--accent); font-size: 14px; margin-bottom: 48px; }
  .count { text-align: center; color: var(--muted); font-size: 13px; margin-bottom: 32px; }
  ul { list-style: none; }
  li { margin-bottom: 8px; }
  a { color: var(--text); text-decoration: none; display: block; padding: 14px 20px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; transition: all 0.2s; font-size: 15px; }
  a:hover { background: var(--accent-soft); border-color: var(--accent); transform: translateX(4px); }
  .footer-links { margin-top: 40px; display: flex; flex-direction: column; gap: 10px; }
  .footer-link { display: flex; align-items: center; gap: 14px; padding: 16px 20px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; text-decoration: none; color: var(--text); transition: all 0.2s; }
  .footer-link:hover { background: var(--accent-soft); border-color: var(--accent); }
  .footer-icon { font-size: 24px; flex-shrink: 0; }
  .footer-name { font-size: 14px; font-weight: 600; flex: 1; }
  .footer-arrow { font-size: 16px; color: var(--accent); font-weight: 700; }
  footer { margin-top: 40px; text-align: center; font-size: 12px; color: var(--muted); }
  footer a { display: inline; padding: 0; background: none; border: none; color: var(--muted); }
  footer a:hover { color: var(--accent); }
</style>
</head>
<body>
<div class="container">
  <div class="logo">💙</div>
  <h1>Adolescent Depression</h1>
  <p class="subtitle">青少年憂鬱症文獻日報 · 每日自動更新</p>
  ${total ? `<p class="count">共 ${total} 期日報</p>` : '<p class="count">即將開始更新...</p>'}
  ${total ? `<ul>\n${links}\n  </ul>` : ""}
  <div class="footer-links">
    <a href="https://www.leepsyclinic.com/" class="footer-link" target="_blank" rel="noopener">
      <span class="footer-icon">\uD83C\uDFE5</span>
      <span class="footer-name">李政洋身心診所首頁</span>
      <span class="footer-arrow">&rarr;</span>
    </a>
    <a href="https://blog.leepsyclinic.com/" class="footer-link" target="_blank" rel="noopener">
      <span class="footer-icon">\uD83D\uDCf0</span>
      <span class="footer-name">訂閱電子報</span>
      <span class="footer-arrow">&rarr;</span>
    </a>
    <a href="https://buymeacoffee.com/CYlee" class="footer-link" target="_blank" rel="noopener">
      <span class="footer-icon">\u2615</span>
      <span class="footer-name">Buy me a coffee</span>
      <span class="footer-arrow">&rarr;</span>
    </a>
  </div>
  <footer>
    <p>Powered by PubMed + Zhipu AI · <a href="https://github.com/u8901006/adolescent-depression">GitHub</a></p>
  </footer>
</div>
</body>
</html>`;

  writeFileSync(join(DOCS, "index.html"), html, "utf-8");
  console.error(`[INFO] Index page generated (${total} reports)`);
}

main();
