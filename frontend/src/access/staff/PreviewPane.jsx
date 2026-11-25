import DocRenderer from '../shared/DocRenderer';
import { PROFILES, PROFILE_ORDER } from '../shared/profiles';
import { plainLanguage } from '../shared/api';

export default function PreviewPane({ doc, profileId, onProfileChange, onSavePlain }) {
  const ids = (PROFILE_ORDER || Object.keys(PROFILES)).filter((id) => PROFILES[id]);
  const profile = PROFILES[profileId] || PROFILES.standard;

  const requestPlain = async (block, section) => {
    const plain = await plainLanguage(block.text || '', section?.heading || '');
    onSavePlain?.(block.id, plain);
    return plain;
  };

  return (
    <>
      <div className="fa-previewbar">
        <div className="fa-field">
          <label className="fa-label" htmlFor="fa-preview-profile">
            Student profile
          </label>
          <select
            id="fa-preview-profile"
            className="fa-select"
            value={profileId}
            onChange={(e) => onProfileChange(e.target.value)}
            aria-describedby="fa-preview-profile-desc"
          >
            {ids.map((id) => (
              <option key={id} value={id}>
                {PROFILES[id].label}
              </option>
            ))}
          </select>
        </div>
        <p className="fa-hint" id="fa-preview-profile-desc" style={{ flex: '1 1 18rem' }}>
          {profile.description}
        </p>
      </div>
      <div className="fa-previewframe">
        <p className="fa-previewframe__label">
          Preview: what a student sees with the {profile.label} profile. Students can fine-tune settings in the reader.
        </p>
        <div className="fa-previewframe__body">
          <DocRenderer doc={doc} profile={profile} onRequestPlain={requestPlain} showTitle={false} />
        </div>
      </div>
    </>
  );
}
