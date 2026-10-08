#!/usr/bin/env bash
# End-to-end tests for the iOS app: Maestro on the iOS Simulator.
#
#   npm run test:e2e:ios                    # prebuild + build + run every flow
#   npm run test:e2e:ios -- --skip-build    # reuse the last build, run the flows
#   npm run test:e2e:ios -- --flow apps/mobile/.maestro/05-library.yaml
#
# What it does, in order:
#   1. `expo prebuild --platform ios` with EXPO_UNITY_AVATAR=0, so the config
#      plugin (plugins/withUnityFramework.js) leaves UnityFramework out. The
#      committed framework is a device-only arm64 slice and cannot be linked into
#      a Simulator binary; without it the app shows AvatarUnity's fallback card.
#   2. A Release build for the Simulator, with the JS bundle embedded, so the
#      tests never depend on a running Metro server. The Supabase config is set
#      to placeholders (.invalid never resolves): the app needs *a* URL to start,
#      and with a dead one the Library uses its bundled articles, so runs are
#      deterministic, offline-safe, and touch no real backend or credential.
#   3. Creates (once) and boots a dedicated Simulator, "DGAI-E2E" by default.
#      The flows wipe the Simulator keychain, so they must not run on a device
#      you use for anything else.
#   4. Installs the app and runs `maestro test apps/mobile/.maestro`.
#
# Reports land in apps/mobile/ios/build/e2e-results (JUnit + Maestro debug
# output). Everything under apps/mobile/ios/ is generated and git-ignored.
#
# Options:
#   --skip-prebuild   keep the existing apps/mobile/ios (still must be Unity-free)
#   --skip-build      reuse the .app from the last build (implies --skip-prebuild)
#   --flow <path>     run one flow (or a directory) instead of the whole suite
# Environment:
#   IOS_E2E_DEVICE_NAME   Simulator name to use or create   (default DGAI-E2E)
#   IOS_E2E_DEVICE_TYPE   device type for a new Simulator  (default iPhone 17 Pro)
#   IOS_E2E_RUNTIME       runtime id for a new Simulator   (default: newest iOS)

set -euo pipefail

MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$MOBILE_DIR/../.." && pwd)"
IOS_DIR="$MOBILE_DIR/ios"
DERIVED_DATA="$IOS_DIR/build/e2e"
RESULTS_DIR="$IOS_DIR/build/e2e-results"
APP_ID="com.anonymous.DementiaGuideAi"
APP_PATH="$DERIVED_DATA/Build/Products/Release-iphonesimulator/DementiaGuideAi.app"
FLOWS="$MOBILE_DIR/.maestro"

DEVICE_NAME="${IOS_E2E_DEVICE_NAME:-DGAI-E2E}"
DEVICE_TYPE="${IOS_E2E_DEVICE_TYPE:-iPhone 17 Pro}"

SKIP_PREBUILD=0
SKIP_BUILD=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-prebuild) SKIP_PREBUILD=1 ;;
    --skip-build) SKIP_BUILD=1; SKIP_PREBUILD=1 ;;
    --flow) FLOWS="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"; shift ;;
    -h|--help) sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

log() { printf '\n\033[1m[ios-e2e] %s\033[0m\n' "$*"; }
die() { printf '\n[ios-e2e] ERROR: %s\n' "$*" >&2; exit 1; }

# ── Preflight ────────────────────────────────────────────────────────────────
[[ "$(uname)" == "Darwin" ]] || die "iOS Simulator tests need macOS."
command -v xcodebuild >/dev/null || die "xcodebuild not found — install Xcode."
command -v pod >/dev/null || die "CocoaPods not found — brew install cocoapods."
export PATH="$PATH:$HOME/.maestro/bin"
command -v maestro >/dev/null || die 'Maestro not found — curl -fsSL "https://get.maestro.mobile.dev" | bash'
command -v java >/dev/null || die "Maestro needs a Java runtime (17+)."
[[ -d "$REPO_ROOT/node_modules" ]] || die "Run npm ci at the repo root first."

# Maestro phones home by default; nothing about these runs needs to leave the machine.
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
# Maestro drives the app through an XCTest runner it installs on the Simulator.
# On a freshly booted device that runner took ~2.5 minutes to come up, past
# Maestro's default wait; allow 5 (milliseconds; override from the environment).
export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-300000}"

SECONDS=0

# ── 1. Prebuild without Unity ────────────────────────────────────────────────
if [[ $SKIP_PREBUILD -eq 0 ]]; then
  CLEAN=""
  # An ios/ tree prebuilt WITH Unity keeps the UnityFramework pod in its
  # Podfile (prebuild edits existing files rather than regenerating them), and
  # that pod points at a directory the Unity-free prebuild deletes. Start over.
  if [[ -f "$IOS_DIR/Podfile" ]] && grep -q "unity-framework-pod" "$IOS_DIR/Podfile"; then
    log "apps/mobile/ios was prebuilt with Unity — regenerating it without (--clean)"
    CLEAN="--clean"
  fi
  log "expo prebuild --platform ios (EXPO_UNITY_AVATAR=0)"
  (cd "$MOBILE_DIR" && CI=1 EXPO_UNITY_AVATAR=0 npx expo prebuild --platform ios $CLEAN)
