<!-- Built by app/scripts/build-review-packet.ts (pnpm review-packet). Do not edit by hand: change the code or the script and build again. -->

# [APP NAME]: clinical review, first public version

From [COMPANY LEGAL NAME] · Contact: [CONTACT EMAIL] · Sent on [EFFECTIVE DATE]

Short packet, version `2aef874a`. Built by a script from the app's code, so the texts and numbers are the ones the app uses. Text in "quotation marks" is exact app text, label text, or a phrase a person might type. About 9,000 words: about 24 pages in a compact print layout, about 39 as a plain Word file.

## About this packet

[APP NAME] is a phone app for adults in the United States who take a GLP-1 medication their own doctor prescribed. People log doses, weight and how they feel. The app gives no dosing advice and does not diagnose. It is not a medical device. [COMPANY LEGAL NAME] is a small company with no tie to any drug maker.

This short packet holds only what the first public version shows or does: (1) the medication numbers, with the label words behind each; (2) the chart "Estimated medication level"; (3) the warning signs, copied word for word from the FDA Medication Guides; (4) the alert cards; (5) what raises an alert; (6) the limits we know of; (7) open questions.

Everything that is switched off in the first public version is left out: coping cards, the cards written for each rule, daily advice, workouts, food and protein, the Chinese text, and the pattern-by-pattern detail of the rules. The full packet (clinical-review-packet.md) has all of it, built from the same code, as optional background.

**How to mark it up.** Each item has a code (M-05, G-02, I-04, R-03), the same as in the full packet; the questions are numbered Q1, Q2 and so on. Mark an item **OK**, **Change** (with the words or number you would use, and the label section for a label fact), **Remove** or **Cannot say**, and say how serious it is: **must fix before launch**, **should fix**, or **suggestion**. A list by code is enough.

**No endorsement.** Your review is private advice to [COMPANY LEGAL NAME]. We will not use your name or say that a clinician checked the app. What the app shows stays our decision and our responsibility.

## Part 1. Medication numbers

At setup a US user picks one of 9 brands, or "Other / custom". The app uses four kinds of number from the label, and only these:

- **Dose steps.** Only the first step is used: it is the grey example in the box where the person types the dose they were prescribed ("For example, [first step]"). The app never suggests a dose or a step.
- **Highest dose.** A typing check only. When a person types a dose in mg above it, the app asks once, then lets them go on: "[amount] mg is more than the highest dose in the US prescribing information for [US brand] ([highest dose] mg). Did you type an extra digit? If it is correct, tap the button again."
- **Half-life and time to peak.** Used only for the chart (part 2), and kept only for weekly shots. Our rule: both numbers are read from section 12.3 (Pharmacokinetics) of the label, and from no other section. That section states a single value or a median: the app uses it. That section states only a range: the app uses the midpoint of the range. Days and weeks are turned into hours (1 day = 24 hours, 1 week = 168 hours).
- **Wait after a pill.** On the sheet where a pill is logged: "After your pill, wait at least [minutes] minutes before you eat, drink or take other oral medications." The main screen then counts the minutes down.

We read every number below from the current FDA label on DailyMed on 2026-11-22. Nobody outside our team has confirmed them. The first public version uses a number only when its label words are in this table; a medication without them can only be logged. Words are copied as they stand; " \| " marks a cell border in a label table. The brand name, the generic name and the way each medication is taken are from our code and were not checked against the label.

### Wegovy (semaglutide), shot, once a week

FDA label version 19, effective 2026-06-18: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee06186f-2aa3-4990-a760-757579d8f77b

| Code | Number | In the app | Label words (section) | Your correction |
|----|------------|------------|------------------------------------------------|------------|
| M-04 | How often | Once a week | "Administer WEGOVY injection once weekly, on the same day each week, at any time of day, with or without meals." (2.1) |   |
| M-05 | Dose steps (mg) | 0.25, 0.5, 1, 1.7, 2.4, 7.2 | "Starting Dosage \| 1 through 4 \| 0.25 mg" (2.2, Table 1); "5 through 8 \| 0.5 mg" (2.2, Table 1); "9 through 12 \| 1 mg" (2.2, Table 1); "13 through 16 \| 1.7 mg" (2.2, Table 1); "The maintenance dosage of WEGOVY for weight reduction in adults is either 1.7 mg or 2.4 mg (recommended) injected subcutaneously once weekly." (2.2); "For patients who tolerate the 2.4 mg dosage for at least 4 weeks and additional weight reduction is clinically indicated, the dosage may be increased to a maximum dosage of 7.2 mg subcutaneously once weekly." (2.2) Note: The label gives 7.2 mg only under "Weight Reduction in Adults", as a further increase after at least 4 weeks on 2.4 mg. For cardiovascular risk reduction in adults, for MASH in adults and for pediatric patients aged 12 years and older the last step is 2.4 mg. A step is any dose of the label's adult schedule, also one the label gives for one use only. The label gives one schedule for every pen, vial and syringe of this brand. |   |
| M-06 | Highest dose (mg) | 7.2 | "For patients who tolerate the 2.4 mg dosage for at least 4 weeks and additional weight reduction is clinically indicated, the dosage may be increased to a maximum dosage of 7.2 mg subcutaneously once weekly." (2.2) Note: Stated under "Weight Reduction in Adults" only. For cardiovascular risk reduction in adults, for MASH in adults and for pediatric patients aged 12 years and older the highest dose the label gives is 2.4 mg. The app uses this number only to catch a typing slip, so it takes the highest dose the label gives to any adult. |   |
| M-07 | Half-life | 168 hours (7 days) | "With an elimination half-life of approximately 1 week, semaglutide will be present in the circulation for about 5 to 7 weeks after the last injectable dose of 2.4 mg or 7.2 mg or oral dose of 25 mg." (12.3) The label states a single value, 1 week; the app uses 168 hours (7 days). |   |
| M-08 | Time to peak | 48 hours (2 days) | "Maximum concentration of semaglutide is reached 1 to 3 days post dose." (12.3) The label states a range, 1 to 3 days; the app uses 48 hours (2 days). Note: From the paragraph headed "WEGOVY Injection". The tablets have their own sentence (1 hour post dose). |   |

### Ozempic (semaglutide), shot, once a week

FDA label version 20, effective 2026-06-01: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=adec4fd2-6858-4c99-91d4-531f5f2a2d79

