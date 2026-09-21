# Project Scope, Research Objectives & Literature Review (April 2026 submission)

Text extracted from [`2026-04_scope-objectives-literature-review.docx`](2026-04_scope-objectives-literature-review.docx)
by `python-docx` on 2026-09-21, so the prose can be grepped and diffed against the
final report. **The .docx is authoritative.** Table of contents and page numbers
are dropped; headings and the scope table are kept.

See [`alignment.md`](alignment.md) for what has to change before this becomes the
final report's Introduction and Literature Review.

---

## DEMENTIAGUIDE AI: AN AVATAR-BASED DIGITAL RESOURCE MANAGEMENT SYSTEM FOR DEMENTIA CARE

*Richman Tan*  
*Department of Civil and Environmental Engineering*  
*The University of Auckland, Auckland, New Zealand*  
*Supervisor: Associate Professor Jing Sun*  
*Project Partner: JooHyun Kang*  

This project investigates the development of DementiaGuide AI, an AI-powered avatar-based digital resource management system designed to support dementia care. Current online resources for dementia care are disjointed, hard to understand, and not personalised to individual needs. This research aims to address these limitations by integrating artificial intelligence, conversational interfaces, and avatar-based interaction into a unified platform. A systematic literature review is conducted to analyse current digital resource systems, AI-assisted healthcare tools, and avatar-based technologies. The findings highlight gaps in usability, integration, and personalisation within existing solutions. Based on these insights, the project proposes a prototype system that enables intuitive, conversational access to personalised dementia care resources. This study adds value to the field by examining how avatar-based interfaces can promote accessibility, engagement, and decision-making within the healthcare system. The goal of the study is to improve patient management and minimise caregiver burdens through intelligent interface design.

## INTRODUCTION


The global rise in dementia prevalence presents a growing challenge for healthcare systems, caregivers, and families, highlighting the increasing need for accessible, reliable, and personalised support tools. Despite significant advances in digital health technologies, existing dementia care systems remain particularly fragmented and insufficiently tailored to users' evolving needs. As a result, caregivers often experience increased cognitive burden and inefficiencies when accessing relevant information, underscoring the need for more integrated, user-centred solutions.

A substantial body of research has explored digital technologies in dementia care, including learning platforms, caregiver applications, and other assistive technologies (Meiland et al., 2017; Hopwood et al., 2018). Although these applications are effective, they are developed as stand-alone applications with limited customisation, especially in terms of personalisation or integration with other technologies. At the same time, breakthroughs in artificial intelligence and conversational interfaces can be used in health care settings (Laranjo et al., 2018). These technologies still lack ease of use, trustworthiness, and engagement.

Systems based on avatar technology and embodied conversational agents are among the most recent developments in the field that hold promise for creating human-computer interactions (Bickmore & Picard, 2005; Chattopadhyay et al., 2020). By taking visual and social elements into account in their design, such systems can provide a significantly better experience and engagement than purely text-based systems. However, most research on this topic focuses only on short-term usability. It does not address the actual benefits of implementing such systems in practice, especially in the case of dementia patients.

This project addresses the research question: How can an AI-powered avatar-based interface improve the accessibility, personalisation, and usability of digital resource management systems for dementia care? In asking this question, it aims to bridge the gap between emerging interactive technologies and practical caregiving needs. The objective of this research is to design, develop, and evaluate a prototype system that enables intuitive, conversational access to personalised dementia care resources.

To accomplish this, the research will consist of a comprehensive literature review of the topic, outlining the shortcomings of existing systems, designing an avatar-based interface, developing a prototype using AI algorithms for personalisation, and evaluating its efficiency in helping users make well-informed decisions about dementia patients.

The project scope and goals are presented first in this report, followed by a thorough analysis of the relevant literature on dementia care technology, artificial intelligence, and avatar systems. This will be followed by a description of the system to be designed and developed and will conclude with important findings.

## PROJECT SCOPE AND OBJECTIVES


A clearly defined research question is essential in guiding the direction and impact of this study. This research question serves as the main focus of the study; everything done during the course of this study will be geared toward closing this research gap.

