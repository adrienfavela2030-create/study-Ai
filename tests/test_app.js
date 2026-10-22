// Tests for the deployed app logic (docs/app.js).
// Run: node tests/test_app.js
// These load the REAL functions out of docs/app.js source (no mocks) and
// check the behaviors the rebuild specification demands: OCR cleanup must
// not destroy math/operators, question numbers must survive, Help Me
// Understand must not reveal answers, and book corrections must work.
"use strict";
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "docs", "app.js"), "utf8");

function grab(name) {
  const start = APP.indexOf("function " + name + "(");
  if (start < 0) throw new Error("function not found: " + name);
  let depth = 0, i = APP.indexOf("{", start);
  for (let j = i; j < APP.length; j++) {
    if (APP[j] === "{") depth++;
    if (APP[j] === "}") { depth--; if (depth === 0) return APP.slice(start, j + 1); }
  }
  throw new Error("unbalanced braces: " + name);
}

// shared mutable state the app functions reference (memory, hwStyle)
const state = {
  memory: { lastTitle: "", lastAuthor: "", lastTopic: "", lastKind: "", history: [], lastCandidates: [] },
  hwStyle: "grade7",
};
const context = { memory: state.memory, hwStyle: state.hwStyle };
const names = [
  "cleanOcrText", "isGibberish", "detectSubject", "classifyTask", "solveMath",
  "passageEvidence", "essayPlan", "stripAuthorPrefix", "isAuthorOnly", "resolveQuery",
  "rememberResult", "mathExplain", "buildAnswer", "subjectTips",
];
// resolveQuery references extractBookHints/isCorrection/cleanQuery too
function grabAll(extra) {
  const all = names.concat(extra);
  const body = all.map(grab).join("\n");
  const f = new Function("memory", "hwStyle", body + "\nreturn {" + all.join(",") + "};");
  return f(state.memory, state.hwStyle);
}
const app = grabAll(["extractBookHints", "isCorrection", "cleanQuery"]);

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log("ok   " + name); }
  else { failed++; console.log("FAIL " + name + (detail ? " — " + detail : "")); }
}

// --- OCR/manual text cleanup: NON-DESTRUCTIVE. Uncertain text is
// KEPT and FLAGGED for the student — only box-drawing junk is removed.
const aesop = "Aesop's Fables xlwq of text was mostly about #1 The Swollen Fox #2 The Flies and the Honey-Pot";
const cleaned = app.cleanOcrText(aesop);
check("cleanOcrText keeps '#1' question identifiers", cleaned.text.includes("#1") && cleaned.text.includes("#2"));
check("cleanOcrText keeps 'The Swollen Fox'", cleaned.text.includes("The Swollen Fox"));
check("cleanOcrText KEEPS the uncertain vowel-less run 'xlwq' (flagged, not deleted)", cleaned.text.includes("xlwq"));
check("cleanOcrText FLAGS 'xlwq' as a suspect for review", Array.isArray(cleaned.suspects) && cleaned.suspects.includes("xlwq"));
const boxed = app.cleanOcrText("\u2500\u2500\u2500 question text \u2550\u2550");
check("cleanOcrText removes box-drawing junk", !/[\u2500-\u257F]/.test(boxed.text) && boxed.text.includes("question text"));
const math = app.cleanOcrText("2. Solve 12 + 4 = ? 3. Find x - 7");
check("cleanOcrText keeps '+' and '=' and '-'", /\+/.test(math.text) && /=/.test(math.text) && /-/.test(math.text));
check("cleanOcrText is not flagged gibberish for clean text", !app.isGibberish(app.cleanOcrText("1. What is the main idea of the passage about plants?").text));

// --- math solver ---
check("solveMath 12 * 4 = 48", app.solveMath("Solve 12 * 4 = ?").value === 48);
check("solveMath respects brackets: 12 * (4 + 1) = 60", app.solveMath("Solve 12 * (4 + 1)").value === 60);
check("solveMath order of operations: 3 + 5 * 2 = 13", app.solveMath("Find 3 + 5 * 2").value === 13);
check("solveMath handles x as multiplication", app.solveMath("12 x 4").value === 48);

// --- subject detection ---
check("detectSubject: fables/passage -> english", app.detectSubject("What was the text mostly about? Aesop's fables story passage") === "english");
check("detectSubject: arithmetic -> math", app.detectSubject("Solve 12 * 4") === "math");
check("detectSubject: photosynthesis -> science", app.detectSubject("Explain photosynthesis and cells") === "science");

// --- task classification ---
check("classifyTask main-idea", app.classifyTask("What is the story mostly about?") === "main-idea");
check("classifyTask math", app.classifyTask("2. Solve 12 * 4 = ?") === "math");
check("classifyTask essay", app.classifyTask("Write a paragraph about the story") === "essay");
check("classifyTask choice", app.classifyTask("Circle the best answer A) red B) blue") === "choice");

