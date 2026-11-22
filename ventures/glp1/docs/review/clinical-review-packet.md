<!-- Built by app/scripts/build-review-packet.ts (pnpm review-packet). Do not edit by hand: change the code or the script and build again. -->

# [APP NAME]: clinical review packet

From [COMPANY LEGAL NAME] · Contact: [CONTACT EMAIL] · Sent on [EFFECTIVE DATE]

Packet version `4872bcc2`. This file is built by a script from the code of the app, so the texts and numbers in it are the ones the app uses. Text in "quotation marks" is exact app text, or a phrase a person might type. Words in [square brackets] are filled in by the app or by us.

About 37,600 words with 653 coded items: about 99 pages in a compact print layout, about 160 pages as a plain Word file.

| Section | What it holds | Size | In the first public version |
|----|--------------------|----------------------------|------------------------|
| 1 | What this is and what we ask of you | 1 page |   |
| 2 | Danger-symptom rules | 14 rules, 16 card texts, 152 trigger patterns, 621 example phrases; 7 Medication Guide lists with 78 items, and 31 signs set against the rules | Alerts show one fixed card; 4 rules of a mild level show nothing (2.1). They come from the symptom buttons (2.2) and from typed text (2.3). The Medication Guide lists (2.6) are shown |
| 3 | Coping cards, daily advice, workouts | 4 coping cards (34 lines), 17 daily advice texts, 3 workouts (15 exercises) | Hidden until reviewed |
| 4 | US medication list | 9 brands, 76 rows, 63 numbers to check (all with their label words, from 7 labels) | The names are shown. The dose example, the typing check and the wait after a pill are used: every number was read from the label |
| 5 | Estimated medication level: method and wording | 15 assumptions, 12 screen texts | Chart shown for Wegovy, Ozempic, Zepbound, Mounjaro |
| 6 | Other numbers that need a clinical eye | 31 cut-offs and rules, 12 food values, 17 sentences with numbers | Protein target and food values are hidden until reviewed. Dose timing, injection sites and the setup questions are live |
| 7 | Open questions | 39 questions |   |

## 1. What this is and what we ask of you

### What the app is

[APP NAME] is a phone app for adults in the United States who take a GLP-1 medication that their own doctor prescribed, as a weekly shot or a daily pill. People use it to log each dose, their weight and how they feel, and to get a reminder. It draws a chart called "Estimated medication level" from the doses they logged. It is made by [COMPANY LEGAL NAME], a small independent company with no tie to any drug maker. It is not a medical device.

### What the app does not do

- **No dosing advice.** It never says how much to take, when to change a dose, or what to do about a missed dose. It answers no questions about doses.
- **No diagnosis.** When a person logs a danger sign, it shows a short card that tells them to contact their doctor or call 911.
- **No warning text of its own.** The list of warning signs it shows is the text of the FDA Medication Guide of the person's medication, word for word (section 2.6).
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

When the alert comes from a question typed into the list of questions for the doctor, nothing was logged, so the card begins "What you wrote" in place of "What you logged". Nothing else changes.

Under the card there is one more button, "See the warning signs in the Medication Guide". It opens the list of section 2.6 for the person's own medication: always the whole list, never one item of it, because the app does not say which item a person may have. The crisis card has no such button.

The fixed card is shown for a rule at one of the levels `emergency`, `act_now`, `urgent`.

The exception: R-01 `crisis` keeps its own card (shown in section 2.4) in the first public version too.

**A rule at a milder level shows no alert at all in the first public version:** R-10 `pregnancy` (`contact`), R-11 `procedure` (`remind`), R-12 `contraception` (`remind`), R-13 `eating_too_little` (`care`). Their own cards (section 2.4) are reminders with no call button. The fixed card says "right away" and offers the call button, so it is not used for them. Text that matches only these rules is saved as typed and nothing else happens. A question in section 7.2 asks whether that is right.

### 2.2 Alerts from the symptom buttons

A person can tap one of these symptoms: Nausea, Vomiting, Heartburn or burping, Constipation, Diarrhea, Stomach pain, No appetite, Tiredness, Dizziness, Hair loss, Redness or swelling where you inject, Low mood, Period changes. Then they choose how bad it is: Mild, Moderate, Severe. The screen explains: “"Severe" means it clearly gets in the way of eating, drinking or daily activities.”

| Code | Symptom tapped | How bad | Who | Rule and level | Card in the first public version |
|----|------------|--------|--------------------|----------------|----------------|
| B-01 | Nausea | Severe | Every user | R-07 `dehydration` (`urgent`) | Fixed card (2.1) |
| B-02 | Vomiting | Severe | Every user | R-07 `dehydration` (`urgent`) | Fixed card (2.1) |
| B-03 | Diarrhea | Severe | Every user | R-07 `dehydration` (`urgent`) | Fixed card (2.1) |
| B-04 | Stomach pain | Severe | Every user | R-14 `abdominal_pain_severe` (`urgent`) | Fixed card (2.1) |
| B-05 | Dizziness | Severe | Only users who did not check the insulin or sulfonylurea box at setup, see 6.7 | R-07 `dehydration` (`urgent`) | Fixed card (2.1) |
| B-06 | Dizziness | Severe | Only users who checked the insulin or sulfonylurea box at setup, see 6.7 | R-06 `hypoglycemia` (`act_now`) | Fixed card (2.1) |

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
| L-01 | **severe word** | severe, severely, unbearable, excruciating, terrible, horrible, awful, intense, extreme, agonizing, horrendous, brutal, really bad, very bad, so bad, super bad, real bad, extremely bad, worst |
| L-02 | **stomach word** | stomach, stomache, abdomen, abdominal, belly, tummy, gut |
| L-03 | **pain word** | pain, pains, ache, aches, aching, hurt, hurts, hurting, cramp, cramps, cramping |
| L-04 | **pain or soreness word** | pain, pains, ache, aches, aching, hurt, hurts, hurting, sore, tender, tenderness, cramp, cramps, cramping |
| L-05 | **vomiting word** | vomit, vomits, vomited, vomiting, throw up, throws up, throwing up, threw up, thrown up, puke, pukes, puked, puking, barf, barfs, barfed, barfing, hurls, hurled, hurling, retch, retches, retched, retching, dry heave, dry heaves, dry heaved, dry heaving |
| L-06 | **diarrhea word** | "diarrhea", also misspelled ("diarrea", "diarhea", "diarrhoea"); "the runs"; "the squirts"; "loose", "watery" or "liquid" plus "stool", "stools", "poop", "poops", "bowel movement" or "bowel movements". |
| L-07 | **nausea word** | "nausea", "nauseous", "nauseated" (also misspelled "nausious", "nauseus", "nasuea"); "queasy", "queasiness"; "sick to my stomach". |
| L-08 | **does-not-go-away phrase** | "won't", "will not", "doesn't", "does not", "isn't", "is not", "hasn't", "has not", "not" or "never", followed by "go away" (also "going away", "gone away"), "stop", "let up", "ease", "ease up", "quit", "end", "get better" or "improve"; "constant", "constantly", "nonstop", "persistent", "never-ending"; "all the time"; "day and night"; "every day"; "for days" or "for weeks", with or without a count ("for 3 days", "for a few weeks"); "for a week", "for over a week", "for the past week"; "all week"; a count of days plus "straight", "in a row", "now" or "running"; "been 3 days" (any count); "since" plus a day of the week; "since last week". One day is not on this list: "all day" and "since yesterday" do not count here. |
| L-09 | **slight word** | "a little", "a little bit", "a tiny bit", "a bit", "a tad", "a touch", "slightly", "mildly", "mild", "kind of", "kinda", "sort of", "somewhat", "less", "not too", "not very", "not that", "not so", "not really", "not as" ("just" or "only" may stand before it). A pattern that names this list stays quiet when one of these words stands right before the symptom. |
| L-10 | **reaches-the-back phrase** | "to", "into", "through", "toward", "towards", "in", "around" or "round", followed by "back", "my back" or "the back" ("upper", "lower", "middle" or "mid" may stand before "back"), but not "back yard", "back seat", "back room", "back door", "back porch" or "back office". Or "and", "plus", "with" or "also", followed by "back" or "my back", but not "back to", "back from", "back at", "back on", "back home", "back again" or "back in". Or "back hurts", "back hurting", "back aches", "back aching" or "back pain" ("also", "too" or "is" may stand in between). |
| L-11 | **long-or-often phrase** | "all day", "all night", "all morning", "all afternoon", "all evening", "all week"; "nonstop"; "constantly"; "won't stop", "can't stop"; "over and over"; "for days", with or without a count ("for 3 days", "for two days", "for a few days", "for several days", "for many days"); "24 hours", "48 hours", "72 hours"; "since yesterday", "since last night"; or a count of 5 or more "times" (5 to 9, any number with two or more digits, "five" to "ten", "several", "many", "multiple", "countless", "so many"). |
| L-12 | **dizzy phrase** | "dizzy"; "lightheaded" (also "light-headed", "light headed"); "black out", "blacks out", "blacked out"; "vision" or "everything" plus "goes", "went", "going", "gets" or "got" plus "dark", "black" or "dim"; "see" or "seeing" plus "black", "stars" or "spots"; "almost" or "nearly" plus "pass out", "passed out", "faint" or "fainted". |
| L-13 | **upper-right phrase** | "upper right", "right upper" or "top right" followed by "stomach", "abdomen", "abdominal", "belly", "tummy" or "quadrant" ("side of my", "part of my" or "area of my" may stand in between); "upper right side" or "right upper side", unless it is the side of an arm, leg, thigh, back, chest, neck, head, face, shoulder, hip or knee; "right rib", "right ribs", "right rib cage", "right side ribs"; "right side" plus "under", "below", "beneath", "by" or "near" plus "my ribs"; "under", "below" or "beneath" plus "my ribs on my right". |
| L-14 | **cannot-see word** | a word that starts with "blurr" ("blurry", "blurred"); "can't see"; "cannot see"; "blind". |
| L-15 | **vision word** | "vision"; "sight"; or a **cannot-see word**. |
| L-16 | **not-eating phrase** | "haven't", "have not", "hasn't", "didn't", "did not", "barely", "hardly", "can't", "cannot", "couldn't", "could not", "not" or "unable to", followed by "eat", "eaten", "ate" or "eating" ("really", "even", "been able to" or "been" may stand in between). Or "eaten", "ate" or "eating" followed by "nothing", "almost nothing" or "next to nothing". |
| L-17 | **days phrase** | "days"; "for a week", "for 2 weeks", "for two weeks", "for three weeks", "for a few weeks"; "all week". |

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

A rule is raised when the text describes the person's own state, now or recently. Besides a denial, a match does not count only in the cases below. When in doubt, the rule is raised. The self-harm rule makes none of these checks.

- **Someone else.** The words before the symptom, in the same part of the sentence, name another person as the one who has it: "my dad", "my sister's", "she", "a friend of mine", "people". Stays quiet: "my dad had chest pain last year", "my sister is pregnant", "she passed out at the gym", "some people get hives from it", "pancreatitis runs in my family". It counts again when "I", "me", "my" or "we" comes after that person, or stands with them ("me and my husband"), or when a word for saying, noticing or finding follows: "my dad had chest pain and now I have chest pain", "me and my husband have been throwing up all day", "my wife noticed my eyes look yellow", "they said my blood sugar was low". "Anyone else" is read as the writer too: "has anyone else had chest pain on this".
- **Long ago.** The sentence names a time long past: "last year", "years ago", "in 2019", "in college", "as a kid", "when I was younger", "growing up", "used to", "a history of". Stays quiet: "I fainted once as a kid", "i had pancreatitis in 2019", "i used to get palpitations". Days, weeks and months ago still count: "I passed out last week", "two weeks ago I started having trouble swallowing". The time must stand in the same part of the sentence as the symptom, or alone right before it; a symptom in another part of the sentence counts: "I had my gallbladder out last year and I have severe stomach pain". It also counts again when the sentence has a word for now ("now", "today", "again", "still", "since", "is back"): "had chest pain last year and again today".
- **A general question.** The words lead straight up to the symptom as a question about it in general: "what are the signs of ...", "what is ...", "what does ... feel like", "can it cause ...", "can you get ...", "how do I know ...", "how common is ...", "what should I do if I get ...", "I read that ...", "worried about getting ...", "how to prevent ...", "is ... a side effect". Stays quiet: "What are the signs of low blood sugar?", "can ozempic cause chest pain", "is fainting a side effect", "what should i do if i get low blood sugar". It counts again when the sentence says the person has it ("my", "I have", "I'm", "this pain", "now", "again", "still"), or the next sentence does: "what are the signs of low blood sugar? I feel shaky and sweaty", "can ozempic cause the chest pain I have now", "does this cause chest pain? i have it now". Other questions are not on the list and count: "isn't chest pain serious?", "Is severe stomach pain going to my back normal?", "what should I do about this chest pain". A statement is not a question and counts: "the shot did cause severe stomach pain", "showing symptoms of low blood sugar". This check is not made for R-10 `pregnancy`, R-11 `procedure`, R-12 `contraception`, R-13 `eating_too_little`: a question is what those reminders are for.
- **The size of a pill.** Trouble swallowing does not count when it is said of a pill, tablet, capsule or vitamin. Stays quiet: "hard to swallow this big pill", "these pills are hard to swallow". Still counts: "trouble swallowing food", "since starting my medication I have trouble swallowing".
- **Slight.** Three signs stay quiet when the person calls them slight (the **slight word** list): dizziness, a racing heart and hoarseness. Stays quiet: "a little dizzy", "heart racing a bit", "a little hoarse". Counts: "dizzy", "my heart is racing", "my voice is hoarse".

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
| R-02.6 | A **pain word**, then "in", "around", "across" or "from" and a **stomach word**, then a **reaches-the-back phrase**. | "pain in my stomach that goes to my back"; "pain from my abdomen to my back" |
| R-02.7 | A **stomach word** and a **pain word**, then "but", then a **reaches-the-back phrase**. So "not severe, but it goes to my back" still triggers. | "stomach pain, not severe, but it goes to my back" |
| R-02.8 | A **stomach word**, then "in so much pain" or "in too much pain". | "my stomach is in so much pain" |
| R-02.9 | "So much" or "too much" plus "pain" or "cramping", then "in", "around" or "across", then a **stomach word**. | "so much pain in my belly" |
| R-02.10 | "Stabbing", "sharp", "shooting" or "tearing", directly followed by a **stomach word** joined to a **pain word**. | "sharp stomach pain" |
| R-02.11 | "Stabbing", "sharp", "shooting" or "tearing", then "pain", "cramp" or "cramping", then "in", "around" or "across" and a **stomach word** ("upper" or "lower" may stand before it). | "stabbing pain in my stomach"; "sharp cramps in my lower belly" |
| R-02.12 | The word "pancreatitis". | "I think I have pancreatitis" |

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
| R-03.3 | "Chest" followed by "hurts", "is hurting", "pressure", "tightness", "is tight", "feels tight" or "feels heavy". Or "tight chest". | "my chest hurts"; "my chest feels tight"; "tight chest" |
| R-03.4 | "Pass out" or "black out" in any form ("passed out", "passing out", "blacked out"). It does not count when "flyers", "candy", "papers", "samples", "invitations", "cards", "treats", "pamphlets" or "snacks" follows. | "I passed out after the shot"; "I keep passing out" |
| R-03.5 | "Fainted", "fainting" or "faints". Or "faint" after "did", "might", "may", "could", "gonna", "to", "almost", "nearly", "will" or "would" ("going to faint"). Or "faint" after "feel", "feeling", "felt", "I'm", "I am", "I was", "I got", "I get" or "getting" ("so", "very" or "really" may stand in between). | "I fainted in the shower"; "I feel faint"; "I think I am going to faint" |
| R-03.6 | "Lost consciousness". | "I lost consciousness for a minute" |
| R-03.7 | "Unconscious". | "I was unconscious" |
| R-03.8 | "Heart", "pulse", "heartbeat" or "heart rate", then (within about 20 characters) a word for fast or hard: "racing" (also "race", "races", "raced"), "pounding", "fluttering", "thumping", "hammering", "skipping beats", "beating fast", "beating hard", "beating quickly", "beating out of my chest", "fast", "rapid", "elevated", "so high" (also "really", "very", "too", "super" or "way too" high), "going crazy", "going nuts", "going so fast", "going a mile a minute" or "through the roof". It does not count when a **slight word** stands right before that word, or when "a bit", "a little", "a tad" or "slightly" follows it. | "my heart is racing"; "heart pounding in my chest"; "my pulse is really fast" |
| R-03.9 | "Racing", "pounding", "rapid", "fast", "fluttering" or "thumping", followed by "heart", "heartbeat", "heart rate" or "pulse" (not when "a bit", "a little", "a tad" or "slightly" follows). Or "high" or "elevated", followed by "heart rate" or "pulse". | "very rapid heartbeat"; "racing pulse"; "high heart rate" |
| R-03.10 | "Palpitation" or "palpitations" (also after "heart"), "tachycardia", "heart flutter" or "heart flutters". | "heart palpitations again tonight" |

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
| R-04.9 | "Problem", "problems", "issue", "issues", "hard time", "tough time", "struggle", "struggles" or "struggling", followed by "breathing" ("with" and "my" may stand in between). Or "breathing" followed by "problem", "problems", "issue", "issues", "trouble", "difficulty" or "difficulties". Or "breathing" plus "is", "feels", "got", "has been" or "was", plus "hard", "harder", "difficult", "labored", "tight", "shallow", "heavy", "rough", "bad" or "worse". | "problems breathing"; "my breathing is getting worse" |
| R-04.10 | "Wheeze", "wheezes", "wheezing" or "wheezy"; "gasping"; "out of breath"; "breathless" or "breathlessness"; "can't get a breath" or "can't take a breath" (also "a full breath", "a deep breath", "a good breath"); "can't get air", "can't get any air" or "can't get enough air". | "wheezing"; "I can't get enough air" |
| R-04.11 | "Throat", then (within about 15 characters) "tight", "tightening", "tightness" or a word that starts with "constrict". Or "tight", "tightness" or "tightening", then "throat". | "my throat feels tight"; "tightness in my throat" |
| R-04.12 | "Throat", "lip", "lips", "tongue", "face", "eyelid", "eyelids" or "mouth", then "puffy", "puffed", "ballooned", "blown up", "blew up" or "swole". Or "puffy" or "swole", followed by one of those body parts. | "my face is all puffy"; "puffy lips" |
| R-04.13 | "Severe", "bad", "terrible", "horrible", "awful", "really bad", "nasty", "huge", "spreading", "worst", "intense", "unbearable" or "extreme", followed by "rash", "rashes", "hives", "itch", "itching", "itchiness" or "welts". | "severe rash"; "severe itching" |
| R-04.14 | "Rash", "rashes", "hives", "itch", "itching", "itchiness", "itchy" or "welts", then (within about 20 characters) "severe", "unbearable", "spreading", "getting worse", "so bad", "really bad", "very bad", "extremely bad", "out of control", "driving me crazy" (also "nuts" or "insane"), "won't stop" or "nonstop". | "my rash is spreading"; "the itching is driving me crazy" |
| R-04.15 | "Itch", "itching", "itchy", "itchiness" or "itches", then "all over", "everywhere", "whole body", "entire body" or "head to toe". Or those words first, then a word that starts with "itch". "All over" one body part does not count. | "itching all over"; "my whole body is itchy" |
| R-04.16 | "Hives". Or "broke out in", "breaking out in", "broken out in" or "break out in", followed by "rash", "a rash", "a bad rash" or "welts". | "I have hives"; "I broke out in a rash" |
| R-04.17 | "Allergic reaction", "anaphylaxis" or "anaphylactic". | "I think I am having an allergic reaction" |

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
| R-05.6 | "Vision loss", "loss of vision", "loss of sight", "lost my vision", "lost some vision", "lost my sight", "losing my vision", "losing my sight", "went blind", "going blind" or "gone blind". It does not count when "of my", "of the", "of what", "of why", "of how", "of it", "of that" or "of this" follows ("lost sight of my goals"). | "losing my sight"; "I think I am going blind" |
| R-05.7 | "Part", "half", "piece", "some" or "a section" of "my vision", "my sight", "my visual field" or "my view", then "missing", "gone", "dark", "black", "blocked" or "cut off". | "part of my vision is missing" |
| R-05.8 | "Blind spot". Or "dark" or "black" plus "spot", "curtain", "shadow" or "area", then "vision", "eye" or "sight". | "a blind spot"; "a dark curtain over my vision" |
| R-05.9 | "Blurry", "blurred", "blurring", "blurriness", "fuzzy", "hazy", "cloudy", "double" or "foggy", followed by "vision", "eyesight" or "sight". Or "vision", "eyesight" or "sight", then (within about 20 characters) a word that starts with "blur", or "fuzzy", "hazy", "cloudy", "foggy", "double", "doubled", "worse", "worsening", "changed" or "changing". | "my vision is blurry"; "double vision"; "my eyesight is getting worse" |
| R-05.10 | "Vision", "eyesight" or "sight", plus "is", "was", "seems", "feels", "got", "gets", "looks", "has been", "went", "goes", "keeps getting" or "keeps going", plus "off", "weird", "strange", "funny", "messed up", "dim", "dimmer", "dark", "darker", "spotty", "bad" or "terrible". | "my vision seems off" |
| R-05.11 | "Eye" or "eyes", then a word that starts with "blur", or "fuzzy", "hazy" or "cloudy". Or "blurry", "blurred", "fuzzy", "hazy" or "cloudy", followed by "eye" or "eyes". Or "everything" plus "looks", "is", "seems", "went" or "got", plus a word that starts with "blur", or "fuzzy" or "hazy". | "my eyes are blurry"; "everything looks fuzzy" |
| R-05.12 | "Change", "changes", "changing", "difference" or "decline", followed by "in vision", "in my vision", "in eyesight" or "in sight". Or "vision", "eyesight" or "sight", followed by "change", "changes", "problem", "problems", "issue", "issues" or "trouble". | "changes in my vision"; "vision problems" |
| R-05.13 | "Seeing" plus "double", "spots", "floaters", "flashes", "flashing lights", "halos" or "two of everything" (not when "on my" or "on the" follows, as in spots on the skin); "floaters"; "flashes of light"; "trouble seeing", "difficulty seeing", "hard time seeing" or "problems seeing"; "hard to see"; "can't see" plus "well", "clearly", "right", "straight", "properly" or "out of". | "seeing double"; "I see floaters"; "can't see well out of my left eye" |

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
| R-06.4 | "Sugar" or "glucose", then "is", "was", "got", "went" or "feels", then "low". "Very", "too", "really", "so" or "super" may stand before "low". It does not count when "normal", "carb", "fat" or "cal" follows "low". | "my sugar is really low" |
| R-06.5 | "Sugar" or "glucose" (with or without "level" or "levels"), then "dropped", "dropping", "crashed", "crashing", "tanked", "plummeted" or "bottomed out". | "my glucose dropped"; "sugar crashed" |
| R-06.6 | "Low glucose" or "low sugars". Or "a", "my", "another", "having", "had" or "got", followed by "low sugar", unless a word for a food or a diet follows ("a low sugar yogurt", "a low sugar week"). | "having low sugars a lot"; "I had low sugar this morning" |
| R-06.7 | "Sugar", "sugars", "glucose", "BG" or "blood sugar", plus "is", "are", "was", "were", "got", "went", "feels", "running", "runs", "ran", "reading", "keeps" or "kept" (then perhaps "running", "reading", "going", "getting", "dropping" or "trending"), plus "low". "Very", "too", "really", "so", "super", "way too" or "pretty" may stand before "low". Or "hypo" after "a", "having", "had" or "another". | "my sugars are running low"; "having a hypo" |

