# Unity WebGL build slot

The Aaron and Ariana avatars (Reallusion CC characters) render through a Unity
WebGL build. This folder is the drop point — the web app probes
`/unity/Build/unity.loader.js` at runtime and unlocks the Unity avatars in
Settings when a build is present. Without one, the app falls back to the
Three.js avatars (Aria / Zhenja) automatically.

## Producing the build

1. Open `unity-avatar/UnityAvatarProject` in the Unity Editor (WebGL module
   installed).
2. Run **Tools → UaaL → Export WebGL (Builds/WebGL)** — this uses the same
   scenes as the mobile exports and disables WebGL compression so no special
   hosting headers are needed. `Builds/WebGL/export_result.json` records the
   outcome.
3. Run `npm run sync:unity` (from `web/`). It copies the export into
   `Build/`, renames the productName-based files to the `unity.*` contract
   (suffix chains like `.data.unityweb` are preserved), writes a
   `manifest.json` the loader reads, and fails if any file is ≥ 95 MB
   (Vercel's per-file limit).

4. Reload the web app — Settings → Avatar shows Aaron/Ariana enabled.

## Bridge protocol

Identical JSON to the mobile UaaL embed (`AvatarBridgeProtocol.js`), delivered
via `unityInstance.SendMessage('AvatarRouter', 'ReceiveBridgeMessage', json)`:

- `{ "type": "setCharacter", "id": "aaron" | "ariana" }`
- `{ "type": "play", "duration": s, "visemes": [{ "t", "d", "v", "w" }], … }`
- `{ "type": "stop" }`

Audio plays in the page (Web Audio); Unity renders blendshape timing only —
the same split as the mobile app.

## Known risk

Reallusion's shader tooling caps WebGL at URP 12, so CC4/CC5 HD character
materials may need manual downgrades before the characters look right in a
WebGL build. Validate visually before shipping.

Everything under `Build/` is git-ignored — builds are large, machine-produced
artifacts.
