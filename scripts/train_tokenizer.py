#!/usr/bin/env python3
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.tokenizer.bpe_tokenizer import BPETokenizer
def main():
    train_path = Path("data/processed/tiny_train.txt")
    val_path = Path("data/processed/tiny_val.txt")
    if not train_path.exists():
        print("Run scripts/prepare_tiny_data.py first."); sys.exit(1)
    texts = [p.read_text(encoding="utf-8") for p in [train_path, val_path]]
    tok = BPETokenizer(vocab_size=512, min_frequency=1)
    tok.train(texts, verbose=True)
    tok.save(Path("data/checkpoints/tokenizer"))
    print("Tokenizer saved.")
if __name__ == "__main__":
    main()