It also triggers on the signs of low blood sugar that the Medication Guides list (section 2.6), when the text has **two or more** of them. One sign alone is not enough. The signs are in two tables. Two signs of the first table trigger. A sign of the second table counts only next to a sign of the first.

| Code | Sign |
|----|------------------------------------------------|
| R-06.S1 | Shakiness: "shaky", "shaking", "shakes", "shakiness", "tremble", "trembles", "trembling", "tremor", "tremors", "jittery", "jitters". Not "protein shakes", "milk shakes" or "meal replacement shakes". |
| R-06.S2 | Sweating: "cold sweat", "cold sweats", "clammy", "sweaty", "sweating", "drenched in sweat". |
| R-06.S3 | Fast heartbeat: a word that starts with "palpitat"; "heart" or "pulse" plus "racing", "pounding", "fluttering" or "beating fast"; "racing", "pounding", "fast" or "rapid" plus "heart", "heartbeat" or "pulse". |
| R-06.S4 | Confusion or drowsiness: a word that starts with "confus"; "disoriented"; "dazed"; "drowsy", "drowsiness"; "can't think straight". |
| R-06.S5 | Dizziness or light-headedness: "dizzy", "dizziness", "lightheaded" (also "light-headed", "light headed", "lightheadedness"), "woozy". |
| R-06.S6 | Blurred vision: "blurry" or "blurred" plus "vision", "eyesight" or "sight"; "vision", "eyesight" or "sight" plus "blurry" or "blurred" ("is", "was", "got", "went" or "gets" may stand in between); "seeing double". |
| R-06.S7 | Slurred speech: "slurred", "slurring", "slurry"; "can't talk" or "can't speak" plus "right", "properly", "straight" or "clearly". |

Signs that count only next to a sign of the table above, because many people on these medications have two of them on an ordinary day:

| Code | Sign |
|----|------------------------------------------------|
| R-06.C1 | Weakness: "weak", "weakness". |
| R-06.C2 | Headache: "headache", "headaches", "migraine", "migraines", "head hurts", "head is pounding", "head is killing me", "head aches". |
| R-06.C3 | Hunger: "hungry", "hunger", "starving", "ravenous", "famished". |
| R-06.C4 | Anxiety, irritability or mood changes: "anxious", "anxiety", "irritable", "irritability", "mood swing", "mood swings", "mood change", "mood changes", "moody". |

Examples that trigger (checked): "shaky and in a cold sweat", "heart racing and I feel confused", "shaky and hungry", "sweating and a headache". Examples that stay quiet (checked): "feeling shaky after coffee", "so hungry today", "hungry with a headache", "weak and hungry before lunch".

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
| R-07.1 | A word that says it keeps happening ("keep", "keeps", "kept", "can't stop", "can't I stop", "cannot stop", "won't stop", "constant", "constantly", "nonstop", "over and over", "again and again", "repeatedly"), then a **vomiting word** or a **diarrhea word**. | "I keep throwing up"; "constant diarrhea"; "why can't I stop throwing up" |
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
| R-07.16 | A **nausea word**, then (within about 30 characters) a **does-not-go-away phrase**. | "nausea that won't go away"; "nauseous for 4 days" |
| R-07.17 | "Constant", "constantly", "nonstop", "persistent" or "never-ending", then a **nausea word**. | "constantly nauseous" |
| R-07.18 | A **vomiting word** or a **diarrhea word**, then a **does-not-go-away phrase**. | "diarrhea that does not go away"; "vomiting that won't go away" |
| R-07.19 | A **severe word**, then a **nausea word**, a **vomiting word** or a **diarrhea word**. | "severe nausea"; "really bad diarrhea" |
| R-07.20 | A **nausea word**, a **vomiting word** or a **diarrhea word**, then "is", "are", "was", "got", "getting" or "been", plus "severe", "unbearable", "awful", "terrible", "horrible", "intense", "out of control", "so bad" (also "really", "very", "extremely", "super" or "real" bad) or "the worst". | "the diarrhea is out of control" |
| R-07.21 | "Dizzy", "dizziness", "lightheaded" (also "light-headed", "light headed", "lightheadedness"), "woozy" or "vertigo". It does not count when a **slight word** stands right before it ("a little dizzy"), or when "a bit", "a little", "a tad" or "slightly" follows. Or "room", "everything" or "head", plus "spinning" ("is", "was", "keeps" or "started" may stand in between). | "feeling dizzy"; "the room is spinning" |
| R-07.22 | "Dehydrated" after "so", "very", "really", "severely", "badly", "super", "extremely" or "pretty", or after "I'm", "I am", "I think I'm", "feel", "feeling", "felt", "got" or "getting". Or "severe dehydration". | "I think I'm dehydrated" |

Phrases the test suite requires to trigger this rule: "can't keep water down"; "I've been throwing up all day"; "diarrhea nonstop since last night"; "I haven't peed all day"; "dizzy when I stand up"; "threw up 6 times today"; "everything I eat comes back up"; "constantly nauseous, no vomiting"; "nausea that won't go away".

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
| R-08.7 | A **pain or soreness word**, then (within about 30 characters) "upper", "top of my" or "upper part of my" and a **stomach word** ("middle", "central", "mid", "left" or "right" may stand before it). Or "upper" and a **stomach word** first, then a **pain or soreness word**. | "pain in my upper stomach"; "upper abdominal pain after I eat" |
| R-08.8 | A **pain or soreness word**, then "under", "below", "beneath" or "behind", plus "my ribs", "my rib cage", "my breastbone" or "my sternum". Or those words first, then a **pain or soreness word**. | "sore right under my ribs" |
| R-08.9 | "I'm", "I am", "I look", "I looked", "I turned", "I'm looking" or "I'm turning", followed by "yellow" or "jaundiced" ("a bit", "a little", "kind of", "kinda", "really" or "so" may stand in between). | "I look yellow" |
| R-08.10 | "Fever", "fevers" or "feverish". Not "hay fever", "cabin fever" and the like, and not "fever dream", "fever pitch", "fever blister" or "fever tree". Or "running", "have", "having", "had", "got", "spiked" or "spiking", followed by "a temp" or "a temperature". Or "temp" or "temperature" with a number from 100 to 109, or from 38 to 41 ("is", "was", "of", "at", "hit", "reached", "up to" or "went to" may stand in between). | "I have a fever"; "my temp is 101.2" |
| R-08.11 | "Clay", "pale", "light", "gray", "grey", "white", "whitish", "chalky" or "putty" (with or without "colored"), followed by "stool", "stools", "poop", "poops", "poo", "bowel movement", "bowel movements", "BM" or "BMs". Or one of those words for stool first, then "clay", "pale", "light-colored", "light in color", "gray", "grey", "white", "whitish", "chalky" or "putty". | "clay colored stools"; "my poop is pale" |
| R-08.12 | "Gallstone" or "gallstones" (also written "gall stones"). Or "gallbladder" followed by "attack", "pain", "problem", "problems", "issue", "issues" or "infection". | "I think I have gallstones" |

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
| R-09.3 | "Trouble", "difficulty", "difficult", "hard time", "problem", "problems", "issue", "issues", "hard", "harder", "tough", "can't", "cannot", "can barely", "can hardly", "unable to", "struggle", "struggles" or "struggling", followed by a word that starts with "swallow" ("to" or "with" may stand in between). It does not count when it is said of a pill (section 2.3). | "trouble swallowing"; "it's hard to swallow" |
| R-09.4 | "Hoarse", "hoarseness", "raspy" or "lost my voice", then words that say it has lasted: "for weeks", "for months", "for a long time", "for a while", "for a month", "for ages", "won't go away", "not getting better", "not improving", "still", "all the time" or "constantly". | "my voice has been hoarse for weeks"; "hoarse and it won't go away" |
| R-09.5 | "For weeks", "for months", "for a long time", "still", "always" or "constantly", then "hoarse" or "raspy". | "still hoarse" |
| R-09.6 | "Hoarse", "hoarseness", "raspy", "croaky", "lost my voice" or "losing my voice". Or "voice" followed by "hoarse", "raspy", "croaky", "gone" or "scratchy" ("is", "has been", "sounds", "got", "keeps getting" or "went" may stand in between). It does not count when a **slight word** stands right before it ("a little hoarse"). | "my voice is hoarse"; "I lost my voice" |
| R-09.7 | "Swallowing" plus "is", "feels", "got", "has been", "was" or "has gotten", plus "hard", "harder", "difficult", "tough" or "a struggle". Or "food", "drink", "drinks", "water", "liquid" or "liquids", plus "gets stuck", "keeps getting stuck", "got stuck", "is getting stuck" or "feels stuck". Or "choke", "chokes", "choked" or "choking", followed by "on" or "when". | "swallowing is getting harder"; "food keeps getting stuck" |
| R-09.8 | "Swollen", "lumpy", "enlarged" or "bulging", followed by "neck" or "thyroid". Or "lump", "bump", "mass", "nodule", "knot" or "growth", then "in my thyroid" or "on my thyroid". Or "swollen glands", "swollen nodes" or "swollen lymph nodes", then "neck". Or "goiter". | "swollen glands in my neck"; "a nodule on my thyroid" |

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
- **Raised from:** typed text (2.3) and symptom buttons (2.2)

Card, **hidden until reviewed**:

> **Severe or lasting stomach pain: see a doctor as soon as possible**
>
> If the pain spreads to your back, comes with vomiting, or keeps getting worse, go to the emergency room right away (911). Today's workout is paused.

This card shows a "Call 911" button and pauses the day's workout and food tips.

What triggers it in typed text:

| Code | What the person typed | Examples that trigger (checked) |
|----|------------------------------------|--------------------|
| R-14.1 | A **stomach word** and a **pain word**, then (within about 30 characters) a **does-not-go-away phrase**. | "stomach pain that won't go away"; "my stomach has hurt for 5 days" |
| R-14.2 | A **pain word**, then "in", "around" or "across" and a **stomach word**, then a **does-not-go-away phrase**. | "pain in my belly for 3 days" |
| R-14.3 | "Constant", "nonstop", "persistent", "lingering", "ongoing", "continuous", "never-ending" or "unrelenting", then a **stomach word** joined to a **pain word**. | "constant stomach pain" |
| R-14.4 | A **severe word**, then "constipation", "constipated", "bloating", "bloated", "heartburn", "acid reflux", "reflux", "indigestion", "gas pain", "gas pains", or a **stomach word** plus "problem", "problems", "issue", "issues", "trouble", "troubles" or "upset". | "severe constipation"; "severe stomach problems" |
| R-14.5 | "Constipation", "bloating", "heartburn", "acid reflux", "reflux", "indigestion", "gas pain", "gas pains", or a **stomach word** plus "problem", "problems", "issue", "issues", "trouble" or "troubles"; then "is", "are", "was", "were", "got" or "getting", plus "severe", "unbearable", "awful", "terrible", "horrible", "intense", "out of control", "so bad" (also "really", "very", "extremely", "super" or "real" bad) or "the worst". | "stomach problems that are severe"; "my heartburn is terrible" |
| R-14.6 | A **stomach word**, "digestive" or "GI", plus "problem", "problems", "issue", "issues", "trouble", "troubles" or "upset"; or "upset" plus a **stomach word**; or "constipated", "constipation", "bloated", "bloating", "heartburn", "acid reflux", "reflux" or "indigestion". Then a **does-not-go-away phrase**. | "stomach problems that will not go away"; "constipated for a week" |
| R-14.7 | A **vomiting word** followed by "blood" ("up", "bright red", "a lot of", "some" or "dark" may stand in between). Or "pooping" or "pooped", followed by "blood". Or "blood", then "in" or "with", plus "vomit", "puke", "throw up", "stool", "stools", "poop", "poo", "bowel movement", "bowel movements", "BM" or "diarrhea". | "vomited blood"; "blood in my stool" |
| R-14.8 | "Bloody", "black", "tarry", "black tarry", "black and tarry" or "maroon", followed by "stool", "stools", "poop", "poops", "poo", "vomit", "diarrhea", "bowel movement" or "bowel movements". Or "stool", "stools", "poop", "poops", "poo", "vomit" or "puke", then "is", "was", "are", "were", "looks", "look" or "looked", plus "black", "bloody", "tarry" or "like coffee grounds". | "black tarry stool"; "my poop is black" |

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
| U-02 | "a little dizzy" | Dizziness that the person calls slight stays quiet. |
| U-03 | "heart racing a bit" | A racing heart that the person calls slight stays quiet. |
| U-04 | "feeling shaky after coffee" | One low-blood-sugar sign alone is not enough. |
| U-05 | "had a sugar crash after lunch" | "Sugar crash" as a figure of speech does not match the low-blood-sugar phrases. |
| U-06 | "mild stomach ache after dinner" | Stomach pain triggers only with a severe word, when it reaches the back, or when the person says it does not go away. |
| U-07 | "my stomach pain is back" | "Is back" is not read as pain reaching the back. |
| U-08 | "stomach pain, but not to my back" | The person says it does not reach the back. |
| U-09 | "barely ate today" | Eating too little triggers only when it has gone on for days. |
| U-10 | "rash at the injection site" | A rash triggers only when the person calls it severe or spreading, when it is all over the body, or when it is hives. |
| U-11 | "itchy rash all over my thigh" | "All over" one body part does not count. |
| U-12 | "sore throat" | Only swelling, closing or tightness of the throat triggers. |
| U-13 | "can't breathe through my nose" | A blocked nose is not read as trouble breathing. |

All 41 English phrases the test suite requires to stay quiet: "a little nauseous"; "threw up once"; "took my shot, 5 mg, left thigh"; "182.4 this morning"; "not pregnant"; "no severe pain"; "feeling tired today"; "two eggs and a protein shake"; "mild stomach ache after dinner"; "stomach feels bloated"; "my stomach pain is back"; "back is sore from the gym"; "upper right arm is sore after the shot"; "injection site is a little red"; "rash at the injection site"; "itchy rash all over my thigh"; "a little dizzy"; "heart racing a bit"; "threw up twice"; "Took my shot this morning. Mild nausea. No vomiting."; "barely ate today"; "skipped breakfast"; "sore throat"; "can't breathe through my nose"; "chest day at the gym"; "yellow squash for dinner"; "vision is fine"; "lost 2 pounds this week"; "weighed 182.4"; "I can't go on a walk today"; "can't go on vacation this month"; "I don't want to be here at the gym"; "had a sugar crash after lunch"; "cut sugar, dropped 2 lb"; "my face is red and my ankle is swollen"; "my eyelids closed and I fell asleep"; "sharp cheddar and stomach ache"; "stomach ache. Went back to bed."; "stomach pain, but not to my back"; "stomach pain while sitting in the back seat"; "rested the bar on my chest".

