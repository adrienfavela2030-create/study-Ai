# Study AI — Audit and Diagnosis

Date: 2026-10-21. This audit inspected the actual code in this repository
(the merged tree: `docs/` app, `frontend/`, `backend/`, `study/` package,
`runs/`) before any repair work, per the rebuild specification's Priority 1.
Every finding below is backed by a file and line reference or a test.

## Finding 1 — The gibberish in the app does not come from the language model

**Where:** `docs/app.js` (the app the student actually runs).

**Diagnosis:** The deployed app never invokes the trained model. Its
"AI" responses are deterministic JavaScript: question parsing
(`parseQuestions`), subject detection (`detectSubject`), and template
output builders. The gibberish the user saw ("Aesop's Fables k of text
was mostly about =<) 2 he …") is **OCR noise from Tesseract.js passed
through a weak cleanup**, not model generation. Improving templates
therefore cannot fix "intelligence" — and the training pipeline itself
had two real defects (Findings 2 and 3).

## Finding 2 — The training experiment was real but trained on the wrong objective

**Where:** `study/model.py`, `loss_and_logits` / `backward`.

**Diagnosis:** The batch builder already shifted targets (x = tokens[:-1],
y = tokens[1:]), but the loss shifted targets a **second** time
(`logits[:, :-1]` vs `targets[:, 1:]`). The model was trained to predict
the token two positions ahead. Validation loss went down, so the run
*looked* successful. **Fix:** loss now scores every position directly
against pre-shifted targets; an alignment test (train on "ababab" →
perfect alternation from sequence contexts) now runs in the smoke
experiment and in the test suite. The defective checkpoint is archived at
`runs/archive/numpy_smoke_v1/` with a correction notice; the corrected run
is `runs/numpy_smoke_v2/`.

## Finding 3 — The gradient check could not detect a real backward bug

**Where:** `study/model.py`, `_ln_backward` and `gradcheck`.

**Diagnosis:** The layer-norm backward placed `gamma` outside the mean
terms. That is correct **only while gamma = 1**, which is exactly the
state at initialization — so the original gradcheck passed and the bug
was invisible until training moved gamma. **Fix:** the backward now
applies `g = dout * gamma` before the means; `gradcheck` now randomizes
gamma to non-unit values first, and a regression test covers it.

## Finding 4 — The tokenizer silently dropped digits, quotes, and math symbols

**Where:** `study/tokenizer.py`.

**Diagnosis:** The vocabulary contained only characters present in the
training split. Digits, `"`, `:`, `-` etc. were absent, so
`encode`/`decode` round-trips silently destroyed them — and the staged
trainer rebuilt the tokenizer per stage, which would silently remap
token meanings against saved checkpoints. **Fix:** the tokenizer now
includes a documented fixed ASCII character set; checkpoints save the
full vocabulary and `load_checkpoint` raises on any mismatch instead of
silently remapping. Round-trip cases from the specification
(apostrophes, dates, math, quotes, newlines, names, titles) are tested.

## Finding 5 — The OCR cleanup was destructive

**Where:** `docs/app.js`, `cleanOcrText` (previous version).

**Diagnosis:** It deleted `+`, `=`, standalone `-`, and `#1`-style
question identifiers — silently corrupting math questions. My own Aesop
test output showed `#1`/`#2` disappearing and I had treated that as
success. **Fix:** cleanup now removes only pure-symbol junk with no
letters/digits (like `=<)`) and vowel-less consonant runs, **reports
every removed token** to the student, and keeps operators and question
numbers. Regression tests cover `12 + 4 = ?` and `#1` survival.

## Finding 6 — OCR used pretrained Tesseract weights

**Where:** `docs/index.html` loaded `tesseract.min.js` from a CDN.

**Diagnosis:** The browser OCR path depended on Tesseract's pretrained
recognition weights. Disclosure alone did not satisfy the project's
no-pretrained rule, so the Tesseract path has now been REMOVED from the
compliant build: the photo is shown for reference and the student types
the text (an automated test asserts no `Tesseract.recognize` call
remains in `docs/app.js`). The from-scratch OCR (`study/ocr.py`,
CNN+BiLSTM+CTC on a synthetic bitmap font) has since been TRAINED in
this environment (PyTorch CPU was installable) and reaches 1.000
character accuracy on held-out synthetic images (`runs/ocr_v1/`) —
but it has never been tested on photographs, so it is not wired into
the UI and real-photo capability is explicitly not claimed. A
shape bug in its LSTM input size (hardcoded 64 vs the conv output's
128 for 11px-tall images) was fixed; the correct value is documented
and covered by a shape test.

## Finding 7 — Book identification overwrote the requested title

**Where:** `docs/app.js`, `rememberResult` / `resolveQuery`.

**Diagnosis:** After displaying any match, `memory.lastTitle` was set to
the *displayed* book. An author correction ("the author Gordon Korman")
then re-searched the wrong title. Also: "the author X" was detected but
not fully stripped by the author-extraction regex, and the "send the
number" candidate list had no selection handler. **Fix:** the requested
title is kept separately; numeric replies select from the offered
candidates; the author prefix is fully stripped. Regression tests cover
all three ("Restart" + "the author Gordon Korman" keeps the requested
title; "2" picks candidate 2).

## Finding 8 — Homework evidence and modes had integrity gaps

**Where:** `docs/app.js`, `passageEvidence`, `buildAnswer`;
`study/school.py`, `answer_question`.

**Diagnosis:** Keyword overlap could promote an answer-choice or
instruction line to "evidence"; Help Me Understand revealed final math
answers. **Fix:** evidence excludes question lines, answer choices, and
instructions and is labeled as a proposal to verify; both the app and
the Python module now withhold final answers in Help Me Understand mode.
`12 × (4 + 1)` now returns 60 (brackets respected) — tested in both
languages.

## What was NOT wrong

- The web-search code (`study/websearch.py`, `backend/main.py` search
  path) never fabricates citations: snippet-only results are labeled,
  and the research summary counts only pages actually opened.
- The FastAPI backends do not expose secrets to the frontend.
- Dataset provenance records exist and are honest.

## Conclusion

The "stupidity" had three separate causes: (1) the app never used the
trained model at all — it is a rule engine, (2) the trained model was
trained on the wrong objective with an unchecked backward bug, and
(3) the OCR/cleanup layer corrupted its own input. All three are now
fixed and covered by executed tests. Two further defects found in
review and fixed: the trainer could silently remap token meanings
across stages (checkpoints now carry their exact vocabularies, which
the trainer reuses), and the "resume" claim was weaker than verified
(resume is now proven by identical parameters after identical
updates, with optimizer state saved).

Remaining, honestly reported: the models trained in these experiments
are far too small and the corpora far too tiny to generate English
(fluency was not achieved in these experiments); the app therefore
still answers with deterministic rules + retrieval and never presents
rule output as model generation. Serving the trained model in the
application remains unimplemented by design until a model worth
serving exists.