### 2.1 Research Problem


Based on an initial exploration of existing literature and current technological limitations in dementia care systems, this project is driven by the following research question:

How can an AI-powered avatar-based interface improve the accessibility, personalisation, and usability of digital resource management systems for dementia care?

This research question stems from several crucial limitations found in the existing literature. Firstly, many of the current dementia care technologies are not integrated and involve the use of multiple software programs for accessing useful information. Although AI-powered systems and conversational agents have proven effective at making services more accessible, they lack personalisation and engagement. Additionally, despite the effectiveness of avatar-based technologies in human-like interactions, little research exists on how well they perform in the context of dementia care services.

### 2.2 Research Questions

- What are the limitations of existing digital resource management systems in dementia care?
- How can AI-driven personalisation improve the relevance and usability of care resources?
- What role can avatar-based interfaces play in enhancing user engagement and accessibility?
- How can conversational interaction support decision-making for caregivers and healthcare professionals?
- What design considerations are necessary to ensure usability for users with varying digital literacy levels?

### 2.3 Research Aim and Objectives


The central aim of this research is to design, develop, and evaluate an avatar-based artificial intelligence system that enables caregivers and healthcare professionals to access dementia care resources more intuitively and effectively. The purpose of the research is to improve usability and reduce the cognitive burden on caregivers and healthcare professionals.

To achieve this aim, the following objectives are defined:
- Conduct a systematic literature review of existing dementia care technologies, AI-based systems, and avatar-based interfaces to establish the current state of research.
- Identify key limitations, challenges, and research gaps in existing solutions, particularly in integration, usability, and personalisation.
- Design an avatar-based interface that supports intuitive, conversational interaction tailored to the needs of dementia care users.
- Develop a functional prototype incorporating AI-driven personalisation and resource management capabilities.
- Evaluate the system’s usability and effectiveness in supporting access to dementia care information and decision-making.

Together, these objectives provide a structured, achievable pathway for addressing the research question, ensuring the project contributes both practical and academic value to the field of dementia care technologies.

### 2.4 Scope


The current project entails the design, development, and evaluation of an AI-based avatar system to manage dementia care resources. This system will enable caregivers and medical practitioners to access information on dementia care practices and other activities through which people living with the condition can benefit from support services.

However, the present study is limited to the development of a prototype AI-based avatar system for dementia care. It will not entail the use of any clinical data or the implementation of the developed product in any healthcare facilities or institutions. Moreover, this system does not aim to provide medical assistance or diagnoses to any patients.

### 2.5 Significance


This research contributes to the growing field of AI in healthcare by exploring how avatar-based systems can enhance accessibility and engagement. It addresses a critical gap in dementia care technology by combining resource management, personalisation, and conversational interaction into a unified system.

## LITERATURE REVIEW


### 3.1 Methodology


This review draws on 25–30 peer-reviewed academic sources from IEEE, ACM, Springer, and medical journals. Keywords included “dementia care AI”, “healthcare chatbot”, “avatar elderly”, and “health recommender systems”. Sources were selected based on relevance, recency, and contribution to key domains.

### 3.2 Dementia Care Challenges


Dementia care is complex because needs change over time and often involve memory support, behavioural management, emotional support, service navigation, and caregiver coordination. Reviews of technologies for community-dwelling people with dementia consistently report that caregivers and patients require support that is not only informative, but also usable, trustworthy, adaptive, and feasible in everyday settings (Meiland et al., 2017; Span et al., 2013). At the same time, broader scoping reviews indicate that digital healthcare for dementia is expanding rapidly, but remains fragmented across areas such as diagnosis, cognitive training, monitoring, assistive living, and caregiver support, rather than being organised around a unified user experience (Sohn et al., 2023; Tsoi et al., 2023).

