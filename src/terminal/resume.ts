// Resume content exposed as files under ~/resume.

export const ABOUT = `# John Jiang

Senior Staff Software Engineer · San Francisco, California

Currently building an AI-native CRM at Clarify. Before that I spent five years
at Slack (most recently as a Senior Staff Technical Lead Manager), five years
at Atlassian across Sydney and San Francisco, and started my career at
Macquarie Group in Sydney.

I like building product end-to-end: experimentation and feature-flag
platforms, growth and onboarding, billing, desktop apps, and the occasional
Chrome extension.

See: experience/  education.md  contact.md
`;

export const CONTACT = `# Contact

Email:     johnjiang101@gmail.com
LinkedIn:  https://www.linkedin.com/in/johnjiang101
GitHub:    https://github.com/johnjiang

References available upon request.
`;

export const EDUCATION = `# Education

## University of Sydney
Bachelor of Information Technology (Honours)
Darlington, Sydney · 2007 - 2010

## Sydney Boys High School
97.95 UAI
Surry Hills, Sydney · 2001 - 2006
`;

export const CLARIFY = `# Senior Staff Software Engineer — Clarify
San Francisco, California · June 2024 - Current

Building an AI-native CRM that automatically captures customer conversations
and turns them into actionable records.

- Built core meeting recording and transcription features that capture customer calls and feed Clarify's AI assistant (Rep) and CRM records
- Developed a local desktop recorder in the Electron app for bot-free meeting capture, and debugged a user-facing auto-update loop in the desktop client
- Built a Chrome extension extending Clarify beyond the desktop app
- Built custom objects, letting customers define their own record types, fields, and relationships beyond built-in CRM entities
- Built the notification system alerting users to meetings, insights, and deal activity
- Designed and implemented Stripe billing in TypeScript: reverse trial, monthly/annual plans with a 20% annual discount, credit grants, and automated sales tax via Stripe Tax
- Designed Postgres row-level security for sensitive message data and resolved concurrency issues with advisory locks and upsert patterns
- Drove developer-experience improvements across a pnpm/Turborepo monorepo, including the pnpm 9 -> 11 upgrade path and custom ESLint rules
- Synthesized engineer 1:1 feedback into a leadership proposal on product direction, decision rights, metrics, and retention
`;

export const SLACK = `# Senior Staff Technical Lead Manager — Slack
San Francisco, California · March 2019 - June 2024

Senior Software Engineer (2019) -> Staff (2020) -> Senior Staff (2022) -> Senior Staff TLM (2023)

- Re-wrote and restructured the in-house experimentation platform end-to-end to support advanced feature rollout use-cases comparable to LaunchDarkly with a 99.99% SLO; thousands of active feature flags with weekly usage from over 500 engineers
- Maintained the in-house Experiments Framework used by teams across Slack to run hundreds of experiments and roll out new features
- Helped build a Python reporting system pre-computing hundreds of metrics daily to speed up Presto reports
- Maintained an in-house dashboarding tool (similar to Redash) used by over 50% of the organization
- Created a Chrome extension for debugging client-side logs to ease development
`;

export const ATLASSIAN = `# Senior Software Engineer — Atlassian
San Francisco, California / Sydney · October 2013 - March 2019

Software Engineer, Sydney (2013) -> Senior Software Engineer, San Francisco (2015)

- Joined a new team focused on connecting users to Atlassian value; A/B tested messaging to increase engagement, then built a platform for employees to create and launch email and in-product messaging campaigns
- Created a React framework for in-app messages (banners, flags, inline dialogs, modals) and an SPA for creating and reporting on campaigns
- Architected backend services for user targeting, and i18n support
- Created a Chrome extension for diagnosing analytics, adopted across the entire analytics organization
- SME for internal Python A/B testing infrastructure for deploying and analyzing experiments across Jira and Confluence; created email experimentation infrastructure
- Formed the first Jira Growth Squad to experiment with and implement onboarding flows to increase MAU
`;

export const MACQUARIE = `# Java/Python Developer — Macquarie Group Limited
Martin Place, Sydney · November 2009 - June 2013

Primary software developer maintaining two web applications, written in Java and Python respectively, for the Fund Linked Products business. The Java application is a transaction workflow management system for the products offered. The Python application is the source of truth for fund performance data and performs capital protection model calculations. The two systems are tightly coupled with various methods for communicating with each other.

- Developing new enhancements and bug fixes
- Supporting day-to-day queries from the business
- Testing changes using tools like JUnit, Concordion, Selenium and Jenkins
- Coordinating changes between teams
`;

// Ordered for the `resume` command, newest role first.
export const RESUME_FILES = [
  "about.md",
  "experience/clarify.md",
  "experience/slack.md",
  "experience/atlassian.md",
  "experience/macquarie.md",
  "education.md",
  "contact.md",
];