// --- evidence hygiene: choices and instructions are not evidence ---
const worksheet = [
  "Read the passage and answer questions 1 to 4.",
  "The fox jumped high to reach the grapes on the vine but could not touch them.",
  "1. What was the text mostly about? The fox and the grapes.",
  "A) The fox giving up B) The fox reaching the grapes",
].join("\n");
const ev = app.passageEvidence("1. What was the text mostly about? The fox and the grapes.", worksheet);
check("passageEvidence ignores instructions and choices",
  ev && ev.sentence.includes("fox jumped high") && !ev.sentence.startsWith("Read") && !ev.sentence.startsWith("A)"));

// --- Help Me Understand must not reveal the answer: EXECUTE the actual
// guidance text the student sees (mathExplain is the pure function the
// app calls) and verify the final value never appears in it.
const math60 = app.solveMath("Solve 12 * (4 + 1)");
check("solveMath finds 12 * (4 + 1) = 60", math60 && math60.value === 60);
const explainText = app.mathExplain(math60);
check("mathExplain executes and returns the guidance text", typeof explainText === "string" && explainText.includes("How to solve"));
check("executed explain text does NOT contain the answer 60", !/\b60\b/.test(explainText));
const explain48 = app.mathExplain(app.solveMath("Solve 12 * 4"));
check("executed explain text does NOT contain the answer 48", !/\b48\b/.test(explain48));

// --- book flow: wrong-match display must not poison an author correction ---
check("stripAuthorPrefix: 'the author Gordon Korman' -> 'Gordon Korman'",
  app.stripAuthorPrefix("the author Gordon Korman") === "Gordon Korman");
// simulate the real workflow: student asks for "Restart" (query handler
// records the requested title), a WRONG book "Re Start" is displayed
// (rememberResult is called with the matched title)...
state.memory.lastTitle = "Restart"; // set by the query handler
app.rememberResult("Re Start", "Someone Else", "book");
check("isAuthorOnly detects 'the author Gordon Korman'", app.isAuthorOnly("the author Gordon Korman"));
const resolved = app.resolveQuery("the author Gordon Korman");
check("author correction after wrong-match display keeps REQUESTED 'Restart'",
  resolved.titleQ === "Restart" && /Korman/i.test(resolved.authorQ));
// numeric candidate selection
state.memory.lastCandidates = [
  { title: "Restart", authors: "Gordon Korman", year: 2017 },
  { title: "Re Start", authors: "Someone Else", year: 2001 },
  { title: "Restarting Engines", authors: "A. Person", year: 1999 },
];
const picked = app.resolveQuery("2");
check("numeric reply '2' picks candidate 2", picked.titleQ === "Re Start");

// --- Aesop fragment cannot become a completed answer without the passage ---
const noPassage = app.passageEvidence("1. What was the text mostly about?", "1. What was the text mostly about?");
check("no evidence found when only the question exists", noPassage === null);
// answer-choice-only input can never produce evidence
const choicesOnly = app.passageEvidence(
  "1. What is the main idea?",
  "1. What is the main idea?\nA) The fox giving up\nB) The fox reaching the grapes");
check("answer-choice-only input yields no evidence", choicesOnly === null);
// EXECUTE the answer builder: an Aesop fragment + keyword question must
// produce an UNVERIFIED excerpt with guidance, never a 'Draft answer'
const fragment = "The Swollen Fox could not reach the grapes and walked away.";
const builtFromFragment = app.buildAnswer(
  { n: 1, text: "1. What was the text mostly about? The fox and the grapes." },
  "main-idea", "english", "normal", fragment, "grade7");
check("Aesop fragment is presented as unverified, not answered",
  builtFromFragment.indexOf("Draft answer") === -1 &&
  builtFromFragment.indexOf("not yet verified") !== -1);
check("fragment output teaches verification, not just restatement",
  builtFromFragment.indexOf("does it actually answer") !== -1);
// chapter question with only a publisher description: no invented answer
const chapterQ = app.buildAnswer(
  { n: 2, text: "In chapter 3, why does Chase act differently at lunch?" },
  "explain", "english", "normal", "", "grade7");
check("chapter question without chapter text yields no invented answer",
  chapterQ.indexOf("won't guess") !== -1 || chapterQ.indexOf("Add the passage") !== -1);
// OCR cleanup preserves math symbols and digit tokens (regression)
const alg = app.cleanOcrText("Simplify 3x4 and x+z if x = 2 < 3");
check("cleanOcrText keeps '3x4', 'x+z', '<'",
  /3x4/.test(alg.text) && /x\+z/.test(alg.text) && /</.test(alg.text));
check("app.js contains no Tesseract call (pretrained OCR disabled)",
  !/Tesseract\.recognize/.test(APP));

console.log("\n" + passed + " passed, " + failed + " failed, 0 skipped (node)");
process.exit(failed ? 1 : 0);
