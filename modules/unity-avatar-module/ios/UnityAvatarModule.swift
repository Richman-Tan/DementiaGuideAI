import ExpoModulesCore

/// Native bridge to the embedded Unity CC4 avatar (UaaL). See
/// UnityBridgeManager.swift for the lazy-boot logic and
/// unity-avatar/UnityAvatarProject/Assets/Scripts/NativeBridgeReceiver.cs for
/// the message protocol `playAudio`/`stopAudio` forward into Unity.
public class UnityAvatarModule: Module {
    public func definition() -> ModuleDefinition {
        Name("UnityAvatarModule")

        AsyncFunction("initialize") {
            _ = UnityBridgeManager.shared.start()
        }

        AsyncFunction("playAudio") { (payloadJson: String) in
            _ = UnityBridgeManager.shared.start()
            UnityBridgeManager.shared.ensureCharacter()
            UnityBridgeManager.shared.sendMessage(json: payloadJson)
        }

        AsyncFunction("setCharacter") { (id: String) in
            UnityBridgeManager.shared.setCharacter(id: id)
        }

        AsyncFunction("stopAudio") {
            UnityBridgeManager.shared.sendMessage(json: "{\"type\":\"stop\"}")
        }

        AsyncFunction("setDebugMode") { (on: Bool) in
            // No wire message for this yet — BlendshapeReceiver/NativeBridgeReceiver's
            // `logFrames` toggle is Inspector-only for now. AvatarBridgeProtocol.js's
            // setOnAudioStart/setDebugMode contract just needs the method to exist;
            // nothing in the app calls this today (confirmed: zero call sites).
            NSLog("[UnityAvatarModule] setDebugMode(\(on)) — Editor-only toggle for now, not wired to Unity.")
        }

        View(UnityAvatarView.self) {
            // No props for v1 — the view just hosts Unity's root view, resized in
            // UnityAvatarView.layoutSubviews().
        }
    }
}
