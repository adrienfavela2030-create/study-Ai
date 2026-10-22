"""Training CLI for the PyTorch pipeline.

Stages (each must actually run before its checkpoint exists):
  english   — next-token pretraining on corpus_english.txt
  knowledge — continued training on corpus_knowledge.txt
  supervised — educational SFT on sft_data.jsonl (response-masked loss)

Usage:
  python -m study.train --stage english --steps 200 --context 256 \
      --width 128 --layers 4 --heads 4 --batch 4
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import torch

from .tokenizer import CharTokenizer, load_corpus
from .torch_model import TransformerLM

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / "runs"


def build_tokenizer(stage: str) -> CharTokenizer:
    corpora = ["study/data/corpus_english.txt"]
    if stage in ("knowledge", "supervised"):
        corpora.append("study/data/corpus_knowledge.txt")
    if stage == "supervised":
        corpora.append("study/data/sft_data.jsonl")
    texts = []
    for c in corpora:
        for line in load_corpus(str(ROOT / c)):
            texts.append(line)
    return CharTokenizer.train_from_texts(texts)


def load_stage_data(stage: str):
    if stage == "english":
        lines = load_corpus(str(ROOT / "study/data/corpus_english.txt"))
    elif stage == "knowledge":
        lines = load_corpus(str(ROOT / "study/data/corpus_knowledge.txt"))
    else:
        with open(ROOT / "study/data/sft_data.jsonl", encoding="utf-8") as f:
            lines = [json.loads(l)["prompt"] + "\n" + json.loads(l)["response"] for l in f if l.strip()]
    # split before training: 80/10/10
    n = len(lines)
    n_val = max(1, n // 10)
    return lines[: n - 2 * n_val], lines[n - 2 * n_val : n - n_val], lines[n - n_val :]


def supervised_batch(tok: CharTokenizer, prompts, responses, T, device):
    """Response-masked supervised batch: loss counts only response tokens."""
    xs, ys, masks = [], [], []
    for p, r in zip(prompts, responses):
        ids_p = tok.encode(p)
        ids_r = tok.encode(r) + [tok.eot_index]
        ids = (ids_p + ids_r)[: T + 1]
        pad = [tok.eot_index] * (T + 1 - len(ids))
        mask = [0] * len(ids_p) + [1] * len(ids_r) + [0] * len(pad)
        ids = ids + pad
        mask = mask[: T + 1]
        xs.append(ids[:-1])
        ys.append(ids[1:])
        masks.append(mask[1:])
    return (torch.tensor(xs, device=device), torch.tensor(ys, device=device),
            torch.tensor(masks, dtype=torch.float32, device=device))


def masked_ce_loss(logits, targets, mask):
    V = logits.size(-1)
    losses = nn.functional.cross_entropy(
        logits.reshape(-1, V), targets.reshape(-1), reduction="none"
    )
    m = mask.reshape(-1)
    return (losses * m).sum() / m.sum().clamp(min=1)


import torch.nn as nn  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["english", "knowledge", "supervised"], required=True)
    ap.add_argument("--steps", type=int, default=200)
    ap.add_argument("--context", type=int, default=256)
    ap.add_argument("--width", type=int, default=128)
    ap.add_argument("--layers", type=int, default=4)
    ap.add_argument("--heads", type=int, default=4)
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--init-from", type=str, default=None,
                    help="resume from a saved checkpoint (continues training)")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device: {device}")

    tok = build_tokenizer(args.stage)
    train_lines, val_lines, test_lines = load_stage_data(args.stage)
    print(f"data: train={len(train_lines)} val={len(val_lines)} test={len(test_lines)}")

    model = TransformerLM(
        vocab_size=tok.vocab_size(), d_model=args.width, n_heads=args.heads,
        n_layers=args.layers, context_length=args.context,
    ).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"parameters (randomly initialized): {n_params}")

    if args.init_from:
        ckpt = torch.load(args.init_from, map_location=device, weights_only=True)
        model.load_state_dict(ckpt["model"])
        print(f"resumed from {args.init_from} (step {ckpt.get('step')})")

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)

    def batch_from(lines, supervised=False):
        idx = torch.randint(0, len(lines), (args.batch,))
        if supervised:
            with open(ROOT / "study/data/sft_data.jsonl", encoding="utf-8") as f:
                examples = [json.loads(l) for l in f if l.strip()]
            picked = [examples[i] for i in idx.tolist()]
            return supervised_batch(tok, [p["prompt"] for p in picked],
                                    [p["response"] for p in picked], args.context, device)
        xs, ys = [], []
        for i in idx.tolist():
            ids = tok.encode(lines[i])
            if len(ids) < args.context + 1:
                ids = ids + [tok.eot_index] * (args.context + 1 - len(ids))
            s = torch.randint(0, len(ids) - args.context, (1,)).item()
            seq = ids[s : s + args.context + 1]
            xs.append(seq[:-1])
            ys.append(seq[1:])
        return (torch.tensor(xs, device=device), torch.tensor(ys, device=device))

    def evaluate(lines):
        model.eval()
        with torch.no_grad():
            total = n = 0.0
            for i in range(0, min(len(lines), 16), args.batch):
                chunk = lines[i : i + args.batch]
                xs, ys = [], []
                for line in chunk:
                    ids = tok.encode(line)
                    if len(ids) < args.context + 1:
                        ids = ids + [tok.eot_index] * (args.context + 1 - len(ids))
                    xs.append(ids[: args.context])
                    ys.append(ids[1 : args.context + 1])
                x = torch.tensor(xs, device=device)
                y = torch.tensor(ys, device=device)
                _, loss = model(x, y)
                total += float(loss) * len(chunk)
                n += len(chunk)
        model.train()
        return total / max(n, 1)

    val_before = evaluate(val_lines)
    print(f"val loss before: {val_before:.4f}")

    log = []
    t0 = time.time()
    for step in range(args.steps):
        if args.stage == "supervised":
            x, y, mask = batch_from(train_lines, supervised=True)
            logits, _ = model(x)
            loss = masked_ce_loss(logits, y, mask)
        else:
            x, y = batch_from(train_lines)
            _, loss = model(x, y)
        opt.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        log.append({"step": step + 1, "loss": float(loss)})
        if (step + 1) % 20 == 0:
            print(f"step {step+1:4d}  loss {float(loss):.4f}")

    val_after = evaluate(val_lines)
    test_after = evaluate(test_lines)
    print(f"val loss after: {val_after:.4f}  test loss: {test_after:.4f}")

    run_dir = RUNS / f"{args.stage}_v1"
    run_dir.mkdir(parents=True, exist_ok=True)
    ckpt_path = run_dir / "checkpoint.pt"
    torch.save(
        {"model": model.state_dict(), "step": args.steps, "stage": args.stage,
         "created": datetime.now(timezone.utc).isoformat(), "vocab": tok.itos,
         "model_config": {"d_model": args.width, "n_heads": args.heads,
                          "n_layers": args.layers, "context_length": args.context}},
        ckpt_path,
    )
    with open(run_dir / "log.json", "w") as f:
        json.dump(log, f)
    with open(run_dir / "eval_report.json", "w") as f:
        json.dump({
            "stage": args.stage,
            "parameters": n_params,
            "val_loss_before": val_before,
            "val_loss_after": val_after,
            "test_loss_after": test_after,
            "training_seconds": round(time.time() - t0, 1),
            "device": device,
            "honest_assessment": (
                "Loss measurements on held-out splits only. Lower loss does not by "
                "itself prove schoolwork ability; human evaluation is still required."
            ),
        }, f, indent=2)
    print(f"saved checkpoint to {ckpt_path}")

    manifest_path = RUNS / "manifest.json"
    manifest = {}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
    manifest[f"{args.stage}_v1"] = {
        "status": "completed",
        "when": datetime.now(timezone.utc).isoformat(),
        "checkpoint": f"runs/{args.stage}_v1/checkpoint.pt",
    }
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print("manifest updated")


if __name__ == "__main__":
    main()
