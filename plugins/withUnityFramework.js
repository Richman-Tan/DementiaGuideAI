const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  withDangerousMod,
  withXcodeProject,
  withPodfile,
  withAppDelegate,
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

const withUnityFramework = (config) => {
  config = withUnityLibraryCopy(config);
  config = withUnityDataCopyPhase(config);
  config = withUnityPodfilePod(config);
  config = withUnityAppDelegateLifecycle(config);
  return config;
};

module.exports = withUnityFramework;
