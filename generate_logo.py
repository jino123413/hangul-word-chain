"""
Generate hangul-word-chain app logo via ComfyUI.

- Uses local ComfyUI endpoint: http://127.0.0.1:8188
- Generates 3 variants with Flux Schnell GGUF workflow
- Resizes to 600x600 and saves to app-logos/hangul-word-chain.png
"""

import json
import os
import shutil
import time
import urllib.request
from pathlib import Path

COMFYUI_URL = "http://127.0.0.1:8188"
APP_LOGOS_DIR = Path(r"C:\Users\USER-PC\Desktop\appintoss-project\app-logos")
COMFYUI_OUTPUT = Path(
    r"C:\Users\USER-PC\Downloads\ComfyUI_windows_portable_nvidia"
    r"\ComfyUI_windows_portable\ComfyUI\output"
)

SELECTED_VARIANT = "b"

NEGATIVE_TEXT = (
    "text, letters, words, typography, korean characters, hangul, alphabet, "
    "numbers, digits, watermark, signature, logo text, glyphs, runes"
)

VARIANTS = [
    {
        "key": "a",
        "label": "Slate Mint A",
        "seed": 260311,
        "bg_hex": "155E75",
        "accent_hex": "CCFBF1",
        "deep_hex": "0B3B4B",
    },
    {
        "key": "b",
        "label": "Slate Mint B",
        "seed": 260312,
        "bg_hex": "164E63",
        "accent_hex": "99F6E4",
        "deep_hex": "082F3E",
    },
    {
        "key": "c",
        "label": "Slate Mint C",
        "seed": 260313,
        "bg_hex": "0F766E",
        "accent_hex": "CFFAFE",
        "deep_hex": "134E4A",
    },
]


def build_prompt(variant):
    bg = variant["bg_hex"]
    accent = variant["accent_hex"]
    deep = variant["deep_hex"]
    return {
        "name": f"hangul_word_chain_logo_{variant['key']}",
        "seed": variant["seed"],
        "clip_l": (
            "mobile app icon, abstract relay track symbol, "
            "two baton capsules handing off along curved lane lines, "
            f"solid background #{bg}, no text"
        ),
        "t5xxl": (
            "A premium mobile app icon for a relay-style word-chain game. "
            f"Solid background color hex {bg}. "
            "Center icon has two rounded baton capsules meeting at a handoff point over a simple curved track. "
            "Use only geometric shapes, no characters. "
            f"Main icon color is deep slate teal hex {deep}. "
            f"Track accent and highlights use mint color hex {accent}. "
            "Simple geometric icon, centered, high contrast, clean flat vector style. "
            "Do not draw any letters or language symbols. "
            "No text, no typography, no numbers, no gradients, no photo style, no shadows."
        ),
    }


def build_workflow(prompt_data):
    return {
        "prompt": {
            "1": {
                "class_type": "UnetLoaderGGUF",
                "inputs": {"unet_name": "flux1-schnell-Q4_K_S.gguf"},
            },
            "2": {
                "class_type": "DualCLIPLoaderGGUF",
                "inputs": {
                    "clip_name1": "clip_l.safetensors",
                    "clip_name2": "t5-v1_1-xxl-encoder-Q4_K_M.gguf",
                    "type": "flux",
                },
            },
            "3": {
                "class_type": "CLIPTextEncodeFlux",
                "inputs": {
                    "clip": ["2", 0],
                    "clip_l": prompt_data["clip_l"],
                    "t5xxl": prompt_data["t5xxl"],
                    "guidance": 3.5,
                },
            },
            "4": {
                "class_type": "CLIPTextEncodeFlux",
                "inputs": {
                    "clip": ["2", 0],
                    "clip_l": NEGATIVE_TEXT,
                    "t5xxl": NEGATIVE_TEXT,
                    "guidance": 3.5,
                },
            },
            "5": {
                "class_type": "EmptySD3LatentImage",
                "inputs": {
                    "width": 512,
                    "height": 512,
                    "batch_size": 1,
                },
            },
            "6": {
                "class_type": "KSampler",
                "inputs": {
                    "model": ["1", 0],
                    "seed": prompt_data["seed"],
                    "steps": 4,
                    "cfg": 1.0,
                    "sampler_name": "euler",
                    "scheduler": "simple",
                    "positive": ["3", 0],
                    "negative": ["4", 0],
                    "latent_image": ["5", 0],
                    "denoise": 1.0,
                },
            },
            "7": {
                "class_type": "VAELoader",
                "inputs": {"vae_name": "ae.safetensors"},
            },
            "8": {
                "class_type": "VAEDecode",
                "inputs": {"samples": ["6", 0], "vae": ["7", 0]},
            },
            "9": {
                "class_type": "SaveImage",
                "inputs": {
                    "images": ["8", 0],
                    "filename_prefix": prompt_data["name"],
                },
            },
        }
    }


