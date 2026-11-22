// What the user is told when the microphone path fails. Kept pure so the
// mapping is testable: the copy has to carry its own way out (the typed message
// bar is always there), because the person reading it cannot be expected to
// debug a browser.
export function sttErrorPresentation(err) {
  if (err?.code === 'permission-denied') {
    return {
      copy:
        'Your microphone was blocked. You can allow it from the padlock icon ' +
        'in the address bar — or type your question below instead.',
    };
  }
  return {
    copy:
      'Something went wrong with the microphone. Tap the mic to try again, ' +
      'or type your question below.',
  };
}