This is significant because dementia-related technologies are often evaluated not only on their technical capabilities, but on their ability to reduce real-world caregiver burden and improve practical usability. Meiland et al. (2017) highlight usability, effectiveness, deployment, cost-effectiveness, and ethical considerations as persistent challenges in dementia technologies, while more recent studies continue to report uneven implementation and limited evidence of long-term benefits in everyday care contexts (Sohn et al., 2023; Xie et al., 2020). This suggests that the key challenge is not merely developing digital tools, but ensuring that they are usable, trusted, and meaningfully integrated into everyday dementia care.

### 3.3 Digital Resource Systems


Digital resource systems play a central role in supporting dementia care by providing access to information, guidance, and support services for both caregivers and individuals living with dementia. These systems typically include web-based platforms, educational portals, caregiver support applications, and integrated health information systems designed to deliver relevant content and assist with decision-making.

Existing research highlights that such systems can improve access to care-related information, increase caregiver confidence, and support self-management. Internet-based interventions, for example, have been shown to provide valuable educational resources and emotional support for caregivers, particularly when in-person services are limited (Hopwood et al., 2018). Similarly, digital health platforms often include features such as symptom tracking, care planning, and structured learning modules, which can enhance users’ ability to manage dementia-related challenges.

However, despite these benefits, the literature consistently identifies several limitations. A major issue is the lack of integration, as many systems are developed as standalone tools that address only a single aspect of care, such as education, monitoring, or communication. This fragmentation requires users to navigate multiple platforms, increasing cognitive load and reducing overall usability, particularly for caregivers who may already be under significant stress (Meiland et al., 2017).

Additionally, many digital resource systems adopt a one-size-fits-all approach, offering static content that does not adapt to individual user needs, disease progression, or caregiving contexts. This limits their effectiveness, as dementia care is highly dynamic and requires personalised, context-aware support. Research on technology adoption among older adults further suggests that usability, perceived usefulness, and ease of interaction are critical factors influencing whether such systems are actually used in practice (Peek et al., 2014).

Another key limitation is the lack of intuitive interaction mechanisms. Many systems rely on traditional user interfaces that require users to search, navigate menus, and interpret large amounts of information. For users with lower digital literacy, this can create barriers to access and reduce engagement.

Overall, while digital resource systems provide an important foundation for dementia care support, they remain limited by fragmentation, lack of personalisation, and usability challenges. These limitations highlight the need for more integrated, intelligent, and user-centred solutions that can deliver relevant information in a more accessible and engaging manner. While internet-based caregiver interventions can improve access to information and emotional support, they are often static and fragmented, whereas integrated AI-supported systems may better adapt to evolving user needs.

### 3.4 Artificial Intelligence in Dementia Care.


The application of artificial intelligence (AI) in dementia research has expanded significantly in recent years, with studies demonstrating its use across a wide range of domains, including early detection, diagnostic support, disease progression modelling, speech and language analysis, computer vision, and assistive living systems. These advances highlight the growing relevance of AI in dementia care, particularly in enhancing clinical decision-making and enabling data-driven insights (Tsoi et al., 2023; Merkin et al., 2022). However, despite this progress, much of the existing research remains focused on technically oriented tasks such as classification, prediction, and pattern recognition, with comparatively less emphasis on the design of practical, user-facing systems that support day-to-day caregiving.

This distinction is critical. A system may demonstrate high technical performance yet fail to deliver real-world value if it is not usable, interpretable, or aligned with the workflows and cognitive needs of caregivers and healthcare professionals. Reviews of AI in healthcare and dementia consistently highlight this translational gap between algorithmic capability and meaningful application in practice (Xie et al., 2020; Sohn et al., 2023). In particular, there is a lack of systems that effectively integrate AI into accessible interfaces that prioritise usability, trust, and contextual relevance.

For DementiaGuide AI, this suggests that the value of AI lies not solely in its predictive or analytical capabilities, but in its ability to enhance the organisation, personalisation, and delivery of care-related information. By shifting the focus from purely technical performance to user-centred design, AI can play a critical role in reducing cognitive burden and supporting more effective decision-making in dementia care contexts.

### 3.5 Conversational Interfaces


