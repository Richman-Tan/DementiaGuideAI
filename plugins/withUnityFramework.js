const fs = require('fs');
const path = require('path');
const {
  withDangerousMod,
  withXcodeProject,
  withPodfile,
  withAppDelegate,
} = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

// Phase 5 Step 1 (manual, in the Unity Editor) exports the Xcode project
// containing the UnityFramework target here. See the Phase 5 plan for the
// exact File > Build Settings > iOS > Export Project steps.
const UNITY_EXPORT_DIR = path.join(__dirname, '..', 'unity-avatar', 'uaal-export', 'ios');
const UNITY_LIBRARY_DIR_NAME = 'UnityLibrary';
const UNITY_FRAMEWORK_PROJECT_NAME = 'UnityFramework.xcodeproj';
const UNITY_FRAMEWORK_TARGET_NAME = 'UnityFramework';

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
 * Copies the Unity iOS export into ios/UnityLibrary/ before pod install, so
 * the Xcode project mod below has something to reference. No-ops (with a
 * warning) if the export doesn't exist yet — lets `expo prebuild` still
 * succeed before Phase 5 Step 1 has been run once, rather than hard-failing.
 */
function withUnityLibraryCopy(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosRoot = config.modRequest.platformProjectRoot;
      const dest = path.join(iosRoot, UNITY_LIBRARY_DIR_NAME);

      if (!fs.existsSync(UNITY_EXPORT_DIR)) {
        console.warn(
          `[withUnityFramework] No Unity export found at ${UNITY_EXPORT_DIR} — ` +
          'skipping UnityLibrary copy this prebuild. Run the Unity iOS export ' +
          '(Phase 5 plan, Step 1) first, then re-run `expo prebuild`.'
        );
        return config;
      }

      fs.rmSync(dest, { recursive: true, force: true });
      copyDirSync(UNITY_EXPORT_DIR, dest);
      return config;
    },
  ]);
}

/**
 * Wires UnityLibrary/UnityFramework.xcodeproj into the main app's Xcode
 * project: adds it as a subproject reference, links + embeds the resulting
 * UnityFramework.framework on the main target, and adds a build phase to
 * copy Unity's Data/ asset bundle into the app bundle.
 *
 * This is the highest-risk part of the whole integration — the `xcode` npm
 * package (which @expo/config-plugins wraps) has solid support for simple
 * framework linking but only partial support for subproject references.
 * Verify the resulting ios/DementiaGuideAi.xcodeproj/project.pbxproj in Xcode
 * after the first `expo prebuild`; manual correction in the Xcode GUI
 * (dragging in the subproject once, then re-running prebuild to confirm it
 * sticks) may be needed the first time.
 */
