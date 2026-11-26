import React from 'react';
import { useSettings } from '../state/SettingsContext.jsx';
import { getAvatarProfile } from '../avatar/avatarProfiles.js';
import { privacyCopy } from '../lib/privacyCopy.js';
import { serverPipelineEnabled } from '../services/turnClient.js';

// The words are in lib/privacyCopy.js: what is true depends on where answers
// are written, and they are tested against that.
export default function Privacy() {
  const { settings } = useSettings();
  // The resolved avatar's name, not a hard-coded one.
  const who = getAvatarProfile(settings.avatarId).name;
  const { intro, sections } = privacyCopy({ who, server: serverPipelineEnabled() });
  return (
    <section style={{ padding: '32px 0 48px', maxWidth: '680px' }}>
      <h1 style={{ fontSize: '1.9rem', margin: '0 0 18px' }}>Privacy Policy</h1>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>{intro}</p>
      {sections.map(({ heading, paragraphs }) => (
        <React.Fragment key={heading}>
          <h2 style={{ fontSize: '1.3rem', margin: '26px 0 10px' }}>{heading}</h2>
          {paragraphs.map((text) => (
            <p key={text} style={{ lineHeight: '1.7', margin: '0 0 16px' }}>
              {text}
            </p>
          ))}
        </React.Fragment>
      ))}
    </section>
  );
}
