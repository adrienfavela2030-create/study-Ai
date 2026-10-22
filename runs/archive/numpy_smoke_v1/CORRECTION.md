# Correction notice for numpy_smoke_v1

This checkpoint was produced by a training run with two defects that were
found during the audit requested in the rebuild specification:

1. **Double-shifted targets.** The loss function shifted the targets a
   second time after the batch builder had already shifted them, so the
   model was trained to predict the token *two* positions ahead instead
   of the next token. Validation loss went down, but it measured the
   wrong objective, and the generated samples in eval_report.json
   (mostly word-like fragments, not English) are consistent with that.
2. **Layer-norm gradient checked only at initialization.** The gradient
   check passed because every layernorm gamma equals 1 at initialization,
   which hides an incorrect mean-term formulation that only matters once
   gamma moves away from 1 during training.

Both defects are fixed in study/model.py, verified by:
- a gradient check with randomized non-unit gamma (worst relative error ~1e-7)
- an alignment test (training on "ababab" yields perfect next-character
  alternation, loss ~0)

The corrected experiment is runs/numpy_smoke_v2. This checkpoint is kept
only as a historical record and must not be used.
