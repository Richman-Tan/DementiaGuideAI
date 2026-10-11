// E9-A (docs/eval/evaluation-plan.md §18.3): Apple's speech recogniser,
// ON-DEVICE ONLY, over local audio files. Built and driven by
// scripts/eval/stt/transcribe-apple.mjs — do not run it on DementiaBank audio
// with any setting that could reach a server.
//
// Data governance (why the guards below exist): DementiaBank audio may only
// be processed by services covered by the 2026-09-19 sign-off (OpenAI's
// transcription endpoint). Apple's server recogniser is not covered, so:
//   * every request sets requiresOnDeviceRecognition = true — Apple documents
//     that such a request does not send audio over the network, and fails
//     instead of falling back to the server;
//   * the tool refuses to start unless the recogniser reports
//     supportsOnDeviceRecognition for the locale;
//   * audio is read from files (SFSpeechURLRecognitionRequest); nothing is
//     ever played or captured from a microphone.
//
// Usage: apple-ondevice-stt --locale en-NZ --list <file of absolute wav paths>
// Output: JSON lines on stdout — first {"meta":…}, then one object per file:
//   {"path":…, "text":…, "ms":…, "noSpeech":bool, "error":null|"…", "domain":…, "code":…}
import Foundation
import Speech

setvbuf(stdout, nil, _IONBF, 0)

func emit(_ obj: [String: Any]) {
  if let d = try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys]),
     let s = String(data: d, encoding: .utf8) { print(s) }
}
func fail(_ msg: String) -> Never {
  FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
  exit(2)
}

var localeId = "en-NZ"
var listPath: String? = nil
var args = CommandLine.arguments.dropFirst().makeIterator()
while let a = args.next() {
  switch a {
  case "--locale": localeId = args.next() ?? localeId
  case "--list": listPath = args.next()
  default: fail("unknown argument \(a)")
  }
}
guard let listPath else { fail("--list <file> required") }
guard let listText = try? String(contentsOfFile: listPath, encoding: .utf8) else { fail("cannot read \(listPath)") }
let paths = listText.split(separator: "\n").map(String.init).filter { !$0.isEmpty }

// Authorisation (TCC). No prompt is shown when it is already granted.
let authSem = DispatchSemaphore(value: 0)
var auth: SFSpeechRecognizerAuthorizationStatus = .notDetermined
SFSpeechRecognizer.requestAuthorization { s in auth = s; authSem.signal() }
if authSem.wait(timeout: .now() + 60) == .timedOut { fail("speech-recognition authorisation timed out") }
guard auth == .authorized else { fail("speech recognition not authorised (status \(auth.rawValue))") }

guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeId)) else { fail("no recogniser for \(localeId)") }
guard recognizer.supportsOnDeviceRecognition else { fail("on-device recognition NOT supported for \(localeId) — refusing to run (server recognition is not permitted for this data)") }
recognizer.defaultTaskHint = .unspecified

let os = ProcessInfo.processInfo.operatingSystemVersionString
emit(["meta": ["locale": localeId, "supportsOnDeviceRecognition": true, "requiresOnDeviceRecognition": true,
               "os": os, "files": paths.count, "tool": "apple-ondevice-stt 1"]])

for path in paths {
  let url = URL(fileURLWithPath: path)
  let req = SFSpeechURLRecognitionRequest(url: url)
  req.requiresOnDeviceRecognition = true   // never the server
  req.shouldReportPartialResults = false   // only the final transcript is scored
  req.addsPunctuation = false              // the app's default (expo-speech-recognition)
  req.taskHint = .unspecified
  var finished = false
  var out: [String: Any] = ["path": path]
  let t0 = Date()
  let task = recognizer.recognitionTask(with: req) { result, error in
    if finished { return }
    if let e = error as NSError? {
      finished = true
      out["ms"] = Int(Date().timeIntervalSince(t0) * 1000)
      // kAFAssistantErrorDomain 1110 = "No speech detected": the app would get
      // an empty transcript, so it is scored as an empty hypothesis.
      if e.code == 1110 { out["text"] = ""; out["noSpeech"] = true; out["error"] = NSNull() }
      else { out["text"] = ""; out["noSpeech"] = false; out["error"] = e.localizedDescription }
      out["domain"] = e.domain; out["code"] = e.code
      return
    }
    if let r = result, r.isFinal {
      finished = true
      out["ms"] = Int(Date().timeIntervalSince(t0) * 1000)
      out["text"] = r.bestTranscription.formattedString
      out["noSpeech"] = false
      out["error"] = NSNull()
    }
  }
  let deadline = Date().addingTimeInterval(180)
  while !finished && Date() < deadline {
    RunLoop.current.run(until: Date().addingTimeInterval(0.02))
  }
  if !finished {
    task.cancel()
    out["text"] = ""; out["noSpeech"] = false; out["error"] = "timeout after 180 s"
    out["ms"] = Int(Date().timeIntervalSince(t0) * 1000)
  }
  emit(out)
}