| Code | Number | In the app | Label words (section) | Your correction |
|----|------------|------------|------------------------------------------------|------------|
| M-12 | How often | Once a week | "Administer OZEMPIC once weekly, on the same day each week, at any time of the day, with or without meals." (2.1) |   |
| M-13 | Dose steps (mg) | 0.25, 0.5, 1, 2 | "Initiate OZEMPIC with a dosage of 0.25 mg injected subcutaneously once weekly for 4 weeks." (2.2); "After 4 weeks on the 0.25 mg dosage, increase the dosage to 0.5 mg once weekly." (2.2); "If additional glycemic control is needed after at least 4 weeks on the:" (2.2); "0.5 mg dosage, the dosage may be increased to 1 mg once weekly." (2.2); "1 mg dosage, the dosage may be increased to 2 mg once weekly." (2.2) Note: The steps to 1 mg and 2 mg are printed under the heading for glycemic control. For adults with type 2 diabetes and chronic kidney disease the label gives a maintenance dose of 1 mg. The label gives one schedule for every pen, vial and syringe of this brand. |   |
| M-14 | Highest dose (mg) | 2 | "The maximum recommended dosage is 2 mg once weekly." (2.2) Note: Printed under the heading for glycemic control. Section 13.1 names the same figure, 2 mg/week, as the maximum recommended human dose. |   |
| M-15 | Half-life | 168 hours (7 days) | "With an elimination half-life of approximately 1 week, semaglutide will be present in the circulation for about 5 weeks after the last dose." (12.3) The label states a single value, 1 week; the app uses 168 hours (7 days). |   |
| M-16 | Time to peak | 48 hours (2 days) | "Maximum concentration of semaglutide is reached 1 to 3 days post dose." (12.3) The label states a range, 1 to 3 days; the app uses 48 hours (2 days). |   |

### Zepbound (tirzepatide), shot, once a week

FDA label version 40, effective 2026-08-28: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=487cd7e7-434c-4925-99fa-aa80b1cc776b

| Code | Number | In the app | Label words (section) | Your correction |
|----|------------|------------|------------------------------------------------|------------|
| M-20 | How often | Once a week | "Administer ZEPBOUND once weekly at any time of day, with or without meals." (2.4) |   |
| M-21 | Dose steps (mg) | 2.5, 5, 7.5, 10, 12.5, 15 | "The recommended starting dosage of ZEPBOUND for all indications is 2.5 mg injected subcutaneously once weekly for 4 weeks." (2.1); "After 4 weeks, increase the dosage to 5 mg injected subcutaneously once weekly." (2.1); "The dosage may be increased in 2.5 mg increments, after at least 4 weeks on the current dose [see Dosage and Administration (2.2)]." (2.1); "7.5 mg/0.5 mL" (3); "10 mg/0.5 mL" (3); "12.5 mg/0.5 mL" (3); "15 mg/0.5 mL" (3) Note: The label names 5 mg, 10 mg and 15 mg as maintenance doses for weight reduction; 2.5 mg is for starting only. The label gives one schedule for every pen, vial and syringe of this brand. |   |
| M-22 | Highest dose (mg) | 15 | "The maximum dosage of ZEPBOUND for all indications is 15 mg injected subcutaneously once weekly." (2.2) |   |
| M-23 | Half-life | 132 hours (5.5 days) | "The elimination half-life is approximately 5-6 days in patients with overweight or obesity, and in patients with OSA and obesity." (12.3) The label states a range, 5 to 6 days; the app uses 132 hours (5.5 days). Note: Section 10 (Overdosage) of this label speaks of "the half-life of tirzepatide of approximately 5 days". The app reads the pharmacokinetics section, 12.3, only, and that section gives the range. With the single value of section 10 the number would be 120 hours. |   |
| M-24 | Time to peak | 24 hours (1 day) | "Following subcutaneous administration, the median time (range) to maximum plasma concentration of tirzepatide is 24 hours (8 to 72 hours)." (12.3) The label states a median, 24 hours; the app uses 24 hours (1 day). |   |

### Mounjaro (tirzepatide), shot, once a week

FDA label version 40, effective 2026-08-27: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d2d7da5d-ad07-4228-955f-cf7e355c8cc0

| Code | Number | In the app | Label words (section) | Your correction |
|----|------------|------------|------------------------------------------------|------------|
| M-28 | How often | Once a week | "Administer MOUNJARO once weekly, any time of day, with or without meals." (2.2) |   |
| M-29 | Dose steps (mg) | 2.5, 5, 7.5, 10, 12.5, 15 | "The recommended starting dosage of MOUNJARO is 2.5 mg injected subcutaneously once weekly [see Dosage and Administration (2.2)]." (2.1); "If additional glycemic control is needed, increase the dosage in 2.5 mg increments after at least 4 weeks on the current dose." (2.1); "5 mg/0.5 mL" (3); "7.5 mg/0.5 mL" (3); "10 mg/0.5 mL" (3); "12.5 mg/0.5 mL" (3); "15 mg/0.5 mL" (3) Note: Each increase is for when more glycemic control is needed. The label names no maintenance dose. The label gives one schedule for every pen, vial and syringe of this brand. |   |
| M-30 | Highest dose (mg) | 15 | "The maximum dosage of MOUNJARO is:" (2.1); "15 mg injected subcutaneously once weekly in adults." (2.1) Note: The same list gives 10 mg once weekly as the maximum for pediatric patients. The app is for adults. |   |
| M-31 | Half-life | 120 hours (5 days) | "The apparent population mean clearance of tirzepatide is 0.061 L/h with an elimination half-life of approximately 5 days, enabling once-weekly dosing." (12.3) The label states a single value, 5 days; the app uses 120 hours (5 days). |   |
| M-32 | Time to peak | 40 hours | "Following subcutaneous administration, the time to maximum plasma concentration of tirzepatide ranges from 8 to 72 hours." (12.3) The label states a range, 8 to 72 hours; the app uses 40 hours. Note: This label gives no median. The other tirzepatide label gives a median of 24 hours with the same range. |   |

### Wegovy pill (semaglutide), pill, once a day

FDA label version 19, effective 2026-06-18: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee06186f-2aa3-4990-a760-757579d8f77b

