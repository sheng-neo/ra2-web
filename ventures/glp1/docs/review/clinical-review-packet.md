<!-- Built by app/scripts/build-review-packet.ts (pnpm review-packet). Do not edit by hand: change the code or the script and build again. -->

# [APP NAME]: clinical review packet

From [COMPANY LEGAL NAME] · Contact: [CONTACT EMAIL] · Sent on [EFFECTIVE DATE]

Packet version `102c097d`. This file is built by a script from the code of the app, so the texts and numbers in it are the ones the app uses. Text in "quotation marks" is exact app text, or a phrase a person might type. Words in [square brackets] are filled in by the app or by us.

About 17,500 words with 401 coded items: about 47 pages in a compact print layout, about 75 pages as a plain Word file.

| Section | What it holds | Size | In the first public version |
|----|--------------------|----------------------------|------------------------|
| 1 | What this is and what we ask of you | 1 page |   |
| 2 | Danger-symptom rules | 14 rules, 16 card texts, 101 trigger patterns, 217 example phrases | Alerts show one fixed card; 4 rules of a mild level show nothing (2.1). They come from the symptom buttons (2.2) and from typed text (2.3) |
| 3 | Coping cards, daily advice, workouts | 4 coping cards (34 lines), 17 daily advice texts, 3 workouts (15 exercises) | Hidden until reviewed |
| 4 | US medication list | 8 brands, 59 rows, 42 numbers to check | The names are shown. No number is used yet: no medication has label-checked numbers, so there is no dose example, no typing check and no wait after a pill |
| 5 | Estimated medication level: method and wording | 13 assumptions, 10 screen texts | No chart yet: no medication has label-checked numbers |
| 6 | Other numbers that need a clinical eye | 31 cut-offs and rules, 12 food values, 17 sentences with numbers | Protein target and food values are hidden until reviewed. Dose timing, injection sites and the setup questions are live |
| 7 | Open questions | 24 questions |   |

## 1. What this is and what we ask of you

### What the app is

[APP NAME] is a phone app for adults in the United States who take a GLP-1 medication that their own doctor prescribed, as a weekly shot or a daily pill. People use it to log each dose, their weight and how they feel, and to get a reminder. It draws a chart called "Estimated medication level" from the doses they logged. It is made by [COMPANY LEGAL NAME], a small independent company with no tie to any drug maker. It is not a medical device.

### What the app does not do

- **No dosing advice.** It never says how much to take, when to change a dose, or what to do about a missed dose. It answers no questions about doses.
- **No diagnosis.** When a person logs a danger sign, it shows a short card that tells them to contact their doctor or call 911.
- **No unit conversion, no selling of medication, no service for people under 18.**

### What we ask you to do

We are paying you to find errors. We are not asking you to approve the app. Please look for:

- facts that are wrong or out of date against the current FDA labels and Medication Guides;
- danger signs that are missing, or that are handled too weakly or too strongly;
- wording that could lead a person to do something unsafe, or to read the app as medical advice;
- numbers and cut-offs that you would not defend.

If time is short, please start with sections 4, 2 and 5. They cover what a US user sees in the first public version.

### How to mark up this document

- Every item has a code in its first column (R-02, M-17, Q-05). Use the code when you comment.
- Mark an item **OK**, **Change**, **Remove** or **Cannot say**. For "Change", write the words or the number you would use. For a fact from a label, add the label section and the revision date of the label.
- Say how serious each finding is: **must fix before launch**, **should fix**, or **suggestion**.
- Sections 4 and 6.2 have blank columns for your corrections. Anywhere else, comment in the margin or send a list by code.
- You do not need to polish our wording. Tell us what is wrong and we will rewrite it.

### No endorsement, and your name is not used

Your review is private advice to [COMPANY LEGAL NAME]. We will not use your name, your title, your employer or the fact that you looked at the app, in the app, in a store listing, on a website or anywhere else. The app will not say or suggest that a clinician checked or approved it. What the app shows stays our decision and our responsibility.

## 2. Danger-symptom rules

These rules are fixed. No AI is involved. They look at two things: which symptom button a person taps and how bad they say it is, and the words a person types. When a rule matches, the app shows an alert that covers the whole screen. The aim is to give one reminder too many, not one too few. The app does not diagnose.

Under every alert the app prints this line: "This alert is based on what you described. It is not a diagnosis. If you are not sure, see a doctor." The button that closes the alert says "Got it".

**What stays on the main screen.** An alert raised from a symptom button (2.2) or, in the full test version, a typed note is saved with the log entry. For the rest of that day the main screen keeps a reminder at the top, with a button "See the alert again". After the person taps "Got it", the reminder stays only for an alert whose rule pauses the day's tips (each card in section 2.4 says whether it does). Every alert a symptom button can raise is of that kind. **An alert raised from the box for questions for the doctor (2.3) leaves no reminder.** Nothing is logged there, so once the person taps "Got it" the alert is gone: the main screen shows nothing and there is no way to open it again. A question in section 7.2 asks whether that is acceptable.

Each rule has a level. The level decides which card comes first when more than one rule matches, and the color of the alert. It changes the words for one rule only, R-06 `hypoglycemia`, which has a card for each level (section 2.4). In the first public version the level also decides whether an alert is shown at all (section 2.1), and every alert other than the crisis card has the same color. The levels, from first to last:

| Order | Level | Rules at this level |
|----|--------|--------------------------------|
| 1 | `crisis` | R-01 `crisis` |
| 2 | `emergency` | R-02 `pancreatitis`, R-03 `chest_or_faint`, R-04 `anaphylaxis`, R-05 `vision` |
| 3 | `act_now` | R-06 `hypoglycemia` |
| 4 | `urgent` | R-06 `hypoglycemia`, R-07 `dehydration`, R-08 `gallbladder`, R-09 `thyroid`, R-14 `abdominal_pain_severe` |
| 5 | `contact` | R-10 `pregnancy` |
| 6 | `care` | R-13 `eating_too_little` |
| 7 | `remind` | R-11 `procedure`, R-12 `contraception` |

### 2.1 The alert a US user sees in the first public version

Until the cards in section 2.4 are reviewed, an alert shows one fixed card. It names no cause.

> **Contact your doctor right away**
>
> What you logged can be a sign of a serious problem. Contact your doctor right away. If it is an emergency, call 911.

This card shows a "Call 911" button and pauses the day's workout and food tips.

The fixed card is shown for a rule at one of the levels `emergency`, `act_now`, `urgent`.

The exception: R-01 `crisis` keeps its own card (shown in section 2.4) in the first public version too.

**A rule at a milder level shows no alert at all in the first public version:** R-10 `pregnancy` (`contact`), R-11 `procedure` (`remind`), R-12 `contraception` (`remind`), R-13 `eating_too_little` (`care`). Their own cards (section 2.4) are reminders with no call button. The fixed card says "right away" and offers the call button, so it is not used for them. Text that matches only these rules is saved as typed and nothing else happens. A question in section 7.2 asks whether that is right.

### 2.2 Alerts from the symptom buttons

A person can tap one of these symptoms: Nausea, Vomiting, Heartburn or burping, Constipation, Diarrhea, Stomach pain, No appetite, Tiredness, Dizziness, Hair loss, Redness or swelling where you inject, Low mood, Period changes. Then they choose how bad it is: Mild, Moderate, Severe. The screen explains: “"Severe" means it clearly gets in the way of eating, drinking or daily activities.”

| Code | Symptom tapped | How bad | Who | Rule and level | Card in the first public version |
|----|------------|--------|--------------------|----------------|----------------|
| B-01 | Vomiting | Severe | Every user | R-07 `dehydration` (`urgent`) | Fixed card (2.1) |
| B-02 | Diarrhea | Severe | Every user | R-07 `dehydration` (`urgent`) | Fixed card (2.1) |
| B-03 | Stomach pain | Severe | Every user | R-14 `abdominal_pain_severe` (`urgent`) | Fixed card (2.1) |
| B-04 | Dizziness | Severe | Only users who checked the insulin or sulfonylurea box at setup, see 6.7 | R-06 `hypoglycemia` (`act_now`) | Fixed card (2.1) |

Every other symptom and every other choice of how bad it is raises no alert.

No button leads to these rules: R-01 `crisis`, R-02 `pancreatitis`, R-03 `chest_or_faint`, R-04 `anaphylaxis`, R-05 `vision`, R-08 `gallbladder`, R-09 `thyroid`, R-10 `pregnancy`, R-11 `procedure`, R-12 `contraception`, R-13 `eating_too_little`. Only typed text can raise them (2.3).

### 2.3 Alerts from typed text: how the rules read it

Typed text is checked in these places:

| Where a person types | In the full test version | In the first public version |
|----------------------------------------|------------|------------|
| The note box at the bottom of the main screens, where a person types what happened (a dose, a weight, how they feel). | Yes | No |
| The box at the top of the list of questions for the doctor, where a person writes down a question for their next visit. The question is saved as typed and the alert is shown over it. | No | Yes |

**So the phrase rules below are live in the first public version.** A match there shows the alert of section 2.1, or nothing when the text matches only rules that show no alert there (also 2.1).

The text is checked as a whole, before anything else is done with it. Capital letters do not matter. Each rule is a list of phrase patterns. Section 2.4 gives every pattern in plain words, with examples that the script that built this packet ran through the real rules. The app also has Chinese phrase lists. They are not part of this review.

Many patterns use the same word lists. A word in **bold** in section 2.4 stands for one of these lists:

| Code | Name in 2.4 | Words that count |
|----|------------|------------------------------------------------|
| L-01 | **severe word** | severe, unbearable, excruciating, terrible, horrible, awful, intense, extreme, really bad, very bad, so bad, worst |
| L-02 | **stomach word** | stomach, abdomen, abdominal, belly, tummy, gut |
| L-03 | **pain word** | pain, pains, ache, aches, aching, hurt, hurts, hurting, cramp, cramps, cramping |
| L-04 | **pain or soreness word** | pain, pains, ache, aches, aching, hurt, hurts, hurting, sore, tender, tenderness, cramp, cramps, cramping |
| L-05 | **vomiting word** | vomit, vomits, vomited, vomiting, throw up, throws up, throwing up, threw up, thrown up, puke, pukes, puked, puking |
| L-06 | **diarrhea word** | diarrhea, diarrhoea, the runs, loose stool, loose stools, watery stool, watery stools |
| L-07 | **reaches-the-back phrase** | "to", "into", "through", "toward", "towards", "in", "around" or "round", followed by "back", "my back" or "the back" ("upper", "lower", "middle" or "mid" may stand before "back"), but not "back yard", "back seat", "back room", "back door", "back porch" or "back office". Or "and", "plus", "with" or "also", followed by "back" or "my back", but not "back to", "back from", "back at", "back on", "back home", "back again" or "back in". Or "back hurts", "back hurting", "back aches", "back aching" or "back pain" ("also", "too" or "is" may stand in between). |
| L-08 | **long-or-often phrase** | "all day", "all night", "all morning", "all afternoon", "all evening", "all week"; "nonstop"; "constantly"; "won't stop", "can't stop"; "over and over"; "for days", with or without a count ("for 3 days", "for two days", "for a few days", "for several days", "for many days"); "24 hours", "48 hours", "72 hours"; "since yesterday", "since last night"; or a count of 5 or more "times" (5 to 9, any number with two or more digits, "five" to "ten", "several", "many", "multiple", "countless", "so many"). |
| L-09 | **dizzy phrase** | "dizzy"; "lightheaded" (also "light-headed", "light headed"); "black out", "blacks out", "blacked out"; "vision" or "everything" plus "goes", "went", "going", "gets" or "got" plus "dark", "black" or "dim"; "see" or "seeing" plus "black", "stars" or "spots"; "almost" or "nearly" plus "pass out", "passed out", "faint" or "fainted". |
| L-10 | **upper-right phrase** | "upper right", "right upper" or "top right" followed by "stomach", "abdomen", "abdominal", "belly", "tummy" or "quadrant" ("side of my", "part of my" or "area of my" may stand in between); "upper right side" or "right upper side", unless it is the side of an arm, leg, thigh, back, chest, neck, head, face, shoulder, hip or knee; "right rib", "right ribs", "right rib cage", "right side ribs"; "right side" plus "under", "below", "beneath", "by" or "near" plus "my ribs"; "under", "below" or "beneath" plus "my ribs on my right". |
| L-11 | **cannot-see word** | a word that starts with "blurr" ("blurry", "blurred"); "can't see"; "cannot see"; "blind". |
| L-12 | **vision word** | "vision"; "sight"; or a **cannot-see word**. |
| L-13 | **not-eating phrase** | "haven't", "have not", "hasn't", "didn't", "did not", "barely", "hardly", "can't", "cannot", "couldn't", "could not", "not" or "unable to", followed by "eat", "eaten", "ate" or "eating" ("really", "even", "been able to" or "been" may stand in between). Or "eaten", "ate" or "eating" followed by "nothing", "almost nothing" or "next to nothing". |
| L-14 | **days phrase** | "days"; "for a week", "for 2 weeks", "for two weeks", "for three weeks", "for a few weeks"; "all week". |

