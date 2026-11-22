> **Draft for a US lawyer to review.** This is not legal advice. Do not publish or rely on it before that review.

# Store listing

This file holds the text and the form answers for the App Store and Google Play. It describes the launch build: no account, records stored on the phone, no ads, no install-tracking or third-party analytics tools, no AI features, and usage counts that are sent only if the user agrees.

Marks used in this file:

- `[UNSURE: ...]` means we are not sure. Check it in the store console or ask the lawyer.
- `[TO CONFIRM: ...]` means a fact about the build that someone must check.

Rules for every line of store text: plain words, no exclamation marks, no claims about results, no advice about doses, no names of other apps, no price in the app name, subtitle or screenshots.

## 1. App Store (iPhone)

| Field | Limit | Text | Length |
|---|---|---|---|
| App name | 30 | `[APP NAME]: GLP-1 Tracker` | 15 plus the name, so the name can have up to 15 characters |
| Subtitle | 30 | `Semaglutide & tirzepatide log` | 29 |
| Keywords | 100 | `glp1,orforglipron,liraglutide,pill,shot,injection,oral,weekly,reminder,medication,weight,symptom` | 96 |

Other subtitle choices, if search data points another way:

- `Tirzepatide, semaglutide log` (28)
- `Tirzepatide & orforglipron log` (30)

Notes:

- The subtitle and the keywords use generic drug names only. No brand names go in the app name, the subtitle or the keyword field. [UNSURE: whether brand names may go in the keyword field at all. This is question 5 for the lawyer. Until it is answered, leave them out.]
- The keyword field does not repeat words that are already in the name or subtitle (GLP-1, tracker, semaglutide, tirzepatide, log).
- The word "loss" is left out of the keywords on purpose. [UNSURE: it would match more searches, and the field is not shown to users, but it sits close to a results claim. Owner to decide with the lawyer.]
- Pick the final subtitle after checking search popularity for the candidate words (plan, section 13).

**Description.** Use the Google Play long description in section 2, with one change: replace the "Which medications" paragraph with the brand-free version given below it. [UNSURE: the plan keeps brand names out of the App Store name, subtitle and keywords. It does not say whether the App Store description may carry them. The brand-free version is the safer choice.]

**Promotional text (optional, 170).** `Log GLP-1 shots and pills, weight and side effects. No sign-up. Your records are stored on your phone, and you can export them any time.` (136)

## 2. Google Play

| Field | Limit | Text | Length |
|---|---|---|---|
| App name | 30 | `[APP NAME]: GLP-1 Tracker` | 15 plus the name |
| Short description | 80 | `Log GLP-1 shots and pills, weight and side effects. No sign-up. Export any time.` | 80 |

**Long description (limit 4,000 characters):**

```text
[APP NAME] is a simple log for people who take a GLP-1 medication, by injection or by pill.

WHAT YOU CAN DO
• Log each shot or pill in a few taps
• Log your weight and your side effects
• Get reminders for your next dose
• See an estimated medication level chart for some brand-name weekly shots, with numbers from US prescribing information
• See a weekly summary of your numbers
• See a fixed "contact your doctor right away" message if you log certain serious symptoms
• Export all your records at any time, and restore them from your own export file

NO SIGN-UP
You do not need an account. Your records are stored on your phone. There are no ads.

OUR THREE PROMISES
1. Free features stay free. Everything in the list above is free. It will stay free for as long as we run [APP NAME]. Features we release before a paid plan goes on sale join the free list. Features on the free list will not move into a paid plan.
2. Fair billing. There is no paid plan today. We plan to sell a paid plan called Pro later, at a planned price of $29.99 a year. It will have no free trial that turns into a charge on its own. At any one time, in the same app store, every new subscriber to the same plan pays the same price. The only exception is a founder price for a limited number of places. As long as your subscription does not lapse, your renewal price will not be higher than the price you first paid. The app will remind you 14 days before a yearly plan renews.
3. Your data is yours. You can export all your records at any time, without signing up. If we ever stop running [APP NAME], we will give 90 days' notice first, and export will keep working during those 90 days.
If a law or an app store review requires us to change something here, we will do it and write down the reason. The full page, with a change log, is here: [PROMISE PAGE URL]

WHICH MEDICATIONS
You can log any GLP-1 medication, taken as a shot or as a pill. This includes semaglutide, tirzepatide, liraglutide and orforglipron. In the United States these are sold under brand names such as Wegovy, Ozempic, Zepbound, Mounjaro, Rybelsus, Saxenda and Foundayo. Brand names are used here only to help you find your medication. They are trademarks of their owners. [APP NAME] is not affiliated with, endorsed by or sponsored by any drug maker.

WHAT THIS APP IS NOT
[APP NAME] is a logging tool. It is not a medical device. It does not diagnose, treat, cure or prevent any condition. It does not give medical advice, and it does not tell you what dose to take. The estimated medication level chart is an estimate based on numbers from US prescribing information. It is not a measurement, and it cannot be used to adjust your dose. Talk to your doctor before you make decisions about your medication. If you think you have a medical emergency, call 911.

PRIVACY
• No account
• Your records are stored on your phone
• No ads, no ad tracking, no third-party analytics tools
• If you agree, the app sends us simple usage counts tied to a random ID, such as whether you logged a dose this week. The counts do not include your medication name, your dose, your weight or anything you type. You can turn this off in settings at any time. The counts tied to your ID are then deleted from our server.
Privacy policy: [PRIVACY POLICY URL]
Consumer health data privacy policy: [HEALTH DATA POLICY URL]

FOR ADULTS
This app is for people 18 and older.

WHO MAKES IT
[APP NAME] is made by [COMPANY LEGAL NAME], a small independent company registered in Hong Kong.
Questions: [CONTACT EMAIL]
```

