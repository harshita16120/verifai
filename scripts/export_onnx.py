import os
import sys
import json
import argparse
import torch
import torch.nn as nn
from torchvision import models

def parse_args():
    parser = argparse.ArgumentParser(description="Export PyTorch Deepfake Detector checkpoint to ONNX format.")
    default_model = os.environ.get("VERIFAI_MODEL", "models/face/deepfake_detector_v2.pth")
    default_onnx = os.environ.get("VERIFAI_ONNX", "models/face/detector_v2.onnx")

    parser.add_argument("--checkpoint", "-c", type=str, default=default_model, help="Path to PyTorch checkpoint (.pth)")
    parser.add_argument("--out", "-o", type=str, default=default_onnx, help="Path for output ONNX file (.onnx)")
    parser.add_argument("--no-quantize", action="store_true", default=True, help="Skip int8 quantization to prevent probability shift")
    parser.add_argument("--arch", type=str, default="b0", choices=["b0", "b4"], help="Model backbone architecture")
    return parser.parse_args()

def build_model(arch="b0"):
    if arch == "b0":
        model = models.efficientnet_b0()
        in_features = model.classifier[1].in_features
        model.classifier[1] = nn.Sequential(
            nn.Dropout(p=0.2, inplace=True),
            nn.Linear(in_features, 2)
        )
    elif arch == "b4":
        model = models.efficientnet_b4()
        in_features = model.classifier[1].in_features
        model.classifier[1] = nn.Sequential(
            nn.Dropout(p=0.3, inplace=True),
            nn.Linear(in_features, 2)
        )
    else:
        raise ValueError(f"Unsupported architecture: {arch}")
    return model

def export_onnx(checkpoint_path, onnx_path, arch="b0", no_quantize=True):
    device = torch.device("cpu")
    model = build_model(arch=arch)

    # Resolve fallback path if default v2 doesn't exist yet
    if not os.path.exists(checkpoint_path):
        fallback_path = "models/face/deepfake_detector.pth"
        if os.path.exists(fallback_path):
            print(f"⚠️ Primary checkpoint '{checkpoint_path}' not found. Falling back to '{fallback_path}'.")
            checkpoint_path = fallback_path
        else:
            print(f"⚠️ Note: Checkpoint '{checkpoint_path}' not found. Initializing with default EfficientNet weights for export preview.")

    if os.path.exists(checkpoint_path):
        state_dict = torch.load(checkpoint_path, map_location=device)
        model_state = model.state_dict()
        matched = {k: v for k, v in state_dict.items() if k in model_state and model_state[k].shape == v.shape}
        model_state.update(matched)
        model.load_state_dict(model_state)
        print(f"✅ Loaded checkpoint weights from {checkpoint_path}")

    model.eval()

    os.makedirs(os.path.dirname(os.path.abspath(onnx_path)), exist_ok=True)
    dummy_input = torch.randn(1, 3, 224, 224, device=device)

    print(f"📦 Exporting model to ONNX: {onnx_path}...")
    torch.onnx.export(
        model,
        dummy_input,
        onnx_path,
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}
    )

    print(f"✅ ONNX model exported successfully to {onnx_path}")

    # Generate metadata detector.json
    metadata_path = os.path.join(os.path.dirname(os.path.abspath(onnx_path)), "detector.json")
    metadata = {
        "architecture": f"EfficientNet-{arch.upper()}",
        "input_shape": [1, 3, 224, 224],
        "normalization": {
            "mean": [0.485, 0.456, 0.406],
            "std": [0.229, 0.224, 0.225]
        },
        "labels": ["Fake", "Real"],
        "quantized": not no_quantize,
        "onnx_model": os.path.basename(onnx_path)
    }

    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"📄 Created model metadata config at {metadata_path}")

    # Verify ONNX model loading
    try:
        import onnxruntime as ort
        session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
        print("\nONNX OK")
        print("INPUT:")
        print([(x.name, x.shape) for x in session.get_inputs()])
        print("OUTPUT:")
        print([(x.name, x.shape) for x in session.get_outputs()])
    except ImportError:
        print("💡 Install onnxruntime to perform runtime validation check (`pip install onnxruntime`).")
    except Exception as e:
        print(f"⚠️ ONNX verification note: {e}")

def main():
    args = parse_args()
    export_onnx(
        checkpoint_path=args.checkpoint,
        onnx_path=args.out,
        arch=args.arch,
        no_quantize=args.no_quantize
    )

if __name__ == "__main__":
    main()