How the rules read "no" and "not":

- A rule stays quiet when the words right before the symptom deny it: "no chest pain", "I don't have any chest pain", "never had chest pain", "no fever or chest pain".
- Only small filler words may stand between the "no" and the symptom, such as "any", "more", "have", "having" or "feeling". With anything else in between, the rule fires: "not feeling well, chest pain".
- A denial does not count, and the rule fires, when the rest of the sentence says the symptom is there now. The markers are "like this", "this bad", "so bad", "before", "until", and turns such as "but today I do". "Wasn't unconscious long" also fires: it happened, only not for long.
- A question that opens with "isn't", "aren't" or "doesn't" is not a denial: "isn't chest pain serious?" fires.
- Between the key words of one pattern a few other words may stand. How many characters is fixed for each pattern. They may not cross the end of a sentence. They may not cross "no", "not", "never", "without" or a word ending in "n't", unless that word says the symptom goes on ("won't go away", "doesn't stop", "not getting better").
- The self-harm rule never looks for "no" or "not".

What the test suite checks about this, and what the rules do with each phrase today:

| What the test checks | Phrases | What the rules do today |
|--------------------|------------------------------------|----------------|
| A negation right before the symptom keeps it quiet | "no chest pain"; "I don't have any chest pain"; "never had chest pain"; "no longer have chest pain"; "I’m not pregnant"; "I am not currently pregnant"; "no trouble breathing"; "no fever or chest pain"; "no low blood sugar"; "no jaundice"; "no surgery planned" | Stays quiet |
| A plain denial stays quiet even with a time word or another complaint after it | "no chest pain today"; "no chest pain now"; "no chest pain for a long time"; "no chest pain but nausea"; "no chest pain but I have nausea"; "no chest pain, but I feel sick"; "No chest pain. But I do have nausea"; "no chest pain, is that normal?"; "I haven't fainted"; "not unconscious"; "I don't feel chest pain anymore"; "not pregnant now"; "not pregnant and not trying"; "I do not have a lump in my neck"; "never had surgery" | Stays quiet |
| A negation that the rest of the sentence takes back is a complaint, not a denial | "I've never had chest pain like this"; "never felt chest pain this bad"; "I don't usually get chest pain but I have it now"; "I have never passed out before, just did"; "I was not unconscious long but I did pass out" | Fires: R-03 `chest_or_faint` (`emergency`) |
|   | "I haven't been this short of breath before" | Fires: R-04 `anaphylaxis` (`emergency`) |
|   | "never had severe stomach pain like this before" | Fires: R-02 `pancreatitis` (`emergency`) |
|   | "vomiting, not stopping, all day" | Fires: R-07 `dehydration` (`urgent`) |
| A negation about something else does not hide the symptom | "not feeling well, chest pain"; "not good chest pain"; "No vomiting. Chest pain though."; "no nausea but chest pain since lunch"; "no I'm having chest pain"; "I don't think it's chest pain" | Fires: R-03 `chest_or_faint` (`emergency`) |
|   | "not sure if I am pregnant" | Fires: R-10 `pregnancy` (`contact`) |
|   | "not feeling well severe stomach pain" | Fires: R-02 `pancreatitis` (`emergency`) |
| The crisis card ignores negation on purpose | "I do not want to die" | Fires: R-01 `crisis` (`crisis`) |

### 2.4 The rules, one by one

For each rule: its level, who it applies to, the card a US user would see once the cards are turned on, and what triggers it. Every card in this section is **hidden until reviewed**, unless it says otherwise.

#### R-01 · `crisis`

- **Level:** `crisis`
- **Applies to:** every user
- **Raised from:** typed text (2.3)

Card, shown in the first public version:

> **You are not alone**
>
> If you are thinking about hurting yourself, please reach out now to someone who can help: crisis line 988. If you are in immediate danger, call 911.

This card shows a "Call 911" button and pauses the day's workout and food tips.

What triggers it in typed text. This rule does not look for "no" or "not": "I do not want to die" still shows the card.

| Code | What the person typed |
|----|------------------------------------------------|
| R-01.1 | A word that contains "suicid" ("suicide", "suicidal"). |
| R-01.2 | "Kill myself", "killing myself". |
| R-01.3 | "End my life", "ending my life", "take my life", "taking my own life". |
| R-01.4 | "Want to die", "wanted to die", "wanna die". |
| R-01.5 | "Wish I was dead", "wish I were dead", "better off dead". |
| R-01.6 | "Don't want to live", "do not want to be alive". |
| R-01.7 | "No reason to live", "no point in living". |
| R-01.8 | "Life isn't worth living", "life is not worth living", "not worth living". |
| R-01.9 | "Want to", "going to", "thinking about", "thinking of", "thoughts of" or "urge to", followed by "hurt myself" or "harm myself" (also "hurting", "harming"). "Self-harm". |
| R-01.10 | "End it all". |
| R-01.11 | "Don't want to be here anymore" (also "around" or "alive" in place of "here"). |
| R-01.12 | "Want to", "wanna", "going to", "gonna", "thinking about", "thinking of" or "ready to", followed by "end it" or "end things". |
| R-01.13 | "Can't go on" at the end of a sentence, or followed by "like this", "anymore", "living", "any longer" or "much longer". |

Examples that trigger (checked): "thinking about suicide", "I want to kill myself", "I want to end my life", "I want to die", "I wish I were dead", "I don't want to live anymore", "there is no reason to live", "life is not worth living", "thoughts of hurting myself", "I want to end it all", "I don't want to be here anymore", "thinking of ending things", "I can't go on like this".

Phrases the test suite requires to trigger this rule: "I want to die"; "thinking about suicide"; "I don't want to live anymore"; "I want to kill myself"; "I don't want to be here anymore"; "I want to end it"; "want to end things"; "thinking of ending things"; "I can't go on"; "I can't go on like this".

#### R-02 · `pancreatitis`

- **Level:** `emergency`
- **Applies to:** every user
- **Raised from:** typed text (2.3)

Card, **hidden until reviewed**:

> **This kind of stomach pain needs a doctor right away**
>
> Severe pain in your upper stomach area, or pain that spreads to your back (possibly with vomiting), may be related to your pancreas. Go to the emergency room right away, and call 911 if you need to. Today's workout and food tips are paused.

This card shows a "Call 911" button and pauses the day's workout and food tips.

What triggers it in typed text:

| Code | What the person typed | Examples that trigger (checked) |
|----|------------------------------------|--------------------|
| R-02.1 | A **severe word**, then (within about 20 characters) a **stomach word** joined to a **pain word**. | "severe stomach pain"; "really bad bellyache" |
| R-02.2 | A **severe word**, then "pain", "ache", "cramp" or "cramping", then "in", "around" or "across", then a **stomach word**. | "terrible pain in my upper abdomen" |
| R-02.3 | A **stomach word**, then (within about 30 characters) words that say the pain is very bad: a **pain word** plus "so", "really", "very", "extremely" or "super" plus "bad", "badly" or "much"; "is killing me"; "unbearable"; "excruciating"; "can't stand it", "can't take it" or "can't bear it"; "doubled over"; "can't stand up straight"; "worst pain". | "my stomach hurts so bad"; "my belly is killing me"; "stomach cramps, doubled over" |
| R-02.4 | "Doubled over", then a **stomach word**. | "doubled over with belly cramps" |
| R-02.5 | A **stomach word** and a **pain word**, then a **reaches-the-back phrase**, in the same sentence or the next one. | "belly pain that goes through to my back"; "Bad stomach pain. It goes to my back." |
| R-02.6 | A **pain word**, then "in", "around" or "across" and a **stomach word**, then a **reaches-the-back phrase**. | "pain in my stomach that goes to my back" |
| R-02.7 | A **stomach word** and a **pain word**, then "but", then a **reaches-the-back phrase**. So "not severe, but it goes to my back" still triggers. | "stomach pain, not severe, but it goes to my back" |
| R-02.8 | A **stomach word**, then "in so much pain" or "in too much pain". | "my stomach is in so much pain" |
| R-02.9 | "So much" or "too much" plus "pain" or "cramping", then "in", "around" or "across", then a **stomach word**. | "so much pain in my belly" |
| R-02.10 | "Stabbing", "sharp", "shooting" or "tearing", directly followed by a **stomach word** joined to a **pain word**. | "sharp stomach pain" |
| R-02.11 | "Stabbing", "sharp", "shooting" or "tearing", then "pain", "cramp" or "cramping", then "in", "around" or "across" and a **stomach word** ("upper" or "lower" may stand before it). | "stabbing pain in my stomach"; "sharp cramps in my lower belly" |

Phrases the test suite requires to trigger this rule: "severe stomach pain going to my back"; "my stomach hurts so bad I can't stand up straight"; "terrible pain in my upper abdomen"; "belly pain that goes through to my back"; "the worst stomach ache of my life"; "stomach pain that won't go away and goes to my back"; "abdominal pain that doesn't stop, radiating to my back"; "Bad stomach pain. It goes to my back."; "stomach pain wrapping around my back"; "stomach pain and now my back"; "stomach pain, not severe, but it goes to my back"; "my stomach is in so much pain"; "stabbing pain in my stomach"; "never had severe stomach pain like this before"; "I've never had severe stomach pain like this".

#### R-03 · `chest_or_faint`

- **Level:** `emergency`
- **Applies to:** every user
- **Raised from:** typed text (2.3)

Card, **hidden until reviewed**:

> **Get medical help right away**
>
> Chest pain or fainting needs care right away. Call 911.

This card shows a "Call 911" button and pauses the day's workout and food tips.

What triggers it in typed text:

| Code | What the person typed | Examples that trigger (checked) |
|----|------------------------------------|--------------------|
| R-03.1 | "Chest pain" or "chest pains". | "chest pain since this morning" |
| R-03.2 | "Pain", "ache", "pressure", "tightness", "squeezing", "heaviness" or "heavy feeling", then "in", "on" or "across" "my chest" or "the chest". | "pressure in my chest"; "heavy feeling on my chest" |
| R-03.3 | "Chest" followed by "hurts", "is hurting", "pressure", "tightness", "is tight", "feels tight" or "feels heavy". | "my chest hurts"; "my chest feels tight" |
| R-03.4 | "Passed out" or "blacked out". | "I passed out after the shot" |
| R-03.5 | "Fainted" or "fainting". | "I fainted in the shower" |
| R-03.6 | "Lost consciousness". | "I lost consciousness for a minute" |
| R-03.7 | "Unconscious". | "I was unconscious" |

Phrases the test suite requires to trigger this rule: "I passed out after the shot"; "chest pain since this morning"; "I fainted in the shower"; "pressure in my chest"; "my chest hurts"; "pressure on my chest"; "heavy feeling on my chest"; "I've never had chest pain like this"; "never had chest pain like this before"; "I've never had chest pain this bad"; "haven't had chest pain like this in years"; "I didn't have chest pain until tonight"; "no chest pain until now"; "I never fainted before today"; "never fainted before but I just did"; "I never get chest pain, but today I do"; "I didn't have chest pain yesterday but I do now"; "I never get chest pain. But today I do."; "wasn't unconscious long"; "isn't chest pain serious?".

#### R-04 · `anaphylaxis`

- **Level:** `emergency`
- **Applies to:** every user
- **Raised from:** typed text (2.3)

Card, **hidden until reviewed**:

> **This may be a serious allergic reaction**
>
> If your lips or throat are swelling, you cannot catch your breath, or you have a rash all over your body, call 911 right away.

This card shows a "Call 911" button and pauses the day's workout and food tips.

What triggers it in typed text:

