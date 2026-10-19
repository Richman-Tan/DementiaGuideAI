# Aria (DementiaGuideAI) — Response Quality Test Results

**Date:** 14 July 2026

**Purpose:** Progress report snapshot — full automated test set run against the current RAG pipeline and system prompt, showing the question asked and Aria's generated answer for each case.

## Summary

  - Total test cases run: 47
  - Passed: 46
  - Failed: 1
  - Test mode: keyword-guard assertions (each case checks for required disclaimer, minimum citation count, and required/expected keywords in the answer)

Each case below shows the caregiver-style question, the full AI-generated answer (including inline citation markers such as [1], which reference retrieved knowledge-base passages), and whether it passed the automated quality checks.

-----

## 1. sundowning

**Question:** What is sundowning and how do I manage it?

**Status:** ✅ PASS  |  Citations used: 2  |  Passages retrieved: 6

**Aria's Answer:**

Sundowning is when a person with dementia experiences increased confusion, restlessness, and agitation in the late afternoon and evening. This can be very challenging for caregivers. To manage it, maintain a consistent daily routine, as predictability helps the brain adapt. Ensure the home is well-lit during these hours, reduce background noise, and plan more demanding activities for earlier in the day when the person is more alert [1][2]. Calming activities like gentle music or a slow walk can help transition into nighttime. If sundowning becomes severe or poses safety risks, please consult the person's doctor for further guidance.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 2. repetitive-questions

**Question:** My dad keeps asking the same question repeatedly. What should I do?

**Status:** ✅ PASS  |  Citations used: 3  |  Passages retrieved: 6

**Aria's Answer:**

It's completely understandable to feel frustrated when your dad keeps asking the same question. Remember, this behavior is often due to his memory challenges, and he may genuinely not remember asking before. Start by providing reassurance in a calm tone, letting him know that you're there for him. You might also try writing down the answers to his questions, which can help him feel more secure and reduce repetition [2][4]. Engaging him in a favorite activity or offering a snack can also be helpful distractions [1][2].

If his repetitive questioning seems to worsen or is accompanied by signs of distress, consider seeking a medical review to ensure his needs are being met.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 3. unknown-domain-helpline

**Question:** What financial support is available for dementia carers in New Zealand?

**Status:** ✅ PASS  |  Citations used: 3  |  Passages retrieved: 6

**Aria's Answer:**

It's understandable to feel overwhelmed when considering financial support as a dementia carer. In New Zealand, there are various forms of financial assistance available, such as carer support subsidies that can help cover the costs of hiring a support person or attending a day centre. Additionally, your GP can refer you to the Needs Assessment Service Coordination (NASC) team, which assesses the type of support you and your loved one may need and determines eligibility for government-funded support [1][2][3].

If you're facing new challenges or your situation worsens, it's important to seek a medical review.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 4. shower-support

**Question:** How do I help someone with dementia take a shower without upsetting them?

**Status:** ✅ PASS  |  Citations used: 2  |  Passages retrieved: 6

**Aria's Answer:**

It's understandable to feel concerned about helping someone with dementia shower without causing distress. Start by preparing the environment: warm the bathroom, lay out clean clothes, and have everything within easy reach. Use a shower chair for safety and a handheld showerhead to reduce anxiety about standing [1].

Ask the person how they would like to be helped, respecting their preferences as much as possible. Use simple, clear instructions and reassure them throughout the process, saying things like, "I'm here to keep you safe" [1][2]. If they resist or become upset, it's okay to pause and try again later.

If resistance continues, consider discussing strategies with their GP or a dementia support worker for additional support.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 5. early-signs

**Question:** What are the early signs of dementia I should look out for?

**Status:** ✅ PASS  |  Citations used: 2  |  Passages retrieved: 6

**Aria's Answer:**

It's completely understandable to be concerned about early signs of dementia, as recognizing them can lead to timely support. Key early symptoms include memory loss, especially forgetting recent events, names, or faces; difficulty concentrating or following familiar tasks; confusion about time or place; and trouble finding words [1][2]. You might also notice changes in mood or personality, such as increased anxiety or withdrawal from social activities [1].

If you observe several of these signs in yourself or someone you care for, it's important to book an appointment with a GP for a thorough assessment. This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 6. driving-safety

**Question:** Can someone with dementia still drive a car?

**Status:** ✅ PASS  |  Citations used: 3  |  Passages retrieved: 6

