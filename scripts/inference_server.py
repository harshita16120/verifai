import io
import os
import sys

import torch
import torch.nn as nn
import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from torchvision import models, transforms

app = FastAPI(title="VerifAI Deepfake Inference Engine", version="2.0.0")

# ponytail: wide-open CORS is fine while this only ever listens on localhost.
# Restrict to the deployed origin before exposing the port.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_PATH = os.environ.get("VERIFAI_MODEL", "models/deepfake_detector.pth")
BACKBONES = {"b0": models.efficientnet_b0, "b4": models.efficientnet_b4}
device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")


def load_trained_model():
    """Rebuilds the exact architecture recorded in the checkpoint.

    Refuses to start without weights. The previous version fell back to a randomly
    initialized backbone, which served confident-looking coin flips instead of failing
    loudly — the Next.js route treats an unreachable server as "use heuristics", which
    is a far more honest outcome than garbage predictions.
    """
    if not os.path.exists(MODEL_PATH):
        sys.exit(
            f"❌ No checkpoint at {MODEL_PATH}.\n"
            f"   Train one first:  python scripts/train_deepfake_detector.py\n"
            f"   Refusing to serve random weights."
        )

    ckpt = torch.load(MODEL_PATH, map_location=device, weights_only=True)
    if "state_dict" not in ckpt:
        sys.exit(f"❌ {MODEL_PATH} predates the metadata format. Retrain to regenerate it.")

    meta = {
        "arch": ckpt["arch"],
        "classes": ckpt["classes"],
        "real_idx": ckpt["real_idx"],
        "img_size": ckpt["img_size"],
        "temperature": ckpt.get("temperature", 1.0),
        "face_crop": ckpt.get("face_crop", False),
        "face_margin": ckpt.get("face_margin", 0.35),
    }
    model = BACKBONES[meta["arch"]]()
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, len(meta["classes"]))
    model.load_state_dict(ckpt["state_dict"])
    model.to(device).eval()

    print(f"✅ Loaded EfficientNet-{meta['arch'].upper()} from {MODEL_PATH}")
    print(f"   classes={meta['classes']} real_idx={meta['real_idx']} T={meta['temperature']:.3f}")
    if "val_metrics" in ckpt:
        m = ckpt["val_metrics"]
        print(f"   val balanced_acc={m['balanced_acc']:.4f} auc={m['auc_real_vs_rest']:.4f}")
    return model, meta


model, META = load_trained_model()

# Preprocessing must match training exactly. A model trained on face crops and fed full
# frames loses most of its accuracy and logs nothing about why, so the checkpoint's own
# face_crop flag — not a server-side setting — decides this.
DETECTOR = None
if META["face_crop"]:
    from preprocess_faces import crop_face, load_detector  # same dir, shared crop geometry
    DETECTOR = load_detector(None)
    print(f"🧠 Face cropping ON (margin {META['face_margin']}) — matches training data.")

transform = transforms.Compose([
    transforms.Resize((META["img_size"], META["img_size"])),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])

MAX_BYTES = 50 * 1024 * 1024


@torch.no_grad()
def predict_tensor(tensor):
    """Temperature-scaled probabilities, averaged with the horizontal flip.

    Flip-TTA costs one extra forward pass and measurably steadies borderline scores.
    """
    batch = torch.cat([tensor, torch.flip(tensor, dims=[3])]).to(device)
    logits = model(batch).float() / META["temperature"]
    return torch.softmax(logits, dim=1).mean(dim=0)


@app.get("/health")
def health():
    return {"status": "ok", "device": str(device), **META}


@app.post("/predict")
async def predict_media(file: UploadFile = File(...)):
    contents = await file.read()
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 50MB limit.")

    is_audio = file.filename.endswith(('.wav', '.mp3', '.flac', '.ogg', '.m4a'))
    image = None

    if is_audio:
        try:
            from preprocess_audio import generate_spectrogram_image
            # Write temp audio file
            temp_path = f"_temp_{file.filename}"
            with open(temp_path, "wb") as f:
                f.write(contents)
            image = generate_spectrogram_image(temp_path, META["img_size"])
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception as e:
            raise HTTPException(status_code=415, detail=f"Audio spectrogram conversion failed: {e}")
    else:
        try:
            image = Image.open(io.BytesIO(contents)).convert("RGB")
        except (UnidentifiedImageError, OSError):
            raise HTTPException(status_code=415, detail="Not a decodable media file.")

    face_found = None
    if not is_audio and DETECTOR is not None:
        cropped = crop_face(DETECTOR, image, META["face_margin"])
        face_found = cropped is not None
        if not face_found:
            raise HTTPException(status_code=422, detail="No face detected; image model is face-only.")
        image = cropped

    try:
        probs = predict_tensor(transform(image).unsqueeze(0))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    real_prob = float(probs[META["real_idx"]])
    per_class = {name: round(float(p) * 100, 2) for name, p in zip(META["classes"], probs)}
    predicted_class = META["classes"][int(probs.argmax())]
    trust_score = int(round(real_prob * 100))
    # Three bands, matching lib/verdict.ts. The middle band is where a calibrated model
    # says "I am not sure" — surfacing that beats forcing a confident-looking binary.
    if trust_score >= 75:
        category = "genuine"
    elif trust_score >= 40:
        category = "suspicious"
    else:
        category = "manipulated"

    return {
        "filename": file.filename,
        "trustScore": trust_score,
        "fakeProbability": round((1 - real_prob) * 100, 2),
        "realProbability": round(real_prob * 100, 2),
        "isDeepfake": trust_score < 40,
        "category": category,
        "predictedClass": predicted_class,
        "perClass": per_class,
        "calibrated": META["temperature"] != 1.0,
        "faceCropped": face_found,
    }


if __name__ == "__main__":
    print("🚀 VerifAI Inference Engine → http://localhost:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)