function withUnityXcodeProject(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const iosRoot = config.modRequest.platformProjectRoot;
    const unityLibraryPath = path.join(iosRoot, UNITY_LIBRARY_DIR_NAME);
    const unityProjectPath = path.join(unityLibraryPath, UNITY_FRAMEWORK_PROJECT_NAME);

    if (!fs.existsSync(unityProjectPath)) {
      console.warn(
        `[withUnityFramework] ${unityProjectPath} not present — skipping Xcode ` +
        'project wiring this prebuild.'
      );
      return config;
    }

    const mainTarget = project.getFirstTarget().firstTarget;
    const groupKey = project.findPBXGroupKey({ name: UNITY_LIBRARY_DIR_NAME })
      ?? project.addPbxGroup([], UNITY_LIBRARY_DIR_NAME, UNITY_LIBRARY_DIR_NAME).uuid;

    // Add the subproject file reference (skip if a prior prebuild already added it).
    const alreadyAdded = Object.values(project.hash.project.objects.PBXFileReference || {}).some(
      (ref) => ref && ref.path === UNITY_FRAMEWORK_PROJECT_NAME
    );
    if (!alreadyAdded) {
      const fileRef = project.addFile(
        path.join(UNITY_LIBRARY_DIR_NAME, UNITY_FRAMEWORK_PROJECT_NAME),
        groupKey,
        { lastKnownFileType: 'wrapper.pb-project', sourceTree: '"<group>"' }
      );
      if (fileRef) {
        project.addToPbxProjectSection({
          fileRef: fileRef.fileRef,
          basename: UNITY_FRAMEWORK_PROJECT_NAME,
          proxyType: 2,
          remoteGlobalIDString: UNITY_FRAMEWORK_TARGET_NAME,
        });
      }
    }

    // Link + embed the framework product on the main app target.
    if (!project.pbxFrameworksBuildPhaseObj(mainTarget).files.some((f) => f.comment?.includes('UnityFramework'))) {
      project.addFramework('UnityFramework.framework', {
        customFramework: true,
        embed: true,
        link: true,
        sign: true,
        target: mainTarget,
      });
    }

    // Copy Unity's Data/ bundle into the app so runEmbedded() can find its assets.
    const copyPhaseName = 'Copy Unity Data';
    const hasCopyPhase = project.buildPhaseObject(copyPhaseName, 'PBXShellScriptBuildPhase', mainTarget) != null;
    if (!hasCopyPhase) {
      project.addBuildPhase(
        [],
        'PBXShellScriptBuildPhase',
        copyPhaseName,
        mainTarget,
        {
          shellPath: '/bin/sh',
          shellScript:
            'ditto "${SRCROOT}/UnityLibrary/Data" "${BUILT_PRODUCTS_DIR}/${PRODUCT_NAME}.app/Data"',
        }
      );
    }

    // Unity's iOS export requires bitcode off (also set in the Podfile mod below,
    // belt-and-suspenders since some configs read one or the other).
    project.updateBuildProperty('ENABLE_BITCODE', 'NO');

    return config;
  });
}

/** Disables bitcode across all Pods targets — required by Unity's iOS export. */
function withUnityBitcodeDisabled(config) {
  return withPodfile(config, (config) => {
    if (config.modResults.contents.includes('unity-framework-bitcode')) {
      return config;
    }
    config.modResults.contents = mergeContents({
      tag: 'unity-framework-bitcode',
      src: config.modResults.contents,
      newSrc: [
        '  installer.pods_project.targets.each do |target|',
        "    target.build_configurations.each do |bc|",
        "      bc.build_settings['ENABLE_BITCODE'] = 'NO'",
        '    end',
        '  end',
      ].join('\n'),
      anchor: /post_install do \|installer\|/,
      offset: 1,
      comment: '#',
    }).contents;
    return config;
  });
}

/**
 * Forwards UIApplicationDelegate lifecycle callbacks to Unity so its
 * render/audio loop pauses and resumes correctly across backgrounding. Added
 * as a separate AppDelegate extension (not inside the class body) to avoid
 * touching Expo's generated `didFinishLaunchingWithOptions` at all — Unity
 * itself still only boots lazily from JS (UnityAvatarModule.initialize()),
 * never here.
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
    config.modResults.contents = mergeContents({
      tag: 'unity-lifecycle-forward',
      src: config.modResults.contents,
      newSrc: [
        '// Forwards app lifecycle events to Unity (no-op until UnityBridgeManager',
        '// has actually booted Unity at least once). See UnityBridgeManager.swift.',
        'extension AppDelegate {',
        '  public func applicationWillResignActive(_ application: UIApplication) {',
        '    UnityBridgeManager.shared.appWillResignActive()',
        '  }',
        '',
        '  public func applicationDidEnterBackground(_ application: UIApplication) {',
        '    UnityBridgeManager.shared.appDidEnterBackground()',
        '  }',
        '',
        '  public func applicationWillEnterForeground(_ application: UIApplication) {',
        '    UnityBridgeManager.shared.appWillEnterForeground()',
        '  }',
        '',
        '  public func applicationDidBecomeActive(_ application: UIApplication) {',
        '    UnityBridgeManager.shared.appDidBecomeActive()',
        '  }',
        '}',
      ].join('\n'),
      anchor: /class ReactNativeDelegate/,
      offset: 0,
      comment: '//',
    }).contents;
    return config;
  });
}

const withUnityFramework = (config) => {
  config = withUnityLibraryCopy(config);
  config = withUnityXcodeProject(config);
  config = withUnityBitcodeDisabled(config);
  config = withUnityAppDelegateLifecycle(config);
  return config;
};

module.exports = withUnityFramework;
