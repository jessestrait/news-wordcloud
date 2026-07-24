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
- **Self-dispatch is the primary trigger.** The job's first step calls
  `gh workflow run "Refresh news word cloud" --repo jessestrait/news-wordcloud
  --ref main` using the automatic `GITHUB_TOKEN` (needs `permissions:
  actions: write`), queuing its own successor before doing anything else.
  Once started, the chain perpetuates itself forever with zero dependency
  on any external scheduler, cloud routine, or either owner's computer
  being on — `concurrency: {group: refresh, cancel-in-progress: false}`
  queues the successor behind the current run rather than racing it.
  `schedule: "7,22,37,52 * * * *"` (native GitHub cron) is kept purely as
  a redundant backup in case the chain ever breaks.
- This replaced two prior external dispatchers, both retired 2026-07-24
  because both turned out to depend on a specific computer being on/awake
  despite the intent otherwise, and both were lost when their host
  computer's session ended:
  - A Claude Code cloud routine ("news-wordcloud refresh dispatcher," id
    `trig_01QMMRMWozFQhi2Y77qXy7Uu`) that ran the same `gh workflow run`
    command once an hour. Vanished at some point on 2026-07-24 —
    `RemoteTrigger list` came back empty with no trace of it, most likely
    deleted along with the unrelated malicious "diagnostic" task the
    owner removed that day.
  - A dispatcher on one of the owner's own computers (a laptop) calling
    `workflow_dispatch` every 15 min, authenticated as the repo owner's
    GitHub account. Stopped 2026-07-23 ~14:07 UTC when that laptop slept.
  - Neither was a mistake to have tried — just not durable enough, which
    is exactly why self-dispatch replaced them instead of adding a third
    variant of the same failure mode.

Because runs can still overlap briefly around a handoff, two loop
iterations can regenerate and push around the same time.
`data/latest.json` and `manifest.json` are fully
regenerated each run (not incrementally edited), so the workflow resets
hard to the current remote tip immediately before regenerating rather than
`pull --rebase`-ing afterward — there's nothing in those files worth
merging, and rebasing two independently-regenerated versions of the same
file produced a real, unresolvable conflict in production (run
30069941234, 2026-07-24T05:38Z — that refresh was lost outright). If a
push still loses a race after the reset, the loop retries the whole
resync-regenerate-push cycle (up to 3x) instead of trying to reconcile.

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
