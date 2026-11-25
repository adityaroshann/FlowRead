// Accessibility report for an AccessDoc. Mirrors backend/access/check.py:
// same rules, same severities, same scoring.
//
// Rule details (shared with the backend, see CONTRACT.md):
//  - doc-missing-title   serious   doc.title empty/whitespace
//  - doc-missing-lang    serious   doc.lang empty/whitespace
//  - image-alt-missing   critical  image, altStatus "missing", OR altStatus not
//                                  "decorative" and alt empty/whitespace
//  - image-alt-unreviewed serious  image, altStatus "ai" (and alt non-empty)
//  - heading-skip        moderate  walking title (h1), then each non-empty
//                                  section heading and each heading block in
//                                  document order, level > previous + 1
//  - table-no-headers    serious   table with headers empty/absent
//  - section-too-long    minor     section word count > 1500: section heading,
//                                  heading/paragraph text, list items, table
//                                  caption + headers + cells, math text,
//                                  image caption
// Issue order: doc-level, then per section: its heading issue, its block
// issues in order, then its section-too-long issue.
//  - math-no-spoken      moderate  math block with spoken empty/whitespace
// Score = max(0, 100 - 15*critical - 8*serious - 4*moderate - 1*minor)

import { sectionWordCount } from './docModel.js';

export const SECTION_WORD_LIMIT = 1500;

export const SEVERITY_WEIGHTS = { critical: 15, serious: 8, moderate: 4, minor: 1 };

export const RULES = {
  'image-alt-missing': { severity: 'critical', label: 'Image has no description' },
  'image-alt-unreviewed': { severity: 'serious', label: 'AI image description not reviewed' },
  'heading-skip': { severity: 'moderate', label: 'Heading level skipped' },
  'table-no-headers': { severity: 'serious', label: 'Table has no header row' },
  'doc-missing-title': { severity: 'serious', label: 'Document has no title' },
  'doc-missing-lang': { severity: 'serious', label: 'Document language not set' },
  'section-too-long': { severity: 'minor', label: 'Section is very long' },
  'math-no-spoken': { severity: 'moderate', label: 'Math has no spoken version' },
};

const blank = (s) => typeof s !== 'string' || s.trim() === '';

function issue(rule, sectionId, blockId, message) {
  return { blockId: blockId ?? null, sectionId: sectionId ?? null, rule, severity: RULES[rule].severity, message };
}

export function scoreIssues(issues) {
  let penalty = 0;
  for (const i of issues) penalty += SEVERITY_WEIGHTS[i.severity] || 0;
  return Math.max(0, 100 - penalty);
}

/** checkDoc(doc) -> Report { score, issues } */
export function checkDoc(doc) {
  const issues = [];
  if (!doc || typeof doc !== 'object') {
    issues.push(issue('doc-missing-title', null, null, 'Document has no title.'));
    issues.push(issue('doc-missing-lang', null, null, 'Document language is not set.'));
    return { score: scoreIssues(issues), issues };
  }

  if (blank(doc.title)) issues.push(issue('doc-missing-title', null, null, 'Document has no title.'));
  if (blank(doc.lang)) issues.push(issue('doc-missing-lang', null, null, 'Document language is not set.'));

  let prevLevel = 1; // the doc title is h1
  for (const sec of doc.sections || []) {
    const sid = sec.id ?? null;

    if (!blank(sec.heading)) {
      const lvl = Number(sec.level) || 2;
      if (lvl > prevLevel + 1) {
        issues.push(
          issue('heading-skip', sid, null, `Heading level jumps from h${prevLevel} to h${lvl}.`),
        );
      }
      prevLevel = lvl;
    }

    for (const b of sec.blocks || []) {
      const bid = b.id ?? null;
      switch (b.type) {
        case 'heading': {
          const lvl = Number(b.level) || 2;
          if (lvl > prevLevel + 1) {
            issues.push(
              issue('heading-skip', sid, bid, `Heading level jumps from h${prevLevel} to h${lvl}.`),
            );
          }
          prevLevel = lvl;
          break;
        }
        case 'image': {
          if (b.altStatus === 'decorative') break;
          if (b.altStatus === 'missing' || blank(b.alt)) {
            issues.push(issue('image-alt-missing', sid, bid, 'Image has no text alternative.'));
          } else if (b.altStatus === 'ai') {
            issues.push(issue('image-alt-unreviewed', sid, bid, 'AI image description has not been reviewed by staff.'));
          }
          break;
        }
        case 'table': {
          const h = b.headers;
          if (!h || (typeof h === 'object' && Object.keys(h).length === 0)) {
            issues.push(issue('table-no-headers', sid, bid, 'Table has no header row.'));
          }
          break;
        }
        case 'math': {
          if (blank(b.spoken)) issues.push(issue('math-no-spoken', sid, bid, 'Maths expression has no spoken description.'));
          break;
        }
        default:
          break;
      }
    }

    const words = sectionWordCount(sec);
    if (words > SECTION_WORD_LIMIT) {
      issues.push(
        issue('section-too-long', sid, null, `Section is ${words} words long. Consider splitting it (over ${SECTION_WORD_LIMIT} words).`),
      );
    }
  }

  return { score: scoreIssues(issues), issues };
}
