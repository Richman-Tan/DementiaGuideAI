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
 *   - AvatarAudioPayload: { audio, visemeTimeline, emotion, text } (WebView path)
 *   - CC4AudioPayload:    { audio, blendshapes, emotion, text }    (Unity path)
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
 * @typedef {Object} CC4AudioPayload
 * Used by the Unity renderer. Produced by blendshapeTranslator.segmentToCC4Payload().
 *
 * @property {string}               audio       - data:audio/mpeg;base64,... URI
 * @property {CC4BlendshapeFrame[]} blendshapes - CC4 blendshape timeline
 * @property {string}               emotion     - neutral|positive|warm|concern|question
 * @property {string}               [text]      - sentence text
 */

/**
 * @typedef {Object} CC4BlendshapeFrame
 * @property {number} time    - seconds from start of this audio segment
 * @property {Object} weights - map of CC4 blendshape name → value (0.0–1.0)
 *                              See VISEME_TO_CC4 in blendshapeTranslator.js for the
 *                              full list of valid shape names.
 */

export {};