**Brand-free "Which medications" paragraph, for the App Store description:**

```text
WHICH MEDICATIONS
You can log any GLP-1 medication, taken as a shot or as a pill. This includes semaglutide, tirzepatide, liraglutide and orforglipron. [APP NAME] is not affiliated with, endorsed by or sponsored by any drug maker.
```

Notes:

- Each brand name appears once, in one sentence that only identifies the medications, followed by the no-affiliation line. [UNSURE: our compliance notes suggest adding the registered-trademark mark to each brand name and naming the trademark owners in the no-affiliation line. We could not check which mark each owner uses, so none is added here. Ask the lawyer, then read the marks from each owner's own site.]
- The section headings are in capitals only because store descriptions cannot show bold text. Change them to sentence case if you prefer.
- The "Our three promises" block carries every promise of the promise page in short form: the free list, the same-price rule, the renewal price cap, the 14-day reminder, export without sign-up and the 90 days' notice. If the promise page changes, change this block in the same store update. The long description is about 3,500 characters with this block (about 3,600 once the placeholders are filled in), under the limit of 4,000. Count again after any edit.
- [UNSURE: a store reviewer may object to a description that mentions a paid plan that is not on sale yet. If so, cut promise 2 down to its first sentence ("There is no paid plan today.") and keep the link to the promise page.]
- [TO CONFIRM: every bullet under "What you can do" works in the store build on the day of submission. Remove any that does not. The chart must be open for at least one medication.] As of 2026-11-22 the launch build draws the chart for four weekly shots (Wegovy, Ozempic, Zepbound, Mounjaro), from doses logged in mg. It draws none for a medication taken every day, for a weekly shot typed in under "Other / custom", for tirzepatide saved without the name Zepbound or Mounjaro, or from doses logged in units, mL or clicks. So the chart bullet says "some brand-name weekly shots", not every weekly shot.
- "Stored on your phone" is used without the word "only". Optional usage counts leave the phone, and the phone-backup question in the privacy policy is still open.

## 3. Screenshot captions

The first three screenshots, in this order (plan, section 6). No prices on any screenshot.

| # | Screen to show | Caption |
|---|---|---|
| 1 | Two phones side by side, each showing Today: one set up with a weekly shot and a shot logged, the other set up with a daily pill and a pill logged. (One profile holds one medication, so a single Today screen never shows both.) | `Log shots and pills in one place` |
| 2 | The first setup screen, or Today with no sign-in anywhere | `No sign-up. Your records are stored on your phone.` |
| 3 | Me, with "Backup and export" in view | `Export all your records any time` |

[TO CONFIRM: screenshots must show the real store build, with made-up sample entries only. Do not show a brand name in a screenshot for the App Store.] [UNSURE: whether a brand name inside a Google Play screenshot is acceptable. Safer to show a generic name there too.]

## 4. Apple: App privacy answers ("privacy label")

Apple counts data as "collected" when it leaves the phone and we can keep it. Records that are stored on the phone are not "collected". The only data that counts is the usage counts.

| Question | Answer |
|---|---|
| Do you or your third-party partners collect data from this app? | Yes |
| Is any data used to track the user? | No |
| Does the app use the advertising identifier? | No |

Data types to declare:

| Data type | Collected | Purpose | Linked to the user | Used for tracking |
|---|---|---|---|---|
| Health and fitness: Health | Yes | Analytics | Yes [UNSURE, see below] | No |
| Usage data: Product interaction | Yes | Analytics | Yes [UNSURE] | No |
| Identifiers: Device ID (the random install ID) | Yes | Analytics | Yes [UNSURE] | No |
| Other data: Other data types (the two setup answers that are not about health: what the user tracked with before, and where they heard about us) | Yes [UNSURE: whether these need their own entry] | Analytics | Yes [UNSURE] | No |

Every other data type: not collected. That covers contact info, financial info, location, sensitive info, contacts, user content, browsing history, search history, purchases, diagnostics, surroundings and body.

Open points:

- [UNSURE: "linked to the user".] The table declares "linked". Every stored count keeps the install ID next to the event, the same ID is declared above as a device ID, our privacy policy treats the ID and the counts as personal information, and a user who emails us their ID to ask for their counts ties an email address to it. Against that: there is no account, no name and no email in the app, and the ID is random and made by the app. Question for the lawyer: may we change these four answers to "not linked"? Until the lawyer says yes, keep "linked". Declaring too much is safer than declaring too little.
- [UNSURE: "Device ID" or "User ID".] The random install ID fits neither name well. "Device ID" is the closer one.
- [UNSURE: purchases.] When Pro goes on sale, revisit this table.
- [TO CONFIRM: the app's privacy manifest file says the same things as this table, and no library in the native shell collects anything else, such as crash reports.]
- Privacy policy URL: [PRIVACY POLICY URL]. Privacy choices URL (optional): [HEALTH DATA POLICY URL].
- Age rating: answer the questionnaire so the app is rated for adults. [UNSURE: the exact questions. Expect one about medical or treatment information. Choose the highest age rating the console offers, 18+ if it is there.]
- Availability: United States only.

## 5. Google Play: Data safety answers

Google counts data as "collected" when it is sent off the phone. Sending data to a company that only works for us, such as our hosting company, is not "sharing".

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes [TO CONFIRM: HTTPS only] |
| Which methods of account creation does your app support? | My app does not allow users to create an account |
| Do you provide a way for users to request that their data is deleted? | Yes. Turning usage counts off in settings deletes them. Users can also email [CONTACT EMAIL]. [UNSURE: whether the console asks this when there is no account] |

Data types to declare:

| Data type | Collected | Shared | Processed only briefly ("ephemerally") | Required or optional | Purpose |
|---|---|---|---|---|---|
| Health and fitness: Health info | Yes | No | No | Optional: users can choose | Analytics |
| App activity: App interactions | Yes | No | No | Optional | Analytics |
| Device or other IDs (the random install ID) | Yes | No | No | Optional | Analytics |

Every other data type: not collected and not shared. That covers location, personal info (name, email address, user IDs, address, phone number), financial info, messages, photos and videos, audio, files and docs, calendar, contacts, web browsing, and app info and performance.

Open points:

- [UNSURE: the two setup answers that are not about health may belong under "App activity: Other actions". Declaring them does no harm.]
- [UNSURE: calendar.] The app only writes a reminder. It does not read the phone's calendar or send anything from it. So "calendar" stays undeclared. [TO CONFIRM against the Android build.]
- [TO CONFIRM: the Android build's permission list.] Reminders may need the notification permission and an exact-alarm permission. Google asks for a separate declaration for some alarm permissions.

## 6. Google Play: Health apps declaration and other app content

| Item | Answer |
|---|---|
| Health apps declaration: health features | Tick "Medication and pain management" and "Nutrition and weight management". [UNSURE: check the exact names of the options in the console. Pick the ones that mean medication tracking and weight tracking.] |
| Is the app a regulated medical device? | No. Do not tick "Medical device apps" or "Clinical decision support". |
| Does the app connect to health data on the phone from other apps? | No [TO CONFIRM] |
| Human subjects research | No |
| Privacy policy | [PRIVACY POLICY URL] |
| Ads | No, the app does not contain ads |
| App access | All features are available without a login |
| Target audience | 18 and over only |
| Content rating questionnaire | Answer honestly. [UNSURE: how the questionnaire treats an app for logging prescription medication. It is not about illegal drugs.] |
| Countries | United States only |
| Developer account | A company account in the company's name, not a personal account (plan, section 13) |

Google's health policy expects an app that is not a medical device to say so in its description. The "What this app is not" paragraph does that. [UNSURE: whether Google wants that sentence nearer the top. If a reviewer asks, move the paragraph up.]

## 7. Before you submit

- [ ] [APP NAME] has 15 characters or fewer, or the name pattern is shortened
- [ ] Every placeholder in the description is filled in, and each link opens
- [ ] The privacy policy and the consumer health data privacy policy are live at their links
- [ ] The answers in sections 4 to 6 were checked again against the build being submitted
- [ ] No brand name in the App Store name, subtitle, keywords or screenshots
- [ ] No price in the app name, subtitle or screenshots
- [ ] The lawyer has answered question 5 (brand names in keywords)