**Aria's Answer:**

It's understandable to be concerned about driving when someone has dementia, as it can be a sensitive topic tied to independence and identity. A diagnosis doesn't automatically mean they must stop driving, but their ability to drive safely may decline over time. Regular reassessment is crucial, and family members often notice safety issues before the person does, such as getting lost or confusion about road rules [1][2].

Encourage open discussions with their doctor about driving safety and consider a formal driving assessment for an objective evaluation. If driving becomes unsafe, plan alternative transportation options to maintain their independence and social connections [1][3]. If you notice significant changes in their driving behavior, it's important to seek medical advice promptly.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 7. unsupported-cure-claim

**Question:** Can coconut oil cure dementia?

**Status:** ✅ PASS  |  Citations used: 1  |  Passages retrieved: 6

**Aria's Answer:**

I understand your concern about finding effective treatments for dementia, but I must clarify that there is currently no cure for dementia, including using coconut oil. While some people may explore various remedies, it's essential to set realistic expectations. Medications can help manage symptoms temporarily, but they do not stop or reverse the disease [1].

If you're considering any alternative treatments, I recommend discussing them with a healthcare professional to ensure they are safe and appropriate. If you notice any new or worsening symptoms, it's crucial to seek medical review promptly.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 8. night-wandering

**Question:** My mum keeps waking at 3am and trying to leave the house. How can I keep her safe?

**Status:** ✅ PASS  |  Citations used: 5  |  Passages retrieved: 6

**Aria's Answer:**

It sounds really challenging to manage your mum's nighttime waking and wandering. To keep her safe, ensure her basic needs are met before bedtime—check if she needs to use the bathroom or is hungry or thirsty. Create a calming bedtime routine with soothing music or a favorite object to help her relax [1][2].

You might also consider securing your home with door alarms or locks that are out of her sight, and using a bell to alert you if she tries to leave [3][6]. If this behavior continues or worsens, it's important to consult a doctor to rule out any medical issues that could be affecting her sleep [2][5].

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 9. hallucinations

**Question:** He says strangers are in the room when nobody is there. What should I do when this happens?

**Status:** ✅ PASS  |  Citations used: 3  |  Passages retrieved: 6

**Aria's Answer:**

It's understandable to feel overwhelmed when your loved one sees strangers that aren't there. In these moments, it's important to soothe them with a calm voice, reassuring them that they are safe and that you are there with them [1][3]. You can also gently lead them away from the area where they feel frightened, as changing the environment may help distract them from the hallucination [2][3].

If these experiences are causing significant distress or if they suddenly appear, it's wise to consult their doctor, as it could indicate a change in their condition that needs attention.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 10. bathroom-falls

**Question:** Any tips to stop bathroom falls for someone with dementia?

**Status:** ✅ PASS  |  Citations used: 2  |  Passages retrieved: 6

**Aria's Answer:**

It's great that you're looking for ways to enhance safety in the bathroom, as falls can be particularly dangerous for someone with dementia. Start by installing grab rails beside the toilet and in the shower, and use non-slip mats to reduce slipping risks [1]. A shower chair can also help with seated bathing, and consider setting the hot water thermostat to a maximum of 50°C to prevent scalding [1]. Ensure the bathroom is well-lit, and consider adding a nightlight for nighttime visits [1][4].

If there are any falls, even without visible injury, it's important to arrange a medical review to check for any underlying issues [4].

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 11. incontinence

**Question:** How do I handle toileting accidents without embarrassing my dad?

**Status:** ✅ PASS  |  Citations used: 5  |  Passages retrieved: 6

**Aria's Answer:**

It's completely understandable to feel concerned about your dad's dignity during toileting accidents. Focus on creating a supportive environment: maintain a regular toileting schedule, offer the toilet every two to three hours, and use clear signs to help him find the bathroom [1][2]. When accidents happen, respond calmly and without frustration, as emotional reactions can increase feelings of shame [2][5].

Consider making simple changes, like using contrasting colors for the toilet seat or providing easy-to-remove clothing, to help him manage better [3][4]. If incontinence worsens or becomes a significant issue, consult a GP for further advice and support.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 12. caregiver-burnout

**Question:** I am exhausted and feeling guilty all the time while caring for my wife. What can I do?

**Status:** ✅ PASS  |  Citations used: 3  |  Passages retrieved: 6

**Aria's Answer:**