**From the test suite: the corpus**

A second test file holds phrases as people type them on a phone: lower case, no punctuation, misspellings, slang. Each phrase in the first table must raise the alert of section 2.1. Each phrase in the second table must raise nothing. The script that built this packet ran every one of them.

| Code | What the phrases are about | Phrases that must raise the alert |
|----|----------------|------------------------------------------------|
| Y-01 | Guide item (2.6): thyroid tumors | "a lump in my neck"; "swelling in my neck"; "hoarseness"; "trouble swallowing"; "shortness of breath"; "i found a lump in my neck"; "theres a bump on my neck that wasnt there before"; "my neck is swollen on one side"; "swelling in the front of my neck"; "hoarseness for the last few days"; "my voice is hoarse"; "been hoarse since tuesday"; "lost my voice and it hasnt come back"; "its getting hard to swallow food"; "food keeps getting stuck when i swallow"; "cant swallow right"; "short of breath just walking to the kitchen"; "swollen glands in my neck"; "raspy voice all week"; "I have a lump on the side of my neck and I am hoarse" |
| Y-02 | Guide item (2.6): inflammation of the pancreas (pancreatitis) | "severe pain in my stomach area that will not go away"; "severe pain in my abdomen that will not go away with nausea and vomiting"; "pain from my abdomen to my back"; "severe stomach pain"; "my stomach hurts so bad i cant stand up"; "the pain goes from my stomach to my back"; "horrible belly pain wrapping around to my back"; "stomach is killing me"; "worst stomach ache ive ever had"; "excruciating abdominal pain and throwing up"; "doubled over with stomach cramps"; "really bad tummy pain since last night"; "sharp pain in my upper belly that goes through to my back"; "i think i have pancreatitis"; "stomache pain is unbearable"; "terrible stomach pain wont stop" |
| Y-03 | Guide item (2.6): gallbladder problems | "pain in my upper stomach"; "pain in my upper abdomen"; "yellowing of my skin"; "yellowing of my eyes"; "jaundice"; "fever"; "clay-colored stools"; "upper abdominal pain after i eat"; "my upper belly hurts"; "pain under my right ribs"; "sore right under my ribs"; "my eyes look yellow"; "the whites of my eyes are yellow"; "i think im jaundiced"; "i have a fever"; "running a fever of 101"; "fever and chills since last night"; "clay colored stools"; "my poop is pale"; "light colored poop the last 2 days"; "grey stool"; "gallbladder attack i think"; "feverish and my skin looks yellow" |
| Y-04 | Guide item (2.6): low blood sugar | "low blood sugar"; "hypoglycemia"; "my blood sugar is low"; "i think im hypoglycemic"; "sugar dropped to 52"; "my sugars are running low"; "bg is low"; "having a hypo"; "glucose crashed after lunch"; "shaky and sweaty"; "dizziness and sweating"; "shakiness and blurred vision"; "confusion and a fast heartbeat"; "feeling jittery and hungry"; "sweating and weakness"; "slurred speech and weakness"; "shaky with a headache"; "dizzy and my heart is racing"; "shaking and cant think straight"; "sweating and confused"; "jittery and starving"; "weak and shaky after my shot"; "anxious and sweating a lot"; "so hungry and lightheaded"; "felt drowsy and irritable all afternoon" |
| Y-05 | Guide item (2.6): dehydration leading to kidney problems | "nausea that does not go away"; "vomiting that does not go away"; "diarrhea that does not go away"; "vomiting that wont go away"; "ive been nauseous for 4 days straight"; "nausea wont stop"; "constantly nauseous"; "puking all day"; "cant stop throwing up"; "i keep throwing up"; "the runs for 3 days now"; "diarrea nonstop"; "cant keep anything down"; "threw up 7 times today"; "even water comes back up"; "been sick to my stomach every day this week"; "still throwing up and its been 3 days"; "barfing nonstop since yesterday"; "hardly peeing"; "i think im dehydrated" |
| Y-06 | Guide item (2.6): severe stomach problems | "stomach problems that are severe"; "stomach problems that will not go away"; "severe stomach problems"; "stomach pain that wont go away"; "my stomach has hurt for 5 days"; "constant stomach pain"; "belly ache every day"; "severe constipation"; "constipated for a week"; "really bad heartburn"; "bloating that wont go away"; "acid reflux every single day"; "upset stomach for weeks"; "vomited blood"; "throwing up blood"; "black tarry stool"; "blood in my stool"; "severe nausea"; "severe vomiting"; "really bad stomach cramps"; "the diarrhea is out of control" |
| Y-07 | Guide item (2.6): serious allergic reactions | "swelling of my face"; "swelling of my lips and tongue"; "swelling of my throat"; "problems breathing"; "problems swallowing"; "severe rash"; "severe itching"; "fainting"; "feeling dizzy"; "very rapid heartbeat"; "my lips are swollen"; "tongue feels swollen"; "throat feels tight"; "my throat is closing up"; "face is all puffy"; "hard to breathe"; "cant breathe"; "wheezing"; "itching all over"; "broke out in hives"; "rash is spreading"; "i fainted"; "passed out"; "i keep passing out"; "i feel faint"; "so dizzy i had to sit down"; "my heart is beating so fast"; "i think im having an allergic reaction"; "eyelids swelled shut" |
| Y-08 | Guide item (2.6): changes in vision | "changes in vision"; "changes in my vision"; "my vision is blurry"; "blurry vision since yesterday"; "vision got worse this week"; "seeing double"; "double vision"; "everything looks fuzzy"; "i see floaters"; "cant see well out of my left eye"; "my eyes are blurry"; "trouble seeing at night"; "suddenly cant see out of one eye"; "dark spot in my vision"; "my eyesight is getting worse"; "vision seems off"; "losing my sight" |
| Y-09 | Guide item (2.6): increased heart rate | "heart racing in my chest"; "heart pounding in my chest and it lasts for several minutes"; "my heart is racing"; "heart racing for like 10 minutes"; "pounding heart wont slow down"; "my pulse is really fast"; "heart rate is through the roof"; "palpitations"; "heart palpitations again tonight"; "resting heart rate is way too high"; "my heart keeps fluttering"; "heart beating out of my chest"; "fast heartbeat even when im sitting"; "heart is going crazy"; "racing pulse" |
| Y-10 | Chest pain (not from a guide) and passing out | "chest pain"; "my chest hurts"; "pressure in my chest"; "tightness in my chest"; "chest feels tight"; "crushing chest pain"; "chest pains when i breathe"; "pain in my chest and left arm"; "i blacked out"; "lost consciousness for a second"; "passed out in the bathroom"; "i was unconscious" |
| Y-11 | Not from a guide: self-harm | "i want to die"; "thinking about killing myself"; "i want to kill myself"; "suicidal"; "i dont want to live anymore"; "i wish i was dead"; "better off dead"; "i want to end my life"; "thoughts of hurting myself"; "i cant go on like this"; "i want to end it all"; "theres no point in living" |

| Code | Why it must raise nothing | Phrases |
|----|----------------|------------------------------------------------|
| Z-01 | Someone else | "my dad had chest pain last year"; "my sister is pregnant"; "my mom is having surgery next week"; "my husband fainted at work"; "my friend has low blood sugar a lot"; "my wife has a fever"; "my son's throat is swollen"; "she passed out at the gym"; "he has jaundice"; "my dog threw up 6 times"; "my coworker had an allergic reaction"; "my mom has trouble swallowing"; "my brother has pancreatitis"; "a friend of mine had gallstones"; "my grandma has blurry vision"; "my kid has had diarrhea for 3 days"; "my husband is dizzy all the time"; "my dad's heart was racing"; "some people get hives from it"; "my daughter has a rash all over"; "my mother in law has double vision"; "they have a fever" |
| Z-02 | Long ago | "I fainted once as a kid"; "had chest pain years ago"; "i had pancreatitis in 2019"; "last year i had gallstones"; "i used to get palpitations"; "i had jaundice as a baby"; "history of low blood sugar"; "i had hives as a child"; "i used to have blurry vision before lasik"; "passed out once in college"; "two years ago i had trouble swallowing"; "i had a bad allergic reaction 10 years ago"; "when i was younger i had vertigo"; "a long time ago i had a lump in my neck removed"; "growing up i had fevers all the time" |
| Z-03 | A general question | "What are the signs of low blood sugar?"; "what are the symptoms of pancreatitis"; "can ozempic cause chest pain"; "does zepbound cause blurry vision"; "is fainting a side effect"; "what does low blood sugar feel like"; "what is jaundice"; "what is considered low blood sugar"; "can this medication cause gallstones"; "will the shot give me hives"; "is hoarseness a common side effect"; "how common is pancreatitis on wegovy"; "what should i do if i get low blood sugar"; "what are the warning signs of a serious allergic reaction"; "does mounjaro cause heart palpitations"; "i read that ozempic can cause vision loss"; "i heard about people fainting on this"; "worried about getting pancreatitis"; "how to prevent low blood sugar"; "are hives a side effect of zepbound"; "what does an allergic reaction look like"; "is chest pain a side effect of wegovy"; "who do i call if i get chest pain"; "what counts as a fever"; "how can you tell if you have low blood sugar"; "i wonder if it can cause pancreatitis"; "what causes low blood sugar"; "what are signs of a gallbladder attack"; "can you get jaundice from this" |
| Z-04 | A denial | "no chest pain"; "no fever"; "not dizzy"; "i don't have trouble swallowing"; "no shortness of breath"; "never fainted"; "no blurry vision"; "not short of breath"; "no rash"; "no hives"; "no low blood sugar"; "no yellowing of my skin"; "not hoarse"; "no heart palpitations"; "no swelling in my neck"; "not having trouble breathing"; "i'm not dizzy anymore"; "no more stomach pain"; "no nausea today"; "never had a fever"; "no itching"; "not lightheaded" |
| Z-05 | The size of a pill | "hard to swallow this big pill"; "trouble swallowing the tablets"; "these pills are hard to swallow"; "cant swallow pills"; "that was a hard pill to swallow"; "the capsule is hard to swallow"; "difficulty swallowing my vitamins"; "the rybelsus tablet is huge and hard to swallow" |
| Z-06 | Slight, or an ordinary day on this medication | "a little dizzy"; "slightly dizzy this morning"; "kinda lightheaded"; "heart racing a bit"; "a little nauseous"; "mild nausea"; "threw up once"; "threw up twice"; "nauseous all day"; "nausea after eating"; "queasy this morning"; "a little hoarse"; "upset stomach"; "mild stomach ache after dinner"; "stomach feels bloated"; "my stomach pain is back"; "some heartburn after pizza"; "a bit constipated"; "constipated today"; "had diarrhea this morning"; "loose stools once"; "felt tired today"; "headache this afternoon"; "so hungry today"; "starving before dinner"; "sweaty after my workout"; "feeling anxious about my appointment"; "a bit shaky after coffee"; "weak after leg day"; "moody today"; "drowsy after lunch"; "itchy at the injection site"; "rash at the injection site"; "small bruise where i injected"; "injection site is a little red"; "sore throat"; "stuffy nose cant breathe through my nose"; "eyes are tired"; "eyes are dry"; "vision is fine"; "neck is sore from sleeping wrong"; "stiff neck"; "back is sore from the gym"; "burped a lot today"; "gassy"; "dry mouth"; "thirsty all day"; "peed a lot today"; "tired and sore"; "bloated and gassy after dinner"; "itchy rash all over my thigh"; "puffy eyes this morning" |
| Z-07 | Words that only look like a symptom | "yellow squash for dinner"; "had a sugar crash after lunch"; "cut sugar, dropped 2 lb"; "low sugar yogurt for breakfast"; "on a low sugar diet"; "two protein shakes and i was still hungry"; "hay fever is acting up"; "cabin fever this week"; "saturday night fever was on tv"; "feverfew supplement"; "passed out flyers at school"; "a faint smell of smoke"; "the print was faint"; "lost sight of my goals this week"; "sharp cheddar and stomach ache"; "stomach ache. Went back to bed."; "stomach pain while sitting in the back seat"; "rested the bar on my chest"; "chest day at the gym"; "my face is red and my ankle is swollen"; "my eyelids closed and I fell asleep"; "I can't go on a walk today"; "pounding headache"; "racing to get to work"; "heartburn"; "heart rate was 72 this morning"; "blood sugar was 105"; "blood sugar is fine"; "sugar free gum"; "took my blood pressure"; "breathing exercises this morning"; "swallowed my pill with water"; "voice lesson today"; "upper right arm is sore after the shot"; "upper body workout"; "top of my foot hurts"; "white rice and chicken"; "pale ale with dinner"; "spinning class this morning"; "a dizzying amount of emails"; "threw up my hands and gave up"; "bloody mary at brunch"; "blood test tomorrow"; "black coffee and toast"; "throat lozenge"; "swollen ankle"; "lip balm"; "took my shot, 5 mg, left thigh"; "182.4 this morning"; "lost 2 pounds this week" |

**Not in the test suite: extra phrases tried while building this packet**

Nobody has decided yet what these should do. The table shows what the rules do with each one today.

| Code | Phrase | What the rules do today |
|----|------------------------|------------------------|
| X-01 | "short of breath after climbing stairs" | Fires: R-04 `anaphylaxis` (`emergency`) |
| X-02 | "heart was pounding after cardio" | Fires: R-03 `chest_or_faint` (`emergency`) |
| X-03 | "hoarse from cheering at the game" | Fires: R-09 `thyroid` (`urgent`) |
| X-04 | "drank too much and passed out on the couch" | Fires: R-03 `chest_or_faint` (`emergency`) |
| X-05 | "really bad stomach cramps from my period" | Fires: R-02 `pancreatitis` (`emergency`) |
| X-06 | "itchy all over after the shower" | Fires: R-04 `anaphylaxis` (`emergency`) |
| X-07 | "wheezing from my asthma" | Fires: R-04 `anaphylaxis` (`emergency`) |
| X-08 | "poop is black from iron pills" | Fires: R-14 `abdominal_pain_severe` (`urgent`) |
| X-09 | "watched a show about suicide prevention" | Fires: R-01 `crisis` (`crisis`) |
| X-10 | "sedated at the dentist last month" | Fires: R-11 `procedure` (`remind`) |
| X-11 | "my son can't breathe" | Stays quiet |
| X-12 | "how do I know if it is an allergic reaction" | Stays quiet |
| X-13 | "nauseous all day" | Stays quiet |
| X-14 | "throwing up and stomach pain" | Stays quiet |
| X-15 | "threw up 4 times" | Stays quiet |
| X-16 | "throwing up everything" | Stays quiet |
| X-17 | "dark urine" | Stays quiet |
| X-18 | "can't pass gas and my belly is swollen" | Stays quiet |
| X-19 | "no bowel movement for a week" | Stays quiet |
| X-20 | "a rash on my arms and chest" | Stays quiet |
| X-21 | "slurred speech" | Stays quiet |
| X-22 | "I feel confused" | Stays quiet |
| X-23 | "my blood sugar was 60 this morning" | Stays quiet |
| X-24 | "feeling hopeless" | Stays quiet |
| X-25 | "feeling depressed" | Stays quiet |
| X-26 | "I took a double dose by mistake" | Stays quiet |
| X-27 | "I think I took too much" | Stays quiet |
| X-28 | "I missed my shot two weeks in a row" | Stays quiet |

### 2.6 The warning signs shown in the app: the words of the Medication Guides

The app has one screen named "Warning signs in the Medication Guide". A person opens it from the "Me" tab, or with the button on an alert (2.1). It shows two parts of the FDA Medication Guide of the person's own medication: the "most important information" and the serious side effects. The text is the guide's own, in the guide's order, with its sub-bullets as bullets. The app adds no word to the list, sets nothing in bold and marks no item as more urgent than another.

**Status of everything quoted in this section:** Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer. A script took the words from the label files published on DailyMed, and a second script checked every one of them against those files. No person outside our team has compared them with the guides.

Above the list the screen says where it is from. These words are ours:

| Code | Where | Screen text |
|----|------------------------|----------------------------------------|
| T-01 | First line, for every guide | "From the Medication Guide for [brand], [revised or issued, and the date of the guide]. These are the manufacturer's words, approved by the FDA. Nothing here is written by this app." |
| T-02 | The same line for Wegovy | "From the Medication Guide for Wegovy, revised 06/2026. These are the manufacturer's words, approved by the FDA. Nothing here is written by this app." |
| T-03 | Second line, followed by the page address as a link | "These are two parts of the guide: the most important information and the serious side effects. The full guide comes with your prescription. It is also at this address:" |
| T-04 | A medication with no guide in the app: "Other / custom", a medication with no US brand, a brand of another country | "This app has no Medication Guide on file for your medication. The Medication Guide comes with your prescription." |
| T-05 | Tirzepatide when the person has not said whether it is Zepbound or Mounjaro | “The Medication Guides for Zepbound and Mounjaro are separate. So the list needs to know your brand. To choose it, go to Me and tap "Change medication or redo setup".” |

The copy keeps the label file's punctuation, capital letters and spacing, also where a space is missing or one too many. Runs of spaces are written as one, and bold type is dropped. Sub-bullets are in the order the label file stores them; the printed guides set them in columns.

#### G-01 · Medication Guide for Wegovy, Wegovy pill

- **Title:** "MEDICATION GUIDE WEGOVY® (wee-GOH-vee) (semaglutide) injection, for subcutaneous use WEGOVY® (wee-GOH-vee) (semaglutide) tablets, for oral use"
- **Date line of the guide:** "Revised: 06/2026", after "This Medication Guide has been approved by the U.S. Food and Drug Administration."
- **Label on DailyMed:** set id ee06186f-2aa3-4990-a760-757579d8f77b, version 19, effective 2026-06-18. https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee06186f-2aa3-4990-a760-757579d8f77b
- **Status:** Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer

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

#### G-02 · Medication Guide for Ozempic

- **Title:** "Medication Guide OZEMPIC® (oh-ZEM-pick) (semaglutide) injection, for subcutaneous use"
- **Date line of the guide:** "Revised: 01/2025", after "This Medication Guide has been approved by the U.S. Food and Drug Administration."
- **Label on DailyMed:** set id adec4fd2-6858-4c99-91d4-531f5f2a2d79, version 20, effective 2026-06-01. https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=adec4fd2-6858-4c99-91d4-531f5f2a2d79
- **Status:** Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer

**What is the most important information I should know about OZEMPIC?**

OZEMPIC may cause serious side effects, including:

- `I-13` Possible thyroid tumors, including cancer. Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath. These may be symptoms of thyroid cancer. In studies with rodents, OZEMPIC and medicines that work like OZEMPIC caused thyroid tumors, including thyroid cancer. It is not known if OZEMPIC will cause thyroid tumors or a type of thyroid cancer called medullary thyroid carcinoma (MTC) in people.
- `I-14` Do not use OZEMPIC if you or any of your family have ever had a type of thyroid cancer called medullary thyroid carcinoma (MTC), or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).

