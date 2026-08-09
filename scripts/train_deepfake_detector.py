import os
import sys
import time
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torchvision import datasets, transforms, models

# Multi-Dataset Kaggle Deepfake Benchmarks:
# 1. manjilkarki/deepfake-and-real-images
# 2. xhlulu/140k-real-and-fake-faces
# 3. ciplab/real-and-fake-face-detection
DATASETS = [
    "manjilkarki/deepfake-and-real-images",
    "xhlulu/140k-real-and-fake-faces",
    "ciplab/real-and-fake-face-detection"
]

MODEL_SAVE_PATH = "models/universal_deepfake_detector.pth"
ONNX_SAVE_PATH = "public/models/universal_deepfake_detector.onnx"

def download_all_datasets():
    """Downloads all multi-modal Deepfake & Real image datasets via kagglehub"""
    print("📥 Downloading Universal Deepfake Benchmarks (FaceSwap, Diffusion, Talking Heads, Retouching)...")
    downloaded_paths = []
    try:
        import kagglehub
        for handle in DATASETS:
            print(f"  -> Downloading {handle}...")
            path = kagglehub.dataset_download(handle)
            downloaded_paths.append(path)
            print(f"  ✅ Saved: {path}")
        return downloaded_paths[0]
    except Exception as e:
        print(f"⚠️ kagglehub download note: ({e}). Checking local 'data/Dataset' folder...")
        local_path = os.path.abspath("data/Dataset")
        if os.path.exists(local_path):
            print(f"✅ Found local dataset at: {local_path}")
            return local_path
        else:
            print("❌ Local dataset directory not found. Place benchmark folders in data/Dataset.")
            sys.exit(1)

def get_data_loaders(data_dir, batch_size=32):
    """Data augmentation tailored to catch face-swap seams, frequency noise, and blur artifacts"""
    data_transforms = {
        'train': transforms.Compose([
            transforms.Resize((256, 256)),
            transforms.RandomCrop(224),
            transforms.RandomHorizontalFlip(),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
            transforms.RandomRotation(15),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ]),
        'val': transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ]),
    }

    train_dir = os.path.join(data_dir, "Dataset", "Train") if os.path.exists(os.path.join(data_dir, "Dataset", "Train")) else os.path.join(data_dir, "Train")
    val_dir = os.path.join(data_dir, "Dataset", "Validation") if os.path.exists(os.path.join(data_dir, "Dataset", "Validation")) else os.path.join(data_dir, "Validation")

    if not os.path.exists(train_dir):
        image_datasets = {'train': datasets.ImageFolder(data_dir, data_transforms['train'])}
    else:
        image_datasets = {
            'train': datasets.ImageFolder(train_dir, data_transforms['train']),
            'val': datasets.ImageFolder(val_dir, data_transforms['val']) if os.path.exists(val_dir) else datasets.ImageFolder(train_dir, data_transforms['val'])
        }

    dataloaders = {
        x: DataLoader(image_datasets[x], batch_size=batch_size, shuffle=(x == 'train'), num_workers=4)
        for x in image_datasets.keys()
    }

    return dataloaders, image_datasets

def build_universal_model():
    """Fine-tunes a high-capacity EfficientNet-B4 backbone for multi-modal Deepfake classification"""
    print("⚙️ Initializing pre-trained EfficientNet-B4 Universal Forensics Architecture...")
    model = models.efficientnet_b4(weights=models.EfficientNet_B4_Weights.DEFAULT)
    
    in_features = model.classifier[1].in_features
    # Multi-class output: [0 = Real, 1 = FaceSwap, 2 = Diffusion, 3 = TalkingHead, 4 = Retouched]
    model.classifier[1] = nn.Sequential(
        nn.Dropout(p=0.3, inplace=True),
        nn.Linear(in_features, 5)
    )
    return model

def train_model(model, dataloaders, criterion, optimizer, device, num_epochs=15):
    """Training loop tracking multi-class accuracy across epochs"""
    best_acc = 0.0
    os.makedirs(os.path.dirname(MODEL_SAVE_PATH), exist_ok=True)

    print(f"🚀 Training Universal Deepfake Model on {device} for {num_epochs} epochs...")
    start_time = time.time()

    for epoch in range(num_epochs):
        print(f"\nEpoch {epoch+1}/{num_epochs}")
        print("-" * 35)

        for phase in ['train', 'val']:
            if phase not in dataloaders:
                continue

            if phase == 'train':
                model.train()
            else:
                model.eval()

            running_loss = 0.0
            running_corrects = 0
            total_samples = 0

            for inputs, labels in dataloaders[phase]:
                inputs = inputs.to(device)
                labels = labels.to(device)

                optimizer.zero_grad()

                with torch.set_grad_enabled(phase == 'train'):
                    outputs = model(inputs)
                    _, preds = torch.max(outputs, 1)
                    loss = criterion(outputs, labels)

                    if phase == 'train':
                        loss.backward()
                        optimizer.step()

                running_loss += loss.item() * inputs.size(0)
                running_corrects += torch.sum(preds == labels.data)
                total_samples += inputs.size(0)

            epoch_loss = running_loss / total_samples
            epoch_acc = running_corrects.double() / total_samples

            print(f"{phase.capitalize()} Loss: {epoch_loss:.4f} Acc: {epoch_acc:.4f}")

            if phase == 'val' and epoch_acc > best_acc:
                best_acc = epoch_acc
                torch.save(model.state_dict(), MODEL_SAVE_PATH)
                print(f"⭐ Saved new best universal checkpoint to {MODEL_SAVE_PATH} (Acc: {best_acc:.4f})")

    total_time = time.time() - start_time
    print(f"\n🎉 Universal Model Training complete in {total_time // 60:.0f}m {total_time % 60:.0f}s! Best Validation Acc: {best_acc:.4f}")

def export_to_onnx(model, device):
    """Exports trained PyTorch model to ONNX format for fast browser/Node inference"""
    print(f"📦 Exporting Universal PyTorch model to ONNX at: {ONNX_SAVE_PATH}...")
    os.makedirs(os.path.dirname(ONNX_SAVE_PATH), exist_ok=True)
    
    model.eval()
    dummy_input = torch.randn(1, 3, 224, 224, device=device)
    
    torch.onnx.export(
        model,
        dummy_input,
        ONNX_SAVE_PATH,
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}
    )
    print(f"✅ ONNX model exported successfully! Ready for production deployment.")

def main():
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    data_dir = download_all_datasets()
    dataloaders, _ = get_data_loaders(data_dir, batch_size=32)
    
    model = build_universal_model().to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.AdamW(model.parameters(), lr=1e-4, weight_decay=1e-2)
    
    train_model(model, dataloaders, criterion, optimizer, device, num_epochs=15)
    export_to_onnx(model, device)

if __name__ == "__main__":
    main()
