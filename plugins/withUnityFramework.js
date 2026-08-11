const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  withDangerousMod,
  withXcodeProject,
  withPodfile,
  withAppDelegate,
  withSettingsGradle,
  withAppBuildGradle,
  withGradleProperties,
  withAndroidManifest,
} = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

// Committed, prebuilt UaaL artifact (Phase 5) — NOT the raw Unity export.
// Building UnityFramework.framework from the raw Unity-iPhone.xcodeproj
// export requires manually hand-constructing PBXContainerItemProxy/
// PBXReferenceProxy objects to reference a target across project files,
// which the `xcode` npm package (wrapped by @expo/config-plugins) has no
// supported helper for. Simpler and well-supported: build the UnityFramework
// scheme once (xcodebuild -scheme UnityFramework -sdk iphoneos), commit the
// resulting UnityFramework.framework + Data/ + a tiny vendored_frameworks
// podspec here, and let CocoaPods do all the Xcode wiring via `pod install`.
// Rebuild this folder's contents whenever Unity-side scripts/assets/scene
// change — see the Phase 5 plan for the exact rebuild steps.
const UNITY_LIBRARY_SOURCE_DIR = path.join(__dirname, '..', 'unity-avatar', 'UnityAvatarProject', 'UnityLibrary');
const UNITY_LIBRARY_DIR_NAME = 'UnityLibrary';

// Android sibling of the committed iOS UnityLibrary/: the Gradle project that
// `Tools → UaaL → Export Android` (UaalExportBuildAndroid.cs) writes, committed
// to the submodule via git-lfs. Unlike iOS (where sources must live under
// ios/ for CocoaPods), Gradle supports out-of-tree modules via projectDir —
// so the Android mods POINT at the export instead of copying ~1.5 GB into
// android/ on every prebuild.
const ANDROID_EXPORT_SOURCE_DIR = path.join(__dirname, '..', 'unity-avatar', 'UnityAvatarProject', 'android-export');
const ANDROID_UNITY_LIBRARY_DIR = path.join(ANDROID_EXPORT_SOURCE_DIR, 'unityLibrary');

// Unity's exported launcher marks these APK entries uncompressed so il2cpp can
// mmap them straight out of the APK. Streaming assets merge into the APP's
// APK (unityLibrary is a library module), so the policy must be replicated on
// the app module — a compressed .resS breaks Unity asset loading outright.
const UNITY_NO_COMPRESS_EXTENSIONS = ['.unity3d', '.ress', '.resource', '.obb', '.bundle', '.unityexp'];

function androidExportExists() {
  return fs.existsSync(ANDROID_UNITY_LIBRARY_DIR);
}

function warnNoAndroidExport(modName) {
  console.warn(
    `[withUnityFramework] No Unity Android export at ${ANDROID_UNITY_LIBRARY_DIR} — ` +
    `skipping ${modName} this prebuild. Run "Tools → UaaL → Export Android" in Unity ` +
    '(see UaalExportBuildAndroid.cs) or git-lfs pull the committed export.'
  );
}

/**
 * Parses the export's gradle.properties and returns the keys the unityLibrary
 * module consumes from the CONSUMING project's properties: every `unity.*` key
 * (the buildIl2Cpp task reads unity.androidNdkPath/androidSdkPath at app build
 * time to compile libil2cpp.so, and common.gradle reads the sdk/min/target
 * versions) plus `unityStreamingAssets` (tokenized into noCompress lists).
 * Deliberately excludes org.gradle.* / android.* so Unity's template can never
 * clobber Expo's own JVM/AndroidX settings.
 */