| Code | What the person typed | Examples that trigger (checked) |
|----|------------------------------------|--------------------|
| R-04.1 | "Throat", "lip", "lips", "tongue", "face", "eyelid" or "eyelids", then (within about 15 characters) a swelling word: "swell", "swells", "swelled", "swelling", "swollen", "puffed up", "puffing up", "closing up" or "is closing". | "my throat is swelling"; "my face is swollen"; "my lips are tingling and swelling" |
| R-04.2 | "Throat" or "airway", then "closing", "closed" or "closes". | "throat closing" |
| R-04.3 | "Swelling" or "swollen", then "throat", "lip", "lips", "tongue", "face", "eyelid" or "eyelids". | "swelling of my lips and tongue" |
| R-04.4 | "Can't", "cannot", "couldn't", "hard to", "trouble", "difficulty", "difficult to", "struggling to" or "unable to", followed by "breathe" or "breathing". It does not count when "through my nose" follows. | "I can't breathe"; "trouble breathing" |
| R-04.5 | "Short of breath" or "shortness of breath". | "short of breath" |
| R-04.6 | "Can't catch my breath". | "I can't catch my breath" |
| R-04.7 | "Hives", "rash" or "welts", then "all over", "everywhere", "whole body" or "entire body". "All over" one body part does not count ("rash all over my thigh"). | "hives all over my body"; "rash everywhere" |
| R-04.8 | "All over", "whole body", "entire body" or "covered in", then "hives", "rash" or "welts". | "covered in hives" |

Phrases the test suite requires to trigger this rule: "my throat is swelling"; "I can't breathe"; "hives all over my body"; "swelling of my lips and tongue"; "my face is swollen"; "throat closing"; "my lips are tingling and swelling"; "I've never had my lips swell like this"; "I have never had my throat swell like this"; "never had trouble breathing like this".

#### R-05 · `vision`

- **Level:** `emergency`
- **Applies to:** every user
- **Raised from:** typed text (2.3)

Card, **hidden until reviewed**:

> **Sudden change in vision: get medical help right away**
>
> If you suddenly cannot see clearly with one eye, or part of your vision is missing, go to an eye doctor or the emergency room right away (911), and tell the doctor you take a GLP-1 medication.

This card shows a "Call 911" button and pauses the day's workout and food tips.

What triggers it in typed text:

| Code | What the person typed | Examples that trigger (checked) |
|----|------------------------------------|--------------------|
| R-05.1 | "Sudden", "suddenly" or "all of a sudden", then (within about 30 characters) a **vision word**, or "went dark" or "went black". | "suddenly I can't see clearly"; "sudden vision loss in one eye" |
| R-05.2 | A **vision word**, then "sudden", "suddenly" or "all of a sudden". | "my vision went blurry all of a sudden" |
| R-05.3 | "One eye", then a **vision word**, "dark", "black" or "fuzzy". | "one eye is blurry" |
| R-05.4 | "Left eye" or "right eye", then a **cannot-see word**, "dark", "black" or "fuzzy". The word "vision" alone is not enough here. | "my right eye is blurry" |
| R-05.5 | A **cannot-see word**, then "one eye", "left eye" or "right eye". | "blurry in my left eye" |
| R-05.6 | "Vision loss", "loss of vision", "loss of sight", "lost my vision", "lost some vision", "lost my sight", "losing my vision", "losing my sight", "went blind", "going blind" or "gone blind". | "losing my sight"; "I think I am going blind" |
| R-05.7 | "Part", "half", "piece", "some" or "a section" of "my vision", "my sight", "my visual field" or "my view", then "missing", "gone", "dark", "black", "blocked" or "cut off". | "part of my vision is missing" |
| R-05.8 | "Blind spot". Or "dark" or "black" plus "spot", "curtain", "shadow" or "area", then "vision", "eye" or "sight". | "a blind spot"; "a dark curtain over my vision" |

Phrases the test suite requires to trigger this rule: "sudden vision loss in one eye"; "my right eye is blurry"; "suddenly I can't see clearly"; "part of my vision is missing".

#### R-06 · `hypoglycemia`

- **Level:** `act_now` (only users who checked the insulin or sulfonylurea box at setup, see 6.7); `urgent` (only users who did not check the insulin or sulfonylurea box at setup, see 6.7)
- **Applies to:** every user
- **Raised from:** typed text (2.3) and symptom buttons (2.2)

Card at level `act_now` (only users who checked the insulin or sulfonylurea box at setup, see 6.7), **hidden until reviewed**:

> **This may be low blood sugar. Treat it first**
>
> First eat 15 grams of sugar (for example, half a cup of juice or 3 to 4 sugar cubes). If you do not feel better after 15 minutes, or you feel worse, get medical help (911) and contact your doctor.

This card shows a "Call 911" button and pauses the day's workout and food tips.

Card at level `urgent` (only users who did not check the insulin or sulfonylurea box at setup, see 6.7), **hidden until reviewed**:

> **It is a good idea to ask your doctor about these symptoms**
>
> Shaking, cold sweats and a racing heart at the same time may be related to your blood sugar. If this keeps happening, see a doctor as soon as possible.

This card shows no call button and pauses the day's workout and food tips.

What triggers it in typed text:

| Code | What the person typed | Examples that trigger (checked) |
|----|------------------------------------|--------------------|
| R-06.1 | A word that starts with "hypoglyc" ("hypoglycemia", "hypoglycemic"). | "I think this is hypoglycemia" |
| R-06.2 | "Low blood sugar" or "low blood glucose". | "low blood sugar" |
| R-06.3 | "Blood sugar" or "blood glucose", then (within about 15 characters) "low", "dropped", "crash", "crashed", "crashing", "tanked" or "bottomed". | "I think my blood sugar is low" |
| R-06.4 | "Sugar" or "glucose", then "is", "was", "got", "went" or "feels", then "low". "Very", "too", "really", "so" or "super" may stand before "low". | "my sugar is really low" |
| R-06.5 | "Sugar" or "glucose" (with or without "level" or "levels"), then "dropped", "dropping", "crashed", "crashing", "tanked", "plummeted" or "bottomed out". | "my glucose dropped"; "sugar crashed" |

It also triggers when the text has signs from **two or more** of these four groups. One group alone is not enough.

| Code | Sign group |
|----|------------------------------------------------|
| R-06.S1 | Shaking: "shaky", "shaking", "shakes", "tremble", "trembles", "trembling", "tremor", "tremors", "jittery". |
| R-06.S2 | Sweating: "cold sweat", "cold sweats", "clammy", "sweaty", "sweating". |
| R-06.S3 | Racing heart: a word that starts with "palpitat"; "heart" or "pulse" plus "racing", "pounding", "fluttering" or "beating fast"; "racing heart", "pounding heart". |
| R-06.S4 | Confusion: a word that starts with "confus"; "disoriented"; "dazed". |

Examples that trigger (checked): "shaky and in a cold sweat", "heart racing and I feel confused".

Phrases the test suite requires to trigger this rule: "I think my blood sugar is low"; "shaky and in a cold sweat"; "low blood sugar"; "heart racing and I feel confused"; "my glucose dropped"; "sugar crashed"; "never had blood sugar this low".

#### R-07 · `dehydration`

- **Level:** `urgent`
- **Applies to:** every user
- **Raised from:** typed text (2.3) and symptom buttons (2.2)

Card, **hidden until reviewed**:

> **Watch out for dehydration**
>
> Vomiting or diarrhea that does not stop, throwing up even water, passing very little urine, or your vision going dark when you stand up can mean a risk of dehydration and kidney harm. Get medical help as soon as possible. Do not force yourself to drink protein drinks for now. If you can drink, take small sips of water or an oral rehydration drink.

This card shows a "Call 911" button and pauses the day's workout and food tips.

What triggers it in typed text:

| Code | What the person typed | Examples that trigger (checked) |
|----|------------------------------------|--------------------|
| R-07.1 | A word that says it keeps happening ("keep", "keeps", "kept", "can't stop", "cannot stop", "won't stop", "constant", "constantly", "nonstop", "over and over", "again and again", "repeatedly"), then a **vomiting word** or a **diarrhea word**. | "I keep throwing up"; "constant diarrhea" |
| R-07.2 | A **vomiting word** or a **diarrhea word**, then a **long-or-often phrase**. | "I've been throwing up all day"; "threw up 6 times today"; "diarrhea nonstop since last night" |
| R-07.3 | "Can't", "cannot", "couldn't", "unable to", "not able to" or "haven't been able to", then "keep", then "anything", "any food", "any water", "any fluids", "any liquids", "water", "even water", "fluids", "liquids", "food" or "a thing", then "down". | "can't keep water down"; "I can't keep any fluids down" |
| R-07.4 | "Nothing stays down", "nothing will stay down" or "nothing is staying down". | "nothing stays down" |
| R-07.5 | A **vomiting word** followed by "water", "everything I drink", "everything I eat", "whatever I drink" or "whatever I eat". "Even", "just" or "plain" may stand in between. | "throwing up even water"; "vomiting everything I drink" |
| R-07.6 | "Even water", "even sips", or "everything", "anything" or "whatever" plus "I eat", "I drink" or "I swallow"; then "comes up", "comes back up", "comes right up", "came up" or a **vomiting word**. | "everything I eat comes back up"; "even water comes right up" |
| R-07.7 | "Haven't", "have not", "hasn't", "didn't" or "did not", followed by "peed", "pee", "urinated", "urinate" or "been able to pee". | "I haven't peed all day" |
| R-07.8 | "No", "barely any", "hardly any", "very little" or "almost no", followed by "pee" or "urine". | "very little urine today" |
| R-07.9 | "Barely" or "hardly", followed by "peeing", "pee", "peed", "urinating", "urinate" or "urinated". | "barely peeing" |
| R-07.10 | "Peeing" or "urinating", followed by "little", "very little" or "so little". | "peeing very little" |
| R-07.11 | "Not peeing" or "not urinating", followed by "much", "a lot" or "at all". | "not peeing much" |
| R-07.12 | "Peeing" or "urinating", followed by "less", "much less", "a lot less" or "way less". | "peeing a lot less than usual" |
| R-07.13 | "Can't pee" or "can't urinate". | "I can't pee" |
| R-07.14 | "Stand up", "stands up", "standing up", "stood up", "get up", "getting up", "got up" or "standing", then a **dizzy phrase**. | "when I stand up I get dizzy"; "got up and everything went black" |
| R-07.15 | A **dizzy phrase**, then "when", "whenever", "every time", "each time", "if", "after" or "as soon as", then "I stand", "I stood", "I get" or "I got". | "dizzy when I stand up"; "lightheaded every time I get up" |

Phrases the test suite requires to trigger this rule: "can't keep water down"; "I've been throwing up all day"; "diarrhea nonstop since last night"; "I haven't peed all day"; "dizzy when I stand up"; "threw up 6 times today"; "everything I eat comes back up".

#### R-08 · `gallbladder`

- **Level:** `urgent`
- **Applies to:** every user
- **Raised from:** typed text (2.3)

Card, **hidden until reviewed**:

> **See a doctor as soon as possible**
>
> Pain in the upper right part of your stomach area, fever, or yellowing of your skin or the whites of your eyes may be related to your gallbladder.

This card shows no call button and pauses the day's workout and food tips.

What triggers it in typed text:

| Code | What the person typed | Examples that trigger (checked) |
|----|------------------------------------|--------------------|
| R-08.1 | A word that starts with "jaundice". | "jaundice" |
| R-08.2 | "Yellow", "yellowing" or "yellowish", followed by "skin", "eye", "eyes", "eyeball" or "eyeballs" ("of", "my" or "the" may stand in between). | "yellowing of my skin"; "yellow eyes" |
| R-08.3 | "Skin", "eye", "eyes" or "whites of my eyes", then "is", "are", "looks", "turned", "turning", "got", "getting", "went", "going", "gone" or "seems", then "yellow". | "my eyes look yellow"; "my skin is turning yellow" |
| R-08.4 | A **pain or soreness word**, then (within about 30 characters) an **upper-right phrase**. | "pain in my upper right abdomen"; "pain under my right ribs" |
| R-08.5 | An **upper-right phrase**, then a **pain or soreness word**. | "my upper right side hurts"; "right rib cage is sore" |
| R-08.6 | "Right upper pain" or "right upper abdominal pain". | "right upper abdominal pain" |

Phrases the test suite requires to trigger this rule: "jaundice"; "my eyes look yellow"; "pain in my upper right abdomen"; "my skin is turning yellow"; "pain under my right ribs".

#### R-09 · `thyroid`

- **Level:** `urgent`
- **Applies to:** every user
- **Raised from:** typed text (2.3)

Card, **hidden until reviewed**:

> **See a doctor as soon as possible**
>
> If you feel a lump in your neck, have trouble swallowing, or have a hoarse voice that does not go away, tell your doctor you take this type of medication.

This card shows no call button and does not pause anything.

What triggers it in typed text:

| Code | What the person typed | Examples that trigger (checked) |
|----|------------------------------------|--------------------|
| R-09.1 | "Lump", "bump", "swelling", "mass", "nodule", "knot" or "growth", then "in", "on", "at" or "around" "my neck" or "the front of my neck". | "lump in my neck"; "a swelling on the front of my neck" |
| R-09.2 | "Neck" followed by "lump", "swelling", "swollen", "mass" or "nodule" ("is", "looks" or "feels" may stand in between). | "my neck is swollen" |
| R-09.3 | "Trouble", "difficulty", "difficult", "hard time", "problem", "problems", "hard", "can't", "cannot" or "unable to", followed by a word that starts with "swallow". | "trouble swallowing"; "it's hard to swallow" |
| R-09.4 | "Hoarse", "hoarseness", "raspy" or "lost my voice", then words that say it has lasted: "for weeks", "for months", "for a long time", "for a while", "for a month", "for ages", "won't go away", "not getting better", "not improving", "still", "all the time" or "constantly". | "my voice has been hoarse for weeks"; "hoarse and it won't go away" |
| R-09.5 | "For weeks", "for months", "for a long time", "still", "always" or "constantly", then "hoarse" or "raspy". | "still hoarse" |

Phrases the test suite requires to trigger this rule: "lump in my neck"; "trouble swallowing"; "my voice has been hoarse for weeks"; "it's hard to swallow"; "never had trouble swallowing until now".

#### R-10 · `pregnancy`

- **Level:** `contact`
- **Applies to:** every user
- **Raised from:** typed text (2.3)

Card, **hidden until reviewed** (in the first public version this rule shows no alert, see 2.1):

> **Contact the doctor who prescribed your medication**
>
> If you are pregnant, trying to get pregnant, or breastfeeding, your doctor needs to review your use of this medication (the semaglutide label says to stop semaglutide at least 2 months before a planned pregnancy). Your goal weight has been paused.

This card shows no call button and does not pause anything.

What triggers it in typed text:

| Code | What the person typed | Examples that trigger (checked) |
|----|------------------------------------|--------------------|
| R-10.1 | Any word that starts with "pregnan" ("pregnant", "pregnancy"). | "I am pregnant"; "I think I might be pregnant" |
| R-10.2 | "Breastfeed", "breast-feed" or "breast feed", with any ending ("breastfeeding"). | "I am breastfeeding" |
| R-10.3 | "Lactating". | "I am lactating" |
| R-10.4 | "Nursing" followed by "my", "the", "a" or "our" and "baby", "son", "daughter", "newborn", "infant" or "little one". | "nursing my baby" |
| R-10.5 | "Trying to conceive", "trying for a baby" or "trying to have a baby". | "trying for a baby" |
| R-10.6 | "TTC". | "TTC since March" |
| R-10.7 | "Conceive" or "conceiving". | "hoping to conceive soon" |
| R-10.8 | "Expecting a baby" or "expecting twins". | "expecting a baby in May" |

A "not" in front does not stop this rule when "yet" follows, or "but" or "though" with "trying", "hoping" or "planning". The card is also meant for people who are trying to get pregnant.

Phrases the test suite requires to trigger this rule: "I am pregnant"; "trying to get pregnant"; "I am breastfeeding"; "I think I might be pregnant"; "not pregnant yet"; "not pregnant but trying"; "not pregnant, but we are trying".

#### R-11 · `procedure`

- **Level:** `remind`
- **Applies to:** every user
- **Raised from:** typed text (2.3)

Card, **hidden until reviewed** (in the first public version this rule shows no alert, see 2.1):

> **Tell your doctor ahead of time**
>
> If you are going to have surgery, general anesthesia, an upper endoscopy or a colonoscopy, tell your doctor and the doctor giving you anesthesia ahead of time that you take a GLP-1 medication.

This card shows no call button and does not pause anything.

What triggers it in typed text:

| Code | What the person typed | Examples that trigger (checked) |
|----|------------------------------------|--------------------|
| R-11.1 | "Surgery" or "surgeries". | "I have surgery on Friday" |
| R-11.2 | "Operation" after "an", "my", "the", "for", "having", "have" or "need". | "I need an operation" |
| R-11.3 | "Anesthesia", "anesthetic" or "anesthesiologist" (also in the British spelling). | "going under anesthesia tomorrow" |
| R-11.4 | "Sedation" or "sedated". | "I will be sedated for it" |
| R-11.5 | "Endoscopy", "colonoscopy" or "gastroscopy" (also in the plural). | "colonoscopy next week"; "endoscopy scheduled for Monday" |

A "not" in front does not stop this rule when "yet" follows: the procedure is still ahead.

Phrases the test suite requires to trigger this rule: "colonoscopy next week"; "I have surgery on Friday"; "going under anesthesia tomorrow"; "endoscopy scheduled for Monday"; "have not had surgery yet, it is next week".

#### R-12 · `contraception`

- **Level:** `remind`
- **Applies to:** only when the medication set up in the app is tirzepatide (Zepbound, Mounjaro)
- **Raised from:** typed text (2.3)

Card, **hidden until reviewed** (in the first public version this rule shows no alert, see 2.1):

> **A reminder from the label**
>
> The tirzepatide label advises: for 4 weeks after you start the medication and after each dose increase, use another form of birth control in addition to birth control pills.

This card shows no call button and does not pause anything.

What triggers it in typed text:

| Code | What the person typed | Examples that trigger (checked) |
|----|------------------------------------|--------------------|
| R-12.1 | "Birth control pill" or "birth control pills". | "I'm on birth control pills" |
| R-12.2 | "Contraceptive pill" or "contraceptive pills". | "I take a contraceptive pill" |
| R-12.3 | "Oral contraceptive" or "oral contraception". | "I take an oral contraceptive" |
| R-12.4 | "On", "taking", "take", "started", "use" or "using", followed by "the pill". | "I'm on the pill" |

#### R-13 · `eating_too_little`

- **Level:** `care`
- **Applies to:** every user
- **Raised from:** typed text (2.3)

Card, **hidden until reviewed** (in the first public version this rule shows no alert, see 2.1):

> **You are eating too little. Take care of yourself**
>
> If you have barely been able to eat for several days in a row, it is a good idea to talk with your doctor or a dietitian. Set your goal weight aside for now. First make sure you drink water and get a little protein.

This card shows no call button and does not pause anything.

What triggers it in typed text:

| Code | What the person typed | Examples that trigger (checked) |
|----|------------------------------------|--------------------|
| R-13.1 | A **not-eating phrase**, then (within about 25 characters) a **days phrase**. | "haven't eaten in 3 days"; "I have barely eaten for the past four days" |
| R-13.2 | A **days phrase**, then (within about 30 characters) a **not-eating phrase**. | "for the last few days I can't eat anything" |

Phrases the test suite requires to trigger this rule: "haven't eaten in 3 days"; "I have barely eaten for the past four days"; "for the last few days I can't eat anything"; "couldn't eat for days".

#### R-14 · `abdominal_pain_severe`

- **Level:** `urgent`
- **Applies to:** every user
- **Raised from:** symptom buttons (2.2)

Card, **hidden until reviewed**:

> **Severe or lasting stomach pain: see a doctor as soon as possible**
>
> If the pain spreads to your back, comes with vomiting, or keeps getting worse, go to the emergency room right away (911). Today's workout is paused.

This card shows a "Call 911" button and pauses the day's workout and food tips.

No typed phrase triggers this rule. It is raised only from the symptom buttons (2.2).

### 2.5 Known over- and under-triggering

The rules are tuned to fire too often rather than too seldom. The lists below show where that line sits today. Please mark every phrase that you think is on the wrong side.

**From the test suite: fires on purpose, although the person may be fine**

| Code | Phrase | What the rules do today | Why |
|----|--------------------|----------------|------------------------|
| O-01 | "I don't think it's chest pain" | Fires: R-03 `chest_or_faint` (`emergency`) | The person doubts it, but the rule fires anyway. |
| O-02 | "isn't chest pain serious?" | Fires: R-03 `chest_or_faint` (`emergency`) | A question about the symptom fires the rule. |
| O-03 | "not sure if I am pregnant" | Fires: R-10 `pregnancy` (`contact`) | Being unsure counts. |
| O-04 | "not pregnant yet" | Fires: R-10 `pregnancy` (`contact`) | The pregnancy card is also meant for people who are trying. |
| O-05 | "have not had surgery yet, it is next week" | Fires: R-11 `procedure` (`remind`) | The procedure is still ahead. |
| O-06 | "I do not want to die" | Fires: R-01 `crisis` (`crisis`) | The self-harm rule does not look for "no" or "not". The support card is shown. |
| O-07 | "never had chest pain like this before" | Fires: R-03 `chest_or_faint` (`emergency`) | "Never ... like this" means the pain is there now. |

**From the test suite: stays quiet on purpose**

| Code | Phrase | Why it stays quiet |
|----|--------------------|----------------------------------------|
| U-01 | "threw up twice" | Vomiting triggers only when it keeps going, lasts long, or is counted 5 or more times. |
| U-02 | "a little dizzy" | Dizziness triggers only together with standing up. |
| U-03 | "heart racing a bit" | One low-blood-sugar sign alone is not enough. Two sign groups are needed. |
| U-04 | "feeling shaky after coffee" | One low-blood-sugar sign alone is not enough. |
| U-05 | "had a sugar crash after lunch" | "Sugar crash" as a figure of speech does not match the low-blood-sugar phrases. |
| U-06 | "mild stomach ache after dinner" | Stomach pain triggers only with a severe word or when it reaches the back. |
| U-07 | "my stomach pain is back" | "Is back" is not read as pain reaching the back. |
| U-08 | "stomach pain, but not to my back" | The person says it does not reach the back. |
| U-09 | "barely ate today" | Eating too little triggers only when it has gone on for days. |
| U-10 | "rash at the injection site" | A rash triggers only when it is all over the body. |
| U-11 | "itchy rash all over my thigh" | "All over" one body part does not count. |
| U-12 | "sore throat" | Only swelling or closing of the throat triggers. |
| U-13 | "can't breathe through my nose" | A blocked nose is not read as trouble breathing. |

All 42 English phrases the test suite requires to stay quiet: "a little nauseous"; "threw up once"; "took my shot, 5 mg, left thigh"; "182.4 this morning"; "not pregnant"; "no severe pain"; "feeling tired today"; "two eggs and a protein shake"; "mild stomach ache after dinner"; "stomach feels bloated"; "my stomach pain is back"; "back is sore from the gym"; "upper right arm is sore after the shot"; "injection site is a little red"; "rash at the injection site"; "itchy rash all over my thigh"; "a little dizzy"; "heart racing a bit"; "threw up twice"; "constantly nauseous, no vomiting"; "Took my shot this morning. Mild nausea. No vomiting."; "barely ate today"; "skipped breakfast"; "sore throat"; "can't breathe through my nose"; "chest day at the gym"; "yellow squash for dinner"; "vision is fine"; "lost 2 pounds this week"; "weighed 182.4"; "I can't go on a walk today"; "can't go on vacation this month"; "I don't want to be here at the gym"; "had a sugar crash after lunch"; "cut sugar, dropped 2 lb"; "my face is red and my ankle is swollen"; "my eyelids closed and I fell asleep"; "sharp cheddar and stomach ache"; "stomach ache. Went back to bed."; "stomach pain, but not to my back"; "stomach pain while sitting in the back seat"; "rested the bar on my chest".

**Not in the test suite: extra phrases tried while building this packet**

Nobody has decided yet what these should do. The table shows what the rules do with each one today.

| Code | Phrase | What the rules do today |
|----|------------------------|------------------------|
| X-01 | "my sister is pregnant" | Fires: R-10 `pregnancy` (`contact`) |
| X-02 | "my mom is having surgery next week" | Fires: R-11 `procedure` (`remind`) |
| X-03 | "my dad had chest pain last year" | Fires: R-03 `chest_or_faint` (`emergency`) |
| X-04 | "I fainted once as a kid" | Fires: R-03 `chest_or_faint` (`emergency`) |
| X-05 | "hard to swallow this big pill" | Fires: R-09 `thyroid` (`urgent`) |
| X-06 | "short of breath after climbing stairs" | Fires: R-04 `anaphylaxis` (`emergency`) |
| X-07 | "really bad stomach cramps from my period" | Fires: R-02 `pancreatitis` (`emergency`) |
| X-08 | "watched a show about suicide prevention" | Fires: R-01 `crisis` (`crisis`) |
| X-09 | "sedated at the dentist last month" | Fires: R-11 `procedure` (`remind`) |
| X-10 | "I feel faint" | Stays quiet |
| X-11 | "I keep passing out" | Stays quiet |
| X-12 | "my vision is blurry" | Stays quiet |
| X-13 | "double vision" | Stays quiet |
| X-14 | "stomach pain that won't go away" | Stays quiet |
| X-15 | "constant stomach pain" | Stays quiet |
| X-16 | "throwing up and stomach pain" | Stays quiet |
| X-17 | "fever and stomach pain" | Stays quiet |
| X-18 | "threw up 4 times" | Stays quiet |
| X-19 | "throwing up everything" | Stays quiet |
| X-20 | "vomited blood" | Stays quiet |
| X-21 | "black tarry stool" | Stays quiet |
| X-22 | "clay colored stools" | Stays quiet |
| X-23 | "dark urine" | Stays quiet |
| X-24 | "can't pass gas and my belly is swollen" | Stays quiet |
| X-25 | "no bowel movement for a week" | Stays quiet |
| X-26 | "my throat feels tight" | Stays quiet |
| X-27 | "itching all over" | Stays quiet |
| X-28 | "wheezing" | Stays quiet |
| X-29 | "very fast heartbeat" | Stays quiet |
| X-30 | "dizzy and confused" | Stays quiet |
| X-31 | "my blood sugar was 60 this morning" | Stays quiet |
| X-32 | "feeling hopeless" | Stays quiet |
| X-33 | "feeling depressed" | Stays quiet |

