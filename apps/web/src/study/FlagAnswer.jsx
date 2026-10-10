// "Flag this answer" — the feedback round's way of saying "I don't agree with
// this", from the clinical lead's scenario list. Rendered under every answer in
// chat and in the voice transcript, and only while a feedback participant is
// using the app freely; everywhere else it is nothing.
import React, { useEffect, useRef, useState } from 'react';
import { useStudy } from './StudyContext.jsx';
import { Button, TextArea } from './ui.jsx';

export default function FlagAnswer({ answer, question = '', turnId = null, surface }) {
  const st = useStudy();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const formRef = useRef(null);

  // The form opens under the answer, which on a laptop screen is often below
  // the fold of the chat pane — bring it into view rather than leave it hidden.
  useEffect(() => {
    if (open) formRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
  }, [open]);

  if (!st?.exploring || !answer) return null;

  if (sent) {
    return (
      <p role="status" style={{ margin: 0, fontSize: '.85rem', color: 'var(--text2)' }}>
        Flagged — thank you.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ alignSelf: 'flex-start', minHeight: 44, padding: '0 .25rem', border: 'none', background: 'none', color: 'var(--text2)', fontSize: '.85rem', textDecoration: 'underline', cursor: 'pointer' }}
      >
        ⚑ Flag this answer
      </button>
    );
  }

  const send = () => {
    st.flagAnswer({ turnId, question, answer, comment: comment.trim(), surface });
    setSent(true);
  };

  return (
    <div
      ref={formRef}
      role="group"
      aria-label="Flag this answer"
      style={{ alignSelf: 'stretch', maxWidth: '34em', padding: '.85rem 1rem', borderRadius: 12, background: 'var(--surface)', border: 'var(--bw) solid var(--border)' }}
    >
      <p style={{ margin: '0 0 .5rem', fontSize: '.95rem', color: 'var(--text)' }}>
        What’s wrong with this answer? <span style={{ color: 'var(--text2)' }}>(optional)</span>
      </p>
      <TextArea value={comment} onChange={setComment} rows={3} label="What’s wrong with this answer?" />
      <p style={{ margin: '.5rem 0 .75rem', fontSize: '.85rem', color: 'var(--text2)', lineHeight: 1.5 }}>
        This sends the answer, the question you asked, and what you write here to the
        project team. Please don’t include names.
      </p>
      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <Button onClick={send} style={{ minHeight: 44 }}>Send flag</Button>
        <Button variant="quiet" onClick={() => setOpen(false)} style={{ minHeight: 44 }}>Cancel</Button>
      </div>
    </div>
  );
}
