#!/usr/bin/env python3
import argparse, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.training.train_lm import train
def main():
    p = argparse.ArgumentParser()
    p.add_argument("--config", default="configs/tiny_lm.yaml")
    args = p.parse_args()
    train(args.config)
if __name__ == "__main__":
    main()
