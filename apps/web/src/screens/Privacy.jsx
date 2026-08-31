import React from 'react';

export default function Privacy() {
  return (
    <section style={{ padding: '32px 0 48px', maxWidth: '680px' }}>
      <h1 style={{ fontSize: '1.9rem', margin: '0 0 18px' }}>Privacy Policy</h1>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>DementiaGuide AI is built for people navigating a hard season of life, and we think privacy is part of good care. This page says plainly what is kept, where it is kept, and how to get rid of it.</p>

      <h2 style={{ fontSize: '1.3rem', margin: '26px 0 10px' }}>Your conversations</h2>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>Your conversations with Aria are saved to an account so that they are still here the next time you open the app, and a recent copy is kept in this browser so the app opens instantly. The account is created for you automatically and anonymously — there is no sign-up form, no email address, and no password unless you choose to add one. We do not know who you are.</p>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>If that account cannot be created — some browsers and privacy settings block it — the app still works, and your conversations are then kept only in this browser. Settings → Privacy &amp; Trust → Data Security always tells you which of the two is happening right now.</p>

      <h2 style={{ fontSize: '1.3rem', margin: '26px 0 10px' }}>Deleting them</h2>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>Settings → Clear Conversation History deletes every past conversation from the account and from this browser. That is a real deletion, not a hidden archive, and it cannot be undone. Clearing your browser data on its own only removes the local copy — use Clear Conversation History if you want the stored copy gone too.</p>

      <h2 style={{ fontSize: '1.3rem', margin: '26px 0 10px' }}>What stays on this device</h2>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>Your setup choices, accessibility settings and any API keys stay in this browser and are never uploaded.</p>

      <h2 style={{ fontSize: '1.3rem', margin: '26px 0 10px' }}>Who else sees your questions</h2>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>To answer you, your question and the library passages used to answer it are sent to an AI provider (OpenAI), and the answer may be sent to a speech provider (ElevenLabs) to be read aloud. Those providers process it under their own terms and may retain it briefly to detect abuse. If you use voice input, speech recognition may be done by your browser — in Chrome and Edge that sends audio to the browser vendor's speech service; where that is unavailable, audio is transcribed by the AI provider instead. No recording of your voice is kept by this app.</p>

      <h2 style={{ fontSize: '1.3rem', margin: '26px 0 10px' }}>What we don't do</h2>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>We don't collect analytics about your questions, sell or share your data, or use your conversations to train AI models. The library articles are the same for everyone — reading them reveals nothing about you to us.</p>

      <h2 style={{ fontSize: '1.3rem', margin: '26px 0 10px' }}>If you are taking part in the research study</h2>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>Study sessions record additional information, and what is recorded is set out in the participant information sheet and consent form you were given. That consent governs the session — this page does not replace it.</p>

      <h2 style={{ fontSize: '1.3rem', margin: '26px 0 10px' }}>Questions</h2>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>This app is a University of Auckland Part IV Software Engineering project. Questions about privacy can be directed to the project team through the University.</p>
    </section>
  );
}
