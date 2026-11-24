> **Draft for a US lawyer to review.** This is not legal advice. It is a list of questions and facts for a fee quote.

# Questions for a US lawyer

We are asking for a fixed-fee quote to answer six questions before we submit a health-related app to the US app stores. This brief gives the facts first, then the questions.

Where this brief says "as we understand it", we have read summaries only, not the law itself. Please correct us.

## What we are asking for

1. A fixed fee for short written answers to the six questions. For each one: the answer, the reason in a few lines, and what we should change.
2. A markup of the attached drafts (listed under question 4).
3. A note of anything urgent that we did not ask about.
4. Please tell us which questions fall outside your practice (questions 1 and 2 are about a national-security data rule, question 5 is about trademarks, question 6 is about copyright and drug labeling) and whether you can bring someone in.

Timing: we need the answers before we submit to the stores. Target date: [TARGET SUBMISSION DATE]. Our first test users in the United States start before that, on [BETA START DATE]. Please tell us which items must be in place before the first test user.

Contact: [CONTACT EMAIL]

## The facts

**The company.** [COMPANY LEGAL NAME] is a small independent private company registered in Hong Kong. It has no US subsidiary. [TO CONFIRM: whether it has any US office or staff.] Details of ownership and of where staff work will be given to you directly. They are not written in this file.

**The app.** [APP NAME] is a logging app for adults who take a GLP-1 medication by injection or by pill. It will be in the US App Store and US Google Play only, in English, submitted from company developer accounts. It is free at launch.

**What the launch version does.**

- The user logs shots or pills, weight and side effects, and can save questions for their doctor.
- It can make a calendar reminder file, which the user adds to the phone's own calendar. [TO CONFIRM: the store build is planned to set reminders on the phone itself. That is not built yet.]
- It shows a weekly summary that only adds up the user's own numbers.
- It shows an "estimated medication level" chart for four weekly shots, labelled as an estimate that cannot be used to adjust a dose. Three facts about the chart as the app stands today:
  - The chart is drawn only for a medication whose numbers we have read from the current US prescribing information (the FDA label, as published on DailyMed). We read them on 2026-11-22. The chart is open for the four weekly shots on the app's US list: Wegovy, Ozempic, Zepbound and Mounjaro. It is not drawn for the medications taken every day (Wegovy pill, Rybelsus, Ozempic pill, Foundayo, Saxenda), for a medication the user types in under "Other / custom", or for tirzepatide when the saved brand is neither Zepbound nor Mounjaro. Only doses logged in mg are drawn. Where there is no chart the app shows "An estimate for this medication is not available yet." For tirzepatide without one of the two brand names it says instead that the chart uses two numbers from US prescribing information, that they are stated differently for Zepbound and Mounjaro, and, for a user in the United States, where to choose the brand. [TO CONFIRM: we read the numbers from the labels ourselves. A clinical reviewer has not confirmed them yet. Labels change, so check before submission that none has changed since 2026-11-22.]
  - [TO CONFIRM] The chart is not drawn from logged doses alone. If the user says at setup that they have been on their dose for some weeks, the chart assumes earlier doses of the same amount (8 at most). It also draws the next 7 days, on the assumption that the user takes each planned dose from now on. A planned dose that is overdue and not logged is not counted. The app gives no advice about a missed dose.
  - [TO CONFIRM against the store build] The "how this is calculated" page names its source. It says that the two numbers the chart uses, the half-life and the time to peak, come from the pharmacokinetics section of the US prescribing information for the user's medication. It names that medication and gives the two numbers. It says how one number is chosen: where that section gives a single value or a median, it is used as it is, and where that section gives only a range, the middle of the range. So four of the eight numbers are the middle of a range, a figure the label does not print (for example a half-life of 132 hours for Zepbound, whose label says "approximately 5-6 days" in that section and "approximately 5 days" in another). The page does not call the numbers averages. It says the same two numbers are used for every person on the medication and are not measured in the user. It does not show the label's date or a link to it.
- If the user logs certain serious symptoms, it shows one fixed message: contact your doctor right away, or call 911. If what the user types suggests self-harm, it shows a crisis-line message (988) instead. The only place to type in the launch version is a box for questions to ask the doctor; what is typed there is checked too.
- It shows a list of warning signs for the user's own medication. The list is text from the FDA-approved Medication Guide of that medication, copied word for word: the part headed "What is the most important information I should know about ...?" and the serious side effects from the part headed "What are the possible side effects of ...?". We copied the text on 2026-11-22 from the label files that the National Library of Medicine publishes on DailyMed, for seven Medication Guides that cover nine brands (Wegovy and Wegovy tablets, Ozempic, Rybelsus and Ozempic tablets, Zepbound, Mounjaro, Saxenda, Foundayo). Four facts about the list as the app stands today:
  - The app adds no word to the guide's text, and does not shorten, reorder or highlight it. It shows these two parts and the one sentence about taking too much, not the whole guide, and says so. Runs of spaces are written as one, and the guide's bold type is not kept.
  - Above the list the app says: "From the Medication Guide for [brand], revised [date]. These are the manufacturer's words, approved by the FDA. Nothing here is written by this app." Under that it gives the address of the label's page on DailyMed as a link. [TO CONFIRM: the wording of these two lines is ours and has not been reviewed.]
  - The user opens the list from the settings screen, or from a button on the fixed message above. The list is always the whole list; the app does not point to one item.
  - A medication with no Medication Guide in the app shows no list, only: "This app has no Medication Guide on file for your medication. The Medication Guide comes with your prescription." [TO CONFIRM: a clinical reviewer has not compared our copies with the guides yet. Labels change, so check before submission that none has changed since 2026-11-22.]
