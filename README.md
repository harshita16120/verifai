# VerifAI — Open-Source AI Media Verification Platform

VerifAI is a multi-modal deepfake and synthetic AI-media verification platform demo built with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, and **PyTorch**.

It includes a public landing page with interactive verification, an authenticated **Admin Portal**, real-time model inference, and a **multi-modal (image + audio)** deepfake training pipeline with Grad-CAM explainability (XAI).

---

## 🛠️ Stack Overview

| Layer | Technologies |
|---|---|
| **Frontend & App** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Framer Motion, Recharts |
| **3D Visuals** | Three.js, `@react-three/fiber` |
| **State & Auth** | Zustand (`lib/store.ts`), Web Crypto HMAC-SHA256 JWT Signed Sessions |
| **Backend API** | Next.js API Routes (`app/api/scan/route.ts`, `app/api/admin/*`) |
| **ML Engine & Server** | PyTorch (EfficientNet-B0/B4, Spectrogram CNN) + FastAPI (`scripts/inference_server.py`) |
| **Explainability (XAI)** | Grad-CAM feature activation maps (`scripts/common/xai.py`) |

---

## 🚀 Quick Start Guide

### 1. Installation

```bash
# Install Node dependencies
npm install

# Install Python ML dependencies (Python 3.10+)
pip install torch torchvision pillow fastapi uvicorn python-multipart librosa facenet-pytorch pyyaml
```

### 2. Running the Web Application

```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser.

- **Public Scan Route**: `http://localhost:3000/` (Probes FastAPI server; falls back to binary marker & filename heuristics if server is offline).
- **Authenticated Admin Portal**: `http://localhost:3000/admin` (Protected, requires login).

### 3. Running the PyTorch Real Inference Server (Optional)

```bash
python scripts/inference_server.py   # Runs at http://localhost:8000
```

---

## 🔐 Admin Portal (`/admin`)

The Admin Portal is a dedicated, authenticated route for team members to run direct model scans, inspect checkpoints, and launch background training runs.

### Accessing the Portal
1. Navigate to `http://localhost:3000/admin/login` (or access `/admin`).
2. Passphrase: Set `ADMIN_PASSWORD` env var (Default dev passphrase: `admin123`).

### Key Features
- **Direct Real Model Scan (`/api/admin/scan`)**: Tests media directly against the PyTorch FastAPI server (`localhost:8000/predict`). **Bypasses demo heuristic fallback** — if the Python server is offline or fails, it returns an explicit error alert instead of faking scores.
- **Model Checkpoint Inspector (`/api/admin/models`)**: Lists all `.pth` and `.onnx` model files in `models/` or `public/models/`, displaying architecture, calibration temperature (T), class count, and validation metrics.
- **Background Training Runner (`/api/admin/train`)**: Spawns background training subprocesses for image or audio pipelines, records run parameters in `runs/<run_id>/run.json`, and streams real-time stdout/stderr logs (`/api/admin/train/<runId>/logs`).

---

## 🔬 Multi-Modal Training & Dataset Pipeline

### 1. Team Dataset Catalogue (`scripts/datasets.yaml`)
Candidate academic datasets (FaceForensics++, Celeb-DF v2, DFDC, Manjilkarki, WildDeepfake) are catalogued in `scripts/datasets.yaml`. Fill in your local path once access is granted:

```yaml
datasets:
  manjilkarki:
    name: "Kaggle Manjilkarki Deepfake Benchmark"
    local_path: "data/Dataset"
```

### 2. Image Pipeline (`preprocess_faces.py` & `train_deepfake_detector.py`)

Crops face regions with a 35% margin to preserve jawline/hairline forgery evidence and trains an EfficientNet backbone with near-duplicate group splitting:

```bash
# Step 1: Preprocess & crop faces
python scripts/preprocess_faces.py --dataset-config scripts/datasets.yaml --out data/faces

# Step 2: Train detector & evaluate on held-out dataset
python scripts/train_deepfake_detector.py --data-dir data/faces --epochs 12 --arch b0
```

### 3. Audio Pipeline (`preprocess_audio.py` & `train_audio_detector.py`)

Converts raw audio clips (`.wav`, `.mp3`, `.flac`, `.ogg`, `.m4a`) into 2D Mel-spectrogram images and trains a spectrogram CNN with Grad-CAM XAI output:

```bash
# Step 1: Convert audio files to Mel-spectrogram ImageFolder tree
python scripts/preprocess_audio.py --src data/audio_raw --out data/audio_spectrograms

# Step 2: Train audio detector & export Grad-CAM explainability heatmap
python scripts/train_audio_detector.py --data-dir data/audio_spectrograms --epochs 10
```

### 4. Running Self-Check Suite

Verify internal assertions for crop geometry, AUC rank-sum calculation, temperature calibration, and label mapping:

```bash
python scripts/preprocess_faces.py --selfcheck
python scripts/train_deepfake_detector.py --selfcheck
python scripts/preprocess_audio.py --selfcheck
python scripts/train_audio_detector.py --selfcheck
```

---

## 📂 Codebase Layout

```
app/
  (admin)/admin/        Admin portal (login page, dashboard, layout with noindex)
  api/
    scan/route.ts       Public verification API (with heuristic fallback)
    admin/              Admin APIs (auth, direct real-model scan, models list, background train)
components/
  sections/             Landing page sections (Hero, HowItWorks, Architecture, TechStack, etc.)
  scan/                 Scan components (UploadZone, ReportPanel, ScoreRing)
lib/
  admin/auth.ts         JWT session token creation & validation
  store.ts              Global Zustand state
  verdict.ts            Score-to-verdict mapping rules
scripts/
  common/               Shared ML modules (calibration.py, xai.py)
  datasets.yaml         Team dataset paths catalogue
  preprocess_faces.py   MTCNN face-crop & dataset normalization
  train_deepfake_detector.py PyTorch image detector training script
  preprocess_audio.py   Audio-to-Mel-spectrogram converter
  train_audio_detector.py Audio spectrogram CNN detector training script
  inference_server.py   FastAPI inference engine (/predict endpoint)
```

---

## 🛡️ Security Features

- **Authenticated Admin Routes**: Protected by HttpOnly, Secure, SameSite=strict session cookies.
- **WAF & Rate Limiting**: Global bot UA blocking, 20 req/min rate limit on public APIs, separate 60 req/min limit on admin APIs.
- **SSRF Blocklist**: Blocks internal/link-local IP addresses (`127.0.0.1`, `10.x`, `192.168.x`, `169.254.169.254`, etc.) on URL scans.
- **Payload Guard**: 50 MB request payload ceiling.
- **HTTP Headers**: HSTS, Content Security Policy (CSP), `X-Frame-Options: SAMEORIGIN`, `nosniff`, and Referrer-Policy.

---

## 🔒 Environment Variables (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `ADMIN_PASSWORD` | `admin123` | Passphrase required to log into the Admin Portal |
| `JWT_SECRET` | `verifai-secret...` | Secret key used to sign admin session cookies |
| `VERIFAI_MODEL` | `models/deepfake_detector.pth` | Path to PyTorch model checkpoint loaded by FastAPI |