Conversational interfaces, including chatbots and voice-based assistants, have emerged as a significant area of research within healthcare due to their ability to provide intuitive, natural language interaction. Unlike traditional graphical user interfaces, conversational systems allow users to access information and services through dialogue, reducing the need for complex navigation and improving accessibility, particularly for individuals with limited digital literacy.

A systematic review by Laranjo et al. (2018) highlights that conversational agents in healthcare have been applied across a wide range of domains, including mental health support, chronic disease management, and patient education. These systems have demonstrated potential to improve access to information, enhance user engagement, and provide timely support. However, the review also identifies key limitations, including variability in system quality, limited clinical validation, and a lack of long-term evidence regarding effectiveness and sustained user engagement.

In the context of dementia care, conversational interfaces offer particular advantages. Caregivers often require quick, context-specific information while managing complex and time-sensitive situations. A conversational system can reduce cognitive load by allowing users to ask questions directly and receive structured, relevant responses without needing to search through multiple resources. This aligns with findings from broader dementia technology research, which emphasises the importance of usability, accessibility, and alignment with real-world caregiving workflows (Meiland et al., 2017; Xie et al., 2020).

Despite their potential, current conversational systems are often limited in their ability to provide deeply personalised and context-aware responses. Many rely on predefined scripts or general-purpose language models that may not fully capture the evolving and nuanced needs of dementia care. Additionally, issues related to trust, transparency, and reliability remain important considerations, particularly in healthcare settings where incorrect or misleading information can have serious consequences.

Another limitation is that most conversational systems are text-based or voice-only, lacking the visual and social cues that can enhance user engagement and communication. This has led to growing interest in combining conversational interfaces with embodied or avatar-based systems, which can provide a more human-like interaction experience. As a result, conversational interfaces can be seen as a foundational component of more advanced interactive systems, bridging the gap between traditional user interfaces and fully embodied digital agents.

Overall, conversational interfaces represent a promising approach to improving accessibility and interaction in dementia care systems. However, their effectiveness depends on their integration with personalisation, domain-specific knowledge, and user-centred design principles. This highlights the opportunity to extend conversational systems beyond basic interaction towards more intelligent, adaptive, and engaging solutions, such as those proposed in DementiaGuide AI.

### 3.6 Avatar-Based Systems


Avatar-based systems extend conversational agents by providing embodiment, visual presence, and social cues. In the broader healthcare literature, virtual humans and embodied conversational agents have been associated with improvements in communication, user engagement, and perceived relational quality, although effects vary by context and design (Bickmore & Picard, 2005; Chattopadhyay et al., 2020). A meta-analysis of patient-facing virtual humans found encouraging results overall, but did not establish that avatars are universally superior or that they consistently improve hard clinical outcomes (Chattopadhyay et al., 2020).

For dementia specifically, the evidence is more limited and more exploratory. Rampioni et al. found that research on embodied conversational agents for people with dementia is still emerging and characterised by design diversity and unresolved barriers, while Stara et al.’s study of the Anne agent focused primarily on usability and acceptance rather than long-term care outcomes (Rampioni et al., 2021; Stara et al., 2021). In other words, the literature supports saying that avatars in dementia care are promising, but not yet well validated.

A further nuance is that avatars have been studied in different roles. Some work uses interactive avatars for dementia detection through spoken dialogue, showing technical promise in assessment contexts, while others use embodied agents as assistive or supportive interfaces. These are related but not identical use cases. The dementia-detection study by Tanaka et al. demonstrates that avatars can be a viable interface for eliciting useful interaction data, but it does not by itself prove that avatars improve ongoing care management (Tanaka et al., 2017). That gap remains important for your project.

Recent reviews also suggest that avatar- and virtual-agent-assisted telecare is growing more broadly in home settings, but the evidence base remains small and heterogeneous (Sohn et al., 2023; Tsoi et al., 2023). This supports a careful position: avatar-based systems are sufficiently promising to justify further research, but there is still limited evidence showing their effectiveness specifically for improving long-term dementia-care outcomes, caregiver burden, or coordinated resource management.

