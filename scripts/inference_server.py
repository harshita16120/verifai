import io
import os
import torch
from torchvision import transforms, models
import torch.nn as nn
from PIL import Image
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="VerifAI Deepfake Inference Engine", version="1.0.0")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_PATH = "models/deepfake_detector.pth"
device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

def load_trained_model():
    print("⚙️ Loading trained EfficientNet-B0 weights...")
    model = models.efficientnet_b0()
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, 2)
    
    if os.path.exists(MODEL_PATH):
        model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
        print(f"✅ Loaded trained model weights from {MODEL_PATH}")
    else:
        print(f"⚠️ Checkpoint {MODEL_PATH} not found. Using pre-trained backbone initialization.")
    
    model.to(device)
    model.eval()
    return model

model = load_trained_model()

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

@app.post("/predict")
async def predict_media(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        input_tensor = transform(image).unsqueeze(0).to(device)
        
        with torch.no_grad():
            outputs = model(input_tensor)
            probabilities = torch.softmax(outputs, dim=1)[0]
            fake_prob = float(probabilities[0]) # Class 0 = Fake
            real_prob = float(probabilities[1]) # Class 1 = Real

        trust_score = int(real_prob * 100)
        is_deepfake = fake_prob > 0.5
        
        return {
            "filename": file.filename,
            "trustScore": trust_score,
            "fakeProbability": round(fake_prob * 100, 2),
            "realProbability": round(real_prob * 100, 2),
            "isDeepfake": is_deepfake,
            "category": "manipulated" if is_deepfake else "genuine"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    print("🚀 Starting VerifAI Python PyTorch Inference Engine on http://localhost:8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
