# Investigation: suspected SFT data contamination (disproven)

A review suspected that the supervised trainer's batch sampler drew
positions from the FULL sft_data.jsonl (11 examples), which would have
let validation and test examples enter training and would have made the
supervised_v1 measurements invalid.

## Investigation

1. **Code path.** The old sampler drew `idx = torch.randint(0,
   len(train_lines), (batch,))` and then indexed the full example list.
   With the positional 80/10/10 split (11 examples: train = first 9,
   val = index 9, test = index 10), `len(train_lines)` = 9, so idx was
   drawn from [0, 9) — the val and test positions (9 and 10) were
   mathematically unreachable.

2. **Empirical verification.** The sampler was rewritten to draw
   explicitly from `load_sft_train_split()` (the train split only), and
   the stage was re-run with identical settings. The rerun produced
   bit-identical losses at every checkpoint and identical final
   evaluation (val 4.1096, test 4.0600). If the training data had
   changed, identical results would be impossible.

3. **Brute-force check.** Over 2000 seeds x 64 draws, the maximum index
   ever drawn was 8 — never 9 or 10.

## Conclusion

**No contamination occurred. The supervised_v1 measurements stand.**
The sampler is now correct by construction (it can only see the train
split) rather than correct by coincidence, and a regression test
enforces split membership.

## Remaining honest limitation

The val and test splits contain a SINGLE example each (1 of 11). The
held-out SFT evaluation is therefore statistically nearly empty: it
cannot establish or refute overfitting. A meaningful supervised
evaluation requires a much larger SFT dataset.
