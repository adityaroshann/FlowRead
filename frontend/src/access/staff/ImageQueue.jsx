import { memo, useState } from 'react';
import { Check, EyeOff, Eye, RefreshCw, LoaderCircle, TriangleAlert } from 'lucide-react';
import { describeImage } from '../shared/api';
import { safeImageSrc } from '../shared/docModel';
import { ALT_STATUS_LABEL, collectImages, describeAiError } from './staffUtils';

const STATUS_HELP = {
  ai: 'Drafted by AI. Check it against the image, edit if needed, then approve.',
  approved: 'Approved by staff. Students will hear this description.',
  decorative: 'Marked decorative. Screen readers will skip this image.',
  missing: 'No description. Write one, regenerate with AI, or mark it decorative.',
};

const ImageCard = memo(function ImageCard({ item, number, total, onChangeBlock }) {
  const { block, section, context } = item;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const status = block.altStatus || 'missing';
  const id = block.id;
  const titleId = `fa-imgtitle-${id}`;
  const src = safeImageSrc(block.src);
  const canApprove = Boolean((block.alt || '').trim());

  const regenerate = async () => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const res = await describeImage(block.src, context);
      const alt = (res?.alt || '').trim();
      onChangeBlock(id, { alt, altStatus: alt ? 'ai' : 'missing' });
      setNote(
        res?.decorative
          ? 'New AI draft ready. The AI thinks this image may be decorative; mark it decorative if it adds no information.'
          : 'New AI draft ready. Review it before approving.'
      );
    } catch (err) {
      setError(describeAiError(err));
    } finally {
      setBusy(false);
    }
  };

  const onEdit = (value) => {
    const patch = { alt: value };
    if (status === 'missing' && value.trim()) patch.altStatus = 'ai';
    if (status === 'ai' && !value.trim()) patch.altStatus = 'missing';
    onChangeBlock(id, patch);
  };

  return (
    <li className="fa-card fa-imgcard" id={`fa-img-${id}`} tabIndex={-1} aria-labelledby={titleId}>
      <div className="fa-imgcard__preview">
        {src ? (
          <img src={src} alt={block.alt ? `Preview. Current description: ${block.alt}` : 'Preview of the image'} />
        ) : (
          <p className="fa-hint">No preview available</p>
        )}
      </div>
      <div className="fa-imgcard__body">
        <div className="fa-imgcard__head">
          <h3 id={titleId}>
            Image {number} of {total}
          </h3>
          <span className={`fa-badge fa-badge--${status}`}>
            <span className="fa-visually-hidden">Status: </span>
            {ALT_STATUS_LABEL[status] || 'Missing'}
          </span>
        </div>
        <p className="fa-imgcard__ctx">
          {section.heading ? `In “${section.heading}”` : 'In the opening section'}
          {block.caption ? `. Caption: ${block.caption}` : ''}
        </p>

        {status === 'decorative' ? (
          <p className="fa-hint">{STATUS_HELP.decorative}</p>
        ) : (
          <div className="fa-field">
            <label className="fa-label" htmlFor={`fa-alt-${id}`}>
              Description (alt text)
            </label>
            <textarea
              id={`fa-alt-${id}`}
              className="fa-textarea"
              rows={4}
              value={block.alt || ''}
              onChange={(e) => onEdit(e.target.value)}
              aria-describedby={`fa-alth-${id}`}
              disabled={busy}
            />
            <span className="fa-hint" id={`fa-alth-${id}`}>
              {STATUS_HELP[status]}
            </span>
          </div>
        )}

        <div className="fa-btnrow">
          {status !== 'decorative' && (
            <button
              type="button"
              className="fa-btn fa-btn--sm fa-btn--primary"
              onClick={() => onChangeBlock(id, { altStatus: 'approved', alt: block.alt.trim() })}
              disabled={!canApprove || status === 'approved' || busy}
            >
              <Check size={16} aria-hidden="true" />
              {status === 'approved' ? 'Approved' : 'Approve'}
              <span className="fa-visually-hidden"> image {number}</span>
            </button>
          )}
          {status === 'decorative' ? (
            <button
              type="button"
              className="fa-btn fa-btn--sm"
              onClick={() => onChangeBlock(id, { altStatus: block.alt ? 'ai' : 'missing' })}
            >
              <Eye size={16} aria-hidden="true" /> Not decorative<span className="fa-visually-hidden">, image {number}</span>
            </button>
          ) : (
            <button
              type="button"
              className="fa-btn fa-btn--sm"
              onClick={() => onChangeBlock(id, { altStatus: 'decorative' })}
              disabled={busy}
            >
              <EyeOff size={16} aria-hidden="true" /> Mark decorative<span className="fa-visually-hidden">, image {number}</span>
            </button>
          )}
          <button
            type="button"
            className="fa-btn fa-btn--sm"
            onClick={regenerate}
            disabled={busy || !block.src}
            aria-describedby={`fa-imgmsg-${id}`}
          >
            {busy ? (
              <LoaderCircle size={16} className="fa-spin" aria-hidden="true" />
            ) : (
              <RefreshCw size={16} aria-hidden="true" />
            )}
            {busy ? 'Generating…' : 'Regenerate'}
            <span className="fa-visually-hidden"> description for image {number}</span>
          </button>
        </div>
        {status === 'approved' && (
          <p className="fa-hint">Editing the text keeps it approved. You are responsible for the final wording.</p>
        )}
        {!canApprove && status !== 'decorative' && (
          <p className="fa-hint">Add a description to enable Approve.</p>
        )}
        <div id={`fa-imgmsg-${id}`} aria-live="polite">
          {error && (
            <p className="fa-warn">
              <TriangleAlert size={16} aria-hidden="true" /> {error}
            </p>
          )}
          {note && <p className="fa-hint">{note}</p>}
        </div>
      </div>
    </li>
  );
});

export default function ImageQueue({ doc, onChangeBlock }) {
  const images = collectImages(doc);
  const counts = images.reduce((acc, { block }) => {
    const s = block.altStatus || 'missing';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const toReview = (counts.ai || 0) + (counts.missing || 0);

  if (images.length === 0) {
    return <p className="fa-hint">This document has no images.</p>;
  }

  return (
    <>
      <div className="fa-queuebar">
        <p>
          <strong>{toReview === 0 ? 'All images reviewed.' : `${toReview} of ${images.length} still need review.`}</strong>
        </p>
        <p className="fa-hint">
          {counts.approved || 0} approved · {counts.decorative || 0} decorative · {counts.ai || 0} AI draft ·{' '}
          {counts.missing || 0} missing
        </p>
      </div>
      <p className="fa-hint" style={{ marginBottom: '1rem' }}>
        Each image must be approved on its own. Read every AI draft against the image before approving it.
      </p>
      <ul className="fa-imglist">
        {images.map((item, i) => (
          <ImageCard
            key={item.block.id}
            item={item}
            number={i + 1}
            total={images.length}
            onChangeBlock={onChangeBlock}
          />
        ))}
      </ul>
    </>
  );
}
