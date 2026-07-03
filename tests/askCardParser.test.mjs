import assert from "node:assert/strict";
import test from "node:test";
import { parseAiResponseJson } from "../src/ask/AiResponseParser.ts";
import { parseAskCards } from "../src/ask/AskCardParser.ts";
import { buildAskCardBlock } from "../src/ask/AskCardBuilder.ts";

test("parseAskCards reads one integrated Ask Card block", () => {
  const markdown = `Before.

>>> ASK_CARD
schemaVersion: 1
id: "ask-20260703-143012-ridge-l2"
concept: "ridge-regression"
status: "resolved"
source_sentence: "Ridge regression adds an L2 penalty."
question: "Why does this reduce overfitting?"
key_answer: "It can reduce variance by discouraging large coefficients."
my_takeaway: "Ridge trades bias for variance."
mastery_signal: "weak"
review_needed: true
created: "2026-07-03T14:30:12+02:00"
<<<

After.`;

  const cards = parseAskCards(markdown);

  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].errors, []);
  assert.equal(cards[0].card.id, "ask-20260703-143012-ridge-l2");
  assert.equal(cards[0].card.concept, "ridge-regression");
  assert.equal(cards[0].card.review_needed, true);
  assert.equal(cards[0].card.mastery_signal, "weak");
});

test("parseAskCards preserves unknown fields", () => {
  const cards = parseAskCards(`>>> ASK_CARD
id: "ask-1"
custom_field: "kept"
review_needed: false
<<<`);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].fields.custom_field, "kept");
  assert.equal(cards[0].card.review_needed, false);
});

test("parseAskCards reports an unclosed block", () => {
  const cards = parseAskCards(`>>> ASK_CARD
id: "ask-1"`);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].errors.length, 1);
});

test("parseAiResponseJson extracts the compact fields from pasted AI JSON", () => {
  const parsed = parseAiResponseJson(`{
    "answer": "Long answer",
    "key_answer": "Short answer",
    "suggested_takeaway": "My takeaway",
    "mastery_signal": "weak",
    "review_needed": true
  }`);

  assert.equal(parsed?.answer, "Long answer");
  assert.equal(parsed?.keyAnswer, "Short answer");
  assert.equal(parsed?.suggestedTakeaway, "My takeaway");
  assert.equal(parsed?.masterySignal, "weak");
  assert.equal(parsed?.reviewNeeded, true);
});

test("buildAskCardBlock writes long fields as blocks instead of huge single lines", () => {
  const block = buildAskCardBlock(
    {
      schemaVersion: 1,
      id: "ask-1",
      concept: "ridge-regression",
      status: "resolved",
      source_sentence: "short source",
      question: "short question",
      key_answer: "x".repeat(181),
      my_takeaway: "line one\nline two",
      mastery_signal: "weak",
      review_needed: true,
      created: "2026-07-03T14:30:12+02:00",
    },
    false
  );

  assert.match(block, /key_answer: \|/);
  assert.match(block, /my_takeaway: \|/);
});
