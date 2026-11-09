'use strict';

// Turn "3/4", "-1.5", "1,000", "  42 " into a number, or null if it isn't one.
function parseNumber(raw) {
  const s = String(raw).trim().replace(/,/g, '').replace(/\s+/g, '');
  if (s === '') return null;
  const frac = s.match(/^([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)$/);
  if (frac) {
    const den = Number(frac[2]);
    return den === 0 ? null : Number(frac[1]) / den;
  }
  if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return Number(s);
  return null;
}

function normalizeText(raw) {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.。]+$/, '')
    .replace(/^\$(.*)\$$/, '$1')
    .trim();
}

function answersMatch(given, expected) {
  const a = parseNumber(given);
  const b = parseNumber(expected);
  if (a !== null && b !== null) {
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  }
  return normalizeText(given) === normalizeText(expected);
}

// Returns { correct, correctAnswer } for one question.
function gradeQuestion(question, answer) {
  if (question.type === 'choice') {
    const idx = Number(answer);
    return {
      correct: Number.isInteger(idx) && idx === question.correct,
      correctAnswer: question.correct,
    };
  }
  const accepted = question.answers || [];
  const given = answer == null ? '' : String(answer);
  return {
    correct: given.trim() !== '' && accepted.some((exp) => answersMatch(given, exp)),
    correctAnswer: accepted[0] ?? '',
  };
}

module.exports = { parseNumber, normalizeText, answersMatch, gradeQuestion };