| Code | Number | In the app | Label words (section) | Your correction |
|----|------------|------------|------------------------------------------------|------------|
| M-36 | How often | Once a day | "Take one WEGOVY tablet orally once daily on an empty stomach in the morning with water (up to 4 ounces)." (2.1) |   |
| M-37 | Dose steps (mg) | 1.5, 4, 9, 25 | "Starting Dosage \| 1 through 30 \| 1.5 mg" (2.3, Table 2); "Dosage Escalation \| 31 through 60 \| 4 mg" (2.3, Table 2); "61 through 90 \| 9 mg" (2.3, Table 2); "Maintenance Dosage \| 91 and onward \| 25 mg" (2.3, Table 2) Note: The middle column of Table 2 counts days. |   |
| M-38 | Highest dose (mg) | 25 | "The recommended maintenance dosage of WEGOVY tablets is 25 mg orally once daily." (2.3) The highest dose in the label's adult schedule. The label does not call it a maximum in section 2. |   |
| M-41 | Wait after the pill (minutes) | 30 | "After taking a WEGOVY tablet, wait at least 30 minutes before eating food, drinking beverages or taking other oral medications [see Clinical Pharmacology (12.3)]." (2.1) Note: The label says "at least" 30 minutes. The wait covers food, beverages and other oral medications. |   |

### Foundayo (orforglipron), pill, once a day

FDA label version 10, effective 2026-07-29: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8ac446c5-feba-474f-a103-23facb9b5c62

| Code | Number | In the app | Label words (section) | Your correction |
|----|------------|------------|------------------------------------------------|------------|
| M-45 | How often | Once a day | "Take FOUNDAYO orally once daily, with or without food." (2.1) |   |
| M-46 | Dose steps (mg) | 0.8, 2.5, 5.5, 9, 14.5, 17.2 | "The starting dosage is 0.8 mg orally once daily." (2.1); "After at least 30 days on the 0.8 mg dosage, increase the dosage to 2.5 mg once daily." (2.1); "After at least 30 days on the 2.5 mg dosage, increase the dosage to 5.5 mg once daily." (2.1); "The dosage may be increased to the next dosage level (9 mg, 14.5 mg, or 17.2 mg once daily) after at least 30 days on the current dosage, based on treatment response and tolerability." (2.1) |   |
| M-47 | Highest dose (mg) | 17.2 | "The maximum dosage of FOUNDAYO is 17.2 mg once daily." (2.1) Note: Section 2.2 gives a lower maximum of 9 mg once daily when the tablet is used with a strong CYP3A4 inhibitor. The app does not know what other medicines a person takes. |   |
| M-50 | Wait after the pill | None shown | "Take FOUNDAYO orally once daily, with or without food." (2.1) |   |

### Rybelsus (semaglutide), pill, once a day

FDA label version 14, effective 2026-01-30: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=27f15fac-7d98-4114-a2ec-92494a91da98

| Code | Number | In the app | Label words (section) | Your correction |
|----|------------|------------|------------------------------------------------|------------|
| M-54 | How often | Once a day | "Take one RYBELSUS or OZEMPIC tablet orally once daily on an empty stomach in the morning with water (up to 4 ounces of water)." (2.1) |   |
| M-55 | Dose steps (mg) | 3, 7, 14 | "Starting Dosage (Initiation Phase) (Days 1 to 30): The recommended starting dosage is 3 mg orally once daily (this dosage is not effective for glycemic control)." (2.2); "Days 31 to 60: Increase the dosage to 7 mg orally once daily." (2.2); "Additional glycemic control is needed, increase the dosage to 14 mg orally once daily." (2.2) Note: From the part of section 2.2 headed "RYBELSUS: Recommended Dosage". Section 2.1 says the two tablet brands on this label "are not substitutable on a mg-to-mg basis". |   |
| M-56 | Highest dose (mg) | 14 | "Additional glycemic control is needed, increase the dosage to 14 mg orally once daily." (2.2) The highest dose in the label's adult schedule. The label does not call it a maximum in section 2. |   |
| M-59 | Wait after the pill (minutes) | 30 | "After taking RYBELSUS or OZEMPIC tablets, wait at least 30 minutes before eating food, drinking beverages or taking other oral medications [see Clinical Pharmacology (12.3)]." (2.1) Note: The label says "at least" 30 minutes. The wait covers food, beverages and other oral medications. |   |

### Ozempic pill (semaglutide), pill, once a day

FDA label version 14, effective 2026-01-30: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=27f15fac-7d98-4114-a2ec-92494a91da98

| Code | Number | In the app | Label words (section) | Your correction |
|----|------------|------------|------------------------------------------------|------------|
| M-63 | How often | Once a day | "Take one RYBELSUS or OZEMPIC tablet orally once daily on an empty stomach in the morning with water (up to 4 ounces of water)." (2.1) |   |
| M-64 | Dose steps (mg) | 1.5, 4, 9 | "Starting Dosage (Initiation Phase) (Days 1 through 30): The recommended starting dosage is 1.5 mg orally once daily (this dosage is not effective for glycemic control)." (2.2); "Days 31 to 60: Increase the dosage to 4 mg orally once daily." (2.2); "Additional glycemic control is needed, increase the dosage to 9 mg orally once daily." (2.2) Note: From the part of section 2.2 headed "OZEMPIC Tablets: Recommended Dosage". Section 2.1 says the two tablet brands on this label "are not substitutable on a mg-to-mg basis". |   |
| M-65 | Highest dose (mg) | 9 | "Additional glycemic control is needed, increase the dosage to 9 mg orally once daily." (2.2) The highest dose in the label's adult schedule. The label does not call it a maximum in section 2. |   |
| M-68 | Wait after the pill (minutes) | 30 | "After taking RYBELSUS or OZEMPIC tablets, wait at least 30 minutes before eating food, drinking beverages or taking other oral medications [see Clinical Pharmacology (12.3)]." (2.1) Note: The label says "at least" 30 minutes. The wait covers food, beverages and other oral medications. |   |

### Saxenda (liraglutide), shot, once a day

FDA label version 22, effective 2026-02-25: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=3946d389-0926-4f77-a708-0acb8153b143

| Code | Number | In the app | Label words (section) | Your correction |
|----|------------|------------|------------------------------------------------|------------|
| M-72 | How often | Once a day | "Inject SAXENDA subcutaneously once daily at any time of day, without regard to the timing of meals." (2.1) |   |
| M-73 | Dose steps (mg) | 0.6, 1.2, 1.8, 2.4, 3 | "1 \| 0.6 mg" (2.2, Table 1); "2 \| 1.2 mg" (2.2, Table 1); "3 \| 1.8 mg" (2.2, Table 1); "4 \| 2.4 mg" (2.2, Table 1); "5 and onward \| 3 mg" (2.2, Table 1) Note: The first column of Table 1 is the week, the second the daily dose. These are the doses one pen can be set to; the pen has a single strength. |   |
| M-74 | Highest dose (mg) | 3 | "For adults, the recommended dosage of SAXENDA is 3 mg daily, lower dosages are for titration only." (2.2) The highest dose in the label's adult schedule. Section 8.1 names 3 mg/day as the maximum recommended human dose. |   |

