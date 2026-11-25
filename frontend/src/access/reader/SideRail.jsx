import { useState } from 'react';
import { Label, Radio, RadioGroup, Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import { Check } from 'lucide-react';
import { PROFILES, PROFILE_ORDER } from '@flowread/core/profiles.js';
import { sectionLabel } from '@flowread/core/docModel.js';
import { chooseProfile, usePrefs } from './readerPrefs.js';
import SettingsPanel from './SettingsPanel.jsx';

function Contents({ sections, current, furthest, pct, minutesLeft, onGo, pages, onGoPage, kind }) {
  const [page, setPage] = useState('');
  const word = kind === 'pptx' ? 'slide' : 'page';
  return (
    <div className="rail-contents">
      <div className="rail-progress">
        <div className="meter" role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="rail-progress-text">
          {pct}% read, {minutesLeft > 0 ? `about ${minutesLeft} min left` : 'nearly done'}
        </p>
      </div>
      <nav aria-label="Contents">
        <ol className="rail-toc">
          {sections.map((s, i) => {
            const status = i === current ? 'current' : i < furthest ? 'done' : 'todo';
            return (
              <li key={s.id} className={`rail-toc-item is-${status}`}>
                <a
                  href={`#sec-${s.id}`}
                  aria-current={i === current ? 'location' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    onGo(i);
                  }}
                >
                  <span className="rail-toc-dot" aria-hidden="true">
                    {status === 'done' && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className="rail-toc-text">{sectionLabel(s, i)}</span>
                  {status === 'done' && <span className="sr-only"> (read)</span>}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
      {pages.length > 0 && (
        <form
          className="rail-page"
          onSubmit={(e) => {
            e.preventDefault();
            onGoPage(Number(page));
          }}
        >
          <label htmlFor="rail-page-input" className="label">
            Go to {word} in the original
          </label>
          <div className="rail-page-row">
            <input
              id="rail-page-input"
              className="input"
              type="number"
              inputMode="numeric"
              min={pages[0].n}
              max={pages[pages.length - 1].n}
              value={page}
              onChange={(e) => setPage(e.target.value)}
              placeholder={`${pages[0].n}–${pages[pages.length - 1].n}`}
            />
            <button type="submit" className="btn">
              Go
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ProfileList({ onChosen }) {
  const prefs = usePrefs();
  return (
    <RadioGroup
      className="rail-profiles"
      value={prefs.profileId}
      onChange={(id) => {
        chooseProfile(id);
        onChosen?.(id);
      }}
    >
      <Label className="sr-only">Reading profile</Label>
      {PROFILE_ORDER.map((id) => (
        <Radio key={id} value={id} className="rail-profile">
          <span className="rail-profile-name">{PROFILES[id].label}</span>
          <span className="rail-profile-desc">{PROFILES[id].description}</span>
        </Radio>
      ))}
      <p className="hint rail-profile-note">Choosing a profile resets your adjustments to its starting point.</p>
    </RadioGroup>
  );
}

/** Contents, profile and settings. Rendered in the side rail or in a sheet on small screens. */
export default function SideRail({ tab, onTabChange, onProfileChosen, ...contents }) {
  return (
    <Tabs className="rail-tabs" selectedKey={tab} onSelectionChange={onTabChange}>
      <TabList aria-label="Reader panels" className="tabs-list rail-tablist">
        <Tab id="contents" className="tab">
          Contents
        </Tab>
        <Tab id="profile" className="tab">
          Profile
        </Tab>
        <Tab id="adjust" className="tab">
          Adjust
        </Tab>
      </TabList>
      <TabPanel id="contents" className="tab-panel rail-panel">
        <Contents {...contents} />
      </TabPanel>
      <TabPanel id="profile" className="tab-panel rail-panel">
        <ProfileList onChosen={onProfileChosen} />
      </TabPanel>
      <TabPanel id="adjust" className="tab-panel rail-panel">
        <SettingsPanel />
      </TabPanel>
    </Tabs>
  );
}
