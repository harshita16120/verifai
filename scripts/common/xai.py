import os
import torch
import numpy as np
from PIL import Image

def generate_gradcam(model: torch.nn.Module, input_tensor: torch.Tensor, target_class: int, output_path: str) -> str:
    """Generates Grad-CAM heatmap visualization for explainability.

    Highlights which spectral/facial regions led the detector to flag fake/real.
    """
    model.eval()
    gradients = []
    activations = []

    def save_gradient(grad):
        gradients.append(grad)

    # Register hooks on target feature layer
    target_layer = None
    for name, module in model.named_modules():
        if isinstance(module, torch.nn.Conv2d):
            target_layer = module

    if target_layer is None:
        return output_path

    def forward_hook(module, input, output):
        activations.append(output)
        output.register_hook(save_gradient)

    handle = target_layer.register_forward_hook(forward_hook)

    # Forward pass
    input_tensor = input_tensor.requires_grad_()
    output = model(input_tensor)
    score = output[0, target_class]
    
    model.zero_grad()
    score.backward()

    handle.remove()

    if not gradients or not activations:
        return output_path

    grads = gradients[0].cpu().data.numpy()[0]
    acts = activations[0].cpu().data.numpy()[0]

    weights = np.mean(grads, axis=(1, 2))
    cam = np.zeros(acts.shape[1:], dtype=np.float32)

    for i, w in enumerate(weights):
        cam += w * acts[i]

    cam = np.maximum(cam, 0)
    if np.max(cam) > 0:
        cam = cam / np.max(cam)

    # Resize CAM to match input image size
    h, w = input_tensor.shape[2], input_tensor.shape[3]
    cam_img = Image.fromarray(np.uint8(255 * cam)).resize((w, h), Image.BILINEAR)

    # Convert to RGB color map representation (red highlight for high activation)
    cam_arr = np.array(cam_img)
    heatmap = np.zeros((h, w, 3), dtype=np.uint8)
    heatmap[:, :, 0] = cam_arr  # Red channel
    heatmap[:, :, 1] = 255 - cam_arr  # Green channel
    heatmap[:, :, 2] = 128

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    Image.fromarray(heatmap).save(output_path)
    print(f"[XAI] Saved Grad-CAM explanation -> {output_path}")
    return output_path