**Other / custom.** The person types the name. The app has no numbers for it: no typing check, no chart.

## Part 2. The chart "Estimated medication level"

The chart is drawn only for Wegovy, Ozempic, Zepbound, Mounjaro: weekly shots whose two numbers were read from the label. Medications taken every day get no chart; in its place the app says "An estimate for this medication is not available yet."

- One compartment, first-order absorption and elimination (the Bateman function). ke = ln 2 / half-life; ka is solved so that one dose peaks exactly at the time to peak.
- Every logged dose in mg is added up. Doses in other units are left out and never converted.
- The number shown is 100 x level / the highest level after long-term use of the dose logged last. It has no unit. So it can drop right after a dose increase, although there is more medication in the body.
- The chart shows the last 14 days and the next 7. The next 7 assume the planned doses are taken; an overdue dose is not counted until it is logged.
- The same two numbers are used for every person on a medication. Weight, kidney function and age change nothing. Nothing else in the app reads the chart.

| Weekly shot | Half-life used | Time to peak used | Number right before the next dose, long-term (peak = 100) | After the last dose, days until the number is under 5 |
|------------|------------|------------|----------------|----------------|
| Wegovy | 168 hours (7 days) | 48 hours (2 days) | 62 | 32.5 days |
| Ozempic | 168 hours (7 days) | 48 hours (2 days) | 62 | 32.5 days |
| Zepbound | 132 hours (5.5 days) | 24 hours (1 day) | 48 | 24.9 days |
| Mounjaro | 120 hours (5 days) | 40 hours | 50 | 23.6 days |

The last two columns come from running the code, not from a label, so you can judge whether the picture is believable.

Under the chart the app says: "An estimate based on numbers from US prescribing information. It is not a measurement and cannot be used to adjust your dose."

## Part 3. The warning signs: the words of the Medication Guides

The screen "Warning signs in the Medication Guide" opens from the "Me" tab and from a button on every alert except the crisis card, when the app has a Medication Guide for the person's medication (not for "Other / custom"). It shows three parts of the FDA Medication Guide of the person's own medication, word for word, in the guide's order: the "most important information", the serious side effects, and the sentence about taking too much. The app adds no word, sets nothing in bold and marks no item as more urgent. Above the list the screen says (our words): "From the Medication Guide for [brand], [date of the guide]. These are the manufacturer's words, approved by the FDA. Nothing here is written by this app."

**Status:** Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer. A script copied the words from the label files on DailyMed and a second script checked them. The guides in use:

| Code | Guide for | Date line | Label version | Effective |
|----|----------------|------------|--------|--------|
| G-01 | Wegovy, Wegovy pill | "Revised: 06/2026" | 19 | 2026-06-18 |
| G-02 | Ozempic | "Revised: 01/2025" | 20 | 2026-06-01 |
| G-03 | Rybelsus, Ozempic pill | "Revised: 1/2026" | 14 | 2026-01-30 |
| G-04 | Zepbound | "Revised: 08/2026" | 40 | 2026-08-28 |
| G-05 | Mounjaro | "Revised: August 2026" | 40 | 2026-08-27 |
| G-06 | Saxenda | "Revised: 02/2026" | 22 | 2026-02-25 |
| G-07 | Foundayo | "Issued: 07/2026" | 10 | 2026-07-29 |

### The guide for Wegovy, Wegovy pill, in full

This is what a person on Wegovy or Wegovy pill sees. Each item has its code from the full packet.

**What is the most important information I should know about WEGOVY?**

WEGOVY may cause serious side effects, including:

- `I-01` Possible thyroid tumors, including cancer. Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath. These may be symptoms of thyroid cancer. In studies with rodents, WEGOVY and other medicines that work like WEGOVY caused thyroid tumors, including thyroid cancer. It is not known if WEGOVY will cause thyroid tumors or a type of thyroid cancer called medullary thyroid carcinoma (MTC) in people.
- `I-02` Do not use WEGOVY if you or any of your family have ever had a type of thyroid cancer called medullary thyroid carcinoma (MTC), or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).

**What are the possible side effects of WEGOVY?**

WEGOVY may cause serious side effects, including:

- `I-03` See “What is the most important information I should know about WEGOVY?”
- `I-04` inflammation of your pancreas (pancreatitis). Stop using WEGOVY and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting. Sometimes you may feel the pain from your abdomen to your back.
- `I-05` gallbladder problems. WEGOVY may cause gallbladder problems including gallstones. Some gallbladder problems need surgery. Call your healthcare provider if you have any of the following symptoms:
  - pain in your upper stomach (abdomen)
  - yellowing of skin or eyes (jaundice)
  - fever
  - clay-colored stools
- `I-06` increased risk of low blood sugar (hypoglycemia) in patients with type 2 diabetes, especially those who also take medicines to treat type 2 diabetes mellitus such as an insulin or a sulfonylureas. Low blood sugar in patients with type 2 diabetes who receive WEGOVY can be both a serious and common side effect. Talk to your healthcare provider about how to recognize and treat low blood sugar. You should check your blood sugar before you start taking WEGOVY and while you take WEGOVY. Signs and symptoms of low blood sugar may include:
  - dizziness or light-headedness
  - sweating
  - shakiness
  - blurred vision
  - slurred speech
  - weakness
  - anxiety
  - hunger
  - headache
  - irritability or mood changes
  - confusion or drowsiness
  - fast heartbeat
  - feeling jittery
- `I-07` dehydration leading to kidney problems. Diarrhea, nausea, and vomiting may cause a loss of fluids (dehydration) which may cause kidney problems. It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.
- `I-08` severe stomach problems. Stomach problems, sometimes severe, have been reported in people who use WEGOVY. Tell your healthcare provider if you have stomach problems that are severe or will not go away.
- `I-09` serious allergic reactions. Stop using WEGOVY and get medical help right away, if you have any symptoms of a serious allergic reaction including:
  - swelling of your face, lips, tongue or throat
  - severe rash or itching
  - very rapid heartbeat
  - problems breathing or swallowing
  - fainting or feeling dizzy
