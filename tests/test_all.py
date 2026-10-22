"""Automated tests for the Study AI project.

Run: python -m unittest discover -s tests -v

Covers: tokenizer round-trips (spec cases), question detection and
selection, deterministic math checking (including the modes where the
answer must NOT be revealed), notes extraction, citation grounding, OCR
data synthesis, the NumPy model (forward, gradcheck with randomized
non-unit gamma, next-token alignment, training, deterministic reload,
resume), and honest reporting of the corrected smoke run.

PyTorch-dependent tests are skipped when torch is not installed and are
labeled as skipped, never silently passed.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from study import school, websearch, grounding  # noqa: E402
from study.notes import make_notes  # noqa: E402
from study.tokenizer import CharTokenizer, load_corpus, make_splits  # noqa: E402
from study.model import (  # noqa: E402
    Adam, TinyNumPyTransformer, TransformerConfig, load_checkpoint, save_checkpoint,
)
from study import ocr  # noqa: E402
from study import numpy_smoke  # noqa: E402


class TokenizerTests(unittest.TestCase):
    SPEC_CASES = [
        "The student's book", "Hello, world!", "3.14159", "July 4, 1776",
        "12 + 7 = 19", "x - y", 'She said "stop"', "line one\nline two",
        "Gordon Korman", "Restart: a novel", "Don't stop",
        "Aesop's Fables: The Fox and the Grapes",
    ]

    def test_roundtrip(self):
        tok = CharTokenizer.train_from_texts(["hello world"])
        self.assertEqual(tok.decode(tok.encode("hello world")), "hello world")

    def test_spec_roundtrip_cases(self):
        """Tokenizer must preserve apostrophes, digits, math symbols,
        quotes, newlines, names, and titles (spec Part 2 Stage A)."""
        for text in self.SPEC_CASES:
            with self.subTest(text=text):
                tok = CharTokenizer.train_from_texts(["the student reads"])
                self.assertEqual(tok.decode(tok.encode(text)), text)

    def test_vocab_from_corpus_only(self):
        tok = CharTokenizer.train_from_texts(["abc"], include_ascii=False)
        self.assertEqual(tok.vocab_size(), 4)  # a, b, c, <|eot|>

    def test_extended_charset_roundtrip(self):
        """Common math/typography characters (×, ÷, −, curly quotes,
        dashes, °, ½) must survive a round-trip."""
        cases = ["12 × 4 = 48", "6 ÷ 2 = 3", "5 − 3 = 2", "90°F",
                '“curly quotes” and ‘apostrophes’', "en–dash and em—dash", "½ off"]
        for text in cases:
            with self.subTest(text=text):
                tok = CharTokenizer.train_from_texts(["plain text"])
                self.assertEqual(tok.decode(tok.encode(text)), text)

    def test_unknown_char_raises(self):
        """Characters outside the vocabulary must raise, never be silently
        dropped (explicit unknown handling per the specification)."""
        tok = CharTokenizer.train_from_texts(["plain text"], include_ascii=False)
        with self.assertRaises(ValueError):
            tok.encode("emoji 😀 here")

    def test_splits_disjoint_and_before_training(self):
        lines = [f"line {i}" for i in range(20)]
        data = make_splits(lines)
        self.assertEqual(len(data.train) + len(data.val) + len(data.test), 20)
        self.assertTrue(set(data.train).isdisjoint(data.test))


class HomeworkTests(unittest.TestCase):
    PAGE = """1. Read the passage and answer the question below.
