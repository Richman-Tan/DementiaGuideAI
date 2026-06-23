/**
 * AvatarBridgeProtocol
 *
 * The contract that all avatar renderer implementations must satisfy.
 * Both AvatarVRM (Three.js/WebView) and AvatarUnity (Unity as a Library)
 * expose this interface via React.forwardRef + useImperativeHandle.
 *
 * Usage:
 *   const avatarRef = useRef(null);
 *   // avatarRef.current conforms to AvatarBridgeRef after mount
 *   await avatarRef.current.playAudio(segment);
 *
 * @typedef {Object} AvatarBridgeRef
 *
 * @property {function(payload: string|AvatarAudioPayload): Promise<void>} playAudio
 *   Play an audio segment with lip-sync animation.
 *   - string: data URI (legacy / OpenAI RMS fallback)
 *   - AvatarAudioPayload: { audio, visemeTimeline, emotion, text }
 *   Resolves when the audio segment finishes playing.
 *
 * @property {function(): void} stopAudio
 *   Immediately stop all audio playback and lip-sync.
 *
 * @property {function(cb: function): void} setOnAudioStart
 *   Register a one-shot callback fired when audio actually begins.
 *
 * @property {function(on: boolean): void} setDebugMode
 *   Toggle the renderer's debug overlay (viseme weights, timing, etc.).
 */

/**
 * @typedef {Object} AvatarAudioPayload
 * @property {string}      audio          - data:audio/mpeg;base64,... URI
 * @property {Object|null} visemeTimeline - { frames, totalDuration } or null for RMS fallback
 * @property {string}      [emotion]      - neutral|positive|warm|concern|question
 * @property {string}      [text]         - sentence text (for subtitles)
 */

/**
 * @typedef {Object} ArkitAudioPayload
 * Used by the Unity renderer. Produced by blendshapeTranslator.segmentToArkitPayload().
 *
 * @property {string}                  audio       - data:audio/mpeg;base64,... URI
 * @property {ArkitBlendshapeFrame[]}  blendshapes - ARKit 52 timeline
 * @property {string}                  emotion     - neutral|positive|warm|concern|question
 * @property {string}                  [text]      - sentence text
 */

/**
 * @typedef {Object} ArkitBlendshapeFrame
 * @property {number} time    - seconds from start of this audio segment
 * @property {Object} weights - map of ARKit blendshape name → value (0.0–1.0)
 */

export {};
