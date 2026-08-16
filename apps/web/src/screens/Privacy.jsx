import React from 'react';

export default function Privacy() {
  return (
    <section style={{ padding: '32px 0 48px', maxWidth: '680px' }}>
      <h1 style={{ fontSize: '1.9rem', margin: '0 0 18px' }}>Privacy Policy</h1>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>
        DementiaGuide AI is designed so that your information stays with you. We built it for people
        navigating a hard season of life, and we think privacy is part of good care.
      </p>
      <h2 style={{ fontSize: '1.3rem', margin: '26px 0 10px' }}>What stays on your device</h2>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>
        Your conversations with Aria, your setup choices, and your settings are stored only in this
        browser, on this device. Nothing is uploaded to our servers, and there are no accounts or
        sign-ins. Clearing your browser data, or using "Clear Conversation History" in Settings,
        removes it permanently.
      </p>
      <h2 style={{ fontSize: '1.3rem', margin: '26px 0 10px' }}>What we don't do</h2>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>
        We don't collect analytics about your questions, sell or share data, or use your
        conversations to train AI models. The library articles are the same for everyone — reading
        them reveals nothing about you to us.
      </p>
      <h2 style={{ fontSize: '1.3rem', margin: '26px 0 10px' }}>If you connect live services</h2>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>
        If a developer adds API keys under Settings → Advanced, questions are sent to those AI
        providers (such as OpenAI or ElevenLabs) to generate answers and speech. Keys are stored
        only in this browser. Without keys, the app runs entirely offline in demonstration mode.
      </p>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>
        If you use voice input, speech recognition may be performed by your browser. In Chrome and
        Edge this sends audio to the browser vendor's speech service to be transcribed; if that
        recognition isn't available, audio is transcribed by the connected AI provider instead.
      </p>
      <h2 style={{ fontSize: '1.3rem', margin: '26px 0 10px' }}>Questions</h2>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>
        This app is a University of Auckland Part IV Software Engineering project. Questions about
        privacy can be directed to the project team through the University.
      </p>
    </section>
  );
}