function readExportUnityProperties() {
  const propsPath = path.join(ANDROID_EXPORT_SOURCE_DIR, 'gradle.properties');
  const result = {};
  if (!fs.existsSync(propsPath)) return result;
  for (const line of fs.readFileSync(propsPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    if (key.startsWith('unity.') || key === 'unityStreamingAssets' || key === 'unityTemplateVersion') {
      result[key] = trimmed.slice(eq + 1);
    }
  }
  return result;
}

/**
 * Collects `:unityLibrary`-rooted module names from the export's own
 * settings.gradle (e.g. nested `:unityLibrary:xrmanifest.androidlib`), so the
 * app's settings.gradle mirrors whatever Unity's template actually generated
 * instead of a hardcoded guess.
 */
function readExportUnityModules() {
  const settingsPath = path.join(ANDROID_EXPORT_SOURCE_DIR, 'settings.gradle');
  const modules = new Set([':unityLibrary']);
  if (fs.existsSync(settingsPath)) {
    const content = fs.readFileSync(settingsPath, 'utf8');
    for (const match of content.matchAll(/['"](:unityLibrary[^'"]*)['"]/g)) {
      modules.add(match[1]);
    }
  }
  return [...modules];
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(srcPath), destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Copies the committed UnityLibrary/ (framework + Data + podspec) into
 * ios/UnityLibrary/ before pod install. No-ops (with a warning) if it's
 * missing, rather than hard-failing `expo prebuild`.
 */
function withUnityLibraryCopy(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosRoot = config.modRequest.platformProjectRoot;
      const dest = path.join(iosRoot, UNITY_LIBRARY_DIR_NAME);

      if (!fs.existsSync(UNITY_LIBRARY_SOURCE_DIR)) {
        console.warn(
          `[withUnityFramework] No committed UnityLibrary found at ${UNITY_LIBRARY_SOURCE_DIR} — ` +
          'skipping copy this prebuild. See the Phase 5 plan for how to build it.'
        );
        return config;
      }

      fs.rmSync(dest, { recursive: true, force: true });
      copyDirSync(UNITY_LIBRARY_SOURCE_DIR, dest);

      // xcodebuild emits the framework's Info.plist as a BINARY plist. React
      // Native's new-arch pod post-install hook does `find ios -name Info.plist`
      // and reads each as UTF-8 text to scan for git conflict markers — a binary
      // plist there aborts `pod install` with "invalid byte sequence in UTF-8"
      // (ios/UnityLibrary is not in the hook's exclude list). Convert any binary
      // Info.plist under the copied library to XML so the text scan succeeds.
      const fwInfoPlist = path.join(dest, 'UnityFramework.framework', 'Info.plist');
      if (fs.existsSync(fwInfoPlist)) {
        try {
          execFileSync('plutil', ['-convert', 'xml1', fwInfoPlist]);
        } catch (e) {
          console.warn(`[withUnityFramework] Could not convert ${fwInfoPlist} to XML: ${e.message}`);
        }
      }
      return config;
    },
  ]);
}

/**
 * Copies Unity's il2cpp `Data/` bundle to the app-bundle ROOT (.app/Data) at
 * build time. Unity resolves it there because UnityBridgeManager.start() calls
 * setDataBundleId(Bundle.main.bundleIdentifier), pointing il2cpp at the MAIN
 * bundle's Data/ (see UnityBridgeManager.swift).
 *
 * Data is deliberately NOT folded into UnityFramework.framework: a vendored
 * framework containing Unity's binary plists makes React Native's new-arch
 * post-install hook (which scans Info.plist files for conflict markers) abort
 * pod install with "invalid byte sequence in UTF-8". Keeping Data at the app
 * root also sidesteps the CocoaPods "Embed Pods Frameworks" rsync --delete,
 * which would wipe any Data placed inside the framework before embedding.
 */
function withUnityDataCopyPhase(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const mainTargetUuid = project.getFirstTarget().uuid;

    const copyPhaseName = 'Copy Unity Data';
    const hasCopyPhase = project.buildPhaseObject('PBXShellScriptBuildPhase', copyPhaseName, mainTargetUuid) != null;
    if (!hasCopyPhase) {
      project.addBuildPhase(
        [],
        'PBXShellScriptBuildPhase',
        copyPhaseName,
        mainTargetUuid,
        {
          shellPath: '/bin/sh',
          shellScript:
            'ditto "${SRCROOT}/UnityLibrary/Data" "${BUILT_PRODUCTS_DIR}/${PRODUCT_NAME}.app/Data"',
        }
      );
    }
    return config;
  });
}

/** Adds `pod 'UnityFramework', :path => 'UnityLibrary'` inside the main app target. */
function withUnityPodfilePod(config) {
  return withPodfile(config, (config) => {
    if (config.modResults.contents.includes('unity-framework-pod')) {
      return config;
    }
    config.modResults.contents = mergeContents({
      tag: 'unity-framework-pod',
      src: config.modResults.contents,
      newSrc: "  pod 'UnityFramework', :path => 'UnityLibrary'",
      anchor: /use_expo_modules!/,
      offset: 1,
      comment: '#',
    }).contents;
    return config;
  });
}

/**
 * Forwards UIApplicationDelegate lifecycle callbacks to Unity so its
 * render/audio loop pauses and resumes correctly across backgrounding.
 *
 * Inserted directly into the AppDelegate class body (not a trailing
 * extension) with `override` — ExpoAppDelegate's superclass chain already
 * implements these UIApplicationDelegate methods as regular (non-dynamic)
 * Swift methods, and Swift disallows overriding those from an extension
 * (confirmed via a real xcodebuild failure: "cannot override a non-dynamic
 * class declaration from an extension"). Unity itself still only boots
 * lazily from JS (UnityAvatarModule.initialize()), never from here —
 * Expo's generated `didFinishLaunchingWithOptions` is untouched.
 */