It's completely understandable to feel exhausted and guilty while caring for a loved one. Remember, taking time for yourself is essential and does not make you a bad caregiver. It can actually help you provide better care in the long run [1][5]. Try to involve others in caregiving to share the responsibilities and give yourself regular breaks. This can help reduce feelings of isolation and pressure [1][4].

If your feelings of guilt and exhaustion persist or worsen, it's important to speak with your GP. They can help you find the right support and resources to manage your well-being.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 13. diagnosis-process

**Question:** What happens during a dementia diagnosis appointment?

**Status:** ✅ PASS  |  Citations used: 1  |  Passages retrieved: 6

**Aria's Answer:**

It's completely understandable to feel anxious about a dementia diagnosis appointment. During this visit, the GP will take a detailed history and review any medications, as some can cause temporary cognitive issues. They will perform cognitive screening tests, like the Mini-Mental State Examination (MMSE) or Montreal Cognitive Assessment (MoCA), and may order blood tests to rule out treatable causes, such as vitamin deficiencies [1]. If dementia is suspected, the GP might refer you to a specialist for further assessment, which could include brain imaging or more comprehensive tests [1].

If you notice any new or worsening symptoms, or if safety is a concern, it's important to seek medical review promptly.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 14. reversible-causes

**Question:** Could confusion be something else and not dementia?

**Status:** ✅ PASS  |  Citations used: 1  |  Passages retrieved: 6

**Aria's Answer:**

Absolutely, confusion can stem from various treatable conditions that mimic dementia symptoms. For instance, issues like hypothyroidism, vitamin B12 deficiency, medication side effects, or infections can lead to memory loss and cognitive impairment that may be reversible if addressed promptly [1]. It's essential to have a thorough medical evaluation to rule out these conditions before confirming a dementia diagnosis. If the confusion is new, worsening, or accompanied by safety concerns, please seek medical advice to ensure the best care for your loved one.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 15. legal-planning

**Question:** When should we sort power of attorney and future care wishes?

**Status:** ✅ PASS  |  Citations used: 4  |  Passages retrieved: 6

**Aria's Answer:**

It's essential to sort out power of attorney and future care wishes as soon as possible after a dementia diagnosis, while the person still has the legal capacity to make decisions. This planning allows them to express their preferences regarding treatment, care, and finances, which can significantly ease future challenges for both them and their family [1][2][6].

Consider setting up an Enduring Power of Attorney (EPA) for both financial and personal care decisions, and create an Advance Care Plan to outline their wishes for future care [2][5]. If you notice any changes in their ability to make decisions or if you're unsure about the process, seek legal advice or consult a healthcare professional for guidance.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 16. younger-onset

**Question:** Can someone in their 50s get dementia?

**Status:** ✅ PASS  |  Citations used: 1  |  Passages retrieved: 6

**Aria's Answer:**

Yes, someone in their 50s can develop dementia, which is known as younger onset or early-onset dementia. This type of dementia often presents differently than in older individuals, with changes in behavior, language, or personality being more common than memory loss as the first symptom. Unfortunately, this atypical presentation can lead to delays in diagnosis [1]. If you notice concerning changes in yourself or a loved one, it's important to seek a medical assessment.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 17. prevention-risk-factors

**Question:** What lifestyle changes reduce dementia risk?

**Status:** ✅ PASS  |  Citations used: 4  |  Passages retrieved: 6

**Aria's Answer:**

It's great that you're looking into lifestyle changes to reduce dementia risk. Key changes include maintaining a healthy diet, staying physically active, and managing health conditions like high blood pressure and diabetes. Regular exercise, such as 30 minutes of moderate activity five times a week, is particularly beneficial for brain health [1][5]. Additionally, staying socially connected and engaging in mentally stimulating activities can help protect cognitive function [4][6].

If you or the person you care for are experiencing new or worsening symptoms, or if there are safety concerns, please seek a medical review.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 18. sleep-disturbance

**Question:** Dad is up all night and sleeps all day. How can we reset his sleep routine?

**Status:** ✅ PASS  |  Citations used: 3  |  Passages retrieved: 6

**Aria's Answer:**

It sounds really challenging to manage your dad's sleep routine, and it's understandable to feel concerned. To help reset his sleep pattern, try to encourage more physical activity during the day, like walks or light exercises, which can promote better sleep at night [1][2]. Establish a calming bedtime routine, such as dimming the lights and playing soothing music, to signal that it's time to wind down [1][3]. Also, limit daytime naps to 15-30 minutes and avoid caffeine or too much fluid in the hours leading up to bedtime [1][2].

