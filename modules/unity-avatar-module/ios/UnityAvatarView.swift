import ExpoModulesCore
import UIKit

/// Fabric-compatible native view hosting Unity's root UIView as a subview.
/// Uses ExpoView (not a plain UIView) per expo-modules-core@3.0.30's Fabric/New
/// Architecture requirement (this app has newArchEnabled: true).
///
/// Boots Unity lazily on first layout — whichever happens first between this
/// and UnityAvatarModule.initialize() wins, since UnityBridgeManager.start()
/// is idempotent.
class UnityAvatarView: ExpoView {
    private var unityRootView: UIView?

    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        embedUnityViewIfNeeded()
    }

    private func embedUnityViewIfNeeded() {
        guard unityRootView == nil else { return }
        guard let rootView = UnityBridgeManager.shared.start() else { return }

        rootView.translatesAutoresizingMaskIntoConstraints = true
        rootView.frame = bounds
        addSubview(rootView)
        unityRootView = rootView
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if unityRootView == nil {
            embedUnityViewIfNeeded()
        }
        unityRootView?.frame = bounds
    }
}