function withUnityAppDelegateLifecycle(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      console.warn('[withUnityFramework] AppDelegate is not Swift — skipping lifecycle forwarding mod.');
      return config;
    }
    if (config.modResults.contents.includes('unity-lifecycle-forward')) {
      return config;
    }

    // UnityBridgeManager lives in the UnityAvatarModule pod target, a
    // different Swift module than the main app target AppDelegate.swift
    // belongs to — needs an explicit import (confirmed via a real
    // xcodebuild failure: "cannot find 'UnityBridgeManager' in scope").
    config.modResults.contents = mergeContents({
      tag: 'unity-lifecycle-import',
      src: config.modResults.contents,
      newSrc: 'import UnityAvatarModule',
      anchor: /import ReactAppDependencyProvider/,
      offset: 1,
      comment: '//',
    }).contents;

    config.modResults.contents = mergeContents({
      tag: 'unity-lifecycle-forward',
      src: config.modResults.contents,
      newSrc: [
        '  // Forwards app lifecycle events to Unity (no-op until UnityBridgeManager',
        '  // has actually booted Unity at least once). See UnityBridgeManager.swift.',
        '  public override func applicationWillResignActive(_ application: UIApplication) {',
        '    UnityBridgeManager.shared.appWillResignActive()',
        '  }',
        '',
        '  public override func applicationDidEnterBackground(_ application: UIApplication) {',
        '    UnityBridgeManager.shared.appDidEnterBackground()',
        '  }',
        '',
        '  public override func applicationWillEnterForeground(_ application: UIApplication) {',
        '    UnityBridgeManager.shared.appWillEnterForeground()',
        '  }',
        '',
        '  public override func applicationDidBecomeActive(_ application: UIApplication) {',
        '    UnityBridgeManager.shared.appDidBecomeActive()',
        '  }',
      ].join('\n'),
      // Anchors on the last line of AppDelegate's final method (continue
      // userActivity/restorationHandler); offset 2 skips past both that
      // return statement AND the method's own closing brace, landing the
      // new methods as class-body siblings — offset 1 (verified via a real
      // build) instead nests them inside that method's body, which fails to
      // compile since local funcs can't have `override`/`public`.
      anchor: /return super\.application\(application, continue: userActivity, restorationHandler: restorationHandler\) \|\| result/,
      offset: 2,
      comment: '//',
    }).contents;
    return config;
  });
}

// ─── Android mods ────────────────────────────────────────────────────────────
// All of them warn-and-skip when the committed android-export is absent (same
// contract as withUnityLibraryCopy on iOS), so `expo prebuild` stays usable on
// machines/CI without the git-lfs artifacts.

/**
 * Registers the exported unityLibrary Gradle module(s), pointing projectDir
 * into the submodule's android-export. Mirrors any nested modules Unity's
 * template generated (read from the export's own settings.gradle).
 */
function withUnitySettingsGradle(config) {
  return withSettingsGradle(config, (config) => {
    if (!androidExportExists()) {
      warnNoAndroidExport('settings.gradle include');
      return config;
    }
    if (config.modResults.contents.includes('unity-library-settings')) {
      return config;
    }

    const androidRoot = path.join(config.modRequest.projectRoot, 'android');
    const relToUnityLibrary = path.relative(androidRoot, ANDROID_UNITY_LIBRARY_DIR);
    const lines = [];
    for (const moduleName of readExportUnityModules()) {
      // ':unityLibrary:xrmanifest.androidlib' lives at unityLibrary/xrmanifest.androidlib
      const subPath = moduleName.split(':').filter(Boolean).slice(1).join('/');
      const moduleDir = subPath ? `${relToUnityLibrary}/${subPath}` : relToUnityLibrary;
      lines.push(`include '${moduleName}'`);
      lines.push(`project('${moduleName}').projectDir = new File(rootDir, '${moduleDir}')`);
    }

    config.modResults.contents = mergeContents({
      tag: 'unity-library-settings',
      src: config.modResults.contents,
      newSrc: lines.join('\n'),
      anchor: /include ':app'/,
      offset: 1,
      comment: '//',
    }).contents;
    return config;
  });
}

/**
 * Wires the app module to Unity: the `implementation project(':unityLibrary')`
 * dependency edge, and the launcher's noCompress policy for Unity's streaming
 * assets (which merge into the APP APK — see UNITY_NO_COMPRESS_EXTENSIONS).
 */
