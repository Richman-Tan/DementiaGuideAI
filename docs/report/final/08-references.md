# References — style, citation keys, and gaps

<!-- TEMPLATE: Not counted. The reference list itself is generated at assembly from the "In hand"
table below, in order of first citation. Rubric A (breadth and quality of sources) and F (no
errors). -->

## Style

The Canvas template uses **IEEE numeric** style: `\bibliographystyle{IEEEtran}` in the LaTeX
template, and the Word template's example reference.
- In the text: `[1]`, `[2], [5]`, `[3]–[6]`. The number goes before the full stop.
- Numbers follow order of first citation across the whole report.
- The list at the end is in number order.

Template example (Word), for format:

> [1] M. J. Balas, Y. J. Lee, and L. Kendall, "Disturbance tracking control theory with
> application to horizontal axis wind turbines," in *Proceedings of the 1998 ASME Wind Energy
> Symposium*, Reno, Nevada, 12-15 January 1998, pp. 95–99.

IEEE patterns to follow:
- **Journal:** A. B. Surname, C. D. Surname, and E. F. Surname, "Title in sentence case,"
  *Journal Abbrev.*, vol. X, no. Y, pp. Z–Z, Mon. Year, doi: 10.xxxx.
- **Conference:** …, "Title," in *Proc. Conf. Name*, City, Country, Year, pp. Z–Z.
- **Web / grey literature:** Organisation, "Page title." Site. URL (accessed Mon. DD, YYYY).
- **Preprint:** …, "Title," arXiv:xxxx.xxxxx, Year.
- **Six or more authors:** IEEE allows "A. B. Surname *et al.*" in the **list**. The April list
  used "et al." inconsistently, and in author-date style; `docs/report/lit-review/alignment.md`
  §2 flags four such entries. Either give all authors or apply IEEE's rule consistently.

**While drafting**, cite with `[@key]`. Every key must appear in the table below;
`scripts/report/check-template.py` checks this. At assembly, replace each key with its number in
order of first appearance, and emit the list.

Integrity (Handbook §8; Nexus vault rules):
- cite the **primary** source, and only sources actually read;
- never cite a vault concept note (`03 Resources/`) as a source;
- verify every DOI;
- grey literature (product websites) is acceptable only for describing a product, never for an
  efficacy claim.

## In hand — key → source

<!-- TEMPLATE: "Origin":
- April = `docs/report/lit-review/literature-review.md` reference list (25 entries).
- Vault = a Nexus `07 Sources/` note (bibliographic details are in the note).
- Draft = `docs/report/results-discussion-conclusion-draft.md` §H.
"Check" lists known problems to fix before the entry is used. -->

