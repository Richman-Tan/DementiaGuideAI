Questions we have tomorrow 

* Presentation format  
  * Who are we presenting to?  
  * Where and when is it happening?	  
* Report structure  
* Report format  
* What specifically does he want in the report

What we are presenting for him tomorrow: 

* Presentation for last 4 weeks on update.  
  * Demo what we did/\\research in each week. To show him.   
  * Add notes in here.   
  * Next week work ons   
    * Working on report and presentation  
    * As well any feedback  
* [https\://canva.link/xzjwv9qaht2h28n](https://canva.link/xzjwv9qaht2h28n)

* [Prompt Improvements](https://docs.google.com/document/d/1sjnxq3ySatfnEp5sEJQXq2z_YISsSEC5Xg50dh_ggLY/edit?usp=sharing)  
* [Answer Quality Test](https://docs.google.com/document/d/1sd5hF7_SoChSJeenGmuJgNoVbpsxL7nlg3azBh_gV_w/edit?usp=sharing) 

1: 

- Knowledge base: Cleaned/reformatted iSupport manual chunks in Supabase (stripped headers, title pages, irrelevant content).  
- Testing: Built a new evaluation method — AI answers scored by similarity against pre-written reference answers. Created and shared a reference test-case doc with Sarah/Gary for validation.

2:

- Feedback loop: Shared test doc with Sarah — feedback was answers lacked empathy.  
- Prompting: Began revising prompts for empathy; this broke some previously-passing automated tests, so started iterating on prompts and evaluation together.

3:

- Empathy rework, directly answering Sarah's feedback: replaced the one generic "be warm and empathetic" instruction with a question-aware empathy system — it classifies the question (carer burnout/guilt vs. safety-critical vs. dignity-sensitive) and gives the model a tailored empathy instruction, plus an explicit rule against sounding generic or "therapy-like." (I ran a live before/after comparison on this earlier this week — happy to pull that into a slide if useful.)  
- Answer structure tightened: enforced word count (80–140 words), and a required validate → practical guidance → "when to seek medical review" shape.  
- Built a full 3-mode accuracy evaluation framework: keyword-match, semantic-similarity (reference), and hybrid modes, run across 44–47 hand-written test questions. Key finding: keyword-mode pass rate is 97.9%, but semantic-mode pass rate is only 24% at the current threshold — meaning answers are topically/safety correct but phrased differently from the gold answers. Ran a threshold sensitivity sweep showing the current threshold (0.78) is likely too strict (there's no natural cutoff there). 