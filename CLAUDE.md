# Analytics

Every HTML page on this site must include the GoatCounter tracking script right before `</body>`:

```html
<script data-goatcounter="https://jesserstrait.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
```

This applies to any new page added to this repo. All pages across jessestrait.com, training.jessestrait.com, archetype-atlas, modal-keyboard, yt-recs-wordcloud, and news-wordcloud report to this single GoatCounter site (`jesserstrait`), so don't create a different site code without asking first.

# Data pipeline

`.github/workflows/refresh.yml` runs `scripts/refresh.js` on a 15-minute cron
(offset from the hour to avoid GitHub's top-of-hour scheduler delays). It
pulls the latest Guardian "world" section articles, scores them against the
NRC EmoLex lexicon in `lib/emolex.js`, and commits:

- `data/latest.json` — the current snapshot, fetched by `index.html` on load.
- `data/history/<YYYY-MM-DD>.ndjson` — one line appended per run, today's
  file only. Files older than 7 days are pruned automatically.
- `data/history/manifest.json` — index of available day-files, rebuilt each run.

Requires a `GUARDIAN_API_KEY` repo secret (free key from
https://open-platform.theguardian.com/access/).
