import React from 'react';

export default function Disclaimer() {
  return (
    <section style={{ padding: '32px 0 48px', maxWidth: '680px' }}>
      <h1 style={{ fontSize: '1.9rem', margin: '0 0 18px' }}>Medical Disclaimer</h1>
      <div style={{ background: 'var(--amber-bg)', border: 'var(--bw) solid var(--amber-bd)', borderRadius: '16px', padding: '18px 22px', marginBottom: '22px', lineHeight: '1.65' }}><strong>In an emergency, call 111.</strong> For urgent health advice any time of day or night, call <strong>Healthline on 0800 611 116</strong> — free from NZ landlines and mobiles.</div>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>DementiaGuide AI provides general information about dementia and dementia care. It is not a medical service, and Aria is not a doctor, nurse, or health professional.</p>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>Nothing in this app is a diagnosis, treatment recommendation, or substitute for professional advice. Every person with dementia is different — decisions about medication, care arrangements, driving, or safety should always involve a GP, specialist, or other qualified health professional who knows the person.</p>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>Aria's answers are grounded in a curated library of reviewed articles, and she shows her sources so you can check them. Even so, AI systems can make mistakes. If something Aria says seems wrong or doesn't fit your situation, trust your judgement and check with a professional.</p>
      <p style={{ lineHeight: '1.7', margin: '0 0 16px' }}>If you're worried about your own memory or someone else's, your GP is the right first step. Support is also available from Dementia New Zealand and Alzheimers NZ.</p>
    </section>
  );
}