**What are the possible side effects of OZEMPIC?**

OZEMPIC may cause serious side effects, including:

- `I-15` See “What is the most important information I should know about OZEMPIC?”
- `I-16` inflammation of your pancreas (pancreatitis). Stop using OZEMPIC and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without vomiting. You may feel the pain from your abdomen to your back.
- `I-17` changes in vision. Tell your healthcare provider if you have changes in vision during treatment with OZEMPIC.
- `I-18` low blood sugar (hypoglycemia). Your risk for getting low blood sugar may be higher if you use OZEMPIC with another medicine that can cause low blood sugar, such as a sulfonylurea or insulin. Signs and symptoms of low blood sugar may include:
  - dizziness or light-headedness
  - blurred vision
  - anxiety, irritability, or mood changes
  - sweating
  - slurred speech
  - hunger
  - confusion or drowsiness
  - shakiness
  - weakness
  - headache
  - fast heartbeat
  - feeling jittery
- `I-19` Dehydration leading to kidney problems. Diarrhea, nausea, and vomiting may cause a loss of fluids (dehydration) which may cause kidney problems. It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.
- `I-20` Severe stomach problems. Stomach problems, sometimes severe, have been reported in people who use OZEMPIC. Tell your healthcare provider if you have stomach problems that are severe or will not go away.
- `I-21` serious allergic reactions. Stop using OZEMPIC and get medical help right away, if you have any symptoms of a serious allergic reaction including:
  - swelling of your face, lips, tongue or throat
  - problems breathing or swallowing
  - severe rash or itching
  - fainting or feeling dizzy
  - very rapid heartbeat
- `I-22` gallbladder problems. Gallbladder problems have happened in some people who take OZEMPIC. Tell your healthcare provider right away if you get symptoms of gallbladder problems which may include:
  - pain in your upper stomach (abdomen)
  - yellowing of skin or eyes (jaundice)
  - fever
  - clay-colored stools
- `I-23` food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation). OZEMPIC may increase the chance of food getting into your lungs during surgery or other procedures. Tell all your healthcare providers that you are taking OZEMPIC before you are scheduled to have surgery or other procedures.

#### G-03 · Medication Guide for Rybelsus, Ozempic pill

- **Title:** "MEDICATION GUIDE RYBELSUS® (reb-EL-sus) (semaglutide) tablets, for oral use OZEMPIC® (oh-ZEM-pick) (semaglutide) tablets, for oral use"
- **Date line of the guide:** "Revised: 1/2026", after "This Medication Guide has been approved by the U.S. Food and Drug Administration."
- **Label on DailyMed:** set id 27f15fac-7d98-4114-a2ec-92494a91da98, version 14, effective 2026-01-30. https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=27f15fac-7d98-4114-a2ec-92494a91da98
- **Status:** Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer

**What is the most important information I should know about RYBELSUS and OZEMPIC tablets?**

RYBELSUS and OZEMPIC tablets may cause serious side effects, including:

- `I-24` Possible thyroid tumors, including cancer. Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath. These may be symptoms of thyroid cancer. In studies with rodents, RYBELSUS and OZEMPIC tablets and other medicines that work like RYBELSUS and OZEMPIC tablets caused thyroid tumors, including thyroid cancer. It is not known if RYBELSUS and OZEMPIC tablets will cause thyroid tumors or a type of thyroid cancer called medullary thyroid carcinoma (MTC) in people.
- `I-25` Do not use RYBELSUS or OZEMPIC tablets if you or any of your family have ever had a type of thyroid cancer called medullary thyroid carcinoma (MTC), or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).

**What are the possible side effects of RYBELSUS and OZEMPIC tablets?**

RYBELSUS and OZEMPIC tablets may cause serious side effects, including:

- `I-26` See “What is the most important information I should know about RYBELSUS and OZEMPIC tablets?”
- `I-27` inflammation of your pancreas (pancreatitis). Stop using RYBELSUS or OZEMPIC tablets and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting. Sometimes you may feel the pain from your abdomen to your back.
- `I-28` changes in vision. Tell your healthcare provider if you have changes in vision during treatment with RYBELSUS or OZEMPIC tablets.
- `I-29` low blood sugar (hypoglycemia). Your risk for getting low blood sugar may be higher if you use RYBELSUS or OZEMPIC tablets with another medicine that can cause low blood sugar, such as a sulfonylurea or insulin. Signs and symptoms of low blood sugar may include:
  - dizziness or light-headedness
  - blurred vision
  - anxiety, irritability, or mood changes
  - sweating
  - slurred speech
  - hunger
  - confusion or drowsiness
  - shakiness
  - weakness
  - headache
  - fast heartbeat
  - feeling jittery
- `I-30` dehydration leading to kidney problems. Diarrhea, nausea, and vomiting may cause a loss of fluids (dehydration) which may cause kidney problems. It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.
- `I-31` severe stomach problems. Stomach problems, sometimes severe, have been reported in people who use RYBELSUS or OZEMPIC tablets. Tell your healthcare provider if you have stomach problems that are severe or will not go away.
- `I-32` serious allergic reactions. Stop using RYBELSUS or OZEMPIC tablets and get medical help right away, if you have any symptoms of a serious allergic reaction including:
  - swelling of your face, lips, tongue or throat
  - problems breathing or swallowing
  - severe rash or itching
  - fainting or feeling dizzy
  - very rapid heartbeat
- `I-33` gallbladder problems. Gallbladder problems have happened in some people who take RYBELSUS andOZEMPIC tablets. Tell your healthcare provider right away if you get symptoms of gallbladder problems, which may include:
  - pain in your upper stomach (abdomen)
  - yellowing of skin or eyes (jaundice)
  - fever
  - clay-colored stools
- `I-34` food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation). RYBELSUS and OZEMPIC tablets may increase the chance of food getting into your lungs during surgery or other procedures. Tell all your healthcare providers that you are taking RYBELSUS or OZEMPIC tablets before you are scheduled to have surgery or other procedures.

#### G-04 · Medication Guide for Zepbound

- **Title:** "Medication Guide ZEPBOUND ® (ZEHP-bownd) (tirzepatide) injection, for subcutaneous use"
- **Date line of the guide:** "Revised: 08/2026", after "This Medication Guide has been approved by the U.S. Food and Drug Administration."
- **Label on DailyMed:** set id 487cd7e7-434c-4925-99fa-aa80b1cc776b, version 40, effective 2026-08-28. https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=487cd7e7-434c-4925-99fa-aa80b1cc776b
- **Status:** Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer

**What is the most important information I should know about ZEPBOUND?**

ZEPBOUND may cause serious side effects, including:

- `I-35` Possible thyroid tumors, including cancer. Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath. These may be symptoms of thyroid cancer. In studies with rats, ZEPBOUND and medicines that work like ZEPBOUND caused thyroid tumors, including thyroid cancer. It is not known if ZEPBOUND will cause thyroid tumors, or a type of thyroid cancer called medullary thyroid carcinoma (MTC) in people.
- `I-36` Do not use ZEPBOUND if you or any of your family have ever had a type of thyroid cancer called MTC, or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).

**What are the possible side effects of ZEPBOUND?**

ZEPBOUND may cause serious side effects, including:

- `I-37` See “What is the most important information I should know about ZEPBOUND?”
- `I-38` severe stomach problems. Stomach problems, sometimes severe, have been reported in people who use ZEPBOUND. Tell your healthcare provider if you have stomach problems that are severe or will not go away.
- `I-39` dehydration leading to kidney problems. Diarrhea, nausea, and vomiting may cause a loss of fluids (dehydration) which may cause kidney problems. It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.
- `I-40` gallbladder problems. Gallbladder problems have happened in some people who use ZEPBOUND. Tell your healthcare provider right away if you get symptoms of gallbladder problems which may include:
  - pain in your upper stomach (abdomen)
  - fever
  - yellowing of skin or eyes (jaundice)
  - clay-colored stools
- `I-41` inflammation of your pancreas (pancreatitis). Stop using ZEPBOUND and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting. Sometimes you may feel the pain from your abdomen to your back.
- `I-42` serious allergic reactions. Stop using ZEPBOUND and get medical help right away if you have any symptoms of a serious allergic reaction including:
  - swelling of your face, lips, tongue or throat
  - problems breathing or swallowing
  - severe rash or itching
  - fainting or feeling dizzy
  - very rapid heartbeat
- `I-43` low blood sugar (hypoglycemia). Your risk for getting low blood sugar may be higher if you use ZEPBOUND with medicines that can cause low blood sugar, such as an insulin or sulfonylurea. Signs and symptoms of low blood sugar may include:
  - dizziness or light-headedness
  - sweating
  - confusion or drowsiness
  - headache
  - blurred vision
  - slurred speech
  - shakiness
  - fast heartbeat
  - anxiety, irritability, or mood changes
  - hunger
  - weakness
  - feeling jittery
- `I-44` changes in vision in patients with type 2 diabetes. Tell your healthcare provider if you have changes in vision during treatment with ZEPBOUND.
- `I-45` food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation). ZEPBOUND may increase the chance of food getting into your lungs during surgery or other procedures. Tell all your healthcare providers that you are taking ZEPBOUND before you are scheduled to have surgery or other procedures.

#### G-05 · Medication Guide for Mounjaro

- **Title:** "Medication Guide MOUNJARO® [mown-JAHR-OH] (tirzepatide) injection, for subcutaneous use"
- **Date line of the guide:** "Revised: August 2026", after "This Medication Guide has been approved by the U.S. Food and Drug Administration"
- **Label on DailyMed:** set id d2d7da5d-ad07-4228-955f-cf7e355c8cc0, version 40, effective 2026-08-27. https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d2d7da5d-ad07-4228-955f-cf7e355c8cc0
- **Status:** Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer

**What is the most important information I should know about MOUNJARO?**

MOUNJARO may cause serious side effects, including:

- `I-46` Possible thyroid tumors, including cancer. Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath. These may be symptoms of thyroid cancer. In studies with rats, MOUNJARO and medicines that work like MOUNJARO caused thyroid tumors, including thyroid cancer. It is not known if MOUNJARO will cause thyroid tumors, or a type of thyroid cancer called medullary thyroid carcinoma (MTC) in people.
- `I-47` Do not use MOUNJARO if you or any of your family have ever had a type of thyroid cancer called medullary thyroid carcinoma (MTC), or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).

**What are the possible side effects of MOUNJARO?**

MOUNJARO may cause serious side effects, including:

- `I-48` See “What is the most important information I should know about MOUNJARO?”
- `I-49` inflammation of your pancreas (pancreatitis). Stop using MOUNJARO and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting. Sometimes you may feel the pain from your abdomen to your back.
- `I-50` low blood sugar (hypoglycemia). Your risk for getting low blood sugar may be higher if you use MOUNJARO with another medicine that can cause low blood sugar, such as a sulfonylurea or insulin. Signs and symptoms of low blood sugar may include:
  - dizziness or light-headedness
  - sweating
  - confusion or drowsiness
  - headache
  - blurred vision
  - slurred speech
  - shakiness
  - fast heartbeat
  - anxiety, irritability, or mood changes
  - hunger
  - weakness
  - feeling jittery
- `I-51` serious allergic reactions. Stop using MOUNJARO and get medical help right away if you have any symptoms of a serious allergic reaction including:
  - swelling of your face, lips, tongue, or throat
  - problems breathing or swallowing
  - severe rash or itching
  - fainting or feeling dizzy
  - very rapid heartbeat
- `I-52` dehydration leading to kidney problems. Diarrhea, nausea, and vomiting may cause a loss of fluids (dehydration) which may cause kidney problems. It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.
- `I-53` severe stomach problems. Stomach problems, sometimes severe, have been reported in people who use MOUNJARO. Tell your healthcare provider if you have stomach problems that are severe or will not go away.
- `I-54` changes in vision. Tell your healthcare provider if you have changes in vision during treatment with MOUNJARO.
- `I-55` gallbladder problems. Gallbladder problems have happened in some people who use MOUNJARO. Tell your healthcare provider right away if you get symptoms of gallbladder problems which may include:
  - pain in your upper stomach (abdomen)
  - fever
  - yellowing of skin or eyes (jaundice)
  - clay-colored stools
- `I-56` food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation). MOUNJARO may increase the chance of food getting into your lungs during surgery or other procedures. Tell all your healthcare providers that you are taking MOUNJARO before you are scheduled to have surgery or other procedures.

#### G-06 · Medication Guide for Saxenda

- **Title:** "MEDICATION GUIDE SAXENDA (sax-end-ah) (liraglutide) injection, for subcutaneous use"
- **Date line of the guide:** "Revised: 02/2026", after "This Medication Guide has been approved by the U.S. Food and Drug Administration."
- **Label on DailyMed:** set id 3946d389-0926-4f77-a708-0acb8153b143, version 22, effective 2026-02-25. https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=3946d389-0926-4f77-a708-0acb8153b143
- **Status:** Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer

**What is the most important information I should know about SAXENDA?**

Serious side effects may happen in people who take SAXENDA, including:

- `I-57` Possible thyroid tumors, including cancer. Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath. These may be symptoms of thyroid cancer. In studies with rats and mice, SAXENDA and medicines that work like SAXENDA caused thyroid tumors, including thyroid cancer. It is not known if SAXENDA will cause thyroid tumors or a type of thyroid cancer called medullary thyroid carcinoma (MTC) in people.
- `I-58` Do not use SAXENDA if you or any of your family have ever had a type of thyroid cancer called medullary thyroid carcinoma (MTC), or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).

**What are the possible side effects of SAXENDA?**

SAXENDA may cause serious side effects, including:

- `I-59` See “What is the most important information I should know about SAXENDA?”
- `I-60` inflammation of the pancreas (pancreatitis). Stop using SAXENDA and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting. You may feel the pain from your stomach area (abdomen) to your back.
- `I-61` increased risk of low blood sugar (hypoglycemia) in adults with type 2 diabetes, especially those who also take medicines to treat type 2 diabetes mellitus such as an insulin or a sulfonylureas and in children who are 12 years of age and older without type 2 diabetes mellitus. Low blood sugar in patients with adults with type 2 diabetes and in children without type 2 diabetes mellitus who receive SAXENDA can be both a serious and common side effect. Talk to your healthcare provider about how to recognize and treat low blood sugar. You should check your blood sugar before you start taking SAXENDA and while you take SAXENDA. Signs and symptoms of low blood sugar may include:
  - dizziness or light-headedness
  - sweating
  - confusion or drowsiness
  - headache
  - blurred vision
  - slurred speech
  - shakiness
  - fast heartbeat
  - anxiety, irritability, or mood changes
  - hunger
  - weakness
  - feeling jittery

  Talk to your healthcare provider about how to recognize and treat low blood sugar. You should check your blood sugar before you start taking SAXENDA and while you take SAXENDA.
- `I-62` increased heart rate. SAXENDA can increase your heart rate while you are at rest. Your healthcare provider should check your heart rate while you take SAXENDA. Tell your healthcare provider if you feel your heart racing or pounding in your chest and it lasts for several minutes.
- `I-63` dehydration leading to kidney problems. Diarrhea, nausea, and vomiting may cause a loss of fluids (dehydration) which may cause kidney problems. It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.
- `I-64` severe stomach problems. Stomach problems, sometimes severe, have been reported in people who use SAXENDA. Tell your healthcare provider if you have stomach problems that are severe or will not go away.
- `I-65` serious allergic reactions. Stop using SAXENDA, and get medical help right away if you have any symptoms of a serious allergic reaction including:
  - swelling of your face, lips, tongue, or throat
  - problems breathing or swallowing
  - severe rash or itching
  - fainting or feeling dizzy
  - very rapid heartbeat
- `I-66` gallbladder problems. SAXENDA may cause gallbladder problems including gallstones. Some gallbladder problems need surgery. Call your healthcare provider if you have any of the following symptoms:
  - pain in your upper stomach (abdomen)
  - fever
  - yellowing of your skin or eyes (jaundice)
  - clay-colored stools
- `I-67` food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation). SAXENDA may increase the chance of food getting into your lungs during surgery or other procedures. Tell all your healthcare providers that you are taking SAXENDA before you are scheduled to have surgery or other procedures.

#### G-07 · Medication Guide for Foundayo

- **Title:** "Medication Guide FOUNDAYO™ [fown-DAY-oh] (orforglipron) tablets, for oral use"
- **Date line of the guide:** "Issued: 07/2026", after "This Medication Guide has been approved by the U.S. Food and Drug Administration."
- **Label on DailyMed:** set id 8ac446c5-feba-474f-a103-23facb9b5c62, version 10, effective 2026-07-29. https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8ac446c5-feba-474f-a103-23facb9b5c62
- **Status:** Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer

**What is the most important information I should know about FOUNDAYO?**

FOUNDAYO may cause serious side effects including:

- `I-68` Possible thyroid tumors, including cancer. Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath. These may be symptoms of thyroid cancer. In studies with rodents, medicines that work like FOUNDAYO caused thyroid tumors, including thyroid cancer. It is not known if FOUNDAYO will cause thyroid tumors, or a type of thyroid cancer called medullary thyroid carcinoma (MTC) in people.
- `I-69` Do not take FOUNDAYO if you or any of your family have ever had a type of thyroid cancer called MTC, or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).

**What are the possible side effects of FOUNDAYO?**

FOUNDAYO may cause serious side effects, including:

- `I-70` See “What is the most important information I should know about FOUNDAYO?”
- `I-71` inflammation of the pancreas (pancreatitis). Stop taking FOUNDAYO and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting. Sometimes you may feel the pain from your abdomen to your back.
- `I-72` severe stomach problems. Stomach problems, sometimes severe, have been reported in people who use FOUNDAYO. Tell your healthcare provider if you have stomach problems that are severe or will not go away.
- `I-73` dehydration leading to kidney problems. Diarrhea, nausea, and vomiting may cause a loss of fluids (dehydration) which may cause kidney problems. It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.
- `I-74` low blood sugar (hypoglycemia). Your risk for getting low blood sugar may be higher if you use FOUNDAYO with medicines that can cause low blood sugar, such as an insulin or sulfonylurea. Signs and symptoms of low blood sugar may include:
  - dizziness or light-headedness
  - sweating
  - confusion or drowsiness
  - headache
  - blurred vision
  - slurred speech
  - shakiness
  - fast heartbeat
  - anxiety, irritability, or mood changes
  - hunger
  - weakness
  - feeling jittery
- `I-75` serious allergic reactions. Stop taking FOUNDAYO and get medical help right away if you have any symptoms of a serious allergic reaction including:
  - swelling of your face, lips, tongue, or throat
  - problems breathing or swallowing
  - severe rash or itching
  - fainting or feeling dizzy
  - very rapid heartbeat
- `I-76` changes in vision in patients with type 2 diabetes. Tell your healthcare provider if you have changes in vision during treatment with FOUNDAYO.
- `I-77` gallbladder problems. Gallbladder problems have happened in some people who use FOUNDAYO. Tell your healthcare provider right away if you get symptoms of gallbladder problems which may include:
  - pain in your upper stomach (abdomen)
  - fever
  - yellowing of skin or eyes (jaundice)
  - clay-colored stools