Overall, compared with text-only conversational agents, avatar-based systems may improve social presence and engagement, but current evidence in dementia care remains limited largely to usability and acceptability studies rather than robust long-term care outcomes.

### 3.7 Personalisation


Personalisation is especially important in dementia care because user needs vary significantly across disease stage, caregiver role, living situation, health literacy, and cultural context. A useful dementia-support system therefore cannot assume that all users require the same information, timing, or interaction style. The literature on caregiver interventions and digital dementia support consistently shows that uptake and effectiveness depend heavily on relevance, timing, usability, and alignment with real-life routines (Hopwood et al., 2018; Meiland et al., 2017; Sohn et al., 2023).

This is where artificial intelligence has practical value. Rather than being limited to prediction or diagnosis, AI can be used to prioritise, organise, and adapt information to individual user needs. Existing research highlights that current dementia technologies often lack integration and fail to deliver personalised, user-centred experiences (Tsoi et al., 2023; Xie et al., 2020). In this context, personalisation should not be viewed solely as recommendation, but as a usability strategy that reduces cognitive load, improves accessibility, and enables users to more effectively engage with care resources (Ricci et al., 2015; Laranjo et al., 2018).

### 3.8 Existing Solutions


In addition to academic research, a range of commercial and industry-developed systems have emerged that utilise artificial intelligence, conversational interfaces, and avatar-based technologies to support healthcare and user interaction. These systems provide valuable insight into the current state of applied solutions and highlight both the opportunities and limitations of real-world implementations.

One example is Ella AI Care, a digital health platform designed to support individuals with cognitive decline through conversational interaction and personalised assistance. The system demonstrates how AI can be used to provide accessible support and guidance; however, publicly available information suggests that its capabilities are primarily focused on interaction and assistance rather than comprehensive resource management or integration with broader care systems.

More broadly, platforms such as Beyond Presence, Ravatar, and NVIDIA ACE (Avatar Cloud Engine) provide advanced tools for creating real-time, interactive avatars capable of natural conversation and expressive communication. These technologies showcase significant progress in avatar realism, responsiveness, and scalability, enabling highly engaging user experiences across domains including healthcare, gaming, and virtual assistants. However, these platforms are largely technology-focused, offering infrastructure for avatar development rather than domain-specific solutions tailored to dementia care.

Similarly, emerging AI persona systems, such as those seen in conversational platforms like Grok-style avatars, demonstrate the growing demand for human-like, low-latency interactive agents. These systems emphasise engagement, personality, and responsiveness, but are not specifically designed to address the structured, sensitive, and evolving needs of healthcare users.

In the mental health domain, applications such as the Manawa suicide prevention app illustrate how digital tools can be designed to support user wellbeing through guided interaction, structured content, and accessible resources. While not specific to dementia care, such systems highlight the importance of combining emotional support, usability, and contextual relevance in digital health applications.

Despite these advancements, a key limitation across existing solutions is the lack of integration between intelligent interaction, personalisation, and structured resource management. Many systems focus on either conversational interaction (e.g., avatars and chatbots) or information delivery (e.g., educational platforms) but rarely combine both in a cohesive and user-centred manner. Additionally, few platforms are specifically designed for dementia care contexts, where usability, clarity, and adaptability are particularly critical due to varying cognitive abilities and caregiver needs.

These observations reinforce the gap identified in the academic literature. While industry solutions demonstrate the feasibility of AI-driven interaction and avatar-based systems, there remains a lack of integrated platforms that combine AI personalisation, avatar-based engagement, and structured dementia care resource management. Addressing this gap forms the foundation of the proposed DementiaGuide AI system.

### 3.9 Research Gaps


The literature reveals several important gaps relevant to this project. While AI, conversational agents, and digital health tools are increasingly explored in healthcare, their integration into dementia care remains fragmented. Many systems focus on isolated functionalities such as monitoring, education, or cognitive training, rather than providing a unified platform for resource management and interaction.