| Key | Source (short) | Origin | Used in | Check |
|---|---|---|---|---|
| `who-dementia` | WHO, Dementia fact sheet | Vault | §1.1 | access date |
| `adi-statistics` | Alzheimer's Disease International, dementia statistics | Vault | §1.1 | access date |
| `nz-dementia-services` | Alzheimers NZ / Dementia NZ / Health NZ service and statistics pages | Vault | §1.1, §2.4 | split into one entry per page cited |
| `sallim2015` | Sallim et al., 2015, *JAMDA* 16(12) — mental health disorders in Alzheimer's caregivers | Vault | §1.1 | vault note: co-authors unconfirmed (abstract only read) |
| `collinskishita2020` | Collins & Kishita, 2020, *Ageing & Society* 40(11) — depression and burden in dementia caregivers | Vault | §1.1 | vault note: abstract only read |
| `sorrentino2025` | Sorrentino et al., 2025, *Front. Public Health* 13 — needs and unmet needs in dementia care systems | Vault | §2.1 | — |
| `zhai2023` | Zhai et al., 2023, *Digital Health* 9 — digital interventions for family caregivers | Vault | §2.1 | — |
| `monnet2024` | Monnet et al., 2024, *Int. J. Med. Inform.* 188 — usability of web-based tools in dementia | Vault | §2.1 | — |
| `windle2024` | Windle et al., 2024, *Lancet Reg. Health Eur.* — iSupport UK RCT | Vault | §2.1 | — |
| `brijnath2026` | Brijnath et al., 2026, *Age and Ageing* 55(2) — Draw-Care iSupport Lite RCT | Vault | §2.1 | — |
| `who-isupport2019` | WHO, 2019, *iSupport for Dementia* manual | Vault | §2.1, §4.2 | IRIS handle |
| `hopwood2018` | Hopwood et al., 2018, *JMIR* 20(6) — internet interventions for dementia carers | April | §2.1 | — |
| `meiland2017` | Meiland et al., 2017, *JMIR Rehabil. Assist. Technol.* 4(1) | April | §2.1 | 20 authors → IEEE et al. rule |
| `span2013` | Span et al., 2013, *Ageing Res. Rev.* 12(2) | April | §2.1 | — |
| `peek2014` | Peek et al., 2014, *Int. J. Med. Inform.* 83(4) | April | §2.1 | — |
| `sohn2023` | Sohn, Lee & Choi, 2023, *Int. J. Nurs. Stud.* 140 | April | §2.1 | no DOI in the April list |
| `laranjo2018` | Laranjo et al., 2018, *JAMIA* 25(9) — conversational agents in healthcare | April | §2.2 | — |
| `aggarwal2023` | Aggarwal et al., 2023, *JMIR* 25 — AI chatbots for health behaviour change | April | §2.2 | — |
| `xie2020` | Xie et al., 2020, *JMIR* — AI for caregiver support in dementia | April | §2.2 | "et al."; volume/issue missing |
| `lima2022` | Lima et al., 2022, *IEEE Trans. Cogn. Dev. Syst.* 14(4) | April | §2.2 | **uncited in April**; cite or drop |
| `lima2023` | Lima et al., 2023, *IEEE RO-MAN* | April | §2.2 | **uncited in April**; cite or drop |
| `rampioni2021` | Rampioni et al., 2021 — embodied conversational agents in dementia care | April + Vault | §2.2 | **Conflict:** April gives *PLOS Digital Health*, doi 10.1371/journal.pdig.0000184. The vault gives *JMIR mHealth uHealth* 9(7):e25381. Resolve against the DOI (`docs/report/lit-review/alignment.md` §2). |
| `stara2021` | Stara et al., 2021 — the "Anne" ECA with people with dementia at home | April + Vault | §2.2 | **Conflict:** April gives *JMIR Aging*, doi 10.2196/25080. The vault gives *JMIR mHealth uHealth* 9(6):e25891 with authors unconfirmed. Resolve. Vault note: full text not read. |
| `chattopadhyay2020` | Chattopadhyay et al., 2020, *JMIR* 22(7) — virtual humans in patient-facing systems | April | §2.2 | — |
| `tanaka2017` | Tanaka et al., 2017, *IEEE J. Transl. Eng. Health Med.* 5 | April | §2.2 | "et al." |
| `bickmore2005` | Bickmore & Picard, 2005, *ACM TOCHI* 12(2) | April | §2.2 | no DOI |
| `shi2026` | Shi et al., 2026, arXiv 2506.15047 — caregiver needs → chatbot design | Vault | §2.2 | preprint; label it as such |
| `cohenmassaro1993` | Cohen & Massaro, 1993, in *Models and Techniques in Computer Animation*, Springer, pp. 139–156 | Draft | §2.2, §3.5 | confirm editors and pages (draft §H says so) |
| `khampuong2023` | Khampuong et al., 2023, *RI2C* | April | §2.2 or drop | **uncited in April** (`docs/report/lit-review/alignment.md` §2); cite or drop |
| `tsoi2023` | Tsoi et al., 2023, *Cambridge Prisms: Precision Medicine* 1 | April | §2.2 or drop | cited in the April body; detection/prediction focus is out of scope, so keep only if it is used |
| `merkin2022` | Merkin et al., 2022, *Curr. Neurol. Neurosci. Rep.* 22(12) | April | drop? | detection/prediction is out of scope; drop unless used for contrast |
| `ricci2015` | Ricci, Rokach & Shapira, 2015, *Recommender Systems Handbook* | April | §7.3 (personalisation) or drop | — |
| `liu2024lostmiddle` | Liu et al., 2024, "Lost in the middle," *TACL* | Vault resource note | §2.3 | no `07 Sources/` note yet; ingest it |
| `who-lmm-ethics2024` | WHO, 2024, *Ethics and governance of AI for health: guidance on large multi-modal models* | Vault | §2.4, §6.4 | vault note: news release read, guidance PDF not retrieved — read the primary before citing |
| `sani2025` | Sani et al., 2025, *Dementia* — cultural adaptations of WHO iSupport | Vault | §2.4 | — |
| `kang2026report` | J. Kang, Part IV Research Project Report, Dept. ECSE, Univ. of Auckland, 2026 (partner's report) | Partner | figure captions only | include **only** if a partner-produced figure is used; get the exact title from JooHyun |
| `commercial-2024` | Ella AI Care; Beyond Presence; Ravatar; NVIDIA ACE; xAI Grok; Manawa — product sites | April | §2.7 gap table only | **one entry per product**; grey literature; access dates; April §3.8 |

<!-- TEMPLATE: April entries were author-date with inconsistent "et al." and three uncited items
(`docs/report/lit-review/alignment.md` §2: Khampuong 2023, Lima 2022, Lima 2023). The markdown
list has 25 entries (19 academic, 6 web), not the 26 recorded in
`docs/report/rubric/readiness.md`. Recount against the .docx. -->

## Needed — no primary source in hand yet

<!-- TEMPLATE: Each subsection below names the literature §2.3–2.6 needs. "Candidates" are
well-known works to **locate, read and verify** before citing — they are leads, not citations.
Ingest each into the Nexus vault (`07 Sources/`) as it is read. Target 15–20 new references in
total (`docs/report/lit-review/alignment.md` §4). -->

**Deadline: about Sun 4 Oct.** Chapter 4's justifications and every §6.1 comparison depend on
these sources. Order of work: §2.5 priority one, then §2.6, §2.4, §2.3, then §2.2 latency.

### Needed — §2.2 latency (conversational norms)

- Gap length in human turn-taking across languages. Candidate: Stivers et al., PNAS 2009.
- User tolerance of voice-assistant or spoken-dialogue-system response delay. Search needed.
  This is the post-hoc yardstick for RQ4 (§4.5).

### Needed — §2.3 RAG and grounding in health information

- The retrieval-augmented generation formulation. Candidate: Lewis et al., NeurIPS 2020.
- Hallucination and factuality in LLMs, preferably in health. Candidate: Ji et al.'s
  hallucination survey (ACM Computing Surveys, 2023).
- RAG evaluated for medical question answering. Candidate: a MedRAG-style medical RAG benchmark
  (2024).
- Citation/attribution quality. Candidates: work on LLMs generating text with citations; the
  RAGAS evaluation framework.

### Needed — §2.4 Safety and jurisdiction in health chatbots

- Documented safety risks when consumers ask conversational assistants for medical information.
  Candidate: Bickmore et al., JMIR 2018.
- Clinical-knowledge LLM evaluation, including harm ratings. Candidate: Singhal et al., Nature
  2023.
- Health information localisation or jurisdiction. Search needed. This may be thin, which is
  itself a finding for §2.7.

### Needed — §2.5 Speech recognition for older and impaired speech

- The ADReSS-2020 challenge paper, with baseline and corpus description. Candidate: Luz et al.,
  Interspeech 2020. The corpus itself is also cited in §4.2.
- The DementiaBank Pitt corpus origin. Candidate: Becker et al., 1994.
- The Whisper model. Candidate: Radford et al., ICML 2023.
- Whisper hallucination on silence and pauses, and its harms. Candidate: Koenecke et al., FAccT
  2024.
- **Priority one:** the published Whisper-large WER of about 30 %. It is on the **ADReSS-M**
  variant (`docs/eval/evaluation-plan.md` §17.1), and the E9 results file mentions it without a
  citation. Find its primary source, and note the corpus difference. Also locate the "23–44 %
  across commercial systems" comparator named in the same line.
- Fallback comparators if that fails: ASR studies on the DementiaBank Pitt corpus; WER on
  elderly speech.
- ASR on elderly or dysarthric speech. Search needed.

### Needed — §2.6 Evaluating LLM-based systems

- LLM-as-a-judge validity and its biases. Candidate: Zheng et al., NeurIPS 2023 (MT-Bench).
- Cohen's κ, its interpretation bands, and its paradox under skewed prevalence. Candidates:
  Cohen 1960; Landis & Koch 1977; Feinstein & Cicchetti 1990.
- Graded retrieval metrics. Candidate: Järvelin & Kekäläinen, ACM TOIS 2002 (nDCG).
- SUS and its norms. Candidates: Brooke 1996; Bangor, Kortum & Miller 2008.

## Partner's report

<!-- TEMPLATE: If any figure was produced solely by JooHyun, its caption must cite JooHyun's
report (Handbook §7). Add it here as `kang2026report`: J. Kang, "[title]," Part IV Research
Project Report, Dept. ECSE, Univ. of Auckland, 2026. Otherwise delete this section. -->

TODO(decide: any partner-produced figures? see figures-and-tables.md "Producer")
