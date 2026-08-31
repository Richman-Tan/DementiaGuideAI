package expo.modules.unityavatar

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.FrameLayout
import com.unity3d.player.IUnityPlayerLifecycleEvents
import com.unity3d.player.UnityPlayer
import com.unity3d.player.UnityPlayerForActivityOrService

/**
 * Lazily boots the embedded Unity player and owns the singleton instance —
 * the Android port of ios/UnityBridgeManager.swift. Deliberately NOT started
 * from MainApplication/MainActivity: Unity only boots on the first call from
 * JS (via UnityAvatarModule.initialize()) or on first UnityAvatarView attach,
 * so app startup stays fast for users who never open the avatar screen.
 *
 * Unlike iOS (which needs AppDelegate mods via the config plugin), lifecycle
 * arrives through the Expo Modules DSL hooks in UnityAvatarModule.kt — no
 * generated-source patching on Android.
 */
object UnityBridgeManager : IUnityPlayerLifecycleEvents {
    private const val TAG = "UnityBridgeManager"

    var isStarted = false
        private set

    // Unity 6 player surface. If a Unity upgrade changes this class, re-check
    // with: unzip -p android-export/unityLibrary/libs/unity-classes.jar | javap
    private var player: UnityPlayerForActivityOrService? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    /**
     * Boots Unity if it hasn't been already. Safe to call repeatedly. Must run
     * on the main thread. Returns the FrameLayout Unity renders into, for
     * UnityAvatarView to embed.
     *
     * The player MUST be constructed with the Activity, not the application
     * context — UnityPlayer resolves its window/surface/input from it, and
     * app-context construction is the classic embedded-black-screen cause.
     */
    fun start(activity: Activity): FrameLayout? {
        if (isStarted) {
            return player?.frameLayout
        }

        val newPlayer = try {
            UnityPlayerForActivityOrService(activity, this)
        } catch (e: Throwable) {
            // UnsatisfiedLinkError (missing arm64 .so) or missing class — is
            // the unityLibrary module present and the APK single-ABI arm64?
            Log.e(TAG, "Failed to construct UnityPlayer — Unity avatar disabled.", e)
            return null
        }
        player = newPlayer

        // Our Activity's real window focus belongs to React Native, so Unity
        // never sees a focus-gain event and would keep its render loop paused.
        // Tell the player to run without focus AND synthesize a focus-gain
        // (the Android analog of the iOS key-window restore hack in
        // UnityBridgeManager.swift).
        newPlayer.setRunWithoutFocus(true)
        newPlayer.resume()
        newPlayer.windowFocusChanged(true)

        isStarted = true
        return newPlayer.frameLayout
    }

    // ── App lifecycle forwarding ─────────────────────────────────────────────
    // Called from UnityAvatarModule's OnActivityEntersForeground/Background and
    // OnActivityDestroys DSL hooks. No-ops if Unity was never started, which is
    // the common case for users who never open the avatar screen.

    fun onAppForeground() {
        player?.resume()
        player?.windowFocusChanged(true)
    }

    fun onAppBackground() {
        player?.pause()
    }

    /**
     * Tears Unity down only when the Activity is genuinely finishing (back
     * button / task removal), not on configuration-change destroys. NEVER call
     * player.quit(): Unity's quit path kills the entire Android process, taking
     * the React Native app with it — the top UaaL-Android footgun.
     */
    fun onActivityDestroyed(isFinishing: Boolean) {
        if (!isFinishing) return
        player?.destroy()
        player = null
        isStarted = false
    }

    /**
     * Forwards a JSON message to a GameObject in the running Unity scene.
     * `AvatarRouter` is the single bridge target: it handles `setCharacter`
     * itself and forwards every other message (play/stop) to the active
     * character's NativeBridgeReceiver (see
     * unity-avatar/UnityAvatarProject/Assets/Scripts/AvatarRouter.cs).
     */
    fun sendMessage(json: String, goName: String = "AvatarRouter", methodName: String = "ReceiveBridgeMessage") {
        if (!isStarted) {
            Log.w(TAG, "sendMessage called before start() — dropping message.")
            return
        }
        UnityPlayer.UnitySendMessage(goName, methodName, json)
    }

    // ── Character selection ──────────────────────────────────────────────────
    // UnitySendMessage silently drops messages sent between player construction
    // and the first scene load, and there is no ready-handshake from Unity.
    // Converge idempotently instead — same scheme and delays as the Swift
    // manager: immediate send, delayed retries over the boot window, and a
    // re-send before every play via ensureCharacter().

    private var desiredCharacterId: String? = null
    private var characterSendGeneration = 0

    /**
     * Records the character the app wants active and pushes it to Unity.
     * Safe to call before Unity boots — the selection is stored and re-sent
     * by ensureCharacter() on the next play.
     */
    fun setCharacter(id: String) {
        desiredCharacterId = id
        characterSendGeneration += 1
        val generation = characterSendGeneration
        sendSetCharacter(id)
        for (delayMs in longArrayOf(1500L, 4000L)) {
            mainHandler.postDelayed({
                if (characterSendGeneration == generation) {
                    sendSetCharacter(id)
                }
            }, delayMs)
        }
    }

    /**
     * Re-sends the stored selection (no-op when none). Called before every
     * play message so the utterance always lands on the intended character.
     */
    fun ensureCharacter() {
        desiredCharacterId?.let { sendSetCharacter(it) }
    }

    private fun sendSetCharacter(id: String) {
        if (!isStarted) return
        sendMessage("{\"type\":\"setCharacter\",\"id\":\"$id\"}")
    }

    // ── Conversational state ─────────────────────────────────────────────────
    // Drives IdleAnimator's six-way blend (listening nod, brow raises, thinking
    // gaze aversion, head tilts). Same converge-idempotently approach as
    // setCharacter, and deliberately does NOT boot Unity: a state change alone
    // shouldn't change the lazy-boot timing that keeps app startup fast. State
    // sent before boot is stored and replayed by ensureState() on the next play,
    // and nothing is visible before Unity is up anyway.

    private var desiredState: String? = null

    fun setAvatarState(state: String) {
        desiredState = state
        if (!isStarted) return
        sendMessage("{\"type\":\"setState\",\"state\":\"$state\"}")
    }

    /**
     * Re-sends the stored state (no-op when none). Called before every play
     * message, so a state set during the pre-boot window still lands.
     */
    fun ensureState() {
        val state = desiredState ?: return
        if (!isStarted) return
        sendMessage("{\"type\":\"setState\",\"state\":\"$state\"}")
    }

    // ── IUnityPlayerLifecycleEvents ──────────────────────────────────────────
    // No-ops for v1 — this app never unloads Unity mid-session (parity with
    // the UnityFrameworkListener extension in the Swift manager).

    override fun onUnityPlayerUnloaded() {
        isStarted = false
    }

    override fun onUnityPlayerQuitted() {
        Log.w(TAG, "onUnityPlayerQuitted — Unity requested quit (unexpected; nothing in the app triggers this).")
    }
}
