# Android Unity Integration (UaaL)

How the Unity avatar (Aaron/Ariana) is embedded on Android, mirroring the iOS
`UnityFramework.framework` embed. iOS reference: `plugins/withUnityFramework.js`
(iOS half) + `modules/unity-avatar-module/ios/`.

## Architecture

```
Unity project (submodule)                 RN app
unity-avatar/UnityAvatarProject/
  Assets/Scripts/Editor/
    UaalExportBuildAndroid.cs  ──export──▶ android-export/          (committed, git-lfs)
                                             unityLibrary/          Gradle library module
                                               libs/unity-classes.jar
                                               src/main/jniLibs/arm64-v8a/*.so
                                               src/main/Il2CppOutputProject/   (IL2CPP compiles at app build!)
                                             shared/*.gradle        referenced by unityLibrary
                                             gradle.properties      source of the unity.* keys

plugins/withUnityFramework.js (Android mods) — applied at `expo prebuild`:
  settings.gradle   include ':unityLibrary' + projectDir → POINTS into the submodule (no copy)
  app/build.gradle  implementation project(':unityLibrary') + Unity noCompress list
  gradle.properties every unity.* key + unityStreamingAssets (read from the export) + reactNativeArchitectures=arm64-v8a
  AndroidManifest   strips com.unity3d.player.UnityPlayerActivity (Unity's template ships it with a LAUNCHER intent-filter)

modules/unity-avatar-module/android/ — Expo module (Kotlin):
  UnityBridgeManager.kt  singleton UnityPlayerForActivityOrService owner; lazy boot; lifecycle; UnitySendMessage
  UnityAvatarView.kt     ExpoView hosting player.getFrameLayout(); touch-transparent
  UnityAvatarModule.kt   initialize/playAudio/setCharacter/stopAudio/setDebugMode + activity lifecycle hooks
```

The Unity C# side (`AvatarRouter.cs`, `NativeBridgeReceiver.cs`,
`CoarticulationEngine`) is platform-free and identical on both platforms; the
JS payloads are identical too.

## Export discovery facts (Unity 6000.5.0f1, template v25 — verified 2026-08-11)

- **Player class**: `UnityPlayerForActivityOrService(Context, IUnityPlayerLifecycleEvents)`,
  `getFrameLayout()`, `pause()/resume()/destroy()`, `windowFocusChanged(boolean)`,
  `setRunWithoutFocus(boolean)`; static `UnityPlayer.UnitySendMessage(go, method, json)`.
  Re-verify after a Unity upgrade: `unzip` the jar + `javap -classpath . com.unity3d.player.UnityPlayer`.
- **IL2CPP compiles during the APP's gradle build** (`buildIl2Cpp` task in
  `unityLibrary/build.gradle`) from `src/main/Il2CppOutputProject`, using the
  `unity.androidNdkPath` / `unity.androidSdkPath` gradle properties. That's why
  the config plugin copies **all** `unity.*` keys into `android/gradle.properties`
  — and why building on a new machine needs Unity (with Android modules) at the
  same install path, or those keys overridden.
- **No separate libil2cpp.so is committed**: jniLibs ships `libmain.so`,
  `libunity.so`, `lib_burst_generated.so`; `libil2cpp.so` appears after the
  first app build.
- **`unityStreamingAssets` is empty** for this project (Data lives under
  `unityLibrary/src/main/assets/`, covered by the extension-based noCompress
  list: `.unity3d .ress .resource .obb .bundle .unityexp`). Streaming assets
  merge into the APP APK, so the noCompress list must exist on the app module —
  the plugin injects it.
- **unityLibrary needs no flatDir**: it resolves `unity-classes.jar` via
  `fileTree(dir: 'libs')`.
- **`shared/*.gradle`** are referenced relatively (`../shared/…`) from
  unityLibrary — pointing settings.gradle at the export keeps them resolvable;
  never copy unityLibrary out of the export tree alone.
- **Export template pins**: AGP 9.0.0 / compileSdk 36 / buildTools 36.0.0 /
  NDK 27.2.12479018 / Java 17 / minSdk 26 / arm64-v8a only. The app builds it
  with Expo's own AGP; the DSL used (androidResources, androidComponents,
  packaging.jniLibs) is compatible. App minSdk is raised to 26 via
  `expo-build-properties` in app.json.
