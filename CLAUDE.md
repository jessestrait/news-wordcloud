# Analytics

Every HTML page on this site must include the GoatCounter tracking script right before `</body>`:

```html
<script data-goatcounter="https://jesserstrait.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
```

This applies to any new page added to this repo. All pages across jessestrait.com, training.jessestrait.com, archetype-atlas, modal-keyboard, yt-recs-wordcloud, and news-wordcloud report to this single GoatCounter site (`jesserstrait`), so don't create a different site code without asking first.

# Deployment

Live at https://jessestrait.com/news-wordcloud/ (custom domain — the
`jessestrait.github.io/news-wordcloud/` URL 301-redirects there rather than
serving directly; don't curl that one expecting JSON back). GitHub Pages,
legacy build.

# Data pipeline

`.github/workflows/refresh.yml` runs `scripts/refresh.js`, which pulls the
latest Guardian "world" section articles, scores them against the NRC
EmoLex lexicon in `lib/emolex.js`, and commits:

- `data/latest.json` — the current snapshot, fetched by `index.html` on load.
- `data/history/<YYYY-MM-DD>.ndjson` — one line appended per run, today's
  file only. Files older than 7 days are pruned automatically.
- `data/history/manifest.json` — index of available day-files, rebuilt each run.

Requires a `GUARDIAN_API_KEY` repo secret (free key from
https://open-platform.theguardian.com/access/).

# Refresh scheduling (why it looks the way it does)

The goal is a refresh every ~15 minutes, but GitHub's own `schedule:` cron
trigger is unreliable on its own — observed gaps of 60-105 minutes in
production on 2026-07-23 once the external dispatcher (see below) went
quiet. Don't simplify this back down to a bare 15-minute cron on the job
itself; it doesn't actually deliver 15-minute refreshes in practice.

Current design:

- The job loops internally: refresh, commit+push, sleep 900s (15 min),
  4 times per run (`timeout-minutes: 65`). A *single* trigger produces
  ~45-60 minutes of real 15-minute-cadence refreshes.
- Three overlapping trigger sources feed that loop, and that's intentional
  redundancy, not a mistake to clean up:
  - `schedule: "7,22,37,52 * * * *"` — native GitHub cron, kept as a
    backup even though it's flaky solo.
  - A Claude Code cloud routine ("news-wordcloud refresh dispatcher", id
    `trig_01QMMRMWozFQhi2Y77qXy7Uu`, managed at claude.ai/code/routines,
    not in this repo) runs `gh workflow run "Refresh news word cloud"
    --repo jessestrait/news-wordcloud --ref main` once an hour (cloud
    schedulers can't go below a 1-hour interval). This is the one trigger
    guaranteed independent of any computer being on.
  - A third dispatcher used to run on one of the owner's own computers
    (something calling `workflow_dispatch` every 15 min, authenticated as
    the repo owner's GitHub account). It stopped firing on 2026-07-23
    around 14:07 UTC and was never identified/located. Not depended on
    anymore, but harmless if it resumes —
    `concurrency: {group: refresh, cancel-in-progress: false}` means
    overlapping triggers queue instead of colliding.

# Word cloud rendering (`index.html`)

Renders via wordcloud2.js (cdnjs, v1.2.2) onto a single `<canvas>`.

- **Never assign `canvas.width`/`canvas.height` unconditionally.** Doing so
  clears the canvas even when set to its current value. Mobile Safari/Chrome
  fire `window resize` when the address bar collapses/expands during
  scroll, so a naive resize handler wipes the cloud on every scroll.
  `sizeCanvases()` guards against this by skipping the reassignment when
  the computed size hasn't actually changed, and redraws `currentSnapshot`
  when it genuinely has.
- `wordSize(freq, maxFreq)` sizes each word relative to *that batch's own*
  max frequency (`WORD_SIZE_MIN` 16px, `WORD_SIZE_MAX` 84px), not fixed
  constants. A fixed formula with a hard cap let multiple high-frequency
  words collapse to the same size.
- `gridSize: 18` in the `WordCloud()` call is the only real word-spacing
  lever this library exposes — it blocks whole grid cells around a word's
  actual rendered ink, not a precise margin, so some touching (especially
  between rotated words, `rotateRatio: 0.25`) is expected even at this
  size. wordcloud2.js has no dedicated padding option.

# Relationship to yt-recs-wordcloud

This repo intentionally shares its visual shell with
github.com/jessestrait/yt-recs-wordcloud (same `#wc-wrap` border/padding,
same canvas sizing math, same NRC EmoLex-derived color legend) — that
parity was a deliberate fix, not an accident. But `wordSize()`'s formula
and `gridSize` have since diverged on purpose for news-wordcloud-specific
reasons (above). Don't assume the two pages should always be kept in
sync — check before porting a change one way or the other.
