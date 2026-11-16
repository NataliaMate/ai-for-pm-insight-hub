---
title: "Discovery interview: Senior Business Analyst at an insurer (Throughline concept)"
date: 2026-09-11
participants: "Nina (Product Researcher, Throughline); Henrik (Senior Business Analyst, Alderhaven Insurance)"
duration: "16 min"
---

**Nina** [00:00:04]: Hi Henrik, can you hear me? I think your camera is off, which is totally fine.

**Henrik** [00:00:09]: Yes, I can hear. Camera is off because the company laptop does not like video and Teams at the same time. Welcome to enterprise.

**Nina** [00:00:18]: Ha, understood. Thanks for joining. I'm researching an early idea called Throughline, a workspace where BAs and PMs build personas, journey maps, hypotheses and roadmaps from interview evidence. I want to understand how you work today, not pitch. Is it okay to record?

**Henrik** [00:00:40]: Yes, I was told it is fine. Just keep the insurer's name out of anything public, please. And customer names, of course.

**Nina** [00:00:48]: Absolutely, everything's anonymized. Tell me about your role.

**Henrik** [00:00:53]: I am a senior business analyst at Alderhaven Insurance, in the digital claims area. Eleven years in the company, nineteen in analysis overall. My team is five BAs, two product owners, a delivery manager. We work on the claims portal and the broker portal. At any time I have, I would say, three live initiatives and a long tail of change requests.

**Nina** [00:01:25]: What does the documentation burden look like?

**Henrik** [00:01:29]: Heavy. I do not say that as a complaint, it is the job. Every requirement needs a source, an owner, a sign-off. Auditors ask. For a medium initiative I produce a business requirements document, user stories, a traceability matrix, process models. I would spend, honestly, twenty hours a week in Confluence and Word and Excel, and another ten in Jira.

**Nina** [00:02:05]: Twenty plus ten. And personas?

**Henrik** [00:02:09]: We have personas, yes. We have six official ones for claims: the policyholder with a simple claim, the policyholder in distress after a large loss, the broker, the claims handler, the loss adjuster, the fraud analyst. They were created by a research agency two years ago and they sit in Confluence. When I start an initiative I take the relevant persona and extend it. I do not create from nothing, because everything must be approved by the design authority.

**Nina** [00:02:50]: How often are those six updated?

**Henrik** [00:02:54]: Officially, annually. In practice every eighteen months, if there is budget. Last update was in March. I did the broker one myself, from nine interviews, and it took me three weeks, because of the review rounds. Review is where time goes. Three stakeholders, each with comments in a different format. One in Word with tracked changes, one in a PDF with sticky notes, one in an email.

**Nina** [00:03:30]: Do people actually use them after sign-off?

**Henrik** [00:03:34]: Yes. I know this is not fashionable to say, but yes. A new project cannot get funding gate approval without naming the persona it serves and linking the journey. It is a checklist item. And, to be fair, it helps; when a product owner proposes a feature, I ask, "which persona, which step of the journey", and sometimes there is silence, and then we have learned something.

**Nina** [00:04:08]: So the persona and journey are a control point.

**Henrik** [00:04:11]: A control point and a shared language. Between business, IT, compliance. Without them each person invents their own customer.

**Nina** [00:04:25]: Walk me through journey mapping.

**Henrik** [00:04:29]: Journey maps are in Visio, and a few in Miro now, because the innovation team pushed Miro, but compliance does not allow us to store anything sensitive there, so Miro is for workshops only and then I redraw into Visio or into Confluence with a table. I know. Redraw. It is stupid. But the export from Miro is an image, and an image is not accepted as a controlled document.

**Nina** [00:05:08]: Why not accepted?

**Henrik** [00:05:11]: Two reasons. It has no version control and no change history that an auditor can follow. And the second is accessibility. We are required to meet WCAG standards for internal documents too, since some of our staff use screen readers. A picture of sticky notes with no text alternative is non-compliant. So I have to keep a text version of every journey map, structured, with headings. I have a colleague who is blind, she is a claims handler, and she literally cannot read our Miro exports. This is not theoretical.

**Nina** [00:06:00]: That's really important, thank you. So the artifact needs a structured, accessible representation.

**Henrik** [00:06:06]: Yes. Structured first, pretty second. Not the other way around, as most tools do.

**Nina** [00:06:15]: How do you handle hypotheses?

**Henrik** [00:06:19]: We call them business assumptions, inside the business case template. There is a section: assumptions, risks, dependencies. Each assumption must have a validation method and an owner. I keep a register in Excel, around forty rows per initiative. Every row gets an ID, ASM-something, and it links to a requirement ID, and the requirement links to a story in Jira.

**Nina** [00:06:55]: So that's your traceability chain.

**Henrik** [00:06:58]: Yes. Interview evidence, to assumption, to requirement, to story, to test case. And, I would say, if I cannot show the chain, I do not put the requirement in. That is my rule. Every claim must link to a source, otherwise it is an opinion.

**Nina** [00:07:25]: How do you maintain that chain today?