2. Solve 12 * 4 = ?
3. Why do plants need sunlight?
4. Solve 3 + 5 = ?"""

    def test_detect_questions(self):
        qs = school.detect_questions(self.PAGE)
        self.assertEqual([q.number for q in qs], ["1", "2", "3", "4"])

    def test_selection_numbers_preserved(self):
        """Selected questions 2, 7, 10 must keep those exact numbers."""
        page = "\n".join(f"{n}. Question text {n}" for n in [2, 7, 10])
        qs = school.detect_questions(page)
        available = [q.number for q in qs]
        self.assertEqual(available, ["2", "7", "10"])
        self.assertEqual(school.parse_selection("all", available), ["2", "7", "10"])

    def test_selection_numbers(self):
        available = [q.number for q in school.detect_questions(self.PAGE)]
        self.assertEqual(school.parse_selection("1, 3", available), ["1", "3"])
        self.assertEqual(school.parse_selection("2-4", available), ["2", "3", "4"])
        self.assertEqual(school.parse_selection("all", available), available)

    def test_math_check_deterministic(self):
        result = school.check_math("12 * 4")
        self.assertTrue(result["ok"])
        self.assertEqual(result["result"], 48)

    def test_math_brackets_order_of_operations(self):
        """12 × (4 + 1) must return 60, not a left-to-right 61."""
        result = school.check_math("12 * (4 + 1)")
        self.assertTrue(result["ok"])
        self.assertEqual(result["result"], 60)

    def test_math_rejects_non_arithmetic(self):
        result = school.check_math("__import__('os').system('ls')")
        self.assertFalse(result["ok"])

    def test_math_question_answered_by_calculator_not_model(self):
        qs = school.detect_questions("2. Solve 12 * 4 = ?")
        res = school.answer_question(qs[0], "give_me_the_answer")
        self.assertEqual(res.model_status, "answered_by_deterministic_math")
        self.assertIn("48", res.model_answer)

    def test_help_me_understand_does_not_reveal_answer(self):
        """Spec: Help Me Understand must not automatically reveal the
        final answer (Part 3 / advisor regression case)."""
        qs = school.detect_questions("2. Solve 12 * 4 = ?")
        res = school.answer_question(qs[0], "help_me_understand")
        self.assertEqual(res.model_status, "guided_without_answer")
        self.assertNotIn("48", res.model_answer)

    def test_reading_question_does_not_invent_answers(self):
        qs = school.detect_questions("3. What is the main idea of the passage?")
        res = school.answer_question(qs[0], "answer_and_explain", source_text="")
        self.assertEqual(res.model_status, "not_qualified")
        self.assertIsNone(res.model_answer)
        self.assertIsNotNone(res.followup_needed)


class NotesTests(unittest.TestCase):
    def test_four_styles(self):
        text = ("Plants need sunlight. Plants also need water. "
                "Photosynthesis is important because it makes food. "
                "Roots take in water from the soil.")
        for style in ("light", "medium", "hard", "short"):
            result = make_notes(text, style)
            self.assertEqual(result.style, style)
            self.assertGreater(len(result.notes), 0)
            for note in result.notes:
                self.assertIn(note, text)  # faithful: verbatim from source

    def test_method_is_labeled_honestly(self):
        result = make_notes("Some text here. Another sentence.", "light")
        self.assertIn("extraction", result.method)


class GroundingTests(unittest.TestCase):
    SRC = websearch.SourceRecord(
        url="https://example.com/mars", title="Mars update", publisher="example.com",
        snippet="NASA found water on Mars in 2026.", extracted_text=(
            "NASA announced that its rover found new evidence of water on Mars "
            "in a press conference on Tuesday."
        ),
        inspected=True,
    )

    def test_exact_quote_matches(self):
        self.assertTrue(grounding.exact_quote_in_source(
            "found new evidence of water on Mars", self.SRC.extracted_text))

    def test_invented_quote_fails(self):
        self.assertFalse(grounding.exact_quote_in_source(
            "Mars is made of cheese", self.SRC.extracted_text))

    def test_citation_ids_validated(self):
        ok = grounding.validate_citations("Water on Mars [1].", [self.SRC])
        self.assertTrue(ok["valid"])
        bad = grounding.validate_citations("Water on Mars [7].", [self.SRC])
        self.assertFalse(bad["valid"])

    def test_snippet_only_source_not_valid_citation(self):
        snippet_src = websearch.SourceRecord(
            url="https://x.com/a", title="t", publisher="x", snippet="s", inspected=False)
        bad = grounding.validate_citations("Claim [1].", [snippet_src])
        self.assertFalse(bad["valid"])

    def test_unsupported_claim_flagged(self):
        result = grounding.validate_answer(
            "The rover found cheese sandwiches on Mars [1].", [self.SRC])
        self.assertFalse(result["grounded"])

    def test_websearch_module_loads(self):
        self.assertTrue(callable(websearch.research))


class WebsearchTests(unittest.TestCase):
    def test_extract_main_text_strips_navigation(self):
        html = ("<html><head><style>body{}</style></head><body>"
                "<nav>menu menu</nav><script>alert(1)</script>"
                "<p>Hello world this is the article text.</p>"
                "<footer>footer</footer></body></html>")
        text = websearch.extract_main_text(html)
        self.assertIn("Hello world this is the article text", text)
        self.assertNotIn("menu", text)
        self.assertNotIn("alert", text)

    def test_source_record_serializes(self):
        r = websearch.SourceRecord(url="https://a.com", title="A", publisher="a",
                                   snippet="s")
        d = r.to_dict()
        self.assertEqual(d["inspected"], False)


class OcrTests(unittest.TestCase):
    def test_glyphs_render(self):
        img, text = ocr.render_text_image("HI 42")
        self.assertEqual(img.shape[0], 11)  # 7 rows + padding
        self.assertEqual(text, "HI 42")

    def test_synthetic_dataset_labeled(self):
        images, labels = ocr.make_dataset(10, seed=0)
        self.assertEqual(len(images), len(labels))
        self.assertTrue(all(isinstance(l, str) for l in labels))

    def test_no_pretrained_weights(self):
        # The module defines its own font and model; it must not reference
        # any pretrained checkpoint or external OCR library.
        src = Path(ocr.__file__).read_text()
        self.assertNotIn("easyocr", src)
        self.assertNotIn("tesseract", src.lower().replace("pretrained", ""))


class NumPyModelTests(unittest.TestCase):
    def _model_and_batch(self, seed=0):
        tok = CharTokenizer.train_from_texts(["the student reads the book"])
        cfg = TransformerConfig(vocab_size=tok.vocab_size(), d_model=12,
                                n_heads=3, n_layers=1, context_length=8)
        model = TinyNumPyTransformer(cfg, seed=seed)
        ids = np.array([[tok.stoi[c] for c in "student"]])
        targets = np.array([[tok.stoi[c] for c in "tudent "]])
        return model, ids, targets

    def test_forward_shape(self):
        model, ids, targets = self._model_and_batch()
        logits = model.forward(ids)
        self.assertEqual(logits.shape, (1, ids.shape[1], model.cfg.vocab_size))

    def test_gradcheck_randomized_gamma(self):
        """Gradient check must pass with randomized non-unit layernorm
        scales — the condition that exposed a real backward bug that was
        invisible at initialization (gamma=1)."""
        model, ids, targets = self._model_and_batch()
        report = model.gradcheck(ids, targets, samples_per_tensor=3, randomize_gamma=True)
        worst = max(v for k, v in report.items() if not k.startswith("_"))
        self.assertLess(worst, 1.0, f"gradcheck failed (ratio > 1): {report}")
        self.assertIn("_n_entries", report)  # sampled entries counted
        self.assertIn("_atol", report)
        self.assertIn("_rtol", report)

    def test_next_token_alignment(self):
        """A model trained on 'ababab' must predict the alternation from
        sequence contexts — proves the loss targets are aligned (the
        double-shift regression)."""
        tok = CharTokenizer.train_from_texts(["the student reads the book"])
        cfg = TransformerConfig(vocab_size=tok.vocab_size(), d_model=24,
                                n_heads=3, n_layers=1, context_length=64)
        seq = [tok.stoi[c] for c in "ababab"]
        x, y = np.array([seq[:-1]]), np.array([seq[1:]])
        model = TinyNumPyTransformer(cfg, seed=1)
        opt = Adam(model.params, lr=0.05)
        for _ in range(3000):
            cache: dict = {}
            model.loss_and_logits(x, y, cache)
            grads = model.backward(cache, y)
            opt.step(model.params, grads)
        after_ab = model.forward(np.array([[tok.stoi[c] for c in "ab"]]))[0, -1].argmax()
        after_aba = model.forward(np.array([[tok.stoi[c] for c in "aba"]]))[0, -1].argmax()
        self.assertEqual(tok.itos[after_ab], "a")
        self.assertEqual(tok.itos[after_aba], "b")

    def test_training_reduces_loss(self):
        model, ids, targets = self._model_and_batch()
        opt = Adam(model.params, lr=0.05)
        cache: dict = {}
        loss0, _ = model.loss_and_logits(ids, targets, cache)
        for _ in range(30):
            loss, _ = model.loss_and_logits(ids, targets, cache)
            grads = model.backward(cache, targets)
            opt.step(model.params, grads)
        self.assertLess(loss, loss0)

    def test_checkpoint_reload_deterministic(self):
        """Reload must reproduce the SAME full logits on the SAME input,
        not just 'a loss' (the old check was weaker than claimed)."""
        model, ids, targets = self._model_and_batch()
        opt = Adam(model.params, lr=0.05)
        cache: dict = {}
        for _ in range(5):
            model.loss_and_logits(ids, targets, cache)
            grads = model.backward(cache, targets)
            opt.step(model.params, grads)
        logits1 = model.forward(ids).copy()
        path = str(ROOT / "runs" / "_test_ckpt.json")
        (ROOT / "runs").mkdir(exist_ok=True)
        tok = CharTokenizer.train_from_texts(["the student reads the book"])
        save_checkpoint(path, model, {"stage": "test", "tokenizer_vocab": tok.itos},
                        optimizer=opt)
        m2, meta, opt_state = load_checkpoint(path)
        logits2 = m2.forward(ids)
        self.assertEqual(meta["stage"], "test")
        self.assertTrue(np.array_equal(logits1, logits2))
        (ROOT / "runs" / "_test_ckpt.json").unlink()

    def test_resume_is_reproducible_continuation(self):
        """True resume verification: an uninterrupted continuation and a
        checkpoint-reload continuation (model + optimizer state) must
        produce IDENTICAL parameters after the same updates."""
        model, ids, targets = self._model_and_batch()
        opt = Adam(model.params, lr=0.05)
        cache: dict = {}
        for _ in range(5):  # initial training
            model.loss_and_logits(ids, targets, cache)
            grads = model.backward(cache, targets)
            opt.step(model.params, grads)
        path = str(ROOT / "runs" / "_test_ckpt_resume.json")
        save_checkpoint(path, model, {"stage": "test"}, optimizer=opt)

        # (a) uninterrupted continuation (deep copy)
        import copy
        m_a = copy.deepcopy(model)
        opt_a = Adam(m_a.params, lr=opt.lr)
        opt_a.m = {k: v.copy() for k, v in opt.m.items()}
        opt_a.v = {k: v.copy() for k, v in opt.v.items()}
        opt_a.t = opt.t
        # (b) reloaded continuation
        m_b, _, opt_state = load_checkpoint(path)
        opt_b = Adam(m_b.params, lr=opt_state["lr"])
        opt_b.load_state_dict(opt_state)
        for _ in range(3):  # same updates on both
            ca: dict = {}; cb: dict = {}
            m_a.loss_and_logits(ids, targets, ca)
            m_b.loss_and_logits(ids, targets, cb)
            opt_a.step(m_a.params, m_a.backward(ca, targets))
            opt_b.step(m_b.params, m_b.backward(cb, targets))
        for k in m_a.params:
            self.assertTrue(np.allclose(m_a.params[k], m_b.params[k], atol=0, rtol=0),
                            f"resume divergence in {k}")
        (ROOT / "runs" / "_test_ckpt_resume.json").unlink()

    def test_checkpoint_vocab_mismatch_is_an_error(self):
        """A checkpoint whose saved vocab size disagrees with the model's
        must fail loudly, never silently remap token meanings."""
        model, ids, targets = self._model_and_batch()
        path = str(ROOT / "runs" / "_test_ckpt2.json")
        (ROOT / "runs").mkdir(exist_ok=True)
        save_checkpoint(path, model, {"stage": "test", "tokenizer_vocab": ["a", "b"]})
        with self.assertRaises(ValueError):
            load_checkpoint(path)
        (ROOT / "runs" / "_test_ckpt2.json").unlink()

    def test_param_count_matches_arrays(self):
        model, ids, targets = self._model_and_batch()
        total = sum(v.size for v in model.params.values())
        self.assertEqual(total, model.cfg.param_count())


class SmokeRunReportTests(unittest.TestCase):
    """The corrected smoke run's artifacts must exist and be honest."""

    def test_manifest_records_only_real_runs(self):
        path = ROOT / "runs" / "manifest.json"
        self.assertTrue(path.exists(), "run python -m study.numpy_smoke first")
        manifest = json.loads(path.read_text())
        self.assertEqual(manifest["numpy_smoke_v2"]["status"], "completed")
        self.assertEqual(manifest["numpy_smoke_v1"]["status"], "archived_defective")
        self.assertEqual(manifest["english_full_pretraining"]["status"], "not_started")

    def test_eval_report_honest(self):
        path = ROOT / "runs" / "numpy_smoke_v2" / "eval_report.json"
        self.assertTrue(path.exists())
        report = json.loads(path.read_text())
        self.assertLess(report["val_loss_after"], report["val_loss_before"])
        self.assertTrue(report["next_token_alignment_check"])
        self.assertTrue(report["reload_determinism_full_logits"])
        self.assertTrue(report["resume_reproducibility"])
        self.assertTrue(report["tokenizer_report"]["ok"])
        # the report must explicitly deny English fluency
        self.assertIn("NOT", report["honest_assessment"])

    def test_manifest_distinguishes_experiments_from_full_stages(self):
        path = ROOT / "runs" / "manifest.json"
        manifest = json.loads(path.read_text())
        for name in ["english_v1", "knowledge_v1", "supervised_v1", "ocr_v1"]:
            self.assertEqual(manifest[name].get("kind"), "experiment",
                             f"{name} must be labeled an experiment, not a full stage")
        for name in ["english_full_pretraining", "knowledge_training", "educational_sft"]:
            self.assertEqual(manifest[name].get("kind"), "full_stage")

    def test_correction_notice_exists_for_v1(self):
        path = ROOT / "runs" / "archive" / "numpy_smoke_v1" / "CORRECTION.md"
        self.assertTrue(path.exists())
        self.assertIn("double", path.read_text().lower())

    def test_checkpoint_file_real(self):
        path = ROOT / "runs" / "numpy_smoke_v2" / "checkpoint.json"
        self.assertTrue(path.exists())
        payload = json.loads(path.read_text())
        self.assertIn("params", payload)
        self.assertGreater(len(payload["params"]), 0)
        self.assertIn("tokenizer_vocab", payload["meta"])


