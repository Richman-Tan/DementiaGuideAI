package expo.modules.unityavatar

import android.content.Context
import android.view.MotionEvent
import android.view.ViewGroup
import android.widget.FrameLayout
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * Native view hosting Unity's FrameLayout — the Android port of
 * ios/UnityAvatarView.swift (an ExpoView per the New Architecture requirement;
 * this app has newArchEnabled: true).
 *
 * Boots Unity lazily on first attach — whichever happens first between this
 * and UnityAvatarModule.initialize() wins, since UnityBridgeManager.start()
 * is idempotent.
 *
 * Unity's FrameLayout is a singleton: React may remount the screen and create
 * a new UnityAvatarView while the old one still holds it, so it is reparented
 * on every attach. Only one UnityAvatarView may be mounted at a time (already
 * true of the app — a single avatar screen).
 */
class UnityAvatarView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private var unityFrameLayout: FrameLayout? = null

    init {
        // Display-only avatar: Unity must never steal focus from RN's
        // TextInputs (the standard UaaL soft-input fight doesn't apply when
        // Unity's view can't gain focus at all).
        descendantFocusability = ViewGroup.FOCUS_BLOCK_DESCENDANTS
        embedUnityViewIfNeeded()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        embedUnityViewIfNeeded()
    }

    private fun embedUnityViewIfNeeded() {
        val activity = appContext.currentActivity ?: return
        val frameLayout = UnityBridgeManager.start(activity) ?: return

        if (frameLayout.parent === this) {
            return
        }
        (frameLayout.parent as? ViewGroup)?.removeView(frameLayout)
        addView(
            frameLayout,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        )
        unityFrameLayout = frameLayout
    }

    // Touch parity with iOS `isUserInteractionEnabled = false`: intercept every
    // event so Unity's SurfaceView never sees it, and don't consume it, so RN
    // controls layered over/around the avatar area stay tappable.
    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean = true

    override fun onTouchEvent(event: MotionEvent): Boolean = false
}