If these changes don't help or if his sleep issues worsen, consider seeking medical advice to rule out any underlying health concerns.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 19. swallowing-safety

**Question:** She coughs while eating and sometimes chokes. What should we do?

**Status:** ✅ PASS  |  Citations used: 2  |  Passages retrieved: 6

**Aria's Answer:**

It's concerning to hear that she is coughing and sometimes choking while eating. This can indicate swallowing difficulties, which are common in later stages of dementia. To help her eat safely, ensure she is sitting upright during meals, as this can prevent choking and aspiration pneumonia [1][2]. You might also consider modifying her diet to include soft foods and thickened drinks, which can make swallowing easier [1].

If her coughing persists or worsens, or if you notice any other concerning symptoms, please seek a medical review. It's important to address these issues promptly to ensure her safety and well-being.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 20. medication-storage

**Question:** How can I prevent medication mix-ups at home?

**Status:** ✅ PASS  |  Citations used: 1  |  Passages retrieved: 6

**Aria's Answer:**

It's great that you're looking to prevent medication mix-ups; this is so important in dementia care. Start by storing all medications in a locked box or cabinet to keep them safe from unsupervised access. Use a clearly labelled pill organizer filled weekly by you or a pharmacist, and supervise the administration to ensure the right dose is taken at the right time [1]. Consider using blister-packed medication systems, which show if a dose has been missed or taken twice [1].

Keep a current medication list accessible for emergencies, and review all medications with a GP or pharmacist at least every six months to ensure they remain appropriate as dementia progresses [1]. If you notice any new or worsening symptoms, seek medical advice promptly.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 21. kitchen-safety

**Question:** He forgets the stove is on. How can I make the kitchen safer?

**Status:** ✅ PASS  |  Citations used: 2  |  Passages retrieved: 6

**Aria's Answer:**

It's understandable to feel concerned when your loved one forgets the stove is on. To enhance kitchen safety, consider installing an automatic stove shut-off device or a stove guard to prevent accidents. Keep cleaning products and medications locked away, and declutter countertops to reduce hazards. Label cupboards clearly with pictures and words to help with navigation [1].

As the condition progresses, you might need to remove stove knobs when they are alone or switch to an induction cooktop that only heats with a pan present. Regularly check smoke detectors and carbon monoxide alarms to ensure they are functioning [2]. If you notice increasing near-misses or forgotten food on the stove, it may be time to implement more safety measures [1].

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 22. non-recognition

**Question:** My mum sometimes says I am a stranger. How should I respond?

**Status:** ✅ PASS  |  Citations used: 3  |  Passages retrieved: 6

**Aria's Answer:**

It's really tough when a loved one with dementia doesn't recognize you. It's important to stay calm and gentle. Introduce yourself simply, saying something like, "Hello Mum, I'm Sarah, I've come to see you." Focus on creating a warm connection through your presence rather than insisting on your identity [2][3].

If she seems upset, reassure her with a calm voice and let her know she is safe with you. You might also try to engage her in a comforting activity or reminisce about happy memories together [1].

If this happens frequently or is accompanied by increased agitation, consider discussing it with her doctor for further guidance.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 23. urgent-review

**Question:** There was a sudden big change today with confusion and agitation. When should I seek urgent medical help?

**Status:** ✅ PASS  |  Citations used: 1  |  Passages retrieved: 6

**Aria's Answer:**

I'm sorry to hear that you're experiencing this sudden change; it can be really distressing. You should seek urgent medical help if you notice a sudden marked increase in confusion or agitation beyond their usual behavior, new fever or chills, obvious signs of pain, refusal to eat or drink for more than 24 hours, or any signs of infection like redness or swelling [1]. It's important to keep a brief record of what has changed and when, as this can help with medical assessment. If these symptoms are new or worsening, please don't hesitate to reach out for immediate medical advice.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 24. mobility-transfers

**Question:** What is the safest way to help someone stand up and transfer from bed to chair?

**Status:** ✅ PASS  |  Citations used: 1  |  Passages retrieved: 6

**Aria's Answer:**

It's important to prioritize safety for both you and the person you're caring for during transfers. Use their remaining mobility rather than lifting their full weight. If they can weight-bear and follow simple instructions, guide them through a standing transfer by breaking the movement into clear, one-step instructions, allowing time for them to respond before proceeding [1].