- **ABI**: Unity ships arm64-v8a only → plugin pins
  `reactNativeArchitectures=arm64-v8a` (a mixed-ABI APK would crash with
  UnsatisfiedLinkError on non-arm64 resolution).

## Re-export checklist (after any Unity-side change)

1. Unity → `Tools → UaaL → Export Android (android-export)` — or headless:
   ```bash
   /Applications/Unity/Hub/Editor/6000.5.0f1/Unity.app/Contents/MacOS/Unity \
     -batchmode -quit -projectPath unity-avatar/UnityAvatarProject \
     -buildTarget Android -executeMethod UaalExportBuildAndroid.Run \
     -logFile /tmp/unity-android-export.log
   ```
   (`UaalExportBuildAndroid.RunMinimal` builds the cube test scene instead —
   use it to bisect embed-plumbing issues from content/shader issues.)
2. Check `android-export/export_result.json` says `"result":"Succeeded"`.
3. Re-export iOS too (`Tools → UaaL → Export iOS`) so the platforms don't drift.
4. Commit both artifact folders in the submodule (git-lfs).
5. In the app: `npx expo prebuild --platform android && npx expo run:android`.

The export script enforces the settings the embed depends on (Gradle-project
export, ASTC, IL2CPP/ARM64, classic Activity entry point — NOT GameActivity —
and Unity audio disabled since expo-av owns playback).

## Embed gotchas (why the Kotlin code looks the way it does)

- Player must be constructed with the **Activity**, not application context
  (black-screen otherwise).
- RN owns real window focus → `setRunWithoutFocus(true)` +
  `resume(); windowFocusChanged(true)` after construction, else Unity's render
  loop stays paused.
- **Never call `player.quit()`** — Unity's quit kills the entire Android
  process, RN included. Teardown is `destroy()`, and only when the Activity is
  genuinely finishing.
- Unity's FrameLayout is a singleton — `UnityAvatarView` reparents it on every
  attach because React remounts screens.
- Touch: the view intercepts-and-drops all events (parity with iOS
  `isUserInteractionEnabled = false`); RN overlays stay tappable, Unity never
  fights the keyboard (`FOCUS_BLOCK_DESCENDANTS`).
- `setCharacter` uses the same idempotent 1.5 s / 4 s retry convergence as iOS
  (UnitySendMessage silently drops messages during Unity boot).

## Debugging

```bash
adb logcat -s Unity:V UnityAvatarModule:V UnityBridgeManager:V ReactNativeJS:V AndroidRuntime:E
```

- Avatar area blank + `[UnityAvatarModule] native module unavailable` in JS →
  the app was built without the export (plugin logged warn-and-skip at
  prebuild). The UI shows the "3D avatar isn't available on this build" state.
- `UnsatisfiedLinkError: libunity.so` → APK built with extra ABIs; confirm
  `reactNativeArchitectures=arm64-v8a` survived in `android/gradle.properties`.
- Magenta/pink materials on device → shader fell back; see the material
  fallback section below.

## Material / shader fallback (Phase C risk)

The Reallusion HQ materials (Amplify, tessellation) target desktop GPUs. If
characters render magenta or broken on device:

1. Check the editor console with build target = Android for shader compile
   errors first (cheap).
2. Assign an Android-specific URP quality tier (lower shadows, no SSAO).
3. Rebuild Aaron/Ariana materials at Reallusion **Basic** quality (URP Lit, no
   tessellation) with the vendored CCiC tools
   (`Packages/com.soupday.cc3_unity_tools`) as a parallel material set, applied
   at runtime by a `PlatformMaterialSwapper` on `Application.platform ==
   RuntimePlatform.Android`. Blendshapes are mesh-level — lip-sync is
   unaffected. iOS visuals untouched.

## Known limitations

- Local installs only: the installed app is large (Unity Data merges into the
  APK). Play-Store delivery (asset packs / PAD) is out of scope for now.
- The `unity.*` gradle properties carry absolute paths into the Unity
  installation — machine-specific by design (same policy as the committed iOS
  framework: artifacts are built on the machine that owns the Unity install).
- Emulators (arm64 image on Apple Silicon) exercise the embed plumbing but not
  real GPU shader behavior — final sign-off needs a physical device.
