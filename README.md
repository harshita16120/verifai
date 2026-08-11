# VerifAI

Open-source deepfake / AI-media verification demo. A Next.js 14 landing page with a working
upload-and-scan flow that returns a trust score, a plain-English verdict, and a per-detector
breakdown. An optional PyTorch server provides real model inference; without it the API falls
back to filename + binary-marker heuristics.

## Stack

| Layer | What |
|---|---|
| App | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS (custom `brand`/`ink`/`verdict` palette), custom CSS in `app/globals.css` |
| State | Zustand (`lib/store.ts`) — single global store |
| Motion / 3D | framer-motion, three + @react-three/fiber |
| Charts | recharts |
| ML (optional) | PyTorch EfficientNet + FastAPI (`scripts/`) |

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

Scripts: `dev`, `build`, `start`, `lint`.

Optional real inference (Python 3.10+, separate deps: `torch torchvision fastapi uvicorn pillow`):

```bash
python scripts/inference_server.py   # serves http://localhost:8000/predict
```

The Next.js API probes that endpoint with a 1.5 s timeout on every file scan. If it is offline
the scan silently falls back to heuristics — no configuration needed either way.

## Layout

```
app/
  layout.tsx            root layout, metadata, Google Fonts
  page.tsx              the single page — composes every section
  globals.css           theme, orbs, glass-card, dot-grid utilities
  api/scan/route.ts     the only backend route (POST)
components/
  sections/             page sections (Hero, HowItWorks, ArchitectureDiagram,
                        PipelineDiagram, TechStack, ThreeWaysIn, FinalCTA, Nav, Footer, …)
  scan/                 ScanDemo → UploadZone + ReportPanel + ScoreRing
  diagrams/             DiagramCanvas / DiagramNode (interactive architecture nodes)
  three/                HeroScene, BlockchainBackground (r3f, loaded with ssr:false)
  ui/                   Button, Badge, Accordion, Toggle, AnimatedCard, SectionHeading
lib/
  store.ts              Zustand store: scan state, UI state, toasts, ScanResult type
  verdict.ts            score → verdict mapping (≥75 genuine, ≥40 suspicious, else manipulated)
  models/onnx_classifier.ts   model spec table + byte-entropy feature extraction
  utils.ts              cn() — clsx + tailwind-merge
middleware.ts           rate limit, bot UA block, payload size guard (matches /api/*)
next.config.js          security headers incl. CSP
scripts/
  preprocess_faces.py         face-crop + multi-dataset merge → ImageFolder + manifest
  train_deepfake_detector.py  training, group split, calibration, cross-dataset eval
  inference_server.py         FastAPI /predict + /health
  push_demo_branch.js
```

## Scan flow

1. `UploadZone` validates type (image/video/audio) and size (≤50 MB), or takes a URL, or a
   built-in preset file.
2. `ScanDemo` POSTs to `/api/scan` — `multipart/form-data` for files, JSON `{url}` for links —
   while animating a fake progress bar.
3. `app/api/scan/route.ts`:
   - URLs go through an SSRF blocklist (localhost, link-local, RFC1918, `.internal`, `.local`,
     non-http schemes) before anything else.
   - Files are forwarded to `http://localhost:8000/predict`; if that answers, its `trustScore`
     and `category` win.
   - Otherwise: scan the first 128 KB of the buffer for generator markers (DeepFaceLab, Sora,
     ElevenLabs, C2PA, camera EXIF strings…) and match the filename against keyword lists to
     pick a tech type, then derive a score band per category.
   - Returns `{ id, filename, score, verdict, reasons[], breakdown, hash, c2paStatus, … }`
     typed as `ScanResult` in [lib/store.ts](lib/store.ts).
4. `ReportPanel` renders the verdict, `ScoreRing` the score, and the recharts breakdown.

### Detection categories

| Score | Category | Label |
|---|---|---|
| 75–100 | `genuine` | Real & Original |
| 40–74 | `suspicious` | Edited or Modified |
| 0–39 | `manipulated` | AI-Generated / Deepfake |

Tech types the route distinguishes: `faceswap`, `diffusion`, `ai_video`, `talking_head`,
`voice_clone`, `retouch`, `clean` — each with its own explanation copy and reason list.

## Security

Implemented, not decorative:

- **middleware.ts** — 20 req/min per IP on `/api/*` (in-memory Map), 403 for known scanner
  user-agents, 413 above 50 MB `content-length`.