Maintain a wide base of support with your feet apart, keep your back straight, and bend at the knees while staying close to the person. If they cannot weight-bear safely, consider using mechanical aids like slide sheets or transfer boards, and consult an occupational therapist for proper techniques and equipment [1].

If you notice any new or worsening symptoms, or if safety is a concern, seek a medical review.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 25. respite-options

**Question:** What respite options are there if I need a short break from caring?

**Status:** ✅ PASS  |  Citations used: 2  |  Passages retrieved: 6

**Aria's Answer:**

It's completely understandable to need a break from caregiving; taking time for yourself is essential for your wellbeing. There are several respite options available. In-home respite allows a trained care worker to come to your home, providing care while you take a break. Community day programs offer structured activities and social connections, which many people with dementia enjoy once they get used to the routine. If you need a longer break, overnight or residential respite in an aged care facility is also an option, though it may be more disruptive [1][2].

If you're feeling overwhelmed or if your loved one's needs have changed, consider seeking a medical review to discuss the best options for your situation.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 26. dementia-medication

**Question:** What do dementia medicines actually do and what side effects should I watch for?

**Status:** ✅ PASS  |  Citations used: 1  |  Passages retrieved: 6

**Aria's Answer:**

It's understandable to want clarity on dementia medications, as they can be a significant part of care. Medications like donepezil, rivastigmine, and galantamine help manage symptoms by preventing the breakdown of a brain chemical important for memory and learning, but they do not cure or reverse dementia [1]. Common side effects include nausea and appetite loss, which usually improve over time. Memantine, used for moderate to severe Alzheimer's, may cause headaches and dizziness [1].

If you notice any new or worsening symptoms, or if side effects seem concerning, it's important to consult with a healthcare professional for a review. This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 27. pain-recognition

**Question:** How can I tell if my dad is in pain when he cannot explain it clearly?

**Status:** ✅ PASS  |  Citations used: 2  |  Passages retrieved: 6

**Aria's Answer:**

It's tough when someone you care for can't express their pain. Look for changes in behavior, such as increased agitation, withdrawal, or grimacing. They might guard a specific body part or show resistance to care, which can indicate discomfort [2]. Pay attention to their body language and facial expressions, as these can reveal how they are feeling even if they can't find the words [1].

If you notice any new or worsening signs of pain, it's important to seek medical advice to investigate the cause rather than attributing it solely to dementia [2].

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 28. dementia-types

**Question:** What is the difference between Alzheimer's, vascular dementia, and Lewy body dementia?

**Status:** ✅ PASS  |  Citations used: 3  |  Passages retrieved: 6

**Aria's Answer:**

It's understandable to want clarity on these types of dementia, as they can be quite different. Alzheimer's disease is the most common form, starting with memory problems and gradually affecting thinking and language skills [1][6]. Vascular dementia results from damage to the brain's blood vessels, often following strokes, and can cause sudden confusion and difficulties with planning [1][2]. In contrast, Lewy body dementia is characterized by fluctuating alertness, visual hallucinations, and movement issues, and it requires careful management of certain medications [1][2].

If you notice any new or worsening symptoms, it's important to seek a medical review for appropriate support. This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 29. mci-expectations

**Question:** My mum has mild cognitive impairment. Does that mean it will turn into dementia?

**Status:** ✅ PASS  |  Citations used: 1  |  Passages retrieved: 6

**Aria's Answer:**

It's understandable to feel concerned about your mum's mild cognitive impairment (MCI). While MCI can be a precursor to dementia, not everyone with MCI will progress to dementia. In fact, many people remain stable or even return to normal cognitive function [1]. It's important to focus on managing modifiable risk factors, such as blood pressure, cholesterol, and physical activity, as these can help slow any potential progression [1]. Regular check-ups with her GP are also essential to monitor her condition and address any changes.

If you notice any new or worsening symptoms, or if her safety is at risk, please seek medical advice promptly.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 30. verbal-communication

**Question:** What is the best way to talk to someone with dementia when they get upset?

**Status:** ✅ PASS  |  Citations used: 1  |  Passages retrieved: 6

**Aria's Answer:**

It's really tough when someone with dementia gets upset, and your feelings are valid. The best approach is to stay calm and reassure them. Acknowledge their feelings by saying something like, "I can see you're worried; you're safe here with me" [5]. Avoid arguing or trying to reason with them, as this can escalate their distress. Instead, gently redirect their attention to a comforting activity or a favorite object [5].

