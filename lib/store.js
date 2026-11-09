'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CATEGORIES = ['Olympiad', 'Grade 6', 'Grade 7', 'Other'];

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'quiz';
}

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

function str(v, max = 5000) {
  return v == null ? '' : String(v).slice(0, max);
}

// Validate and clean a quiz payload from the admin editor.
// Throws an Error with a user-facing message if something is wrong.
function cleanQuiz(input) {
  const title = str(input.title, 200).trim();
  if (!title) throw new Error('Give the quiz a title.');

  const category = CATEGORIES.includes(input.category) ? input.category : 'Other';
  const questionsIn = Array.isArray(input.questions) ? input.questions : [];
  if (questionsIn.length > 200) throw new Error('A quiz can have at most 200 questions.');

  const questions = questionsIn.map((q, i) => {
    const n = i + 1;
    const prompt = str(q.prompt).trim();
    if (!prompt) throw new Error(`Question ${n} needs a prompt.`);
    const base = {
      id: /^[a-f0-9]{12}$/.test(q.id) ? q.id : newId(),
      prompt,
      imageUrl: str(q.imageUrl, 1000).trim(),
      explanation: str(q.explanation).trim(),
    };
    if (q.type === 'choice') {
      const choices = (Array.isArray(q.choices) ? q.choices : [])
        .map((c) => str(c, 1000).trim());
      if (choices.length < 2) throw new Error(`Question ${n} needs at least two choices.`);
      if (choices.some((c) => !c)) throw new Error(`Question ${n} has an empty choice.`);
      const correct = Number(q.correct);
      if (!Number.isInteger(correct) || correct < 0 || correct >= choices.length) {
        throw new Error(`Question ${n}: mark which choice is correct.`);
      }
      return { ...base, type: 'choice', choices, correct };
    }
    const answers = (Array.isArray(q.answers) ? q.answers : String(q.answers || '').split('\n'))
      .map((a) => str(a, 500).trim())
      .filter(Boolean);
    if (!answers.length) throw new Error(`Question ${n} needs at least one accepted answer.`);
    return { ...base, type: 'short', answers };
  });

  return {
    title,
    slug: slugify(input.slug || title),
    category,
    videoUrl: str(input.videoUrl, 1000).trim(),
    description: str(input.description, 2000).trim(),
    published: Boolean(input.published),
    questions,
  };
}

class Store {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'quizzes.json');
    fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(this.file)) {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } else {
      this.data = { quizzes: [] };
      this.seed();
    }
  }

  save() {
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  all() {
    return this.data.quizzes;
  }

  byId(id) {
    return this.data.quizzes.find((q) => q.id === id);
  }

  bySlug(slug) {
    return this.data.quizzes.find((q) => q.slug === slug);
  }

  uniqueSlug(slug, exceptId) {
    let candidate = slug;
    let n = 2;
    while (this.data.quizzes.some((q) => q.slug === candidate && q.id !== exceptId)) {
      candidate = `${slug}-${n++}`;
    }
    return candidate;
  }

  create(input) {
    const clean = cleanQuiz(input);
    const now = new Date().toISOString();
    const quiz = {
      id: newId(),
      ...clean,
      slug: this.uniqueSlug(clean.slug),
      createdAt: now,
      updatedAt: now,
      stats: { attempts: 0, totalCorrect: 0, totalQuestions: 0 },
    };
    this.data.quizzes.unshift(quiz);
    this.save();
    return quiz;
  }

  update(id, input) {
    const quiz = this.byId(id);
    if (!quiz) return null;
    const clean = cleanQuiz(input);
    Object.assign(quiz, clean, {
      slug: this.uniqueSlug(clean.slug, id),
      updatedAt: new Date().toISOString(),
    });
    this.save();
    return quiz;
  }

  remove(id) {
    const before = this.data.quizzes.length;
    this.data.quizzes = this.data.quizzes.filter((q) => q.id !== id);
    if (this.data.quizzes.length === before) return false;
    this.save();
    return true;
  }

  recordAttempt(quiz, correct, total) {
    quiz.stats = quiz.stats || { attempts: 0, totalCorrect: 0, totalQuestions: 0 };
    quiz.stats.attempts += 1;
    quiz.stats.totalCorrect += correct;
    quiz.stats.totalQuestions += total;
    this.save();
  }

  seed() {
    this.create({
      title: 'Sample: Fractions warm-up',
      category: 'Grade 6',
      description: 'An example quiz so you can see how things look. Edit or delete it from /admin.',
      published: true,
      questions: [
        {
          type: 'choice',
          prompt: 'What is $\\frac{1}{2} + \\frac{1}{3}$?',
          choices: ['$\\frac{2}{5}$', '$\\frac{5}{6}$', '$\\frac{1}{6}$', '$\\frac{2}{3}$'],
          correct: 1,
          explanation: 'Use a common denominator of 6: $\\frac{3}{6} + \\frac{2}{6} = \\frac{5}{6}$.',
        },
        {
          type: 'short',
          prompt: 'Write $0.75$ as a fraction in lowest terms.',
          answers: ['3/4'],
          explanation: '$0.75 = \\frac{75}{100} = \\frac{3}{4}$.',
        },
        {
          type: 'short',
          prompt: 'How many positive whole numbers less than $100$ are divisible by both $4$ and $6$?',
          answers: ['8'],
          explanation: 'Divisible by both 4 and 6 means divisible by $\\text{lcm}(4,6)=12$. The multiples of 12 below 100 are $12, 24, \\dots, 96$: that is $8$ numbers.',
        },
      ],
    });
  }
}

module.exports = { Store, cleanQuiz, slugify, CATEGORIES };
