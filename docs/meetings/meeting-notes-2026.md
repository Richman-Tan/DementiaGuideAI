# Meeting Notes

## 13/May/2026

- Look into Cloud DB
- Implement
- Fetching resources based on a website link?
- Current approach = just storing chunks of data
- (notebook lm)

## 20/05/2026

- Penetration Testing

- How AI is validating info
- Ai airlock
- Sandbox
- Solution testing

## 03/06/2026

- Keywords expansion
- Manage resource content
- Knowledge base
- Matching mechanism

## 10/06/2026

- More in knowledge base database
- More testing for more accuracy (write multiple possible answers)
- Clean up db
- Other ways to db

## 17/06/2026

- Ask Sarah for confirmation for testing

- Improve the Prompts
  - Histories of the prompts changing
- How the change has been made
- Empathic

- Deployment ios development account

## 05/08/2026

- Server-side rendering (multiple people joining) - website, animation is on server side (depends on gpu and stuff)
  - Scalability
- Token usage estimation
  - Different models
  - How much token used?
  - Might use bit of token
  - Subscriptions
- Look into mobile side rendering
  - Mobile device side,
- Scalability managed?
  - Supporting 100s and 1000s people?

- Joining with the prior project
- Knowledge base
  - Endeavour app/website

- Including the video into our app

- Web link
- Work station
  - Deploy through a login
  - Temporary solution
  - Inside firewall at uoa
  - Create a channel and tunnel to public domain
- Look into deployment option
  - In terms of scalability
  - And cost
- Functionality
  - Endeavour website
    - Boundary testing on the questions

## 26/08/2026

another ai to test the answers and check incosistent, formulate, run it through claude, use ai to test our solution.

give difficult questions and boundary question by ai.

how to test ai solutions more reliably in healthcare.

- research paper
- create a separate ai to test the solution (testing all sorts of questions, and instruct the ai and collect different results)

Ai agent as an evaluator.

- how do we want to formulate the test,
- ethical
- requirements

- ai agent to conduct the testing for our solution

get the ai agent to do it at a bigger scale.

dig out some literature reviews or testing ai solutions in healthcare to create our ai tester.

- usability surveys
- send the form to sarah for double check.

## 28/08/2026

- E-diva website was created to store the ISupport resources and tailor to provide to each country worldwide

## 02/09/2026

- Scalability
- Cost
- List of what’s in the db
- Instructions on how to add resources to db
- More resources in the db
- Display day
- Evaluation plan

## 09/09/2026

- Naming of the references
- Just website
- Validate functionality
- Evaluation session
  - Range of different experiment
- Health point nz
- Project companion as the base of the resources for the next person so we can hand it over

## 16/09/2026

- Input and retrieve
- We’re providing interface to make it more user friendly
- Accuracy of the response
  - Everything functions correctly
  - Overall functionality
  - General software development testing
    - Testing suite
- Apply different
  - Response recall accuracy
  - Answer quality (answers come from knowledgebase)
  - Safety
- Latency
  - Recognition
  - Design experiment to do that
- Input quality
  - Answer quality
- Lip sync
  - Interface
  - Consistency
- Scalability
- Performance
  - Function testing?
- Cost
  - For average use

- Delirium edge question?

## 07/10/2026

- Digital human
- Mobile humanised way of
- AI Overview
- The statistical figure of **83,000 people living with dementia mate wareware** in Aotearoa New Zealand originates from data modeling compiled by Alzheimers New Zealand.
- Human feedback
- Different language
- Memories
- Personalised support
- Digital person to look after the resources (idea of the project)
  - Reflect that idea in the poster

- Include research questions and the evaluations should answer those questions.
- architecture design, architecture design diagram, for section 3 write about what we each did (seperate JooHyun and Richman)

[Update if participant sessions were collected and verified after 21 September; see docs/study/data-state.md.]

---

# Database

Cloud Knowledge Base using Supabase with pgvector

The app originally stored its dementia-care knowledge base as a static JavaScript file bundled inside the app. While functional, this approach had significant limitations: updating content required a full app redeployment, and all vector similarity computations ran on the user's device, meaning every new user had to wait for 70 embeddings to be generated and cached before the AI could answer questions.

We evaluated three free-tier cloud options — Firebase Firestore, Supabase, and Pinecone — against the specific needs of this project.

Firebase was ruled out because it has no native vector search capability, meaning device-side cosine similarity computation would have remained unchanged — solving only the content management problem, not the performance one.

Pinecone is purpose-built for vector search but stores only small metadata snippets alongside vectors, not full article content. This would have required maintaining a second database for the full text of each article, adding unnecessary complexity for a knowledge base of 70 chunks.

Supabase was selected for the following reasons:

1. Single database for everything. Article content, metadata, and vector embeddings are all stored in one PostgreSQL table. No secondary storage is needed.

2. Server-side vector search via pgvector. The `match_chunks` SQL function performs cosine similarity ranking entirely on the server. The app sends one query embedding and receives the top matching articles — no on-device maths, no embedding cache required.

3. Zero-cost at this scale. Supabase's free tier provides 500 MB of database storage. The entire knowledge base with embeddings occupies less than 5 MB, leaving substantial headroom for future expansion.

4. No-code content management. Supabase Studio provides a spreadsheet-like table editor. Knowledge base articles can be added, edited, or removed by a non-developer without any code changes or app redeployment — directly addressing the requirement for the knowledge base to be maintainable independently of the development cycle.

5. Official React Native / Expo support. The `@supabase/supabase-js` SDK integrates directly with the existing Expo project without additional native configuration.

The migration was implemented as a one-time script (`scripts/migrate-to-supabase.mjs`) that reads the existing knowledge base, generates embeddings via OpenAI, and uploads all chunks to Supabase. After this runs, the local knowledge base file is retained only as a backup — the live app reads exclusively from Supabase.