## 3. Texts that are hidden until reviewed

Nothing in this section is shown in the first public version. Each part is switched off until it has been reviewed and corrected. The texts are printed exactly as the code has them.

### 3.1 Coping cards

Status: **Hidden until reviewed**.

A coping card is offered after a person logs a symptom that did not raise an alert. Each card has three lists.

Under every card the app prints this line: "Sources: FDA patient information for semaglutide and tirzepatide injections for weight management; ACLM/ASN/OMA/TOS 2025 joint advisory on nutrition and lifestyle with GLP-1 medications. This content is still waiting for clinical review. For reference only."

#### C-1 · Nausea, feeling like throwing up

Status: **Hidden until reviewed**. Offered after: Nausea, Vomiting, Heartburn or burping.

| Code | List on the card | Line |
|----|------------|----------------------------------------|
| C-1.1 | Things to try first | Eat small meals more often. Stop when you are just no longer hungry, and eat slowly |
| C-1.2 | Things to try first | Choose bland, cooler foods without strong smells: plain rice porridge, saltine crackers, yogurt, tofu |
| C-1.3 | Things to try first | Do not lie down right after eating. Wait at least 2 hours after a meal before you sleep |
| C-1.4 | Things to try first | Take small sips of water often |
| C-1.5 | Try to avoid | Greasy, fried, very spicy or very sweet foods |
| C-1.6 | Try to avoid | Drinking a lot at one time |
| C-1.7 | Try to avoid | Eating until you are too full |
| C-1.8 | See a doctor if | You vomit so much that you cannot keep water down, or you pass very little urine |
| C-1.9 | See a doctor if | Severe stomach pain, or pain that reaches your back |
| C-1.10 | See a doctor if | It does not ease up after a dose increase |

#### C-2 · Constipation

Status: **Hidden until reviewed**. Offered after: Constipation.

| Code | List on the card | Line |
|----|------------|----------------------------------------|
| C-2.1 | Things to try first | Drink more water than you usually do |
| C-2.2 | Things to try first | Add fiber slowly: vegetables, oats, beans, fruit. Do not add a lot all at once |
| C-2.3 | Things to try first | Walk every day. Take a 10–15 minute walk after meals |
| C-2.4 | Try to avoid | Drinking too little water |
| C-2.5 | Try to avoid | Adding a lot of fiber all at once (it makes bloating worse) |
| C-2.6 | See a doctor if | No bowel movement for more than 3 days, together with stomach pain, vomiting or a lot of bloating |
| C-2.7 | See a doctor if | Blood in your stool, or black stool |
| C-2.8 | See a doctor if | You have tried ways to relieve constipation and they have not worked (ask your doctor or pharmacist first) |

#### C-3 · No appetite, hard to eat

Status: **Hidden until reviewed**. Offered after: No appetite.

| Code | List on the card | Line |
|----|------------|----------------------------------------|
| C-3.1 | Things to try first | Protein first: at each meal eat the eggs, tofu, fish or meat before the rice, bread or noodles |
| C-3.2 | Things to try first | If you cannot eat solid food, drink it: milk, unsweetened soy milk, protein powder |
| C-3.3 | Things to try first | Eat by the clock: a little every 3–4 hours. Do not wait until you feel hungry |
| C-3.4 | Things to try first | Reach your minimum first. The ideal range can wait |
| C-3.5 | Try to avoid | Eating nothing all day and then a lot at night |
| C-3.6 | Try to avoid | Eating only snacks and starchy foods |
| C-3.7 | See a doctor if | You can barely eat for several days in a row |
| C-3.8 | See a doctor if | Your weight is dropping too fast (more than 1.5% a week), or you are always dizzy and weak |

#### C-4 · Tired, no energy

Status: **Hidden until reviewed**. Offered after: Tiredness, Dizziness.

| Code | List on the card | Line |
|----|------------|----------------------------------------|
| C-4.1 | Things to try first | Check whether you have had enough water and enough protein today |
| C-4.2 | Things to try first | Switch your workout to the light version or move it to another day. A walk counts too |
| C-4.3 | Things to try first | Get enough sleep and keep a regular schedule |
| C-4.4 | Try to avoid | Hard exercise on an empty stomach |
| C-4.5 | Try to avoid | Standing up too fast |
| C-4.6 | See a doctor if | Your vision goes dark or your heart pounds when you stand up |
| C-4.7 | See a doctor if | You take insulin or a sulfonylurea diabetes medication and you get shaky and sweaty |
| C-4.8 | See a doctor if | The tiredness does not ease up, or keeps getting worse |

### 3.2 Daily advice

Status: **Hidden until reviewed**.

One advice card sits at the top of the main screen. The app goes down the list below and shows the first case that fits. In the texts, [minimum] stands for the protein minimum of that person in grams (section 6.1) and [N] for a day count.

| Code | When it shows | Title | Text |
|----|--------------------|------------|--------------------------------|
| A-01 | An alert was raised today and has not been closed yet, or an alert that pauses the day's tips was raised today. | Take care of your body first today | What you logged today may need a doctor. Workout and food tips are paused for today. If you can drink, take small sips of water. |
| A-02 | The status is "Increasing dose" or "Maintenance dose", and the dose time passed more than 12 hours ago with nothing logged. Shot. | Did you forget to log it? | It is past your shot time and nothing is logged. If you took it, log it now. If you missed it, go by the instructions that came with your medication. If you are not sure, ask your doctor. |
| A-03 | The status is "Increasing dose" or "Maintenance dose", and the dose time passed more than 12 hours ago with nothing logged. Pill. | Did you forget to log it? | It is past your pill time and nothing is logged. If you took it, log it now. If you missed it, follow the instructions that came with your medication, or ask your doctor. |
| A-04 | The status is "Increasing dose" or "Maintenance dose", and the next dose is due today or its time has come. Shot, the person has a protein minimum. | Today is shot day | Log your shot after you take it, and use a different site from last time. If your appetite is low for a day or two after the shot: get your [minimum] g of protein first, spread over 3–4 meals or snacks. |
| A-05 | The status is "Increasing dose" or "Maintenance dose", and the next dose is due today or its time has come. Shot, no protein minimum. | Today is shot day | Log your shot after you take it, and use a different site from last time. If your appetite is low for a day or two after the shot: try smaller meals, more often. |
| A-06 | The status is "Increasing dose" or "Maintenance dose", and the next dose is due today or its time has come. Pill. | Remember your pill today | Take it on time, then log it. |
| A-07 | Within 14 days after the first dose at a higher amount than before (the first dose ever logged also counts). With a protein minimum. | Day [N] after a dose increase | Side effects are often more noticeable in the two weeks after a dose increase. Eat small meals more often and drink plenty of water. Get your [minimum] g of protein first, spread over 3–4 meals or snacks. Switch your workout to the 15-minute light version. |
| A-08 | Within 14 days after the first dose at a higher amount than before (the first dose ever logged also counts). No protein minimum. | Day [N] after a dose increase | Side effects are often more noticeable in the two weeks after a dose increase. Eat small meals more often and drink plenty of water. Switch your workout to the 15-minute light version. |
| A-09 | Today is one of the person's own high-symptom days (section 6.4). With a protein minimum. | Today may be a bit harder | Going by your logs from the past few weeks, side effects are often more noticeable on day [N] after your shot. Get your [minimum] g of protein first, spread over 3–4 meals or snacks. Switch your workout to the light version, or move it to another day. |
| A-10 | Today is one of the person's own high-symptom days (section 6.4). No protein minimum. | Today may be a bit harder | Going by your logs from the past few weeks, side effects are often more noticeable on day [N] after your shot. Switch your workout to the light version, or move it to another day. |
| A-11 | On each of the last 3 days food was logged and the protein total was under the minimum. | Protein has been low the last few days | You have been under [minimum] g for 3 days in a row. Try eating the protein part of each meal first, or add a glass of milk or a scoop of protein powder. |
| A-12 | The status is "Stopped" and the stop date is known. | Day [N] off your medication | Weigh yourself 2–3 times a week and watch the 7-day average. Keep up your protein and workouts. Some weight regain is very common. It is how the body works, not a failure. |
| A-13 | The status is "Stopped" and the stop date is not known. | After stopping your medication | Weigh yourself 2–3 times a week and watch the 7-day average. Keep up your protein and workouts. Some weight regain is very common. It is how the body works, not a failure. |
| A-14 | None of the cases above; fewer than 2 workouts logged this week (the week starts on Monday) and none today or yesterday. With a protein minimum. | A good day for a workout | 15–25 minutes is enough, 2–3 times a week. Get your [minimum] g of protein first, spread over 3–4 meals or snacks. |
| A-15 | None of the cases above; fewer than 2 workouts logged this week (the week starts on Monday) and none today or yesterday. No protein minimum. | A good day for a workout | 15–25 minutes is enough, 2–3 times a week. |
| A-16 | None of the cases above. With a protein minimum. | A regular day today | Get your [minimum] g of protein first, spread over 3–4 meals or snacks. If you get tired, take an easy walk. |
| A-17 | None of the cases above. No protein minimum. | A regular day today | Eat the way you usually do. If you get tired, take an easy walk. |

### 3.3 Workouts

Status: **Hidden until reviewed**.

A person picks one of 3 routines and one of two versions: "Standard, 20–25 minutes" or "Light, 10–15 minutes". The app only records that the workout was done. Under every routine it says: "Rest 60–90 seconds between sets. Stop if anything hurts. On a day you do not feel well, do the light version or move it to another day. That still counts."

The trends screen counts the workouts of the last 7 days and says: "[N] workouts in the last 7 days (2–3 a week is suggested)."

#### W-1 · Bodyweight

| Code | Exercise | How to do it | Standard | Light |
|----|------------|--------------------------------|------------|------------|
| W-1.1 | Chair sit-to-stand | Sit on the front edge of a chair with your arms crossed over your chest. Stand up, then sit back down slowly | 3 sets × 10 reps | 2 sets × 8 reps |
| W-1.2 | Wall push-up | Put your hands on a wall with your body in a straight line. Bring your chest toward the wall, then push back | 3 sets × 10 reps | 2 sets × 8 reps |
| W-1.3 | Glute bridge | Lie on your back with your knees bent and your feet on the floor. Lift your hips, then lower them | 3 sets × 12 reps | 2 sets × 10 reps |
| W-1.4 | Calf raise | Stand holding on to a table. Rise onto your toes, then lower | 3 sets × 15 reps | 2 sets × 12 reps |
| W-1.5 | Plank (on your knees is fine) | Rest on your forearms and keep your body in a straight line | 3 sets × 20 seconds | 2 sets × 15 seconds |

#### W-2 · Resistance band

| Code | Exercise | How to do it | Standard | Light |
|----|------------|--------------------------------|------------|------------|
| W-2.1 | Band squat | Stand on the band and hold the ends in front of your shoulders. Squat down, then stand up | 3 sets × 10 reps | 2 sets × 8 reps |
| W-2.2 | Band row | Loop the band under your feet or fix it to a door handle. Pull back to the side of your waist | 3 sets × 12 reps | 2 sets × 10 reps |
| W-2.3 | Band chest press | Wrap the band behind your back and push both hands forward | 3 sets × 10 reps | 2 sets × 8 reps |
| W-2.4 | Band side step | Put the band just above your knees. In a half squat, step to the side | 3 sets × 10 steps | 2 sets × 8 steps |
| W-2.5 | Band face pull | Fix the band at a high point. Pull it toward your face, moving your hands apart | 3 sets × 12 reps | 2 sets × 10 reps |

#### W-3 · Dumbbells

