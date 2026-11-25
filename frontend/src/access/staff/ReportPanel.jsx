import { CircleCheck } from 'lucide-react';
import { SEVERITIES, SEVERITY_LABEL, groupIssues, findBlock, BLOCK_TYPE_LABEL } from './staffUtils';

function scoreColor(score) {
  if (score >= 90) return 'var(--fa-ok)';
  if (score >= 70) return 'var(--fa-moderate)';
  if (score >= 50) return 'var(--fa-serious)';
  return 'var(--fa-critical)';
}

function locationOf(doc, issue) {
  if (issue.blockId) {
    const found = findBlock(doc, issue.blockId);
    if (found) {
      const where = found.section.heading ? `in “${found.section.heading}”` : 'in the opening section';
      return `${BLOCK_TYPE_LABEL[found.block.type] || 'Block'} ${where}`;
    }
  }
  if (issue.sectionId) {
    const section = (doc.sections || []).find((s) => s.id === issue.sectionId);
    if (section) return section.heading ? `Section “${section.heading}”` : 'Opening section';
  }
  return 'Document details';
}

export default function ReportPanel({ doc, report, onSelectIssue }) {
  const issues = report?.issues || [];
  const groups = groupIssues(issues);
  const score = report?.score ?? 0;

  return (
    <section className="fa-card fa-report" aria-labelledby="fa-report-title">
      <h2 id="fa-report-title">Accessibility check</h2>
      <div className="fa-score">
        <p className="fa-score__num">
          <span className="fa-visually-hidden">Accessibility check: </span>
          {score}
          <small>/100</small>
        </p>
        <div className="fa-score__bar" aria-hidden="true">
          <div style={{ width: `${score}%`, background: scoreColor(score) }} />
        </div>
      </div>
      <p className="fa-hint">
        {issues.length === 0
          ? 'No issues found.'
          : `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}. Select an issue to go to it.`}
      </p>

      {issues.length === 0 && (
        <p className="fa-notice fa-notice--ok" style={{ marginTop: '0.75rem' }}>
          <CircleCheck size={18} aria-hidden="true" />
          <span>Every automated check passes. A final read-through is still recommended.</span>
        </p>
      )}

      {SEVERITIES.map((sev) =>
        groups[sev].length === 0 ? null : (
          <div key={sev} className="fa-sevgroup">
            <h3>
              <span className={`fa-badge fa-badge--${sev}`}>{SEVERITY_LABEL[sev]}</span>
              <span>
                {groups[sev].length} {groups[sev].length === 1 ? 'issue' : 'issues'}
              </span>
            </h3>
            <ul className="fa-issues">
              {groups[sev].map((issue, i) => (
                <li key={`${issue.rule}-${issue.blockId || issue.sectionId || 'doc'}-${i}`}>
                  <button
                    type="button"
                    className={`fa-issue fa-issue--${sev}`}
                    onClick={() => onSelectIssue(issue)}
                  >
                    <span>{issue.message}</span>
                    <small>{locationOf(doc, issue)}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </section>
  );
}
