"""Simple token dataset for language modeling."""
from __future__ import annotations
from pathlib import Path
from typing import List, Tuple
import torch
from torch.utils.data import Dataset

class TextDataset(Dataset):
    def __init__(self, token_ids: List[int], block_size: int):
        self.data = torch.tensor(token_ids, dtype=torch.long)
        self.block_size = block_size
    def __len__(self) -> int:
        return max(0, len(self.data) - self.block_size)
    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        chunk = self.data[idx : idx + self.block_size + 1]
        return chunk[:-1], chunk[1:]

def load_text_file(path: str | Path) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def encode_file(tokenizer, path: str | Path, add_eos: bool = True) -> List[int]:
    return tokenizer.encode(load_text_file(path), add_eos=add_eos)
