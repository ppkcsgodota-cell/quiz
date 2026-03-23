import fs from 'fs/promises';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
  parseTagValue: false,
});

const config = {
  logic: [
    'https://db.chgk.info/tour/delfin/xml',
    'https://db.chgk.info/tour/akvar00/xml'
  ],
  hardcore: [
    'https://db.chgk.info/tour/thanos21.5_u/xml',
    'https://db.chgk.info/tour/dodon08.5/xml'
  ]
};

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanText(value) {
  if (!value) return '';
  return String(value)
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function pickExplanation(questionNode) {
  return cleanText(
    questionNode.Comments ||
    questionNode.Comment ||
    questionNode.Remarks ||
    ''
  );
}

function pickSource(questionNode) {
  const raw = questionNode.Sources || questionNode.Source || '';
  if (Array.isArray(raw)) {
    return cleanText(raw.join('; '));
  }
  return cleanText(raw);
}

function pickAuthor(questionNode) {
  return cleanText(questionNode.Authors || questionNode.Author || '');
}

function buildQuestionUrl(tourId, questionNumber) {
  return `https://db.chgk.info/question/${tourId}/${questionNumber}`;
}

function extractQuestionsFromTour(xmlText, xmlUrl) {
  const data = parser.parse(xmlText);

  const tour =
    data?.tournament?.tour ||
    data?.tour ||
    data?.document?.tour ||
    data?.tournament ||
    data;

  if (!tour) {
    return [];
  }

  const tourId =
    tour.FileName ||
    tour.id ||
    xmlUrl.match(/tour\/([^/]+)\/xml/)?.[1] ||
    '';

  const questionNodes =
    toArray(tour.question) ||
    toArray(tour.questions?.question);

  return questionNodes.map((q, index) => {
    const number =
      q.Number ||
      q.QuestionId ||
      q.Id ||
      String(index + 1);

    return {
      question: cleanText(q.Question || q.Text || ''),
      answer: cleanText(q.Answer || ''),
      explanation: pickExplanation(q),
      source: pickSource(q),
      author: pickAuthor(q),
      sourceUrl: buildQuestionUrl(tourId, number)
    };
  }).filter(q => q.question && q.answer);
}

async function fetchTour(xmlUrl) {
  const res = await fetch(xmlUrl, {
    headers: {
      'User-Agent': 'quiz-training-importer/1.0'
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${xmlUrl}`);
  }

  return res.text();
}

async function importCategory(urls) {
  const results = [];

  for (const url of urls) {
    try {
      const xml = await fetchTour(url);
      const questions = extractQuestionsFromTour(xml, url);
      results.push(...questions);
      console.log(`Imported ${questions.length} questions from ${url}`);
    } catch (err) {
      console.error(`Failed to import ${url}:`, err.message);
    }
  }

  return results;
}

function toJsFile(data) {
  return `window.questionBank = ${JSON.stringify(data, null, 2)};`;
}

async function main() {
  const logic = await importCategory(config.logic);
  const hardcore = await importCategory(config.hardcore);

  const existing = {
    warmup: [],
    logic,
    shazam: [],
    'three-chairs': [],
    'secret-topic': [],
    hardcore
  };

  await fs.writeFile('questions.js', toJsFile(existing), 'utf8');
  console.log('questions.js updated');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
