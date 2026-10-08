# iOS end-to-end tests: Maestro on the iOS Simulator

The iOS app's user flows are tested end to end with [Maestro](https://maestro.mobile.dev), which
drives the real app on the iOS Simulator the way a person would: it taps buttons, types text,
answers system permission prompts and checks what is on screen. Each test (a *flow*) is a YAML
file in [`apps/mobile/.maestro/`](../../apps/mobile/.maestro/).

The app under test is a **Release build without the Unity framework**. Unity can't run on the
Simulator (see [How the Simulator build works](#how-the-simulator-build-works)), so the Voice screen
shows the app's fallback avatar instead.

## Running it

**Needs:** macOS with Xcode and an iOS Simulator runtime, CocoaPods, Java 17 or newer, Maestro
(`curl -fsSL "https://get.maestro.mobile.dev" | bash`), and `npm ci` at the repo root.

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
4. installs the app and runs `maestro test apps/mobile/.maestro`.

Results go to `apps/mobile/ios/build/e2e-results/`: a JUnit report (`report.xml`) and, for every
flow, Maestro's logs plus a screenshot and screen hierarchy at any failing step. The build itself
is in `apps/mobile/ios/build/e2e/`. Everything under `apps/mobile/ios/` is generated and
git-ignored.

**Timing.** RESULTS_TIMING_PLACEHOLDER

**Use the dedicated Simulator.** The flows wipe the Simulator's keychain, so that no saved API key
leaks from one flow into the next. Don't point the suite at a Simulator you use for anything else.
To use another device name, set `IOS_E2E_DEVICE_NAME`. To delete the test Simulator:
`xcrun simctl delete DGAI-E2E`.

**It regenerates `apps/mobile/ios/`.** The e2e build and a device build with Unity share that
generated folder. If it was last prebuilt with Unity, the script regenerates it without Unity
(`--clean`). To go back to a device build, prebuild again with the Unity artifacts present (see
[Running on a real device with Unity](#running-on-a-real-device-with-unity)).

## How the Simulator build works

**Without Unity.** The Unity avatar ships as a prebuilt `UnityFramework.framework` built for
iPhone hardware only (an *arm64 device slice*). The Simulator runs a different platform, so the
linker refuses that framework in a Simulator build. The Expo config plugin
[`plugins/withUnityFramework.js`](../../apps/mobile/plugins/withUnityFramework.js) already has a
switch for this: with `EXPO_UNITY_AVATAR=0` (or when the git-lfs Unity artifacts are absent) it
skips all four of its iOS changes:
- copying `UnityLibrary/` into `ios/`;
- the "Copy Unity Data" build phase;
- the `UnityFramework` pod;
- forwarding app lifecycle events to Unity in `AppDelegate`.

The Unity bridge module (`modules/unity-avatar-module`) still compiles. Its Swift code is wrapped
in `#if canImport(UnityFramework)`, so without the framework it builds as a stub that does nothing.
The module now also reports that it was built without Unity (`isUnityLinked: false`). The avatar
component reads that and shows its fallback card instead of an empty space.

**Default builds are unchanged.** The switch only acts when `EXPO_UNITY_AVATAR` is exactly `0`.
A plain `expo prebuild` with the Unity artifacts present runs every Unity step as before. The
script sets the variable only for its own commands. The new `isUnityLinked` constant is `true`
whenever UnityFramework is linked, so device builds behave exactly as before. Android doesn't
export the constant, and only an explicit `false` turns the fallback on, so Android is unaffected
too.

**Release, with the JavaScript bundled in.** A Release build embeds the compiled JavaScript
(Hermes bytecode) in the app, so the tests don't need a Metro dev server running. It also matches
what a user installs.

**No real backend or credentials.** At build time the script sets the Supabase URL to
`https://e2e-offline.invalid` and the key to a placeholder. The `.invalid` domain is reserved and
never resolves. The app needs some URL to start at all. With one that never answers, the Library
falls back to the articles bundled in the app, so the content is the same on every run, online or
offline. The app has no mock or demo mode for chat, and the suite never enters a real API key
(see [What the Simulator can't cover](#what-the-simulator-cant-cover)).

**Xcode 27.** Xcode 27 refuses deployment targets below iOS 15.0, and one CocoaPods resource
bundle (AsyncStorage's) still declares 13.4. The script passes `IPHONEOS_DEPLOYMENT_TARGET=15.1`,
the app's own minimum, to the build. Nothing in the project changes.

## What is covered

Every flow starts from a fresh install: no saved settings, no history, no keys. The flows don't
depend on each other or on run order.

| Flow | User flow | What it checks on screen |
|---|---|---|
| `01-onboarding` | First launch and the full setup guide | Welcome screen; each of the 9 steps; Back and Skip; choosing "voice" adds the voice-speed step; the summary shows every answer; "Change" edits one answer and returns to the summary; finishing opens Home; a relaunch goes straight to Home |
| `02-onboarding-skip-and-reset` | Skipping setup; redoing it | "Skip setup" opens Home and is remembered across a relaunch; Settings → "Reset setup guide" brings the welcome screen back |
| `03-home` | Home | Greeting, hero card, trust badges, common questions, Explore cards; a typed question opens Chat with the question in the transcript and an error banner |
| `04-navigation` | Moving between screens | All five tabs; Voice hides the tab bar; every in-screen link: Home → Settings/Chat/Library/Voice, Chat → back/Library/Voice, Library → Chat, Voice → Home/Chat |
| `05-chat-no-credentials` | Chat with no API key | Key banner, greeting, disclaimer, disabled input; quick questions send nothing; the banner opens the key setting |
| `06-chat-placeholder-key` | Saving a key, sending, clearing history | The key editor (cancel, too-short key refused, save with a confirmation, masked display); chat unlocks; a sent message appears, then the app's error; Settings → Clear Conversation History empties the transcript |
| `07-library` | Library and articles | Categories, filter chips, clearing a filter; search with and without results; an article's detail page; a related article and Back; "Ask Aria about this" hands the article to Chat |
| `08-settings` | Settings | Every toggle flips; text size; the profile, privacy, medical and rating dialogs; clearing history can be cancelled; the Azure and ElevenLabs editors open and cancel; version details; every change survives a relaunch |
| `09-voice` | Voice screen | Controls; a typed question without a key reports it; About; changing persona to Ariana; the volume button mutes Aria; the microphone refused (stays idle) and allowed through both iOS prompts (listens, then stops); choices survive a relaunch |
| `10-avatar-fallback` | The avatar without Unity | The fallback card ("The 3D avatar isn't available on this build — voice still works.") for both personas; with "Show Avatar" off, the placeholder shows Ready → Listening… → Ready |
| `11-drill-mic-denied` | FR-36 drill: microphone refused | See [Fallback drills (FR-36)](#fallback-drills-fr-36) |
| `12-drill-invalid-voice-key` | FR-36 drill: invalid ElevenLabs key | See [Fallback drills (FR-36)](#fallback-drills-fr-36) |

Shared steps live in `apps/mobile/.maestro/subflows/`:
- `launch-fresh.yaml` wipes the app and keychain and launches;
- `skip-onboarding.yaml` does that, skips setup, then runs `audio-off.yaml`;
- `audio-off.yaml` switches Aria's voice off (see [No sound](#no-sound)).

## No sound

Nothing these tests do may be audible on the Mac running them, and a Simulator plays its sound
through the Mac's speakers. The Mac's own volume and audio settings are never touched. Instead:

- **Aria's voice is off in every flow.** Before a flow does anything else, `audio-off.yaml`
  switches Settings → "Audio Responses" off and checks that it and "Auto-play Responses" are off.
  Flow 01 runs it as soon as setup finishes, since the setup screens make no sound. The only
  exception is the volume-button check at the end of `09-voice`. It switches speech on, checks
  Settings, and switches it off again, with no question asked in between.
- **Speech couldn't play anyway.** The app's only sound is Aria speaking an answer. An answer
  needs the language model, and that needs a real OpenAI key, which these flows never have.
- **Keyboard clicks are off** on the simulated iPhone. The script sets its own Sounds & Haptics
  preference (`com.apple.preferences.sounds`), because Maestro types through the iOS keyboard.
- **The microphone is input only.** The listening checks record from the Simulator's input and
  play nothing.

**About the chat errors.** Without a real key, a question can't be answered. The flows check what
the user sees instead. Online, OpenAI rejects the request and the app shows "Invalid API key —
update it in Settings". Offline, it shows "Connection error — check your internet connection".
Either counts as a pass. Flow 06 saves an obvious placeholder (`sk-e2e-placeholder-not-a-real-key-0000`),
never a real key.

## What the Simulator can't cover

These need a real iPhone, real credentials, or a person:

- **The Unity avatar.** There is no Simulator build of UnityFramework, so neither Aaron nor Ariana
  renders, and lip-sync, idle animation and persona switching inside Unity can't be seen. The suite
  checks the fallback only.
- **Real microphone audio and speech recognition.** The Simulator can grant microphone permission
  and enter the listening state, but has nothing real to hear. Transcription, hands-free
  end-of-speech detection and barge-in are untested.
- **Real answers.** With no real API key there are no answers, so the following are untested:
  - answer quality;
  - inline citations and the source card;
  - spoken replies (OpenAI, ElevenLabs or Azure voices);
  - subtitles;
  - auto-play;
  - streaming.

  Entering real credentials is deliberately out of scope.
- **Live Supabase content.** The e2e build uses the bundled articles, not the live library.
- **Leaving the app.** The share sheet, "Help & Support" (opens Mail) and an article's "View
  source" link (opens Safari) hand off to other apps, which these flows don't follow.
- **Look and feel.** Flows check text and state, not appearance. Dark mode, high contrast and text
  size are checked as settings that switch and persist, not visually.

## Fallback drills (FR-36)

The functional verification list ([`docs/eval/functional-verification.md`](../eval/functional-verification.md),
FR-36) has three device fallback drills that were never run. They are taken from
[`docs/voice-latency-streaming.md`](../voice-latency-streaming.md):
- airplane mode mid-stream;
- an invalid ElevenLabs key;
- the microphone denied.

Each was attempted on the Simulator, as below.

DRILLS_TABLE_PLACEHOLDER

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
5. **Check by hand:**
   - Aaron renders on the Voice screen;
   - switching to Ariana works;
   - a spoken question is transcribed and answered aloud, with lips in sync and subtitles;
   - citations open their source card;
   - hands-free mode re-arms the microphone after a reply;
   - backgrounding and returning resumes the avatar.
6. **Optional: run the Maestro flows on the phone.** Maestro supports physical iOS devices
   (`maestro --device <udid> test apps/mobile/.maestro`). Flows 05, 06 and 10 assume no key is
   saved and Unity is absent, so expect them to differ on a configured Unity build. Flows 01–04,
   07 and 08 apply as they are.

## Running in CI (optional, not set up)

A macOS GitHub Actions runner could run this suite. It is not set up. The cost is time, not money:
- this repository is public, so GitHub's standard macOS runners cost nothing (on a private
  repository, macOS minutes bill at 10× the Linux rate);
- a cold run needs `npm ci`, a CocoaPods install and a full native build before any flow runs
  (BUILD_TIME_PLACEHOLDER on the development Mac; hosted runners are slower);
- the flows add about FLOWS_TIME_PLACEHOLDER;
- the runner image must have an Xcode and iOS Simulator runtime the script accepts.

Added to every pull request, that would make the slowest check by far. If it is added, use a
`workflow_dispatch` or nightly trigger, and cache `Pods/` and DerivedData.

## Writing flows

- **Start fresh.** Begin with `runFlow: subflows/skip-onboarding.yaml`, or `launch-fresh.yaml` for
  onboarding itself.
- **Text matching.** Maestro's text selectors are regular expressions that must match the whole
  element text. Escape `( ) ? .` when you mean them literally. For labels that span lines, prefix
  `(?s)`, e.g. `'(?s)Welcome to.*DementiaGuide AI'`.
- **Tabs by testID.** Tap tabs with `id: tab-home|tab-chat|tab-voice|tab-library|tab-settings`.
  "Settings" and "Knowledge library" also label things on the screens.
- **Scroll first.** Home's Explore cards sit partly under the tab bar, and Maestro taps an element's
  centre even when something covers it. Use `scrollUntilVisible` with `centerElement: true` before
  tapping anything near the bottom.
- **Switches.** Check state with `checked: true|false` on the switch's `Toggle <label>`
  accessibility label.