**Henrik** [00:07:29]: By hand. In Excel. It is a matrix, requirements on rows, sources on columns. A tool did exist, a requirements management product, but it was retired, costs too much per seat. So the matrix breaks, constantly. Someone renames a Jira ticket and my link is dead. I spend maybe three hours a week fixing links. Three hours. I could write a book.

**Nina** [00:08:00]: Do you ever link to the specific interview quote?

**Henrik** [00:08:04]: To the interview, to the transcript, with a page and line number if I am being careful. Honestly, the evidence is the weakest link. The business accepts "the interviews showed" when they should demand the exact quote.

**Nina** [00:08:25]: What about the roadmap and backlog, who owns what?

**Henrik** [00:08:29]: The roadmap belongs to the product owner and the head of product. Not to me. I own the backlog's quality: that each item is understood, testable, traceable. The ordering, they decide. Sometimes the BA community says "we should own roadmap", I disagree. It is a different accountability. The product owner is accountable for outcome. I am accountable for correctness.

**Nina** [00:09:05]: Do you feel a split between those two?

**Henrik** [00:09:09]: There is a grey zone. Where a product owner is junior, the BA ends up doing the roadmap anyway. But I would not want that in principle.

**Nina** [00:09:22]: Now, I want to ask about something new. Imagine a tool that takes interview transcripts and auto-drafts personas, journey maps, and tags the quotes by theme. What's your reaction?

**Henrik** [00:09:38]: Nervous. Very. Not because I am against technology, I use some of it already. But, a persona is a statement that the bank, sorry, the insurer, is willing to be audited on. If a model produced it and I cannot explain how, then I am the one in the audit meeting. "Why does this persona say fear of fraud is her top concern?" And I say, the software said. No. That does not work.

**Nina** [00:10:15]: What if every statement linked to the source quote?

**Henrik** [00:10:19]: Then it is a proposal that I validate. I could accept that for tagging, as a first pass, as long as I confirm each tag. A tag, fine. A synthesized persona that I did not construct, I would not sign. I would rebuild it by hand anyway, so what did I save? Maybe an afternoon. Not worth the risk.

**Nina** [00:10:50]: Interesting. So tagging yes, synthesis no.

**Henrik** [00:10:54]: Tagging yes with confirmation. Synthesis, only as a suggestion I rewrite myself.

**Nina** [00:11:05]: What about a dedicated tool for all of it, versus what you have now?

**Henrik** [00:11:10]: It would be another system to bring through procurement and security review. In this company that is, roughly, nine months. Vendor risk assessment, data residency, SSO, penetration test results. If it holds interview recordings it is personal data, so data protection impact assessment too. So the tool would have to be extraordinary for me to start that. I have Confluence, Jira, Excel, Visio. They are ugly but they are approved.

**Nina** [00:11:50]: So the barrier is procurement, not product.

**Henrik** [00:11:54]: Mostly. But a good product might make my director push for it. What would make her push is if I can show audit time reduced. Last year the internal audit of the broker portal took us four working weeks of evidence gathering. If a tool produced the trace report in one click, she would listen.

**Nina** [00:12:25]: What would that be worth per seat?

**Henrik** [00:12:29]: I do not set the budget. But I know the numbers we compare against. The retired requirements tool was around ninety euros a seat a month. Confluence is perhaps six. For something that replaces the matrix and the evidence work, a department would perhaps accept forty to sixty euros per seat per month, for ten seats, if on our cloud tenant with SSO. For twelve people. Nothing without SSO.

**Nina** [00:13:05]: That's very specific, thank you. How many interviews do you run per quarter?

**Henrik** [00:13:10]: Me personally, perhaps ten. The team altogether, twenty-five to thirty. Many are internal: claims handlers, brokers. Policyholders are harder, there is consent and a legal process.

**Nina** [00:13:30]: A tangent, if you don't mind. When something changes, say regulators change a rule, how does that flow into personas?

**Henrik** [00:13:38]: It does not, mostly. It flows into requirements. The persona says the claims handler needs to see the policy summary; the regulation says they must display a disclosure. That goes straight to requirements, with the regulation as a source. Which is another type of evidence, by the way. Not interviews. A tool that only knows interviews would be half useful.

**Nina** [00:14:10]: Good point. Evidence is more than quotes.

**Henrik** [00:14:13]: Interviews, regulations, claims data, complaints. All sources. Each should be linkable.

**Nina** [00:14:25]: One more. What do you like about how things work now?

**Henrik** [00:14:29]: Version history, approval workflow in Confluence, the audit trail. Boring, reliable. I trust it. When I change a persona, there is a record of who approved it and when. If your tool loses that, I lose the reason to use it.

**Nina** [00:14:55]: Great. Anything I missed?

**Henrik** [00:14:58]: Maybe that people outside this area think documents are the problem. They are not. Unlinked documents are the problem. Everything else I can live with.

**Nina** [00:15:12]: That's a great place to stop. Thank you, Henrik.

**Henrik** [00:15:16]: You are welcome. Good luck.