- `I-78` food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation). FOUNDAYO may increase the chance of food getting into your lungs during surgery or other procedures. Tell all your healthcare providers that you are taking FOUNDAYO before you are scheduled to have surgery or other procedures.

### 2.7 From the guides to the rules: which rule stands for each item

This table is our reading, not the guides'. For each item of section 2.6 it gives what the guides tell the patient to do, each sign the item names (in the guides' words), and the rule that raises the alert when a person describes that sign as their own. Where no rule does, the last column says why. The script that built this packet typed each sign into the rules, with "your" changed to "my", and checked the outcome.

| Code | Item of the guides (codes in 2.6) | What the guides tell the patient to do | Sign, in the guides' words | What raises the alert | Reason or note |
|----|--------------------|--------------------|--------------------|--------------------|----------------------------|
| K-01 | Thyroid tumors (I-01, I-13, I-24, I-35, I-46, I-57, I-68) | Tell, call or talk to the healthcare provider (no "right away") (all 7 guides). | "a lump or swelling in your neck" / "lump or swelling in your neck" | R-09 `thyroid` |   |
| K-02 |   |   | "hoarseness" | R-09 `thyroid` | Stays quiet when the person calls it slight ("a little hoarse"), unless they also say it has lasted. |
| K-03 |   |   | "trouble swallowing" | R-09 `thyroid` | Stays quiet when it is said of a pill ("hard to swallow this big pill"). |
| K-04 |   |   | "shortness of breath" | R-04 `anaphylaxis` |   |
| K-05 | The "Do not use" statement about thyroid cancer (I-02, I-14, I-25, I-36, I-47, I-58, I-69) | No instruction to contact anyone (all 7 guides). | Names no sign | No rule | It names no sign and tells the patient to contact no one: it says who must not use the medication. |
| K-06 | The pointer back to the first part of the guide (I-03, I-15, I-26, I-37, I-48, I-59, I-70) | No instruction to contact anyone (all 7 guides). | Names no sign | No rule | It only points back to the first part of the guide. |
| K-07 | Inflammation of the pancreas (pancreatitis) (I-04, I-16, I-27, I-41, I-49, I-60, I-71) | Tell or call the healthcare provider "right away" (all 7 guides). The instruction begins "Stop using" or "Stop taking". | "severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting" / "severe pain in your stomach area (abdomen) that will not go away, with or without vomiting" | R-02 `pancreatitis`, R-14 `abdominal_pain_severe`; the "Stomach pain" button at "Severe" | Severe stomach pain raises the card whether or not the person says it lasts. Stomach pain that lasts raises it whether or not the person calls it severe. |
| K-08 |   |   | "pain from your abdomen to your back" / "pain from your stomach area (abdomen) to your back" | R-02 `pancreatitis` |   |
| K-09 | Gallbladder problems (I-05, I-22, I-33, I-40, I-55, I-66, I-77) | Tell, call or talk to the healthcare provider (no "right away"): Wegovy, Wegovy pill; Saxenda. Tell or call the healthcare provider "right away": Ozempic; Rybelsus, Ozempic pill; Zepbound; Mounjaro; Foundayo. | "pain in your upper stomach (abdomen)" | R-08 `gallbladder`; the "Stomach pain" button at "Severe" |   |
| K-10 |   |   | "yellowing of skin or eyes (jaundice)" / "yellowing of your skin or eyes (jaundice)" | R-08 `gallbladder` |   |
| K-11 |   |   | "fever" | R-08 `gallbladder` | Any fever the person reports as their own raises the card, also without stomach pain. |
| K-12 |   |   | "clay-colored stools" | R-08 `gallbladder` |   |
| K-13 | Low blood sugar (I-06, I-18, I-29, I-43, I-50, I-61, I-74) | Tell, call or talk to the healthcare provider (no "right away"): Wegovy, Wegovy pill; Saxenda. No instruction to contact anyone: Ozempic; Rybelsus, Ozempic pill; Zepbound; Mounjaro; Foundayo. | "dizziness or light-headedness" | R-06 `hypoglycemia`, R-07 `dehydration`; the "Dizziness" button at "Severe" | Alone it raises the card through the rule for "feeling dizzy" (a sign of a serious allergic reaction in the guides), unless the person calls it slight. |
| K-14 |   |   | "sweating" | Alone: nothing. With another sign of the list: R-06 `hypoglycemia` | The guides list it as a sign of low blood sugar and give no instruction to call anyone for it; on its own it raises nothing, and it raises the card together with another sign of the list. |
| K-15 |   |   | "shakiness" | Alone: nothing. With another sign of the list: R-06 `hypoglycemia` | The guides list it as a sign of low blood sugar and give no instruction to call anyone for it; on its own it raises nothing, and it raises the card together with another sign of the list. |
| K-16 |   |   | "feeling jittery" | Alone: nothing. With another sign of the list: R-06 `hypoglycemia` | The guides list it as a sign of low blood sugar and give no instruction to call anyone for it; on its own it raises nothing, and it raises the card together with another sign of the list. It is counted as the same sign as shakiness. |
| K-17 |   |   | "blurred vision" | R-06 `hypoglycemia`, R-05 `vision` | Alone it raises the card through the rule for changes in vision. |
| K-18 |   |   | "slurred speech" | Alone: nothing. With another sign of the list: R-06 `hypoglycemia` | The guides list it as a sign of low blood sugar and give no instruction to call anyone for it; on its own it raises nothing, and it raises the card together with another sign of the list. |
| K-19 |   |   | "confusion or drowsiness" | Alone: nothing. With another sign of the list: R-06 `hypoglycemia` | The guides list it as a sign of low blood sugar and give no instruction to call anyone for it; on its own it raises nothing, and it raises the card together with another sign of the list. |
| K-20 |   |   | "fast heartbeat" | R-06 `hypoglycemia`, R-03 `chest_or_faint` | Alone it raises the card through the rule for a very rapid heartbeat (a sign of a serious allergic reaction in the guides). |
| K-21 |   |   | "weakness" | Alone: nothing. With another sign of the list: R-06 `hypoglycemia` | The guides list it as a sign of low blood sugar and give no instruction to call anyone for it; many people on these medications have it on an ordinary day, so it counts only next to a sign of the list that is not this common. |
| K-22 |   |   | "hunger" | Alone: nothing. With another sign of the list: R-06 `hypoglycemia` | The guides list it as a sign of low blood sugar and give no instruction to call anyone for it; many people on these medications have it on an ordinary day, so it counts only next to a sign of the list that is not this common. |
| K-23 |   |   | "headache" | Alone: nothing. With another sign of the list: R-06 `hypoglycemia` | The guides list it as a sign of low blood sugar and give no instruction to call anyone for it; many people on these medications have it on an ordinary day, so it counts only next to a sign of the list that is not this common. |
| K-24 |   |   | "anxiety" / "irritability or mood changes" / "anxiety, irritability, or mood changes" | Alone: nothing. With another sign of the list: R-06 `hypoglycemia` | The guides list it as a sign of low blood sugar and give no instruction to call anyone for it; many people on these medications have it on an ordinary day, so it counts only next to a sign of the list that is not this common. |
| K-25 | Dehydration leading to kidney problems (I-07, I-19, I-30, I-39, I-52, I-63, I-73) | Tell or call the healthcare provider "right away" (all 7 guides). | "nausea, vomiting, or diarrhea that does not go away" | R-07 `dehydration`; the "Nausea" button at "Severe", the "Vomiting" button at "Severe", the "Diarrhea" button at "Severe" | Vomiting or diarrhea also counts when it goes on all day or comes five times or more. Nausea counts only with words for "does not go away" or more than one day; "nauseous all day" stays quiet. |
| K-26 | Severe stomach problems (I-08, I-20, I-31, I-38, I-53, I-64, I-72) | Tell, call or talk to the healthcare provider (no "right away") (all 7 guides). | "stomach problems that are severe or will not go away" | R-14 `abdominal_pain_severe`, R-02 `pancreatitis`, R-07 `dehydration`; the "Stomach pain" button at "Severe", the "Nausea" button at "Severe", the "Vomiting" button at "Severe", the "Diarrhea" button at "Severe" | The rules read "stomach problems" as stomach pain, nausea, vomiting, diarrhea, constipation, bloating, heartburn and acid reflux. The buttons for constipation and acid reflux raise nothing. |
| K-27 | Serious allergic reactions (I-09, I-21, I-32, I-42, I-51, I-65, I-75) | Get medical help, or go to an emergency room, "right away" (all 7 guides). The instruction begins "Stop using" or "Stop taking". | "swelling of your face, lips, tongue or throat" / "swelling of your face, lips, tongue, or throat" | R-04 `anaphylaxis` |   |
| K-28 |   |   | "problems breathing or swallowing" | R-04 `anaphylaxis`, R-09 `thyroid` | Breathing is read by the allergic-reaction rule, swallowing by the rule that also stands for the thyroid item. |
| K-29 |   |   | "severe rash or itching" | R-04 `anaphylaxis` | A rash or itching raises the card when the person calls it severe, says it is all over the body or spreading, or names hives. A rash at the injection site stays quiet. |
| K-30 |   |   | "fainting or feeling dizzy" | R-03 `chest_or_faint`, R-07 `dehydration`; the "Dizziness" button at "Severe" | Dizziness stays quiet when the person calls it slight ("a little dizzy"). |
| K-31 |   |   | "very rapid heartbeat" | R-03 `chest_or_faint` | A racing or pounding heart raises the card also without "very", unless the person calls it slight ("heart racing a bit"). |
| K-32 | Changes in vision (I-10, I-17, I-28, I-44, I-54, I-76) | Tell, call or talk to the healthcare provider (no "right away") (Wegovy, Wegovy pill; Ozempic; Rybelsus, Ozempic pill; Zepbound; Mounjaro; Foundayo). | "changes in vision" | R-05 `vision` |   |
| K-33 | Increased heart rate (I-11, I-62) | Tell, call or talk to the healthcare provider (no "right away") (Wegovy, Wegovy pill; Saxenda). | "heart racing or pounding in your chest and it lasts for several minutes" | R-03 `chest_or_faint` | The rule does not ask how long it lasts. |
| K-34 | Food or liquid getting into the lungs during surgery or other procedures (I-12, I-23, I-34, I-45, I-56, I-67, I-78) | Tell, call or talk to the healthcare provider (no "right away") (all 7 guides). | Names no sign | No alert. The reminder rule R-11 `procedure` matches such text; it shows no alert in the first public version (2.1) | It names no sign: it asks the patient to tell every healthcare provider about the medication before a surgery or procedure. |

**The other instructions of the guides.** Outside the two parts, the guides tell the patient in a few more places to tell, call or talk to someone. None of these names a sign a person can notice. The app does not show them and raises no alert for them:

| Code | Kind of instruction | In the guides for | Example, word for word | What the app does |
|----|----------------|------------|------------------------------------|------------------------|
| K-35 | Before use condition (tell, call or talk to the healthcare provider (no "right away")) | all 7 guides | Wegovy, Wegovy pill: under "Before using WEGOVY, tell your healthcare provider if you have any other medical conditions, including if you:": "have or have had problems with your pancreas or kidneys." | No rule. A condition to tell the healthcare provider about before starting the medication, not a sign. |
| K-36 | Pregnancy (tell, call or talk to the healthcare provider (no "right away")) | Wegovy, Wegovy pill; Ozempic; Rybelsus, Ozempic pill; Zepbound; Mounjaro; Foundayo | Wegovy, Wegovy pill: under "Before using WEGOVY, tell your healthcare provider if you have any other medical conditions, including if you:": "are pregnant or plan to become pregnant. WEGOVY may harm your unborn baby. You should stop using WEGOVY 2 months before you plan to become pregnant." | No alert. The reminder rule R-10 `pregnancy` matches such text; it shows no alert in the first public version. Not a sign: something to tell the healthcare provider about. |
| K-37 | Pregnancy registry (tell, call or talk to the healthcare provider (no "right away")) | Wegovy, Wegovy pill; Zepbound; Foundayo | Wegovy, Wegovy pill: under "Before using WEGOVY, tell your healthcare provider if you have any other medical conditions, including if you:": "Pregnancy Exposure Registry: There is a pregnancy exposure registry for women who use WEGOVY during pregnancy. The purpose of this registry is to collect information about the health of you and your baby. Talk to your healthcare provider about how you can take part in this registry or you may contact Novo Nordisk at 1-877-390-2760 or www.wegovypregnancyregistry.com." | No alert. The reminder rule R-10 `pregnancy` matches such text; it shows no alert in the first public version. Not a sign: an invitation to take part in a registry. |
| K-38 | Breastfeeding (tell, call or talk to the healthcare provider (no "right away")) | all 7 guides | Wegovy, Wegovy pill: under "Before using WEGOVY, tell your healthcare provider if you have any other medical conditions, including if you:": "are breastfeeding or plan to breastfeed. Breastfeeding is not recommended during treatment with WEGOVY tablets. It is not known if WEGOVY when received through an injection passes into your breast milk. You should talk with your healthcare provider about the best way to feed your baby while using WEGOVY." | No alert. The reminder rule R-10 `pregnancy` matches such text; it shows no alert in the first public version. Not a sign: something to talk over with the healthcare provider. |
| K-39 | Birth control (tell, call or talk to the healthcare provider (no "right away")) | Zepbound; Mounjaro; Foundayo | Zepbound: under "Before using ZEPBOUND, tell your healthcare provider about all of your medical conditions, including if you:": "Birth control pills by mouth may not work as well while using ZEPBOUND. If you take birth control pills by mouth, your healthcare provider may recommend another type of birth control for 4 weeks after you start ZEPBOUND and for 4 weeks after each increase in your dose of ZEPBOUND. Talk to your healthcare provider about birth control methods that may be right for you while using ZEPBOUND." | No alert. The reminder rule R-12 `contraception` matches such text; it shows no alert in the first public version. Not a sign: something to talk over with the healthcare provider. The reminder rule applies to tirzepatide only. |
| K-40 | Medicines (tell, call or talk to the healthcare provider (no "right away")) | all 7 guides | Wegovy, Wegovy pill: under "Before using WEGOVY, tell your healthcare provider if you have any other medical conditions, including if you:": "Tell your healthcare provider about all the medicines you take, including prescription and over-the-counter medicines, vitamins, and herbal supplements. WEGOVY may affect the way some medicines work and some medicines may affect the way WEGOVY works. Tell your healthcare provider if you are taking other medicines to treat diabetes, including sulfonylureas or insulin. WEGOVY slows stomach emptying and can affect medicines that need to pass through the stomach quickly." | No rule. Not a sign: the patient is asked to tell the healthcare provider about other medicines. |
| K-41 | Diabetes medicines (tell, call or talk to the healthcare provider (no "right away")) | Ozempic; Rybelsus, Ozempic pill; Zepbound; Mounjaro; Saxenda; Foundayo | Ozempic: under "Before using OZEMPIC, tell your healthcare provider if you have any other medical conditions, including if you:": "Before using OZEMPIC, talk to your healthcare provider about low blood sugar and how to manage it. Tell your healthcare provider if you are taking other medicines to treat diabetes, including insulin or sulfonylureas." | No rule. Not a sign: the patient is asked to talk about low blood sugar and diabetes medicines before starting. |
| K-42 | Overdose (get medical help, or go to an emergency room, "right away") | all 7 guides | Wegovy, Wegovy pill: under "How should I use WEGOVY?": "If you take too much WEGOVY, you may have severe nausea, severe vomiting and severe low blood sugar. Call your healthcare provider or Poison Help line at 1-800-222-1222 or go to the nearest hospital emergency room right away. Advice is also available online at poisonhelp.org." | No rule. Taking too much is an event, not a sign, and the app has no rule for it; the guides say to call the healthcare provider or the Poison Help line, or to go to the nearest emergency room, right away. |
| K-43 | Missed doses (tell, call or talk to the healthcare provider (no "right away")) | Wegovy, Wegovy pill; Saxenda; Foundayo | Wegovy, Wegovy pill: under "How should I use WEGOVY?": "If you miss doses of WEGOVY for 2 or more consecutive weeks, contact your healthcare provider to talk about how to restart your treatment." | No rule. Not a sign. The app gives no advice about missed doses and has no rule for them. |
| K-44 | Side effects general (tell, call or talk to the healthcare provider (no "right away")) | all 7 guides | Wegovy, Wegovy pill: under "What are the possible side effects of WEGOVY?": "Talk to your healthcare provider about any side effect that bothers you or does not go away. These are not all the possible side effects of WEGOVY." | No rule. A general instruction about side effects, with no sign of its own. |

The one instruction among them that names an emergency room is the sentence about taking too much. In every guide, word for word:

| Code | Guide | The guide's words | Status |
|----|------------|----------------------------------------|----------------|
| K-45 | Wegovy, Wegovy pill | "If you take too much WEGOVY, you may have severe nausea, severe vomiting and severe low blood sugar. Call your healthcare provider or Poison Help line at 1-800-222-1222 or go to the nearest hospital emergency room right away. Advice is also available online at poisonhelp.org." | Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer |
| K-46 | Ozempic | "If you take too much OZEMPIC, call your healthcare provider or Poison Help line at 1-800-222-1222 or go to the nearest hospital emergency room right away." | Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer |
| K-47 | Rybelsus, Ozempic pill | "If you take too much RYBELSUS or OZEMPIC tablets, call your healthcare provider or Poison Help line at 1-800-222-1222, or go to the nearest hospital emergency room right away. Advice is also available online at poisonhelp.org." | Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer |
| K-48 | Zepbound | "If you take too much ZEPBOUND, call your healthcare provider or Poison Help line at 1-800-222-1222 or go to the nearest hospital emergency room right away." | Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer |
| K-49 | Mounjaro | "If you take too much MOUNJARO, call your healthcare provider or Poison Help line at 1-800-222-1222 or go to the nearest hospital emergency room right away." | Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer |
| K-50 | Saxenda | "If you take too much SAXENDA, call your healthcare provider or Poison Helpline at 1-800-222-1222 or go to the nearest hospital emergency room right away." | Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer |
| K-51 | Foundayo | "If you take too much FOUNDAYO, call your healthcare provider or Poison Help line at 1-800-222-1222 or go to the nearest hospital emergency room right away." | Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer |

### 2.8 From the rules to the guides: the basis of each rule

Every rule that shows an alert in the first public version must stand for an item of the guides, or carry the mark "general emergency sign, not from a Medication Guide" with the reason it is kept. A rule with neither would be taken out of the first public version. Today none is. An item is named here by a short name of ours; where it is not in every guide, the guides that have it follow in brackets.