| Code | Exercise | How to do it | Standard | Light |
|----|------------|--------------------------------|------------|------------|
| W-3.1 | Goblet squat | Hold one dumbbell at your chest with both hands. Squat down, then stand up | 3 sets × 10 reps | 2 sets × 8 reps |
| W-3.2 | One-arm row | Rest one hand on a chair. With the other hand, pull the dumbbell up to the side of your waist | 3 sets × 10 reps per side | 2 sets × 8 reps per side |
| W-3.3 | Dumbbell shoulder press | Sitting down, push the dumbbells from your shoulders to above your head | 3 sets × 10 reps | 2 sets × 8 reps |
| W-3.4 | Romanian deadlift | With your knees slightly bent, push your hips back and lower the dumbbells along your legs. Then stand up | 3 sets × 10 reps | 2 sets × 8 reps |
| W-3.5 | Farmer's walk | Hold a dumbbell in each hand and walk with your chest up | 3 rounds × 30 seconds | 2 rounds × 20 seconds |

## 4. US medication list

At setup a US user picks one of 8 brands, or "Other / custom": Wegovy, Ozempic, Zepbound, Mounjaro, Wegovy pill, Foundayo, Rybelsus, Saxenda. Brand names are used only so that people can find their own medication. Trademarks belong to their owners. The app is not connected to any drug maker.

How the app uses each number:

- **Dose steps.** Only the first step is used: at setup it is the grey example in the box where a person types the dose they were prescribed ("For example, [first step]"). The app never suggests a step and never says when to move up.
- **Highest dose.** A typing check, nothing more. When a person logs a dose in mg above this number, the app asks once: "[amount] mg is more than the usual highest dose for this medication ([highest dose] mg). Did you type an extra digit? If it is correct, tap the button again." Then it lets them log it. Doses logged in other units are not checked and never converted.
- **Half-life and time to peak.** Used only for the chart in section 5.
- **Wait after a pill.** On the sheet where a pill is logged the app shows: "For [minutes] minutes after your pill, do not eat or drink. Take the pill with only a small sip of water." After the pill is logged, the main screen counts those minutes down with other words: "Empty stomach: wait [minutes] more minutes before you eat". The countdown speaks of eating only; the sheet also says not to drink.

**In the first public version a number is used only when its entry names the FDA label page it was read from.** That holds for the chart and for the three uses above: the dose example, the typing check and the wait after a pill. No entry does today, so the first public version shows no dose example, asks no typing check, and shows no wait after a pill. Every medication can only be logged. Each use comes back by itself when the entry gets its label page. The full test version uses every number below as it stands.

No entry names a label page yet. **Every number below is from the code and has not been checked against the FDA label.** The rule in the code is that a number may be added or changed only together with the address of the FDA label page it was read from. No entry has been marked as checked by a person.

Please write the correct value and the label section (for example "2.2" or "12.3") in the two blank columns. Leave a cell empty when the value in the app is right, and write "OK" in the label column. Where the app has no value, please give one from the label.

#### Wegovy (semaglutide)

| Code | What | In the app | Where it comes from | Your correction | Label section |
|----|--------------------|----------------|--------------------|----------------|------------|
| M-01 | Brand name | Wegovy | From code, not yet checked against the FDA label |   |   |
| M-02 | Generic name | semaglutide | From code, not yet checked against the FDA label |   |   |
| M-03 | How it is taken | Shot, under the skin | From code, not yet checked against the FDA label |   |   |
| M-04 | How often | Once a week | From code, not yet checked against the FDA label |   |   |
| M-05 | Dose steps (mg) | 0.25, 0.5, 1, 1.7, 2.4, 7.2 | From code, not yet checked against the FDA label |   |   |
| M-06 | Highest dose for the typing check (mg) | 7.2 | From code, not yet checked against the FDA label |   |   |
| M-07 | Half-life used for the chart | 168 hours (7 days) | From code, not yet checked against the FDA label |   |   |
| M-08 | Time to peak used for the chart | 48 hours (2 days) | From code, not yet checked against the FDA label |   |   |

Chart of the estimated medication level: not drawn in the first public version (its numbers have no label source yet); drawn in the full test version.

The dose example, the typing check: not used in the first public version (no label source yet); used in the full test version.

#### Ozempic (semaglutide)

| Code | What | In the app | Where it comes from | Your correction | Label section |
|----|--------------------|----------------|--------------------|----------------|------------|
| M-09 | Brand name | Ozempic | From code, not yet checked against the FDA label |   |   |
| M-10 | Generic name | semaglutide | From code, not yet checked against the FDA label |   |   |
| M-11 | How it is taken | Shot, under the skin | From code, not yet checked against the FDA label |   |   |
| M-12 | How often | Once a week | From code, not yet checked against the FDA label |   |   |
| M-13 | Dose steps (mg) | 0.25, 0.5, 1, 2 | From code, not yet checked against the FDA label |   |   |
| M-14 | Highest dose for the typing check (mg) | 2 | From code, not yet checked against the FDA label |   |   |
| M-15 | Half-life used for the chart | 168 hours (7 days) | From code, not yet checked against the FDA label |   |   |
| M-16 | Time to peak used for the chart | 48 hours (2 days) | From code, not yet checked against the FDA label |   |   |

Chart of the estimated medication level: not drawn in the first public version (its numbers have no label source yet); drawn in the full test version.

The dose example, the typing check: not used in the first public version (no label source yet); used in the full test version.

#### Zepbound and Mounjaro (tirzepatide)

Zepbound and Mounjaro share one entry in the app, so they have the same numbers. Please tell us if they should differ.

| Code | What | In the app | Where it comes from | Your correction | Label section |
|----|--------------------|----------------|--------------------|----------------|------------|
| M-17 | Brand names | Zepbound, Mounjaro | From code, not yet checked against the FDA label |   |   |
| M-18 | Generic name | tirzepatide | From code, not yet checked against the FDA label |   |   |
| M-19 | How it is taken | Shot, under the skin | From code, not yet checked against the FDA label |   |   |
| M-20 | How often | Once a week | From code, not yet checked against the FDA label |   |   |
| M-21 | Dose steps (mg) | 2.5, 5, 7.5, 10, 12.5, 15 | From code, not yet checked against the FDA label |   |   |
| M-22 | Highest dose for the typing check (mg) | 15 | From code, not yet checked against the FDA label |   |   |
| M-23 | Half-life used for the chart | 120 hours (5 days) | From code, not yet checked against the FDA label |   |   |
| M-24 | Time to peak used for the chart | 24 hours (1 day) | From code, not yet checked against the FDA label |   |   |

Chart of the estimated medication level: not drawn in the first public version (its numbers have no label source yet); drawn in the full test version.

The dose example, the typing check: not used in the first public version (no label source yet); used in the full test version.

#### Wegovy pill (semaglutide)

| Code | What | In the app | Where it comes from | Your correction | Label section |
|----|--------------------|----------------|--------------------|----------------|------------|
| M-25 | Brand name | Wegovy pill | From code, not yet checked against the FDA label |   |   |
| M-26 | Generic name | semaglutide | From code, not yet checked against the FDA label |   |   |
| M-27 | How it is taken | Pill, by mouth | From code, not yet checked against the FDA label |   |   |
| M-28 | How often | Once a day | From code, not yet checked against the FDA label |   |   |
| M-29 | Dose steps (mg) | 1.5, 4, 9, 25 | From code, not yet checked against the FDA label |   |   |
| M-30 | Highest dose for the typing check (mg) | 25 | From code, not yet checked against the FDA label |   |   |
| M-31 | Half-life used for the chart |   | Not in the app. Left blank until it is read from the FDA label |   |   |
| M-32 | Time to peak used for the chart |   | Not in the app. Left blank until it is read from the FDA label |   |   |
| M-33 | Wait after the pill before eating or drinking (minutes) | 30 | From code, not yet checked against the FDA label |   |   |

Chart of the estimated medication level: not drawn in the first public version (the app has no half-life and time to peak for it); not drawn in the full test version.

The dose example, the typing check, the wait after a pill: not used in the first public version (no label source yet); used in the full test version.

#### Foundayo (orforglipron)

| Code | What | In the app | Where it comes from | Your correction | Label section |
|----|--------------------|----------------|--------------------|----------------|------------|
| M-34 | Brand name | Foundayo | From code, not yet checked against the FDA label |   |   |
| M-35 | Generic name | orforglipron | From code, not yet checked against the FDA label |   |   |
| M-36 | How it is taken | Pill, by mouth | From code, not yet checked against the FDA label |   |   |
| M-37 | How often | Once a day | From code, not yet checked against the FDA label |   |   |
| M-38 | Dose steps (mg) |   | Not in the app. Left blank until it is read from the FDA label |   |   |
| M-39 | Highest dose for the typing check (mg) |   | Not in the app. Left blank until it is read from the FDA label |   |   |
| M-40 | Half-life used for the chart |   | Not in the app. Left blank until it is read from the FDA label |   |   |
| M-41 | Time to peak used for the chart |   | Not in the app. Left blank until it is read from the FDA label |   |   |
| M-42 | Wait after the pill before eating or drinking (minutes) |   | Not in the app. No wait is shown for this medication |   |   |

Chart of the estimated medication level: not drawn in the first public version (the app has no half-life and time to peak for it); not drawn in the full test version.

#### Rybelsus (semaglutide)

| Code | What | In the app | Where it comes from | Your correction | Label section |
|----|--------------------|----------------|--------------------|----------------|------------|
| M-43 | Brand name | Rybelsus | From code, not yet checked against the FDA label |   |   |
| M-44 | Generic name | semaglutide | From code, not yet checked against the FDA label |   |   |
| M-45 | How it is taken | Pill, by mouth | From code, not yet checked against the FDA label |   |   |
| M-46 | How often | Once a day | From code, not yet checked against the FDA label |   |   |
| M-47 | Dose steps (mg) | 3, 7, 14 | From code, not yet checked against the FDA label |   |   |
| M-48 | Highest dose for the typing check (mg) | 14 | From code, not yet checked against the FDA label |   |   |
| M-49 | Half-life used for the chart |   | Not in the app. Left blank until it is read from the FDA label |   |   |
| M-50 | Time to peak used for the chart |   | Not in the app. Left blank until it is read from the FDA label |   |   |
| M-51 | Wait after the pill before eating or drinking (minutes) | 30 | From code, not yet checked against the FDA label |   |   |

Chart of the estimated medication level: not drawn in the first public version (the app has no half-life and time to peak for it); not drawn in the full test version.

The dose example, the typing check, the wait after a pill: not used in the first public version (no label source yet); used in the full test version.

#### Saxenda (liraglutide)

| Code | What | In the app | Where it comes from | Your correction | Label section |
|----|--------------------|----------------|--------------------|----------------|------------|
| M-52 | Brand name | Saxenda | From code, not yet checked against the FDA label |   |   |
| M-53 | Generic name | liraglutide | From code, not yet checked against the FDA label |   |   |
| M-54 | How it is taken | Shot, under the skin | From code, not yet checked against the FDA label |   |   |
| M-55 | How often | Once a day | From code, not yet checked against the FDA label |   |   |
| M-56 | Dose steps (mg) | 0.6, 1.2, 1.8, 2.4, 3 | From code, not yet checked against the FDA label |   |   |
| M-57 | Highest dose for the typing check (mg) | 3 | From code, not yet checked against the FDA label |   |   |
| M-58 | Half-life used for the chart |   | Not in the app. Left blank until it is read from the FDA label |   |   |
| M-59 | Time to peak used for the chart |   | Not in the app. Left blank until it is read from the FDA label |   |   |

Chart of the estimated medication level: not drawn in the first public version (the app has no half-life and time to peak for it); not drawn in the full test version.

The dose example, the typing check: not used in the first public version (no label source yet); used in the full test version.

**Other / custom.** The person types the name of the medication. The app has no numbers for it, so there is no typing check and no chart.

## 5. The estimated medication level: method and wording

The chart shows a rough picture of how much medication is in the body over time, worked out from the doses the person logged. It is a population-average estimate. It is not a measurement, it has no unit, and the app says it cannot be used to adjust a dose.

In the first public version the chart is drawn only for a medication whose numbers in section 4 name the FDA label page they were read from. Today that is: no medication. Medications with numbers in the code: Wegovy, Ozempic, Zepbound, Mounjaro. Medications without numbers, which never get a chart: Wegovy pill, Foundayo, Rybelsus, Saxenda.

### 5.1 The model, as the code has it

One compartment, with first-order absorption and first-order elimination (the Bateman function). For one dose, t hours after it was taken:

```
B(t) = ka / (ka - ke) x ( e^(-ke x t) - e^(-ka x t) )        B(t) = 0 before the dose
```