- `I-10` change in vision in people with type 2 diabetes. Tell your healthcare provider if you have changes in vision during treatment with WEGOVY.
- `I-11` increased heart rate. WEGOVY can increase your heart rate while you are at rest. Your healthcare provider should check your heart rate while you take WEGOVY. Tell your healthcare provider if you feel your heart racing or pounding in your chest and it lasts for several minutes.
- `I-12` food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation). WEGOVY may increase the chance of food getting into your lungs during surgery or other procedures. Tell all your healthcare providers that you are taking WEGOVY before you are scheduled to have surgery or other procedures.

**How should I use WEGOVY?**

If you take too much WEGOVY, you may have severe nausea, severe vomiting and severe low blood sugar. Call your healthcare provider or Poison Help line at 1-800-222-1222 or go to the nearest hospital emergency room right away. Advice is also available online at poisonhelp.org.

### The other guides: where the instruction differs

The other guides have the same items in nearly the same words, with their own brand names and order. Below, only where an item's instruction differs from the Wegovy, Wegovy pill guide, or where an item is missing. "Instruction" is our reading of the guide's words, one of: get medical help right away; call or tell the healthcare provider right away; tell the healthcare provider, without "right away"; no instruction to contact anyone. Every guide in full is in the full packet.

The Wegovy, Wegovy pill guide says, item by item: thyroid tumors: tell the healthcare provider, without "right away"; inflammation of the pancreas (pancreatitis): call or tell the healthcare provider right away, after "Stop using"; gallbladder problems: tell the healthcare provider, without "right away"; low blood sugar: tell the healthcare provider, without "right away"; dehydration leading to kidney problems: call or tell the healthcare provider right away; severe stomach problems: tell the healthcare provider, without "right away"; serious allergic reactions: get medical help right away, after "Stop using"; changes in vision: tell the healthcare provider, without "right away"; increased heart rate: tell the healthcare provider, without "right away"; food or liquid getting into the lungs during surgery or other procedures: tell the healthcare provider, without "right away".

| Code | Guide for | Where the instruction differs from the Wegovy, Wegovy pill guide |
|----|------------|------------------------------------------------|
| G-02 | Ozempic | Gallbladder problems: call or tell the healthcare provider right away. Low blood sugar: no instruction to contact anyone. Increased heart rate: not in this guide |
| G-03 | Rybelsus, Ozempic pill | Gallbladder problems: call or tell the healthcare provider right away. Low blood sugar: no instruction to contact anyone. Increased heart rate: not in this guide |
| G-04 | Zepbound | Gallbladder problems: call or tell the healthcare provider right away. Low blood sugar: no instruction to contact anyone. Increased heart rate: not in this guide |
| G-05 | Mounjaro | Gallbladder problems: call or tell the healthcare provider right away. Low blood sugar: no instruction to contact anyone. Increased heart rate: not in this guide |
| G-06 | Saxenda | Changes in vision: not in this guide |
| G-07 | Foundayo | Gallbladder problems: call or tell the healthcare provider right away. Low blood sugar: no instruction to contact anyone. Increased heart rate: not in this guide |

## Part 4. The alert cards

In the first public version every alert shows one fixed card. It names no cause. Only the self-harm rule keeps its own card.

**The fixed card:**

> **Contact your doctor right away**
>
> What you logged can be a sign of a serious problem. Contact your doctor right away. If it is an emergency, call 911.

