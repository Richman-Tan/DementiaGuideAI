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
  s.dependency 'UnityFramework'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end
