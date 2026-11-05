# PARTS.md - index of the Webbeo parts library

Read this instead of the source. Placeholder content only; never client data.
Full widget props: `.agents/skills/use-widgets.md` (AstroWind catalogue, all 30+ widgets kept).

## Webbeo parts (`src/components/parts`, `src/layouts`)
| Part | Use | Props |
|---|---|---|
| `TradeLayout` | Page shell for trade sites: demo banner, sticky header, footer. Reads the site's `src/navigation.ts` | `metadata` |
| `DemoBanner` | "Demo preview" bar. Renders only when `PUBLIC_DEMO=true` (set by build-demo) | none |
| `GhlForm` | Shared GoHighLevel form iframe. Adds `?slug=` in demo builds | `formId`, `title?`, `height?` |
| `LocalBusinessSchema` | LocalBusiness JSON-LD | `name`, `phone?`, `email?`, `town?`, `areas?`, `description?` |

## Starters (`starters/<name>`)
| Starter | Pages | Notes |
|---|---|---|
| `local-trade` | home, about, services, one page per service (`/services/<slug>`), contact (GHL form) | Blog off, light theme only, all copy is `[PLACEHOLDER ...]` |

## Per-demo overlay (`/home/node/webbeo-build/sites/<slug>/`)
| File | Purpose |
|---|---|
| `site.json` | `ghlFormId`, `forbid` (client strings that must never appear in a live build), `inheritPages`, `engine` pin |
| `config.yaml` | Site name, SEO defaults. `site` and `base` are overwritten at build |
| `src/data/content.json` | Business facts, services, reviews, FAQs (the main input) |
| `src/components/CustomStyles.astro` | Colours and fonts (the theme knob) |
| `src/pages/*` | Thin pages composing widgets; edit only to change layout or add a bespoke section |
| `src/assets/`, `public/` | Prospect images |

Any overlay file replaces the engine file at the same path.

## Visual layer (`src/components/pro`, `src/layouts/ProLayout.astro`, `src/assets/styles/pro.css`)
Used by the `trade-pro` starter. Palette/fonts come from the site's `CustomStyles.astro` (`--pro-*`). Every photo slot is a file name in `src/assets/images`; a missing file fails `check-build`.
| Part | Use | Props |
|---|---|---|
| `ProLayout` | Shell: demo banner, ProHeader, ProFooter, built from `content.json` | `metadata` |
| `PhotoHero` | Full-bleed photo hero, `*accent*` word in title, stats | `title`, `subtitle`, `image`, `focal?`, `primary`, `secondary?`, `stats?` |
| `TrustRow` | 4 icon trust points under hero | `items[{icon,title,text}]` |
| `ServiceCards` | Image cards; `layout="feature"` = 2 large + rest small | `title`, `items[{title,summary,image,href}]`, `layout?` |
| `SplitFeature` | Photo + text + points | `title`, `paragraphs`, `image`, `focal?`, `points?`, `flip?` |
| `ProcessBand` | Dark numbered steps band | `title`, `steps[{title,text}]` |
| `ReviewBand` | Lead dark quote + smaller cards | `title`, `reviews[{quote,name,place}]` |
| `FaqList` / `CtaBand` / `PageHero` / `SectionHead` / `TickerStrip` | Supporting sections | see source |
| `ProImage` | Local image by file name, webp, lazy; sand block if missing | `src`, `alt`, `focal?`, `eager?` |
Rules: 2-3 `*accent*` words per site; own palette + font pair per demo (fonts: Fraunces, DM Serif Display, Instrument Serif, DM Sans, Manrope, Barlow Condensed); real photography for every slot; button classes are `pbtn*` (not `btn-primary`, which is AstroWind's).
Overlay pages are copied from the starter at `new-demo` time; later starter edits do not reach existing overlays.

## Commands (run from the engine checkout)
- `node tools/new-demo.mjs <slug> [--starter trade-pro|local-trade]` (use trade-pro) creates the overlay.
- `node tools/build-demo.mjs <slug>` builds the demo at `/<slug>` into `out/<slug>/dist`.
- `node tools/build-demo.mjs <slug> --live --site https://<domain>` builds for `/` into `out/<slug>/dist-live`.
- Both run `tools/check-build.mjs`. A failed check writes no dist.

## Checks (all must pass)
Every local link/asset resolves and carries the base; no double base; no upstream branding;
no `forbid` strings; GHL form embedded; demo has banner + noindex + robots disallow;
live has none of those and no slug / `try.webbeo.ai`. Live also fails on any `[PLACEHOLDER` left.

## Rules
- All internal links via `getPermalink()` / `getAsset()`; never a bare `/path`.
- Library additions are new files; edit upstream AstroWind files minimally (syncs stay cheap).
- A part enters the library only after a real build used it, with client info removed and placeholders in.
- Live builds refuse a dirty engine checkout. Demos pin the engine sha in `site.json`.