| Rule | Alert in the first public version | Guide items it stands for | Parts with no guide behind them |
|------------|------------|--------------------------------|--------------------------------|
| R-01 `crisis` | Its own card | None | **General emergency sign, not from a Medication Guide**: the whole rule. None of the seven guides has an item about thoughts of self-harm; words about ending one's life are an emergency whatever the medication, and the rule shows its own card with the crisis line, not the fixed card. |
| R-02 `pancreatitis` | The fixed card | Inflammation of the pancreas (pancreatitis); Severe stomach problems |   |
| R-03 `chest_or_faint` | The fixed card | Low blood sugar; Serious allergic reactions; Increased heart rate (Wegovy, Wegovy pill; Saxenda) | **General emergency sign, not from a Medication Guide**: chest pain, pressure or tightness. No guide names chest pain; it is kept because chest pain can be an emergency whatever the medication. |
| R-04 `anaphylaxis` | The fixed card | Thyroid tumors; Serious allergic reactions |   |
| R-05 `vision` | The fixed card | Low blood sugar; Changes in vision (Wegovy, Wegovy pill; Ozempic; Rybelsus, Ozempic pill; Zepbound; Mounjaro; Foundayo) |   |
| R-06 `hypoglycemia` | The fixed card | Low blood sugar; Serious allergic reactions |   |
| R-07 `dehydration` | The fixed card | Low blood sugar; Dehydration leading to kidney problems; Severe stomach problems; Serious allergic reactions | **General emergency sign, not from a Medication Guide**: passing very little urine. The guides warn of "dehydration leading to kidney problems" but name no sign about urine; passing very little urine is kept as a sign of that dehydration. |
| R-08 `gallbladder` | The fixed card | Gallbladder problems |   |
| R-09 `thyroid` | The fixed card | Thyroid tumors; Serious allergic reactions |   |
| R-10 `pregnancy` | None | None as an alert. As a reminder it matches text about: pregnancy, pregnancy registry, breastfeeding (2.7) |   |
| R-11 `procedure` | None | None as an alert. As a reminder it matches text about: aspiration anesthesia (2.7) |   |
| R-12 `contraception` | None | None as an alert. As a reminder it matches text about: birth control (2.7) |   |
| R-13 `eating_too_little` | None | None | **Not from a Medication Guide**: the whole rule. No guide has an item about eating very little for days; the rule is a reminder of the full test build and shows no card in the first public version. |
| R-14 `abdominal_pain_severe` | The fixed card | Inflammation of the pancreas (pancreatitis); Gallbladder problems; Severe stomach problems | **General emergency sign, not from a Medication Guide**: blood in vomit or stool, and black or tarry stool. No guide names bleeding; it is kept because it is a stomach problem no one should wait on, whatever the medication. |

**The symptom buttons at "Severe"** (2.2), checked against the guides one by one:

| Code | Button | Rule it raises | Guide items it stands for, or why it raises nothing |
|----|------------|----------------|----------------------------------------|
| K-52 | Nausea | R-07 `dehydration` | Dehydration leading to kidney problems; Severe stomach problems |
| K-53 | Vomiting | R-07 `dehydration` | Dehydration leading to kidney problems; Severe stomach problems |
| K-54 | Heartburn or burping | None | Severe acid reflux is a stomach problem "that is severe"; for that item the guides say "tell your healthcare provider", without "right away", so the button was left as it was. |
| K-55 | Constipation | None | Severe constipation is a stomach problem "that is severe"; for that item the guides say "tell your healthcare provider", without "right away", so the button was left as it was. |
| K-56 | Diarrhea | R-07 `dehydration` | Dehydration leading to kidney problems; Severe stomach problems |
| K-57 | Stomach pain | R-14 `abdominal_pain_severe` | Inflammation of the pancreas (pancreatitis); Gallbladder problems; Severe stomach problems |
| K-58 | No appetite | None | No item of the two parts of the guides names it. |
| K-59 | Tiredness | None | No item of the two parts of the guides names it. |
| K-60 | Dizziness | R-07 `dehydration`, R-06 `hypoglycemia` | Low blood sugar; Serious allergic reactions |
| K-61 | Hair loss | None | No item of the two parts of the guides names it. |
| K-62 | Redness or swelling where you inject | None | No item of the two parts of the guides names it. |
| K-63 | Low mood | None | No guide has an item about mood; "irritability or mood changes" is listed only as a sign of low blood sugar. |
| K-64 | Period changes | None | No item of the two parts of the guides names it. |

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

At setup a US user picks one of 9 brands, or "Other / custom": Wegovy, Ozempic, Zepbound, Mounjaro, Wegovy pill, Foundayo, Rybelsus, Ozempic pill, Saxenda. Brand names are used only so that people can find their own medication. Trademarks belong to their owners. The app is not connected to any drug maker.

"Wegovy pill" and "Ozempic pill" are the names the app gives to the tablets sold under a brand name that is also a shot. They are separate rows, with the doses of the tablets.

How the app uses each number:

- **Dose steps.** Every dose of the adult schedule in section 2 of the label, from the starting dose up to the highest dose the label gives to any adult. A dose the label gives for one of its uses only is still a step, and the note in its row says who it is for. Only the first step is used: at setup it is the grey example in the box where a person types the dose they were prescribed ("For example, [first step]"). The app never suggests a step and never says when to move up.
- **Highest dose.** The highest dose the label gives to any adult. A typing check, nothing more. When a person types a dose in mg above this number, at setup or when logging a dose, the app asks once: "[amount] mg is more than the highest dose in the US prescribing information for [US brand] ([highest dose] mg). Did you type an extra digit? If it is correct, tap the button again." Then it lets them go on. The line names the US brand whose label the number is from; for a person whose medication has another brand name, or none, that is the US brand of the same medication. Doses in other units are not checked and never converted.
- **Half-life and time to peak.** Used only for the chart in section 5, and kept only for weekly shots. The chart needs one number for each. Our rule: Both numbers are read from section 12.3 (Pharmacokinetics) of the label, and from no other section. That section states a single value or a median: the app uses it. That section states only a range: the app uses the midpoint of the range. Days and weeks are turned into hours (1 day = 24 hours, 1 week = 168 hours).
- **Wait after a pill.** Kept only where the label states a waiting time. On the sheet where a pill is logged the app shows: "After your pill, wait at least [minutes] minutes before you eat, drink or take other oral medications." After the pill is logged, the main screen counts those minutes down: "Wait at least [minutes] more minutes before you eat, drink or take other oral medications". Both lines follow the label's sentence about the wait. The app says nothing about water. A pill logged with a time that is still to come starts no countdown.

**Where the numbers come from.** We read the numbers of every brand below on the current US prescribing information (the FDA label, as published on DailyMed) on 2026-11-22. For each number the table gives the label's own words, the label section and the label page. Words are copied as they stand; " \| " marks the line between two cells of a table row. Nobody outside our team has confirmed these numbers: that is what we ask of you here.

**In the first public version a number is used only when it was read from the label.** That holds for the chart and for the three other uses above: the dose example, the typing check and the wait after a pill. The app checks this by itself: a medication whose numbers do not all have their label words in the table below shows none of them and can only be logged. Today every brand below passes that check. The full test version uses every number below as it stands.

The label versions that were read:

| Label | Version | Effective date | DailyMed set id | Page |
|------------------------|----|--------|--------------------|--------------------------------|
| WEGOVY (semaglutide) injection, for subcutaneous use; WEGOVY (semaglutide) tablets, for oral use | 19 | 2026-06-18 | ee06186f-2aa3-4990-a760-757579d8f77b | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee06186f-2aa3-4990-a760-757579d8f77b |
| OZEMPIC (semaglutide) injection, for subcutaneous use | 20 | 2026-06-01 | adec4fd2-6858-4c99-91d4-531f5f2a2d79 | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=adec4fd2-6858-4c99-91d4-531f5f2a2d79 |
| ZEPBOUND (tirzepatide) Injection, for subcutaneous use | 40 | 2026-08-28 | 487cd7e7-434c-4925-99fa-aa80b1cc776b | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=487cd7e7-434c-4925-99fa-aa80b1cc776b |
| MOUNJARO (tirzepatide) Injection, for subcutaneous use | 40 | 2026-08-27 | d2d7da5d-ad07-4228-955f-cf7e355c8cc0 | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d2d7da5d-ad07-4228-955f-cf7e355c8cc0 |
| FOUNDAYO (orforglipron) tablets, for oral use | 10 | 2026-07-29 | 8ac446c5-feba-474f-a103-23facb9b5c62 | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8ac446c5-feba-474f-a103-23facb9b5c62 |
| RYBELSUS (semaglutide) tablets, for oral use; OZEMPIC (semaglutide) tablets, for oral use | 14 | 2026-01-30 | 27f15fac-7d98-4114-a2ec-92494a91da98 | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=27f15fac-7d98-4114-a2ec-92494a91da98 |
| SAXENDA (liraglutide) injection, for subcutaneous use | 22 | 2026-02-25 | 3946d389-0926-4f77-a708-0acb8153b143 | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=3946d389-0926-4f77-a708-0acb8153b143 |

Please write the correct value and the label section (for example "2.2" or "12.3") in the two blank columns. Leave a cell empty when the value in the app is right, and write "OK" in the label column. Where the app has no value, please give one from the label, or tell us that the label gives none.

#### Wegovy (semaglutide)

Label read: WEGOVY (semaglutide) injection, for subcutaneous use; WEGOVY (semaglutide) tablets, for oral use, version 19, effective 2026-06-18.

| Code | What | In the app | Where it comes from | Your correction | Label section |
|----|----------------|------------|------------------------------------------------|------------|--------|
| M-01 | Brand name | Wegovy | From code, not yet checked against the FDA label |   |   |
| M-02 | Generic name | semaglutide | From code, not yet checked against the FDA label |   |   |
| M-03 | How it is taken | Shot, under the skin | From code, not yet checked against the FDA label |   |   |
| M-04 | How often | Once a week | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Administer WEGOVY injection once weekly, on the same day each week, at any time of day, with or without meals." (section 2.1). Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee06186f-2aa3-4990-a760-757579d8f77b |   |   |
| M-05 | Dose steps (mg) | 0.25, 0.5, 1, 1.7, 2.4, 7.2 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Starting Dosage \| 1 through 4 \| 0.25 mg" (section 2.2, Table 1); "5 through 8 \| 0.5 mg" (section 2.2, Table 1); "9 through 12 \| 1 mg" (section 2.2, Table 1); "13 through 16 \| 1.7 mg" (section 2.2, Table 1); "The maintenance dosage of WEGOVY for weight reduction in adults is either 1.7 mg or 2.4 mg (recommended) injected subcutaneously once weekly." (section 2.2); "For patients who tolerate the 2.4 mg dosage for at least 4 weeks and additional weight reduction is clinically indicated, the dosage may be increased to a maximum dosage of 7.2 mg subcutaneously once weekly." (section 2.2). How the number follows: Table 1 gives the starting dose and the escalation steps for every approved use (weeks are in the middle column). The maintenance sentence adds 2.4 mg, and the sentence after it adds 7.2 mg. Note: The label gives 7.2 mg only under "Weight Reduction in Adults", as a further increase after at least 4 weeks on 2.4 mg. For cardiovascular risk reduction in adults, for MASH in adults and for pediatric patients aged 12 years and older the last step is 2.4 mg. A step is any dose of the label's adult schedule, also one the label gives for one use only. The label gives one schedule for every pen, vial and syringe of this brand. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee06186f-2aa3-4990-a760-757579d8f77b |   |   |
| M-06 | Highest dose for the typing check (mg) | 7.2 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "For patients who tolerate the 2.4 mg dosage for at least 4 weeks and additional weight reduction is clinically indicated, the dosage may be increased to a maximum dosage of 7.2 mg subcutaneously once weekly." (section 2.2). Note: Stated under "Weight Reduction in Adults" only. For cardiovascular risk reduction in adults, for MASH in adults and for pediatric patients aged 12 years and older the highest dose the label gives is 2.4 mg. The app uses this number only to catch a typing slip, so it takes the highest dose the label gives to any adult. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee06186f-2aa3-4990-a760-757579d8f77b |   |   |
| M-07 | Half-life used for the chart | 168 hours (7 days) | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "With an elimination half-life of approximately 1 week, semaglutide will be present in the circulation for about 5 to 7 weeks after the last injectable dose of 2.4 mg or 7.2 mg or oral dose of 25 mg." (section 12.3). The label states a single value, 1 week; the app uses 168 hours (7 days). Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee06186f-2aa3-4990-a760-757579d8f77b |   |   |
| M-08 | Time to peak used for the chart | 48 hours (2 days) | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Maximum concentration of semaglutide is reached 1 to 3 days post dose." (section 12.3). The label states a range, 1 to 3 days; the app uses 48 hours (2 days). Note: From the paragraph headed "WEGOVY Injection". The tablets have their own sentence (1 hour post dose). Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee06186f-2aa3-4990-a760-757579d8f77b |   |   |

Chart of the estimated medication level: drawn in the first public version; drawn in the full test version.

The dose example, the typing check: used in the first public version; used in the full test version.

#### Ozempic (semaglutide)

Label read: OZEMPIC (semaglutide) injection, for subcutaneous use, version 20, effective 2026-06-01.

| Code | What | In the app | Where it comes from | Your correction | Label section |
|----|----------------|------------|------------------------------------------------|------------|--------|
| M-09 | Brand name | Ozempic | From code, not yet checked against the FDA label |   |   |
| M-10 | Generic name | semaglutide | From code, not yet checked against the FDA label |   |   |
| M-11 | How it is taken | Shot, under the skin | From code, not yet checked against the FDA label |   |   |
| M-12 | How often | Once a week | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Administer OZEMPIC once weekly, on the same day each week, at any time of the day, with or without meals." (section 2.1). Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=adec4fd2-6858-4c99-91d4-531f5f2a2d79 |   |   |
| M-13 | Dose steps (mg) | 0.25, 0.5, 1, 2 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Initiate OZEMPIC with a dosage of 0.25 mg injected subcutaneously once weekly for 4 weeks." (section 2.2); "After 4 weeks on the 0.25 mg dosage, increase the dosage to 0.5 mg once weekly." (section 2.2); "If additional glycemic control is needed after at least 4 weeks on the:" (section 2.2); "0.5 mg dosage, the dosage may be increased to 1 mg once weekly." (section 2.2); "1 mg dosage, the dosage may be increased to 2 mg once weekly." (section 2.2). Note: The steps to 1 mg and 2 mg are printed under the heading for glycemic control. For adults with type 2 diabetes and chronic kidney disease the label gives a maintenance dose of 1 mg. The label gives one schedule for every pen, vial and syringe of this brand. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=adec4fd2-6858-4c99-91d4-531f5f2a2d79 |   |   |
| M-14 | Highest dose for the typing check (mg) | 2 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "The maximum recommended dosage is 2 mg once weekly." (section 2.2). Note: Printed under the heading for glycemic control. Section 13.1 names the same figure, 2 mg/week, as the maximum recommended human dose. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=adec4fd2-6858-4c99-91d4-531f5f2a2d79 |   |   |
| M-15 | Half-life used for the chart | 168 hours (7 days) | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "With an elimination half-life of approximately 1 week, semaglutide will be present in the circulation for about 5 weeks after the last dose." (section 12.3). The label states a single value, 1 week; the app uses 168 hours (7 days). Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=adec4fd2-6858-4c99-91d4-531f5f2a2d79 |   |   |
| M-16 | Time to peak used for the chart | 48 hours (2 days) | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Maximum concentration of semaglutide is reached 1 to 3 days post dose." (section 12.3). The label states a range, 1 to 3 days; the app uses 48 hours (2 days). Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=adec4fd2-6858-4c99-91d4-531f5f2a2d79 |   |   |

Chart of the estimated medication level: drawn in the first public version; drawn in the full test version.

The dose example, the typing check: used in the first public version; used in the full test version.

#### Zepbound (tirzepatide)

Zepbound and Mounjaro are one medication in the app. Each has the numbers of its own label, and where the two labels differ the numbers differ.

Label read: ZEPBOUND (tirzepatide) Injection, for subcutaneous use, version 40, effective 2026-08-28.

| Code | What | In the app | Where it comes from | Your correction | Label section |
|----|----------------|------------|------------------------------------------------|------------|--------|
| M-17 | Brand name | Zepbound | From code, not yet checked against the FDA label |   |   |
| M-18 | Generic name | tirzepatide | From code, not yet checked against the FDA label |   |   |
| M-19 | How it is taken | Shot, under the skin | From code, not yet checked against the FDA label |   |   |
| M-20 | How often | Once a week | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Administer ZEPBOUND once weekly at any time of day, with or without meals." (section 2.4). Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=487cd7e7-434c-4925-99fa-aa80b1cc776b |   |   |
| M-21 | Dose steps (mg) | 2.5, 5, 7.5, 10, 12.5, 15 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "The recommended starting dosage of ZEPBOUND for all indications is 2.5 mg injected subcutaneously once weekly for 4 weeks." (section 2.1); "After 4 weeks, increase the dosage to 5 mg injected subcutaneously once weekly." (section 2.1); "The dosage may be increased in 2.5 mg increments, after at least 4 weeks on the current dose [see Dosage and Administration (2.2)]." (section 2.1); "7.5 mg/0.5 mL" (section 3); "10 mg/0.5 mL" (section 3); "12.5 mg/0.5 mL" (section 3); "15 mg/0.5 mL" (section 3). How the number follows: Section 2.1 names 2.5 mg and 5 mg, then increases of 2.5 mg. 7.5, 10, 12.5 and 15 mg follow from that rule up to the maximum of 15 mg; each is a dose section 3 lists. Note: The label names 5 mg, 10 mg and 15 mg as maintenance doses for weight reduction; 2.5 mg is for starting only. The label gives one schedule for every pen, vial and syringe of this brand. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=487cd7e7-434c-4925-99fa-aa80b1cc776b |   |   |
| M-22 | Highest dose for the typing check (mg) | 15 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "The maximum dosage of ZEPBOUND for all indications is 15 mg injected subcutaneously once weekly." (section 2.2). Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=487cd7e7-434c-4925-99fa-aa80b1cc776b |   |   |
| M-23 | Half-life used for the chart | 132 hours (5.5 days) | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "The elimination half-life is approximately 5-6 days in patients with overweight or obesity, and in patients with OSA and obesity." (section 12.3). The label states a range, 5 to 6 days; the app uses 132 hours (5.5 days). Note: Section 10 (Overdosage) of this label speaks of "the half-life of tirzepatide of approximately 5 days". The app reads the pharmacokinetics section, 12.3, only, and that section gives the range. With the single value of section 10 the number would be 120 hours. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=487cd7e7-434c-4925-99fa-aa80b1cc776b |   |   |
| M-24 | Time to peak used for the chart | 24 hours (1 day) | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Following subcutaneous administration, the median time (range) to maximum plasma concentration of tirzepatide is 24 hours (8 to 72 hours)." (section 12.3). The label states a median, 24 hours; the app uses 24 hours (1 day). Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=487cd7e7-434c-4925-99fa-aa80b1cc776b |   |   |

Chart of the estimated medication level: drawn in the first public version; drawn in the full test version.

The dose example, the typing check: used in the first public version; used in the full test version.

#### Mounjaro (tirzepatide)

Mounjaro and Zepbound are one medication in the app. Each has the numbers of its own label, and where the two labels differ the numbers differ.