- **ke** = ln 2 / half-life.
- **ka** is not read from a label. It is solved so that B(t) is highest exactly at the time to peak: ln(ka / ke) / (ka - ke) = time to peak.
- **All logged doses are added up:** Level(t) = sum of (dose in mg x B(t - time of that dose)).
- **The number on screen** is 100 x Level(t) / Peak, rounded to a whole number. Peak is the highest Level in one dosing interval after 20 doses of the *most recently logged dose*, taken exactly on the schedule the person set. So 100 means "the highest point after long-term use of the dose you logged last".
- **The chart** covers the last 14 days (solid line) and the next 7 days (dashed line), one point every 3 hours. The dashed part assumes the person keeps taking the same dose on schedule. When the status is not "Increasing dose" or "Maintenance dose", the dashed part has no future doses and only falls.
- No factor turns a dose into a concentration (no absorbed fraction, volume or clearance). The result is a relative number only.

### 5.2 What the model does with the numbers in section 4

These values were worked out by running the code. They are not from a label. They are here so you can judge whether the picture is believable.

|   | Wegovy, Ozempic | Zepbound, Mounjaro |
|--------------------------------|----------------|----------------|
| Half-life in the app | 168 hours (7 days) | 120 hours (5 days) |
| Time to peak in the app | 48 hours (2 days) | 24 hours (1 day) |
| Schedule used here | One dose a week | One dose a week |
| ke (per hour) | 0.00413 | 0.00578 |
| ka (per hour), solved from the time to peak | 0.05984 | 0.13801 |
| Absorption half-life that follows from ka | 11.6 hours | 5 hours |
| Check: one dose alone peaks after | 48 hours | 24 hours |
| After long-term use, the peak comes this long after a dose | 35.5 hours | 20.5 hours |
| Number shown right before the next dose, after long-term use (the peak is 100) | 62 | 44 |
| Highest number after the very first dose | 47 | 61 |
| Doses at the same amount until the peak reaches 90 or more | 4 | 3 |
| After the last dose: time until the number is under 50 | 9.2 days | 6.2 days |
| After the last dose: time until the number is under 25 | 16.2 days | 11.2 days |
| After the last dose: time until the number is under 5 | 32.5 days | 22.8 days |

**Example: what happens when the dose goes up.** A made-up log with the numbers of Wegovy and Ozempic: four doses of the same amount A on schedule, then four doses of twice that amount. This shows how the number behaves. It is not a dosing suggestion.

| Dose logged | Amount | Number shown one hour before this dose | Highest number in the interval after this dose |
|------------|--------|--------------------|--------------------|
| Dose 1 | A | no chart yet | 47 |
| Dose 2 | A | 31 | 73 |
| Dose 3 | A | 47 | 87 |
| Dose 4 | A | 55 | 93 |
| Dose 5 | 2 x A | 59 | 72 |
| Dose 6 | 2 x A | 46 | 86 |
| Dose 7 | 2 x A | 54 | 93 |
| Dose 8 | 2 x A | 58 | 96 |

When a higher dose is logged, 100 is redefined as the long-term peak of the new dose. The number shown can therefore drop right after an increase, although there is more medication in the body than the week before.

### 5.3 Assumptions and limits

| Code | Assumption or limit |
|----|--------------------------------------------------------|
| P-01 | Everyone is treated as the same average person. Body weight, kidney function, age, injection site and other medications change nothing. |
| P-02 | One compartment only. Absorption and elimination are both first-order. |
| P-03 | The time to peak is one number. The absorption rate is solved from it and is not checked against anything else. |
| P-04 | Doses add up in a straight line: twice the dose gives twice the level. |
| P-05 | There is no absorbed fraction, volume or clearance in the model, so there is no concentration. Only a relative number is shown. |
| P-06 | The scale changes with the dose: 100 is always the long-term peak of the dose logged last (see the example in 5.2). Numbers from before and after a dose change cannot be compared. |
| P-07 | The long-term peak is worked out for 20 doses taken exactly on the schedule the person set, sampled every half hour. |
| P-08 | Only doses logged in mg are used. Doses logged in units, mL or clicks are left out and never converted. |
| P-09 | When a person says at setup that they have been on their current dose for several weeks, the chart assumes earlier doses of the same amount on schedule (one for each of those weeks, 8 at most). They are used only for the chart and are not saved as records. |
| P-10 | A dose that was taken but not logged is missing from the chart. A dose logged at the wrong time is used as logged. |
| P-11 | Medications without a half-life and time to peak in the app get no chart: Wegovy pill, Foundayo, Rybelsus, Saxenda. |
| P-12 | Wegovy and Ozempic are separate entries in the app but use the same half-life and time to peak. |
| P-13 | The chart is not used by any other rule. The danger-symptom rules, the dose-increase period and the reminders do not read it. |

### 5.4 Exact wording on screen

Next to the title the app shows one whole number with no unit, for example 78. It is the latest point of the solid line.

| Code | Where | Exact wording |
|----|--------------------|----------------------------------------|
| S-01 | Title of the chart | Estimated medication level |
| S-02 | Under the small chart on the main screen | An estimate based on published population averages. It is not a measurement and cannot be used to adjust your dose. |
| S-03 | Under the large chart | The last 14 days and the next 7 days. The solid line is what has happened. The dashed line assumes you keep taking your medication as planned. 100 = the highest point after long-term use of this dose. |
| S-04 | Link under the large chart ("How this is calculated") opens this text | This uses a standard model of how the body takes in and clears a medication (first-order absorption and elimination), with published population averages: semaglutide half-life about 168 hours, peak at about 48 hours; tirzepatide half-life about 120 hours, peak at about 24 hours (still to be checked against the labels). Only doses you logged in mg are used. People absorb and clear medication at very different speeds. This line only helps you picture roughly where the medication level is. It is not a lab measurement and cannot be used to adjust your dose. |
| S-05 | In place of the chart in the first public version, when the numbers of the medication have no label source | An estimate for this medication is not available yet. |
| S-06 | On the main screen when the medication has no chart (full test version) | No chart for this medication yet (its numbers are not verified, or it is taken every day). |
| S-07 | In place of the large chart when there is nothing to draw | After you log semaglutide or tirzepatide shots in mg, an estimated medication level chart will show here. |
| S-08 | On the sheet where a dose is logged | Only the number you enter is saved. Units are not converted. The estimated medication level chart uses only doses logged in mg. |
| S-09 | Line at the bottom of the main screens in the first public version | This app is a logging tool. It is not a medical device and does not give medical advice. Talk to your doctor before making decisions about your medication. Not affiliated with any drug maker. |
| S-10 | Line at the bottom of the main screens in the full test version | For information only. This is not medical advice. Talk to your doctor before you change your medication or your workouts. |

## 6. Other numbers that need a clinical eye

Everything else in the app that encodes a clinical judgement. The cut-offs were chosen by the people who built the app. None of them has been reviewed.

### 6.1 Protein target

Status: **Hidden until reviewed**.

The app works out a daily protein target from height and weight. It shows a progress bar toward the minimum, and the daily advice (3.2) uses the minimum.

| Code | What | What the code does | What the person sees |
|----|------------|----------------------------|------------------------|
| N-01 | Which weight the formula uses | BMI under 28: the current weight. BMI 28 or more: an adjusted weight = ideal weight + 0.4 x (current weight - ideal weight), where ideal weight = 22 x (height in meters) squared. | Based on a reference weight of [weight]: minimum [minimum] g, ideal [low]–[high] g. This formula is still waiting for review by a dietitian. |
| N-02 | Minimum for the day | 1.0 g per kg of that weight, and never under 60 g. | [grams] g to go to reach your minimum. / You reached today's minimum. |
| N-03 | Ideal range | 1.2 to 1.5 g per kg of that weight. | Ideal: [low]–[high] g. |
| N-04 | Upper line | 2.0 g per kg of that weight. | Not used by any screen yet |
| N-05 | Kidney or liver disease checked at setup | No automatic target. The person can type their own. | [grams] g today. You checked kidney or liver disease, so please check your protein target with your doctor. You can enter it by hand under Me. |
| N-06 | Evening reminder | Meant to fire when the person is 25 g or more under the minimum and has logged no food for 3 hours. | Not used by any screen yet |

The code comment names two sources for these numbers. We have not checked them: Almandoz and others 2024 (Obesity), more than 60–75 g a day and 0.8–1.5 g per kg; AACE 2025, 1.2–1.5 g per kg.

What the formula gives for a few people (worked out by running the code):

| Height | Weight | BMI | Weight the formula uses | Minimum | Ideal range | Upper line |
|------------|--------|--------|--------------------|--------|------------|--------|
| 5 ft 4 in | 150 lb | 25.7 | 150 lb (68 kg) | 68 g | 82–102 g | 136 g |
| 5 ft 4 in | 200 lb | 34.3 | 157 lb (71.2 kg) | 71 g | 85–107 g | 142 g |
| 5 ft 4 in | 250 lb | 42.9 | 177 lb (80.3 kg) | 80 g | 96–120 g | 161 g |
| 5 ft 4 in | 300 lb | 51.5 | 197 lb (89.3 kg) | 89 g | 107–134 g | 179 g |
| 5 ft 10 in | 150 lb | 21.5 | 150 lb (68 kg) | 68 g | 82–102 g | 136 g |
| 5 ft 10 in | 200 lb | 28.7 | 172 lb (78 kg) | 78 g | 94–117 g | 156 g |
| 5 ft 10 in | 250 lb | 35.9 | 192 lb (87.1 kg) | 87 g | 105–131 g | 174 g |
| 5 ft 10 in | 300 lb | 43 | 212 lb (96.2 kg) | 96 g | 115–144 g | 192 g |

### 6.2 Protein values of the quick-log foods

Status: **Hidden until reviewed**.

Tapping a food logs one portion with this much protein. The range is what the app shows next to the number. The list was written for Chinese meals and the values are rough.

| Code | Food | One portion | Protein (g) | Range (g) | Your correction |
|----|----------------------------|--------|--------|--------|----------------|
| F-01 | Egg | 1 egg | 6 | ± 1 |   |
| F-02 | Milk | 1 cup | 8 | ± 1 |   |
| F-03 | Unsweetened soy milk | 1 cup | 7 | ± 2 |   |
| F-04 | Lean meat or chicken breast (palm-sized piece) | 1 serving | 27 | ± 5 |   |
| F-05 | Fish or shrimp (about 3.5 oz) | 1 serving | 19 | ± 3 |   |
| F-06 | Firm tofu (half a block) | 1 serving | 20 | ± 4 |   |
| F-07 | Greek yogurt | 1 container | 13 | ± 3 |   |
| F-08 | Protein powder | 1 scoop | 22 | ± 3 |   |
| F-09 | Beef noodle soup | 1 bowl | 22 | ± 6 |   |
| F-10 | Pork and cabbage dumplings (10) | 1 serving | 17 | ± 4 |   |
| F-11 | Plain rice porridge (congee) | 1 bowl | 2.5 | ± 1 |   |
| F-12 | Steamed bun (mantou) | 1 bun | 7 | ± 1 |   |

### 6.3 Weight trend

| Code | What | What the code does | What the person sees |
|----|------------|----------------------------|------------------------|
| N-07 | 7-day average | The average of all weigh-ins in the 7 days that end on a day. It needs at least 3 weigh-ins in those 7 days. All later lines use this average, not single weigh-ins. | Weigh in 3 times within a week to see your 7-day average trend. |
| N-08 | Lowest point | The lowest 7-day average so far. |   |
| N-09 | Regain under 3% above the lowest point (**Hidden until reviewed**) | Shown after the person sets the status to "Stopped". | Up [percent]% from your lowest point. This is normal variation. |
| N-10 | Regain of 3% to 5% (**Hidden until reviewed**) | Same. | Up [percent]% from your lowest point. Look back at your eating and activity over the last two weeks. |
| N-11 | Regain above 5% (**Hidden until reviewed**) | Same. | Up [percent]% from your lowest point. It is a good idea to talk with your doctor. |
| N-12 | Fast drop (**Hidden until reviewed**) | The 7-day average fell by more than 1.5% in each of the last two weeks. The app compares today with the averages about 7 and 14 days ago (2 days either way). The warning is printed on the daily advice card (section 3.2). | You lost more than 1.5% of your weight each week for the last two weeks. That is on the fast side. Make sure you get enough protein. You can talk it over with your doctor. |
| N-13 | Weigh-in tip | Shown on the sheet where a weight is logged. | It is best to weigh in the morning after you get up and use the bathroom, before you eat, on the same scale. Watch the 7-day average, not a single reading. |
| N-14 | How far one weigh-in can swing (shown in the first public version) | The note under the weight chart names a swing of 1–2 lb for a person who uses pounds and 0.5–1 kg for a person who uses kilograms. The two numbers are written into the screen; nothing is worked out from them. | Unit: lb. A single weigh-in can move up or down by 1–2 lb because of water and food. Watch the average. |
| N-15 | Note under the status "Stopped" (**Hidden until reviewed**) | Shown in settings after the person sets the status to "Stopped". | After you stop, the Today tab switches to its after-stopping view: keep up your protein and workouts, and watch for weight regain. If you start your medication again, change this status back to "Increasing dose". Your history is kept. |