- Besides the two chart numbers above, the app shows three more drug numbers of its own. All were read from the US prescribing information on 2026-11-22. At setup, the first dose step on the label is shown as a grey example of how to type a dose. When a dose in mg above the highest dose on the label is typed, at setup or when a dose is logged, the app asks once whether an extra digit was typed, then lets the user go on. The question names the number as "the highest dose in the US prescribing information for" a US brand, for example Wegovy; a user whose medication has another brand name, or none, is shown the US brand of the same medication. After a pill, the app shows the wait where the label states one, in the label's words: "wait at least 30 minutes before you eat, drink or take other oral medications" (Wegovy pill, Rybelsus and Ozempic pill; none for Foundayo). It says nothing else about how to take a tablet. A medication whose numbers do not all have their label source in the app shows none of these and can only be logged. [TO CONFIRM: a clinical reviewer has not confirmed these numbers yet.]
- It exports all records to a file, and restores from that file.

**What it does not do.** No dose calculator. No advice about doses. No unit conversion. No account or sign-in. No ads. No install-tracking or third-party analytics tools. No AI features and no calls to a model. No sale of medication, no price comparison, no referrals. Not offered to anyone under 18: setup stops if the user checks "Under 18".

**Where data is.**

- The user's records are stored on the user's phone. We do not get a copy. The only items the app sends are the usage counts in the next line.
- Usage counts are the only data the app sends. They are sent only if the user agrees on a consent screen. Each count carries a random install ID made by the app, the app version, and the number of days since the user finished setup (a number, not a date). The events are: setup finished (with three answers: how long the user has taken the medication, what they used before to keep track, where they heard about us, plus injection or pill); activated; logged a dose this week, yes or no, with the number of the week; week-2 active; four-week streak met; marked the medication as paused or stopped; tapped "I would want this" under "Want Pro?". The counts never carry the medication name, the dose, weight, symptoms or typed text.
- Our server stores the date each count arrived (not the time of day). The day number says how many days after setup the event happened. Together with the arrival date it gives an approximate date. For counts sent late (usage counts turned on later, or the phone offline) it does not: the arrival date is then later than the event. The server does not store the IP address with the counts. [TO CONFIRM: what the hosting company logs.]
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

## Question 6. May the app show Medication Guide text word for word, with that attribution?

Facts: see "It shows a list of warning signs" under "What the launch version does". The text was written by the drug makers (Novo Nordisk and Eli Lilly) and approved by the FDA as part of each product's labeling. We took it from the public label files on DailyMed. We have no agreement with either company. The app is free at launch; a paid plan is planned for later, and this list would stay free.

As we understand it: a Medication Guide is written by the manufacturer, not by the government, so it is not a US government work, and we have found no statement that it is in the public domain. The label files on DailyMed are public, but we have read only general descriptions of the terms for reusing them, not the terms themselves. Each guide ends with the sentence "This Medication Guide has been approved by the U.S. Food and Drug Administration."

Please tell us:

1. May we reproduce these parts of each Medication Guide word for word inside the app? Does it matter that we show parts and not the whole guide, and that we drop the bold type?
2. Do we need permission from the manufacturers, or does a rule, a license or fair use cover this? If permission is needed, from whom, and is there a usual way to ask?
3. Do the terms of DailyMed or of the National Library of Medicine put conditions on copying label text into an app, such as a notice, a date, or a link back?
4. The attribution line names the manufacturer and the FDA: "These are the manufacturer's words, approved by the FDA. Nothing here is written by this app." Could it suggest that the manufacturer or the FDA endorses, approves or is connected with our app? What wording would you use? Should the line name the company?
5. Brand names appear in the guide text itself, many times, in capital letters. Does that change your answer to question 5?
6. Showing the manufacturer's safety text could look like we are giving out drug labeling. Does it bring any duty with it, for example to keep the text current within a set time after a label changes, or to show the whole guide? Does it move the app toward being a medical device, or toward any FDA rule on labeling or promotion?
7. If a guide changes and our copy is out of date for a time, what is our exposure? We show the guide's own revision date and the link to the current label.
8. Our draft terms say the app "does not give medical advice" and "does not tell you what dose to take, when to change your dose or whether to stop" (`terms.md`). The guide text we show contains sentences such as "Stop using ... and call your healthcare provider right away if ...". They are the manufacturer's words and are marked as such. Do the terms, the store listing or the in-app notice need a sentence about this quoted text? The store listing and the promise page do not mention the list yet. [TO CONFIRM: add it to both once this question is answered.]

## Not asked now

These are outside the six questions. Please flag any that you think cannot wait.

- Whether the estimated medication level chart could make the app a medical device under FDA rules.
- Subscription and automatic-renewal laws. We will ask before the paid plan goes on sale.
- Hong Kong privacy law. We will ask a Hong Kong lawyer.
