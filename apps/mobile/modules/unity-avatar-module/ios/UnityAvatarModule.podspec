require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'UnityAvatarModule'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = ''
  s.homepage       = 'https://github.com/Richman-Tan/DementiaGuideAI'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # UnityFramework is a vendored_frameworks CocoaPods pod (see
  # unity-avatar/UnityAvatarProject/UnityLibrary/UnityFramework.podspec,
  # referenced via :path in the Podfile by plugins/withUnityFramework.js).
  # Needed for `import UnityFramework` to resolve in the Swift files below —
  # confirmed via a real xcodebuild failure ("no such module 'UnityFramework'")
  # without this declared.
  #
  # Declared ONLY when that plugin actually placed the library, which is the
  # same condition the plugin uses to add the `:path` pod. Keying off the
  # directory rather than re-reading EXPO_UNITY_AVATAR keeps one source of
  # truth: whatever the plugin decided is on disk, and this follows it.
  #
  # Declaring it unconditionally is not merely redundant — with no `:path`
  # entry in the Podfile, CocoaPods resolves the bare name from the public
  # trunk, where an unrelated pod called UnityFramework exists. `pod install`
  # then tries to clone a third-party repo (which is currently dead, so it
  # fails loudly, but it is not a name we control).
  unity_library = File.expand_path('../../../ios/UnityLibrary', __dir__)
  if File.directory?(unity_library)
    s.dependency 'UnityFramework'
  end

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end
