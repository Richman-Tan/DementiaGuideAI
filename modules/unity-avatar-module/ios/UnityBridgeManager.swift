import Foundation
import UnityFramework

/// Lazily boots the embedded Unity player and owns the singleton `UnityFramework`
/// instance. Deliberately NOT started from AppDelegate.didFinishLaunchingWithOptions
/// — Unity only boots on the first call from JS (via UnityAvatarModule.initialize()),
/// so app startup stays fast for users who never open the avatar screen.
///
/// Lives inside the module (not ios/DementiaGuideAi/) so it survives a clean
/// `expo prebuild`, which regenerates the ios/ folder from scratch.
public final class UnityBridgeManager: NSObject {
    // `public` throughout this class: AppDelegate.swift (inserted by
    // plugins/withUnityFramework.js) lives in the main app target, a
    // different Swift module than this pod — confirmed via a real
    // xcodebuild failure ("cannot find 'UnityBridgeManager' in scope")
    // without it.
    public static let shared = UnityBridgeManager()

    public private(set) var isStarted = false
    private var unityFramework: UnityFramework?

    private override init() {
        super.init()
    }

    /// Boots Unity if it hasn't been already. Safe to call repeatedly.
    /// Returns the root UIView Unity renders into, for UnityAvatarView to embed.
    @discardableResult
    public func start() -> UIView? {
        if isStarted {
            return unityFramework?.appController()?.rootView
        }

        guard let framework = UnityFramework.getInstance() else {
            NSLog("[UnityBridgeManager] UnityFramework.getInstance() returned nil — is UnityFramework.framework linked?")
            return nil
        }
        unityFramework = framework

        framework.setDataBundleId("com.unity3d.framework")
        framework.register(self)

        let argc = CommandLine.argc
        let argv = CommandLine.unsafeArgv
        framework.runEmbedded(withArgc: argc, argv: argv, appLaunchOpts: nil)

        isStarted = true
        return framework.appController()?.rootView
    }

    // ── App lifecycle forwarding ─────────────────────────────────────────────
    // Unity's render/audio loop needs these UIApplicationDelegate callbacks
    // forwarded so it pauses/resumes correctly across backgrounding. Called
    // from the AppDelegate extension inserted by plugins/withUnityFramework.js
    // (its withAppDelegate mod) — no-ops if Unity was never started, which is
    // the common case for users who never open the avatar screen.

    public func appWillResignActive() {
        unityFramework?.appController()?.applicationWillResignActive(UIApplication.shared)
    }

    public func appDidEnterBackground() {
        unityFramework?.appController()?.applicationDidEnterBackground(UIApplication.shared)
    }

    public func appWillEnterForeground() {
        unityFramework?.appController()?.applicationWillEnterForeground(UIApplication.shared)
    }

    public func appDidBecomeActive() {
        unityFramework?.appController()?.applicationDidBecomeActive(UIApplication.shared)
    }

    /// Forwards a JSON message to a GameObject in the running Unity scene.
    /// `HD_Aaron` hosts AvatarController / NativeBridgeReceiver (see
    /// unity-avatar/UnityAvatarProject/Assets/Scripts/NativeBridgeReceiver.cs).
    public func sendMessage(json: String, goName: String = "HD_Aaron", methodName: String = "ReceiveBridgeMessage") {
        guard isStarted else {
            NSLog("[UnityBridgeManager] sendMessage called before start() — dropping message.")
            return
        }
        unityFramework?.sendMessageToGO(withName: goName, functionName: methodName, message: json)
    }
}

// UnityFrameworkListener: required by UnityFramework.register(_:) to receive
// lifecycle callbacks (e.g. app-quit requests from the Unity side). No-ops for
// v1 — this app never unloads Unity mid-session.
extension UnityBridgeManager: UnityFrameworkListener {
    public func unityDidUnload(_ notification: Notification!) {
        isStarted = false
        unityFramework = nil
    }
}
