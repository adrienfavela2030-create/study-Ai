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
];
const code = names.map(grab).join("\n");
const factory = new Function("memory", "hwStyle", code + "\nreturn {" + names.join(",") + "};");
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

// --- OCR cleanup: must NOT destroy math or question identifiers ---
const aesop = "Aesop's Fables k of text was mostly about =<) 2 he #1 The Swollen Fox #2 The Flies and the Honey-Pot";
const cleaned = app.cleanOcrText(aesop);
check("cleanOcrText keeps '#1' question identifiers", cleaned.text.includes("#1") && cleaned.text.includes("#2"));
check("cleanOcrText keeps 'The Swollen Fox'", cleaned.text.includes("The Swollen Fox"));
check("cleanOcrText removes symbol junk '=<)'", !cleaned.text.includes("=<)"));
check("cleanOcrText reports what it removed", Array.isArray(cleaned.removed) && cleaned.removed.length > 0);
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
].join(" ");
const ev = app.passageEvidence("1. What was the text mostly about? The fox and the grapes.", worksheet);
check("passageEvidence ignores instructions and choices",
  ev && ev.sentence.includes("fox jumped high") && !ev.sentence.startsWith("Read") && !ev.sentence.startsWith("A)"));

// --- Help Me Understand must not reveal the answer (math path in buildAnswer) ---
// buildAnswer is not pure-grabbable (uses hwMode etc.), so test solveMath +
// the app text indirectly: verify solveMath exists and the explain path in
// the source no longer prints math.value in explain mode.
const m = APP.match(/if\(mode === "explain"\)\{([\s\S]*?)\n\s*\} else \{/);
check("explain mode branch exists in source", !!m);
const srcHasReveal = m ? /\bmath\.value\b/.test(m[1]) : true;
check("explain mode does not print the final value", !srcHasReveal);

// --- book flow ---
check("stripAuthorPrefix: 'the author Gordon Korman' -> 'Gordon Korman'",
  app.stripAuthorPrefix("the author Gordon Korman") === "Gordon Korman");
state.memory.lastTitle = "Restart";
check("isAuthorOnly detects 'the author Gordon Korman'", app.isAuthorOnly("the author Gordon Korman"));
const resolved = app.resolveQuery("the author Gordon Korman");
check("author correction keeps the REQUESTED title 'Restart'",
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

console.log("\n" + passed + " passed, " + failed + " failed, 0 skipped (node)");
process.exit(failed ? 1 : 0);