In particular, avatar-based and embodied conversational systems remain under-explored in dementia care contexts. Existing studies suggest that such systems can improve engagement, accessibility, and user experience; however, the evidence supporting their effectiveness in delivering measurable care outcomes is limited. Much of the current research is based on small-scale studies, pilot implementations, or short-term evaluations, with a primary focus on usability and user acceptance rather than long-term clinical or caregiving impact (Chattopadhyay et al., 2020; Tsoi et al., 2023).

Emerging work in related domains, including AI-enabled healthcare systems, virtual reality training, and digital support tools, further highlights the growing interest in intelligent and interactive care technologies. However, these studies often emphasise technological potential rather than validated real-world outcomes, reinforcing the need for more rigorous and integrated research approaches (Aggarwal et al., 2023).

Additionally, broader reviews of dementia technologies consistently identify challenges in usability, adoption, ethical considerations, and real-world implementation. These challenges are particularly significant for users with low digital literacy, such as elderly individuals and family caregivers, who require intuitive and supportive interfaces (Meiland et al., 2017; Span et al., 2013).

Overall, there is a clear lack of systems that combine:
- AI-driven personalisation
- Avatar-based interaction
- Integrated resource management
- Strong usability for non-technical users

This gap highlights an opportunity for the development of a unified, user-centred platform such as DementiaGuide AI.

### 3.10 Contribution


This project addresses these gaps by combining AI personalisation, avatar interaction, and resource management into a single system tailored for dementia care.

## PROPOSED SOLUTION


Our proposed solution design is derived from the gaps in usability, personalisation, and interaction identified in our literature review. Based on these identified gaps, this project proposes the development of DementiaGuide AI, a real-time avatar-based dementia care assistant that integrates conversational intelligence, personalised knowledge delivery, voice interaction, and embodied communication within a single platform. The design is informed by recent developments in multimodal conversational AI systems that support voice interaction, streaming responses, and expressive speech generation. However, as these systems are not fully publicly documented, the current proposal suggests an architecture that is firmly rooted in technology and follows known design guidelines for voice agents.

At its core, the system is designed as a multistage interaction pipeline, where user input is processed, grounded in dementia-specific knowledge, and delivered through synchronised voice and avatar output. This pipeline enables low-latency interaction and a natural conversational experience, while ensuring responses remain consistent, trustworthy, and cognitively accessible for caregivers and healthcare professionals.

The interaction begins with user input capture via text or real-time voice. For voice input, streaming audio is processed with automatic turn detection to maintain conversational flow. The input then undergoes speech recognition and preprocessing, where it is converted into text and enriched through intent detection and contextual understanding, such as identifying user role, urgency, and topic.

A persona and instruction layer ensures that all responses remain calm, supportive, accurate, and easy to understand. This helps reduce cognitive load and maintains consistency across interactions. The system then applies a retrieval and grounding layer, querying a curated dementia-care knowledge base to ensure responses are based on trusted information rather than purely generated text. This retrieval-augmented approach is critical for reliability in a healthcare context.

The grounded input is processed by a large language model, which generates concise, personalised responses tailored to the user’s level of expertise. For example, clinicians may receive more detailed explanations, while caregivers receive simpler, step-by-step guidance. Responses are delivered through text-to-speech synthesis using a calm and clear voice and synchronised with a visual avatar that performs lip-sync and subtle expressions. The avatar provides social and visual cues that improve engagement and accessibility without being distracting.

The system also includes a memory and adaptation layer, allowing it to retain permitted user preferences and conversation context to improve relevance over time, while maintaining privacy and transparency.

From a system perspective, the architecture is modular and streaming-based, with a frontend supporting text, voice, and avatar interaction, and a backend orchestrating speech recognition, retrieval, language model inference, and speech synthesis. A key design principle is incremental streaming, where responses are delivered progressively to reduce latency and improve conversational flow.

The feasibility of this approach is supported by industry systems such as NVIDIA ACE, which demonstrate that real-time, avatar-based conversational agents can be built using integrated speech, language, and animation pipelines. However, as full ACE deployment typically requires specialised infrastructure and licensing, this project adopts an ACE-inspired approach while remaining feasible within the constraints of a student-level prototype.