If they seem very upset, it might help to give them a little space and return after a short while when they've had time to settle [5]. If their distress is new or worsening, consider seeking a medical review to ensure their well-being.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 31. nonverbal-communication

**Question:** How should I use body language and gestures to help my dad understand me?

**Status:** ✅ PASS  |  Citations used: 3  |  Passages retrieved: 6

**Aria's Answer:**

It's great that you're looking to improve communication with your dad. Using positive body language and gestures can really help. Maintain a warm and calm facial expression, as this can convey reassurance and patience [2]. Make eye contact at his level—sitting or crouching down can make a big difference. Use gentle touch, like a reassuring hand on his arm, to create a connection, but be mindful of his comfort with touch [2][5].

Incorporate gestures to support your words, like pointing or demonstrating actions, and keep your language simple and clear [4]. If he seems confused, try to mirror his body language subtly to create a sense of ease [2]. If communication challenges persist or worsen, consider seeking a medical review to explore further support options.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 32. validation-therapy

**Question:** Someone with dementia keeps insisting they need to go home. Should I correct them?

**Status:** ✅ PASS  |  Citations used: 2  |  Passages retrieved: 6

**Aria's Answer:**

It's completely understandable to feel frustrated when someone with dementia insists they need to go home. Instead of correcting them, focus on reassurance. Acknowledge their feelings by saying something like, "I can see you're feeling anxious. You're safe here with me." Then gently redirect them to a comforting activity or a familiar task [2][4].

Avoid arguing or reasoning, as this can escalate their distress. If they continue to express this need, try to engage them in a meaningful activity that gives them a sense of purpose [2]. If their insistence becomes more frequent or concerning, consider seeking a medical review to ensure their needs are being met.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 33. reminiscence-therapy

**Question:** Are there simple activities or memory prompts that can help my mum feel more engaged?

**Status:** ✅ PASS  |  Citations used: 4  |  Passages retrieved: 6

**Aria's Answer:**

It's wonderful that you want to help your mum feel more engaged\! Simple activities based on her interests can be very beneficial. For example, you could encourage her to help with meal preparation, like choosing ingredients or setting the table, which can provide a sense of purpose [5].

Memory prompts can also be helpful. Consider creating a list of daily activities or using visual aids to remind her of what she enjoys doing [4]. Engaging in familiar tasks, like baking with easy-to-follow recipes or shopping together, can also keep her involved and connected to her routine [1][3].

If you notice any significant changes in her memory or behavior, it's important to seek a medical review.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 34. isupport-types-of-dementia

**Question:** What are the most common types of dementia?

**Status:** ✅ PASS  |  Citations used: 3  |  Passages retrieved: 6

**Aria's Answer:**

It's understandable to want to know more about dementia, especially when caring for a loved one. The most common types of dementia include Alzheimer's disease, vascular dementia, dementia with Lewy bodies, and frontotemporal dementia.

Alzheimer's disease is the most prevalent and often starts with memory problems. Vascular dementia can occur after strokes and may present with sudden confusion. Dementia with Lewy bodies is characterized by visual hallucinations and movement issues, while frontotemporal dementia primarily affects personality and language early on [1][2][3].

If you notice any concerning changes in your loved one, it's important to seek a medical review. This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 35. isupport-person-centred

**Question:** What does person-centred care mean for someone with dementia?

**Status:** ✅ PASS  |  Citations used: 3  |  Passages retrieved: 6

**Aria's Answer:**

It's wonderful that you're seeking to understand person-centred care for someone with dementia. This approach focuses on the individual, recognizing their unique personality, life experiences, needs, and preferences. It means making decisions based on what matters most to them, such as their favorite activities or food choices [1][2].

Even as communication becomes more challenging, you can still engage with them by understanding their life history and values, ensuring they feel respected and included [1]. Always remember to reassure them and validate their feelings, as this fosters a sense of safety and connection [3].

If you notice any significant changes in their behavior or well-being, consider seeking a medical review. This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 36. isupport-future-planning

**Question:** How do I plan ahead for future care decisions for my family member with dementia?

**Status:** ✅ PASS  |  Citations used: 3  |  Passages retrieved: 6

**Aria's Answer:**