class SftDataTests(unittest.TestCase):
    def test_sft_examples_have_prompt_and_response(self):
        path = ROOT / "study" / "data" / "sft_data.jsonl"
        examples = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
        self.assertGreaterEqual(len(examples), 10)
        for ex in examples:
            self.assertIn("prompt", ex)
            self.assertIn("response", ex)

    def test_provenance_recorded(self):
        path = ROOT / "study" / "data" / "provenance.json"
        data = json.loads(path.read_text())
        for item in data:
            self.assertIn("file", item)
            self.assertIn("license", item)


try:
    import torch  # noqa: F401

    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False


@unittest.skipUnless(HAS_TORCH, "PyTorch is not installed in this environment")
class PyTorchModelTests(unittest.TestCase):
    def test_torch_model_forward(self):
        from study.torch_model import TransformerLM

        model = TransformerLM(vocab_size=50, d_model=32, n_heads=4, n_layers=1,
                              context_length=16)
        x = torch.randint(0, 50, (2, 10))
        y = torch.randint(0, 50, (2, 10))
        logits, loss = model(x, y)
        self.assertEqual(logits.shape, (2, 10, 50))
        self.assertGreater(float(loss), 0)

    def test_supervised_masked_loss(self):
        from study.train import masked_ce_loss

        logits = torch.randn(2, 5, 10)
        targets = torch.randint(0, 10, (2, 5))
        mask = torch.zeros(2, 5)
        mask[:, 2:] = 1
        loss = masked_ce_loss(logits, targets, mask)
        self.assertEqual(loss.shape, torch.Size([]))