fi
if [[ -f "$IOS_DIR/Podfile" ]] && grep -q "unity-framework-pod" "$IOS_DIR/Podfile"; then
  die "apps/mobile/ios still links UnityFramework, which has no Simulator slice. Re-run without --skip-prebuild."
fi

# ── 2. Release build for the Simulator ───────────────────────────────────────
if [[ $SKIP_BUILD -eq 0 ]]; then
  log "xcodebuild Release (iphonesimulator) → $DERIVED_DATA"
  # IPHONEOS_DEPLOYMENT_TARGET: Xcode 27 refuses targets below iOS 15.0, and
  # some pods (RNCAsyncStorage's resource bundle) still declare 13.4. 15.1 is
  # the app's own minimum, so raising stragglers to it changes nothing at runtime.
  (cd "$IOS_DIR" && \
    EXPO_PUBLIC_SUPABASE_URL="https://e2e-offline.invalid" \
    EXPO_PUBLIC_SUPABASE_ANON_KEY="e2e-placeholder-anon-key" \
    xcodebuild \
      -workspace DementiaGuideAi.xcworkspace \
      -scheme DementiaGuideAi \
      -configuration Release \
      -sdk iphonesimulator \
      -destination 'generic/platform=iOS Simulator' \
      -derivedDataPath "$DERIVED_DATA" \
      ARCHS="$(uname -m)" ONLY_ACTIVE_ARCH=YES \
      IPHONEOS_DEPLOYMENT_TARGET=15.1 \
      -quiet \
      build)
fi
[[ -d "$APP_PATH" ]] || die "No app at $APP_PATH — run without --skip-build."
BUILD_SECONDS=$SECONDS

# ── 3. Dedicated Simulator ───────────────────────────────────────────────────
UDID="$(xcrun simctl list devices available -j | python3 -c "
import json, sys
name = sys.argv[1]
for runtime, devices in json.load(sys.stdin)['devices'].items():
    for d in devices:
        if d['name'] == name and d.get('isAvailable', True):
            print(d['udid']); sys.exit(0)
" "$DEVICE_NAME")"
if [[ -z "$UDID" ]]; then
  RUNTIME="${IOS_E2E_RUNTIME:-$(xcrun simctl list runtimes -j | python3 -c "
import json, sys
ios = [r for r in json.load(sys.stdin)['runtimes'] if r['platform'] == 'iOS' and r['isAvailable']]
print(sorted(ios, key=lambda r: [int(x) for x in r['version'].split('.')])[-1]['identifier'] if ios else '')
")}"
  [[ -n "$RUNTIME" ]] || die "No iOS Simulator runtime installed (Xcode → Settings → Components)."
  log "Creating Simulator \"$DEVICE_NAME\" ($DEVICE_TYPE, $RUNTIME)"
  UDID="$(xcrun simctl create "$DEVICE_NAME" "$DEVICE_TYPE" "$RUNTIME")"
fi
log "Booting $DEVICE_NAME ($UDID)"
xcrun simctl boot "$UDID" 2>/dev/null || true   # already booted is fine
xcrun simctl bootstatus "$UDID" -b >/dev/null

# Nothing may be audible on the Mac, and a Simulator plays its sounds through
# the Mac's speakers. Turn off keyboard clicks on the SIMULATED iPhone (its own
# Settings → Sounds & Haptics → Keyboard Feedback; the keys UIKit reads), since
# Maestro types through the iOS keyboard. The Mac's own audio settings are
# never touched. Aria's voice is switched off inside the app by every flow
# (apps/mobile/.maestro/subflows/audio-off.yaml).
xcrun simctl spawn "$UDID" defaults write com.apple.preferences.sounds keyboard-audio -bool false
xcrun simctl spawn "$UDID" defaults write com.apple.preferences.sounds keyboard -bool false

# ── 4. Install and run the flows ─────────────────────────────────────────────
log "Installing $APP_ID"
xcrun simctl install "$UDID" "$APP_PATH"

# If Maestro dies before its driver is up (e.g. the startup timeout), it can
# leave that driver's `xcodebuild test-without-building` running against the
# Simulator, and the next run's driver is then killed a few seconds into every
# flow. Stop any driver aimed at THIS device before starting, and after.
stop_stale_drivers() {
  pkill -f "xcodebuild test-without-building.*id=$UDID" 2>/dev/null || true
}
stop_stale_drivers
trap stop_stale_drivers EXIT

rm -rf "$RESULTS_DIR" && mkdir -p "$RESULTS_DIR"
log "maestro test ${FLOWS#"$REPO_ROOT"/}"
set +e
maestro --device "$UDID" test "$FLOWS" \
  --format junit --output "$RESULTS_DIR/report.xml" \
  --test-output-dir "$RESULTS_DIR/artifacts" \
  --debug-output "$RESULTS_DIR/debug"
STATUS=$?
set -e

log "Prebuild + build: ${BUILD_SECONDS}s · flows: $((SECONDS - BUILD_SECONDS))s · total: ${SECONDS}s · JUnit: ${RESULTS_DIR#"$REPO_ROOT"/}/report.xml"
exit $STATUS
