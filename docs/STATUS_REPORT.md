# Study AI — Status Report (honest)

Updated: 2026-10-21, after the audit-driven repair round and the first
real PyTorch training runs.

## Real training runs (all executed in this environment)

| Stage | Params | Val loss before → after | Status |
|---|---|---|---|
| numpy_smoke_v2 (NumPy, corrected) | 13,992 | 6.54 → 3.19 | verified: alignment, gradcheck (worst ratio 0.265 ≤ 1), full-logit reload, resume with independently sampled batches (max param diff 0.0) |
| english_v1 | 357,312 | 4.44 → 1.34 | real improvement on held-out text; artifact labeled weight_initialization (no optimizer state was saved at run time) |
| knowledge_v1 (init from english) | 357,312 | 1.28 → 1.34 | **val regressed** — overfit the 36-line knowledge corpus |
| supervised_v1 (init from knowledge) | 357,312 | 3.48 → 4.11 (eval) / 4.4 → 0.26 (masked response loss) | **val regressed** — overfit 11 SFT examples |
| ocr_v1 (from-scratch CNN+BiLSTM+CTC) | — | char accuracy **1.000** on 50 held-out synthetic images | real, synthetic data only |

Generated samples from supervised_v1 (recorded verbatim, unedited):

- "The water cycle ofrae th n a isha aa kan e  by enthe sth h"
- "Question 1: What do plants need, the rine enthby pa by entuoea…"

**The samples are not English.** The model learned character statistics
(common words like "the") but cannot generate coherent sentences. Loss
going down on tiny corpora (a few KB) is memorization, not language
learning — which is why knowledge/supervised validation regressed. This
is the honest state of the "AI" today: the app's answers come from
deterministic rules + retrieval, never from this model, and nothing in
the UI claims otherwise.

## What is verified (each backed by an executed test)

| Capability | Evidence |
|---|---|
| Training pipeline correctness | double-shift fixed; next-token alignment test; gradcheck with randomized non-unit gamma (1.9e-7) |
| Tokenizer round-trips spec cases | 12 cases (apostrophes, dates, math, quotes, newlines, titles) — 0 failures |
| Checkpoints carry vocab + model config; mismatch is an error | Python tests |
| Deterministic math (brackets, order of operations) | `12 × (4 + 1) = 60` tested in JS and Python |
| Help Me Understand withholds final answers | tested in both languages |
| OCR cleanup non-destructive; removals reported to the student | Node tests on deployed `docs/app.js` |
| Evidence excludes questions/choices/instructions | Node test |
| Evidence is presented as UNVERIFIED excerpts, never as "Draft answers"; the app teaches checking it against the question | Node tests execute buildAnswer on an Aesop fragment and a chapter question |
| Book corrections keep requested title; numeric picks work | Node tests |
| Question selection preserves numbers 2, 7, 10 | Python test |
| Quotes must match sources; snippets can't be cited | Python tests |
| Trainer CLI: --resume restores optimizer/RNG/step; non-resumable artifacts are rejected honestly | Python CLI regression test |
| From-scratch OCR trains and decodes synthetic text | `runs/ocr_v1/` checkpoint + 1.000 char accuracy (synthetic only) |

## Test results (actually executed, this session)

- Python: **49 tests — 49 passed, 0 failed, 0 skipped** (PyTorch is now
  installed, so previously skipped tests now run).
- Node (deployed app logic): **34 passed, 0 failed, 0 skipped**.

## Known limitations (disclosed, not hidden)

1. **The language model cannot generate English.** 357k parameters on a
   few KB of original text cannot learn a language — fluency was not
   achieved in these experiments. Every app answer is deterministic
   rules + retrieval, labeled as such.
2. **The from-scratch OCR works on synthetic images only.** Real-photo
   OCR accuracy is unknown and must not be claimed. The browser's
   pretrained Tesseract path has been REMOVED from the compliant build:
   photo reading is disabled (the photo is shown; the student types the
   text) until the from-scratch OCR handles real photos.
3. **Chapter-specific book answers are not supported** — the system asks
   the student to provide pages rather than inventing content.
4. **Semantic fact-checking is lexical** — it flags unsupported wording;
   it cannot prove truth.
5. The defective first run is archived with a correction notice
   (`runs/archive/numpy_smoke_v1/CORRECTION.md`).

## Remaining milestones

- Scale training: real corpora (MB-scale), far more compute, curriculum
  over english → knowledge → supervised (the CLI and checkpoint format
  are ready: `python -m study.train --stage ...`). Fluency is a goal,
  not a current property — these experiments did not achieve it.
- Real-photo OCR training (real photo/scan dataset, layout handling),
  then wiring it into the UI.
- Serving the trained model in the app (currently unimplemented).
- Then the visual redesign, deliberately deferred behind working
  intelligence per the specification's own build order.
