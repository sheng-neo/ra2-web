> **Draft for a US lawyer to review.** This is not legal advice. It is a list of questions and facts for a fee quote.

# Questions for a US lawyer

We are asking for a fixed-fee quote to answer five questions before we submit a health-related app to the US app stores. This brief gives the facts first, then the questions.

Where this brief says "as we understand it", we have read summaries only, not the law itself. Please correct us.

## What we are asking for

1. A fixed fee for short written answers to the five questions. For each one: the answer, the reason in a few lines, and what we should change.
2. A markup of the attached drafts (listed under question 4).
3. A note of anything urgent that we did not ask about.
4. Please tell us which questions fall outside your practice (questions 1 and 2 are about a national-security data rule, question 5 is about trademarks) and whether you can bring someone in.

Timing: we need the answers before we submit to the stores. Target date: [TARGET SUBMISSION DATE]. Our first test users in the United States start before that, on [BETA START DATE]. Please tell us which items must be in place before the first test user.

Contact: [CONTACT EMAIL]

## The facts

**The company.** [COMPANY LEGAL NAME] is a small independent private company registered in Hong Kong. It has no US subsidiary. [TO CONFIRM: whether it has any US office or staff.] Details of ownership and of where staff work will be given to you directly. They are not written in this file.

**The app.** [APP NAME] is a logging app for adults who take a GLP-1 medication by injection or by pill. It will be in the US App Store and US Google Play only, in English, submitted from company developer accounts. It is free at launch.

**What the launch version does.**

- The user logs shots or pills, weight and side effects, and can save questions for their doctor.
- It can make a calendar reminder file, which the user adds to the phone's own calendar. [TO CONFIRM: the store build is planned to set reminders on the phone itself. That is not built yet.]
- It shows a weekly summary that only adds up the user's own numbers.
- It is planned to show an "estimated medication level" chart, labelled as an estimate that cannot be used to adjust a dose. Three facts about the chart as the app stands today:
  - [TO CONFIRM] No chart is open yet. The chart is drawn only for a medication whose numbers we have read from the FDA label, and no medication has such numbers yet. Until one does, the app shows "An estimate for this medication is not available yet." Our plan is not to submit to the stores while that is true for every medication.
  - [TO CONFIRM] The chart is not drawn from logged doses alone. If the user says at setup that they have been on their dose for some weeks, the chart assumes earlier doses of the same amount (8 at most). It also draws the next 7 days, on the assumption that the user keeps to their schedule.
  - [TO CONFIRM] The "how this is calculated" page does not yet name the label the numbers come from. It will have to, for each medication, before a chart is opened.
- If the user logs certain serious symptoms, it shows one fixed message: contact your doctor right away, or call 911. If what the user types suggests self-harm, it shows a crisis-line message (988) instead. The only place to type in the launch version is a box for questions to ask the doctor; what is typed there is checked too.
- Until numbers are read from the FDA label, the app shows no drug number of its own: no dose example, no check against a highest dose, and no waiting time after a pill.
- It exports all records to a file, and restores from that file.

**What it does not do.** No dose calculator. No advice about doses. No unit conversion. No account or sign-in. No ads. No install-tracking or third-party analytics tools. No AI features and no calls to a model. No sale of medication, no price comparison, no referrals. Not offered to anyone under 18: setup stops if the user checks "Under 18".

**Where data is.**

