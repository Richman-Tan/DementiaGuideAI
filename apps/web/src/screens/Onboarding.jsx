// Setup, in three steps: meet your guide, say how answers should be written,
// and read the one thing everyone has to know before starting.
//
// It was twelve steps. Two of its questions were never read by anything, and
// most of the rest are choices a person can make later, once they have seen an
// answer: those are in Settings. What is asked here is what changes the very
// first answer.
//
// Every choice has a default, so each step can be passed with one press.
import React from 'react';
import { useSettings } from '../state/SettingsContext.jsx';
import { useUi } from '../state/UiContext.jsx';
import { navigate } from '../state/router.js';
import { AvatarBust } from '../avatar/AvatarStage.jsx';
import { getAvatarProfile } from '../avatar/avatarProfiles.js';
import { Button } from '../components/ui/Button.jsx';
import { ChoiceGroup } from '../components/ui/ChoiceGroup.jsx';
import {
  askingFor,
  current as currentChoice,
  DETAIL,
  GUIDE,
  MEDICAL_WORDS,
  pick,
} from '../lib/settingChoices.js';

const STEPS = 3;

export default function Onboarding({ step }) {
  const { settings, setSetting, setMany } = useSettings();
  const { showToast } = useUi();
  // Whoever is chosen is who speaks, from the first heading on: a tester once
  // met one name on this screen and another on Home.
  const profile = getAvatarProfile(settings.avatarId);
  const name = profile.name;

  // An address for a step that does not exist shows the nearest one that does.
  const current = Math.min(STEPS, Math.max(1, step || 1));
  const go = (n) => navigate('#/onboarding/' + n);
  const leave = (message) => {
    setSetting('onboarded', true);
    navigate('#/app/home');
    showToast(message);
  };
  const finish = () => leave("You're all set — welcome");
  const skip = () => leave('Setup skipped — you can redo it in Settings');

  const choice = (definition) => (
    <ChoiceGroup
      label={definition.label}
      value={currentChoice(definition, settings)}
      onChange={(value) => setMany(pick(definition, value))}
      options={definition.options}
    />
  );

  return (
    <section className="box-border flex min-h-screen flex-col items-center px-4 pt-5 pb-10">
      <div className="flex w-full max-w-140 flex-1 flex-col gap-4">
        <div className="flex min-h-11 items-center justify-between">
          {current > 1 && (
            <Button variant="ghost" onClick={() => go(current - 1)}>
              ← Back
            </Button>
          )}
          <span className="flex-1" />
          {current === 2 && (
            <Button variant="ghost" onClick={skip}>
              Skip for now
            </Button>
          )}
        </div>

        <div
          className="flex justify-center gap-2"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={1}
          aria-valuemax={STEPS}
          aria-valuenow={current}
          aria-valuetext={`Step ${current} of ${STEPS}`}
        >
          {Array.from({ length: STEPS }, (_, i) => (
            <span
              key={i}
              className={`h-2 w-8 rounded-pill ${i < current ? 'bg-primary' : 'bg-border'}`}
            />
          ))}
        </div>

        <div className="flex flex-col gap-5 rounded-xl border-(length:--bw) border-solid border-border bg-surface p-6 shadow-card">
          {current === 1 && (
            <>
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="animate-breathe">
                  <AvatarBust size={120} />
                </div>
                <h1 className="m-0 text-2xl text-balance">Kia ora — I'm {name}</h1>
                <p className="m-0 max-w-[26em] text-pretty text-text-muted">
                  I'm here to help with questions about dementia care. A few quick choices and we
                  can start.
                </p>
              </div>
              {choice(GUIDE)}
              <div className="flex flex-col items-center gap-1">
                <Button size="lg" className="self-stretch" onClick={() => go(2)}>
                  Let's begin
                </Button>
                <Button variant="ghost" onClick={skip}>
                  Skip setup
                </Button>
              </div>
            </>
          )}

          {current === 2 && (
            <>
              <div className="flex flex-col gap-1">
                <h1 className="m-0 text-xl text-pretty">How should {name} answer?</h1>
                <p className="m-0 text-text-muted">You can change any of this later in Settings.</p>
              </div>
              {choice(askingFor(name))}
              {choice(DETAIL)}
              {choice(MEDICAL_WORDS)}
              <Button size="lg" onClick={() => go(3)}>
                Continue
              </Button>
            </>
          )}

          {current === 3 && (
            <>
              <h1 className="m-0 text-xl">One important thing to know</h1>
              <div className="flex flex-col gap-3 rounded-lg border-(length:--bw) border-solid border-amber-border bg-amber-bg p-5">
                <p className="m-0">
                  <strong>{name} gives general information, not medical advice.</strong> {name} can
                  help you understand dementia and day-to-day care, but can't diagnose or treat.
                </p>
                <p className="m-0">
                  In an emergency, call <strong>111</strong>.
                </p>
                <p className="m-0">
                  For health concerns, contact your GP — or call{' '}
                  <strong>Healthline on 0800 611 116</strong>, free, any time of day or night.
                </p>
              </div>
              <p className="m-0 text-sm text-text-muted">
                Text size, dark mode, voice speed and {name}'s style are in Settings whenever you
                want them.
              </p>
              <Button size="lg" onClick={finish}>
                I understand — meet {name}
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
