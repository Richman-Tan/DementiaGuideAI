# iOS end-to-end tests: Maestro on the iOS Simulator

The iOS app's user flows are tested end to end with [Maestro](https://maestro.mobile.dev). Maestro
drives the real app on the iOS Simulator the way a person would: it taps buttons, types text,
answers the system's permission prompts and checks what is on screen. Each test (a *flow*) is a
YAML file in [`apps/mobile/.maestro/`](../../apps/mobile/.maestro/).

The app under test is a **Release build without the Unity framework**. Unity can't run on the
Simulator (see [How the Simulator build avoids Unity](#how-the-simulator-build-avoids-unity)), so
the Voice screen shows the app's fallback avatar instead.

## Running it

**Needs:** macOS with Xcode and an iOS Simulator runtime, CocoaPods, Java 17 or newer, Maestro
(`curl -fsSL "https://get.maestro.mobile.dev" | bash`), and `npm ci` at the repo root. Developed
with Xcode 27.0, the iOS 26.5 runtime, Java 21 and Maestro 2.11.0.

```
npm run test:e2e:ios                     # prebuild, build, boot the Simulator, run every flow
npm run test:e2e:ios -- --skip-build     # reuse the last build; just run the flows
npm run test:e2e:ios -- --skip-build --flow apps/mobile/.maestro/07-library.yaml   # one flow
```

The script is [`apps/mobile/scripts/ios-e2e.sh`](../../apps/mobile/scripts/ios-e2e.sh). It:

1. runs `expo prebuild --platform ios` with `EXPO_UNITY_AVATAR=0`;
2. builds the app in the Release configuration for the Simulator;
3. creates a Simulator called **DGAI-E2E** (iPhone 17 Pro, newest iOS runtime) the first time,
   and boots it;
4. installs the app and runs `maestro test apps/mobile/.maestro`;
5. on a full run, runs the microphone drill that needs a shell command half-way through
   ([Fallback drills](#fallback-drills-fr-36)).

Results go to `apps/mobile/ios/build/e2e-results/`: JUnit reports (`report*.xml`) and, for every
flow, Maestro's logs, plus a screenshot and the screen hierarchy at any failing step. The build
itself is in `apps/mobile/ios/build/e2e/` (about 1.2 GB). Everything under `apps/mobile/ios/` is
generated and git-ignored; delete `apps/mobile/ios/build/` to reclaim the space.

**Timing** (a MacBook on Apple silicon, 9 October 2026): a full `npm run test:e2e:ios` took **22 min 39 s**: 2 min for prebuild and build (DerivedData deleted first, but Xcode's shared compilation cache was warm, so a first-ever build takes longer), 19 min for the 12 flows, and under a minute for the `simctl` drill. A single flow takes 1–3 minutes, most of it the fresh install each flow starts from.

**Use the dedicated Simulator.** The flows wipe the Simulator's keychain, so that no saved API key
leaks from one flow into the next. Don't point the suite at a Simulator you use for anything else.
To use another device name, set `IOS_E2E_DEVICE_NAME`. To delete the test Simulator:
`xcrun simctl delete DGAI-E2E`.

**It regenerates `apps/mobile/ios/`.** The e2e build and a device build with Unity share that
generated folder. If it was last prebuilt with Unity, the script regenerates it without Unity
(`--clean`). To go back to a device build, prebuild again with the Unity artifacts present (see
[Running on a real device with Unity](#running-on-a-real-device-with-unity)).

**If Maestro can't start.** Maestro controls the Simulator through a small test app it installs
(its *driver*). On a freshly booted Simulator that took about 2.5 minutes to start, so the script
allows 5 (`MAESTRO_DRIVER_STARTUP_TIMEOUT`, in milliseconds). If Maestro gives up anyway, it can
leave the driver running, and the next run's driver is then killed a few seconds into every flow.
The script stops any driver aimed at the test Simulator before and after each run.

## How the Simulator build avoids Unity

The Unity avatar ships as a prebuilt `UnityFramework.framework` built for iPhone hardware only (an
*arm64 device slice*). The Simulator is a different platform, so the linker refuses that framework
in a Simulator build.

**The switch already existed.** The Expo config plugin
[`plugins/withUnityFramework.js`](../../apps/mobile/plugins/withUnityFramework.js) skips all four of
its iOS changes when `EXPO_UNITY_AVATAR=0` (or when the git-lfs Unity artifacts are absent, which is
what CI's prebuild smoke test relies on):
- copying `UnityLibrary/` into `ios/`;
- the "Copy Unity Data" build phase;
- the `UnityFramework` pod;
- forwarding app lifecycle events to Unity in `AppDelegate`.

The script sets `EXPO_UNITY_AVATAR=0` for its own `expo prebuild` only, and refuses to build if
`ios/Podfile` still names the Unity pod.

**What this branch added.** The Unity bridge module (`modules/unity-avatar-module`) still compiles
without the framework: its Swift code is wrapped in `#if canImport(UnityFramework)`, so it builds
as a stub that does nothing. But the JavaScript only checked whether the native module *loaded*,
so it believed Unity was available and mounted an empty native view. The module now also exports
a constant, `isUnityLinked`, which is `false` when it was compiled without UnityFramework. The
avatar component treats only an explicit `false` as "not available" and shows its fallback card:
"The 3D avatar isn't available on this build — voice still works."

**The default (with-Unity) build is unchanged:**
- the plugin acts only when `EXPO_UNITY_AVATAR` is exactly `0`; a plain `expo prebuild` with the
  Unity artifacts present runs every Unity step as before;
- with UnityFramework linked, `isUnityLinked` is `true`, so `isUnityAvatarAvailable` is exactly
  what it was;
- the Android module doesn't export the constant (`undefined`), and only `false` turns the
  fallback on, so Android is unaffected too.

**Release, with the JavaScript bundled in.** A Release build embeds the compiled JavaScript
(Hermes bytecode) in the app, so the tests don't need a Metro dev server running. It also matches
what a user installs.

**No real backend or credentials.** At build time the script sets the Supabase URL to
`https://e2e-offline.invalid` and the key to a placeholder. The `.invalid` domain is reserved and
never resolves. The app needs some URL to start at all. With one that never answers, the Library
falls back to the articles bundled in the app, so the content is the same on every run. The app
has no mock or demo mode for chat, and the suite never enters a real API key (see
[What the Simulator can't cover](#what-the-simulator-cant-cover)).

**Xcode 27.** Xcode 27 refuses deployment targets below iOS 15.0, and one CocoaPods resource
bundle (AsyncStorage's) still declares 13.4. The script passes `IPHONEOS_DEPLOYMENT_TARGET=15.1`,
the app's own minimum, to the build. Nothing in the project changes.

## Source changes made for these tests

All are small and keep the app's behaviour for sighted, touch users the same.

| File | Change | Why |
|---|---|---|
| `apps/mobile/metro.config.js` | One import, `webidl-conversions` from Expo's URL polyfill, now resolves to the copy npm installed for that polyfill (5.x), not the root copy (8.x, from jsdom). | **A launch-crash fix that applies to every build, not only the Simulator.** The repo turns off Metro's nested lookup, so the polyfill got 8.x, which reads `SharedArrayBuffer` as it loads. Hermes has no `SharedArrayBuffer`, so the first `new URL()` threw, supabase-js reported "Invalid supabaseUrl", and the app stopped at a white screen. Checked on 9 October: built with `main`'s `metro.config.js`, the bundle contained the 8.x code and the app never got past a blank screen; with the fix it starts normally. This has affected every iOS build from `main` since the monorepo restructure (63a04bf, 16 August 2026), which made 8.x the root copy. |
| `modules/unity-avatar-module` (`UnityBridgeManager.swift`, `UnityAvatarModule.swift`, `src/index.js`) | The `isUnityLinked` constant described above. | Without it, a build with no Unity shows an empty space instead of the fallback card. |
| `src/navigation/AppNavigator.js` | `tabBarButtonTestID` on the five tabs (`tab-home`, `tab-chat`, `tab-voice`, `tab-library`, `tab-settings`). | "Settings" and "Knowledge library" also label buttons on the screens, so the tabs need their own ids. |
| `src/features/settings/screens/ProfileScreen.js` | A Settings row is a single accessibility element only when it has its own action (`accessible={!!onPress}`). | **Accessibility defect.** Each row is a touchable, which iOS treats as one element that hides everything inside it. VoiceOver could not reach any switch or the text-size buttons, nor read whether a switch was on, and neither could the tests. Rows with an action (the key editors, dialogs) are unchanged. |
| `src/features/voice/screens/VoiceScreen.js` | The menu's backdrop and the persona sheet are `accessible={false}`. | **Accessibility defect.** Same cause: the tap-to-close backdrop was one element covering the whole screen, which hid "Change Persona", "About / Help" and the persona cards from VoiceOver and the tests. Taps are unaffected. |

No `.env` files, keys or build products are committed.

## What is covered

Every flow starts from a fresh install (no saved settings, no history, no keys) and switches
Aria's voice off before doing anything else. The flows don't depend on each other or on run order.

| Flow | User flow | What it checks on screen |
|---|---|---|
| `01-onboarding` | First launch and the full setup guide | Welcome screen; each of the 9 steps; Back and Skip; choosing "voice" adds the voice-speed step; the summary shows every answer; "Change" edits one answer and returns to the summary; finishing opens Home; a relaunch goes straight to Home |
| `02-onboarding-skip-and-reset` | Skipping setup; redoing it | "Skip setup" opens Home and is remembered across a relaunch; Settings → "Reset setup guide" brings the welcome screen back |
| `03-home` | Home | Greeting, hero card, trust badges, common questions, the three Explore cards; a typed question opens Chat with the question in the transcript and an error banner |
| `04-navigation` | Moving between screens | All five tabs; Voice hides the tab bar; every in-screen link: Home → Settings/Chat/Library/Voice, Chat → back/Library/Voice, Library → Chat, Voice → Home/Chat |
| `05-chat-no-credentials` | Chat with no API key | Key banner, greeting, disclaimer, the message box saying why it's disabled; a quick question sends nothing; the banner opens Settings at the key |
| `06-chat-placeholder-key` | Saving a key, sending, clearing history | The key editor (cancel, too-short key refused, save with a confirmation); chat unlocks; a sent message appears, then the app's error; Settings → Clear Conversation History empties the transcript |
| `07-library` | Library and articles | Categories, filter chips, clearing a filter; search with and without results; an article's page; a related article and Back; "Ask Aria about this article" hands the article to Chat; the Library starts afresh afterwards |
| `08-settings` | Settings | Every switch flips; text size; the profile, privacy, medical and rating dialogs; clearing history can be cancelled; the Azure and ElevenLabs editors open and cancel; version details; every change survives a relaunch |
| `09-voice` | Voice screen | Controls; a typed question without a key reports it; About; changing persona to Ariana; the microphone refused (stays idle) and allowed through both iOS prompts (listens, then stops); the volume button switches Aria's voice on, and Settings follows; the persona survives a relaunch |
| `10-avatar-fallback` | The avatar without Unity | The fallback card for both personas; with "Show Avatar" off, the placeholder shows Ready → Listening… → Ready |
| `11-drill-mic-denied` | FR-36 drill: microphone refused (Maestro) | See [Fallback drills](#fallback-drills-fr-36) |
| `12-drill-invalid-voice-key` | FR-36 drill: invalid ElevenLabs key | See [Fallback drills](#fallback-drills-fr-36) |
| `simctl/1-prepare`, `simctl/2-mic-revoked` | FR-36 drill: microphone revoked with `xcrun simctl privacy` | Run by the script after the main suite; see [Fallback drills](#fallback-drills-fr-36) |

Shared steps live in `apps/mobile/.maestro/subflows/`:
- `launch-fresh.yaml` wipes the app and keychain and launches;
- `skip-onboarding.yaml` does that, skips setup, then runs `audio-off.yaml`;
- `audio-off.yaml` switches Aria's voice off and checks it (see [No sound](#no-sound)).

**About the chat errors.** Without a real key, a question can't be answered. The flows check what
the user sees instead. Online, OpenAI refuses the request and the app shows "Invalid API key —
update it in Settings". Offline, it shows "Connection error — check your internet connection".
Either counts as a pass; the recorded runs were online and showed the first. Flow 06 saves an
obvious placeholder (`sk-e2e-placeholder-not-a-real-key-0000`), never a real key.

### Last full run

Run on 9 October 2026, the merged branch (`npm run test:e2e:ios`, cold DerivedData), Xcode 27.0,
iOS 26.5 Simulator (iPhone 17 Pro), Maestro 2.11.0. **All 14 flows passed.**

| Flow | Result | Time |
|---|---|---|
| `01-onboarding` | Pass | 1 min 11 s |
| `02-onboarding-skip-and-reset` | Pass | 1 min 6 s |
| `03-home` | Pass | 1 min 6 s |
| `04-navigation` | Pass | 2 min 42 s |
| `05-chat-no-credentials` | Pass | 1 min 8 s |
| `06-chat-placeholder-key` | Pass | 1 min 53 s |
| `07-library` | Pass | 1 min 56 s |
| `08-settings` | Pass | 1 min 55 s |
| `09-voice` | Pass | 2 min 5 s |
| `10-avatar-fallback` | Pass | 1 min 30 s |
| `11-drill-mic-denied` | Pass | 1 min 8 s |
| `12-drill-invalid-voice-key` | Pass | 1 min 23 s |
| `simctl/1-prepare` | Pass | 38 s |
| `simctl/2-mic-revoked` (microphone `auth_value` 0 after the revoke) | Pass | 14 s |
| **Total** (script, including prebuild and build) | **Pass** | **22 min 39 s** |

The Jest unit test for the voice fallback (`ttsService.test.js`, 3 tests) passes with the rest of
the mobile suite (`npm test -w apps/mobile`: 33 suites, 341 tests).

## No sound

Nothing these tests do may be audible on the Mac running them, and a Simulator plays its sound
through the Mac's speakers. The Mac's own volume and audio settings are never touched. Instead:

- **Aria's voice is off in every flow.** Before a flow does anything else, `audio-off.yaml`
  switches Settings → "Audio Responses" off and checks that it and "Auto-play Responses" are off.
  Flow 01 runs it as soon as setup finishes, since the setup screens make no sound. The only
  exception is the volume-button check in `09-voice`: it switches speech on, checks Settings, and
  switches it off again, with no question asked in between.
- **Speech couldn't play anyway.** The app's only sound is Aria speaking an answer: Chat plays one
  only when auto-play is on, the Voice screen only when "Audio Responses" is on, and either needs
  an answer from the language model, which needs a real OpenAI key these flows never have. The
  app has no device text-to-speech path.
- **Keyboard clicks are off** on the simulated iPhone. The script sets its own Sounds & Haptics
  preference (`com.apple.preferences.sounds`), because Maestro types through the iOS keyboard.
- **The microphone is input only.** The listening checks (flows 09 and 10) record a few seconds
  from the Simulator's input, which is the Mac's microphone, and play nothing. The speech module
  (`expo-speech-recognition`) connects the microphone only to its own analysis taps, never to the
  speaker.

**How this was checked.** During the development runs a background script logged macOS's CoreAudio
power assertions every second; one is held while any process has an audio device running. The
Simulator opened an output on the built-in speaker only while the app's microphone session was
active (four times, each under 1.5 minutes). That is the "play and record" audio session opening
both directions; for the reasons above, nothing was rendered into it. The other audio activity in
the log came from apps that were already running before the Simulator booted.

## Fallback drills (FR-36)

The functional verification list ([`docs/eval/functional-verification.md`](../eval/functional-verification.md),
FR-36) has three device fallback drills that were never run. They come from
[`docs/voice-latency-streaming.md`](../voice-latency-streaming.md): airplane mode mid-stream, an
invalid ElevenLabs key, and the microphone denied. Each was attempted on the Simulator. (That list
is part of the evaluation evidence, so it was deliberately not edited here.)

| Drill | How | Outcome |
|---|---|---|
| **Microphone denied** | Two ways. (a) `xcrun simctl privacy <udid> revoke microphone com.anonymous.DementiaGuideAi`, run by the script between `simctl/1-prepare` and `simctl/2-mic-revoked`; the app is launched with `xcrun simctl launch`, because Maestro's `launchApp` grants every permission. The script prints the Simulator's privacy database entry as evidence (`auth_value` 0 = denied). (b) Flow 11, the same refusal through Maestro's `permissions: microphone: deny`. | **Pass, with a finding.** Typing still works: a typed question goes through and reaches the credential check. Tapping the mic does nothing, and **no message tells the user why**. The code does this on purpose (`useAvatarConversation.js`, `startRecording`: a denial is a "silent no-op"; `sttService.js` skips the Whisper fallback on a denial, since Whisper needs the microphone too). So the "denied message" the drill expects doesn't exist, and the "Whisper path" in `voice-latency-streaming.md` can't apply. The flows pin the current behaviour, including the absence of a message. A control run with the microphone granted fails the same flow, so the drill really distinguishes the two. |
| **Invalid ElevenLabs key** | Flow 12 saves a fake key (`invalid-test-key-not-real-0000`) through the app's own Settings editor, then asks a question on the Voice screen. [`ttsService.test.js`](../../apps/mobile/src/lib/tts/ttsService.test.js) checks the voice fallback itself. | **Pass, split across two tests.** On the Simulator: the fake key is accepted, Settings then describes the voice as "GPT-4o-mini + ElevenLabs voice", and a voice turn ends cleanly in "No API key configured" with the screen back to idle. The fallback can't be reached there: the voice cascade (Azure → ElevenLabs → OpenAI voice) only runs on text the language model produced, which needs a real OpenAI key, and it would make sound. The unit test drives the cascade with stubbed network responses (nothing is played): ElevenLabs refuses the key with a 401, the app logs it and falls back to the OpenAI voice; if that fails too, the error reaches the caller. |
| **Airplane mode mid-stream** | — | **Not feasible on the Simulator.** The Simulator has no airplane mode; it shares the Mac's network, and cutting that would disconnect the Mac itself. A mid-stream drop also needs a streaming answer, which needs a real key. What the suite does cover offline: the backend is unreachable on every run (the `.invalid` Supabase URL), and the Library falls back to its bundled articles. The chat flows accept the app's "Connection error" state if the Mac is offline, but no run cut the network deliberately. This drill needs a real iPhone (see below). |

## What the Simulator can't cover

These need a real iPhone, real credentials, or a person:

- **The Unity avatar.** There is no Simulator build of UnityFramework, so neither Aaron nor Ariana
  renders. Lip-sync, idle animation and persona switching inside Unity can't be seen. The suite
  checks the fallback only.
- **Real microphone audio and speech recognition.** The Simulator can grant microphone permission
  and enter the listening state, but nobody speaks. Transcription, hands-free end-of-speech
  detection and barge-in are untested.
- **Real answers.** With no real API key there are no answers, so the following are untested:
  answer quality; inline citations and the source card; spoken replies (OpenAI, ElevenLabs or
  Azure voices); subtitles; auto-play; streaming; airplane mode mid-stream. Entering real
  credentials is deliberately out of scope.
- **Live Supabase content.** The e2e build uses the bundled articles, not the live library.
- **Leaving the app.** The share sheet, "Help & Support" (opens Mail) and an article's "View
  source" link (opens Safari) hand off to other apps, which these flows don't follow.
- **Look and feel.** Flows check text and state, not appearance. Dark mode, high contrast and text
  size are checked as settings that switch and persist, not visually.

## Defects found

Found while writing the flows. The two accessibility defects are fixed (see
[Source changes](#source-changes-made-for-these-tests)); the rest are reported, not fixed, and the
flows work around them in the way a person would.

- **A button tap is lost while the keyboard is up** on Home ("Send question"), in Settings (Save in
  the key editors) and in the Library ("Clear search", an article). The first tap only closes the
  keyboard, so a person has to tap twice. Cause: those screens' `ScrollView`s don't set
  `keyboardShouldPersistTaps` (Chat and onboarding do). Flow 03 taps Send again only if it is still
  there; flows 06, 07 and 12 close the keyboard first.
- **No message when the microphone is refused** (see the drill above).
- **Returning to the Library clears the search.** After "Ask Aria about this article", the Library
  tab opens fresh: the search and the results are gone. Possibly intended; flow 07 records it.
- **VoiceOver could not use Settings or the Voice menu** (fixed in this branch).

## Running on a real device with Unity

For the parts above that need hardware. (Android has its own guide,
[`docs/android-unity.md`](../android-unity.md).)

1. **Get the Unity build.** In `unity-avatar/UnityAvatarProject`, run `git lfs pull`, so that
   `UnityLibrary/` (UnityFramework.framework, `Data/`, podspec) is present.
2. **Prebuild with Unity.** From `apps/mobile`, run `npx expo prebuild --platform ios --clean`
   without `EXPO_UNITY_AVATAR`. The log should not say it is skipping the UnityFramework pod, and
   `ios/Podfile` should contain `pod 'UnityFramework'`.
3. **Build to the phone.** Connect the iPhone and trust the Mac. Open
   `ios/DementiaGuideAi.xcworkspace`, choose your signing team, and select the phone. For a build
   that runs without Metro, run the Release configuration
   (`npx expo run:ios --device --configuration Release`). If provisioning has expired, build once
   from Xcode, or with `xcodebuild -allowProvisioningUpdates`.
4. **Give it real credentials.** Use Settings → AI Configuration: an OpenAI key, plus ElevenLabs
   or Azure for voices. For live library content, build with `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` set in `apps/mobile/.env`.
5. **Check by hand** (somewhere sound is acceptable):
   - Aaron renders on the Voice screen;
   - switching to Ariana works;
   - a spoken question is transcribed and answered aloud, with lips in sync and subtitles;
   - citations open their source card;
   - hands-free mode re-arms the microphone after a reply;
   - backgrounding and returning resumes the avatar;
   - the FR-36 drills: turn on airplane mode while an answer is streaming (the design expects a
     REST replay); save a deliberately wrong ElevenLabs key and ask a question (expect the OpenAI
     voice, with no lip-sync alignment); refuse the microphone in iOS Settings (expect the mic to
     stay idle with no message, as on the Simulator).
6. **Optional: run the Maestro flows on the phone.** Maestro supports physical iOS devices
   (`maestro --device <udid> test apps/mobile/.maestro`). Flows 05, 06 and 10 assume no key is
   saved and Unity is absent, so expect them to differ on a configured Unity build. Flows 01–04,
   07 and 08 apply as they are. Turn the phone's volume down first: flow 09 switches Aria's voice
   on briefly.

## Running in CI (optional, not set up)

A macOS GitHub Actions runner could run this suite. It is not set up, because the cost is time,
not money:
- this repository is public, so GitHub's standard macOS runners cost nothing (on a private
  repository, macOS minutes bill at 10× the Linux rate);
- a cold run needs `npm ci`, a CocoaPods install and a full native build before any flow runs
  (2 minutes on the development Mac, but with Xcode's compiler cache warm; a hosted runner
  starts with nothing cached and is slower, so expect a good deal longer);
- the flows add about 20 minutes;
- the runner image must have an Xcode and iOS Simulator runtime the script accepts.

Added to every pull request, that would be by far the slowest check. If it is added, give it a
`workflow_dispatch` or nightly trigger, and cache `Pods/` and DerivedData. The job is short:
checkout, `npm ci`, install Maestro, `npm run test:e2e:ios`, and upload
`apps/mobile/ios/build/e2e-results/` as an artifact.

## Writing flows

- **Start fresh.** Begin with `runFlow: subflows/skip-onboarding.yaml`, or `launch-fresh.yaml` for
  onboarding itself.
- **Match what iOS exposes, not the source.** Check with `maestro --device <udid> hierarchy`. A
  touchable with no label is read as the text inside it, joined with commas, icon glyphs
  included (the chat header is "Aria, Online"; the Voice menu item is "[icon], Change Persona, [icon]", each icon being a private-use glyph),
  and its children aren't separately visible. Maestro's text selectors are case-insensitive regular
  expressions that must match the whole text: escape `( ) ? . +`, use `.*` around glyphs, and
  prefix `(?s)` for text that spans lines.
- **Tabs by testID.** Tap tabs with `id: tab-home|tab-chat|tab-voice|tab-library|tab-settings`.
- **Scroll to the element you tap.** Maestro taps an element's centre even when something covers
  it. Home's Explore cards are under the tab bar until the page is scrolled (`- scroll`), and a row
  left under the status bar turns the tap into "scroll to top". `centerElement: true` fails on the
  last rows of a page, which can't be centred.
- **The keyboard.** Close it (`hideKeyboard`) before tapping a button on Home, Settings or the
  Library (see [Defects found](#defects-found)).
- **The first tap after a launch** is occasionally dropped; the shared subflows wrap it in a
  `retry`.
- **Switches.** Check state with `checked: true|false` on the switch's `Toggle <label>`
  accessibility label.
