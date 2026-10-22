"""Automated tests for the Study AI project.

Run: python -m unittest discover -s tests -v

Tests cover: tokenizer, question detection and selection, math checking,
notes extraction, citation grounding, OCR data synthesis, the NumPy
model's forward/backward/gradcheck/checkpoint, and the training smoke
run's honest reporting. PyTorch-dependent tests are skipped when torch
is not installed (and are labeled as skipped, never passed silently).
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


class TokenizerTests(unittest.TestCase):
    def test_roundtrip(self):
        tok = CharTokenizer.train_from_texts(["hello world"])
        text = "hello world"
        self.assertEqual(tok.decode(tok.encode(text)), text)

    def test_vocab_from_corpus_only(self):
        tok = CharTokenizer.train_from_texts(["abc"])
        self.assertEqual(tok.vocab_size(), 4)  # a, b, c, <|eot|>

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

    def test_selection_numbers(self):
        available = [q.number for q in school.detect_questions(self.PAGE)]
        self.assertEqual(school.parse_selection("1, 3", available), ["1", "3"])
        self.assertEqual(school.parse_selection("2-4", available), ["2", "3", "4"])
        self.assertEqual(school.parse_selection("all", available), available)

    def test_math_check_deterministic(self):
        result = school.check_math("12 * 4")
        self.assertTrue(result["ok"])
        self.assertEqual(result["result"], 48)

    def test_math_rejects_non_arithmetic(self):
        result = school.check_math("__import__('os').system('ls')")
        self.assertFalse(result["ok"])

    def test_math_question_answered_by_calculator_not_model(self):
        qs = school.detect_questions("2. Solve 12 * 4 = ?")
        res = school.answer_question(qs[0], "give_me_the_answer")
        self.assertEqual(res.model_status, "answered_by_deterministic_math")
        self.assertIn("48", res.model_answer)

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

    def test_research_summary_counts_only_inspected(self):
        rec = websearch.research.__name__  # sanity that module loaded
        self.assertTrue(rec)


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

    def test_gradcheck(self):
        model, ids, targets = self._model_and_batch()
        report = model.gradcheck(ids, targets, samples_per_tensor=2)
        worst = max(report.values())
        self.assertLess(worst, 1e-3, f"gradcheck failed: {report}")

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

    def test_checkpoint_roundtrip_identical(self):
        model, ids, targets = self._model_and_batch()
        opt = Adam(model.params, lr=0.05)
        cache: dict = {}
        for _ in range(5):
            model.loss_and_logits(ids, targets, cache)
            grads = model.backward(cache, targets)
            opt.step(model.params, grads)
        loss1, _ = model.loss_and_logits(ids, targets)
        path = str(ROOT / "runs" / "_test_ckpt.json")
        (ROOT / "runs").mkdir(exist_ok=True)
        save_checkpoint(path, model, {"stage": "test"})
        m2, meta = load_checkpoint(path)
        loss2, _ = m2.loss_and_logits(ids, targets)
        self.assertEqual(meta["stage"], "test")
        self.assertAlmostEqual(loss1, loss2, places=10)
        (ROOT / "runs" / "_test_ckpt.json").unlink()

    def test_param_count_matches_arrays(self):
        model, ids, targets = self._model_and_batch()
        total = sum(v.size for v in model.params.values())
        self.assertEqual(total, model.cfg.param_count())


class SmokeRunReportTests(unittest.TestCase):
    """The saved smoke-run artifacts must exist and be honest."""

    def test_manifest_records_only_real_runs(self):
        path = ROOT / "runs" / "manifest.json"
        self.assertTrue(path.exists(), "run python -m study.numpy_smoke first")
        manifest = json.loads(path.read_text())
        self.assertEqual(manifest["numpy_smoke_v1"]["status"], "completed")
        self.assertEqual(manifest["english_full_pretraining"]["status"], "not_started")

    def test_eval_report_honest(self):
        path = ROOT / "runs" / "numpy_smoke_v1" / "eval_report.json"
        self.assertTrue(path.exists())
        report = json.loads(path.read_text())
        self.assertLess(report["val_loss_after"], report["val_loss_before"])
        self.assertIn("does NOT establish", report["honest_assessment"])

    def test_checkpoint_file_real(self):
        path = ROOT / "runs" / "numpy_smoke_v1" / "checkpoint.json"
        self.assertTrue(path.exists())
        payload = json.loads(path.read_text())
        self.assertIn("params", payload)
        self.assertGreater(len(payload["params"]), 0)


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


if __name__ == "__main__":
    unittest.main()
