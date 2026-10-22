"""Inspect available hardware, memory, storage, and compute budget.

Run before training: python -m study.inspect_hardware
"""

from __future__ import annotations

import json
import platform
import shutil
import socket


def inspect() -> dict:
    info: dict = {
        "python": platform.python_version(),
        "machine": platform.machine(),
        "os": platform.system(),
        "cpu_count": __import__("os").cpu_count(),
        "ram_gb": None,
        "disk_free_gb": round(shutil.disk_usage(__file__).free / 1e9, 1),
        "torch": None,
        "cuda": False,
        "cuda_device": None,
    }
    try:
        import psutil

        info["ram_gb"] = round(psutil.virtual_memory().total / 1e9, 1)
    except ImportError:
        pass
    try:
        import torch

        info["torch"] = torch.__version__
        info["cuda"] = torch.cuda.is_available()
        if info["cuda"]:
            info["cuda_device"] = torch.cuda.get_device_name(0)
            info["vram_gb"] = round(torch.cuda.get_device_properties(0).total_memory / 1e9, 1)
    except ImportError:
        info["torch"] = "not installed"
    return info


def estimate_feasibility(info: dict) -> dict:
    """Honest resource planning, per the spec."""
    notes = []
    can_train_torch = bool(info.get("cuda")) or info["torch"] not in (None, "not installed")
    notes.append(
        "The NumPy smoke experiment runs on any CPU. "
        "The PyTorch scale-up pipeline needs PyTorch installed; a GPU is strongly "
        "recommended for anything beyond toy sizes."
    )
    if not info.get("cuda"):
        notes.append(
            "No CUDA GPU detected: training a useful school assistant on CPU is "
            "not realistic. Expect character-level toy experiments only."
        )
    return {
        "can_run_numpy_smoke": True,
        "can_run_pytorch_pipeline": can_train_torch,
        "notes": notes,
        "warning": (
            "Training a useful language model and a separate image-reading model "
            "from scratch is a major computing task. This inspection makes no "
            "claim that the current hardware can complete it."
        ),
    }


if __name__ == "__main__":
    info = inspect()
    print(json.dumps(info, indent=2))
    print(json.dumps(estimate_feasibility(info), indent=2))