function withUnityAppBuildGradle(config) {
  return withAppBuildGradle(config, (config) => {
    if (!androidExportExists()) {
      warnNoAndroidExport('app build.gradle wiring');
      return config;
    }

    if (!config.modResults.contents.includes('unity-library-dependency')) {
      config.modResults.contents = mergeContents({
        tag: 'unity-library-dependency',
        src: config.modResults.contents,
        newSrc: "    implementation project(':unityLibrary')",
        anchor: /^dependencies \{/m,
        offset: 1,
        comment: '//',
      }).contents;
    }

    if (!config.modResults.contents.includes('unity-nocompress')) {
      const extensions = UNITY_NO_COMPRESS_EXTENSIONS.map((e) => `'${e}'`).join(', ');
      config.modResults.contents = mergeContents({
        tag: 'unity-nocompress',
        src: config.modResults.contents,
        newSrc: [
          '    androidResources {',
          `        noCompress += [${extensions}] + (project.hasProperty('unityStreamingAssets') ? unityStreamingAssets.tokenize(', ') : [])`,
          '    }',
        ].join('\n'),
        anchor: /^android \{/m,
        offset: 1,
        comment: '//',
      }).contents;
    }
    return config;
  });
}

/**
 * gradle.properties keys the Unity module depends on:
 * - unityStreamingAssets: consumed by the exported unityLibrary/launcher
 *   gradle for its own noCompress wiring; read from the export at prebuild
 *   time so a Unity re-export can never drift from the app.
 * - reactNativeArchitectures=arm64-v8a: Unity ships only arm64 .so's; letting
 *   Expo build all four ABIs risks the installer picking an ABI where
 *   libunity.so doesn't exist → UnsatisfiedLinkError at boot.
 */
function withUnityGradleProperties(config) {
  return withGradleProperties(config, (config) => {
    if (!androidExportExists()) {
      warnNoAndroidExport('gradle.properties keys');
      return config;
    }

    const setProperty = (key, value) => {
      const existing = config.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) {
        existing.value = value;
      } else {
        config.modResults.push({ type: 'property', key, value });
      }
    };

    const unityProps = readExportUnityProperties();
    if (!('unityStreamingAssets' in unityProps)) {
      unityProps.unityStreamingAssets = '';
    }
    for (const [key, value] of Object.entries(unityProps)) {
      setProperty(key, value);
    }
    setProperty('reactNativeArchitectures', 'arm64-v8a');
    return config;
  });
}

/**
 * unityLibrary's manifest declares com.unity3d.player.UnityPlayerActivity WITH
 * a MAIN/LAUNCHER intent-filter (Unity's standalone template). Merged as-is it
 * would give the app a second launcher icon that boots straight into raw
 * Unity. The embed never uses that activity — UnityAvatarView hosts the player
 * inside MainActivity — so strip it from the merged manifest.
 */
function withUnityAndroidManifest(config) {
  return withAndroidManifest(config, (config) => {
    if (!androidExportExists()) {
      warnNoAndroidExport('manifest activity removal');
      return config;
    }

    const manifest = config.modResults.manifest;
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const application = manifest.application?.[0];
    if (!application) return config;
    application.$ = application.$ || {};

    // unityLibrary's <application> carries enableOnBackInvokedCallback="true"
    // (conflicts with Expo's "false" — merger hard-errors without a replace)
    // and appCategory="game" (silently merges; wrong for a health app).
    const mergeToolsAttr = (attr, value) => {
      const existing = (application.$[attr] || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!existing.includes(value)) existing.push(value);
      application.$[attr] = existing.join(',');
    };
    mergeToolsAttr('tools:replace', 'android:enableOnBackInvokedCallback');
    mergeToolsAttr('tools:remove', 'android:appCategory');

    application.activity = application.activity || [];
    const alreadyRemoved = application.activity.some(
      (a) => a.$?.['android:name'] === 'com.unity3d.player.UnityPlayerActivity'
    );
    if (!alreadyRemoved) {
      application.activity.push({
        $: {
          'android:name': 'com.unity3d.player.UnityPlayerActivity',
          'tools:node': 'remove',
        },
      });
    }
    return config;
  });
}

const withUnityFramework = (config) => {
  // iOS
  config = withUnityLibraryCopy(config);
  config = withUnityDataCopyPhase(config);
  config = withUnityPodfilePod(config);
  config = withUnityAppDelegateLifecycle(config);
  // Android
  config = withUnitySettingsGradle(config);
  config = withUnityAppBuildGradle(config);
  config = withUnityGradleProperties(config);
  config = withUnityAndroidManifest(config);
  return config;
};

module.exports = withUnityFramework;