- **next.config.js** — HSTS, CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy` on every route.
- **route.ts** — SSRF blocklist on URL scans, filename sanitised to `[a-zA-Z0-9_.-]`.

Rate limiting is per-process, so it resets on redeploy and doesn't work across serverless
instances — swap in Redis/Upstash if this ever goes multi-instance.

## Training

```bash
pip install torch torchvision pillow fastapi uvicorn python-multipart kagglehub
pip install facenet-pytorch          # optional, for face cropping
pip install onnxscript onnx          # optional, torch>=2.9 needs these to export ONNX

# 0. verify the metric / split / hashing logic
python scripts/train_deepfake_detector.py --selfcheck
python scripts/preprocess_faces.py --selfcheck

# 1. build a clean training folder (crop faces + merge datasets)
python scripts/preprocess_faces.py --src <kaggle_dsA> --src <kaggle_dsB> --out data/faces

# 2. train, and evaluate on a source you did NOT train on
python scripts/train_deepfake_detector.py --data-dir data/faces --eval-dir data/celebdf

# 3. serve
python scripts/inference_server.py
```

### `preprocess_faces.py`

Crops to the detected face with a 35% margin (the jawline seam is the single most
discriminative region for face swaps, so a tight crop throws away the evidence) and merges
datasets with incompatible layouts into one `ImageFolder` tree. Class is inferred from the
leaf directory name — `Fake`, `training_real`, `real-vs-fake` all resolve correctly; use
`--label-map` for anything that doesn't. Everything is re-encoded to JPEG q95 on purpose:
when one class is PNG and the other JPEG, a model will learn the container instead of the
forgery. Writes `manifest.json` with provenance and the crop settings.

`--no-crop` merges without face detection. `--limit N` for a smoke test.

### `train_deepfake_detector.py`

| Flag | Default | Notes |
|---|---|---|
| `--arch` | `b0` | `b4` runs at its native 380px |
| `--epochs` / `--batch-size` / `--lr` | 12 / 32 / 3e-4 | OneCycle schedule |
| `--freeze-epochs` | 2 | head-only warmup before unfreezing the backbone |
| `--split-by` | `group` | `group` keeps near-duplicates on one side of the split |
| `--val-frac` | 0.15 | |
| `--eval-dir` | — | held-out dataset from a different source |
| `--eval-only` | — | load the checkpoint and just run `--eval-dir` |
| `--data-dir` | — | skip kagglehub |

Expects an `ImageFolder` layout, and **the authentic-image folder must be named `Real`** —
the script locates it by name and exits if it can't. A `Train/` + `Validation/` split is used
when present; otherwise a holdout is carved out.

**Group splitting** is the default because a per-image split leaks. These datasets contain
near-duplicate frames, and a face swap hashes almost identically to the original it was made
from — so the same content lands on both sides and the holdout score is inflated. A 64-bit
dHash with 4-band LSH groups near-duplicates in linear time, and whole groups move together.
(These datasets ship no identity labels; this is a proxy for identity grouping, not a
substitute.) The hash cache is written to `.dhash_cache.json` inside the data dir.

Per epoch it reports balanced accuracy, real-vs-rest AUC and per-class recall, and selects
the checkpoint on **balanced** accuracy — plain accuracy just rewards predicting the majority
class. After training, temperature scaling is fitted on the holdout; if the holdout separates
too cleanly to calibrate against, it says so and falls back to T=1 rather than driving every
score to 0 or 100.

The checkpoint stores architecture, class names, real-class index, image size, temperature,
face-crop settings and validation metrics alongside the weights. The server reconstructs the
exact model and the exact preprocessing from it, and refuses to start without a checkpoint
rather than serving random weights.

### Reading the results

`--eval-dir` is the number that matters. In-distribution accuracy tells you how well the model
memorized one generator's fingerprint; the drop on an unseen source is your real-world
accuracy. A drop above 0.20 is flagged in the output. Train on manjilkarki, evaluate on
FaceForensics++ or Celeb-DF, and believe the second number.

## Honest caveats

- Without the Python server running, verdicts are **heuristics over filenames and byte
  markers**, not image forensics. A file called `real_photo.jpg` scores ~95 regardless of
  content. Fine for a demo, not for real verification claims. No checkpoint ships with this
  repo, so this is the default path until you train one.
- The model handles **images only**. Video and audio uploads get a 415 from the server and
  fall back to heuristics, despite the UI accepting them.
- The model accuracy figures and detector names in `lib/models/onnx_classifier.ts` are
  presentation copy for the landing page, not measured results.
- `breakdown`, `hash`, and `trustBadgeUrl` are synthesised server-side; there's no blockchain
  or C2PA signing behind them.
- No test suite.
