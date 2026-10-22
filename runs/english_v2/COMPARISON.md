# Measured training increment: english_v1 vs english_v2

All numbers below were produced by the SAME fixed evaluation
(study/data/eval_english_v2.json: 15 held-out paragraphs from the end of
the v2 corpus, never trained on; per-character teacher-forced loss).

| Checkpoint | Corpus | Params | Steps | Held-out char loss |
|---|---|---|---|---|
| english_v1 | 2.5 KB (original) | 357,312 | 200 | 2.9924 |
| english_v2 @1500 | 394 KB (public domain) | 625,280 | 1500 | 2.2334 |
| english_v2 @3000 (resumed) | 394 KB | 625,280 | 3000 | 1.9838 |
| english_v2 @4500 (resumed) | 394 KB | 625,280 | 4500 | **1.9374** |

Stage val/test loss (within-corpus split): 4.70 -> 1.76 val, 2.09 -> 1.85 test.

## What improved (measured)

- Held-out loss fell 35% (2.99 -> 1.94). Each increment was produced by a
  TRUE resume (optimizer + RNG + step state restored), and the fixed eval
  guarantees the comparison is apples-to-apples.
- Repetition is controlled: word-repeat rate 0.0 on all probes, top-4-gram
  share ~4-12% (vs 25% for english_v1's worst probe).
- Samples now show English-like structure: real words, spaces,
  capitalization, punctuation, sentence rhythm. One probe
  ("The boy went to school") completed with a period and stopped.

## What did NOT improve (honest)

- **The model is still not fluent.** Samples remain word-salad with
  near-words ("wathout want crates", "immana"). Sentence-level meaning,
  instruction following, and question answering are absent.
- The increments show diminishing returns (2.99 -> 2.23 -> 1.98 -> 1.94):
  this 625k-parameter model is close to its capacity on 394 KB of text.
  Further gains need a larger model AND a larger corpus (MB-scale), which
  this 2-CPU environment can only demonstrate, not complete.

## Provenance of the v2 corpus

- McGuffey's Revised First Reader (Gutenberg #14640), McGuffey's Third
  Eclectic Reader (#14766), Aesop's Fables (#21) — all public domain in
  the US. Cleaning, deduplication, ASCII normalization, and sha256 records
  are in study/build_corpus.py and study/data/provenance_v2.json.

## Remaining training steps (specific)

1. Scale the corpus to MB-scale public-domain English (Gutenberg has
   ~70k titles; the builder is reusable: python -m study.build_corpus
   with more SOURCES entries).
2. Scale the model: 5-10M+ parameters, context 512+ (needs GPU-class
   hardware; the trainer and checkpoint format already support it:
   python -m study.train --stage english --width 512 --layers 8 ...).
3. Train to convergence with early stopping on held-out loss, then rerun
   this fixed evaluation (python -m study.eval_english <ckpt>).
4. Only then: knowledge stage, supervised stage, and serving.
