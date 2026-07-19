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

        // Tell il2cpp where Unity's Data/ bundle lives. The config plugin
        // (plugins/withUnityFramework.js) copies Data to the MAIN app bundle root
        // (.app/Data), not into the framework — folding it into the vendored
        // framework breaks `pod install` (RN's new-arch hook chokes on Unity's
        // binary plists). So point Unity at the main bundle, NOT the default
        // "com.unity3d.framework" (which would make it look inside the framework
        // and abort with "Could not open global-metadata.dat").
        framework.setDataBundleId(Bundle.main.bundleIdentifier ?? "com.unity3d.framework")
        framework.register(self)

        // Unity's runEmbedded() spins up its OWN UIWindow and makes it key/visible,
        // which parks a full-screen Unity window ON TOP of the React Native window
        // and swallows every touch (mic button included). Capture the app's key
        // window first and restore it immediately after, so RN keeps input. The
        // avatar is display-only — Unity never needs touch events.
        let appWindow = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }

        let argc = CommandLine.argc
        let argv = CommandLine.unsafeArgv
        framework.runEmbedded(withArgc: argc, argv: argv, appLaunchOpts: nil)

        appWindow?.makeKeyAndVisible()

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
    /// `AvatarRouter` is the single bridge target: it handles `setCharacter`
    /// itself and forwards every other message (play/stop) to the active
    /// character's NativeBridgeReceiver (see
    /// unity-avatar/UnityAvatarProject/Assets/Scripts/AvatarRouter.cs).
    public func sendMessage(json: String, goName: String = "AvatarRouter", methodName: String = "ReceiveBridgeMessage") {
        guard isStarted else {
            NSLog("[UnityBridgeManager] sendMessage called before start() — dropping message.")
            return
        }
        unityFramework?.sendMessageToGO(withName: goName, functionName: methodName, message: json)
    }

    // ── Character selection ──────────────────────────────────────────────────
    // UnitySendMessage silently drops messages sent between runEmbedded() and
    // the first scene load, and there is no ready-handshake from Unity (that
    // would need a NativeCallProxy plugin). Instead we converge idempotently:
    // the router treats a repeated setCharacter as a no-op, so we can re-send
    // freely — immediately, on a couple of delayed retries to cover the boot
    // window, and before every play message via ensureCharacter().

    private var desiredCharacterId: String?
    private var characterSendGeneration = 0

    /// Records the character the app wants active and pushes it to Unity.
    /// Safe to call before Unity boots — the selection is stored and re-sent
    /// by ensureCharacter() on the next play.
    public func setCharacter(id: String) {
        desiredCharacterId = id
        characterSendGeneration += 1
        let generation = characterSendGeneration
        sendSetCharacter(id)
        for delay in [1.5, 4.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self, self.characterSendGeneration == generation else { return }
                self.sendSetCharacter(id)
            }
        }
    }

    /// Re-sends the stored selection (no-op when none). Called before every
    /// play message so the utterance always lands on the intended character.
    public func ensureCharacter() {
        guard let id = desiredCharacterId else { return }
        sendSetCharacter(id)
    }

    private func sendSetCharacter(_ id: String) {
        guard isStarted else { return }
        sendMessage(json: "{\"type\":\"setCharacter\",\"id\":\"\(id)\"}")
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
