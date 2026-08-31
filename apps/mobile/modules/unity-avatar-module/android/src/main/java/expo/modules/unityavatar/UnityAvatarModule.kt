package expo.modules.unityavatar

import android.util.Log
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Native bridge to the embedded Unity CC4 avatar (UaaL) — the Android port of
 * ios/UnityAvatarModule.swift. See UnityBridgeManager.kt for the lazy-boot
 * logic and unity-avatar/UnityAvatarProject/Assets/Scripts/NativeBridgeReceiver.cs
 * for the message protocol `playAudio`/`stopAudio` forward into Unity.
 *
 * All functions run on the main queue: UnityPlayer construction and its
 * lifecycle calls are main-thread affairs.
 */
class UnityAvatarModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("UnityAvatarModule")

        AsyncFunction("initialize") {
            appContext.currentActivity?.let { UnityBridgeManager.start(it) }
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("playAudio") { payloadJson: String ->
            appContext.currentActivity?.let { UnityBridgeManager.start(it) }
            UnityBridgeManager.ensureCharacter()
            UnityBridgeManager.ensureState()
            UnityBridgeManager.sendMessage(payloadJson)
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("setCharacter") { id: String ->
            UnityBridgeManager.setCharacter(id)
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("setAvatarState") { state: String ->
            UnityBridgeManager.setAvatarState(state)
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("stopAudio") {
            UnityBridgeManager.sendMessage("{\"type\":\"stop\"}")
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("setDebugMode") { on: Boolean ->
            // Parity with iOS: no wire message for this yet — Inspector-only
            // toggle Unity-side, zero call sites in the app.
            Log.i("UnityAvatarModule", "setDebugMode($on) — Editor-only toggle for now, not wired to Unity.")
        }.runOnQueue(Queues.MAIN)

        // App lifecycle → Unity render loop pause/resume. The Android
        // equivalent of the AppDelegate overrides plugins/withUnityFramework.js
        // injects on iOS — here the Expo Modules DSL delivers the signals, so
        // no generated MainActivity/MainApplication patching is needed.
        OnActivityEntersForeground {
            UnityBridgeManager.onAppForeground()
        }

        OnActivityEntersBackground {
            UnityBridgeManager.onAppBackground()
        }

        OnActivityDestroys {
            UnityBridgeManager.onActivityDestroyed(appContext.currentActivity?.isFinishing == true)
        }

        View(UnityAvatarView::class) {
            // No props for v1 — the view just hosts Unity's FrameLayout
            // (parity with UnityAvatarView.swift).
        }
    }
}