Label read: MOUNJARO (tirzepatide) Injection, for subcutaneous use, version 40, effective 2026-08-27.

| Code | What | In the app | Where it comes from | Your correction | Label section |
|----|----------------|------------|------------------------------------------------|------------|--------|
| M-25 | Brand name | Mounjaro | From code, not yet checked against the FDA label |   |   |
| M-26 | Generic name | tirzepatide | From code, not yet checked against the FDA label |   |   |
| M-27 | How it is taken | Shot, under the skin | From code, not yet checked against the FDA label |   |   |
| M-28 | How often | Once a week | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Administer MOUNJARO once weekly, any time of day, with or without meals." (section 2.2). Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d2d7da5d-ad07-4228-955f-cf7e355c8cc0 |   |   |
| M-29 | Dose steps (mg) | 2.5, 5, 7.5, 10, 12.5, 15 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "The recommended starting dosage of MOUNJARO is 2.5 mg injected subcutaneously once weekly [see Dosage and Administration (2.2)]." (section 2.1); "If additional glycemic control is needed, increase the dosage in 2.5 mg increments after at least 4 weeks on the current dose." (section 2.1); "5 mg/0.5 mL" (section 3); "7.5 mg/0.5 mL" (section 3); "10 mg/0.5 mL" (section 3); "12.5 mg/0.5 mL" (section 3); "15 mg/0.5 mL" (section 3). How the number follows: Section 2.1 names 2.5 mg, then increases of 2.5 mg. 5, 7.5, 10, 12.5 and 15 mg follow from that rule up to the adult maximum of 15 mg; each is a dose section 3 lists. Note: Each increase is for when more glycemic control is needed. The label names no maintenance dose. The label gives one schedule for every pen, vial and syringe of this brand. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d2d7da5d-ad07-4228-955f-cf7e355c8cc0 |   |   |
| M-30 | Highest dose for the typing check (mg) | 15 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "The maximum dosage of MOUNJARO is:" (section 2.1); "15 mg injected subcutaneously once weekly in adults." (section 2.1). Note: The same list gives 10 mg once weekly as the maximum for pediatric patients. The app is for adults. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d2d7da5d-ad07-4228-955f-cf7e355c8cc0 |   |   |
| M-31 | Half-life used for the chart | 120 hours (5 days) | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "The apparent population mean clearance of tirzepatide is 0.061 L/h with an elimination half-life of approximately 5 days, enabling once-weekly dosing." (section 12.3). The label states a single value, 5 days; the app uses 120 hours (5 days). Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d2d7da5d-ad07-4228-955f-cf7e355c8cc0 |   |   |
| M-32 | Time to peak used for the chart | 40 hours | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Following subcutaneous administration, the time to maximum plasma concentration of tirzepatide ranges from 8 to 72 hours." (section 12.3). The label states a range, 8 to 72 hours; the app uses 40 hours. Note: This label gives no median. The other tirzepatide label gives a median of 24 hours with the same range. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d2d7da5d-ad07-4228-955f-cf7e355c8cc0 |   |   |

Chart of the estimated medication level: drawn in the first public version; drawn in the full test version.

The dose example, the typing check: used in the first public version; used in the full test version.

#### Wegovy pill (semaglutide)

Label read: WEGOVY (semaglutide) injection, for subcutaneous use; WEGOVY (semaglutide) tablets, for oral use, version 19, effective 2026-06-18.

| Code | What | In the app | Where it comes from | Your correction | Label section |
|----|----------------|------------|------------------------------------------------|------------|--------|
| M-33 | Brand name | Wegovy pill | From code, not yet checked against the FDA label |   |   |
| M-34 | Generic name | semaglutide | From code, not yet checked against the FDA label |   |   |
| M-35 | How it is taken | Pill, by mouth | From code, not yet checked against the FDA label |   |   |
| M-36 | How often | Once a day | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Take one WEGOVY tablet orally once daily on an empty stomach in the morning with water (up to 4 ounces)." (section 2.1). Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee06186f-2aa3-4990-a760-757579d8f77b |   |   |
| M-37 | Dose steps (mg) | 1.5, 4, 9, 25 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Starting Dosage \| 1 through 30 \| 1.5 mg" (section 2.3, Table 2); "Dosage Escalation \| 31 through 60 \| 4 mg" (section 2.3, Table 2); "61 through 90 \| 9 mg" (section 2.3, Table 2); "Maintenance Dosage \| 91 and onward \| 25 mg" (section 2.3, Table 2). Note: The middle column of Table 2 counts days. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee06186f-2aa3-4990-a760-757579d8f77b |   |   |
| M-38 | Highest dose for the typing check (mg) | 25 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "The recommended maintenance dosage of WEGOVY tablets is 25 mg orally once daily." (section 2.3). How the number follows: The highest dose in the label's adult schedule. The label does not call it a maximum in section 2. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee06186f-2aa3-4990-a760-757579d8f77b |   |   |
| M-39 | Half-life used for the chart |   | Not in the app. The chart is for weekly shots only, so no number is kept for a medication taken every day |   |   |
| M-40 | Time to peak used for the chart |   | Not in the app. The chart is for weekly shots only, so no number is kept for a medication taken every day |   |   |
| M-41 | Wait after the pill (minutes) | 30 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "After taking a WEGOVY tablet, wait at least 30 minutes before eating food, drinking beverages or taking other oral medications [see Clinical Pharmacology (12.3)]." (section 2.1). Note: The label says "at least" 30 minutes. The wait covers food, beverages and other oral medications. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee06186f-2aa3-4990-a760-757579d8f77b |   |   |

Chart of the estimated medication level: not drawn in the first public version (the app has no half-life and time to peak for it); not drawn in the full test version.

The dose example, the typing check, the wait after a pill: used in the first public version; used in the full test version.

#### Foundayo (orforglipron)

Label read: FOUNDAYO (orforglipron) tablets, for oral use, version 10, effective 2026-07-29.

| Code | What | In the app | Where it comes from | Your correction | Label section |
|----|----------------|------------|------------------------------------------------|------------|--------|
| M-42 | Brand name | Foundayo | From code, not yet checked against the FDA label |   |   |
| M-43 | Generic name | orforglipron | From code, not yet checked against the FDA label |   |   |
| M-44 | How it is taken | Pill, by mouth | From code, not yet checked against the FDA label |   |   |
| M-45 | How often | Once a day | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Take FOUNDAYO orally once daily, with or without food." (section 2.1). Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8ac446c5-feba-474f-a103-23facb9b5c62 |   |   |
| M-46 | Dose steps (mg) | 0.8, 2.5, 5.5, 9, 14.5, 17.2 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "The starting dosage is 0.8 mg orally once daily." (section 2.1); "After at least 30 days on the 0.8 mg dosage, increase the dosage to 2.5 mg once daily." (section 2.1); "After at least 30 days on the 2.5 mg dosage, increase the dosage to 5.5 mg once daily." (section 2.1); "The dosage may be increased to the next dosage level (9 mg, 14.5 mg, or 17.2 mg once daily) after at least 30 days on the current dosage, based on treatment response and tolerability." (section 2.1). Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8ac446c5-feba-474f-a103-23facb9b5c62 |   |   |
| M-47 | Highest dose for the typing check (mg) | 17.2 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "The maximum dosage of FOUNDAYO is 17.2 mg once daily." (section 2.1). Note: Section 2.2 gives a lower maximum of 9 mg once daily when the tablet is used with a strong CYP3A4 inhibitor. The app does not know what other medicines a person takes. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8ac446c5-feba-474f-a103-23facb9b5c62 |   |   |
| M-48 | Half-life used for the chart |   | Not in the app. The chart is for weekly shots only, so no number is kept for a medication taken every day |   |   |
| M-49 | Time to peak used for the chart |   | Not in the app. The chart is for weekly shots only, so no number is kept for a medication taken every day |   |   |
| M-50 | Wait after the pill (minutes) |   | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Take FOUNDAYO orally once daily, with or without food." (section 2.1). How the number follows: The label states no waiting time before food, so the app shows no wait for this tablet. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8ac446c5-feba-474f-a103-23facb9b5c62 |   |   |

Chart of the estimated medication level: not drawn in the first public version (the app has no half-life and time to peak for it); not drawn in the full test version.

The dose example, the typing check: used in the first public version; used in the full test version.

#### Rybelsus (semaglutide)

Label read: RYBELSUS (semaglutide) tablets, for oral use; OZEMPIC (semaglutide) tablets, for oral use, version 14, effective 2026-01-30.

| Code | What | In the app | Where it comes from | Your correction | Label section |
|----|----------------|------------|------------------------------------------------|------------|--------|
| M-51 | Brand name | Rybelsus | From code, not yet checked against the FDA label |   |   |
| M-52 | Generic name | semaglutide | From code, not yet checked against the FDA label |   |   |
| M-53 | How it is taken | Pill, by mouth | From code, not yet checked against the FDA label |   |   |
| M-54 | How often | Once a day | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Take one RYBELSUS or OZEMPIC tablet orally once daily on an empty stomach in the morning with water (up to 4 ounces of water)." (section 2.1). Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=27f15fac-7d98-4114-a2ec-92494a91da98 |   |   |
| M-55 | Dose steps (mg) | 3, 7, 14 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Starting Dosage (Initiation Phase) (Days 1 to 30): The recommended starting dosage is 3 mg orally once daily (this dosage is not effective for glycemic control)." (section 2.2); "Days 31 to 60: Increase the dosage to 7 mg orally once daily." (section 2.2); "Additional glycemic control is needed, increase the dosage to 14 mg orally once daily." (section 2.2). Note: From the part of section 2.2 headed "RYBELSUS: Recommended Dosage". Section 2.1 says the two tablet brands on this label "are not substitutable on a mg-to-mg basis". Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=27f15fac-7d98-4114-a2ec-92494a91da98 |   |   |
| M-56 | Highest dose for the typing check (mg) | 14 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Additional glycemic control is needed, increase the dosage to 14 mg orally once daily." (section 2.2). How the number follows: The highest dose in the label's adult schedule. The label does not call it a maximum in section 2. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=27f15fac-7d98-4114-a2ec-92494a91da98 |   |   |
| M-57 | Half-life used for the chart |   | Not in the app. The chart is for weekly shots only, so no number is kept for a medication taken every day |   |   |
| M-58 | Time to peak used for the chart |   | Not in the app. The chart is for weekly shots only, so no number is kept for a medication taken every day |   |   |
| M-59 | Wait after the pill (minutes) | 30 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "After taking RYBELSUS or OZEMPIC tablets, wait at least 30 minutes before eating food, drinking beverages or taking other oral medications [see Clinical Pharmacology (12.3)]." (section 2.1). Note: The label says "at least" 30 minutes. The wait covers food, beverages and other oral medications. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=27f15fac-7d98-4114-a2ec-92494a91da98 |   |   |

Chart of the estimated medication level: not drawn in the first public version (the app has no half-life and time to peak for it); not drawn in the full test version.

The dose example, the typing check, the wait after a pill: used in the first public version; used in the full test version.

#### Ozempic pill (semaglutide)

Label read: RYBELSUS (semaglutide) tablets, for oral use; OZEMPIC (semaglutide) tablets, for oral use, version 14, effective 2026-01-30.

| Code | What | In the app | Where it comes from | Your correction | Label section |
|----|----------------|------------|------------------------------------------------|------------|--------|
| M-60 | Brand name | Ozempic pill | From code, not yet checked against the FDA label |   |   |
| M-61 | Generic name | semaglutide | From code, not yet checked against the FDA label |   |   |
| M-62 | How it is taken | Pill, by mouth | From code, not yet checked against the FDA label |   |   |
| M-63 | How often | Once a day | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Take one RYBELSUS or OZEMPIC tablet orally once daily on an empty stomach in the morning with water (up to 4 ounces of water)." (section 2.1). Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=27f15fac-7d98-4114-a2ec-92494a91da98 |   |   |
| M-64 | Dose steps (mg) | 1.5, 4, 9 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Starting Dosage (Initiation Phase) (Days 1 through 30): The recommended starting dosage is 1.5 mg orally once daily (this dosage is not effective for glycemic control)." (section 2.2); "Days 31 to 60: Increase the dosage to 4 mg orally once daily." (section 2.2); "Additional glycemic control is needed, increase the dosage to 9 mg orally once daily." (section 2.2). Note: From the part of section 2.2 headed "OZEMPIC Tablets: Recommended Dosage". Section 2.1 says the two tablet brands on this label "are not substitutable on a mg-to-mg basis". Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=27f15fac-7d98-4114-a2ec-92494a91da98 |   |   |
| M-65 | Highest dose for the typing check (mg) | 9 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Additional glycemic control is needed, increase the dosage to 9 mg orally once daily." (section 2.2). How the number follows: The highest dose in the label's adult schedule. The label does not call it a maximum in section 2. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=27f15fac-7d98-4114-a2ec-92494a91da98 |   |   |
| M-66 | Half-life used for the chart |   | Not in the app. The chart is for weekly shots only, so no number is kept for a medication taken every day |   |   |
| M-67 | Time to peak used for the chart |   | Not in the app. The chart is for weekly shots only, so no number is kept for a medication taken every day |   |   |
| M-68 | Wait after the pill (minutes) | 30 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "After taking RYBELSUS or OZEMPIC tablets, wait at least 30 minutes before eating food, drinking beverages or taking other oral medications [see Clinical Pharmacology (12.3)]." (section 2.1). Note: The label says "at least" 30 minutes. The wait covers food, beverages and other oral medications. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=27f15fac-7d98-4114-a2ec-92494a91da98 |   |   |

Chart of the estimated medication level: not drawn in the first public version (the app has no half-life and time to peak for it); not drawn in the full test version.

The dose example, the typing check, the wait after a pill: used in the first public version; used in the full test version.

#### Saxenda (liraglutide)

Label read: SAXENDA (liraglutide) injection, for subcutaneous use, version 22, effective 2026-02-25.

| Code | What | In the app | Where it comes from | Your correction | Label section |
|----|----------------|------------|------------------------------------------------|------------|--------|
| M-69 | Brand name | Saxenda | From code, not yet checked against the FDA label |   |   |
| M-70 | Generic name | liraglutide | From code, not yet checked against the FDA label |   |   |
| M-71 | How it is taken | Shot, under the skin | From code, not yet checked against the FDA label |   |   |
| M-72 | How often | Once a day | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "Inject SAXENDA subcutaneously once daily at any time of day, without regard to the timing of meals." (section 2.1). Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=3946d389-0926-4f77-a708-0acb8153b143 |   |   |
| M-73 | Dose steps (mg) | 0.6, 1.2, 1.8, 2.4, 3 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "1 \| 0.6 mg" (section 2.2, Table 1); "2 \| 1.2 mg" (section 2.2, Table 1); "3 \| 1.8 mg" (section 2.2, Table 1); "4 \| 2.4 mg" (section 2.2, Table 1); "5 and onward \| 3 mg" (section 2.2, Table 1). Note: The first column of Table 1 is the week, the second the daily dose. These are the doses one pen can be set to; the pen has a single strength. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=3946d389-0926-4f77-a708-0acb8153b143 |   |   |
| M-74 | Highest dose for the typing check (mg) | 3 | Read from the FDA label on 2026-11-22; not yet confirmed by a reviewer. Label words: "For adults, the recommended dosage of SAXENDA is 3 mg daily, lower dosages are for titration only." (section 2.2). How the number follows: The highest dose in the label's adult schedule. Section 8.1 names 3 mg/day as the maximum recommended human dose. Label page: https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=3946d389-0926-4f77-a708-0acb8153b143 |   |   |
| M-75 | Half-life used for the chart |   | Not in the app. The chart is for weekly shots only, so no number is kept for a medication taken every day |   |   |
| M-76 | Time to peak used for the chart |   | Not in the app. The chart is for weekly shots only, so no number is kept for a medication taken every day |   |   |

Chart of the estimated medication level: not drawn in the first public version (the app has no half-life and time to peak for it); not drawn in the full test version.

The dose example, the typing check: used in the first public version; used in the full test version.

**Tirzepatide without a brand name.** A person whose saved medication is tirzepatide with neither of the names Zepbound and Mounjaro (for example a profile from another country) gets the dose example and the typing check, which are the same on both labels, but no chart: the app does not choose between the two labels. In place of the chart the app says why (section 5.4). A person in the United States is told where to choose the brand; the chart is then drawn.

**Other / custom.** The person types the name of the medication. The app has no numbers for it, so there is no typing check and no chart.

## 5. The estimated medication level: method and wording

The chart shows a rough picture of how much medication is in the body over time, worked out from the doses the person logged and from two numbers of the label (section 4). The same two numbers are used for every person on a medication. It is an estimate, not a measurement. It has no unit, and the app says it cannot be used to adjust a dose.

In the first public version the chart is drawn only for a medication whose numbers in section 4 were all read from the FDA label. Today that is: Wegovy, Ozempic, Zepbound, Mounjaro. Medications with a half-life and a time to peak in the code: Wegovy, Ozempic, Zepbound, Mounjaro. Medications without them, which never get a chart: Wegovy pill, Foundayo, Rybelsus, Ozempic pill, Saxenda. The chart is designed for weekly shots; medications taken every day have no numbers for it on purpose.

### 5.1 The model, as the code has it

One compartment, with first-order absorption and first-order elimination (the Bateman function). For one dose, t hours after it was taken:

```
B(t) = ka / (ka - ke) x ( e^(-ke x t) - e^(-ka x t) )        B(t) = 0 before the dose
```

- **ke** = ln 2 / half-life. The half-life and the time to peak are the single numbers of section 4, taken from the label by the rule given there.
- **ka** is not read from a label. It is solved so that B(t) is highest exactly at the time to peak: ln(ka / ke) / (ka - ke) = time to peak.
- **All logged doses are added up:** Level(t) = sum of (dose in mg x B(t - time of that dose)).
- **The number on screen** is 100 x Level(t) / Peak, rounded to a whole number. Peak is the highest Level in one dosing interval after 20 doses of the *most recently logged dose*, taken exactly on the schedule the person set. So 100 means "the highest point after long-term use of the dose you logged last".
- **The chart** covers the last 14 days (solid line) and the next 7 days (dashed line), one point every 3 hours. The dashed part assumes the person takes the same dose at each planned time from now on. A planned time that has passed without a logged dose is not counted: an overdue dose is left out until the person logs it, and the dashed part goes on from the next planned time on the same rhythm. So the dashed line starts where the solid line ends. When the status is not "Increasing dose" or "Maintenance dose", the dashed part has no future doses and only falls.
- No factor turns a dose into a concentration (no absorbed fraction, volume or clearance). The result is a relative number only.

### 5.2 What the model does with the numbers in section 4

The first two rows are the numbers of section 4. Every other value was worked out by running the code and is not from a label. They are here so you can judge whether the picture is believable.