@unittest.skipUnless(HAS_TORCH, "PyTorch is not installed in this environment")
class TrainerCliTests(unittest.TestCase):
    """CLI regression test for the trainer: a fresh run saves a resumable
    checkpoint; --resume restores optimizer/RNG/step state and continues
    the step counter; --resume on a non-resumable artifact fails with an
    honest message."""

    RUN = "_test_cli"

    @classmethod
    def setUpClass(cls):
        import subprocess
        cls.subprocess = subprocess
        cls.base = [sys.executable, "-m", "study.train", "--stage", "english",
                    "--steps", "2", "--context", "32", "--width", "24",
                    "--layers", "1", "--heads", "2", "--batch", "2",
                    "--run-name", cls.RUN]
        r = cls.subprocess.run(cls.base, capture_output=True, text=True, cwd=str(ROOT))
        cls.fresh_output = r.stdout + r.stderr
        cls.fresh_rc = r.returncode

    def test_fresh_run_saves_resumable_checkpoint(self):
        import torch
        self.assertEqual(self.fresh_rc, 0, self.fresh_output)
        ckpt = torch.load(ROOT / "runs" / self.RUN / "checkpoint.pt",
                          map_location="cpu", weights_only=False)
        self.assertEqual(ckpt["step"], 2)
        self.assertEqual(ckpt["artifact_type"], "fresh_run")
        self.assertIn("optimizer", ckpt)  # resumable: optimizer state saved
        self.assertIn("rng", ckpt)

    def test_resume_continues_step_counter(self):
        import subprocess, torch
        r = subprocess.run(self.base + ["--resume", f"runs/{self.RUN}/checkpoint.pt"],
                           capture_output=True, text=True, cwd=str(ROOT))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("optimizer + RNG state restored", r.stdout)
        ckpt = torch.load(ROOT / "runs" / self.RUN / "checkpoint.pt",
                          map_location="cpu", weights_only=False)
        self.assertEqual(ckpt["step"], 4)  # 2 + 2: step counter continued
        self.assertEqual(ckpt["artifact_type"], "resumable_checkpoint")

    def test_resume_rejects_weight_init_artifact(self):
        import subprocess
        b = list(self.base)
        b[b.index("english")] = "knowledge"
        r = subprocess.run(
            b + ["--resume", "runs/knowledge_v1/checkpoint.pt"],
            capture_output=True, text=True, cwd=str(ROOT))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("weight-initialization artifact", r.stdout + r.stderr)

    @classmethod
    def tearDownClass(cls):
        import shutil
        shutil.rmtree(ROOT / "runs" / cls.RUN, ignore_errors=True)


@unittest.skipUnless(HAS_TORCH, "PyTorch is not installed in this environment")
class OcrTrainingTests(unittest.TestCase):
    def test_ctc_training_step(self):
        from study.ocr import build_model, OCR_VOCAB

        model = build_model(len(OCR_VOCAB))
        images, labels = ocr.make_dataset(4, seed=3)
        w = max(img.shape[1] for img in images)
        batch = np.zeros((4, 1, images[0].shape[0], w))
        for i, img in enumerate(images):
            batch[i, 0, :, : img.shape[1]] = img
        x = torch.tensor(batch, dtype=torch.float32)
        logits = model(x)
        self.assertEqual(logits.shape[0], 4)
        # LSTM input size must match the conv output (64 channels * H/4)
        self.assertEqual(model.lstm.input_size, 64 * (images[0].shape[0] // 4))


if __name__ == "__main__":
    unittest.main()