### 6.4 The person's own high-symptom days

| Code | What | What the code does | What the person sees |
|----|------------|----------------------------|------------------------|
| N-16 | How much data is needed | 3 full cycles. A cycle is the 7 days from one dose day to the next. | After 3 full cycles are logged, this will find your own high-symptom days ([N] so far). |
| N-17 | What counts as a high-symptom day | For each day after the dose (day 0 to day 6) the app takes the worst symptom grade logged that day (0 to 3) and averages it over the cycles. A day is "high" when its average is at least 1.5 times the average of all days, and a symptom was logged on that day in at least 2 cycles. | Orange marks the days after your shot when you logged the most symptoms. / With daily advice turned on: Orange marks your high-symptom days. The Today tab uses them to plan lighter days. |
| N-18 | What it is used for | The daily advice for such a day (section 3.2) and a small chart of symptoms by day after the dose. |   |

### 6.5 Dose timing

The app never says what to do about a late or missed dose. It only asks whether a dose was forgotten and points to the instructions that came with the medication or to the doctor (section 3.2).

| Code | What | What the code does | What the person sees |
|----|------------|----------------------------|------------------------|
| N-19 | When a dose counts as "possibly forgotten" | More than 12 hours after its planned time with nothing logged. Up to 12 hours it counts as due. |   |
| N-20 | Next dose after a logged dose | The next planned day and time that is at least 72 hours after the logged dose (weekly schedule) or at least 12 hours after it (daily schedule). After a late weekly dose the app therefore shows the next dose on the usual weekday, as long as that is 72 hours or more away. |   |
| N-21 | Dose-increase period | 14 days, counted from the first dose at a higher amount than the dose before. The first dose ever logged also starts one. | Dose increase period |

### 6.6 Injection sites

| Code | What | What the code does | What the person sees |
|----|------------|----------------------------|------------------------|
| N-22 | Sites a person can choose | Left stomach area, Right stomach area, Left thigh, Right thigh, Left upper arm, Right upper arm |   |
| N-23 | Suggested next site | The site after the one used last, in this fixed order, then back to the start: Left stomach area → Right stomach area → Left thigh → Right thigh → Left upper arm → Right upper arm. | (suggested: [site]) |

### 6.7 Safety questions at setup

| Code | Box the person can check | Asked in the first public version | What checking it changes |
|----|--------------------|--------|------------------------------------|
| N-24 | Kidney or liver disease | No | No automatic protein target (section 6.1). The setup screen says: "Please check your protein target with your doctor. I will not set one automatically." |
| N-25 | Pregnant, trying to get pregnant, or breastfeeding | Yes | The setup screen says: "Please contact the doctor who prescribes your medication. I will turn off the goal weight." |
| N-26 | Taking insulin or a sulfonylurea diabetes medication (such as glimepiride) | Yes | Changes the low-blood-sugar rule R-06 `hypoglycemia`: see its levels and cards in section 2.4, and the symptom buttons in 2.2. |
| N-27 | A history of an eating disorder | Yes | No rule in the core logic uses this answer yet. The setup screen does not save a goal weight. |
| N-28 | Under 18 | Yes | Setup ends and nothing is saved. The screen says: "You need to be 18 or older to use this app, so setup stops here. Nothing you entered was saved." When setup is being done again by a person who already has records, the screen offers a button to delete all data and says: “You need to be 18 or older to use this app, so setup stops here. The records you saved before are still on this phone. "Delete all data" removes them, along with any counts this phone has shared.” |

### 6.8 Numbers inside the texts of sections 2 and 3

Every sentence in the cards, coping cards and advice texts that carries a number, collected in one place so none is missed. The code in the first column points to the text it comes from.

| From | Sentence |
|--------|--------------------------------------------------------|
| R-06 | First eat 15 grams of sugar (for example, half a cup of juice or 3 to 4 sugar cubes). |
| R-06 | If you do not feel better after 15 minutes, or you feel worse, get medical help (911) and contact your doctor. |
| R-10 | If you are pregnant, trying to get pregnant, or breastfeeding, your doctor needs to review your use of this medication (the semaglutide label says to stop semaglutide at least 2 months before a planned pregnancy). |
| R-12 | The tirzepatide label advises: for 4 weeks after you start the medication and after each dose increase, use another form of birth control in addition to birth control pills. |
| C-1.3 | Wait at least 2 hours after a meal before you sleep |
| C-2.3 | Take a 10–15 minute walk after meals |
| C-2.6 | No bowel movement for more than 3 days, together with stomach pain, vomiting or a lot of bloating |
| C-3.3 | Eat by the clock: a little every 3–4 hours. |
| C-3.8 | Your weight is dropping too fast (more than 1.5% a week), or you are always dizzy and weak |
| A-04 | If your appetite is low for a day or two after the shot: get your [minimum] g of protein first, spread over 3–4 meals or snacks. |
| A-07 | Get your [minimum] g of protein first, spread over 3–4 meals or snacks. |
| A-07 | Switch your workout to the 15-minute light version. |
| A-11 | You have been under [minimum] g for 3 days in a row. |
| A-12 | Weigh yourself 2–3 times a week and watch the 7-day average. |
| A-14 | 15–25 minutes is enough, 2–3 times a week. |
| 3.3 | Rest 60–90 seconds between sets. |
| 3.3 | [N] workouts in the last 7 days (2–3 a week is suggested). |

### 6.9 Smaller items

| Code | What | What the code does | What the person sees |
|----|------------|----------------------------|------------------------|
| N-29 | Emergency number and crisis line for a US user | 911 and 988. The cards in section 2 use them. The code marks both as still to be verified. |   |
| N-30 | Weight typed in a note | Accepted only from 30 to 300 kg (66 to 661 lb). Anything else is not read as a weight. | Not reachable in the first public version (no note box) |
| N-31 | Time until the chart number falls under 5 | A helper works out how many days after the last dose the number in section 5 falls under 5. | Not used by any screen yet |

## 7. Open questions

### 7.1 Questions drawn from the code

The people who wrote the code left notes where something waits for review. Each note is one of the questions below.

| Code | Question | Note in the code |
|----|--------------------------------------------|----------------|
| Q-01 | Every brand name, dose step, highest dose, half-life and time to peak in section 4 is unchecked. Please check each row against the current FDA label and give the label section. The code comment points to label section 12.3 for the half-life and the time to peak. | `src/core/catalog.ts` line 3, 52 |
| Q-02 | Foundayo (orforglipron) has no dose steps, no highest dose and no numbers for the chart in the app, because nobody has read them from the label yet. Please give them with their label sections, or tell us where the label gives none. | `src/core/catalog.ts` line 154 |
| Q-03 | The trigger phrases, the level of each rule and the English card texts in section 2 have never been reviewed. Which danger signs are missing? Which rules sit at the wrong level? Which card text could harm or mislead a person? | `src/core/triage.ts` line 4, 75, 597 |
| Q-04 | The emergency number on the cards is marked as still to be verified. For a US user it is 911. On which cards is "call 911" the wrong instruction, and what should those cards say? | `src/core/triage.ts` line 467 |
| Q-05 | The crisis line on the self-harm card is marked as still to be verified. For a US user the card says "crisis line 988". Is that the right line, and the right way to name it? | `src/core/triage.ts` line 489, 500 |
| Q-06 | The coping cards in section 3.1 must be reviewed before they are shown. Is any line wrong or unsafe? Is anything missing under "See a doctor if"? Are the two sources named under each card the right ones to name? | `src/web/content/coping.ts` line 3, 5 |
| Q-07 | The daily advice texts in section 3.2 wait for review. Is any text wrong or unsafe for a person on these medications? Is any text shown in the wrong situation? | `src/web/content/advice.ts` line 2, 4, 55 |
| Q-08 | The workouts in section 3.3 need review of the exercises and the amounts by a qualified professional. Are you the right person for that part? If not, please say so and leave it out of your quote. | `src/web/content/workouts.ts` line 3, 5 |
| Q-09 | The general notice at the bottom of the main screens (last row of section 5.4) waits for review. Does it say what it should? | `src/web/content/labels.ts` line 23 |
| Q-10 | The protein formula and its cut-offs in section 6.1 wait for a dietitian or doctor to confirm them. Are the 60 g floor, the 1.0, 1.2 to 1.5 and 2.0 g per kg lines, the BMI line of 28 and the adjusted weight right for adults on these medications? Who else should get no automatic target? | `src/core/protein.ts` line 6 |
| Q-11 | The protein values in section 6.2 are rough and were meant to be checked against the China Food Composition Table. For a US user, which rows are wrong, and which reference should we use instead? | `src/core/foods.ts` line 2 |
| Q-12 | The weight cut-offs in section 6.3 are product choices, not taken from a guideline: regain of 3% and 5% above the lowest point, and a drop of more than 1.5% a week for two weeks. Are they reasonable? Is the text at each line right? | `src/core/weight.ts` line 3 |

### 7.2 Questions that came up while this packet was put together

| Code | Question |
|----|------------------------------------------------------------|
| Q-13 | In the first public version a person can report a danger sign in two ways only: with a symptom button (section 2.2), or by typing it where the app checks typed text (section 2.3). No button leads to R-01 `crisis`, R-02 `pancreatitis`, R-03 `chest_or_faint`, R-04 `anaphylaxis`, R-05 `vision`, R-08 `gallbladder`, R-09 `thyroid`, R-10 `pregnancy`, R-11 `procedure`, R-12 `contraception`, R-13 `eating_too_little`. Which danger signs need their own button before launch? |
| Q-14 | In the first public version R-10 `pregnancy`, R-11 `procedure`, R-12 `contraception`, R-13 `eating_too_little` show no alert (section 2.1): their own cards are hidden until reviewed, and the fixed card with its call button does not fit a reminder. A person who types text that matches only these rules sees nothing. Is that acceptable for the first public version? If one of them needs to show something at launch, which one, and what should it say? |
| Q-15 | An alert raised from the box for questions for the doctor leaves no reminder on the main screen once it is closed (section 2), while an alert from a symptom button stays at the top for the rest of the day. In the first public version that box is the only way to raise R-01 `crisis`, R-02 `pancreatitis`, R-03 `chest_or_faint`, R-04 `anaphylaxis`, R-05 `vision`, R-08 `gallbladder`, R-09 `thyroid`. Is it acceptable that these alerts are shown once and then gone? |
| Q-16 | Please compare the rules in section 2 with the "call your healthcare provider right away" items in the current Medication Guides of the medications in section 4. Which items on the guides have no rule here? |
| Q-17 | Several cards name a possible cause (pancreas, gallbladder, allergic reaction, blood sugar). Is it right to name a cause at all? Is it the right cause for every phrase that triggers the rule? One example: "short of breath" alone shows the card "This may be a serious allergic reaction". |
| Q-18 | The pregnancy card R-10 `pregnancy` quotes the semaglutide label to every user, whatever medication they take. What should it say to a person on one of the other medications in section 4? |
| Q-19 | The birth control reminder R-12 `contraception` is shown only when the medication is tirzepatide (Zepbound, Mounjaro). Is that right? Does any other medication in section 4 need a reminder of this kind? |
| Q-20 | The number on the chart can drop right after a dose increase, because 100 is tied to the dose logged last (example in section 5.2). Could that mislead a person? Would a fixed scale be safer? |
| Q-21 | After a late weekly dose the app shows the next dose on the usual weekday when that is at least 72 hours away (section 6.5). The app gives no advice about missed doses, but it does show this date. Is 72 hours a safe line for every weekly medication in section 4? |
| Q-22 | The app shows a wait before eating or drinking after a pill for Wegovy pill and Rybelsus, and none for Foundayo (section 4). Is the wording of that line right for each of them, including what it says about water? The countdown on the main screen says only to wait before eating, while the sheet says not to eat or drink. Should the two say the same? |
| Q-23 | The typing check calls its limit "the usual highest dose" (section 4). Is the highest dose on the label the right limit for this check, and is that the right name for it? |
| Q-24 | A person can check "A history of an eating disorder" at setup (section 6.7). Almost nothing changes when they do. What should the app do differently for them, for example with the goal weight, the weight chart or the fast-drop line? |

### 7.3 Anything else

Please add anything you saw that no question covers. A short note with the item code is enough.