It's great that you're thinking about planning ahead for your family member with dementia. Start by discussing their wishes and preferences regarding care, treatment, and finances while they can still express themselves. Consider setting up an Advanced Care Plan (ACP) to outline their future care wishes and an Enduring Power of Attorney (EPA) to appoint someone to make decisions on their behalf if needed [1][4][5].

Gather necessary information and consult with family, friends, and healthcare professionals to ensure everyone is on the same page. If you notice any changes in their condition or if you're unsure about the planning process, seek a medical review for guidance.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 37. isupport-communication

**Question:** How should I improve communication with my family member who has dementia?

**Status:** ✅ PASS  |  Citations used: 4  |  Passages retrieved: 6

**Aria's Answer:**

Improving communication with your family member who has dementia can be challenging, but it's important to approach it with patience and compassion. Speak clearly and slowly, using simple language and short sentences. Try to ask one question at a time, and consider using closed-ended questions that can be answered with 'YES' or 'NO' [2].

Pay attention to their body language and facial expressions, as these can provide clues about their feelings [1]. Minimize background noise to help them focus better [6]. If they struggle to express themselves, give them time and avoid finishing their sentences [5].

If you notice any sudden changes in their ability to communicate, it may be wise to seek a medical review.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 38. isupport-decision-making

**Question:** How can I support someone with dementia to make their own decisions?

**Status:** ✅ PASS  |  Citations used: 2  |  Passages retrieved: 6

**Aria's Answer:**

It's wonderful that you want to support someone with dementia in making their own decisions. Encouraging them to do what they can helps maintain their independence and boosts their self-esteem. Start by simplifying choices—limit options and discuss decisions when they are calm and focused. Ask open-ended questions to guide them, and validate their feelings throughout the process [2][4].

If you notice they struggle significantly or if their ability to make decisions worsens, it may be time to seek a medical review to ensure their needs are being met appropriately.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 39. isupport-carer-stress

**Question:** I feel overwhelmed and stressed from caring for someone with dementia. What should I do?

**Status:** ✅ PASS  |  Citations used: 3  |  Passages retrieved: 6

**Aria's Answer:**

It's completely understandable to feel overwhelmed and stressed while caring for someone with dementia. Taking care of yourself is crucial, so try to carve out time for relaxation and enjoyable activities. Talk about your feelings with friends or family; sharing your experiences can help lighten the load [1][4].

Consider involving others in the caregiving process, as it can be too much for one person to handle alone. If you notice any serious mood changes in the person you care for, or if you feel you might be at risk of burnout, seek medical advice right away [3].

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 40. isupport-thinking-differently

**Question:** How can I change the way I think to help me cope better with caring?

**Status:** ✅ PASS  |  Citations used: 2  |  Passages retrieved: 6

**Aria's Answer:**

It's completely understandable to feel overwhelmed while caring for someone with dementia. Changing your thoughts can significantly improve how you cope. Start by identifying unhelpful thoughts, like feeling guilty for needing a break or thinking you must do everything alone. Instead, try to replace them with helpful thoughts, such as "Taking time for myself helps me provide better care" or "Asking for help shows I care about my loved one" [2][3]. This shift can help you feel more in control and supported. If you notice persistent feelings of sadness or guilt, consider seeking support from a healthcare professional.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 41. isupport-mealtimes

**Question:** How do I make mealtimes easier and more enjoyable for someone with dementia?

**Status:** ✅ PASS  |  Citations used: 4  |  Passages retrieved: 6

**Aria's Answer:**

It's wonderful that you want to make mealtimes easier and more enjoyable for someone with dementia. Creating a positive atmosphere is key. You can encourage them to participate in mealtime activities, like choosing food, helping with meal preparation, or setting the table, which can boost their self-worth and engagement [2][4].

Consider using adaptive utensils if they have difficulty eating, as this can help reduce frustration and spills [1]. Always aim to eat together, as this fosters connection and comfort. If you notice any significant changes in their eating habits or if they seem uninterested in food, it may be time to seek advice from a healthcare professional [6].

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 42. isupport-personal-care

**Question:** What is the best way to help someone with dementia with personal hygiene?

**Status:** ✅ PASS  |  Citations used: 2  |  Passages retrieved: 6

**Aria's Answer:**

It's completely understandable to feel overwhelmed when assisting someone with personal hygiene. Start by preparing the environment: warm the bathroom, lay out clean clothes and towels, and have everything within easy reach. Use a bath seat or shower chair for safety, and reassure them with calming words like, "I'm not going to let you get hurt" [1].