- The user's records are stored on the user's phone. We do not get a copy. The only items the app sends are the usage counts in the next line.
- Usage counts are the only data the app sends. They are sent only if the user agrees on a consent screen. Each count carries a random install ID made by the app, the app version, and the number of days since the user finished setup (a number, not a date). The events are: setup finished (with three answers: how long the user has taken the medication, what they used before to keep track, where they heard about us, plus injection or pill); activated; logged a dose this week, yes or no, with the number of the week; week-2 active; four-week streak met; marked the medication as paused or stopped; tapped "I would want this" under "Want Pro?". The counts never carry the medication name, the dose, weight, symptoms or typed text.
- Our server stores the date each count arrived (not the time of day). With the day number, that gives the calendar date of setup and of each event. The server does not store the IP address with the counts. [TO CONFIRM: what the hosting company logs.]
- The counts go to our own server. It is rented from [HOSTING PROVIDER], a [US or European] company, in a data center in the United States. Staff of our company can reach the server from outside the United States, including from Hong Kong.
- When the user turns usage counts off, or deletes all data in the app, the counts tied to that install ID are deleted from the server. If the phone is offline, the request is sent again until the server confirms it. The server can also delete counts by age. [TO CONFIRM: the age limit is a server setting that must be switched on.]
- Users may also email our support address.
- We receive no user data from US clinics, insurers, employers or other companies. We have no data partnerships.

**Size.** We expect a few hundred installs in the first eight weeks. Our own plan treats 1,000 to 2,000 monthly users after a year as the mark to reach. So we expect to stay well under 10,000 US users in the first 12 months. We want to know what changes if we pass that number.

**Planned for later, not in the launch version.** Each would get its own consent screen first.

- An optional backup by email: the user's whole record file, encrypted, stored on our server in a US data center. [TO CONFIRM: who holds the key.]
- AI features, using a model host run by a US or European company in a US data center.
- A paid plan called Pro, sold as an in-app subscription, planned at $29.99 a year or $4.99 a month.

## Question 1. Does the Justice Department's bulk data rule cover a Hong Kong company that collects data straight from US users?

As we understand it: the rule (28 CFR Part 202, the "Data Security Program") treats Hong Kong as part of China. It restricts US persons and US companies from handing bulk sensitive personal data to "covered persons". For personal health data the threshold is 10,000 US persons in 12 months. It applies even to data that has been stripped of names or encrypted. Data that users enter into our app themselves is probably outside what the rule bans.

Please tell us:

1. Is our company a "covered person" under the rule?
2. Are the usage counts "personal health data" or another covered kind of data? Do records that stay on the user's phone count at all?
3. When a US user agrees to usage counts, or when a US app store distributes our app, is any US person taking part in a covered data transaction with us?
4. How is the 10,000 threshold counted in our case? What should we do before we reach it?
5. Our cautious plan is: take no user data from US organizations, make no partnerships that involve user data, and set up no US subsidiary. Is that enough? Is there anything else we must not do?

## Question 2. Is hosting by a US cloud company a restricted transaction?

Facts: we are the paying customer of the hosting company. The data sits in a US data center. Our staff reach it from outside the United States.

Please tell us:

1. Is the hosting contract a "vendor agreement" or any other restricted or prohibited transaction under the rule? If so, which side has the duties?
2. Could the hosting company be required to refuse us or to end the service? Is there anything we should tell them or ask them now?
3. Does the answer change if the host is a European company that runs a US data center?
4. Does it matter that our staff reach the data from Hong Kong, as against the data only sitting in the United States?
5. Do the answers change for the later features: the encrypted backup of full records, and prompts sent to a model host?
6. Does selling a subscription through the US app stores raise the same question?

## Question 3. Does California's Confidentiality of Medical Information Act apply to us?

As we understand it: the Act treats a business that offers software designed to maintain medical information, so that a person can manage their own information or a medical condition, as a "provider of health care". A California Supreme Court decision in 2026 dealt with the standard for claims after a data breach. We have read a law firm's summary only.

Please tell us:

1. Does the Act apply at launch, when users' records are stored on their phones and we do not hold them?
2. Are the usage counts "medical information" under the Act? They carry a random install ID and no name.
3. Would the Act apply once the optional encrypted backup exists?
4. If it applies now or later: what must change in the app, the policies, our security and the incident plan? What is our exposure?

## Question 4. Are our privacy documents enough?

Attached drafts:

- Privacy policy (`privacy-policy.md`)
- Consumer health data privacy policy (`consumer-health-data-privacy-policy.md`)
- Terms of use (`terms.md`)
- Incident plan, internal (`incident-plan.md`)
- Pricing and promise page (`pricing-and-promise.md`)
- Store listing text and the privacy answers for both stores (`store-listing.md`)
- The text of the in-app consent screen for usage counts [TO BE ATTACHED]

We tried to cover Washington's My Health My Data Act, the similar laws in Nevada and Connecticut, California's online privacy and consumer privacy laws, the Federal Trade Commission Act, the Health Breach Notification Rule, and the app stores' own rules.

Please review the drafts and tell us in particular:

1. **The word "anonymous".** The counts carry a random install ID that stays the same, and our server sees an IP address when a count arrives. May we call the counts "anonymous" anywhere? The policy drafts and the app both avoid the word and say "usage counts" (the consent screen is titled "Share usage counts?"). We will not use "anonymous" anywhere, including the store listing, unless you approve it.
2. **Consent.** Is one consent screen, shown before any count is sent, valid consent to collect under Washington law? What must the screen say? We share nothing, so we ask for no second consent.
3. **Health Breach Notification Rule.** Does it apply to us at launch? We hold no names, emails or phone numbers. Is a notice in the app, on the website and in the store listing enough? Do we need a toll-free phone number?
4. **The health data policy.** Are its content and its placement right? Does it also cover Nevada?
5. **California.** Does the California Consumer Privacy Act apply at our size? Is the California section right either way?
6. **Deletion.** If a user deletes the app without turning counts off, we can no longer tell which counts were theirs. Is a fixed age limit for counts an acceptable answer? What limit? (The server can delete counts older than a set number of days; the number is ours to set.)
7. **The promise page.** It makes public promises about free features, billing and notice before closing. What is the risk under federal and state rules on unfair or deceptive practices? Are "for as long as we run the app" and the clause about law and store review enough? What must we add before a subscription goes on sale?
8. **Terms.** Which governing law and which place for disputes should we choose? What liability cap? There is no account, so how should users agree to the terms? What does Apple require if we use our own license terms?
9. **Age.** The app is for adults. The only check is an "Under 18" box during setup. Is that enough?
10. **A non-US company.** Is the way the drafts describe the Hong Kong company and access from outside the United States enough? Do US documents need anything else from a foreign company, such as an agent in the United States?
11. **Medical device line.** Does anything in the drafts or the store text push the app toward being a medical device?

## Question 5. May brand drug names go in the iPhone keyword field?

Facts: the keyword field in the App Store is hidden from users. It affects search. Our current plan keeps brand names out of it.

- App name: `[APP NAME]: GLP-1 Tracker`
- Subtitle: generic drug names only, such as semaglutide and tirzepatide
- Keyword field: generic words only
- Google Play long description and our website: brand names appear once, in one sentence that identifies the medications, followed by a line that says we are not affiliated with, endorsed by or sponsored by any drug maker
- Inside the app: brand names appear in the list where users pick their medication, with the same kind of notice
- We do not plan paid ads

As we understand it: Apple's review guidelines 2.3.7 and 5.2.1 limit trademarked terms in metadata and the use of other parties' protected material. The drug makers enforce their marks actively against sellers of medication. We found no case against a logging app.

Please tell us:

1. May we put brand drug names in the hidden keyword field? What is the trademark risk, and what is the store review risk?
2. Is our use of brand names in the Google Play description and inside the app fair use? Do we need the registered-trademark mark and a line naming each owner?
3. Is "GLP-1" in the app name safe?
4. Is there any problem with generic drug names in the subtitle?

## Not asked now

These are outside the five questions. Please flag any that you think cannot wait.

- Whether the estimated medication level chart could make the app a medical device under FDA rules.
- Subscription and automatic-renewal laws. We will ask before the paid plan goes on sale.
- Hong Kong privacy law. We will ask a Hong Kong lawyer.
