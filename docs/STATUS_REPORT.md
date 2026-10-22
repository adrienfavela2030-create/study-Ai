# Study AI — Status Report (honest)

Updated: 2026-10-21, after the audit-driven repair round.

## Verified capabilities (each backed by an executed test)

| Capability | Evidence |
|---|---|
| From-scratch training pipeline end to end | `runs/numpy_smoke_v2/` — real 120-step run; gradcheck 1.9e-7 with randomized gamma; next-token alignment proven; deterministic reload; resume works |
| Tokenizer round-trips spec cases | 12 cases (apostrophes, dates, math, quotes, newlines, titles) — 0 failures |
| Checkpoint/vocab compatibility errors loudly | `test_checkpoint_vocab_mismatch_is_an_error` |
| Deterministic math solving (brackets, order of operations) | `12 × (4 + 1) = 60` tested in JS and Python |
| Help Me Understand withholds the final answer | tested in both languages |
| OCR cleanup non-destructive; junk reported, never silent | Node tests on the deployed `docs/app.js` |
| Evidence excludes questions/choices/instructions | Node test |
| Book corrections keep the requested title; numeric picks work | Node tests |
| Question selection preserves numbers 2, 7, 10 | Python test |
| Source-grounding: quotes must match, snippets can't be cited | Python tests |
| Research summary counts only opened pages | code + tests |

## Test results (actually executed)

- Python: **42 tests — 39 passed, 0 failed, 3 skipped** (PyTorch not
  installed in the training-less environment; skips are labeled, never
  counted as passes).
- Node (deployed app logic): **25 passed, 0 failed, 0 skipped**.

## Known limitations (disclosed, not hidden)

1. **The language model cannot generate English.** The corrected smoke
   model is 13,464 parameters on a ~2.5 KB original corpus. Its samples
   are character-statistics, not sentences. Every app answer is therefore
   deterministic rules + retrieval — labeled as such, never presented as
   model generation. Training a model that can actually write requires
   hardware this environment does not have; the exact commands are in
   the README (`python -m study.train --stage english ...`).
2. **Browser OCR uses pretrained Tesseract.js.** The UI now discloses
   this. The compliant from-scratch OCR (`study/ocr.py`) is code-complete
   and shape-tested but untrained (needs PyTorch + a GPU or a long CPU
   run on synthetic data).
3. **Chapter-specific book answers are not supported.** When a question
   needs the contents of specific chapters, the system does not invent
   them; it asks the student to upload the pages. Publisher descriptions
   are labeled as identity evidence only.
4. **Semantic fact-checking is lexical.** The grounding validator checks
   quotes exactly and keyword support; it cannot prove a claim is true,
   only flag unsupported wording.
5. The earlier defective run is archived, not deleted
   (`runs/archive/numpy_smoke_v1/CORRECTION.md`).

## Not done yet (next milestones, in order)

- Real English training at scale (blocked on hardware).
- From-scratch OCR training + layout analysis (image quality gating,
  skew correction, structured document output).
- Chapter-aware source retrieval with evidence tracking.
- The full visual redesign (deliberately deferred: the specification's
  own build order gates it behind working intelligence).