|   | Wegovy, Ozempic | Zepbound | Mounjaro |
|--------------------------------|----------------|----------------|----------------|
| Half-life in the app | 168 hours (7 days) | 132 hours (5.5 days) | 120 hours (5 days) |
| Time to peak in the app | 48 hours (2 days) | 24 hours (1 day) | 40 hours |
| Schedule used here | One dose a week | One dose a week | One dose a week |
| ke (per hour) | 0.00413 | 0.00525 | 0.00578 |
| ka (per hour), solved from the time to peak | 0.05984 | 0.14291 | 0.06708 |
| Absorption half-life that follows from ka | 11.6 hours | 4.9 hours | 10.3 hours |
| Check: one dose alone peaks after | 48 hours | 24 hours | 40 hours |
| After long-term use, the peak comes this long after a dose | 35.5 hours | 20 hours | 32 hours |
| Number shown right before the next dose, after long-term use (the peak is 100) | 62 | 48 | 50 |
| Highest number after the very first dose | 47 | 57 | 59 |
| Doses at the same amount until the peak reaches 90 or more | 4 | 3 | 3 |
| After the last dose: time until the number is under 50 | 9.2 days | 6.7 days | 7 days |
| After the last dose: time until the number is under 25 | 16.2 days | 12.2 days | 12 days |
| After the last dose: time until the number is under 5 | 32.5 days | 24.9 days | 23.6 days |

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
| P-01 | Everyone on a medication is treated as the same person, with the two numbers of section 4. Body weight, kidney function, age, injection site and other medications change nothing. |
| P-02 | One compartment only. Absorption and elimination are both first-order. |
| P-03 | The half-life is one number and the time to peak is one number, both read from section 12.3 of the label only. Where that section gives only a range, the app uses its midpoint (section 4); a midpoint is not an average and is not a figure the label prints. The absorption rate is solved from the time to peak and is not checked against anything else. |
| P-04 | Doses add up in a straight line: twice the dose gives twice the level. |
| P-05 | There is no absorbed fraction, volume or clearance in the model, so there is no concentration. Only a relative number is shown. |
| P-06 | The scale changes with the dose: 100 is always the long-term peak of the dose logged last (see the example in 5.2). Numbers from before and after a dose change cannot be compared. |
| P-07 | The long-term peak is worked out for 20 doses taken exactly on the schedule the person set, sampled every half hour. |
| P-08 | Only doses logged in mg are used. Doses logged in units, mL or clicks are left out and never converted. |
| P-09 | When a person says at setup that they have been on their current dose for several weeks, the chart assumes earlier doses of the same amount on schedule (one for each of those weeks, 8 at most). They are used only for the chart and are not saved as records. |
| P-10 | A dose that was taken but not logged is missing from the chart. A dose logged at the wrong time is used as logged. |
| P-11 | A planned dose that is overdue is not in the dashed part (5.1). The dashed line then shows what happens if that dose is not taken and the next planned one is. The app gives no advice about a missed dose. |
| P-12 | Medications without a half-life and time to peak in the app get no chart: Wegovy pill, Foundayo, Rybelsus, Ozempic pill, Saxenda. |
| P-13 | Wegovy and Ozempic are separate entries in the app but use the same half-life and time to peak. |
| P-14 | Zepbound and Mounjaro contain the same ingredient but are drawn with different numbers, because their labels word the half-life and the time to peak differently (section 4). The same doses give a different line for each brand. |
| P-15 | The chart is not used by any other rule. The danger-symptom rules, the dose-increase period and the reminders do not read it. |

### 5.4 Exact wording on screen

Next to the title the app shows one whole number with no unit, for example 78. It is the latest point of the solid line.

| Code | Where | Exact wording |
|----|--------------------|----------------------------------------|
| S-01 | Title of the chart | Estimated medication level |
| S-02 | Under the small chart on the main screen | An estimate based on numbers from US prescribing information. It is not a measurement and cannot be used to adjust your dose. |
| S-03 | Under the large chart | The last 14 days and the next 7 days. The solid line is what has happened. The dashed line assumes you take your planned doses from now on. A planned dose that is overdue is not counted until you log it. 100 = the highest point after long-term use of this dose. |
| S-04 | Link under the large chart ("How this is calculated") opens this text. It is shown here as a person on Wegovy sees it; the name and the two numbers are those of the person's own medication (section 4) | The chart uses a standard model of how the body takes in and clears a medication (first-order absorption and elimination). The model needs two numbers. The half-life is the time the body takes to clear half of a dose. The time to peak is the time from a dose to the highest level. Both come from the pharmacokinetics section of the US prescribing information for Wegovy. For Wegovy the chart uses a half-life of 168 hours and a time to peak of 48 hours. Where that section gives one value or a median, the chart uses it. Where it gives only a range, the chart uses the middle of the range. The chart uses these same two numbers for every person on this medication. They are not measured in you. People absorb and clear medication at very different speeds. Only doses you logged in mg are used. This line is an estimate. It only helps you picture roughly where the medication level is. It is not a lab measurement and cannot be used to adjust your dose. |
| S-05 | In place of the chart in the first public version, when the medication has no chart (a medication taken every day, a medication that is not on the list, or one whose numbers were not all read from the label) | An estimate for this medication is not available yet. |
| S-06 | In place of the chart, in both versions, when the saved medication is tirzepatide with neither of the names Zepbound and Mounjaro and the person is in the United States, where the list offers both | The chart uses two numbers from US prescribing information, and they are stated differently for Zepbound and Mounjaro. So the chart needs to know your brand. To choose it, go to Me and tap "Change medication or redo setup". |
| S-07 | The same, for a person whose list does not offer the two names (another country, or "Other") | No chart for this medication yet. The chart uses two numbers from US prescribing information, and they are stated differently for Zepbound and Mounjaro. The app does not choose between them. |
| S-08 | On the main screen and in place of the large chart when the medication has no chart (full test version) | No chart for this medication. The chart is drawn only for weekly shots that have a half-life and a time to peak from US prescribing information. |
| S-09 | In place of the large chart when the medication has a chart but no dose has been logged in mg yet | After you log semaglutide or tirzepatide shots in mg, an estimated medication level chart will show here. |
| S-10 | On the sheet where a dose is logged | Only the number you enter is saved. Units are not converted. The estimated medication level chart uses only doses logged in mg. |
| S-11 | Line at the bottom of the main screens in the first public version | This app is a logging tool. It is not a medical device and does not give medical advice. Talk to your doctor before making decisions about your medication. Not affiliated with any drug maker. |
| S-12 | Line at the bottom of the main screens in the full test version | For information only. This is not medical advice. Talk to your doctor before you change your medication or your workouts. |

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
| Q-01 | The dose steps, the highest dose, the half-life, the time to peak and the wait after a pill in section 4 were read from the current US labels by us on 2026-11-22. Nobody outside our team has confirmed them. Please check each row against the label words quoted next to it and against the label itself, and give the label section. The brand names, the generic names and how each medication is taken have not been checked against a label. | `src/core/catalog.ts` line 10 |
| Q-02 | The trigger phrases, the level of each rule and the English card texts in section 2 have never been reviewed. Which danger signs are missing? Which rules sit at the wrong level? Which card text could harm or mislead a person? | `src/core/triage.ts` line 4, 88, 902 |
| Q-03 | The emergency number on the cards is marked as still to be verified. For a US user it is 911. On which cards is "call 911" the wrong instruction, and what should those cards say? | `src/core/triage.ts` line 772 |
| Q-04 | The crisis line on the self-harm card is marked as still to be verified. For a US user the card says "crisis line 988". Is that the right line, and the right way to name it? | `src/core/triage.ts` line 794, 805 |
| Q-05 | Section 2.6 holds the warning signs of each Medication Guide as the app shows them. A script copied them from the label files on 2026-11-22 and a second script checked the copy; no reviewer has compared them with the guides. Please check each list against the current guide. Is any item missing, changed or out of order? Is any guide out of date? | `src/core/medGuide.ts` line 41 |
| Q-06 | The tables in sections 2.7 and 2.8 are our reading of the guides: how we read each instruction ("right away" or not), which rule stands for which sign, and the reason where no rule does. Which rows are wrong? | `src/core/guideCoverage.ts` line 21 |
| Q-07 | The coping cards in section 3.1 must be reviewed before they are shown. Is any line wrong or unsafe? Is anything missing under "See a doctor if"? Are the two sources named under each card the right ones to name? | `src/web/content/coping.ts` line 3, 5 |
| Q-08 | The daily advice texts in section 3.2 wait for review. Is any text wrong or unsafe for a person on these medications? Is any text shown in the wrong situation? | `src/web/content/advice.ts` line 2, 4, 55 |
| Q-09 | The workouts in section 3.3 need review of the exercises and the amounts by a qualified professional. Are you the right person for that part? If not, please say so and leave it out of your quote. | `src/web/content/workouts.ts` line 3, 5 |
| Q-10 | The general notice at the bottom of the main screens (last row of section 5.4) waits for review. Does it say what it should? | `src/web/content/labels.ts` line 25 |
| Q-11 | The protein formula and its cut-offs in section 6.1 wait for a dietitian or doctor to confirm them. Are the 60 g floor, the 1.0, 1.2 to 1.5 and 2.0 g per kg lines, the BMI line of 28 and the adjusted weight right for adults on these medications? Who else should get no automatic target? | `src/core/protein.ts` line 6 |
| Q-12 | The protein values in section 6.2 are rough and were meant to be checked against the China Food Composition Table. For a US user, which rows are wrong, and which reference should we use instead? | `src/core/foods.ts` line 2 |
| Q-13 | The weight cut-offs in section 6.3 are product choices, not taken from a guideline: regain of 3% and 5% above the lowest point, and a drop of more than 1.5% a week for two weeks. Are they reasonable? Is the text at each line right? | `src/core/weight.ts` line 3 |

### 7.2 Questions that came up while this packet was put together

| Code | Question |
|----|------------------------------------------------------------|
| Q-14 | In the first public version a person can report a danger sign in two ways only: with a symptom button (section 2.2), or by typing it where the app checks typed text (section 2.3). No button leads to R-01 `crisis`, R-02 `pancreatitis`, R-03 `chest_or_faint`, R-04 `anaphylaxis`, R-05 `vision`, R-08 `gallbladder`, R-09 `thyroid`, R-10 `pregnancy`, R-11 `procedure`, R-12 `contraception`, R-13 `eating_too_little`. Which danger signs need their own button before launch? |
| Q-15 | In the first public version R-10 `pregnancy`, R-11 `procedure`, R-12 `contraception`, R-13 `eating_too_little` show no alert (section 2.1): their own cards are hidden until reviewed, and the fixed card with its call button does not fit a reminder. A person who types text that matches only these rules sees nothing. Is that acceptable for the first public version? If one of them needs to show something at launch, which one, and what should it say? |
| Q-16 | An alert raised from the box for questions for the doctor leaves no reminder on the main screen once it is closed (section 2), while an alert from a symptom button stays at the top for the rest of the day. In the first public version that box is the only way to raise R-01 `crisis`, R-02 `pancreatitis`, R-03 `chest_or_faint`, R-04 `anaphylaxis`, R-05 `vision`, R-08 `gallbladder`, R-09 `thyroid`. Is it acceptable that these alerts are shown once and then gone? |
| Q-17 | The first public version shows one fixed card for every sign: "Contact your doctor right away", with the call button (2.1). For these items the guides say only "tell your healthcare provider", for some medications or for all (2.7), so the card says more than the guide: thyroid tumors; gallbladder problems; low blood sugar; severe stomach problems; changes in vision; increased heart rate. Is one card for all of them acceptable? And is "contact your doctor right away" strong enough where the guides say "get medical help right away" (serious allergic reactions)? |
| Q-18 | For inflammation of the pancreas (pancreatitis) and for serious allergic reactions the guides' instruction begins "Stop using" or "Stop taking". The fixed card does not say that: the app gives no advice about doses. The button under the card opens the guide's own words (2.6). Is that enough? |
| Q-19 | The app shows two parts of each Medication Guide: the most important information and the serious side effects (2.6). Is that the right selection? Should it also show the sentence about taking too much (2.7), or the list of the most common side effects, so that a person does not take the short list for the whole guide? |
| Q-20 | These rules, or parts of rules, raise an alert although no Medication Guide names the sign (2.8): R-01 `crisis`: the whole rule; R-03 `chest_or_faint`: chest pain, pressure or tightness; R-07 `dehydration`: passing very little urine; R-14 `abdominal_pain_severe`: blood in vomit or stool, and black or tarry stool. Is each of them right to keep? Is a sign of this kind missing? |
| Q-21 | For low blood sugar the guides list signs but, for most medications, give no instruction to call anyone. The rule R-06 `hypoglycemia` fires on the words "low blood sugar" and on two signs together; hunger, headache, weakness and anxiety or mood changes count only next to another sign (2.4). Is two the right number? Should any single sign raise the alert on its own, for example slurred speech or confusion? Should a blood sugar reading raise it, and below what number ("my blood sugar was 60" stays quiet today)? |
| Q-22 | Where a guide names a sign without saying how bad it must be, the rules fire on the plain word: any fever, any hoarseness, any dizziness, a racing heart, any change in vision (2.4). Dizziness, a racing heart and hoarseness stay quiet only when the person calls them slight. Is that too wide, or right for a reminder that is meant to come once too often? |
| Q-23 | For nausea, vomiting and diarrhea the guides say "that does not go away". The rules read that as: vomiting or diarrhea that keeps on, lasts all day, or comes five times or more; nausea only with words for more than one day ("nauseous all day" stays quiet, "nauseous for 4 days" fires). Are these lines in the right place? |
| Q-24 | Two symptom buttons were added to the ones that raise an alert at "Severe" (2.2, 2.8): nausea, because the guides name it with vomiting and diarrhea, and dizziness for every person, because "fainting or feeling dizzy" is a sign of a serious allergic reaction in every guide and no other button leads there. Severe nausea is common on these medications. Is an alert for it right? The buttons for constipation and acid reflux raise nothing, while the typed words "severe constipation" do. Which way should both go? |
| Q-25 | A match does not count when the text is about someone else, about a time long past, or a general question (2.3). So "my son can't breathe" and "what are the signs of low blood sugar?" raise nothing. Is that acceptable? The lists in section 2.5 show where the line sits. |
| Q-26 | The guides tell the patient to call the healthcare provider or the Poison Help line, or to go to an emergency room, right away after taking too much, and to call after missing doses for some time (2.7). The app has no rule for either, and typed words such as "I took a double dose" raise nothing. Should they raise the alert? The fixed card does not name the Poison Help line. |
| Q-27 | The label file of the guide for Rybelsus, Ozempic pill has a space missing in one sentence the app shows ("RYBELSUS andOZEMPIC tablets"), and the app shows it as the file has it. Should the app keep it so, or is there a cleaner official text to copy from? |
| Q-28 | Several cards name a possible cause (pancreas, gallbladder, allergic reaction, blood sugar). Is it right to name a cause at all? Is it the right cause for every phrase that triggers the rule? One example: "short of breath" alone shows the card "This may be a serious allergic reaction". |
| Q-29 | The pregnancy card R-10 `pregnancy` quotes the semaglutide label to every user, whatever medication they take. What should it say to a person on one of the other medications in section 4? |
| Q-30 | The birth control reminder R-12 `contraception` is shown only when the medication is tirzepatide (Zepbound, Mounjaro). Is that right? Does any other medication in section 4 need a reminder of this kind? |
| Q-31 | The number on the chart can drop right after a dose increase, because 100 is tied to the dose logged last (example in section 5.2). Could that mislead a person? Would a fixed scale be safer? |
| Q-32 | After a late weekly dose the app shows the next dose on the usual weekday when that is at least 72 hours away (section 6.5). The app gives no advice about missed doses, but it does show this date. Is 72 hours a safe line for every weekly medication in section 4? |
| Q-33 | The app shows a wait after a pill for Wegovy pill, Rybelsus, Ozempic pill, and none for Foundayo (section 4). The labels say to wait "at least" that long before eating food, drinking beverages or taking other oral medications, and the app's two lines now say the same. The labels also say to take the tablet with water, "up to 4 ounces"; the app says nothing about water. Is the wording right for each of them? Should the app also say how to take the tablet (empty stomach, in the morning, how much water)? |
| Q-34 | For every brand the app takes the highest dose the label gives to any adult. It is the limit of the typing check and the last dose step. For these brands the label gives that dose to some patients only, or gives a lower one to others. Wegovy, 7.2 mg: Stated under "Weight Reduction in Adults" only. For cardiovascular risk reduction in adults, for MASH in adults and for pediatric patients aged 12 years and older the highest dose the label gives is 2.4 mg. The app uses this number only to catch a typing slip, so it takes the highest dose the label gives to any adult. Ozempic, 2 mg: Printed under the heading for glycemic control. Section 13.1 names the same figure, 2 mg/week, as the maximum recommended human dose. Mounjaro, 15 mg: The same list gives 10 mg once weekly as the maximum for pediatric patients. The app is for adults. Foundayo, 17.2 mg: Section 2.2 gives a lower maximum of 9 mg once daily when the tablet is used with a strong CYP3A4 inhibitor. The app does not know what other medicines a person takes. Is that the right way to treat these doses, for the typing check and for the list of steps? |
| Q-35 | Where a label gives only a range for the half-life or the time to peak, the chart uses the midpoint of the range (section 4). That is the case for: Wegovy, time to peak: the label gives 1 to 3 days and the app uses 48 hours (2 days); Ozempic, time to peak: the label gives 1 to 3 days and the app uses 48 hours (2 days); Zepbound, half-life: the label gives 5 to 6 days and the app uses 132 hours (5.5 days); Mounjaro, time to peak: the label gives 8 to 72 hours and the app uses 40 hours. Is the midpoint a fair single number for a rough chart of this kind? Would you take another value from the label? |
| Q-36 | Zepbound and Mounjaro contain the same ingredient, but the chart uses different numbers for each, because their labels word them differently: Zepbound half-life 132 hours (5.5 days), time to peak 24 hours (1 day); Mounjaro half-life 120 hours (5 days), time to peak 40 hours. Zepbound: Section 10 (Overdosage) of this label speaks of "the half-life of tirzepatide of approximately 5 days". The app reads the pharmacokinetics section, 12.3, only, and that section gives the range. With the single value of section 10 the number would be 120 hours. Should the two brands be drawn differently? If not, which numbers should both use? |
| Q-37 | The app lists the tablets of a brand that is also a shot under its own name: "Wegovy pill", "Ozempic pill". Could a person pick the wrong row, and so see the dose example and the highest dose of the other form? Is "pill" the right word for these tablets? |
| Q-38 | The typing check calls its limit "the highest dose in the US prescribing information for" the brand (section 4). Is the highest dose on the label the right limit for this check, and is that a fair name for it? For Wegovy pill, Rybelsus, Ozempic pill, Saxenda the label does not call that dose a maximum in section 2; the app uses the highest dose of the label's schedule. A person whose medication has another brand name, or none, is shown the name of the US brand of the same medication. Is that clear enough? |
| Q-39 | A person can check "A history of an eating disorder" at setup (section 6.7). Almost nothing changes when they do. What should the app do differently for them, for example with the goal weight, the weight chart or the fast-drop line? |

### 7.3 Anything else

Please add anything you saw that no question covers. A short note with the item code is enough.