This pipeline-based design improves upon traditional chatbots by grounding responses in domain-specific knowledge, enabling embodied interaction through an avatar, and supporting real-time communication. Development can be staged, beginning with a text-based system with retrieval-augmented responses and a simple avatar, before extending to live voice interaction, streaming responses, and more advanced avatar capabilities.

Overall, the proposed solution is a dementia-specific multimodal assistant pipeline that integrates grounded knowledge retrieval, language model reasoning, voice synthesis, and avatar-based interaction into a cohesive system, prioritising trust, clarity, and accessibility.

## PROJECT PLAN


## CONCLUSION


This project explored the potential of integrating artificial intelligence, conversational interfaces, and avatar-based interaction to improve digital resource management systems for dementia care. Key issues with current approaches were highlighted by the literature review, including fragmentation across different platforms, a lack of personalisation, and usability concerns, especially for caregivers and those with varying degrees of proficiency with technology. Even though there have been significant advances in artificial intelligence and conversational interfaces, their current implementations do not meet the needs of caregivers.

In response to these gaps, this research proposed DementiaGuide AI, a multimodal, avatar-based system designed to provide intuitive, personalised, and accessible access to dementia care resources. The integration of retrieval-grounded knowledge, conversational skills, and embodied avatar capabilities will decrease cognitive load, and increase user engagement. The system design includes features such as reliability, clarity, and flexibility, which can help overcome challenges found in both the academic literature and the commercial products available today.

While this project does not involve direct clinical deployment or validation, as it involves developing a prototype application, it still lays the groundwork for future research on applying smart, interactive technologies to dementia care. Additional research is required to assess the practical value of these approaches, particularly their long-term applicability. Overall, this project contributes to the field by proposing a more integrated, user-centred approach to dementia care technology, combining AI-driven personalisation, conversational interaction, and avatar-based communication within a single prototype system.

## REFERENCES


Aggarwal, A., Tam, C.C., Wu, D., Li, X., Qiao, S. 2023. Artificial intelligence-based chatbots for promoting health behavioural change: A systematic review. Journal of Medical Internet Research, 25, e40789. https://doi.org/10.2196/40789

Chattopadhyay, D., Ma, T., Sharifi, H., Martyn-Nemeth, P. 2020. Computer-controlled virtual humans in patient-facing systems: Systematic review and meta-analysis. Journal of Medical Internet Research, 22(7), e18839. https://doi.org/10.2196/18839

Hopwood, J., Walker, N., McDonagh, L., Rait, G., Walters, K., Iliffe, S., Ross, J., Davies, N. 2018. Internet-based interventions aimed at supporting family caregivers of people with dementia: Systematic review. Journal of Medical Internet Research, 20(6), e216. https://doi.org/10.2196/jmir.9548

Khampuong, P., Nilsook, P., Wannapiroon, P. 2023. Artificial intelligence avatar for conversational agent. Research, Invention, and Innovation Congress (RI2C), 33-39. https://doi.org/10.1109/RI2C60382.2023.10355967

Laranjo, L., Dunn, A.G., Tong, H.L., Kocaballi, A.B., Chen, J., Bashir, R., Surian, D., Gallego, B., Magrabi, F., Lau, A.Y.S., Coiera, E. 2018. Conversational agents in healthcare: A systematic review. Journal of the American Medical Informatics Association, 25(9), 1248-1258. https://doi.org/10.1093/jamia/ocy072

Lima, M.R., Horrocks, S., Daniels, S., Lamptey, M., Harrison, M., Vaidyanathan, R. 2022. Conversational affective social robots for ageing and dementia support. IEEE Transactions on Cognitive and Developmental Systems, 14(4), 1378-1397. https://doi.org/10.1109/TCDS.2021.3115228

Lima, M.R., Horrocks, S., Daniels, S., Lamptey, M., Harrison, M., Vaidyanathan, R. 2023. The role of conversational AI in ageing and dementia care at home: A participatory study. IEEE International Conference on Robot and Human Interactive Communication (RO-MAN), 571-578. https://doi.org/10.1109/RO-MAN57019.2023.10309459

