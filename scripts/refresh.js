// Runs on a schedule via .github/workflows/refresh.yml. Pulls the latest
// Guardian "world" section articles, scores the text against the NRC EmoLex
// lexicon, and writes:
//   - data/latest.json              (small, for instant page load)
//   - data/history/<date>.ndjson    (one line appended, today's file only)
//   - data/history/manifest.json    (index of available day-files)
// Old day-files past RETENTION_DAYS are deleted. The workflow itself decides
// whether to commit (skipped if nothing changed).
import { readdirSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs";
import { tokenize, mergePlurals, emotionOf } from "../lib/emolex.js";

const RETENTION_DAYS = 7;
const TOP_WORDS = 75;
const EMOTIONS = ["joy", "trust", "fear", "surprise", "sadness", "disgust", "anger", "anticipation"];

const DATA_DIR = new URL("../data/", import.meta.url);
const HISTORY_DIR = new URL("../data/history/", import.meta.url);

async function fetchArticles() {
  const key = process.env.GUARDIAN_API_KEY;
  if (!key) throw new Error("GUARDIAN_API_KEY is not set");

  const url = new URL("https://content.guardianapis.com/search");
  url.searchParams.set("section", "world");
  url.searchParams.set("order-by", "newest");
  url.searchParams.set("page-size", "50");
  url.searchParams.set("show-fields", "headline,trailText");
  url.searchParams.set("api-key", key);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Guardian API ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.response.results || [];
}

function buildSnapshot(articles) {
  const texts = articles.flatMap((a) => [a.fields?.headline || a.webTitle || "", a.fields?.trailText || ""]);
  const freq = mergePlurals(tokenize(texts));
  const allWords = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
  const coloredWords = allWords.filter((w) => emotionOf(w) !== null);

  const top_words = coloredWords.slice(0, TOP_WORDS).map((w) => [w, freq[w], emotionOf(w)]);

  const emotion_totals = {};
  EMOTIONS.forEach((e) => {
    const t = coloredWords.reduce((s, w) => (emotionOf(w) === e ? s + freq[w] : s), 0);
    if (t > 0) emotion_totals[e] = t;
  });

  return {
    generated_at: new Date().toISOString(),
    article_count: articles.length,
    top_words,
    emotion_totals,
  };
}

function dayFile(dateStr) {
  return new URL(`${dateStr}.ndjson`, HISTORY_DIR);
}

function writeSnapshot(snapshot) {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(HISTORY_DIR, { recursive: true });

  writeFileSync(new URL("latest.json", DATA_DIR), JSON.stringify(snapshot, null, 2) + "\n");

  const dateStr = snapshot.generated_at.slice(0, 10);
  appendFileSync(dayFile(dateStr), JSON.stringify(snapshot) + "\n");
}

function pruneOldDayFiles() {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  if (!existsSync(HISTORY_DIR)) return;
  for (const name of readdirSync(HISTORY_DIR)) {
    const m = name.match(/^(\d{4}-\d{2}-\d{2})\.ndjson$/);
    if (m && m[1] < cutoffStr) unlinkSync(new URL(name, HISTORY_DIR));
  }
}

function rebuildManifest() {
  const days = [];
  for (const name of readdirSync(HISTORY_DIR).sort()) {
    const m = name.match(/^(\d{4}-\d{2}-\d{2})\.ndjson$/);
    if (!m) continue;
    const lines = readFileSync(new URL(name, HISTORY_DIR), "utf8").trim().split("\n").filter(Boolean);
    if (!lines.length) continue;
    const first = JSON.parse(lines[0]).generated_at;
    const last = JSON.parse(lines[lines.length - 1]).generated_at;
    days.push({ date: m[1], count: lines.length, first, last });
  }
  writeFileSync(
    new URL("manifest.json", HISTORY_DIR),
    JSON.stringify({ updated_at: new Date().toISOString(), retention_days: RETENTION_DAYS, days }, null, 2) + "\n"
  );
}

const articles = await fetchArticles();
const snapshot = buildSnapshot(articles);
writeSnapshot(snapshot);
pruneOldDayFiles();
rebuildManifest();

console.log(
  `Refreshed: ${snapshot.article_count} articles, ${snapshot.top_words.length} scored words, ` +
    `dominant emotion: ${Object.entries(snapshot.emotion_totals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none"}`
);
