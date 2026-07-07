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
  # NOT a CocoaPods dependency: plugins/withUnityFramework.js links
  # UnityFramework.framework directly at the Xcode-project level (subproject
  # reference + Link/Embed Frameworks build phases on the main app target),
  # not via a pod. `import UnityFramework` in the Swift files below resolves
  # through Xcode's framework search paths once that plugin has run.

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end
