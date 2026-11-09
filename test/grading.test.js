const test = require('node:test');
const assert = require('node:assert');
const { answersMatch, gradeQuestion, parseNumber } = require('../lib/grading');

test('numbers match in any equal form', () => {
  assert.ok(answersMatch('0.75', '3/4'));
  assert.ok(answersMatch(' 3 / 4 ', '0.75'));
  assert.ok(answersMatch('1,000', '1000'));
  assert.ok(answersMatch('-2', '-4/2'));
  assert.ok(!answersMatch('0.7', '3/4'));
  assert.strictEqual(parseNumber('1/0'), null);
  assert.strictEqual(parseNumber('abc'), null);
});

test('text ignores case, spaces and trailing period', () => {
  assert.ok(answersMatch('  Right   Angle. ', 'right angle'));
  assert.ok(!answersMatch('acute', 'obtuse'));
});

test('grades choice and short questions', () => {
  const choice = { type: 'choice', choices: ['a', 'b'], correct: 1 };
  assert.deepStrictEqual(gradeQuestion(choice, 1), { correct: true, correctAnswer: 1 });
  assert.strictEqual(gradeQuestion(choice, '0').correct, false);
  assert.strictEqual(gradeQuestion(choice, null).correct, false);
  const short = { type: 'short', answers: ['12', 'twelve'] };
  assert.strictEqual(gradeQuestion(short, 'Twelve').correct, true);
  assert.strictEqual(gradeQuestion(short, '24/2').correct, true);
  assert.strictEqual(gradeQuestion(short, '').correct, false);
  assert.strictEqual(gradeQuestion(short, null).correct, false);
});