Meiland, F., Innes, A., Mountain, G., Robinson, L., van der Roest, H., García-Casal, J.A., Gove, D., Thyrian, J.R., Evans, S., Dröes, R.M., Kelly, F., Kurz, A., Casey, D., Szcześniak, D., Dening, T., Craven, M.P., Span, M., Felzmann, H., Tsolaki, M., Franco-Martin, M. 2017. Technologies to support community-dwelling persons with dementia: Issues regarding development, usability, effectiveness and cost-effectiveness. JMIR Rehabilitation and Assistive Technologies, 4(1), e1. https://doi.org/10.2196/rehab.6376

Peek, S.T.M., Wouters, E.J.M., van Hoof, J., Luijkx, K.G., Boeije, H.R., Vrijhoef, H.J.M. 2014. Factors influencing acceptance of technology for aging in place: A systematic review. International Journal of Medical Informatics, 83(4), 235-248. https://doi.org/10.1016/j.ijmedinf.2014.01.004

Rampioni, M., et al. 2021. Embodied conversational agents in dementia care: A systematic review. PLOS Digital Health. https://doi.org/10.1371/journal.pdig.0000184

Ricci, F., Rokach, L., Shapira, B. 2015. Recommender systems handbook. Springer. https://doi.org/10.1007/978-1-4899-7637-6

Span, M., Hettinga, M., Vernooij-Dassen, M., Eefsting, J., Smits, C. 2013. Involving people with dementia in the development of supportive IT applications: A systematic review. Ageing Research Reviews, 12(2), 535-551. https://doi.org/10.1016/j.arr.2013.01.002

Stara, V., et al. 2021. Usability of conversational agents in dementia care: The Anne case study. JMIR Aging. https://doi.org/10.2196/25080

Tanaka, H., et al. 2017. Detecting dementia through interactive computer avatars. IEEE Journal of Translational Engineering in Health and Medicine, 5, 1-11. https://doi.org/10.1109/JTEHM.2017.2752152

Tsoi, K.K.F., Jia, P., Dowling, N.M., Titiner, J.R., Wagner, M., Capuano, A.W., Donohue, M.C. 2023. Applications of artificial intelligence in dementia research. Cambridge Prisms: Precision Medicine, 1, e9. https://doi.org/10.1017/pcm.2022.10

Xie, B., et al. 2020. Artificial intelligence for caregiver support in dementia: A systematic review. Journal of Medical Internet Research. https://doi.org/10.2196/17850

Bickmore, T. W., & Picard, R. W. 2005. Establishing and maintaining long-term human-computer relationships. ACM Transactions on Computer-Human Interaction, 12(2), 293–327.

Sohn, M., Lee, J., Choi, M. 2023. Digital healthcare for dementia and cognitive impairment: A scoping review. International Journal of Nursing Studies, 140, 104413.

Merkin, A., Krishnamurthi, N., Medvedeva, E., Billing, A., Krishnamurthi, R. 2022. Machine learning, artificial intelligence and the prediction of dementia: A systematic review. Current Neurology and Neuroscience Reports, 22(12), 821–835.

Ella AI Care. 2024. Ella AI Care Platform. Available: https://www.ella-ai-care.com/

Beyond Presence. 2024. AI Digital Humans Platform. Available: https://www.beyondpresence.ai/

Ravatar. 2024. Real-Time AI Avatar Technology. Available: https://www.ravatar.com/

NVIDIA. 2024. NVIDIA ACE (Avatar Cloud Engine). Available: https://developer.nvidia.com/ace

xAI. 2024. Grok AI System Overview. Available: https://x.ai/

Manawa Health. 2024. Manawa – Mental Health and Wellbeing App. Available: https://www.manawa.health/


| Included: | Excluded: |
|---|---|
| Web-based platform | Clinical validation |
| AI avatar interface | Integration with hospital systems |
| Personalised resource recommendations | Large-scale deployment |
| Structured dementia care content |  |
