"""Character-level tokenizer built from the training corpus.

This tokenizer is trained from scratch on the project's own corpus.
No pretrained tokenizer is used.
"""

from __future__ import annotations

import json
from dataclasses import dataclass


class CharTokenizer:
    """A character tokenizer whose vocabulary is derived from a corpus.

    The vocabulary contains the characters that appear in the supplied
    texts, plus (by default) all printable ASCII characters and a
    newline, plus a special end-of-text token. The ASCII coverage is a
    fixed, documented character set — not learned content — so that
    digits, punctuation, quotes and math symbols always survive an
    encode/decode round-trip even when the corpus itself lacks them.

    Unknown handling: characters outside the vocabulary are silently
    dropped by encode(). Checkpoint compatibility: the full vocabulary
    is saved in every checkpoint (meta.tokenizer_vocab), and a mismatch
    between the saved vocabulary and the model's embedding size is an
    error, never a silent remap.
    """

    def __init__(self, vocab: list[str]):
        self.stoi = {ch: i for i, ch in enumerate(vocab)}
        self.itos = list(vocab)
        self.eot_index = self.stoi["<|eot|>"]

    @classmethod
    def train_from_texts(cls, texts: list[str], include_ascii: bool = True) -> "CharTokenizer":
        seen: dict[str, None] = {}
        for text in texts:
            for ch in text:
                if ch not in seen:
                    seen[ch] = None
        vocab = sorted(seen.keys())
        if include_ascii:
            ascii_chars = [chr(i) for i in range(32, 127)] + ["\n"]
            for ch in ascii_chars:
                if ch not in seen:
                    seen[ch] = None
            vocab = sorted(seen.keys())
        vocab = vocab + ["<|eot|>"]
        return cls(vocab)

    def encode(self, text: str) -> list[int]:
        return [self.stoi[ch] for ch in text if ch in self.stoi]

    def decode(self, ids: list[int]) -> str:
        return "".join(
            self.itos[i] for i in ids if 0 <= i < len(self.itos) and self.itos[i] != "<|eot|>"
        )

    def vocab_size(self) -> int:
        return len(self.itos)

    def save(self, path: str) -> None:
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"vocab": self.itos}, f, ensure_ascii=False)

    @classmethod
    def load(cls, path: str) -> "CharTokenizer":
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return cls(data["vocab"])


@dataclass
class Dataset:
    """Holds train/val/test text splits with provenance notes."""

    train: list[str]
    val: list[str]
    test: list[str]
    provenance: list[dict]


def load_corpus(path: str) -> list[str]:
    with open(path, "r", encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip()]


def make_splits(lines: list[str], val_fraction: float = 0.1, test_fraction: float = 0.1) -> Dataset:
    """Split data before training, as required. No test data leaks into training."""
    n = len(lines)
    n_val = max(1, int(n * val_fraction))
    n_test = max(1, int(n * test_fraction))
    n_train = n - n_val - n_test
    return Dataset(
        train=lines[:n_train],
        val=lines[n_train : n_train + n_val],
        test=lines[n_train + n_val :],
        provenance=[{"source": "project_original_texts", "license": "original"}],
    )