When the alert comes from a question typed for the doctor (part 5), nothing was logged, so the card begins "What you wrote" instead. Buttons: "See the warning signs in the Medication Guide" (when the app has a Medication Guide for the person's medication, not for "Other / custom"), "Call 911" and "Got it".

**The crisis card** (self-harm rule only):

> **You are not alone**
>
> If you are thinking about hurting yourself, please reach out now to someone who can help: crisis line 988. If you are in immediate danger, call 911.

Buttons: "Call 911", "Call 988" (it dials the crisis line) and "Got it". It has no button to the Medication Guide.

Under every alert: "This alert is based on what you described. It is not a diagnosis. If you are not sure, see a doctor."

## Part 5. What raises an alert

An alert can come from two places. **The symptom buttons:** a person taps a symptom and how bad it is (table below). **Typed text:** the box at the top of the list of questions for the doctor, where a person writes down a question for their next visit. The question is saved as typed and the alert is shown over it. The rules are fixed word patterns. No AI is involved. Capital letters, common misspellings and phone shorthand are allowed for. A rule stays quiet when the words say the sign is denied ("no chest pain"), slight, over now, about someone else, long ago, a general question, or a figure of speech.

**What stays on the screen.** An alert from a symptom button is saved with the entry and stays as a reminder at the top of the main screen for the rest of the day. An alert from the questions box is shown once: nothing is logged, and once closed it is gone.

### The symptom buttons

The symptoms are: Nausea, Vomiting, Heartburn or burping, Constipation, Diarrhea, Stomach pain, No appetite, Tiredness, Dizziness, Hair loss, Redness or swelling where you inject, Low mood, Period changes. How bad: Mild, Moderate, Severe. The screen says: “"Severe" means it clearly gets in the way of eating, drinking or daily activities.” Only these raise an alert:

| Symptom | How bad | Who | Rule | Card |
|------------|--------|--------------------|------------------------|--------|
| Nausea | Severe | Every user | R-07 (vomiting, diarrhea or nausea that does not go away, and signs of dehydration) | Fixed card |
| Vomiting | Severe | Every user | R-07 (vomiting, diarrhea or nausea that does not go away, and signs of dehydration) | Fixed card |
| Diarrhea | Severe | Every user | R-07 (vomiting, diarrhea or nausea that does not go away, and signs of dehydration) | Fixed card |
| Stomach pain | Severe | Every user | R-14 (stomach problems that are severe or do not go away, and bleeding) | Fixed card |
| Dizziness | Severe | Only users who did not check the insulin or sulfonylurea box at setup | R-07 (vomiting, diarrhea or nausea that does not go away, and signs of dehydration) | Fixed card |
| Dizziness | Severe | Only users who checked the insulin or sulfonylurea box at setup | R-06 (low blood sugar) | Fixed card |

Every other button raises nothing, also at "Severe": Heartburn or burping, Constipation, No appetite, Tiredness, Hair loss, Redness or swelling where you inject, Low mood, Period changes.

### The rules, one by one

Each rule below shows an alert in the first public version. For each: what raises it, in plain words; five phrases that raise it; three close ones that raise nothing. The script that built this packet ran every phrase through the rules.

#### R-01 · Thoughts of suicide or self-harm

Words about ending one's own life or harming oneself: "suicide", "kill myself", "want to die", "don't want to be alive", "don't want to wake up", "nobody would miss me", "end it all", a plan or a way of dying, hurting oneself on purpose, writing goodbye notes. A "no" or "not" in front does not stop it ("I do not want to die" raises it), and neither does a time long past or a "lol". It stays quiet when the words are about someone else or a general question, and for set phrases such as "suicide prevention" or "die of laughter". This rule shows its own card (part 4), not the fixed card.

Raise it: "I want to die"; "thinking about ending my life"; "I don't want to be alive anymore"; "nobody would miss me if I was gone"; "everyone would be better off if I were gone".

Raise nothing: "I want to diet before summer"; "that movie made me want to die of laughter"; "suicide prevention walk this weekend".

#### R-02 · Severe stomach pain, or stomach pain that goes to the back

Stomach pain that the person calls severe (severe, terrible, the worst, 8 out of 10 or more, doubled over, cannot stand up), and stomach pain that goes through or spreads to the back, whether or not it is called severe. Also the word "pancreatitis".

Raise it: "severe stomach pain"; "stomach pain that goes through to my back"; "worst belly pain of my life"; "abd pain 10/10 since last nite"; "doubled over with stomach pain".

Raise nothing: "mild stomach ache after lunch"; "my dad has severe stomach pain"; "no stomach pain today".

#### R-03 · Chest pain, fainting, a racing heart, and general emergency signs

Chest pain, pressure or tightness; passing out, fainting or losing consciousness; a racing or pounding heart, unless it is called slight or follows hard exercise. Also general emergency signs that no guide names: a heart attack or stroke by name, a drooping face, one side numb or weak, slurred speech, a seizure, a collapse, the worst headache of one's life, a resting pulse of 120 or more or any pulse of 140 or more (not during exercise), a blood pressure of 180/120 or more, and saying one needs an ambulance or is in the emergency room now.

Raise it: "chest pain"; "I passed out at work"; "my heart is racing"; "my face is drooping on one side"; "pressure in my chest".

Raise nothing: "my mom had chest pain last year"; "no chest pain"; "heart pounding after the treadmill".

#### R-04 · Swelling, trouble breathing, a severe rash: signs of a serious allergic reaction

Swelling of the face, lips, tongue, throat or eyelids; a throat that is closing or tight; trouble breathing, short of breath, wheezing or gasping (not after hard exercise, and not when the person says it is less than before); a rash, hives or itching that is severe, all over the body or spreading; the words "allergic reaction" or "anaphylaxis". A rash at the injection site stays quiet.

Raise it: "my lips are swelling"; "my throat feels like it is closing"; "short of breath"; "hives all over my body"; "I can't breathe".

Raise nothing: "less short of breath than yesterday"; "small rash at the injection site"; "out of breath after my run".

#### R-05 · Changes in vision

Any change in vision: blurry, hazy, double or foggy vision; seeing spots, floaters or flashes; vision that goes dark, goes in and out, gets worse or changes suddenly; losing part of one's sight; one eye that cannot see. The guides name "changes in vision" without saying how bad, so the plain words are enough.

Raise it: "my vision is blurry"; "suddenly can't see out of my left eye"; "seeing double"; "lost part of my vision"; "my eyesight got worse this week".

Raise nothing: "I need new glasses for reading"; "blurry photo of my lunch"; "my vision is fine".

#### R-06 · Low blood sugar

The words "low blood sugar", "hypoglycemia", "my sugar crashed" and the like; a reading under 70; glucagon given. Also two or more signs of low blood sugar from the guides' list in one text: shaky, sweaty, a fast heartbeat, confused or drowsy, dizzy, blurred vision, slurred speech. Weakness, headache, hunger and anxiety or mood changes count only next to one of those, because many people on these medications have them on an ordinary day. One sign alone is not enough here (dizziness, blurred vision, slurred speech and a fast heartbeat raise the alert alone through other rules).

Raise it: "low blood sugar"; "my sugar is 55"; "shaky and sweaty"; "my blood sugar crashed"; "confused and shaky".

Raise nothing: "I'm hungry"; "headache and hungry"; "what are the signs of low blood sugar?".

#### R-07 · Vomiting, diarrhea or nausea that does not go away, and signs of dehydration

Vomiting or diarrhea that does not stop, goes on all day or for days, or comes five times or more; nothing stays down, not even water; nausea that does not go away or lasts more than a day; passing very little or no urine, or dark brown urine; kidney pain; dizziness on standing up; feeling very dehydrated. Throwing up once, or nausea for one day, stays quiet.

Raise it: "vomiting won't stop"; "diarrhea for 5 days straight"; "can't keep anything down"; "haven't peed all day"; "nausea not going away whole week".

Raise nothing: "threw up once this morning"; "nauseous all day"; "a little nausea after my shot".

#### R-08 · Signs of gallbladder problems

Yellow skin or eyes (jaundice); pain in the upper right stomach or under the right ribs; pain in the upper stomach; any fever the person reports as their own, also without pain; pale or clay-colored stools; gallstones or a gallbladder attack. Set phrases such as "hay fever" stay quiet.

Raise it: "my eyes look yellow"; "pain under my right ribs"; "I have a fever"; "clay colored stool"; "pain in my upper right stomach".

Raise nothing: "hay fever is bad this week"; "bought a yellow shirt"; "my son has a fever".

#### R-09 · A lump or swelling in the neck, hoarseness, trouble swallowing

A lump, bump or swelling in the neck or under the jaw; hoarseness or a raspy voice, unless it is called slight; trouble swallowing, food getting stuck, or swallowing that hurts. Trouble swallowing a pill because of its size stays quiet.

Raise it: "a lump in my neck"; "my voice is hoarse"; "trouble swallowing"; "food keeps getting stuck when I swallow"; "my neck is swollen".

Raise nothing: "a little hoarse from cheering"; "hard to swallow this big pill"; "my sister has a lump in her neck".

#### R-14 · Stomach problems that are severe or do not go away, and bleeding

Stomach pain that does not go away or is constant; stomach problems the person calls severe: constipation, bloating, heartburn or reflux; no bowel movement for four days or more, or not being able to pass gas; a bowel blockage by name; blood in vomit or stool, or black and tarry stool (no guide names bleeding; it is kept as a general emergency sign).

Raise it: "stomach pain won't go away"; "severe constipation"; "throwing up blood"; "black tarry stool"; "constant stomach pain".

Raise nothing: "a bit constipated"; "mild heartburn after pizza"; "stomach growling before dinner".

#### R-15 · Taking too much

Writing that one took too much: a double dose, a dose twice, an extra dose, two doses close together (two pills today, yesterday's and today's dose, a second one from someone else), the whole pen, more than prescribed, a higher strength by mistake, or the word "overdose". "Again" counts with a mistake word ("forgot", "by accident") or with a second time: "this morning and again tonight", "again a few hours later", "on Monday and again on Wednesday", "again 2 days after my last shot". It stays quiet for a plain log entry ("took my shot again today" is the weekly routine) and for a denial.

Raise it: "I took a double dose"; "injected twice this week by mistake"; "accidentally took 2 pills instead of one"; "took too much of my medicine"; "I took my shot again, forgot I already did it".

Raise nothing: "took my shot, 5 mg, left thigh"; "I didn't take a double dose, I checked the log"; "what should I do if I miss a dose?".

**Rules that show nothing in the first public version.** R-10 matches words about being pregnant, trying to get pregnant, breastfeeding; R-11 matches words about a surgery, anesthesia, sedation, an endoscopy or a colonoscopy; R-12 matches words about birth control pills (only for tirzepatide); R-13 matches words about not being able to eat for days. Their own cards are gentle reminders with no call button, and they are switched off until reviewed. The fixed card says "right away" and offers 911, so it is not used for them. Text that matches only these rules is saved and nothing is shown.

### From each item of the guides to a rule

Our reading, item by item: what raises the alert when a person describes the sign as their own, or why nothing does. A sign in "quotation marks" is in the guides' words. Where the guides differ in instruction, part 3 says how.

| Guide item | The guides say | What raises the alert |
|----------------|----------------|----------------------------------------|
| Thyroid tumors | Tell the healthcare provider, without "right away" | "a lump or swelling in your neck": R-09 · "hoarseness": R-09. Stays quiet when the person calls it slight ("a little hoarse"), unless they also say it has lasted. · "trouble swallowing": R-09. Stays quiet when it is said of a pill ("hard to swallow this big pill"). · "shortness of breath": R-04 |
| The "Do not use" statement about thyroid cancer | No instruction to contact anyone | No sign named. It names no sign and tells the patient to contact no one: it says who must not use the medication. |
| The pointer back to the first part of the guide | No instruction to contact anyone | No sign named. It only points back to the first part of the guide. |
| Inflammation of the pancreas (pancreatitis) | Call or tell the healthcare provider right away | "severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting": R-02, R-14, the Stomach pain button. Severe stomach pain raises the card whether or not the person says it lasts. Stomach pain that lasts raises it whether or not the person calls it severe. · "pain from your abdomen to your back": R-02 |
| Gallbladder problems | Differs by guide (part 3): tell the healthcare provider, without "right away"; call or tell the healthcare provider right away | "pain in your upper stomach (abdomen)": R-08, the Stomach pain button · "yellowing of skin or eyes (jaundice)": R-08 · "fever": R-08. Any fever the person reports as their own raises the card, also without stomach pain. · "clay-colored stools": R-08 |
| Low blood sugar | Differs by guide (part 3): tell the healthcare provider, without "right away"; no instruction to contact anyone | "dizziness or light-headedness": R-06, R-07, the Dizziness button. Alone it raises the card through the rule for "feeling dizzy" (a sign of a serious allergic reaction in the guides), unless the person calls it slight. · "blurred vision": R-06, R-05. Alone it raises the card through the rule for changes in vision. · "slurred speech": R-06, R-03. Alone it raises the card through the rule for general emergency signs: speech that is suddenly slurred is a sign of a stroke. · "fast heartbeat": R-06, R-03. Alone it raises the card through the rule for a very rapid heartbeat (a sign of a serious allergic reaction in the guides). · "sweating", "shakiness", "feeling jittery", "confusion or drowsiness", "weakness", "hunger", "headache", "anxiety": only together with another sign of the list (R-06) |
| Dehydration leading to kidney problems | Call or tell the healthcare provider right away | "nausea, vomiting, or diarrhea that does not go away": R-07, the Nausea button, the Vomiting button, the Diarrhea button. Vomiting or diarrhea also counts when it goes on all day or comes five times or more. Nausea counts only with words for "does not go away" or more than one day; "nauseous all day" stays quiet. |
| Severe stomach problems | Tell the healthcare provider, without "right away" | "stomach problems that are severe or will not go away": R-14, R-02, R-07, the Stomach pain button, the Nausea button, the Vomiting button, the Diarrhea button. The rules read "stomach problems" as stomach pain, nausea, vomiting, diarrhea, constipation, bloating, heartburn and acid reflux. The buttons for constipation and acid reflux raise nothing. |
| Serious allergic reactions | Get medical help right away | "swelling of your face, lips, tongue or throat": R-04 · "problems breathing or swallowing": R-04, R-09. Breathing is read by the allergic-reaction rule, swallowing by the rule that also stands for the thyroid item. · "severe rash or itching": R-04. A rash or itching raises the card when the person calls it severe, says it is all over the body or spreading, or names hives. A rash at the injection site stays quiet. · "fainting or feeling dizzy": R-03, R-07, the Dizziness button. Dizziness stays quiet when the person calls it slight ("a little dizzy"). · "very rapid heartbeat": R-03. A racing or pounding heart raises the card also without "very", unless the person calls it slight ("heart racing a bit"). |
| Changes in vision | Tell the healthcare provider, without "right away" | "changes in vision": R-05 |
| Increased heart rate | Tell the healthcare provider, without "right away" | "heart racing or pounding in your chest and it lasts for several minutes": R-03. The rule does not ask how long it lasts. |
| Food or liquid getting into the lungs during surgery or other procedures | Tell the healthcare provider, without "right away" | No sign named. It names no sign: it asks the patient to tell every healthcare provider about the medication before a surgery or procedure. The reminder rule R-11 (a surgery or procedure ahead) matches such words but shows nothing (above). |
| Taking too much (the third part on the screen) | Get medical help right away | R-15 (taking too much), when a person writes that they took too much. |

**Signs no guide names, kept as general emergency signs:** R-01: the whole rule; R-03: chest pain, pressure or tightness; R-03: a blood pressure of 180/120 or more, a feeling of dying with words about the heart, chest or breathing, and saying one is in the emergency room now; R-07: passing very little urine, dark brown urine, and kidney pain or kidney lab results that are off; R-14: blood in vomit or stool, and black or tarry stool.

## Part 6. The limits we know of

**The rules are a backstop, not a safety net.** Fixed word patterns miss some of the ways people describe a sign. In our latest test on phrases written by people who had not seen the rules, the rules missed 14 of 162 phrases that should raise an alert (about 9%), and raised an alert for 24 of 274 phrases that should not (about 9%). Expect misses at about that rate on wordings the rules have not seen. The reliable part is the guide's own list (part 3), which a person can open at any time.

**Left quiet on purpose** (each phrase was checked):

- Text about someone else, a time long past, a general question, or a sign called slight: "my son can't breathe" (someone else), "I had gallstones years ago" (long ago), "what are the signs of low blood sugar?" (a general question), "a little dizzy" (called slight). When in doubt the rules raise the alert.
- Low mood or depression, without words about harming oneself: "I feel hopeless", "depressed". No guide names it, and the self-harm rule needs words about ending one's life or harming oneself.
- One sign of low blood sugar alone, such as sweating or hunger (part 5).
- The other symptom buttons (part 5), also at "Severe". For constipation and reflux the guides say "tell your healthcare provider", without "right away"; the typed words "severe constipation" do raise the alert.
- Missed doses: no rule ("I missed two doses" raises nothing). The app gives no advice about missed doses.
- The four reminder rules (part 5): their words are saved and nothing is shown.

**Where the card says less than the guide:**

- For inflammation of the pancreas (pancreatitis) and serious allergic reactions the guides say "Stop using". The card does not: the app gives no advice about doses.
- For serious allergic reactions the guides say "get medical help right away". The card says "Contact your doctor right away" and "If it is an emergency, call 911".
- For taking too much the guides name the Poison Help line (1-800-222-1222) and the emergency room. The card names neither; the guide's own sentence is on the screen one tap away.
- The card never says which sign it was raised for.

**Where the card says more than the guide:** for thyroid tumors; gallbladder problems; low blood sugar; severe stomach problems; changes in vision; increased heart rate, some or all guides say only "tell your healthcare provider", without "right away". The card says "right away" for every sign.

**What only typing can raise.** No button leads to R-01 (thoughts of suicide or self-harm); R-02 (severe stomach pain, or stomach pain that goes to the back); R-03 (chest pain, fainting, a racing heart, and general emergency signs); R-04 (swelling, trouble breathing, a severe rash: signs of a serious allergic reaction); R-05 (changes in vision); R-08 (signs of gallbladder problems); R-09 (a lump or swelling in the neck, hoarseness, trouble swallowing); R-15 (taking too much). In the first public version these rules can be raised only by typing in the questions box, and that alert is shown once. A few of their signs also have a button through another rule (the table at the end of part 5).

## Part 7. Open questions

Each can be answered with yes, no, or a correction. Please add anything else you saw, with its code.

| Code | Question |
|----|------------------------------------------------------------|
| Q1 | Part 1: is every number right against the label words next to it and the current label? Correct any row by its code. |
| Q2 | Part 1: the highest dose is the highest the label gives to any adult; the notes on M-06, M-14, M-30, M-47 say where the label limits it. Is that the right limit for a typing check? |
| Q3 | Part 2: where the label gives only a range, the chart uses the midpoint (Wegovy time to peak: 1 to 3 days, the app uses 48 hours (2 days); Ozempic time to peak: 1 to 3 days, the app uses 48 hours (2 days); Zepbound half-life: 5 to 6 days, the app uses 132 hours (5.5 days); Mounjaro time to peak: 8 to 72 hours, the app uses 40 hours). Is the midpoint acceptable for a rough chart? |
| Q4 | Part 2: the number on the chart can drop right after a dose increase, because 100 is tied to the dose logged last. Is that acceptable at launch, with the line under the chart? |
| Q5 | Part 1: are the wait-after-a-pill lines right for each tablet? Should the app also say how to take the tablet (empty stomach, water)? |
| Q6 | Part 3: is each guide copied correctly and current? Name any item missing, changed or out of date. |
| Q7 | Part 3: are the three parts (most important information, serious side effects, taking too much) the right selection, or should the common side effects be shown too? |
| Q8 | Part 3: the label file of the guide for Rybelsus, Ozempic pill lacks a space ("RYBELSUS andOZEMPIC tablets"), and the app shows it so. Keep it? |
| Q9 | Part 4: is one fixed card acceptable for every sign, including the signs for which the guides say only "tell your healthcare provider"? |
| Q10 | Part 4: is it acceptable that the card does not say "stop using", and says "contact your doctor right away" where the guides say "get medical help right away"? |
| Q11 | Part 4: should the alert for taking too much name the Poison Help line (1-800-222-1222)? |
| Q12 | Part 4: is the crisis card right, with the crisis line "988"? |
| Q13 | Part 4: is "If it is an emergency, call 911" right on the fixed card for every sign? |
| Q14 | Part 5: is it acceptable that the four reminder rules show nothing at launch? |
| Q15 | Part 5: is it acceptable that an alert from the questions box is shown once and leaves no reminder? |
| Q16 | Part 6: is it acceptable at launch that the rules listed under "What only typing can raise" have no button? If not, which need one? |
| Q17 | Part 5: low blood sugar needs two signs, or a reading under 70. Are both lines right? |
| Q18 | Part 5: fever, hoarseness, dizziness, a racing heart and any change in vision raise the alert on the plain word. Is that right, or too wide? |
| Q19 | Part 5: vomiting or diarrhea counts when it goes on, lasts all day, or comes five times or more; nausea only when it lasts more than a day or does not go away. Are these lines right? |
| Q20 | Part 5: the Nausea and Dizziness buttons at "Severe" raise the alert; Constipation and Heartburn do not. Is that right? |
| Q21 | Part 6: is it acceptable that text about someone else, long ago, or a general question raises nothing? |
| Q22 | Part 6: should low mood or hopelessness, without words about self-harm, raise a card (for example one with the crisis line)? |
| Q23 | Part 5: should each general emergency sign that no guide names be kept? |
| Q24 | Part 5: is any row of the table "From each item of the guides to a rule" wrong? |

