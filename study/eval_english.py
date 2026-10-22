"""Fixed English evaluation: score checkpoints on the held-out eval set.

Scores any trained checkpoint on study/data/eval_english_v2.json:
  - per-character loss on the held-out paragraphs (never trained on)
  - generation probes (fixed prompts) recorded verbatim
  - repetition statistics on the generated text

Run: python -m study.eval_english runs/english_v2/checkpoint.pt
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

from study.tokenizer import CharTokenizer
from study.torch_model import TransformerLM

ROOT = Path(__file__).resolve().parent.parent


def load_model(ckpt_path: str) -> tuple[TransformerLM, CharTokenizer, dict]:
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    tok = CharTokenizer(ckpt["vocab"])
    cfg = ckpt["model_config"]
    model = TransformerLM(vocab_size=tok.vocab_size(), **cfg)
    model.load_state_dict(ckpt["model"])
    model.eval()
    return model, tok, ckpt


@torch.no_grad()
def char_loss(model, tok, text: str, context: int) -> float:
    """Mean per-character loss on held-out text (teacher forcing)."""
    ids = torch.tensor([tok.encode(text)], dtype=torch.long)
    total, n = 0.0, 0
    # score in windows of the model's context
    step = context
    for s in range(0, max(1, ids.shape[1] - 1), step):
        chunk = ids[:, s : s + step + 1]
        if chunk.shape[1] < 2:
            break
        x, y = chunk[:, :-1], chunk[:, 1:]
        _, loss = model(x, y)
        total += float(loss) * (chunk.shape[1] - 1)
        n += chunk.shape[1] - 1
    return total / max(n, 1)


@torch.no_grad()
def generate(model, tok, prompt: str, n: int = 120, temp: float = 0.8) -> str:
    ids = torch.tensor([tok.encode(prompt)], dtype=torch.long)
    for _ in range(n):
        ctx = ids[:, -model.context_length:]
        logits = model(ctx)[0][0, -1] / temp
        probs = torch.softmax(logits, -1)
        nxt = torch.multinomial(probs, 1)
        ids = torch.cat([ids, nxt.view(1, 1)], dim=1)
        if nxt.item() == tok.eot_index:
            break
    return tok.decode(ids[0].tolist())


def repetition_stats(text: str) -> dict:
    """Crude repetition metrics: most common 4-gram share and the fraction
    of positions that repeat the previous word."""
    words = text.split()
    if len(words) < 5:
        return {"top4gram_share": 0.0, "word_repeat_rate": 0.0}
    fourgrams = [tuple(words[i : i + 4]) for i in range(len(words) - 3)]
    if not fourgrams:
        return {"top4gram_share": 0.0, "word_repeat_rate": 0.0}
    from collections import Counter
    top = Counter(fourgrams).most_common(1)[0][1]
    repeats = sum(1 for i in range(1, len(words)) if words[i] == words[i - 1])
    return {"top4gram_share": round(top / len(fourgrams), 3),
            "word_repeat_rate": round(repeats / (len(words) - 1), 3)}


def main(ckpt_path: str):
    model, tok, ckpt = load_model(ckpt_path)
    eval_data = json.loads((ROOT / "study/data/eval_english_v2.json").read_text())
    paragraphs = eval_data["paragraphs"]
    probes = eval_data["generation_probes"]

    losses = [char_loss(model, tok, p, model.context_length) for p in paragraphs]
    samples = [generate(model, tok, p) for p in probes]
    rep = [repetition_stats(s) for s in samples]

    report = {
        "checkpoint": ckpt_path,
        "stage": ckpt.get("stage"),
        "model_config": ckpt.get("model_config"),
        "heldout_char_loss_mean": round(sum(losses) / len(losses), 4),
        "heldout_char_loss_per_paragraph": [round(l, 4) for l in losses],
        "generation_probes": probes,
        "samples": samples,
        "repetition_stats": rep,
        "note": ("Fixed evaluation on the held-out set (never trained on). "
                 "Loss is per-character, teacher-forced. Samples are recorded "
                 "verbatim, unedited. This does not certify fluency."),
    }
    print(f"held-out char loss: {report['heldout_char_loss_mean']}")
    for probe, sample, r in zip(probes, samples, rep):
        print(f"  probe {probe!r} -> {sample[:90]!r} rep={r}")
    out = Path(ckpt_path).parent / "eval_fixed.json"
    out.write_text(json.dumps(report, indent=2))
    print(f"report saved to {out}")


if __name__ == "__main__":
    main(sys.argv[1])