Always ask how they would like to be helped and respect their preferences. Explain each step clearly and simply, and if they resist, don't push—try again later [1][2]. Establishing a consistent routine can also make personal care easier over time. If resistance continues or if you notice any skin issues, consider consulting their GP for further strategies [1].

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 43. isupport-continence

**Question:** How do I handle toileting and continence issues for someone with dementia?

**Status:** ✅ PASS  |  Citations used: 4  |  Passages retrieved: 6

**Aria's Answer:**

It's understandable to feel overwhelmed when managing toileting and continence issues for someone with dementia. Start by establishing a regular toileting routine, offering the toilet every two to three hours, after meals, and before bed, regardless of whether they indicate a need [1][2]. Use clear signs, like a picture of a toilet on the door, and ensure the path is well-lit, especially at night [1][4].

If accidents happen, respond calmly and without frustration, as emotional reactions can increase feelings of shame [1]. Maintain good hygiene to prevent skin irritation and urinary tract infections [2][6]. If incontinence worsens or becomes difficult to manage, consult a GP for further evaluation and support from a continence nurse specialist.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 44. isupport-repetitive-behaviour

**Question:** My mother keeps repeating the same story over and over. What should I do?

**Status:** ❌ FAIL  |  Citations used: 3  |  Passages retrieved: 6

**Aria's Answer:**

It's understandable to feel frustrated when your mother repeats the same story. Remember, this behavior is common in people with dementia and often stems from feelings of insecurity or a need for comfort [1][3].

Try to provide reassurance by listening patiently and validating her feelings. Engaging her in enjoyable activities or changing the environment, like reducing noise, may also help [1][2]. If her repetition seems to be linked to anxiety or distress, gently redirect her to a different topic or activity.

If you notice any sudden changes in her behavior or if her repetition is causing her distress, it's important to seek a medical review.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

**Why it failed:** Response must include at least one of: repetitive, reassure, calm, routine, respond

*(Note: the answer does address repetition and offers reassurance-style guidance in substance — this is a wording/keyword-matching miss in the automated test rather than a quality problem with the actual answer.)*

-----

## 45. isupport-depression-anxiety

**Question:** The person I care for seems depressed and withdrawn. How should I respond?

**Status:** ✅ PASS  |  Citations used: 2  |  Passages retrieved: 6

**Aria's Answer:**

It's tough to see someone you care for feeling depressed and withdrawn. Start by offering extra love and support; a gentle touch or a calm, reassuring voice can help them feel understood. Suggest doing a pleasant activity together to distract them and lift their mood, like going for a walk or engaging in a favorite hobby [2][4]. If one approach doesn't work, don't hesitate to try another, as it may take time to find what helps [4].

If their mood changes are serious, constant, or if you feel they might harm themselves, please seek medical advice right away.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 46. isupport-sleep-module5

**Question:** How do I manage difficulty sleeping and night-time restlessness in dementia?

**Status:** ✅ PASS  |  Citations used: 4  |  Passages retrieved: 6

**Aria's Answer:**

Managing difficulty sleeping and night-time restlessness in someone with dementia can be challenging, but there are effective strategies you can try. Focus on establishing a calming bedtime routine, such as lowering the lights, playing soothing music, and engaging in relaxing activities like reading or gentle conversation [1][4]. Encourage physical activity during the day to help promote better sleep at night, and limit caffeine and fluid intake in the hours leading up to bedtime [2][3].

If the person wakes up confused or distressed, respond calmly and guide them back to bed without stimulating them further [3]. If sleep issues persist or worsen, it's important to seek medical advice to rule out any underlying health concerns.

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.

-----

## 47. isupport-aggression-behaviour

**Question:** What do I do when someone with dementia becomes verbally or physically aggressive?

**Status:** ✅ PASS  |  Citations used: 3  |  Passages retrieved: 6

**Aria's Answer:**

It's really tough to deal with aggression from someone with dementia, and it's important to remember that this behavior often comes from fear, confusion, or unmet needs. Start by identifying any triggers, like pain or feeling threatened during care tasks. Step back and give them space, using a calm voice to reassure them that they are safe [1][2].

Try to prevent aggression by explaining care tasks step by step and asking for permission before touching. Keep a diary to track patterns that might help you understand their needs better [1]. If aggression escalates or leads to injury, please seek a medical review to explore underlying causes or get specialist support [5].

This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.
