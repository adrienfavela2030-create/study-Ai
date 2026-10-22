"""Homework tool logic: question selection, answer modes, math checking.

The model trained by this project is currently too small to answer
questions, so Homework AI behaves honestly: it parses the worksheet,
extracts the questions the student selected, checks arithmetic with a
deterministic calculator, and clearly labels anything it cannot do.
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass, field


@dataclass
class Question:
    number: str
    text: str
    kind: str = "unknown"  # math / reading / other / unknown


QUESTION_RE = re.compile(r"^\s*(\d{1,3})[.)]?\s+(.+)$", re.MULTILINE)


def parse_selection(selection: str, available: list[str]) -> list[str]:
    """Parse '1, 3-5, all' style selections into question numbers."""
    sel = selection.strip().lower()
    if sel in ("all", "all questions", ""):
        return list(available)
    chosen: list[str] = []
    for part in sel.split(","):
        part = part.strip()
        m = re.fullmatch(r"(\d+)\s*-\s*(\d+)", part)
        if m:
            lo, hi = int(m.group(1)), int(m.group(2))
            for n in range(lo, hi + 1):
                s = str(n)
                if s in available:
                    chosen.append(s)
        elif part.isdigit() and part in available:
            chosen.append(part)
    # preserve worksheet order, remove duplicates
    return [q for q in available if q in dict.fromkeys(chosen)]


def detect_questions(page_text: str) -> list[Question]:
    found: list[Question] = []
    for m in QUESTION_RE.finditer(page_text):
        found.append(Question(number=m.group(1), text=m.group(2).strip()))
    # dedupe by number
    seen: set[str] = set()
    out = []
    for q in found:
        if q.number not in seen:
            seen.add(q.number)
            out.append(q)
    return out


class SafeMath(ast.NodeVisitor):
    """Deterministic arithmetic checker. Only + - * / ** ( ) and numbers."""

    ALLOWED = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant, ast.Add, ast.Sub,
               ast.Mult, ast.Div, ast.Pow, ast.USub, ast.UAdd, ast.Expr)

    def visit_Expression(self, node):
        return self.generic_visit(node)

    def visit_BinOp(self, node):
        return self.generic_visit(node)

    def visit_UnaryOp(self, node):
        return self.generic_visit(node)

    def visit_Constant(self, node):
        if not isinstance(node.value, (int, float)):
            raise ValueError("only numbers allowed")
        return self.generic_visit(node)

    def generic_visit(self, node):
        if not isinstance(node, self.ALLOWED):
            raise ValueError(f"disallowed node: {type(node).__name__}")
        return super().generic_visit(node)


ARITH_RE = re.compile(r"\d+\s*[+\-*/]\s*\d+(?:\s*[+\-*/]\s*\d+)*")


def extract_arithmetic(text: str) -> str | None:
    """Pull the first arithmetic expression out of a sentence."""
    m = ARITH_RE.search(text)
    return m.group(0) if m else None


def check_math(expression: str) -> dict:
    """Evaluate arithmetic deterministically (no model involved)."""
    expression = expression.strip().rstrip("=?")
    try:
        tree = ast.parse(expression, mode="eval")
        SafeMath().visit(tree)
        result = eval(compile(tree, "<math>", "eval"), {"__builtins__": {}}, {})
        return {"ok": True, "expression": expression, "result": result,
                "method": "deterministic Python arithmetic check (not the language model)"}
    except Exception as e:
        return {"ok": False, "expression": expression, "error": str(e)}


ANSWER_MODES = {
    "help_me_understand": "Explains the idea behind the question without just giving the final answer.",
    "give_me_the_answer": "Provides the answer only.",
    "answer_and_explain": "Provides the answer and a step-by-step explanation.",
}


@dataclass
class HomeworkResult:
    question_number: str
    question_text: str
    mode: str
    model_answer: str | None = None
    model_status: str = "not_qualified"
    math_check: dict | None = None
    followup_needed: str | None = None
    notes: list[str] = field(default_factory=list)


def answer_question(question: Question, mode: str, source_text: str = "", model_ready: bool = False) -> HomeworkResult:
    """Honest homework answering.

    The trained model is currently too small to answer school questions.
    We say so, use deterministic math checking where possible, and use
    verbatim source evidence for reading questions.
    """
    res = HomeworkResult(question_number=question.number, question_text=question.text, mode=mode)
    is_math = bool(re.search(r"[\d)]\s*[+\-*/]\s*[\d(]", question.text)) or "=" in question.text
    if is_math:
        expr = extract_arithmetic(question.text) or re.sub(r"[^0-9+\-*/(). ]", "", question.text)
        res.math_check = check_math(expr)
        if res.math_check["ok"]:
            if mode == "help_me_understand":
                # Do NOT reveal the final answer in this mode.
                res.model_status = "guided_without_answer"
                res.model_answer = (
                    "Set up the problem and follow order of operations: brackets "
                    "first, then multiplication/division, then addition/subtraction. "
                    "Work it out — if you want the final answer, switch to "
                    "Answer + Explain or Give Me the Answer."
                )
            else:
                res.model_status = "answered_by_deterministic_math"
                res.model_answer = (
                    f"The answer is {res.math_check['result']}. "
                    "(Verified by the built-in arithmetic checker, not the language model.)"
                )
            return res
    if model_ready:
        res.model_status = "model_answer"
        res.model_answer = "(model answer would be generated here once the model is trained)"
    else:
        res.model_status = "not_qualified"
        res.model_answer = None
        res.notes.append(
            "The language model trained by this project is too small to answer this "
            "question reliably. No answer is invented. Math questions are checked "
            "deterministically when possible."
        )
        if not source_text:
            res.followup_needed = (
                "Could you paste the passage or instructions that go with this question? "
                "With the source text, the reading-comprehension pipeline can quote evidence."
            )
    return res
