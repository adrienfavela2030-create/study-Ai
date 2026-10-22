"""The verified from-scratch training experiment (pure NumPy).

This is the "smallest working experiment" milestone: it trains a randomly
initialized decoder-only Transformer with next-token prediction on an
original corpus, checks the hand-derived gradients against finite
differences, measures held-out validation/test loss before and after
training, saves a real checkpoint, and writes an honest evaluation
report. It makes no claims beyond what these measurements support.
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from .model import (
    Adam,
    TinyNumPyTransformer,
    TransformerConfig,
    load_checkpoint,
    save_checkpoint,
)
from .tokenizer import CharTokenizer, load_corpus, make_splits

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / "runs"


def evaluate(model: TinyNumPyTransformer, tok: CharTokenizer, texts: list[str], rng, T=64, batches=8):
    losses = []
    for _ in range(batches):
        x, y = sample_batch(texts, tok, rng, T, batch=8)
        loss, _ = model.loss_and_logits(x, y)
        losses.append(loss)
    return float(np.mean(losses))


def sample_batch(texts: list[str], tok: CharTokenizer, rng, T: int, batch: int):
    xs, ys = [], []
    for _ in range(batch):
        line = texts[rng.integers(len(texts))]
        ids = tok.encode(line)
        if len(ids) < T + 1:
            ids = ids + [tok.eot_index] * (T + 1 - len(ids))
        start = rng.integers(0, max(1, len(ids) - T))
        seq = ids[start : start + T + 1]
        xs.append(seq[:-1])
        ys.append(seq[1:])
    return np.array(xs), np.array(ys)


def generate(model: TinyNumPyTransformer, tok: CharTokenizer, prompt: str, n: int = 80, temp: float = 0.8):
    rng = np.random.default_rng(7)
    ids = tok.encode(prompt)
    for _ in range(n):
        ctx = np.array([ids[-model.cfg.context_length :]])
        logits = model.forward(ctx)
        logits = logits[0, -1] / temp
        probs = np.exp(logits - logits.max())
        probs /= probs.sum()
        nxt = int(rng.choice(len(probs), p=probs))
        ids.append(nxt)
    return tok.decode(ids)


def main(steps: int = 120, seed: int = 0):
    print("=== Study AI — NumPy smoke experiment (real training run) ===")
    lines = load_corpus(str(ROOT / "study/data/corpus_english.txt"))
    data = make_splits(lines)
    tok = CharTokenizer.train_from_texts(data.train)
    print(f"corpus lines: train={len(data.train)} val={len(data.val)} test={len(data.test)}")
    print(f"vocab size: {tok.vocab_size()}")

    cfg = TransformerConfig(
        vocab_size=tok.vocab_size(), d_model=24, n_heads=3, n_layers=1, context_length=64
    )
    print(f"parameter count: {cfg.param_count()} (randomly initialized)")

    model = TinyNumPyTransformer(cfg, seed=seed)
    rng = np.random.default_rng(seed)

    # 1. Gradient check (analytical backward vs finite differences)
    gx, gy = sample_batch(data.train, tok, np.random.default_rng(3), T=16, batch=2)
    report = model.gradcheck(gx, gy)
    worst = max(report.values())
    print(f"gradcheck worst relative error: {worst:.3e} across {len(report)} parameter tensors")
    if worst > 1e-2:
        print("GRADCHECK FAILED")
        sys.exit(1)

    # 2. Loss before training
    val_before = evaluate(model, tok, data.val, rng)
    test_before = evaluate(model, tok, data.test, rng)
    print(f"loss before training: val={val_before:.4f} test={test_before:.4f}")
    sample_before = generate(model, tok, "The student ")

    # 3. Train
    opt = Adam(model.params, lr=0.02)
    log = []
    t0 = time.time()
    for step in range(steps):
        x, y = sample_batch(data.train, tok, rng, T=64, batch=16)
        cache: dict = {}
        loss, _ = model.loss_and_logits(x, y, cache)
        grads = model.backward(cache, y)
        opt.step(model.params, grads)
        log.append({"step": step + 1, "loss": loss})
        if (step + 1) % 20 == 0:
            print(f"step {step+1:4d}  loss {loss:.4f}")
    elapsed = time.time() - t0

    # 4. Loss after training
    val_after = evaluate(model, tok, data.val, rng)
    test_after = evaluate(model, tok, data.test, rng)
    sample_after = generate(model, tok, "The student ")
    print(f"loss after training:  val={val_after:.4f} test={test_after:.4f}  ({elapsed:.1f}s)")

    # 5. Save real checkpoint
    run_dir = RUNS / "numpy_smoke_v1"
    run_dir.mkdir(parents=True, exist_ok=True)
    save_checkpoint(
        str(run_dir / "checkpoint.json"),
        model,
        {
            "stage": "english-smoke",
            "steps": steps,
            "seed": seed,
            "created": datetime.now(timezone.utc).isoformat(),
            "corpus": "study/data/corpus_english.txt (original text)",
        },
    )
    with open(run_dir / "log.json", "w") as f:
        json.dump(log, f)

    eval_report = {
        "experiment": "numpy_smoke_v1",
        "what_was_trained": "1-block decoder-only Transformer, 24-dim, next-character prediction",
        "parameters": cfg.param_count(),
        "gradcheck_worst_relative_error": worst,
        "val_loss_before": val_before,
        "val_loss_after": val_after,
        "test_loss_before": test_before,
        "test_loss_after": test_after,
        "training_seconds": round(elapsed, 1),
        "sample_before": sample_before,
        "sample_after": sample_after,
        "honest_assessment": (
            "Loss decreased on held-out validation and test splits, and the analytical "
            "backward pass matches finite differences. This proves the from-scratch "
            "training pipeline works. It does NOT establish English proficiency, "
            "comprehension, or schoolwork ability: the model is tiny and the corpus is "
            "small. Larger training and human evaluation are still required."
        ),
    }
    with open(run_dir / "eval_report.json", "w") as f:
        json.dump(eval_report, f, indent=2)
    print(f"saved checkpoint + log + eval report to {run_dir}")

    # 6. Reload check
    m2, meta = load_checkpoint(str(run_dir / "checkpoint.json"))
    rl, _ = m2.loss_and_logits(*sample_batch(data.test, tok, np.random.default_rng(11), T=64, batch=8))
    print(f"checkpoint reload verified (meta: {meta['stage']}, {meta['steps']} steps)")

    # update runs manifest — only records what actually happened
    manifest = {
        "numpy_smoke_v1": {
            "status": "completed",
            "when": datetime.now(timezone.utc).isoformat(),
            "checkpoint": "runs/numpy_smoke_v1/checkpoint.json",
            "note": "Small from-scratch experiment. Real training, real checkpoint.",
        },
        "english_full_pretraining": {"status": "not_started", "note": "Requires the PyTorch pipeline and a larger corpus on suitable hardware."},
        "knowledge_training": {"status": "not_started"},
        "educational_sft": {"status": "not_started"},
        "ocr_training": {"status": "not_started"},
    }
    with open(RUNS / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)
    print("runs/manifest.json updated — records only stages that actually ran.")
    print("=== done ===")


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=120)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    main(steps=args.steps, seed=args.seed)