def queue_prompt(workflow):
    payload = json.dumps(workflow).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFYUI_URL}/prompt",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    return json.loads(urllib.request.urlopen(req).read())["prompt_id"]


def wait_for_completion(prompt_id, timeout=420):
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = urllib.request.urlopen(f"{COMFYUI_URL}/history/{prompt_id}")
            history = json.loads(resp.read())
            if prompt_id in history:
                status = history[prompt_id].get("status", {})
                if status.get("completed", False) or status.get("status_str") == "success":
                    return history[prompt_id]
                if status.get("status_str") == "error":
                    print(f"  ERROR: {status}")
                    return None
        except Exception:
            pass
        time.sleep(3)
    print("  TIMEOUT")
    return None


def find_output_filename(history):
    try:
        for _node_id, node_out in history.get("outputs", {}).items():
            if "images" in node_out:
                return node_out["images"][0].get("filename", "")
    except Exception:
        pass
    return ""


def resolve_output_path(filename):
    direct = COMFYUI_OUTPUT / filename
    if direct.exists():
        return direct
    if COMFYUI_OUTPUT.exists():
        for sub in COMFYUI_OUTPUT.iterdir():
            candidate = sub / filename
            if sub.is_dir() and candidate.exists():
                return candidate
    return direct


def resize_to_600(src, dst):
    try:
        pil_image_module = __import__("PIL.Image", fromlist=["Image"])
        image = pil_image_module.open(src)
        if hasattr(pil_image_module, "Resampling"):
            resample_mode = pil_image_module.Resampling.LANCZOS
        else:
            resample_mode = pil_image_module.LANCZOS
        image = image.resize((600, 600), resample_mode)
        image.save(dst, "PNG", optimize=True)
        return True
    except Exception:
        shutil.copy2(src, dst)
        return False


def main():
    os.makedirs(APP_LOGOS_DIR, exist_ok=True)
    prompts = [build_prompt(v) for v in VARIANTS]
    generated = {}

    print("=" * 68)
    print("hangul-word-chain ComfyUI logo generation")
    print(f"ComfyUI endpoint: {COMFYUI_URL}")
    print("=" * 68)

    for prompt_data in prompts:
        print(f"\n[{prompt_data['name']}] seed={prompt_data['seed']}")
        try:
            prompt_id = queue_prompt(build_workflow(prompt_data))
            print(f"  Queued: {prompt_id}")
        except Exception as error:
            print(f"  FAILED to queue prompt: {error}")
            continue

        history = wait_for_completion(prompt_id)
        if not history:
            print("  Failed or timed out")
            continue

        filename = find_output_filename(history)
        if not filename:
            print("  No output file found")
            continue

        src = resolve_output_path(filename)
        if not src.exists():
            print(f"  Output not found: {src}")
            continue

        key = prompt_data["name"].rsplit("_", 1)[-1]
        variant_path = APP_LOGOS_DIR / f"hangul-word-chain-{key}.png"
        resized = resize_to_600(str(src), str(variant_path))
        generated[key] = variant_path
        action = "resized" if resized else "copied"
        print(f"  Saved ({action}): {variant_path.name}")

    if SELECTED_VARIANT not in generated:
        print(f"\nSelected variant '{SELECTED_VARIANT}' was not generated.")
        return

    final_path = APP_LOGOS_DIR / "hangul-word-chain.png"
    shutil.copy2(generated[SELECTED_VARIANT], final_path)

    print("\nFinal selection copied:")
    print(f"  {generated[SELECTED_VARIANT].name} -> {final_path.name}")

    print("\nGenerated files:")
    for key in sorted(generated.keys()):
        print(f"  - {generated[key].name}")


if __name__ == "__main__":
    main()
