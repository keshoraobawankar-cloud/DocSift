export interface EmailFormatDefinition {
  id: string;
  shortLabel: string;
  title: string;
  useCase: string;
  subject: string;
  body: string;
}

export const EMAIL_WRITING_FORMATS: EmailFormatDefinition[] = [
  {
    id: "formal",
    shortLabel: "Formal",
    title: "Formal Business Format",
    useCase: "External clients, official requests & formal correspondence",
    subject: "[Subject / Reference] — [Organization or Project]",
    body: `Dear [Recipient Name],

I am writing regarding [topic or purpose of email].

[Provide brief background details, key context, or reference any attached documents.]

Could you please [specific action requested] by [Date / Time]? Please let me know if you require any additional information.

Sincerely,

[Your Name]
[Your Title]
[Contact Information]`,
  },
  {
    id: "bluf",
    shortLabel: "BLUF",
    title: "Executive BLUF (Bottom Line Up Front)",
    useCase: "Quick approvals, leadership updates & time-sensitive decisions",
    subject: "[Action Needed]: [Topic] — By [Date]",
    body: `Hi [Recipient Name],

BLUF: Requesting [approval / decision / input] on [topic] by [Date at Time].

Key Points:
• [Point 1 — current status or context]
• [Point 2 — impact or constraint]
• [Point 3 — recommended option]

Next Step: Please reply with your confirmation before [Date / Time].

Best,
[Your Name]`,
  },
  {
    id: "follow-up",
    shortLabel: "Follow-Up",
    title: "Follow-Up & Reminder Format",
    useCase: "Checking in on pending replies, approvals, or upcoming deadlines",
    subject: "Following Up: [Original Subject]",
    body: `Hi [Recipient Name],

Following up on my previous note regarding [topic].

Wanted to check if you had a chance to review [item / document], as we are aiming to finalize by [Date]. Let me know if there are any questions or if you need anything else from my side.

Thanks,
[Your Name]`,
  },
  {
    id: "meeting",
    shortLabel: "Meeting",
    title: "Meeting Request & Agenda Format",
    useCase: "Scheduling calls, reviews, and calendar-ready invites",
    subject: "Meeting Request: [Topic] — [Date] at [Time]",
    body: `Hi [Recipient Name],

I would like to schedule a [duration]-minute meeting to discuss [goal or decision].

Proposed Details:
• Date: [Day, Month Date, Year]
• Time: [Start Time – End Time, Timezone]
• Location / Link: [Room or Meeting URL]

Agenda:
1. [Agenda item 1]
2. [Agenda item 2]
3. [Next steps & owners]

Please let me know if this time works or suggest an alternative slot.

Best,
[Your Name]`,
  },
  {
    id: "action-recap",
    shortLabel: "Action Recap",
    title: "Action Items & Next Steps Format",
    useCase: "Post-meeting summaries, task handoffs & team alignment",
    subject: "Recap & Next Steps: [Project / Meeting Name]",
    body: `Hi [Team / Recipient Name],

Thanks for the discussion today. Below is a summary of agreed action items and deadlines:

1. [Owner Name] — [Action item] (Due: [Date])
2. [Owner Name] — [Action item] (Due: [Date])
3. [Owner Name] — [Action item] (Due: [Date])

Please reply if anything needs adjustment.

Thanks,
[Your Name]`,
  },
  {
    id: "inquiry",
    shortLabel: "Inquiry",
    title: "Structured Inquiry / Clarification Format",
    useCase: "Academic, support, vendor, or administrative questions",
    subject: "[Course / Reference ID]: Question Regarding [Topic]",
    body: `Dear [Recipient Name],

I am reaching out regarding [course, account, or reference] with a quick question about [specific topic].

[State your concise question and any relevant details already reviewed.]

Thank you for your time and assistance.

Best regards,
[Your Name]
[ID or Organization]`,
  },
];
