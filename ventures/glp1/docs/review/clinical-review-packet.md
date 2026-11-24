<!-- Built by app/scripts/build-review-packet.ts (pnpm review-packet). Do not edit by hand: change the code or the script and build again. -->

# [APP NAME]: clinical review packet

From [COMPANY LEGAL NAME] · Contact: [CONTACT EMAIL] · Sent on [EFFECTIVE DATE]

Packet version `236b80f3`. This file is built by a script from the code of the app, so the texts and numbers in it are the ones the app uses. Text in "quotation marks" is exact app text, or a phrase a person might type. Words in [square brackets] are filled in by the app or by us.

About 59,900 words with 772 coded items: about 158 pages in a compact print layout, about 255 pages as a plain Word file.

| Section | What it holds | Size | In the first public version |
|----|--------------------|----------------------------|------------------------|
| 1 | What this is and what we ask of you | 1 page |   |
| 2 | Danger-symptom rules | 15 rules, 17 card texts, 248 trigger patterns, 621 example phrases; 7 Medication Guide lists with 78 items, and 31 signs set against the rules | Alerts show one fixed card; 4 rules of a mild level show nothing (2.1). They come from the symptom buttons (2.2) and from typed text (2.3). The Medication Guide lists (2.6) are shown |
| 3 | Coping cards, daily advice, workouts | 4 coping cards (34 lines), 17 daily advice texts, 3 workouts (15 exercises) | Hidden until reviewed |
| 4 | US medication list | 9 brands, 76 rows, 63 numbers to check (all with their label words, from 7 labels) | The names are shown. The dose example, the typing check and the wait after a pill are used: every number was read from the label |
| 5 | Estimated medication level: method and wording | 15 assumptions, 12 screen texts | Chart shown for Wegovy, Ozempic, Zepbound, Mounjaro |
| 6 | Other numbers that need a clinical eye | 31 cut-offs and rules, 12 food values, 17 sentences with numbers | Protein target and food values are hidden until reviewed. Dose timing, injection sites and the setup questions are live |
| 7 | Open questions | 41 questions |   |

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

If time is short, please start with sections 4, 2 and 5. They cover what a US user sees in the first public version. A short packet built from the same code, clinical-review-core.md, holds only those parts.

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
| 2 | `emergency` | R-02 `pancreatitis`, R-03 `chest_or_faint`, R-04 `anaphylaxis`, R-05 `vision`, R-15 `overdose` |
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

Under the card there is one more button, "See the warning signs in the Medication Guide". It opens the list of section 2.6 for the person's own medication: always the whole list, never one item of it, because the app does not say which item a person may have. The crisis card has no such button, and neither does an alert for a person whose medication is "Other / custom": the app has no Medication Guide for it.

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

The hits of "Nausea" and "Dizziness" (only users who did not check the insulin or sulfonylurea box at setup, see 6.7) are marked to show the fixed card of section 2.1 even where each rule shows its own card (2.3): the card written for R-07 `dehydration` speaks of vomiting and diarrhea, not of nausea or dizziness. In the first public version every alert shows the fixed card anyway.

No button leads to these rules: R-01 `crisis`, R-02 `pancreatitis`, R-03 `chest_or_faint`, R-04 `anaphylaxis`, R-05 `vision`, R-08 `gallbladder`, R-09 `thyroid`, R-10 `pregnancy`, R-11 `procedure`, R-12 `contraception`, R-13 `eating_too_little`, R-15 `overdose`. Only typed text can raise them (2.3).

### 2.3 Alerts from typed text: how the rules read it

Typed text is checked in these places:

| Where a person types | In the full test version | In the first public version |
|----------------------------------------|------------|------------|
| The note box at the bottom of the main screens, where a person types what happened (a dose, a weight, how they feel). | Yes | No |
| The box at the top of the list of questions for the doctor, where a person writes down a question for their next visit. The question is saved as typed and the alert is shown over it. | No | Yes |

**So the phrase rules below are live in the first public version.** A match there shows the alert of section 2.1, or nothing when the text matches only rules that show no alert there (also 2.1).

The text is checked as a whole, before anything else is done with it. Capital letters do not matter, spaces at the start and the end are dropped, and curly apostrophes, as phones type them ("can’t"), are read as straight ones. Each rule is a list of phrase patterns. Section 2.4 gives every pattern in plain words, with examples that the script that built this packet ran through the real rules. The app also has Chinese phrase lists. They are not part of this review.

**The phrase rules are a backstop.** They will miss some of the ways people put a symptom into words: on phrases written by people who had not seen the patterns, they missed some that should raise an alert. The reliable part is the word-for-word list of warning signs from the Medication Guide (2.6), which a person can open at any time.

**Misspellings.** Before any rule looks at the text, a fixed list of misspellings and voice-typing slips is read as the word that was meant. Every entry is a spelling written out in the code. The list, in plain words: "passd out", "pased out" and "past out" (but not "past out of", "past out the", "past out front", "past out back" or "past out to"), and "passed-out", are read as "passed out"; "fanted", "fainetd" and "faintd" as "fainted" ("feinted" is a real word and is left as it is); "lost conscience" and "lost my conscience" as "lost consciousness"; "conciousness", "consiousness", "conciousnes", "consciousnes" and "conscousness" as "consciousness"; "unconcious" and "unconsious" as "unconscious"; "chestpain" and "chestpian" (also with "s") as "chest pain"; "chess", "cheat", "chset", "chets", "chst" or "cehst" followed by "pain", "pains", "pian", "hurt", "hurts", "tightness" or "pressure" as "chest" plus that word; "chest pian", "chest pane" and "chest paim" as "chest pain"; "chset", "chets" and "cehst" as "chest"; "pian" as "pain"; "tounge", "toungue", "tonuge", "tongu" and "tung" as "tongue"; "swolen" (and other spellings with one or more "l") as "swollen"; "sweling" (the same) as "swelling"; "throte", "throath", "thoat" and "troat" as "throat"; "breth", "brethe", "brething", "breeth", "breethe" and "breething" (any number of "e") as "breath", "breathe" and "breathing"; "vomitting", "vommiting" (and other spellings with one or more "m" and "t") as "vomiting", and the same for "vomited"; "throwin" and "pukin" as "throwing" and "puking"; "throne up" as "threw up"; "diarrhea" written with letters missing, doubled or changed ("diarea", "diarhea", "dyarea", "diarrhia") as "diarrhea", and so are the voice-typing slips "die a rear", "dia rhea", "dye a rear" and the like; "naseous", "nasious", "nautious", "nauseas", "nauscious", "nausous", "nasueous", "nauesous" and "nauseaous" as "nauseous"; "nausia", "nasea", "nausa", "nausua" and "nausae" as "nausea"; "servere", "sevre", "sevear", "seveer", "severre" and "sevier" as "severe"; "sever" as "severe" when a word that starts with one of these follows: "pain", "stomach", "abdom", "abd", "belly", "tummy", "nause", "vomit", "diarr", "rash", "itch", "cramp", "head", "constip", "bloat", "heartburn", "chest", "dizz", "allerg", "reaction", "swell", "dehydr"; "shakey" as "shaky"; "bloodsugar" and "bloodsugars" as "blood sugar" and "blood sugars"; "vission", "visoin" and "vison" as "vision"; "sucide", "sucidal", "suiside", "suicde", "siucide" and the like ("s", then "u", "ui" or "iu", then "c" or "s", perhaps "i", then "de" or "dal") as "suicide" or "suicidal"; "horse" before "voice" or "throat", and "horse" after "voice" plus one to three of the words "is", "sound", "sounds", "got", "went", "has been", "feels", "still", "so", "really", "very", "all", "a little" and "kinda" ("voice is so horse"), as "hoarse"; "horsness", "hoarsness" and "horseness" as "hoarseness"; "hivs" as "hives"; "pancriatitis", "panreatitis", "pancreatatis", "pancreatitus" and the like as "pancreatitis"; "siezure", "seisure" and "seziure" (also with "s") as "seizure" ("seizer" is a real word and is left as it is); "dizy" as "dizzy"; "diziness", "dizyness" and "dizzyness" as "dizziness"; "stomac", "stumach", "stomich", "stomack", "stomch" and "stomahc" as "stomach"; "stummy" and "stumy" as "tummy"; "stomach", "belly", "tummy", "abdomen" or "chest" followed by "pane", "paint" or "payne" (also with "s") as that word plus "pain"; "abdomin" as "abdomen"; "yella" as "yellow". A short list of Spanish words for the key signs: "dolor de pecho" as "chest pain"; "dolor de estómago" (also without the accent), "dolor de barriga" and "dolor de panza" as "stomach pain"; "duele mucho" and "duele demasiado" (also with "me") as "hurts so bad"; "estómago" as "stomach"; "vomitando" as "vomiting"; "todo el día" as "all day"; "ojos amarillos" (also "los ojos amarillos", "mis ojos amarillos", and "amarillo" or "amarillos" before "ojos") as "yellow eyes"; "hipoglucemia" as "hypoglycemia"; "sudando" as "sweating"; "no puedo respirar" as "I can't breathe"; "me desmayé" (also without the accent) as "I fainted". So "I past out", "my tounge is swolen", "servere stomach pian", "chess pain", "throne up all day", "dolor de pecho" and "vomitando todo el dia" trigger, and "the boxer feinted left" does not (checked). The examples in section 2.4 are written as the patterns read them.

**Fast typing, shorthand and other words.** Then a letter held down counts once ("awayyy" is "away", "baaad" is "bad"), or twice where English doubles it ("e", "o", "l", "s" and "f" at the end of a word: "tooo" is "too"; also "t", "p", "r", "m", "n", "d", "g", "c", "b" and "z" inside a word). Then shorthand, contractions written out, medical words and regional words are read as plain words, each written out in the code: "cannot" and "can not" are read as "can't", "could not" as "couldn't", "will not" as "won't"; "n/v/d" as "nausea and vomiting and diarrhea", "n/v" as "nausea and vomiting", "v/d" as "vomiting and diarrhea" (spaces may stand around the slashes); "w/o" as "without"; "w/" as "with"; "sob" as "short of breath" (not before "story", "stories", "sister" or "sisters"); "cp" as "chest pain"; "bp" as "blood pressure"; "ruq" as "upper right quadrant"; "low bs" as "low blood sugar", and "bs" as "blood sugar" before "is", "was", "at", "of", "dropped", "dropping", a word that starts with "crash" or "tank", "went", "read", "reads", "reading", "low" or a number from 10 to 69; "er" as "emergency room" after "the", "an", "to", "in", "at" or "from", and "ER" in capitals anywhere; "od" as "overdose" after "I", "to", "gonna", "might", "may", "could", "did", "accidentally", "almost" or "nearly"; "abt" as "about"; "r" as "are" and "n" as "and", between two words; "u" as "you" between spaces; "cnt" as "can't"; "2nite" and "tonite" as "tonight"; "nite" as "night"; "2day" as "today"; "tmr", "tmrw", "tmw", "tomoro" and "tomorow" as "tomorrow"; "rn" as "right now"; "thru" as "through"; "str8" as "straight"; "hrs" as "hours"; "wk" and "wks" as "weeks"; "rly" as "really"; "soo" as "so"; "mon", "tue", "tues", "wed", "thu", "thurs", "fri", "sat" and "sun" as the day's full name after "since", "on", "last", "this", "from", "til", "till" or "until"; a dropped final "g" on a short list of verbs: "lookin", "feelin", "gettin", "goin", "hurtin", "comin", "peein", "shakin", "sweatin", "bleedin", "burnin", "killin", "dyin", "breathin", "havin", "passin", "faintin", "swellin", "itchin", "crampin", "achin", "throbbin", "poundin", "racin", "keepin", "drinkin", "eatin", "takin", "startin", "tankin", "crashin", "droppin", "shiverin", "tremblin", "vomitin", "heavin", "chokin", "wheezin", "gaspin", "droopin", "slurrin", "jerkin", "seizin", "convulsin", "stabbin", "bloatin" and the like (also with an apostrophe) as the "-ing" word; medical words: "hematemesis" as "vomiting blood"; "emesis" as "vomiting"; "melena" as "black tarry stool"; "dyspnea" and "dyspnoea" as "shortness of breath"; "syncopal" (also "syncopal episode", "event" or "spell") as "fainting"; "angina" as "chest pain"; "TIA" in capitals, and "tia" after "a", "had", "have" or "having", as "mini stroke"; "biliary colic" as "gallbladder attack"; "insulin reaction" as "low blood sugar"; "fingerstick" and "finger stick" as "blood sugar"; regional words: "upchucking" as "throwing up" and "upchuck", "upchucked" as "threw up"; "passed water" as "peed", "pass water" and "passing water" as "peeing"; "scant" as "very little"; "took a spell" (also "a bad spell") as "fainted"; "something fierce", "something awful" and "something terrible" as "so bad"; "dried out" after "feel", "feeling", "felt", "I'm", "im", "I am", "so", "really" or "all" as "dehydrated"; "make out" after "can't" or "couldn't" as "see". Last, 32 long key words are read also when one letter is wrong, missing, added, or swapped with the next one: "seizure", "seizures", "seizing", "collapsed", "collapse", "collapsing", "unconscious", "unresponsive", "vomiting", "vomited", "breathe", "breathing", "swallow", "swallowing", "swollen", "convulsing", "convulsions", "fainted", "fainting", "paralyzed", "ambulance", "palpitations", "overdose", "overdosed", "dehydrated", "jaundice", "hypoglycemia", "anaphylaxis", "suicidal", "suicide", "pancreatitis", "emergency". Only a word of six letters or more that starts with the same letter counts, and these real words that are that close are left as they are: "feinted", "feinting", "fainter", "painted", "sizing", "seining", "seizer", "breather", "breathed", "breathes", "breathy", "shallow", "sallow", "swallows", "shallowing", "breath", "breaths", "overdone", "overdoes", "emergence", "emergent", "convulsion", "collapses", "collapsed", "vomits", "suicides". So "sob since the shot", "cp radiating to back", "n/v/d since sat not stopping", "i keep thinking abt hurting myself", "stomache pain wont go awayyy", "I have had hematemesis twice today.", "colapsed at work" and "sezure this morning" trigger, and "sob story from my boss", "that steak was overdone" and "deep breaths helped" do not (checked).

**Other languages, small words left out, voice typing.** Then the ways many people really write are read as plain words, each written out in the code: words of Spanish, Tagalog and Vietnamese mixed into English, family words in Arabic written in Latin letters, English without its small words, voice-typing slips and signs told by what they look like. A word of another language is read only where it cannot be an English word, and a voice-typing slip only next to the key word it belongs with. The list, in plain words: Spanish: "quiero morir", "quiero morirme", "quisiera morir" (also with "me" before) and "me quiero morir" are read as "I want to die"; "quiero" or "voy a" (also with "me" before) plus "matarme", "suicidarme", "matar" or "suicidar" as "I want to kill myself"; "dolor fuerte", "dolor muy fuerte", "fuerte dolor", "muy fuerte dolor" and "mucho dolor" as "severe pain", and "dolor" alone as "pain"; "azúcar" or "glucosa" (also "azucar") plus "baja", "bajo" or "bajita" (also with "muy" between), and "baja de azúcar", "bajo de azúcar" and "bajón de azúcar" (also without the accents), as "low blood sugar"; "me inyecté doble", "me puse doble" and "tomé doble" (also with "una", or "dosis doble" or "doble dosis" for "doble", also without the accents), and "doble dosis" or "dosis doble" alone, as "I took a double dose"; "me inyecté" (also "inyecte") as "I injected"; "pecho" as "chest"; "barriga", "panza" and "vientre" as "belly"; "corazón" (also "corazon") as "heart"; "azúcar" (also "azucar") as "sugar"; "amarillo", "amarilla", "amarillos" and "amarillas" as "yellow"; "mareado", "mareada", "mareo" and "mareos" as "dizzy"; "vómito", "vómitos", "vomité" and "vomitar" (also without the accents) as "vomiting"; "falta el aire", "falta de aire" and "falta aire" (also with "me" before) as "short of breath"; Spanish family words: "esposo" and "marido" as "husband"; "esposa" as "wife"; "mamá", "mama" and "madre" as "mom"; "papá", "papa" and "padre" as "dad"; "hijo" as "son"; "hija" as "daughter"; "hermano" as "brother"; "hermana" as "sister"; "abuela" and "abuelita" as "grandma"; "abuelo" and "abuelito" as "grandpa"; "tía" (also "tia") as "aunt"; "tío" (also "tio") as "uncle"; "suegra" as "mother-in-law"; "suegro" as "father-in-law"; "mi" and "mis" before a word (not after a number: "3 mi") as "my"; "tiene" as "has"; "tengo" as "I have"; Tagalog: "gusto ko mamatay", "gusto kong mamatay" (also with "na" or "nang" before "mamatay") and "ayoko na mabuhay" (also "nang") as "I want to die"; "magpakamatay" (also after "gusto ko" and the like) as "I want to kill myself"; "sakit ng tiyan", "masakit ang tiyan", "sakit sa tiyan" and "tiyan ko masakit" and the like (also "tyan", and with "ko" or "ay") as "stomach pain"; the same with "dibdib" as "chest pain"; "tiyan" and "tyan" as "stomach"; "dibdib" as "chest"; "nanginginig" as "shaking"; "pinagpapawisan", "pawisan" and "pawis" as "sweating"; "nahihilo" as "dizzy"; "nahimatay" as "fainted"; "nagsusuka" and "sumusuka" as "vomiting"; "hirap huminga" and "hirap sa paghinga" as "trouble breathing"; "mababa sugar" (also "asukal", "ang", and "ko" after) and "sugar ko mababa" (also "asukal", and "ay") as "my blood sugar is low"; "asawa ko" as "my spouse"; "nanay ko" and "inay ko" as "my mom"; "tatay ko" and "itay ko" as "my dad"; "anak ko" and "kapatid ko" as "my child"; "tita" as "aunt"; "tito" as "uncle"; "lola" as "grandma"; "lolo" as "grandpa"; Vietnamese: "muốn chết" (also with "tôi", "em" or "tui" before) as "I want to die"; "tự tử" as "suicide"; "đau bụng", "bụng đau" (also "bụng tôi đau", "bụng em đau") and "dau bung" as "stomach pain"; the same with "ngực" ("dau nguc") as "chest pain"; "bụng" as "belly"; "ngực" as "chest"; "dữ lắm", "dữ dội", "quá trời", "quá chừng", "rất nhiều", "quá" and "lắm" as "so bad"; "đau" as "pain"; "chóng mặt" as "dizzy"; "ói mửa", "nôn mửa", "ói" and "nôn" as "vomiting"; "xỉu", "ngất" and "ngất xỉu" (also with "bị") as "fainted"; "khó thở" as "trouble breathing"; "vàng da" as "yellow skin"; "mắt vàng" as "yellow eyes"; "hạ đường huyết", "đường huyết thấp" and "đường thấp" as "low blood sugar"; "chồng tôi" (also "em" or "tui" for "tôi") as "my husband"; "vợ tôi" as "my wife"; "mẹ tôi" and "má tôi" as "my mom"; "bố tôi", "ba tôi" and "cha tôi" as "my dad"; "con tôi" (also "con trai tôi", "con gái tôi") as "my child"; Arabic family words written in Latin letters: "zawji" as "my husband"; "zawjati" as "my wife"; "ummi" as "my mom"; "ibni" and "binti" as "my child". Voice-typing slips, read only next to their key word: "through up" after "been", "keep", "keeps", "kept", "am", "I'm", "is", "are", "was", "were", "start", "started", "stop" or "still" as "throwing up", and anywhere else (not before "to", "the", "a", "until", "till" or "and including") as "threw up"; "to many" and "to much" as "too many" and "too much" after "took", "taken", "take", "taking", "injected", "inject", "injecting", "used", "use", "did", "gave myself", "give myself", "dialed", "dial", "clicked", "click", "put", "pushed", "push", "drew up" or "draw up" (also with "way" or "far" between), and before "of my", "of the", "of it", "of them", "units", "clicks", "pills", "tablets", "doses", "shots", "injections", "mg", "insulin", "medicine" or "medication"; "lost", "lose", "loose", "losing" or "loosing" plus "conscious" or "consciousness" (also with "my") as "lost consciousness"; "and" as "in" between "lump", "bump", "knot", "swelling", "ball", "pain", "ache", "pressure" or "tightness" and "my" or "the" plus "neck", "throat", "chest", "stomach", "belly", "abdomen" or "tummy" ("a lump and my neck"). English without its small words: "troubles", "problem", "problems", "difficulty" or "difficulties", plus "to", "for", "in" or "with", before a word that starts with "breath", as "trouble" ("troubles to breathe"); "trouble to" before such a word as "trouble"; "not go away", "no go away", "never goes away" and the like, when no helping verb such as "did", "does", "will", "can" or "is" stands before, as "won't go away"; "is", "it's", "its", "it", "that" or "which" plus "not going", when "away", "to", "out", "anywhere", "back", "home", "in", "well", "so", "too", "as", "like", "for", "on", "great", "good", "bad", "down", "up", "through", "with" or "by" does not follow, as "not going away"; "no stop" and "no stopping" as "not stopping" (not before "sign", "signs", "light", "lights", "at", "in", "for", "by", "on", "over" or "here"); "no strength" and "no power" as "weak"; "no feeling" and "no sensation" as "numb"; "no air" as "can't get air" (not "no air conditioning", "no air fryer" and the like); "urine", "pee" or "peeing" plus "almost", "nearly", "basically" or "like", plus "nothing", "none" or "zero" (also with "is" or "was") as "very little urine"; "keep" or "hold" plus "anything", "nothing", "food", "water", "it", "liquid", "liquids", "fluid" or "fluids" plus "in my stomach" (also "belly", "tummy", "the", or no "my") as that verb and word plus "down"; "everything", "all", "food", "water" or "it all", plus "come", "comes", "coming", "came", "go", "goes", "going" or "went", plus "up" (also "back up", "right up"), as "everything comes back up" (not before "with", "to", "on", "for", "in", "at", "the", "and down", "roses", "short", "empty", "clean", "fine", "positive", "negative", "normal", "clear", "good", "great", "ok" or "okay"); "come", "comes", "coming", "came", "going", "goes", "went", "pouring" or "pours", plus "out" (perhaps with "of" or "from"), plus "both ends" or "top and bottom", as "vomiting and diarrhea"; "abdominal", "ab", "gut", "side", "back", "neck", "throat" or "kidney" plus "pane" or "payne" (also with "s") as that word plus "pain"; "ab" before "pain", "pains", "hurt", "hurts", "hurting", "ache", "aches", "cramp", "cramps" or "cramping" as "abdominal"; "sever" as "severe", unless "the", "a", "an", "my", "his", "her", "their", "its", "it", "them", "ties", "all", "relation", "relations", "connection", "connections", "contact", "ways", "link" or "links" follows; "pain", "pains", "ache", "aches", "cramp", "cramps", "cramping", "hurt", "hurts" or "hurting" plus "strong" (up to three of "is", "are", "was", "so", "very", "too", "really", "super" and "real" between) as that word plus "so bad"; "strong" (also "very", "so", "really" or "super strong") before "pain", "pains", "ache", "aches", "cramp", "cramps" or "cramping" as "severe"; "very much pain" as "so much pain"; "go", "goes", "going", "went", "fall", "falls" or "fell", plus "to" or "on" (perhaps with "down" before and "the" after), plus "floor", as that verb plus "down on the floor"; "on", "to", "in" or "at" plus "floor", "ground", "hospital", "emergency room" or "urgent care", with no "the", as the same with "the"; "wake up", "wakes up" and "waking up" before "on the floor" or "on the ground" (also with "lying" or "laying", and one word before "floor" or "ground") as "woke up"; "I faint" and "we faint" (also with "just", "also", "almost", "nearly", "sometimes", "then", "suddenly", "kind of" or "kinda" between) as "I fainted", but not after "if", "when", "whenever", "in case", "afraid", "scared", "worried" or "that", and not before "of heart", "smell", "sound", "light", "line", "glow", "hope", "memory", "idea", "trace" or "feeling"; "squeeze", "squeezy" and "squeezed" as "squeezing" before "feeling", "sensation", "pain" or "pressure", or before "in", "on", "around" or "across" plus "chest" (also with "my" or "the"); "sugar", "sugars", "glucose", "bg", "blood sugar" or "blood sugars" (not after "a", "an", "the", "that", "this" or "of"), plus "drop", "drops", "crash", "crashes", "tank", "tanks", "fall", "falls", "fell", "go down", "goes down" or "went down", as that word plus "dropped", when the end of the sentence, a comma, a number, "to", "now", "again", "fast", "quick", "quickly", "hard", "low", "into", "below", "down", "under" or "at" follows ("sugar drop to 49"; not "sugar crash after cake"); "want", "wish", "ready", "going", "plan", "planning", "try", "trying", "decide" or "decided", plus "die", "kill myself", "hurt myself", "end it" or "end my life", as the same with "to" between ("I want die"); "off", "from" or "in front of", before "bridge", "roof", "building", "balcony", "overpass", "cliff", "ledge", "train" or "tower", as the same with "a" between ("jump from bridge"); "pain", "pains", "it" or "ache" plus "go", "move", "run", "spread" or "shoot", before "to" or "into" plus "back" or "spine" (also with "my" or "the"), as that word plus "goes". Signs told by what they look like: within about 25 characters after "skin", "eye", "eyes", "eyeball", "eyeballs", "face" or "whites" (not across a comma), "lemon", "lemons", "mustard", "banana", "bananas", "egg yolk", "egg yolks", "yolk", "yolks", "highlighter", "highlighters", "canary", "turmeric" or "curry" (perhaps after "like", "a", "an", "the", or "color of" or "colour like", and perhaps with "color", "colour" or "colored" after) as "yellow" ("my eyes look like lemon color"); "face", "body", "hands" or "palms", before one or two of "is", "are", "got", "turned", "turning", "look", "looks", "looking", "going", "went", "became" or "gone" plus "yellow" (perhaps with "so", "very" or "really"), as that word plus "skin"; "caca", "kaka", "popo", "poopoo" and "dumi" as "poop"; "foggy", "misty", "smoky", "milky", "smeary" or "smudgy" within about 30 characters after "eye", "eyes", "vision", "sight", "see", "seeing", "everything looks" or "everything look", or within about 30 characters before "eye", "eyes", "vision" or "sight", as "blurry"; within about 15 characters after "eye", "eyes", "vision" or "sight", "can't focus", "cannot focus", "won't focus", "not focus", "no focus" or "don't focus" (also "focusing", and "good", "well" or "right" after) and "like looking through a dirty glass" (also "foggy", "wet", "frosted", "smudged" or "greasy", and "window" or "lens") as "blurry"; "ball", "marble", "pea", "golf ball" or "bulge" within about 20 characters after "neck" or "throat", and "ball", "marble", "pea" or "bulge" before "inside", "in", "on" or "under" plus "neck" or "throat" (also with "my" or "the"), as "lump"; "neck" (also "my neck") plus "has", "have", "got" or "with", plus "lump", "bump", "knot", "swelling" or "mass" (perhaps with "a" before and "inside", "in it" or "on it" after) as "a lump in my neck" (or that word); the same with "throat" as "a lump on my throat"; "lump", "bump", "knot" or "mass" plus "in" or "on" plus "throat area" or "throat region" (also "my" or "the") as that word plus "on my throat"; "found", "noticed", "discovered", "see" or "saw", plus "lump", "bump", "knot" or "mass" (also "a"), plus "in my throat" (also "the"), as that verb plus "a ... on my throat"; "voice" plus "frog", "croaking", "sandpaper", "gravel" or "gravelly" (perhaps with "is", "sound", "sounds", "sounding", "became" or "become", "like" and "a" between) as "voice is hoarse". So "quiero morirme", "sakit ng tiyan ko super bad since morning, no stop", "đau bụng quá trời, cannot stand, pain go to back", "I faint this morning, wake up on floor", "I am having troubles to breathe", "I've been through up all day", "I took to many of my shots", "my eyes look like lemon color today", "my neck has a ball inside" trigger, and "mi esposo tiene dolor de pecho", "had lemon water with my eggs", "everything came up roses", "talked to many of my friends today" do not (checked): the family words are read too, so the checks for someone else work in those languages as well.

**The fixed card for signs a rule's own card does not name.** Some patterns stand for signs that the card written for their rule (2.4) does not name: signs added from the Medication Guides (any fever, plain hoarseness, a racing heart, blurry vision, severe nausea and the like) and general emergency signs (a heart attack, a stroke, a seizure, a collapse). Section 2.4 marks them *(Fixed card: see 2.3.)*. When a rule is raised only by such patterns, the hit is marked to show the fixed card of section 2.1 even where each rule shows its own card. In the first public version every alert shows the fixed card anyway (2.1), so the mark changes nothing there; it matters in the full test version, where each rule shows its own card.

Many patterns use the same word lists. A word in **bold** in section 2.4 stands for one of these lists:

| Code | Name in 2.4 | Words that count |
|----|------------|------------------------------------------------|
| L-01 | **severe word** | severe, severely, unbearable, excruciating, terrible, horrible, awful, intense, extreme, agonizing, horrendous, brutal, really bad, very bad, so bad, super bad, real bad, extremely bad, worst |
| L-02 | **stomach word** | stomach, stomache, abdomen, abdominal, belly, tummy, gut, abd, epigastric, pancreas, pancreatic, midsection, mid-section |
| L-03 | **pain word** | pain, pains, ache, aches, aching, hurt, hurts, hurting, cramp, cramps, cramping |
| L-04 | **pain or soreness word** | pain, pains, ache, aches, aching, hurt, hurts, hurting, sore, tender, tenderness, cramp, cramps, cramping |
| L-05 | **vomiting word** | vomit, vomits, vomited, vomiting, throw up, throws up, throwing up, threw up, thrown up, puke, pukes, puked, puking, barf, barfs, barfed, barfing, hurls, hurled, hurling, retch, retches, retched, retching, dry heave, dry heaves, dry heaved, dry heaving, heave, heaves, heaved, heaving |
| L-06 | **diarrhea word** | "diarrhea", also spelled "diarrhoea" or with letters missing or doubled ("diarrea", "diarhea", "diarreah"); "the runs"; "the squirts"; "the trots"; "loose", "watery" or "liquid" plus "stool", "stools", "poop", "poops", "bowel movement" or "bowel movements"; "pooping water", "pooping liquid"; "running to the bathroom" (also "run", "ran", "rushing" or "rushed", and "toilet", "restroom" or "loo"). Other misspellings of "diarrhea" are read as the word first (2.3). |
| L-07 | **nausea word** | "nausea", "nauseous", "nauseated" (also misspelled "nausious", "nauseus", "nasuea"); "queasy", "queasiness"; "sick to my stomach". |
| L-08 | **does-not-go-away phrase** | "won't", "will not", "doesn't", "does not", "don't", "do not", "didn't", "isn't", "is not", "hasn't", "has not", "haven't", "have not", "ain't", "not" or "never" (the apostrophe may be left out: "wont", "doesnt"), followed by "go away" (also "goes", "going", "gone away"), "stop" (also "stops", "stopped", "stopping"), "let up" or "letting up", "ease", "eased" or "easing" (also with "up"), "quit" or "quitting", "end", "ended" or "ending", "slow down" (also "slowed", "slowing"), "better" ("get better", "getting better", "gotten better", "any better"), or "improve", "improved" or "improving"; "been able to" or "seem to" may stand in between ("hasn't been able to stop", "doesn't seem to go away"). "Still there", "still here", "still going", "still the same". "Constant", "constantly", "nonstop", "persistent", "never-ending". "All the time". "Day and night". "Every day", "every single day". "For days" or "for weeks", with or without a count ("for 3 days", "for a few weeks", "for many days", "for a couple of weeks"). "For a week", "for over a week", "for more than a week", "for about a week", "for almost a week", "for the past week", "for the last week", "for the whole week", "for the entire week". "All week". A count of days plus "straight", "in a row", "now" or "running" ("3 days straight"). "Been 3 days" (also "been over", "almost" or "about", and "a few" or "several" days). "Since" plus a day of the week ("since Monday", "since last Friday"). "Since last week", "since last weekend". "Ever since". "Morning, noon and night". "Since I went up", "since I increased", "since I upped", "since I moved up", "since my dose went up", "since my dose was raised", "since my dose was increased", "since my dose increase", "since my dose change". One day is not on this list: "all day" and "since yesterday" do not count here. |
| L-09 | **slight word** | "a little", "a little bit", "a tiny bit", "a wee bit", "a tiny", "a wee", "tiny bit", "little bit", "wee bit", "a bit", "a tad", "a touch", "slightly", "mildly", "mild", "kind of", "kinda", "sort of", "somewhat", "less", "not too", "not very", "not that", "not so", "not really", "not as". "Just" or "only" may stand before it, and "less" after it ("a bit less"). A pattern that names this list stays quiet when one of these stands right before the symptom. "More" is not on the list: "a little more dizzy" says worse, and counts. |
| L-10 | **reaches-the-back phrase** | "to", "into", "through", "toward", "towards", "in", "around" or "round", followed by "back" or "spine" ("my" or "the", and "upper", "lower", "middle" or "mid", may stand before it), but not "back yard", "back seat", "back room", "back door", "back porch" or "back office". Or "and", "plus", "with" or "also", followed by "back" or "my back", but not "back to", "back from", "back at", "back on", "back home", "back again" or "back in". Or "back hurts", "back hurting", "back aches", "back aching" or "back pain" ("also", "too" or "is" may stand in between). |
| L-11 | **long-or-often phrase** | "all day", "all night", "all morning", "all afternoon", "all evening", "all week", "all weekend"; "for hours", with or without a count ("for 3 hours", "for several hours", "for a couple of hours"; counts "two" to "six", "many", "a few"); "since" plus a day of the week ("since Monday", "since last Friday"); a count of 5 or more with "x" ("5x", "x6", "10 x"); "every hour", "every half hour", or "every" plus a number, "few" or "couple" ("couple of") plus "minutes", "min", "mins" or "hours" ("every 20 minutes", "every few hours"); "nonstop"; "constantly"; "won't stop", "can't stop", "cannot stop"; "over and over"; "for days", with or without a count ("for 3 days", "for two days", "for a few days", "for several days", "for many days"); "24 hours", "48 hours", "72 hours"; "since yesterday", "since last night"; or a count of 5 or more "times" (5 to 9, any number with two or more digits, "five" to "ten", "several", "many", "multiple", "countless", "so many"); "so much" or "too much". |
| L-12 | **how-bad phrase** | "is", "are", "was", "were", "it's", "its", "has been", "have been", "been", "got", "gets", "getting", "gotten", "became", "feel", "feels" or "keeps getting", then "severe", "unbearable", "excruciating", "awful", "terrible", "horrible", "intense", "insane", "agonizing", "brutal", "out of control", "off the charts", "through the roof" or "the worst" (any of "so", "really", "very", "pretty", "quite", "getting", "just", "still", "extremely", "super", "real", "steadily", "even" and "much" may stand in between: "is getting really severe"). Or one of those first words, then "so bad", "really bad", "very bad", "extremely bad", "super bad", "real bad" or "pretty bad" ("getting", "just" or "still" may stand in between: "is getting so bad"). |
| L-13 | **how-bad phrase for pain** | a **how-bad phrase**; or one of its first words ("is", "has been", "getting" and the others), then "bad", "worse" or "worse and worse" (the same small words may stand in between: "is really bad", "keeps getting worse", "has gotten steadily worse"); or "getting worse"; or "worse every hour", "worse each hour", "worse by the hour" (also minute or day). |
| L-14 | **count of days** | a number (also written "x3"), "two" to "seven", "a few", "several" or "a couple" ("a couple of"), followed by "days" or "weeks": "3 days", "a few weeks". |
| L-15 | **day number** | "day" plus a number or "two" to "seven" ("day 3"); or a number with "st", "nd", "rd" or "th", or "second" to "seventh", plus "day" ("4th day", "third day"). |
| L-16 | **dizzy phrase** | "dizzy"; "lightheaded" (also "light-headed", "light headed"); "black out", "blacks out", "blacked out"; "vision" or "everything" plus "goes", "went", "going", "gets" or "got" plus "dark", "black" or "dim"; "see" or "seeing" plus "black", "stars" or "spots"; "almost" or "nearly" plus "pass out", "passed out", "faint" or "fainted". |
| L-17 | **upper-right phrase** | "upper right", "right upper" or "top right" followed by "stomach", "abdomen", "abdominal", "belly", "tummy" or "quadrant" ("side of my", "part of my" or "area of my" may stand in between); "upper right side" or "right upper side", unless it is the side of an arm, leg, thigh, back, chest, neck, head, face, shoulder, hip or knee; "right rib", "right ribs", "right rib cage", "right side ribs"; "right side" plus "under", "below", "beneath", "by" or "near" plus "my ribs"; "under", "below" or "beneath" plus "my ribs on my right". |
| L-18 | **cannot-see word** | a word that starts with "blurr" ("blurry", "blurred"); "can't see"; "cannot see"; "blind". |
| L-19 | **vision word** | "vision"; "sight"; or a **cannot-see word**. |
| L-20 | **not-eating phrase** | "haven't", "have not", "hasn't", "didn't", "did not", "barely", "hardly", "can't", "cannot", "couldn't", "could not", "not" or "unable to", followed by "eat", "eaten", "ate" or "eating" ("really", "even", "been able to" or "been" may stand in between). Or "eaten", "ate" or "eating" followed by "nothing", "almost nothing" or "next to nothing". |
| L-21 | **days phrase** | "days"; "for a week", "for 2 weeks", "for two weeks", "for three weeks", "for a few weeks"; "all week". |
| L-22 | **cannot-cope phrase** | How bad, told by what the person cannot do or had to do: "curled up"; "on the floor", "lying on the floor", "laying on the floor", "rolling on the floor" or "collapsed on the floor" (one word may stand before "floor": "on the bathroom floor"); "crying", "in tears", "sobbing", "screaming", "writhing"; "doubled over"; "can't", "couldn't", "can hardly", "can barely", "could hardly", "could barely" or "unable to" ("even" may follow), plus "stand", "stand up", "sit", "sit up", "sleep", "walk", "move", "function", "work", "straighten up", "get up", "get out of bed", "bear it", "bear to", "bear the", "bear this", "bear anything", "take it", "stand it", "stand to", "stand the" or "stand anything"; "had to be driven", "had to be carried", "had to be helped", "had to leave work", "had to pull over", "had to call 911", "had to call an ambulance"; "drive", "drove", "take", "took", "rush" or "rushed" (perhaps after "had to"), plus "me home" or "me to the emergency room", "to the hospital" or "to urgent care"; "going", "went", "go" or "on my way", plus "to the emergency room", "to the hospital" or "to urgent care"; "in" or "at" the emergency room, the hospital or urgent care ("ER" is read as "emergency room" first); a pain score of 7 or more ("7/10" to "10/10", also "out of 10"); "help me" (also "please help me"), or "help" at the end of the text or before an exclamation mark. |
| L-23 | **stomach-pain phrase** | A **stomach word**, then (within about 30 characters) a **pain or soreness word**, "stabbing", "burning" or "on fire". Or a **pain or soreness word**, "stabbing" or "stabbed", then (within about 20 characters) "in", "around", "across", "on", "at", "of" or "into", then (within about 25 characters) a **stomach word**. Or "stomach", "belly" or "tummy" joined to "ache" or "aches" ("stomachache", "belly ache"). |
| L-24 | **severe-or-lasting phrase** | A **severe word**; "so bad" or "so badly"; "killing me"; "agony"; "sharp", "stabbing" or "shooting" plus "pain", "pains", "cramp", "cramps", "cramping", "ache" or "aches"; a **does-not-go-away phrase**; "for hours" (also with a count: "for 3 hours", "for several hours"); "hours now", "hours straight", "hours in a row"; "been hours" (also "been 3 hours"); a number of hours at the end of a sentence ("3 hours"); "gone on"; "getting", "gotten", "got", "grown" or "growing", plus "worse" (one word may stand in between: "gotten steadily worse"); "worse and worse", "worse every", "worse each", "worse by the"; or a **cannot-cope phrase**. "All day" alone is not on this list. |
| L-25 | **one-side phrase** | one side, left side, right side, half my body, half my face, half of my body, half of my face, left arm and arm, left arm and leg, left arm and hand, left arm and face, left arm and foot, left arm and my arm, left arm and my leg, left arm and my hand, left arm and my face, left arm and my foot, left leg and arm, left leg and leg, left leg and hand, left leg and face, left leg and foot, left leg and my arm, left leg and my leg, left leg and my hand, left leg and my face, left leg and my foot, left hand and arm, left hand and leg, left hand and hand, left hand and face, left hand and foot, left hand and my arm, left hand and my leg, left hand and my hand, left hand and my face, left hand and my foot, right arm and arm, right arm and leg, right arm and hand, right arm and face, right arm and foot, right arm and my arm, right arm and my leg, right arm and my hand, right arm and my face, right arm and my foot, right leg and arm, right leg and leg, right leg and hand, right leg and face, right leg and foot, right leg and my arm, right leg and my leg, right leg and my hand, right leg and my face, right leg and my foot, right hand and arm, right hand and leg, right hand and hand, right hand and face, right hand and foot, right hand and my arm, right hand and my leg, right hand and my hand, right hand and my face, right hand and my foot |
| L-26 | **lost-time phrase** | "Lost time", "lost awareness", "lost consciousness"; "didn't", "did not", "wasn't", "was not", "couldn't" or "not", plus a word that starts with "respond" or "answer", or "aware"; "unresponsive"; "came to"; "blacked out" (not "blacked out on the ..." and the like); "don't", "can't" or "couldn't", plus "remember what happened", "remember anything", "remember it happening", "remember how I got" or "remember the last"; "zoned out"; "foaming"; "bit my tongue"; "wet myself". |
| L-27 | **feeling-of-dying phrase** | feel like im dying, feel like im going to die, feel like im gonna die, feel like im about to die, feel like i'm dying, feel like i'm going to die, feel like i'm gonna die, feel like i'm about to die, feel like i am dying, feel like i am going to die, feel like i am gonna die, feel like i am about to die, feels like im dying, feels like im going to die, feels like im gonna die, feels like im about to die, feels like i'm dying, feels like i'm going to die, feels like i'm gonna die, feels like i'm about to die, feels like i am dying, feels like i am going to die, feels like i am gonna die, feels like i am about to die, feeling like im dying, feeling like im going to die, feeling like im gonna die, feeling like im about to die, feeling like i'm dying, feeling like i'm going to die, feeling like i'm gonna die, feeling like i'm about to die, feeling like i am dying, feeling like i am going to die, feeling like i am gonna die, feeling like i am about to die, sense of doom, sense of impending doom, feeling of doom, feeling of impending doom |
| L-28 | **dose verb** | took, taken, take, taking, did, done, injected, inject, injecting, used, use, gave myself, given myself, drew up, drawn up, pulled up, dialed, dialled, clicked, shot, swallowed, had, dosed, put in, pushed |
| L-29 | **dose word** | dose, doses, dosage, shot, shots, injection, injections, pill, pills, tablet, tablets, units, clicks, pen, pens, mg, meds, medication, ozempic, wegovy, zepbound, mounjaro, rybelsus, saxenda, foundayo |
| L-30 | **mistake phrase** | accidentally, by accident, by mistake, mistakenly, on accident, forgot, forgetting, without knowing, without realizing, without realising, without thinking, didnt realize, didnt realise, didnt know, didnt remember, didn't realize, didn't realise, didn't know, didn't remember, already took, already taken, already did, already done, already had, already injected, already used |
| L-31 | **one-more phrase** | again, twice, extra, another dose, another shot, another injection, another pill, another tablet, second, double, too much, in a row, three times, one too, another one, as well |
| L-32 | **two-doses phrase** | "Two", "2", "both", "three" or "3", plus "doses", "shots", "injections", "pens" or a brand name in the plural ("of my" or "of the" may stand in between), plus "in one day", "in a day", "in the same day" (also "week"), "on the same day", "today", "at once" or "back to back". "Two in one day" (also "2", and "a day", "the same day"). "Tomorrow's dose" (also "tomorrows", and "pill", "shot", "tablet" or "injection"). "Whole", "entire" or "full", plus "month's", "months", "week's" or "weeks" and the like, plus "supply" or "worth". "My new pen and my old pen" (also "the", and in the other order). |
| L-33 | **medication name** | ozempic, wegovy, zepbound, mounjaro, rybelsus, saxenda, foundayo, semaglutide, tirzepatide, liraglutide, orforglipron |
| L-34 | **close-together word** | today, tonight, this morning, this evening, this afternoon, same day, the same day, in one day, in a day, in the same day, at once, at the same time, back to back, in a row, by mistake, by accident, on accident, accidentally, mistakenly, oops, instead |
| L-35 | **wish-or-plan phrase** | want to, wanted to, wanna, going to, gonna, plan to, plan on, planning to, planning on, planned to, planned on, think about, think of, thinking about, thinking of, thought about, thought of, thoughts of, ready to, tempted to, urge to, urges to, wish i could, might just, could just, about to, decided to, ill just, i'll just, i will just, better if i, better off if i, hope i, hope id, hope i'd, hope that i, hope that id, hope that i'd, wish i, wish id, wish i'd, wish that i, wish that id, wish that i'd, pray i, pray id, pray i'd, pray that i, pray that id, pray that i'd |
| L-36 | **way-of-dying phrase** | "Jump" or "jumping", plus "off", "from" or "in front of", plus "a", "the", "my", "this" or "that", plus "bridge", "roof", "building", "balcony", "overpass", "cliff", "ledge", "train", "car", "bus", "truck", "tower", "parking garage" or "parking deck". "Drive", "driving", "drove", "crash", "crashing", "steer" or "steering" (perhaps with "my car", "the car" or "off"), plus "into" or "off", plus "a", "the" or "oncoming", plus "tree", "wall", "pole", "bridge", "river", "lake", "traffic", "cliff", "truck" or "road". "Step" or "stepping in front of" a train, car, bus or truck. "Take", "taking", "swallow", "swallowing", "down" or "downing", plus "all", "every one" or "the whole bottle", "box" or "pack" (perhaps with "of", and "my", "the", "these" or "those"), plus "pills", "meds", "medication", "medications", "tablets", "sleeping pills", "insulin" or "pens". "Overdose" or "overdosing" (not "on" sugar, coffee, candy and the like). "Use" or "using", plus "it", "the knife", "a knife", "a gun", "the gun", "a blade", "the blade", "a razor" or "the razor", plus "on myself". "Disappear" or "disappearing", plus "forever", "for good" or "and never". "Not wake up", "never wake up", "don't wake up", "didn't wake up", "won't wake up" or "wouldn't wake up" (also "waking"), but not when "early", "late", "in time", "on time", "before", "until", "till", "at" or "for" follows. "End" or "ending", plus "it", "things" or "my life" (not when "with" or "between" follows). "Kill", "hurt", "harm", "cut" or "burn" (also with "ing"), plus "myself". |

How the rules read "no" and "not":

- A rule stays quiet when the words right before the symptom deny it: "no chest pain", "I don't have any chest pain", "never had chest pain", "no fever or chest pain", "zero chest pain", "ruled out gallstones", "can't say I have any chest pain". The words that deny: "no", "none", "neither", "nor", "zero", "0", "ruled out", "rule out", "negative for", "free of", "free from"; "not", "never", "without", "cannot", "denies", "denied", "deny", and any word that ends in "n't" (also typed without the apostrophe: "dont", "doesnt", "didnt", "havent", "hasnt", "hadnt", "isnt", "wasnt", "arent"); "can't say", "cannot say" or "wouldn't say" (also "can't say that I", "I'm" or "it's"). "No", "without", "denies" or "denied" may also stand one to three words before an "or" or "nor" that comes right before the symptom ("no fever or chest pain").
- A "no" written after the symptom, as on a checklist, denies it too: "chest pain: no", "fever - none", "chest pain free today", "gallstones were ruled out". That is ":", "=", "?", "-" or a dash, then "no", "none", "nope", "n/a", "negative", "0" or "zero", but not "no more", "no longer", "no better", "no relief", "no change", "no improvement", "no break" or "no let up" ("chest pain - no relief" fires). Or "free" right after the symptom, after a space or a hyphen. Or "was", "were", "is", "has been" or "got", plus "ruled out".
- Only small filler words may stand between a "no" in front and the symptom, such as "any", "more", "have", "having", "feeling", "take" or "took" ("I didn't take a double dose, I checked the log" stays quiet). With anything else in between, the rule fires: "not feeling well, chest pain". The part before the symptom is read back only to the last comma, full stop, colon, semicolon, question mark, exclamation mark or bracket.
- A denial does not count, and the rule fires, when the rest of the sentence says the symptom is there now. The markers are "like this", "this bad", "so bad", "this low", "before", "until", and turns such as "but today I do". "Like this" or "like that" is not a marker after "nothing", "anything", "something" or "none": "No chest pain, no palpitations, nothing like that." stays quiet. "Wasn't unconscious long" also fires: it happened, only not for long.
- A question that opens with "isn't", "aren't" or "doesn't" is not a denial: "isn't chest pain serious?" fires. The same goes for any other "...n't" alone before the symptom when a question mark follows in the same sentence.
- Between the key words of one pattern a few other words may stand. How many characters is fixed for each pattern. They may not cross the end of a sentence. They may not cross "no", "not", "never", "without" or a word ending in "n't" (also typed without the apostrophe, such as "arent", "dont", "wont": "my lips arent swollen" stays quiet), unless that word says the symptom goes on ("won't go away", "doesn't stop", "haven't been able to stop", "not getting better", "not slowing down").
- The self-harm rule stops only for a plain denial right before its words ("not suicidal", "no thoughts of hurting myself"); a "don't" or "do not" that begins its words does not stop it ("I do not want to die" fires).

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

A rule is raised when the text describes the person's own state, now or recently. Besides a denial, a match does not count only in the cases below. When in doubt, the rule is raised. The self-harm rule makes only the checks for someone else, a general question and a warning or a question for the doctor; the others do not stop it (2.4).

- **Someone else.** The words before the symptom, in the same part of the sentence (back to the last comma, colon or bracket), name another person who is the one the sentence is about: "my dad", "my sister's", "my late mother", "mom", "hubby", "she", "he", "they", "a friend of mine", "a guy", "the baby", "people", "patients", "someone". The person counts as the one the sentence is about when "he", "she" or "they" names them, when "his", "her" or "their" stands right before the symptom, when nothing or only an opening word stands before the person ("so", "yesterday", "update"), when a word that starts a new statement stands before them ("I think", "because", "when", "said", "one of"), or when "who" follows them. Stays quiet: "my dad had chest pain last year", "my sister is pregnant", "she passed out at the gym", "mom has chest pain", "hubby's lips are swollen", "some people get hives from it", "a guy on the news who was vomiting blood", "pancreatitis runs in my family". It counts again when "I", "me", "my" or "we" stands between that person and the symptom or is part of the symptom, when the writer stands with them ("me and my husband"), when a word for saying, noticing, finding, worrying or taking stands between them and the symptom ("said", "noticed", "found", "worried", "took", "called" and the like), when more than about 60 characters stand between them and the symptom, when the next sentence says "I have it" or "me too", or when the person is only part of the writer's own story (after a verb or a preposition: "walking my dog", "with my sister"): "my dad had chest pain and now I have chest pain", "me and my husband have been throwing up all day", "my wife noticed my eyes look yellow", "they said my blood sugar was low", "husband found me on the floor", "was walking my dog and passed out". A later part of the sentence goes on about that person when it has a symptom with no subject of its own ("My husband has the flu, throwing up all night") or names a cause the way others see it ("they say", "the doctor thinks", "the nurse said", perhaps with "it's", "maybe", "probably" and the like), and the earlier part names the person with no word for the writer: "my mother-in-law got yellow skin, they say gallstone", "my wife is suffer migraine and blurry eye". After "and then" or "and now" a symptom named as a thing, with no "has", "had", "got", "with" or a form of "suffer" tied to the person, starts a new statement and counts: "my husband cooked dinner and then severe stomach pain". "Anyone else" is read as the writer too: "has anyone else had chest pain on this". The people looked for include family, friends and pets, and also people such as "our pastor", "my coach", "a member" or "a lady"; "sis", "bro", "best friend", "patient", "dog" and "cat" count also without "my"; "the" counts before "lady", "guy", "man", "woman", "person", "girl", "boy", "gentleman", "stranger", "patient", "driver", "cashier", "waiter", "waitress", "neighbor", "teacher", "coach" or "nurse" (also "the old lady", "the poor guy" and the like). "My" in a place the other person belongs to ("a lady in my group", "a guy from my work") does not turn the sentence to the writer, and neither does "me" in a place next to them ("next to me", "beside me", "behind me", "in front of me", "near me", "across from me", "ahead of me"): "a lady in my group passed out at the gym", "Our pastor had a heart attack", "The lady next to me in the waiting room was having trouble breathing.", "my sis passed out at her wedding lmao she was so nervous", "dog's eyes look cloudy, vet tmr", "patient in bed 4 is having chest pain, paged the doc". A word for taking or saying in the passive ("was rushed", "was told", "got sent") is about that person, not a report about the writer: "My brother-in-law was rushed to the ER with chest pains on Saturday.". Someone else as the subject of the part before a comma also counts, when the symptom that follows has no subject of its own and starts with a word ending in "-ing": "My husband has the flu, throwing up all night, I'm fine.".
- **Long ago.** The sentence names a time long past: "last year", "last summer" (also winter, spring, autumn, Christmas), "last fall" (but not "my last fall" or "a bad last fall"), "years ago", "a few years back", "decades ago", "a long time ago", "ages ago", "in 2019" (any year before last year), "in college", "in high school", "back in the day", "as a kid", "as a newborn", "as an infant", "at birth", "when I was born", "when I was pregnant with ..." or "when I was pregnant before", "during my first pregnancy" (also second, third, last, previous, other or earlier), "when I was younger", "when I was 12", "when I was pregnant", "when I was a girl" (also boy, student, teen, in the army, in my twenties and the like), "long ago", "in the 1980s" or "in the '80s" (a decade written with four digits or an apostrophe; "in the 60s" alone may be a sugar reading), "in my twenties" (also teens, thirties, forties, fifties, "in my 20s" to "60s"), "during my time in the Army" (also navy, marines, military, service, air force, college, school, high school), "growing up", "a decade ago" (also without "a"), "before I was pregnant" (also "got" or "became", and "married"), "before my kids" (also "children", "pregnancy", "first baby", "before I had my kids"), "when I was in" or "while I lived in" my home country, the old country, back home or a country many US immigrants come from ("when I was in Vietnam"), "used to", "a history of". Stays quiet: "before I was pregnant I had double vision once", "when I was in Vietnam I got dengue fever", "decade ago I had chest pain from stress, tests normal", "I fainted once as a kid", "i had pancreatitis in 2019", "i used to get palpitations", "a history of gallstones", "Long ago I had an allergic reaction to penicillin with hives.", "In the 1980s I lost consciousness in a car accident.", "During my time in the Army I passed out on a hot parade ground.", "when i was pregnant i puked every day". Days, weeks and months ago still count: "I passed out last week", "two weeks ago I started having trouble swallowing". The time must stand in the same part of the sentence as the symptom, or alone right before it ("last year, I had chest pain"); a symptom in another part of the sentence counts: "I had my gallbladder out last year and I have severe stomach pain". A sentence that opens with the time and goes on in the past, with no verb in the present, is a story of long ago and stays quiet; so is any sentence with a time long past anywhere in it, a verb in the past and no verb in the present: "back in 2020 I had covid and couldn't breathe", "I had pancreatitis once, many years back, from a gallstone.". It counts again when the sentence has a word for now ("now", "today", "tonight", "again", "still", "currently", "lately", "recently", "yesterday", "since", "this morning", "this week", "last night", "earlier", "is back", "came back", "same pain"): "had chest pain last year and again today". "Fine now", "better now", "healed now", "none since", "never since", "nothing since", "not once since", "no more since", "haven't had one since" and the like say it is over and do not count as a word for now: "had gallstones years ago, fine now", "As a child I had seizures but none since", "had a seizure as a kid never since", "When I was pregnant with my first, I threw up every day", "I was jaundiced as a newborn".
- **A general question.** The words lead straight up to the symptom as a question about it in general: "what are the signs of ...", "symptoms of ..." at the start, "the risk of ...", "what causes ...", "what is ...", "what does ... feel like", "can it cause ...", "I wonder if it causes ...", "can you get ...", "how do I know ...", "how I know ...", "how to know ...", "what number is ..." (also level, reading, range, value, amount, temperature; "counts as", "means"), "who to call if ...", "where do I go if ...", "can it make ...", "the difference between ...", "how common is ...", "what should I do if I get ...", "I read that ...", "googled ...", "watching a show about ...", "read a book about ...", "people say it causes ...", "how to prevent ...", "a video of ...", "a tiktok about ..." (also clip, meme, reel, post, movie, show, episode, article, story, thread, tweet, song), "is ... a side effect" (also without "a", and with "thoughts", "feelings", "urges" and the like after the symptom), "is ... common", "would ... be a reason to ...", "is ... something people report". Other things may be named first in a list ("does it cause depression or suicidal thoughts"). Stays quiet: "What are the signs of low blood sugar?", "can ozempic cause chest pain", "is fainting a side effect", "what should i do if i get low blood sugar", "how do I know if I'm dehydrated?", "watching a show about seizures", "does this med cause depression or suicidal thoughts?", "Would chest pain be a reason to stop the medication?", "Is blurry vision something people report on semaglutide?", "tiktok of a guy faking a seizure was not funny". In "how do I know if I'm ...", "tell whether my blood sugar is ..." and the like, the "I'm" or "my ..." (with or without "is") belongs to the question and does not say the person has it: "how do i know if my blood sugar is low", "how I know if my sugar low?", "what number is low blood sugar?", "who to call if allergic reaction?", "can mounjaro make vision blurry?". For every rule but the self-harm rule, two more frames count as a question here: a question about doing something, right before it ("can I ...", "could I ...", "should I ...", "is it ok to ...", "is it safe to ..."), and words for keeping a symptom away ("don't want to ...", "don't wanna ...", "so I don't ...", "to avoid ...", "to prevent ...", "would rather not ..."): "can I double my dose?", "dont wanna overdose so i set an alarm", "I would rather not end up in the hospital with gallstones."; they count again with a word for now: "i dont want to pass out again". It counts again when the sentence says the person has it ("my", except "my medication", "my shot", "my doctor", "my wife" and the like; "I have", "I'm", "I feel", "this pain", "now", "today", "again", "still"), or the next sentence does ("I have it", "mine is", "me too"): "what are the signs of low blood sugar? I feel shaky and sweaty", "can ozempic cause the chest pain I have now", "does this cause chest pain? i have it now". Other questions are not on the list and count: "isn't chest pain serious?", "Is severe stomach pain going to my back normal?", "what should I do about this chest pain". A statement is not a question and counts: "the shot did cause severe stomach pain", "showing symptoms of low blood sugar".
- **A warning, a thing to watch for, a question for the doctor, a fear.** The words before the symptom say someone warned about it, or the person will watch for it, ask about it or is afraid of it: "the leaflet says ...", "the label lists ...", "the nurse said to call if ...", "told me to watch for ...", "warned me about ...", "boxed warning", "the doctor mentioned ...", "watch out for ...", "keep an eye out for ...", "be aware of ...", "ask my doctor about ...", "ask if ...", "talk to my doctor about ...", "worried about ...", "afraid of ...", "scared I'll ...", "nervous that it might ...", "afraid to get ...", "my fear is ...", "according to ...", "the brochure notes ..." (also explains, describes, covers, includes; and article, sheet, flyer), "the part about ...", "a section in the booklet about ...", "ask at my next appointment ...". Stays quiet: "the leaflet says to call if you have severe stomach pain", "my doctor told me to watch for vision changes", "pharmacist warned me about pancreatitis", "ask my doctor about chest pain", "worried about getting pancreatitis", "afraid I might faint", "According to the pamphlet, signs of low blood sugar include shakiness and sweating.", "I underlined the part about changes in vision in the instructions.", "The brochure notes that dizziness can happen when blood sugar is low.", "Ask at next appointment: whether hoarseness is a side effect worth mentioning.". It counts again when the words from there up to the symptom say the person has it ("my", "this", "I have", "now" and the other words of the paragraph above), or the words after it do (the same, without "my"), when "but" stands between, or when the next sentence says "I have it": "ask about my chest pain", "worried about this rash spreading". "I'll", "I might" and "if I ..." speak of what may come and do not count as saying the person has it. After "watch for", "look out for", "keep an eye out for", "monitor for" or "be aware of", "my" belongs to what may come, and only words for the present count ("now", "today", "this ...", "my ... is"). After the symptom, a plan that starts with "so I" does not count either: "I plan to watch for any yellowing of my skin, as the leaflet says.", "I am nervous about having a low while driving, so I keep candy in the car.".
- **Something that has not happened.** The sentence speaks of what might come: "what if ...", "what would I do if ...", "what happens if ...", "what to do if ...", "how would I know ...", a plan ("I'll call the doctor if ...", "going to stop if ..."), "in case of ...", "just in case", "I don't want to end up with ...", "if I ..." or "if my ..." right before the symptom with an instruction after it ("if I pass out call my wife"), or with "I'll", "I will", "I would", "I can" and the like after a comma within about 40 characters ("if my sugar runs low on the cruise, I will treat it"), or a time to come after the symptom ("someday", "some day", "in the future", "down the road", "down the line", "eventually", "later on", "in the long run"). Stays quiet: "what if my throat swells up", "in case of an allergic reaction", "I'll call the doctor if my vision changes", "if I pass out call my wife", "Should I be concerned about a lump in my neck someday?", "If my sugar runs low on the cruise, I will treat it with juice.". "My" and "I" belong to such sentences and do not count; only words for the present do ("now", "today", "again", "still", "already", "anymore", "I'm having", "this chest pain", "my ... is"), or "but" in between, or a next sentence that says "I have it": "what if this chest pain is my heart". These three checks are not made for R-10 `pregnancy`, R-11 `procedure`, R-12 `contraception`, R-13 `eating_too_little`: a question, a worry or a plan is what those reminders are for.
- **The size of a pill.** Trouble swallowing does not count when it is said of a pill, tablet, capsule, vitamin, supplement, "meds", medication or medicine: the pill follows "swallow" (up to four small words may stand between: "this big pill"), or stands before it with "is", "are", "was", "were", "seems", "feels", "looks", "gets" or "got". Stays quiet: "hard to swallow this big pill", "these pills are hard to swallow". Still counts, also when food or drink is named too, or when the sentence (or the 60 characters after it) says swallowing has changed ("lately", "recently", "now", "still", "stuck", "anymore", "any more", "these days", "getting harder", "harder and harder", "since starting", "since I started", "since last", "never used to"): "trouble swallowing food", "since starting my medication I have trouble swallowing", "hard to swallow pills and food", "hard to swallow pills lately, feels like something stuck".
- **A figure of speech.** The words after the symptom name joy or a shock that is not a symptom ("with excitement", "with joy", "from laughing", "when I saw the price", "when I see price of ...", "when I got the bill", "at the price", "I'm so excited", "in these jeans", "after the spinning ride", "on the roller coaster", "from the carousel", "from spinning"), or something beautiful ("after that view", "at the sunset", "after the kiss", "over the news", "at the proposal" and the like), or the words before it do ("laughing so hard", "crying so hard", "that movie had my ..."), or a thing that is hard to take does ("the price is", "the news was", "the truth is" and the like, right before it: "the price is hard to swallow"), or a title or a fake does: "listening to", "playing", "singing", "streaming", "watching" or "binging" right before it, or "faking", "pretending to have"; or a movie, a show, a view, a sunset, a kiss, a song, a performance and the like, or "she", "he" or "you", plus "left me" (also "leaves me", "has left me", "had left me") right before it ("that movie left me breathless"). For a breathing word, a heart attack, a seizure or a stroke, laughing anywhere in the sentence ("lol", "lmao", "haha", a laughing emoji) makes it a figure of speech too; so does a thing, not a person, an animal or a body part, as the one having it ("my bank account is having a seizure"), and "nearly" or "almost" before it with an event after it ("nearly had a stroke when I bid"). Stays quiet: "heart racing with excitement", "almost fainted when I saw the price", "can't breathe in these jeans", "laughing so hard I couldn't breathe", "that movie had my heart pounding", "dizzy after the spinning ride at the fair", "i was breathless after that view", "listening to Heart Attack by demi lovato", "lmao i literally cant breathe this video", "my bank account is having a seizure", "My bridge partner nearly had a stroke when I bid seven no trump.", "I almost faint when I see price of wegovy", "the price is hard to swallow", "That movie left me breathless". The self-harm words are not checked for any of this: "that test made me want to die lol".
- **Out of breath, or a pounding heart, from hard exercise.** A sign about breathing or the heart (a word with "breath", "wheez", "gasp", "winded", "heart" or "pulse", and no "pain", "hurt" or "ache") does not count when a run, a jog, a workout, the gym, cardio, a sprint, HIIT, a spin class, the treadmill, a Peloton, a hike, leg day, lifting, CrossFit, Zumba, burpees, a "5k" or "10k", a marathon or half marathon, a race, a swim, a bike ride, cycling, spin, soccer, basketball, tennis, football, hockey, practice, a training session, a dance class, boxing, kickboxing, rowing, deadlifts, squats, weights, weightlifting or boot camp follows it as the cause ("after", "from", "during", "while" or "on"; up to three words may stand between the sign and that word, and "heavy" or "big" before the exercise). The same when such exercise, a hill, a hike, chasing, dancing, swimming or biking stands within about 40 characters before the sign in its sentence, or "until I was" stands right before it. Climbing stairs and walking are not on the list. Shaking and sweating after exercise still count, as they can be low blood sugar. Stays quiet: "out of breath after my run", "heart pounding after my workout", "out of breath after my 5k, felt great", "that hill is a killer i was gasping", "I chased my grandson around the yard until I was out of breath and we both fell on the grass laughing.". Counts: "short of breath after climbing stairs", "chest pain after my run", "sweaty n shaky after heavy deadlifts".
- **Slight.** Three signs stay quiet when the person calls them slight (the **slight word** list): dizziness, a racing heart and hoarseness. Being short of breath or out of breath stays quiet after "less", "not as", "not so" or "no longer". Stays quiet: "a little dizzy", "heart racing a bit", "a little hoarse", "less short of breath than yesterday". Counts: "dizzy", "my heart is racing", "my voice is hoarse". "A little more dizzy" says it is getting worse, and counts: "a little more dizzy".
- **Over now.** Within about 60 characters after the symptom, in the same sentence, words say it has passed: "passed" (not "passed out"), "went away", "gone away", "is gone", "gone now", "resolved", "cleared up", "stopped" (not "stopped eating" and the like), "eased", "eased off", "subsided", "settled", "wore off", "got better", "is better", "faded", "disappeared", "is over", "over now", "went back to normal", "came back up", "back to normal", "back in range", "then fine", "now I feel better", "but better" (also fine, ok, good, normal), "better now", "fine now", "clear up" (also "clears up", "clearing up"), "the cold is over" (also flu, virus, infection or bug; "finished", "finish", "gone", "done"), "calmed" or "calmed down", "cleared", "has been fine" (also ok, good, normal, better; not before "until", "till" or "but"), "turned out to be", "was just a ..." (also "an", "from", "my", "the"), "things are moving again" and the like. These words do not count after a negation ("hasn't stopped", "never went away"), or when the rest of the sentence says it is back ("came back", "again", "returned", "worse", "still"). Stays quiet: "dizziness passed", "blurry vision went away after I rested", "the vomiting stopped after a day", "blurry vision cleared once i put my glasses on", "lump on my neck was just a swollen node from a cold, gone now", "I was constipated for a few days but things are moving again.", "dizzy before but better now after eat", "my eye blur clear up", "hoarse voice better after cold finish". Counts: "the vomiting hasn't stopped", "the dizziness went away then came back". The rules for chest pain or fainting, for a serious allergic reaction and for taking too much do not look for these words: such a sign is raised even when it has passed. Counts: "chest pain earlier but it went away", "I fainted but it passed quickly". The exceptions are the patterns marked *(Stops when over: see 2.3.)* in 2.4: a racing heart, palpitations, and being short of breath or out of breath stop counting when they are over: "heart racing calmed down after 1 min", "The palpitations I had on Tuesday turned out to be from too much coffee and have stopped.", "I was short of breath after my brisk walk, as expected, and it settled within a minute.".

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

This card shows a "Call 911" button and a "Call 988" button and pauses the day's workout and food tips.

What triggers it in typed text. A "no" or "not" in front does not stop this rule: "I do not want to die" still shows the card. The few exceptions follow the table.

| Code | What the person typed |
|----|------------------------------------------------|
| R-01.1 | A whole word that starts with "suicid" ("suicide", "suicidal"), but not when "squad", "prevention", "awareness", "hotline", "helpline", "line", "lines", "risk", "risks", "warning", "warnings", "rate", "rates", "statistics", "stats", a word that starts with "bomb", "door", "doors", "mission" or "run" follows ("suicide squad", "the suicide risk warning"). Misspellings such as "sucide" or "suiside" are read as this word first (2.3). "Kill myself", "killing myself" or "killed myself" (also "my self"). "Off myself" after "to", "gonna", "wanna", "will", "could", "should" or "might". A word that starts with "unaliv". "KMS", but not after a number ("ran 5 kms"). "KYS". |
| R-01.2 | "End my life", "ending my life", "take my life", "taking my life" (also "my own life"), but not "take my life back", "take my life in my hands", "take my life in my own hands", "take my life seriously", "take my life one day" or "take my life a day". |
| R-01.3 | "Want to die", "wanted to die", "wanna die", as whole words ("want to diet" does not count), and not when a figure of speech follows: "laughing", "of laughter", "of embarrassment", "of shame", "of boredom", "of cuteness", "from laughing", "from embarrassment", "from cuteness", or "for" plus "a", "an", "this", "that", "some" or "these" ("I could die for a slice"). "Wish I was dead", "wish I were dead", "better off dead", "better off without me" (also "better without me"). |
| R-01.4 | "Don't want to live", "do not want to live", "don't want to be alive", "do not want to be alive". |
| R-01.5 | "No reason to live", "no point to live", "no reason in living", "no point in living". "Don't", "do not", "can't" or "cannot", plus "see the point", "see a point" or "see any point", plus "in", "of" or "to", plus "living", "life", "going on", "being here" or "being alive". "What's the point in" or "what's the point of", plus "living", "life" or "going on". |
| R-01.6 | "Life isn't worth living", "life is not worth living", "life isn't worth it", "life is not worth it", "not worth living". |
| R-01.7 | "Want to", "wanted to", "going to", "thinking about", "thinking of", "thoughts of", "urge to", "urges to", "try to", "tried to", "trying to", "attempt to", "attempted to", "attempting to", "felt like", "feel like", "feels like", "feeling like" or "tempted to", followed by "hurt myself", "harm myself" or "kill myself" (also "hurting", "harming", "killing"). A word that starts with "self-harm", "self harm" or "selfharm". |
| R-01.8 | "Cutting myself", but not "cutting myself off", "cutting myself some slack", "cutting myself shaving", "cutting myself a slice", "cutting myself a piece" or "cutting myself short". "Been", "started", "start", "keep", "kept" or "back to", plus "cutting again" (also "cutting myself again"). "Relapsed", then (within about 20 characters) "cutting". "Cut myself", "hurt myself", "harm myself", "harmed myself", "burn myself", "burned myself" or "burnt myself" (also "my self"), followed by "on purpose", "deliberately" or "intentionally"; or those three words first, then "cut", "hurt", "harmed" or "burned", plus "myself". |
| R-01.9 | "Pills on purpose". "Overdose", "overdosed" or "overdosing", followed by "on purpose". "Thinking about", "thinking of", "thought about", "thought of", "want to", "wanna", "going to", "gonna", "tempted to", "urge to", "could just" or "might just", plus "take", "taking", "swallow" or "swallowing", plus "all" or "the whole bottle", "the whole box" or "the whole pack" (perhaps with "of", and "my", "the" or "these"), plus "pills", "meds", "medication", "tablets" or "sleeping pills". |
| R-01.10 | "End it all", "ending it all". |
| R-01.11 | "Go to sleep", "fall asleep" or "sleep", plus "and never wake up" or "and not wake up" (also "wake back up"). "Wish I wouldn't wake up", "wish I would not wake up", "wish I could not wake up", "wish I wouldnt wake up" (also "want" for "wish"). |
| R-01.12 | "Give up on life", "giving up on life", "given up on life" (also "living"). "Give up on", "giving up on" or "given up on", then (within about 30 characters) "even life" or "even living". "Dark thoughts". |
| R-01.13 | "Don't want to", "do not want to", "don't wanna" or "do not wanna", plus "be here", "be around" or "be alive", followed by "anymore", "any more", a punctuation mark or the end of the text. |
| R-01.14 | "Want to", "wanted to", "wanna", "going to", "gonna", "thinking about", "thinking of" or "ready to", followed by "end it", "end things", "ending it" or "ending things", but not when "with" or "between" follows ("ready to end things with my trainer"). |
| R-01.15 | "Want to disappear forever". |
| R-01.16 | "Can't go on", "cant go on" or "cannot go on", followed by a punctuation mark or the end of the text; up to three of "like this", "this way", "anymore", "any more", "living", "any longer" and "much longer" may stand in between ("I can't go on like this anymore"). With any other word after it it does not count ("I can't go on a walk today"). |
| R-01.17 | A **wish-or-plan phrase**, then a **way-of-dying phrase** ("just", "finally", "really" or "seriously" may stand in between): "going to jump off the bridge", "tempted to drive my car into a tree", "think about using it on myself", "planning to swallow all my sleeping pills", "better if I not wake up". Not right after "don't", "dont", "do not", "doesn't", "never", "not" or "no" ("I don't want to overdose"). |
| R-01.18 | "Hang myself", "slit my wrists" (also "wrist" or "throat"), "drown myself", "shoot myself in the head" or "shoot myself with a gun" (also "my self", and "hanging", "slitting", "drowning", "shooting"). "Shoot myself" alone is not on the list: people say it of their injection. |
| R-01.19 | "Better if I were not", "better if I wasn't", "better if I were gone", "better if I were dead" (also "better off if", and "was" for "were"). "Wish I were not here", "wish I wasn't around", "wish I was not alive" and the like (also "want" for "wish"). "Wish I were gone", "wish I was gone". |
| R-01.20 | "Don't want to", "do not want to", "don't wanna" or "do not wanna", plus "go on living", "keep living", "continue living" or "carry on living". |
| R-01.21 | "Everyone", "everybody", "they", "people", or "my" plus family, kids, husband, wife, partner or parents, plus "would", "will" or "'d", plus "be better" or "be happier" ("so much", "much", "a lot" or "way" may stand before, "off" after), plus "if I" (perhaps "just"), plus "wasn't here", "weren't around", "was not alive", "were gone", "was dead", "died", "disappeared" or "didn't exist" and the like. Not "if I just left the party early". |
| R-01.22 | "Nobody", "no one" or "noone", plus "would", "will", "is going to" or "gonna" ("even", "really" or "ever" may stand in between), plus "miss me", but not when "at", "in", "on", "for", "during", "from", "there" or "here" follows, or "if I" plus anything but "was", "were", "died", "disappeared", "wasn't" or "weren't" ("nobody would miss me at the party", "nobody would miss me if I skipped the meeting"). The same words plus "notice" or "care", plus "if I" plus "was gone", "were dead", "was not here", "wasn't here", "died" or "disappeared". "Wouldn't", "would not" or "won't" plus "miss me if I" plus "was gone", "were dead", "was not here", "died" or "disappeared". "Don't want to", "do not want to" or "don't wanna" plus "wake up" (perhaps with "tomorrow", "again", "anymore", "any more", "ever again" or "in the morning"), followed by a punctuation mark, the end of the text, "and" or "ever": not "wake up early", "wake up at 5" or "wake up for school". |
| R-01.23 | "No", or "don't", "do not", "doesn't", "does not", "can't" or "couldn't" plus "see", "find" or "think of" plus "a", "any" or "the", then "reason" or "point", then "to", "in", "of" or "for", then "keep living", "keeping living", "keep on living", "keep being alive", "go on" or "going on" (also with "living") at the end of a sentence, "carry on" or "carrying on" at the end of a sentence or before "anymore", "like this", "and", "but" or "with life", "live", "living", "be here", "being here", "be alive" or "being alive". |
| R-01.24 | Harming oneself again: "cut myself again", "burned myself again" or "burnt myself again", but not when "while", "chopping", "cooking", "shaving", "slicing", "on a", "on the", "on my", "with a", "with the", "with my" or "in the kitchen" follows. "Been", "keep", "kept", "started" or "start", plus "hurting", "harming", "cutting", "burning", "hitting", "punching" or "scratching", plus "myself", but not when "at", "in", "on", "during", "while", "lifting", "playing", "working", "with weights" or "with the" follows ("I keep hurting myself at the gym"). |
| R-01.25 | On purpose: a word that starts with "cut", "hurt", "harm", "burn", "scratch", "hit", "punch", "bang", "bit", "bite" or "starv", plus "myself", or "my" plus "arm", "arms", "leg", "legs", "wrist", "wrists", "skin", "thigh", "thighs", "stomach", "head", "hand" or "hands", then (within about 30 characters, in the same sentence) "on purpose", "deliberately" or "intentionally". |
| R-01.26 | Getting ready to die: "wrote", "write", "writing" or "written", plus "goodbye", "suicide" or "farewell" notes or letters ("my", "a", "some" or "the" may stand before), but not when "to" or "for" plus students, a class, coworkers, a team, colleagues, staff, the office, neighbors or clients follows. |

Examples that trigger (checked): "thinking about suicide", "I want to kill myself", "I want to end my life", "I want to die", "I do not want to die", "I don't want to live anymore", "there is no reason to live", "I can't see the point of living", "life is not worth living", "I've felt like hurting myself", "been cutting again", "I took pills on purpose", "I keep thinking about taking all my pills", "I want to end it all", "I wish I could go to sleep and not wake up", "I feel like giving up on everything, even living", "having dark thoughts", "I don't want to be here anymore", "thinking of ending things", "I want to disappear forever", "I can't go on like this anymore", "going to jump off the bridge tonight", "I have been tempted to drive my car into a tree.", "Sometimes I hold the knife and think about using it on myself.", "planning to swallow all my sleeping pills tonight", "i wish i could just disappear forever and not wake up", "I have been thinking it would be better if I were not here anymore.", "I do not want to go on living.", "I do not see a reason to keep living anymore.", "I see no point in carrying on and have been thinking of how to do it.", "cut myself again last nite", "i have been hurting myself again", "I scratched my arms until they bled on purpose.", "wrote goodbye notes", "better if I not wake up tomorrow", "everyone better without me, I plan to go", "I really feel like everyone would be happier if I just wasn't around", "nobody would miss me if I was gone", "I don't want to wake up tomorrow".

Every alternative stands as whole words, so "I want to diet", "blend it all together", "I spend my life at the gym", "taking my life back one pound at a time" and "ready to end things with my trainer" stay quiet. A "no" or "not" in front does not stop the rule ("I do not want to die" shows the card), and neither does a laugh ("that test made me want to die lol" shows the card: people often hide what they mean behind a joke), with four narrow exceptions, each checked: a plain denial right before the words ("not suicidal", "no thoughts of hurting myself"); a figure of speech after "die" ("wanna die laughing"); words that are about someone else ("a girl on tiktok said it made her suicidal"); a general question or a note to ask about a warning ("does this drug cause suicidal thoughts"). A time long past, a plan or a fear do not stop it. Stay quiet (checked): "I want to diet", "blend it all together", "I spend my life at the gym", "taking my life back one pound at a time", "ready to end things with my trainer", "not suicidal", "no thoughts of hurting myself", "I wanna die laughing", "a girl on tiktok said it made her suicidal", "does this drug cause suicidal thoughts", "suicide squad movie night", "cut myself again chopping onions", "I keep hurting myself at the gym", "wrote goodbye notes to my students", "I don't want to overdose", "I don't want to wake up early tomorrow", "nobody would miss me at the party anyway lol", "There is a section in the booklet about depression or thoughts of suicide.".

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
| R-02.2 | A **severe word**, then (within about 12 characters) "pain", "pains", "ache", "aches", "cramp", "cramps" or "cramping", then "in", "around", "across", "on", "at" or "near", then (within about 30 characters) a **stomach word**. | "terrible pain in my upper abdomen"; "severe pain on the left side of my stomach" |
| R-02.3 | A **stomach word**, then (within about 30 characters) words that say the pain is very bad: a **pain word** plus "so", "really", "very", "extremely" or "super" plus "bad", "badly", "much", "severe", "intense", "unbearable" or "painful" ("is", "are", "was" or "got" may stand before "so"); "in agony" (also "in so much agony", "in such agony", "in total agony" and the like); "killing me" (also after "is", "are", "was", "were", "has been", "have been", "been" or "keeps"); "unbearable"; "excruciating"; "can't stand", "can't take" or "can't bear", followed by "it", "this" or "the pain"; "doubled over"; "can't stand up straight"; "worst pain". | "my stomach hurts so bad"; "stomach pain is unbearable"; "belly has been killing me"; "abdomen killing me"; "my belly is in agony"; "tummy pain so severe" |
| R-02.4 | "Doubled over", then (within about 20 characters) a **stomach word**. | "doubled over with belly cramps" |
| R-02.5 | A **stomach word** and a **pain word**, then a **reaches-the-back phrase**, in the same sentence or the next one. | "belly pain that goes through to my back"; "Bad stomach pain. It goes to my back." |
| R-02.6 | A **pain word**, then "in", "around", "across" or "from" and a **stomach word**, then a **reaches-the-back phrase**, in the same sentence or the next one. | "pain in my stomach that goes to my back"; "pain from my abdomen to my back" |
| R-02.7 | A **stomach word** and a **pain word**, then "but", then a **reaches-the-back phrase**. So "not severe, but it goes to my back" still triggers. | "stomach pain, not severe, but it goes to my back" |
| R-02.8 | A **stomach word**, then "in so much pain" or "in too much pain". | "my stomach is in so much pain" |
| R-02.9 | "So much" or "too much" plus "pain" or "cramping", then "in", "around" or "across", then a **stomach word**. | "so much pain in my belly" |
| R-02.10 | "Stabbing", "sharp", "shooting" or "tearing", directly followed by a **stomach word** joined to a **pain word**. | "sharp stomach pain" |
| R-02.11 | "Stabbing", "sharp", "shooting" or "tearing", then "pain", "pains", "cramp", "cramps" or "cramping", then "in", "around" or "across" and a **stomach word** ("my" or "the", and "upper" or "lower", may stand before it). | "stabbing pain in my stomach"; "sharp cramps in my lower belly" |
| R-02.12 | The word "pancreatitis" (misspellings of it are read as this word first, 2.3). Or "pancreas" or "pancreatic", followed by "pain", "pains", "hurt", "hurts", "hurting", "ache", "aches", "aching" or "attack". | "I think I have pancreatitis"; "pancreas pain" |
| R-02.13 | A **stomach word** and a **pain word**, then (within about 20 characters) a **how-bad phrase for pain**. | "my stomach pain is severe"; "stomach ache getting worse" |
| R-02.14 | A **pain word**, then "in", "around", "across", "on" or "at", then (within about 30 characters) a **stomach word**, then (within about 15 characters) a **how-bad phrase for pain**. | "the pain in my stomach is awful" |
| R-02.15 | A pain score of 8 or more. First a **stomach word** and a **pain word**, or a **pain word**, then "in", "around", "across", "on" or "at" and a **stomach word**. Then (within about 25 characters) "8/10", "9/10" or "10/10" (also written "9 out of 10"), or "a", "an", "like a", "like an", "at a" or "at an" followed by "8", "9", "10", "eight", "nine" or "ten". The last kind does not count when "am", "pm", "min", "minutes", "hours", "days", "mg" or "%" follows the number. | "stomach pain 9/10"; "the pain in my stomach is a 10 out of 10" |
| R-02.16 | A **stomach word**, then (within about 30 characters) a **severe word** directly followed by "pain", "pains", "ache", "aches", "cramp", "cramps" or "cramping". Or a **stomach word** joined to a **pain word**, directly followed by "severe", "unbearable", "excruciating", "terrible", "horrible", "awful" or "intense". Or "can't" plus "stand", "take", "bear", "handle" or "deal with", plus "the" or "this", plus "pain", "cramp", "cramps" or "cramping", then "in" or "around" and a **stomach word**. | "stomach has been in knots with severe pain"; "abd pain severe"; "can't stand the pain in my stomach" |
| R-02.17 | A **stomach word**, then (within about 20 characters) "hurt", "hurts", "hurting", "ache", "aches" or "aching", directly followed by "bad", "badly", "a lot", "like hell", "like crazy", "so much", "terribly" or "horribly" ("so", "really", "real", "very", "pretty", "super" or "just" may stand in between). | "my stomach hurts bad"; "stomach hurts a lot"; "belly hurts like hell" |
| R-02.18 | A pain that bores, shoots or spreads into the back, wherever the person says the pain is: "pain", "pains", "ache", "aches", "hurt", "hurts" or "hurting", then (within about 40 characters) "boring", "bores", "bored", "radiates", "radiated", "radiating", "shoots", "shooting", "spreads", "spreading", "goes", "going", "went", "travels", "traveled", "travelled", "traveling", "travelling", "wraps", "wrap", "wrapping", "wrapped", "moves", "move" or "moving", plus "to" or "into", plus "back" or "spine" ("my", "the", "upper", "mid" or "middle" may stand before "back" or "spine", and "right", "straight" or "all the way" before "to"). | "the pain in my middle is boring into my back"; "hurts left side goes to back"; "the pain radiates into my spine" |

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
| R-03.2 | "Pain", "ache", "pressure", "tightness", "squeezing", "heaviness", "discomfort", "heavy feeling", "tight feeling" or "squeezing feeling", then (within about 15 characters) "in", "on", "across", "around" or "at", then "chest". Words for the place may stand before "chest": "my", "the", "left", "right", "upper", "the left side of my", "the middle of my" and the like. | "pressure in my chest"; "heavy feeling on my chest"; "pain on the left side of my chest" |
| R-03.3 | "Chest", then "hurt", "hurts", "hurting", "aches", "aching", "achy", "sore", "killing me", "pressure", "tightness", "tight", "crushing" (not "crushing it"), "squeezing", "being crushed" or "being squeezed", or "feels" plus "tight", "heavy", "painful", "sore", "crushed" or "squeezed" ("really", "so", "very" or "weird and" may stand before that word). These words may stand after "chest": "really", "still", "just", "so", "very", "super", "kind of", "kinda", "has been", "have been", "been", "is", "was", "keeps", "started", "starts", "began". Or "tight chest". | "my chest hurts"; "chest has been hurting"; "my chest is killing me"; "my chest feels tight"; "tight chest"; "my chest is crushing and I'm sweating" |
| R-03.4 | "Pass out" or "black out" in any form ("passed out", "passing out", "passes out", "blacked out", "blacks out"). It does not count when a thing that is handed out or covered follows: "flyers", "fliers", "candy", "papers", "samples", "invitations", "cards", "treats", "pamphlets", "snacks", "cookies", "cupcakes", "brownies", "food", "water", "drinks", "gifts", "presents", "programs", "tickets", "copies", "leaflets", "menus", "ballots", "bags", "goodie bags", "gift bags", "coupons", "stickers", "flowers", "masks", "shirts", "t-shirts", "handouts", "worksheets", "tests", "forms", "window", "windows", "curtains", "blinds", "screen", "screens", "names", "dates", "lines", "section", "sections", "parts" or "text", also with "the", "some", "my", "our", "all the", "a few", "these", "those", "homemade" or "free" in between ("passed out cookies", "blacked out the windows"). Nor when "on" plus "the", "that", "this", "my", "a" or "an" plus "exam", "test", "quiz", "final", "interview", "speech", "presentation", "lyrics", "answer", "answers", "question" or "questions" follows ("blacked out on that exam"), nor when "ceremony", "ceremonies", "parade" or "parades" follows ("the pass out ceremony"). | "I passed out after the shot"; "I keep passing out" |
| R-03.5 | "Fainted", "fainting" or "faints", but not "fainting goat" or "fainting couch". Or "faint" after "did", "might", "may", "could", "gonna", "to", "almost", "nearly", "will" or "would" ("going to faint"). Or "faint" after "feel", "feels", "feeling", "felt", "I'm", "I am", "I was", "I got", "I get" or "getting" ("so", "very" or "really" may stand in between), but not "faint of heart". | "I fainted in the shower"; "I feel faint"; "I think I am going to faint" |
| R-03.6 | "Lost consciousness". | "I lost consciousness for a minute" |
| R-03.7 | "Unconscious". | "I was unconscious" |
| R-03.8 | "Heart", "pulse", "heartbeat" or "heart rate", then (within about 20 characters) a word for fast or hard: "racing", "race", "races", "raced"; "pounding", "pounds", "pounded"; "fluttering", "flutters", "fluttered"; "thumping", "thumps", "thumped"; "hammering", "hammers", "hammered"; "skipping" (also "skipping beat" or "skipping beats"); "beating fast", "beating hard", "beating quick" or "beating quickly" ("so", "really", "very", "too", "super" or "way too" may stand before "fast"); "beating out of my chest"; "fast", "rapid" or "elevated" (also after "so", "really", "very", "too", "super" or "way too"); "so high", "really high", "very high", "too high", "super high" or "way too high"; "going crazy", "going nuts", "going so fast" or "going a mile a minute"; "through the roof". It does not count when a **slight word** stands right before that word, or when "a bit", "a little", "a little bit", "a tad" or "slightly" follows it. *(Fixed card: see 2.3.)* *(Stops when over: see 2.3.)* | "my heart is racing"; "heart pounding in my chest"; "my pulse is really fast" |
| R-03.9 | "Racing", "pounding", "rapid", "fast", "fluttering" or "thumping", followed by "heart", "heartbeat", "heart rate" or "pulse" (not when "a bit", "a little", "a little bit", "a tad" or "slightly" follows). Or "high" or "elevated", followed by "heart rate" or "pulse". *(Fixed card: see 2.3.)* *(Stops when over: see 2.3.)* | "very rapid heartbeat"; "racing pulse"; "high heart rate" |
| R-03.10 | "Palpitation" or "palpitations" (also after "heart"), "tachycardia", "heart flutter" or "heart flutters". *(Fixed card: see 2.3.)* *(Stops when over: see 2.3.)* | "heart palpitations again tonight" |
| R-03.11 | Fainting in other words: "everything went black" or "everything went dark"; "blackout" or "black out" after "had", "having", "have" or "another" ("a" or "another" may stand in between: "had a blackout"); "blackout" or "black out" followed by "this", "last", "today", "yesterday", "again", "episode" or "spell"; "syncope"; "out cold" (also "knocked out cold"). | "everything went black"; "had a blackout this morning"; "I was out cold" |
| R-03.12 | Chest pain in other words: "chest ache", "chest aches" or "chest discomfort"; "heavy chest"; "heart hurts", "heart really hurts", "heart is hurting" or "heart aches", but not when "for" follows ("my heart aches for them"); "pain", then (within about 12 characters) "in", "around", "near" or "by", plus "heart" or "my heart"; "sitting", "standing", "weight", "pressing" or "pushing", then (within about 15 characters) "on my chest". | "chest discomfort"; "my heart hurts"; "feels like an elephant sitting on my chest" |
| R-03.13 | Pain in the left arm or the jaw, together with another sign: "pain", "ache", "aching", "numb", "numbness", "tingling" or "pressure", then (within about 20 characters) "left arm" or "jaw", then (within about 30 characters) "and", "with" or "plus", then (within about 15 characters) "jaw", "left arm", "chest", a word that starts with "sweat", "nause" or "dizz", or a word that starts with "short" followed by "of breath". *(Fixed card: see 2.3.)* | "pain in my left arm and jaw"; "numbness in my left arm and sweating" |
| R-03.14 | A heart attack or a stroke by name: "heart attack", but not right after "gave", "give", "gives", "giving", "nearly gave", "almost gave" or "about gave" plus a person ("the bill gave me a heart attack"); "heart attack" is also not counted when "in a" plus "box", "bag", "bun", "cup", "bowl", "basket", "can" or "jar" follows, or "on a" plus "plate", "bun", "stick" or "platter", or "waiting to happen" ("a heart attack in a box"); "stroke" after "having", "had", "have", "think it's", "another", "a" or "mini" ("a", "another" or "mini" may also stand right before "stroke": "having a mini stroke", "a mini-stroke"), but not when "of" follows ("a stroke of luck"), and not when "awareness", "walk", "run", "ride", "fundraiser", "survivor", "survivors", "unit", "center", "centre", "ward", "clinic", "team", "prevention", "month", "research", "support", "education", "class" or "day" follows ("a stroke awareness walk"); "stroke symptoms", "stroke symptom", "stroke signs" or "stroke sign"; "signs of stroke", "signs of a stroke", "symptoms of stroke" or "symptoms of a stroke" (also "sign", "symptom"). *(Fixed card: see 2.3.)* | "I think I am having a heart attack"; "I had a mini stroke" |
| R-03.15 | "Seizure" or "seizures", but not when "warning", "poster", "sign", "alert", "precautions", "safety", "awareness", "training", "dog", "medicine", "medication", "meds", "drug", "disorder awareness", "disorder foundation", "threshold" or "risk" follows (also in the plural), and not when "of" plus "the", "a", "an", "his", "her", "their", "its", "our", "all", "assets", "property", "goods", "drugs", "cash" or "evidence" follows ("seizure of the shipment"), nor "of my" or "of your" plus "car", "truck", "house", "home", "property", "assets", "account", "accounts", "boat", "land", "stuff", "things", "wages", "paycheck", "phone", "bike", "vehicle", "savings", "money", "goods", "passport" or "license" ("seizure of my car"). "Seizing"; "convulsion", "convulsions", "convulsing" or "convulsed". "Had a fit" or "had another fit", but not when "of", "about", "over", "when", "because" or "with" follows ("had a fit about the mess"), nor "at" plus "him", "her", "them", "me", "us", "you", "my" and one word, or "the" plus "waiter", "waitress", "clerk", "cashier", "kid", "kids", "dog", "cat", "ref", "referee", "tv", "news", "price", "bill", "teacher", "coach", "manager", "cop" or "officer" ("had a fit at the waiter"). "Had a fit at the dinner table" counts. "Bit my tongue", when within about 40 characters after it the same sentence has "fit", a word that starts with "seiz", "shaking", "shaked", "woke up", "passed out", "blacked out" or "on the floor". *(Fixed card: see 2.3.)* | "I had a seizure"; "I was convulsing"; "Had a fit this morning, bit my tongue" |
| R-03.16 | A collapse. "Collapsed", "collapse" or "collapsing", but not when a thing stands right before it ("vein", "veins", "tent", "chair", "table", "bed", "shelf", "roof", "ceiling", "market", "plan", "deal", "lung", "lungs", "it", "that", "which", "building", "bridge", "economy", "arch", "arches" or "stock", also with "has", "have", "had", "just", "almost", "nearly", "is" or "was" in between), and not when "vein", "veins", "lung", "lungs", "on the couch", "on the bed", "on the sofa", "in bed", "into bed", "in my bed" or "into my bed" follows. Or "woke up", "came to", "found myself", "ended up" or "was found", plus "on the floor" or "on the ground" ("lying", "laying" or "face down" may stand before "on", and one word before "floor" or "ground": "on the bathroom floor"). Or "found me on the floor" or "found me on the ground" (also with "passed out", "lying", "laying" or "unconscious" before "on", and one word before "floor" or "ground"). Or "hit the floor" or "hit the ground". Or "keeled over" (also "keel", "keels", "keeling over"). Or "don't remember", "do not remember", "can't remember" or "cannot remember", followed by "falling", "how I fell", "how I got here", "how I got there" or "how I got on the floor". *(Fixed card: see 2.3.)* | "I collapsed at work"; "woke up on the bathroom floor"; "I don't remember falling"; "keeled over at the gym" |
| R-03.17 | A drooping face: "face", "mouth", "smile" or "eyelid", then (within about 15 characters) "droop", "drooping", "droops", "drooped", "droopy", "sagging", "lopsided", "crooked", "uneven", "twisted", "slanted" or "slanting". Or "drooping", "droopy", "drooped", "droop", "crooked", "lopsided" or "uneven", followed by "face", "mouth", "eyelid" or "smile". Or "facial droop" (also "facial drooping"). *(Fixed card: see 2.3.)* | "my face is drooping"; "my smile is lopsided"; "my mouth is crooked" |
| R-03.18 | One side numb or weak: "numb", "numbness", "weak", "weakness", "paralyzed" or "paralysed", then (within about 25 characters) a **one-side phrase**. Or a **one-side phrase**, then (within about 25 characters) "numb", "weak", "paralyzed", "paralysed", "limp", "went dead", "dead" or "heavy". Or "can't", "couldn't" or "won't", plus "move", "lift", "raise" or "feel", followed by "arm", "leg", "hand", "side" or "face" ("my", and "left" or "right", may stand in between). Or "arm", "leg" or "hand", plus "won't", "can't", "doesn't" or "wouldn't", plus "lift", "move", "work", "go up" or "hold anything". *(Fixed card: see 2.3.)* | "my left side is numb"; "I can't move my right arm"; "my left arm and leg went numb"; "half of my body feels numb"; "my arm won't lift" |
| R-03.19 | Slurred speech or sudden confusion: "slurred", "slurring", "slurry" (also "slurr"); "garbled"; "speech", "words" or "talking", then (within about 15 characters) "jumbled", "coming out wrong", "coming out weird" or "coming out jumbled"; "can't talk" or "can't speak", followed by "right", "properly", "straight" or "clearly"; "can't find my words" or "can't get my words"; "speech", "words" or "talking", plus "sounds", "sound", "sounded", "is", "was", "are", "were", "came out", "comes out" or "come out", plus "drunk", "garbled", "jumbled", "slurred", "wrong", "weird", "off", "funny" or "mixed up" ("all", "so", "kinda" or "kind of" may stand in between); "words won't come" or "words wouldn't come"; "don't know where I am" or "do not know where I am"; "sudden", "suddenly", "all of a sudden" or "out of nowhere", then (within about 20 characters) a word that starts with "confus" ("confused", "confusion") or "disoriented". *(Fixed card: see 2.3.)* | "my speech is slurred"; "My speech is garbled suddenly"; "I can't find my words"; "suddenly confused" |
| R-03.20 | "Ambulance", "911", "paramedics" or "EMS" ("a", "an" or "the" may stand before it), after "need", "needed", "need to call", "needed to call", "called", "calling", "dialed", "dialing" or "should I call" (but not "when should I call": that asks when to call). *(Fixed card: see 2.3.)* | "I need an ambulance"; "should I call 911" |
| R-03.21 | The worst headache of one's life: "worst headache" followed by "of my life" (also "of my entire life", "of my whole life"), "ever", "I've ever had" or "I have ever had". Or "thunderclap headache". *(Fixed card: see 2.3.)* | "sudden worst headache of my life"; "worst headache ever" |
| R-03.22 | A heart rate of 120 or more at rest. "Heart rate", "heartrate", "pulse", "HR", "BPM" or "heartbeat", then a number from 120 to 249 (small words may stand in between: "is", "was", "at", "of", "over", "above", "around", "about", "like", "keeps", "kept", "going", "went", "goes", "up", "to", "reading", "reads", "says", "said", "showing", "shows", "showed", "hit", "hits", "stays", "staying", "still", "currently", "now", "always", "already", "constantly"), not when "lb", "lbs", "pounds", "kg", "mg", "steps", "cal", "kcal" or "%" follows the number, and only when within about 40 characters after it the same sentence has "rest", "resting", "at rest", "sitting", "sat", "lying", "laying", "in bed", "on the couch", "doing nothing", "still", "asleep", "sleeping", "woke" or "watching". Or one of those words for rest first (except "still", "woke" and "watching"), then (within about 25 characters) the heart rate and the number. *(Fixed card: see 2.3.)* | "pulse 130 sitting still"; "heart rate keeps going over 120 resting"; "resting heart rate 125" |
| R-03.23 | A heart rate of 140 or more, with nothing said about rest. "Heart rate", "heartrate", "pulse", "HR" or "heartbeat", then a number from 140 to 249 (the same small words may stand in between as in the row above). Not when "target", "max", "maximum", "goal", "peak", "zone", "average" or "avg" stands right before it; not when "lb", "lbs", "pounds", "kg", "mg", "steps", "cal", "kcal", "%", "-", "to" plus a number, or "/" follows the number; and not when the rest of the sentence names exercise or walking: "run", "running", "ran", "jog", "hike", "hiking", "hill", "hills", "workout", "working out", a word that starts with "exercis", "gym", "walk", "walking", "stairs", "treadmill", "bike", "biking", "cycling", "spin", a word that starts with "swim", "climb" or "sprint", "training", "cardio", "lifting", "game", "practice", "race" or "class". *(Fixed card: see 2.3.)* *(Stops when over: see 2.3.)* | "my pulse is 150"; "heart rate 160 and pounding" |
| R-03.24 | Fainting, in regional words: "I fell out" ("just", "kinda", "almost", "nearly" or "totally" may stand in between), but not "fell out of", "fell out with", "fell out over" or "fell out laughing". "I came to" plus "in", "on", "at", "and", "with", "lying", "laying" or "face" ("I came to in the car"). "Went", "dropped" or "fell" (perhaps with "down"), plus "like a sack", "like a rock", "like a stone" or "like a ton of bricks". | "I fell out at church today"; "I came to in the car"; "went down like a sack of potatoes" |
| R-03.25 | A seizure told by what happened: a word for shaking ("jerking", "jerked", "jerks", "jerky", "shaking", "shaked", a word that starts with "convuls", "twitching", "twitched", "thrashing", "thrashed"), then (within about 60 characters) a **lost-time phrase**. Or a **lost-time phrase** first, then (within about 60 characters) a word for shaking. *(Fixed card: see 2.3.)* | "my body was jerking and I lost time"; "my family says I was shaking on the floor and did not respond" |
| R-03.26 | A blood pressure of 180/120 or more: "blood pressure" (also "BP", read as "blood pressure" first, 2.3), then the same small words as for a heart rate, then a first number from 180 to 299 over any second number, or any first number over a second number from 120 to 199 ("/" or "over" between them). *(Fixed card: see 2.3.)* | "blood pressure 190/120 and a pounding headache"; "blood pressure 185 over 100" |
| R-03.27 | A feeling of dying, with the heart, the chest or breathing: "heart", "chest", "pulse" or a word that starts with "breath", then (within about 60 characters, in the same sentence) a **feeling-of-dying phrase**. Or a **feeling-of-dying phrase** first, with one of those words within about 60 characters after it in the same sentence. *(Fixed card: see 2.3.)* | "my heart is skipping and I feel like I'm dying" |
| R-03.28 | In the emergency room now: "I'm", "im", "I am", "we're", "currently", "sitting", "lying", "laying" or "waiting", plus "in" or "at", plus "emergency room", "emergency department" or "urgent care" ("the" may stand before; "ER" is read as "emergency room" first, 2.3). Or "on my way to the" or "on the way to the", plus "emergency room" or "hospital". Or "in an ambulance". *(Fixed card: see 2.3.)* | "I'm in the emergency room right now"; "on my way to the hospital" |

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
| R-04.1 | "Throat", "lip", "lips", "tongue", "face", "eyelid" or "eyelids", then (within about 20 characters) a swelling word: "swell", "swells", "swelled", "swelling", "swollen", "puffed up", "puffing up", "closing up" or "is closing". One more word and "and" may stand right before the swelling word ("tingling and swelling"). | "my throat is swelling"; "my face is swollen"; "my lips are tingling and swelling" |
| R-04.2 | "Throat" or "airway", then (within about 25 characters) "closing", "closed" or "closes". | "throat closing" |
| R-04.3 | "Swelling" or "swollen", then (within about 25 characters) "throat", "lip", "lips", "tongue", "face", "eyelid" or "eyelids". | "swelling of my lips and tongue" |
| R-04.4 | "Can't", "cannot", "can not", "couldn't", "could not", "can barely", "can hardly", "could barely", "barely", "hardly", "hard to", "trouble", "difficulty", "difficult to", "struggling to", "struggle to", "unable to" or "not able to", followed by a word that starts with "breath" ("breathe", "breathing"); "really" may stand in between. It does not count when "through my nose", "thru my nose" or "out of my nose" follows (also without "my"). | "I can't breathe"; "trouble breathing"; "I can barely breathe" |
| R-04.5 | "Short of breath" or "shortness of breath". It does not count right after "less", "not as", "not so" or "no longer" ("less short of breath than yesterday"). *(Stops when over: see 2.3.)* | "short of breath" |
| R-04.6 | "Can't", "cannot", "couldn't", "could not", "trouble", "hard to", "hard time", "difficulty" or "struggling to", followed by "catch my breath" or "catching my breath". | "I can't catch my breath"; "trouble catching my breath" |
| R-04.7 | "Hives", "rash" or "welts", then (within about 20 characters) "all over", "everywhere", "whole body" or "entire body". "All over" one body part does not count ("rash all over my thigh"); "all over my body" does. | "hives all over my body"; "rash everywhere" |
| R-04.8 | "All over", "whole body", "entire body" or "covered in", then (within about 20 characters) "hives", "rash" or "welts". | "covered in hives" |
| R-04.9 | "Problem", "problems", "issue", "issues", "hard time", "tough time", "struggle", "struggles" or "struggling", followed by "breathing" ("with" and "my" may stand in between). Or "breathing" followed by "problem", "problems", "issue", "issues", "trouble", "difficulty" or "difficulties". Or "breathing" plus "is", "feels", "got", "has been" or "was", plus "hard", "harder", "difficult", "labored", "laboured", "tight", "shallow", "heavy", "rough", "bad" or "worse" ("really", "so", "very" or "getting" may stand in between). | "problems breathing"; "my breathing is getting worse" |
| R-04.10 | "Wheeze", "wheezes", "wheezing" or "wheezy"; "gasping"; "out of breath" (not "out of breath mints", "strips" or "spray"); "breathless" or "breathlessness"; "can't get" or "can't take", plus "a breath" (also "a full breath", "a deep breath", "a good breath"), "air", "any air" or "enough air". None of these counts right after "less", "not as", "not so" or "no longer". *(Stops when over: see 2.3.)* | "wheezing"; "I can't get enough air" |
| R-04.11 | "Throat", then (within about 20 characters) "tight", "tightening", "tightness" or a word that starts with "constrict". Or "tight", "tightness" or "tightening", then (within about 12 characters) "throat". | "my throat feels tight"; "tightness in my throat" |
| R-04.12 | "Throat", "lip", "lips", "tongue", "face", "eyelid", "eyelids" or "mouth", then (within about 25 characters) "puffy", "puffed", "puffing", "puffing up", "ballooned", "ballooning", "blown up", "blew up", "blowing up", "swole", or "getting" plus "bigger", "huge", "fat" or "puffy". Or "puffy" or "swole", followed by one of those body parts. | "my face is all puffy"; "puffy lips"; "my lips are getting bigger" |
| R-04.13 | "Severe", "bad", "terrible", "horrible", "awful", "really bad", "nasty", "huge", "spreading", "worst", "intense", "unbearable" or "extreme", followed by "rash", "rashes", "hives", "itch", "itching", "itchiness" or "welts". *(Fixed card: see 2.3.)* | "severe rash"; "severe itching" |
| R-04.14 | "Rash", "rashes", "hives", "itch", "itching", "itchiness", "itchy" or "welts", then (within about 40 characters) "severe", "unbearable", "spreading", "getting worse", "so bad", "really bad", "very bad", "extremely bad" (also "badly"), "out of control", "driving me crazy" (also "nuts" or "insane"), "won't stop" or "nonstop". *(Fixed card: see 2.3.)* | "my rash is spreading"; "the itching is driving me crazy" |
| R-04.15 | "Itch", "itching", "itchy", "itchiness" or "itches", then (within about 15 characters) "all over", "everywhere", "whole body", "entire body" or "head to toe". Or those words first, then (within about 20 characters) a word that starts with "itch". "All over" one body part does not count. *(Fixed card: see 2.3.)* | "itching all over"; "my whole body is itchy" |
| R-04.16 | "Hives" or "welts". Or "broke out in", "breaking out in", "broken out in" or "break out in", followed by "rash", "a rash", "a bad rash", "bad rash" or "welts". *(Fixed card: see 2.3.)* | "I have hives"; "I broke out in a rash" |
| R-04.17 | "Allergic reaction", "anaphylaxis" or "anaphylactic". | "I think I am having an allergic reaction" |
| R-04.18 | More words for swelling: "mouth", then (within about 15 characters) "swell", "swells", "swelled", "swelling" or "swollen"; "swollen shut"; "throat", "lip", "lips", "tongue" or "face", then (within about 15 characters) "feels", "feel", "felt", "looks", "look", "is", "are", "getting" or "got", plus "huge", "fat", "thick" or "enormous" ("so", "really" or "all" may stand in between); "throat", "lip", "lips", "tongue" or "face", then (within about 15 characters) "twice the size", "twice its size" or "twice their size" (also "normal size"). | "my mouth is swelling"; "eyes swollen shut"; "my lips feel huge" |
| R-04.19 | More words for trouble breathing: "labored breathing" or "laboured breathing"; "suffocating", "suffocate" or "suffocated"; "hard", "tough" or "difficult", plus "getting air", "to get air", "time getting air" or "time to get air" ("any" or "enough" may stand before "air"); "I'm choking" or "I am choking", also after "feel like", "feels like" or "feeling like"; "winded" after "get", "getting", "got", "so" or "really". | "labored breathing"; "I feel like I am choking"; "hard time getting air" |
| R-04.20 | "So", "really", "extremely", "insanely" or "unbearably", plus "itchy", then (within about 30 characters, in the same sentence) "can't sleep", "can't stand it", "can't take it", "can't stop scratching", "can't function", "all over" or "everywhere". *(Fixed card: see 2.3.)* | "so itchy I can't sleep" |
| R-04.21 | Breathing that takes effort: "every breath" or "each breath", plus "is", "feels" or "takes", plus "an effort", "a struggle", "a fight", "a chore" or "work" (also "such an effort" and the like). Or "breathing" plus "is", "feels" or "takes", plus "an effort", "a struggle" or "a chore". | "every breath is an effort right now" |

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
| R-05.2 | A **vision word**, then (within about 30 characters) "sudden", "suddenly" or "all of a sudden". | "my vision went blurry all of a sudden" |
| R-05.3 | "One eye", then (within about 30 characters) a **vision word**, "dark", "black" or "fuzzy". | "one eye is blurry" |
| R-05.4 | "Left eye" or "right eye", then (within about 30 characters) a **cannot-see word**, "dark", "black" or "fuzzy". The word "vision" alone is not enough here. | "my right eye is blurry" |
| R-05.5 | A **cannot-see word**, then (within about 25 characters) "one eye", "left eye" or "right eye". | "blurry in my left eye" |
| R-05.6 | "Vision loss"; "loss of vision", "loss of sight" or "loss of eyesight" (also "loss of my ..."); "lost" followed by "vision", "sight" or "eyesight" ("my", "some" or "the", and before that "part of", "some of", "most of", "half of" or "all of", may stand in between: "lost part of my vision"); "losing vision", "losing sight" or "losing eyesight" (also with "my"); "went blind", "going blind" or "gone blind". It does not count when "of my", "of the", "of what", "of why", "of how", "of it", "of that" or "of this" follows ("lost sight of my goals"). | "losing my sight"; "I think I am going blind" |
| R-05.7 | "Part", "half", "piece", "some" or "a section", plus "of", plus "vision", "sight", "visual field" or "view" ("my" or "the" may stand before), then (within about 12 characters) "missing", "gone", "dark", "black", "blocked" or "cut off". | "part of my vision is missing" |
| R-05.8 | "Blind spot". Or "dark" or "black" plus "spot", "curtain", "shadow" or "area", then (within about 20 characters) "vision", "eye" or "sight". | "a blind spot"; "a dark curtain over my vision" |
| R-05.9 | "Blurry", "blurred", "blurring", "blurriness", "fuzzy", "hazy", "cloudy", "double" or "foggy", followed by "vision", "eyesight" or "sight", but not when "mode", "setting", "filter", "effect", "level", "power", "glitch" or "cheat" follows ("double vision mode"). Or "vision", "eyesight" or "sight", then (within about 20 characters) a word that starts with "blur", or "fuzzy", "hazy", "cloudy", "foggy", "double", "doubled", "worse", "worsening", "changed" or "changing". *(Fixed card: see 2.3.)* | "my vision is blurry"; "double vision"; "my eyesight is getting worse" |
| R-05.10 | "Vision", "eyesight" or "sight", plus "is", "was", "seems", "feels", "got", "gets", "looks", "has been", "went", "goes", "keeps getting" or "keeps going", plus "off", "weird", "strange", "funny", "messed up", "dim", "dimmer", "dark", "darker", "spotty", "bad" or "terrible" ("a little", "a bit", "kind of", "kinda", "really", "so", "very" or "getting" may stand before that word). Or "vision", "eyesight" or "sight", plus "has" or "have", plus "dimmed", "darkened", "faded", "worsened", or "gotten" plus "worse", "dim", "dimmer", "dark", "darker" or a word that starts with "blurr" ("really", "suddenly" or "gradually" may stand in between). *(Fixed card: see 2.3.)* | "my vision seems off"; "over the last few days my vision has dimmed" |
| R-05.11 | "Eye" or "eyes", then (within about 15 characters) a word that starts with "blur", or "fuzzy", "hazy" or "cloudy". Or "blurry", "blurred", "fuzzy", "hazy" or "cloudy", followed by "eye" or "eyes". Or "everything", then a word that starts with "blur", or "fuzzy" or "hazy"; "looks", "look", "is", "seems", "went", "got", "was", "has been", "looking" or "going" may stand in between, and "so", "really", "all", "kind of" or "kinda" right before that word ("everything blurry", "everything looks fuzzy"). *(Fixed card: see 2.3.)* | "my eyes are blurry"; "everything looks fuzzy"; "everything blurry" |
| R-05.12 | "Change", "changes", "changing", "difference" or "decline", followed by "in vision", "in my vision", "in eyesight", "in my eyesight", "in sight" or "in my sight". Or "vision", "eyesight" or "sight", followed by "change", "changes", "problem", "problems", "issue", "issues" or "trouble". *(Fixed card: see 2.3.)* | "changes in my vision"; "vision problems" |
| R-05.13 | "Seeing" plus "double", "spots", "floaters", "flashes", "flashing lights", "halos" or "two of everything" (not when "on my" or "on the" follows, as in spots on the skin); "floaters"; "flashes of light"; "trouble seeing", "difficulty seeing", "hard time seeing", "problem seeing" or "problems seeing"; "hard to see"; "can't see" or "couldn't see" plus "well", "clearly", "good", "right", "straight", "properly" or "out of" (up to three of "as", "very", "that", "so", "the", "my", "a", "an", "anything", "things", "faces", "words", "signs", "road", "screen", "print" and "text" may stand in between: "can't see as clearly", "could not see the road clearly"); "can't see", then one to four words, then "anymore", "any more" or "any longer" ("I cannot make out faces across the room any longer": "make out" after "can't" is read as "see" first, 2.3). *(Fixed card: see 2.3.)* | "seeing double"; "I see floaters"; "can't see well out of my left eye"; "I can't see as clearly as before"; "I couldn't see the road clearly" |
| R-05.14 | More words for a change in vision: "vision", "eyesight" or "sight", plus "going in and out", "goes in and out", "went in and out" or "cutting in and out" ("keeps" may stand before); "vision comes and goes" (also "eyesight", "sight"); "things", "everything", "lines", "words", "letters" or "text", plus "look", "looks", "looked", "looking", "are", "is", "seem", "seems", "went", "got", "have been looking", "has been looking" or "keep looking", plus "wavy", "distorted", "warped", "double", "fuzzy", "blurry", "blurred" or "hazy" ("so", "all" or "really" may stand in between); "see double" or "saw double"; "flashing lights"; "wavy", "distorted", "warped", "bent" or "squiggly", followed by "lines", "vision" or "edges"; "can't see" at the end of a sentence, or followed by "at all", "right now" or "a thing"; "can't see anything", but not "can't see anything wrong", "anything different", "anything on", "anything in", "anything about" or "anything that"; "blurry" (also "blury") as a sentence of its own, also as "it's blurry", "its blurry", "things are blurry" or "everything is blurry" ("all", "so", "really" or "very" may stand before "blurry"). *(Fixed card: see 2.3.)* | "my vision keeps going in and out"; "things look wavy"; "I can't see"; "its all blurry"; "wavy lines in my vision" |
| R-05.15 | Spots or floaters in the vision: "spots", "specks", "dots", "floaters", "cobwebs" or "squiggles", then (within about 20 characters) a word that starts with "float", or "in" plus "vision", "eye", "eyes" or "sight" ("my" or "the" may stand before). *(Fixed card: see 2.3.)* | "dark spots floating in my vision" |

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
| R-06.5 | "Sugar", "sugars" or "glucose" (with or without "level" or "levels"), then "dropped", "dropping", "crashed", "crashing", "tanked", "tanking", "plummeted", "plummeting", "bottomed out" or "bottoming out" ("has", "have", "has been", "have been", "just", "is", "was", "are", "were", "keeps", "keep" or "kept" may stand in between). | "my glucose dropped"; "sugar crashed"; "my sugars are tanking" |
| R-06.6 | "Low glucose" or "low sugars". Or "a", "my", "another", "having", "had" or "got", followed by "low sugar", unless a word for a food, a drink or a diet follows ("a low sugar yogurt", "a low sugar week"). | "having low sugars a lot"; "I had low sugar this morning" |
| R-06.7 | "Sugar", "sugars", "glucose", "BG", "blood sugar" or "blood sugars", plus "is", "are", "was", "were", "got", "went", "feels", "feel", "running", "runs", "ran", "reading", "keeps", "keep" or "kept" (then perhaps "running", "reading", "going", "getting", "dropping" or "trending"), plus "low". "Very", "too", "really", "so", "super", "way too" or "pretty" may stand before "low". It does not count when "normal", "carb", "fat" or "cal" follows "low". Or "hypo" after "a", "having", "had" or "another". | "my sugars are running low"; "having a hypo" |
| R-06.8 | The short ways people with a meter write it: "low BG", "low BGs", "low BGL" or "low blood sugars"; "sugar", "sugars", "BG" or "BGs", followed by "low" (not when "normal", "carb", "fat" or "cal" follows); "went low", "going low", "dropped low" or "dropping low" (not when "on", "carb", "key" or "and slow" follows); "low sugar" at the start of a sentence, when the sentence ends there, a comma follows, or "and", "again", "today", "tonight" or "this" follows; "had a low", "having a low" or "have a low" (also "a bad low", "a scary low", "another low"), but not when "point", "moment", "day", "week", "mood", "bar", "opinion", "tolerance", "carb", "energy", "grade" or "score" follows. | "low bg this morning"; "sugars low"; "went low last night"; "had a bad low" |
| R-06.9 | A reading under 70. "Blood sugar", "blood sugars", "blood glucose", "glucose", "BG", "BGL", "BS", "CGM", "Dexcom", "Libre", "meter", "my sugar" or "my sugars" (or "sugar" or "sugars" when "is", "was", "are", "were", "at", "dropped", "went", "got", "hit", "read", "reads", "reading" or the number itself follows), then a number from 10 to 69, or a reading in mmol/L under 3.9 (from "0.0" to "3.8", one decimal: "BG 3.0"). These words may stand in between, each perhaps with a comma after it: "is", "was", "were", "at", "of", "read", "reads", "reading", "say", "says", "said", "showed", "shows", "dropped", "went", "down", "got", "to", "hit", "level", "levels", "alarm", "alarms", "alarming", "alarmed", "alert", "alerted", "went off", "beeped", "low", "lo", "currently", "now", "just", "only", "about", "around", "like", "showing", "meter", "monitor", "check", "checked". It does not count when a unit or a time follows the number: "%", "g", "gram", "grams", "carb", "carbs", "mg" (but "mg/dL" counts), "unit", "units", "lb", "lbs", "kg", "oz", "tsp", "tbsp", "teaspoon", "teaspoons", "tablespoon", "tablespoons", "cup", "cups", a decimal point or a colon with a digit after it, minutes, hours, days, weeks, years, "times", "am", "pm", "point", "points". Or "blood sugar", "blood sugars", "sugar", "sugars", "glucose" or "BG", then (within about 15 characters) "in the 20s", "30s", "40s", "50s" or "60s". Or "meter", "CGM", "Dexcom", "Libre" or "reading", plus "read", "reads", "say", "says", "said", "showed", "shows", "is" or "was", plus "LO" or "low". *(Fixed card: see 2.3.)* | "blood sugar 48"; "glucose was 55"; "cgm says 49"; "sugar is in the 40s"; "meter read LO"; "sugar 39"; "bg 2.8"; "my CGM alarm said low, 55"; "glucose meter showing 52" |
| R-06.10 | Lows and hypos by the short words. "Lows" after "having", "had", "have", "getting", "get", "got", "keep having", "keep getting", "been having", "been getting", "more", "frequent", "bad", "scary", "lots of" or "a lot of" ("a lot of", "lots of", "more", "frequent", "bad", "scary", "so many" or "many" may also stand right before "lows"). "Hypo" or "hypos". "CGM", "Dexcom", "Libre", "meter" or "pump", then (within about 10 characters) "low alarm", "low alert" or "low warning" (also "urgent low", and in the plural). Or "low alarm" or "low alert" (also "urgent low", and in the plural), followed by "went off", "going off", "keeps going off", "keep going off" or "again". | "I keep having lows at night"; "hypo last night"; "dexcom urgent low alarm" |
| R-06.11 | A reading under 70, with the meter after it or in tens. "Reading", "readings", "got", "getting", "showing", "shows", "showed", "read", "was" or "is" (perhaps with "a"), then a number from 10 to 69, then "on" or "from" plus "my" or "the" plus "meter", "CGM", "Dexcom", "Libre", "monitor", "glucometer" or "sensor". Or a number from 10 to 69 plus "on my" or "on the" plus "meter", "CGM", "Dexcom", "Libre" or "glucometer". Or "reading", "readings", "number", "numbers", "sugar", "sugars", "glucose" or "BG", then (within about 20 characters) "in", "into", "down in", "down to" or "down into", plus "the 20s", "30s", "40s", "50s" or "60s". *(Fixed card: see 2.3.)* | "reading 59 on my meter"; "My readings have been in the 60s every morning this week."; "my glucose has been dropping into the 50s" |
| R-06.12 | Glucagon, the rescue medicine for a severe low: "give", "gave", "given" or "giving", plus "me", plus "glucagon", "Baqsimi" or "Gvoke" ("my", "a", "the" or "some" may stand before). Or "used", "needed", "took", "had to use" or "had to take" (perhaps after "I"), plus "glucagon", "Baqsimi" or "Gvoke" ("my", "a" or "the" may stand before). Or "glucagon", "Baqsimi" or "Gvoke", plus "was", "got", "had to be", "has been" or "had been", plus "given", "administered", "used", "injected" or "sprayed", but not when "to" and anyone but "me" follows ("glucagon was given to my son"). | "husband had to give me glucagon i was out of it"; "glucagon was given to me" |

It also triggers on the signs of low blood sugar that the Medication Guides list (section 2.6), when the text has **two or more** of them. One sign alone is not enough. The signs are in two tables. Two signs of the first table trigger. A sign of the second table counts only next to a sign of the first. The card of this rule names shaking, cold sweats and a racing heart: when two of the first four signs (S1 to S4) are found, the rule shows its own card; when the alert rests only on other signs, it shows the fixed card (see 2.3).

| Code | Sign |
|----|------------------------------------------------|
| R-06.S1 | Shakiness: "shaky", "shaking", "shakes", "shakiness", "tremble", "trembles", "trembling", "trembly", "tremor", "tremors", "jittery", "jitters". Not "protein shakes", "milk shakes" or "meal replacement shakes". |
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
| R-07.1 | A word that says it keeps happening, then (within about 15 characters) a **vomiting word** or a **diarrhea word**. The words: "keep", "keeps", "kept"; "can't stop", "can't quit", "can't I stop", "cannot stop", "cannot quit", "won't stop", "won't quit"; "haven't stopped", "have not stopped", "hasn't stopped", "has not stopped" or "not stopped" (also "stop" in place of "stopped", and "been able to stop"); "still"; "constant", "constantly"; "nonstop"; "over and over"; "again and again"; "repeatedly"; "repeated". | "I keep throwing up"; "constant diarrhea"; "why can't I stop throwing up"; "still vomiting" |
| R-07.2 | A **vomiting word** or a **diarrhea word**, then (within about 25 characters) a **long-or-often phrase**. | "I've been throwing up all day"; "threw up 6 times today"; "diarrhea nonstop since last night" |
| R-07.3 | "Can't", "cannot", "can not", "couldn't", "could not", "unable to", "not able to", "haven't been able to", "have not been able to" or "hasn't been able to", then "keep" or "hold" ("even" may stand before), then what will not stay down, then "down". What will not stay down: "anything", "any thing", "nothing", "water", "fluid", "fluids", "liquid", "liquids", "food", "meds", "medication", "pills", "dinner", "lunch", "breakfast" or "a thing"; small words may stand before it ("even", "a", "any", "my", "the", "sips of", "bit of", "drop of", "bite of", "little"), and "or" plus one more word after it ("water or food"). Or "keep down" or "hold down", followed by "anything", "any thing", or "water", "fluids", "liquids" or "food" ("any" may stand before). | "can't keep water down"; "I can't keep any fluids down"; "can't hold anything down"; "can't keep down any food" |
| R-07.4 | "Nothing stays down", "nothing will stay down" or "nothing is staying down". | "nothing stays down" |
| R-07.5 | A **vomiting word** followed by "water", "everything" (also "everything I drink" or "everything I eat"), "whatever I drink", "whatever I eat", "Gatorade", "Pedialyte", "liquid", "liquids", "fluid", "fluids", "drink", "drinks", "juice", "broth" or "ice chips" (also "every thing"). "Up", and "even", "just", "plain" or "literally", may stand in between. | "throwing up even water"; "vomiting everything I drink"; "throwing up everything even gatorade" |
| R-07.6 | "Even water", "even sips" or "even sips of water", or "everything", "every thing", "anything" or "whatever" plus "I eat", "I drink", "I eat or drink" or "I swallow"; then (within about 20 characters) "comes up", "come up", "came up" (also "back up" or "right up" in place of "up"), or a **vomiting word**. | "everything I eat comes back up"; "even water comes right up" |
| R-07.7 | "Haven't", "have not", "hasn't", "didn't" or "did not", followed by "peed", "pee", "urinated", "urinate" or "been able to pee" ("really" may stand in between). | "I haven't peed all day" |
| R-07.8 | "No", "barely any", "hardly any", "very little" or "almost no", followed by "pee" or "urine" ("made", "passed", "produced" or "had" may stand between "barely" or "hardly" and "any"). | "very little urine today"; "I have hardly made any urine today" |
| R-07.9 | "Barely" or "hardly", followed by "peeing", "pee", "peed", "urinating", "urinate" or "urinated". Or "only peed", "only urinated" or "only gone pee", followed by "once", "one time" or "twice". | "barely peeing"; "I have only urinated once today" |
| R-07.10 | "Peeing" or "urinating", followed by "little", "very little" or "so little". | "peeing very little" |
| R-07.11 | "Not peeing" or "not urinating", followed by "much", "a lot" or "at all". | "not peeing much" |
| R-07.12 | "Peeing" or "urinating", followed by "less", "much less", "a lot less" or "way less". | "peeing a lot less than usual" |
| R-07.13 | "Can't pee" or "can't urinate". | "I can't pee" |
| R-07.14 | "Stand up", "stands up", "standing up", "stood up", "get up", "getting up", "got up" or "standing", then (within about 25 characters) a **dizzy phrase**. | "when I stand up I get dizzy"; "got up and everything went black" |
| R-07.15 | A **dizzy phrase**, then (within about 25 characters) "when", "whenever", "every time", "each time", "if", "after" or "as soon as", then "I stand", "I stood", "I get" or "I got". | "dizzy when I stand up"; "lightheaded every time I get up" |
| R-07.16 | A **nausea word**, then (within about 30 characters) a **does-not-go-away phrase**. *(Fixed card: see 2.3.)* | "nausea that won't go away"; "nauseous for 4 days" |
| R-07.17 | "Constant", "constantly", "nonstop", "persistent" or "never-ending", then (within about 12 characters) a **nausea word**. *(Fixed card: see 2.3.)* | "constantly nauseous" |
| R-07.18 | A **vomiting word** or a **diarrhea word**, then (within about 30 characters) a **does-not-go-away phrase**. | "diarrhea that does not go away"; "vomiting that won't go away" |
| R-07.19 | A **severe word**, then (within about 12 characters) a **nausea word**, a **vomiting word** or a **diarrhea word**. *(Fixed card: see 2.3.)* | "severe nausea"; "really bad diarrhea" |
| R-07.20 | A **nausea word**, a **vomiting word** or a **diarrhea word**, then (within about 15 characters) "is", "are", "was", "got", "getting" or "been", plus "severe", "unbearable", "awful", "terrible", "horrible", "intense", "out of control", "so bad" (also "really", "very", "extremely", "super" or "real" bad) or "the worst". *(Fixed card: see 2.3.)* | "the diarrhea is out of control" |
| R-07.21 | "Dizzy", "dizziness", "lightheaded" (also "light-headed", "light headed", "lightheadedness"), "woozy" or "vertigo". It does not count when a **slight word** stands right before it ("a little dizzy"), or when "a bit", "a little", "a little bit", "a tad" or "slightly" follows. Or "room", "everything" or "head", plus "spinning" ("is", "was", "keeps" or "started" may stand in between). *(Fixed card: see 2.3.)* | "feeling dizzy"; "the room is spinning" |
| R-07.22 | "Dehydrated" after "so", "very", "really", "severely", "badly", "super", "extremely", "pretty", "terribly" or "awfully", or after "I'm", "I am", "I think I'm", "feel", "feeling", "felt", "got" or "getting". Or "severe dehydration". Or "dehydrated" alone, as a sentence of its own. | "I think I'm dehydrated"; "Dehydrated." |
| R-07.23 | A count of days, without "for". A **vomiting word** or a **diarrhea word**, then (within about 15 characters) a **count of days**, but not when "ago" follows. Or a **count of days**, "days", "a week" or a **day number**, then "of" or "with" ("now" may stand before), then a **vomiting word** or a **diarrhea word** ("the", "constant" or "nonstop" may stand in between). Or a **vomiting word** or a **diarrhea word**, then (within about 20 characters, any words of the same sentence except "on") a **day number**, but not when "of", "after", "post", "since" or "on" follows it. | "vomiting 3 days"; "day 3 of throwing up"; "puking again, 4th day in a row" |
| R-07.24 | The same for nausea. A **nausea word**, then (within about 15 characters) a **count of days**, but not when "ago" follows. Or a **count of days**, "a week" or a **day number**, then "of" or "with" ("now" may stand before), then a **nausea word** ("the", "constant" or "nonstop" may stand in between). Or a **nausea word**, then (within about 25 characters, any words of the same sentence except "on") a **day number**, but not when "of", "after", "post", "since" or "on" follows it. Or "so" or "too" plus a **nausea word**, then (within about 10 characters) "can't" plus "function", "work", "eat", "drink", "sleep", "move", "stand" or "get out of bed". *(Fixed card: see 2.3.)* | "nauseous 4 days now"; "so nauseous I can't function" |
| R-07.25 | A **vomiting word** or a **diarrhea word**, then (within about 30 characters, any words of the same sentence) "still going", "still happening", "still at it" or "still sick". | "vomiting and diarrhea, still going" |
| R-07.26 | A **vomiting word**, a **diarrhea word** or a **nausea word**, then (within about 40 characters, any words of the same sentence) "can't", "cannot", "can not", "couldn't" or "unable to", plus "drink" or "eat or drink" ("even" may stand in between), plus "anything", "any thing", "water", "fluid", "fluids", "liquid" or "liquids". | "throwing up and can't even drink water" |
| R-07.27 | A stomach bug that does not go away or lasts long: "stomach flu", "stomach bug", "stomach virus", "tummy flu", "tummy bug", "tummy virus", "gastro", "gastroenteritis" or "norovirus", then (within about 30 characters) a **does-not-go-away phrase** or a **long-or-often phrase**. *(Fixed card: see 2.3.)* | "stomach flu like symptoms that will not go away" |
| R-07.28 | Little urine, said after the word: "pee", "peed", "peeing", "urine", "urinate", "urinated" or "urinating", then (within about 25 characters) "barely", "hardly", "very little", "almost no", "not much", "a trickle", "only once", "only a little" or "only a few drops" (perhaps followed by "any", "comes out", "come out", "coming out" or "at all"). | "pee is dark brown and barely any"; "super thirsty and peeing hardly at all" |
| R-07.29 | Dark brown urine: "dark brown", "brown", "tea-colored", "tea colored", "cola-colored" or "cola colored" (also "coloured"), followed by "urine" or "pee". Or "urine" or "pee", then "dark brown", "brown", "the color of tea", "the color of cola" or "the color of coke" (also "colour"); "is", "was", "looks", "has been", "turned", "got" or "went", and "really", "very" or "so", may stand in between. "Dark urine" alone is not enough. *(Fixed card: see 2.3.)* | "my urine is dark brown"; "brown pee" |
| R-07.30 | Everything comes back up: "everything", "every thing", "food", "water", "anything", "drink", "drinks", "liquid", "liquids", "fluid", "fluids", "whatever I eat" or "whatever I drink", plus "comes back up", "come back up", "coming back up" or "came back up" ("just", "always", "keeps" or "still" may stand before, and "right" before "back"). Or "without" plus "coming up", "coming back up", "throwing it up" or "puking it up" (also with "it" and "right": "without it coming back up"). | "can't eat or drink anything without it coming back up"; "everything I drink comes right back up" |
| R-07.31 | "Haven't", "hasn't", "didn't", "not" or "never", plus "kept", "keeping", "held" or "holding" ("been" may stand before), plus what will not stay down (the same words as for "can't keep ... down"), plus "down". | "I have not kept fluids down" |
| R-07.32 | The kidneys: "kidney" or "kidneys", then (within about 25 characters) a word that starts with "hurt", "pain", "ach", "damage" or "injur", or "sore", "off", "bad", "worse", "failing", "failure", or "number" or "numbers" plus "off", "bad", "up", "high", "worse", "low" or "abnormal" ("are" or "is" may stand in between). Or "eGFR", "GFR" or "creatinine", then (within about 20 characters) "dropped", "down", "low", "high", "up", "elevated", "worse", "bad", "off" or "abnormal". *(Fixed card: see 2.3.)* | "my kidneys hurt and i havent been drinking"; "labs say my kidney numbers are off" |
| R-07.33 | Vomiting, diarrhea or nausea that stops the person from getting through the day: a **vomiting word**, a **diarrhea word** or a **nausea word**, then (within about 60 characters) a **cannot-cope phrase**. Or a **cannot-cope phrase**, then (within about 40 characters) a **vomiting word** or a **diarrhea word**. *(Fixed card: see 2.3.)* | "I am so weak from the diarrhea that I can hardly get out of bed" |

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
| R-08.2 | "Yellow", "yellowing" or "yellowish", followed by "skin", "eye", "eyes", "eyeball" or "eyeballs" ("of", "my" or "the" may stand in between), but not when "emoji", "emojis", "filter", "filters", "contact", "contacts", "lenses", "makeup", "paint", "shirt", "dress", "costume", "sticker" or "stickers" follows ("yellow eyes emoji"). | "yellowing of my skin"; "yellow eyes" |
| R-08.3 | "Skin", "eye", "eyes" or "whites of my eyes" or "whites of the eyes", then none, one or two of these words: "is", "are", "has", "have", "look", "looks", "looking", "turned", "turning", "got", "getting", "went", "going", "gone", "seem", "seems", "been"; then "yellow". "A" may stand before "yellow", and up to three of "bit", "little", "tiny", "kind of", "kinda", "sort of", "sorta", "slightly", "really", "very", "super", "so" and "pretty" ("my eyes have a yellow cast", "skin looking kinda yellow"). A slight word does not stop this sign. | "my eyes look yellow"; "my skin is turning yellow"; "my skin has turned yellow"; "eyes yellow"; "skin looking kinda yellow today" |
| R-08.4 | A **pain or soreness word**, then (within about 30 characters) an **upper-right phrase**. | "pain in my upper right abdomen"; "pain under my right ribs" |
| R-08.5 | An **upper-right phrase**, then (within about 30 characters) a **pain or soreness word**. | "my upper right side hurts"; "right rib cage is sore" |
| R-08.6 | "Right upper pain" or "right upper abdominal pain". | "right upper abdominal pain" |
| R-08.7 | A **pain or soreness word**, then (within about 30 characters) "upper", "top of my" or "upper part of my" (also "the" for "my") and a **stomach word** ("middle", "central", "mid", "left" or "right" may stand before it). Or "upper" and a **stomach word** first ("middle", "central", "mid", "left" or "right" may stand in between), then (within about 30 characters) a **pain or soreness word**. *(Fixed card: see 2.3.)* | "pain in my upper stomach"; "upper abdominal pain after I eat" |
| R-08.8 | A **pain or soreness word**, then (within about 25 characters) "under", "below", "beneath" or "behind", plus "rib", "ribs", "rib cage", "breastbone" or "sternum" ("my" or "the" may stand before). Or those words first, then (within about 25 characters) a **pain or soreness word**. *(Fixed card: see 2.3.)* | "sore right under my ribs" |
| R-08.9 | "I'm", "I am", "I look", "I looked", "I turned", "I'm looking" or "I'm turning", followed by "yellow" or "jaundiced" ("a bit", "a little", "kind of", "kinda", "really" or "so" may stand in between). Or "is my" or "are my", plus "skin", "eye", "eyes" or "face", plus "yellow" ("so", "turning", "looking", "a bit" or "kind of" may stand in between). Or "skin", "eye", "eyes" or "face", then (within about 20 characters) "yellow" or "yellowish" plus "tint", "tinge", "color", "colour", "hue", "look" or "cast"; or those words first, then (within about 20 characters) "skin", "eye", "eyes" or "face". | "I look yellow"; "why are my eyes yellow"; "my skin has a yellow tint" |
| R-08.10 | "Fever", "fevers" or "feverish". Not "hay fever", "cabin fever", "spring fever", "scarlet fever", "gold fever", "dance fever", "disco fever", "jungle fever", "baby fever" or "Saturday night fever", and not "fever dream", "fever pitch", "fever blister", "fever tree", "fever excitement" or "fever pace". Or "running", "have", "having", "had", "got", "spiked" or "spiking", followed by "a temp" or "a temperature". Or "temp" or "temperature" with a number from 100 to 109, or from 38 to 41 (one decimal may follow: "101.2"); "is", "was", "of", "at", "hit", "reached", "up to", "went to" or "went up to" may stand in between. *(Fixed card: see 2.3.)* | "I have a fever"; "my temp is 101.2" |
| R-08.11 | "Clay", "pale", "light", "gray", "grey", "white", "whitish", "chalky" or "putty" (with or without "colored" or "coloured", also joined with a hyphen), followed by "stool", "stools", "poop", "poops", "poo", "bowel movement", "bowel movements", "BM" or "BMs". Or one of those words for stool first, then (within about 40 characters) "clay", "pale", "light-colored", "light colored", "light in color", "gray", "grey", "white", "whitish", "chalky" or "putty". Or "pooping" or "pooped" (also "pooping out"), followed by "clay", "pale", "light", "gray", "grey", "white", "whitish" or "chalky". *(Fixed card: see 2.3.)* | "clay colored stools"; "my poop is pale" |
| R-08.12 | "Gallstone" or "gallstones" (also written "gall stones"). Or "gallbladder" (also "gall bladder") followed by "attack", "pain", "problem", "problems", "issue", "issues" or "infection". | "I think I have gallstones" |

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
| R-09.1 | "Lump", "bump", "swelling", "mass", "nodule", "knot" or "growth", then (within about 15 characters) "in", "on", "at", "around", "under" or "near", plus "neck" ("my" or "the" may stand before). The front, side, left side, right side, base, back or bottom of the neck counts too ("a lump on the side of my neck"). | "lump in my neck"; "a swelling on the front of my neck"; "a hard lump at the base of my neck" |
| R-09.2 | "Neck" followed by "lump", "swelling", "swollen", "mass" or "nodule" ("is", "looks" or "feels" may stand in between). | "my neck is swollen" |
| R-09.3 | "Trouble", "difficulty", "difficult", "hard time", "problem", "problems", "issue", "issues", "hard", "harder", "tough", "can't", "cannot", "can barely", "can hardly", "unable to", "struggle", "struggles" or "struggling", followed by a word that starts with "swallow" ("to" or "with" may stand in between). It does not count when it is said of a pill (section 2.3). | "trouble swallowing"; "it's hard to swallow" |
| R-09.4 | "Hoarse", "hoarseness", "raspy" or "lost my voice", then (within about 30 characters) words that say it has lasted: "for weeks" or "for months" (also with a count: "for 3 weeks", "for a few months", "for several weeks", "for a couple of weeks", "for two weeks", "for three weeks"); "for a long time", "for a while", "for a month" or "for ages"; "won't", "doesn't", "isn't" or "not", followed by "go away", "going away", "getting better" or "improving"; "still"; "all the time"; "constantly". | "my voice has been hoarse for weeks"; "hoarse and it won't go away" |
| R-09.5 | "For weeks", "for months", "for a long time", "still", "always" or "constantly", then (within about 25 characters) "hoarse" or "raspy". | "still hoarse" |
| R-09.6 | "Hoarse", "hoarseness", "raspy", "croaky", "lost my voice" or "losing my voice". Or "voice" followed by "hoarse", "raspy", "croaky", "gone", "scratchy", "going", "going out", "almost gone", "different", "changed", "deeper", "weird" or "strange" ("is", "has been", "sounds", "sound", "got", "keeps getting" or "went" may stand in between). It does not count when a **slight word** stands right before it ("a little hoarse"). *(Fixed card: see 2.3.)* | "my voice is hoarse"; "I lost my voice"; "my voice sounds different" |
| R-09.7 | Trouble swallowing in other words. "Swallowing" plus "is", "feels", "got", "has been", "was" or "has gotten", plus "hard", "harder", "difficult", "tough" or "a struggle" ("really", "so", "very" or "getting" may stand in between). Or "food", "drink", "drinks", "water", "liquid" or "liquids", plus "gets", "get", "got", "keeps getting", "keep getting", "is getting", "feels", "feel", "keeps" or "keep", plus "stuck" or "sticking". Or "food" or "water", plus "sticks in my throat" or "stick in my throat". Or "hard", "harder", "tough", "difficult", "trouble", "can't", "cannot", "struggle", "struggles" or "struggling", plus "to get", "get", "getting" or "time getting", plus "food", "anything", "water", "liquid", "liquids", "meal" or "meals" ("my" may stand before), plus "down". Or "choke", "chokes", "choked" or "choking", followed by "on" and "food", "water", "drink", "drinks", "liquid", "liquids", "saliva", "spit", "everything", "anything", "meal", "meals", "dinner", "lunch", "breakfast", "bite" or "bites" ("my" or "the" may stand in between), or by "when I eat", "when I drink" or "when I swallow". | "swallowing is getting harder"; "food keeps getting stuck"; "choking on my food" |
| R-09.8 | "Swollen", "lumpy", "enlarged" or "bulging", followed by "neck" or "thyroid". Or "lump", "bump", "mass", "nodule", "knot" or "growth", then (within about 15 characters) "in thyroid", "on thyroid", "in my thyroid" or "on my thyroid". Or "swollen glands", "swollen gland", "swollen nodes", "swollen node", "swollen lymph nodes" or "swollen lymph node", then (within about 15 characters) "neck". Or "goiter" or "goitre". | "swollen glands in my neck"; "a nodule on my thyroid" |
| R-09.9 | "Swollen", "swelling", "puffy" or "enlarged", then (within about 25 characters) "front of", "side of" or "base of", plus "neck" ("my" or "the" may stand before "neck"). Or "neck" or "thyroid", plus "is", "feels", "looks", "seems" or "got", plus "swollen", "puffy", "enlarged", "thick", "bigger", "lumpy" or "fuller" ("so", "really", "a bit", "kind of" or "a little" may stand in between). Or "lump", "bump", "mass" or "knot", then (within about 15 characters) "in my throat" (also "in my throat area"), then (within about 25 characters) a **does-not-go-away phrase** or "when I swallow". | "swelling at the front of my neck"; "my neck feels swollen"; "a lump in my throat that won't go away" |
| R-09.10 | A lump on the throat or near the Adam's apple: "lump", "bump", "swelling", "mass", "nodule", "knot" or "growth", then (within about 15 characters) "on", "near", "by", "under", "below", "above", "beside" or "next to", plus "throat", "Adam's apple", "Adams apple", "windpipe" or "collarbone" ("my" or "the" may stand before). Or one of those words, then (within about 15 characters) "in", "at" or "on" plus "Adam's apple". "A lump in my throat" alone is not enough (see the pattern above). | "found a bump on my throat"; "lump near my adams apple" |
| R-09.11 | A lump felt on swallowing, or something stuck. "Feels", "feel", "felt" or "feeling", plus "like", then "a lump" or "something" (also "there's", "there is" or "I have" before, and "stuck", "caught" or "lodged" after "something"), then (within about 30 characters) "when I swallow", "whenever I swallow", "every time I swallow", "each time I swallow" or "if I swallow". Or "feels like something stuck" (also "feel", "felt", "feeling"; "there's" or "there is" before "something", "'s" or "is" after it, and "caught" or "lodged" for "stuck"). Or "something stuck in my throat" (also "something is", "something's" or "something keeps getting", and "caught" or "lodged"). | "my throat feels like there's a lump when I swallow"; "feels like something stuck" |
| R-09.12 | Swallowing that hurts: "hurt", "hurts", "hurting", "painful", "pain", "pains", "sore", "burn", "burns" or "burning", followed by "to", "when I", "whenever I", "every time I", "while I" or "while", plus a word that starts with "swallow". | "it hurts to swallow"; "painful to swallow" |
| R-09.13 | A lump under the jaw: "lump", "bump", "swelling", "mass", "nodule", "knot" or "growth", then (within about 15 characters) "under", "below", "beneath" or "along", plus "jaw", "jawline" or "chin" ("my" or "the" may stand before). | "lump under my jaw" |

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
| R-14.2 | A **pain word**, then "in", "around" or "across" and a **stomach word**, then (within about 30 characters) a **does-not-go-away phrase**. | "pain in my belly for 3 days" |
| R-14.3 | "Constant", "nonstop", "persistent", "lingering", "ongoing", "continuous", "never-ending" or "unrelenting", then (within about 12 characters) a **stomach word** joined to a **pain word**. | "constant stomach pain" |
| R-14.4 | A **severe word**, then (within about 12 characters) "constipation", "constipated", "bloating", "bloated", "heartburn", "acid reflux", "reflux", "indigestion", "gas pain", "gas pains", or a **stomach word** plus "problem", "problems", "issue", "issues", "trouble", "troubles" or "upset". *(Fixed card: see 2.3.)* | "severe constipation"; "severe stomach problems" |
| R-14.5 | "Constipation", "bloating", "heartburn", "acid reflux", "reflux", "indigestion", "gas pain", "gas pains", or a **stomach word** plus "problem", "problems", "issue", "issues", "trouble" or "troubles"; then (within about 20 characters) a **how-bad phrase**. *(Fixed card: see 2.3.)* | "stomach problems that are severe"; "my heartburn is terrible" |
| R-14.6 | A **stomach word**, "digestive" or "GI", plus "problem", "problems", "issue", "issues", "trouble", "troubles" or "upset"; or "upset" plus a **stomach word**; or "constipated", "constipation", "bloated", "bloating", "heartburn", "acid reflux", "reflux" or "indigestion". Then (within about 30 characters) a **does-not-go-away phrase**. *(Fixed card: see 2.3.)* | "stomach problems that will not go away"; "constipated for a week" |
| R-14.7 | A **vomiting word** followed by "blood" ("up", and "bright red", "a lot of", "some" or "dark", may stand in between). Or "pooping" or "pooped", followed by "blood" (the same words may stand in between). Or "blood", "coffee grounds" or "coffee-ground", then (within about 15 characters) "in" or "with", plus "vomit", "puke", "throw up", "throwup", "stool", "stools", "poop", "poo", "bowel movement", "bowel movements", "BM" or "diarrhea" ("my" or "the" may stand before). Or "vomit", "puke", "throw up", "throwup", "stool", "stools", "poop", "poo" or "diarrhea", then (within about 30 characters) "blood" or "bloody". *(Fixed card: see 2.3.)* | "vomited blood"; "blood in my stool"; "There was what looked like coffee grounds in my vomit."; "My vomit had streaks of bright red blood in it." |
| R-14.8 | "Bloody", "black", "tarry", "black tarry", "black and tarry" or "maroon", followed by "stool", "stools", "poop", "poops", "poo", "vomit", "diarrhea", "bowel movement" or "bowel movements". Or "stool", "stools", "poop", "poops", "poo", "vomit" or "puke", then (within about 15 characters) "is", "was", "are", "were", "looks", "look" or "looked", plus "black", "bloody", "tarry" or "like coffee grounds". *(Fixed card: see 2.3.)* | "black tarry stool"; "my poop is black" |
| R-14.9 | A **stomach word**, plus "has been", "have been", "is", "was", "'s been", "s been" or "been", plus "a mess", "a wreck" or "a disaster" (also "a total ..." or "a complete ..."), "messed up", "wrecked", "off", "upset", "acting up", "bothering me", or "giving me trouble", "giving me problems", "giving me issues" or "giving me fits"; then (within about 30 characters) a **does-not-go-away phrase**. *(Fixed card: see 2.3.)* | "my stomach has been a mess for 3 weeks"; "stomach has been messed up and it's not getting better" |
| R-14.10 | No bowel movement for 4 days or more. "Haven't", "have not", "hasn't", "has not", "didn't", "not" or "no", followed by "pooped", "poop", "gone to the bathroom", "gone number 2", "gone number two", "gone poop", "bowel movement", "bowel movements", "BM" or "BMs" ("had a", "had any", "been able to" or "really" may stand in between). Then (within about 15 characters) "in" or "for", plus one of: 4 to 9 days, or any number of days with two or more digits; "four" to "ten", "several" or "many" days; "a week"; a number, "two", "three", "a few" or "several" weeks. "Over", "almost", "about", "like", "more than" or "nearly" may stand before the count. *(Fixed card: see 2.3.)* | "haven't pooped in 5 days"; "no bowel movement for a week" |
| R-14.11 | "Can't pass gas" or "can't fart" ("even" may stand in between). Or "not" or "unable to", plus "pass gas" or "passing gas". Or a **stomach word**, then (within about 20 characters) "rock hard", "hard as a rock", "distended", "so swollen", "swollen and hard", "swollen and hurts", "swollen and painful", "swollen and tight" or "hard and swollen". *(Fixed card: see 2.3.)* | "can't pass gas"; "my belly is rock hard" |
| R-14.12 | A **vomiting word**, then (within about 20 characters) "food", "stuff", "meal", "meals", "dinner", "lunch", "breakfast" or "what", then (within about 15 characters) "from", "I ate" or "I had", plus "yesterday", "last night", "the day before" or "days ago", or a number, "two", "three", "a few" or "several" plus "days ago". *(Fixed card: see 2.3.)* | "throwing up food from yesterday"; "vomiting what I ate 2 days ago" |
| R-14.13 | "Gastroparesis"; "bowel obstruction", "bowel blockage", "intestinal obstruction" or "intestinal blockage"; "stomach paralysis"; "paralyzed stomach" or "paralysed stomach". *(Fixed card: see 2.3.)* | "I think I have gastroparesis" |
| R-14.14 | "Extremely", "severely", "incredibly", "painfully", "unbearably" or "insanely", followed by "bloated", "constipated", "backed up" or "gassy". Or "constipation", "bloating", "heartburn", "acid reflux", "reflux", "indigestion", "gas pain" or "gas pains", followed by "so bad". Or a **severe word** followed by "cramp", "cramps" or "cramping", but not when "in" and a leg, calf, calves, foot, feet, toe, toes, hand, hands, thigh, thighs, arm or arms follows ("severe cramps in my legs"). *(Fixed card: see 2.3.)* | "extremely bloated"; "severe cramps" |
| R-14.15 | A stomach pain, and anywhere in its sentence a word that makes it severe or lasting, or says what the person cannot do: a **stomach-pain phrase**, then (within about 100 characters) a **severe-or-lasting phrase**. It does not count when a **slight word** stands right before the stomach-pain phrase. This pattern and the next stand back when the pancreatitis rule already fires for the text, so "severe stomach pain" raises one rule, not two. | "The pain in my abdomen has me curled up on the bathroom floor."; "It feels as though someone is stabbing me in the stomach, and it has gone on all afternoon." |
| R-14.16 | The same in the other order: a **severe-or-lasting phrase**, then (within about 60 characters) a **stomach-pain phrase** (not when a **slight word** stands right before it). | "Since my injection on Tuesday I have had a constant, sharp pain in the pit of my stomach." |
| R-14.17 | Cramps with no body part named, so bad the person cannot cope: "cramp", "cramps" or "cramping", but not right after "leg", "legs", "calf", "calves", "foot", "feet", "toe", "toes", "hand", "hands", "thigh", "thighs", "arm", "arms", "neck", "muscle", "period" or "menstrual", and not when "in" plus one of those body parts follows; then (within about 40 characters) a **cannot-cope phrase**, "so bad", "really bad", "very bad", "super bad" (also "badly"), "killing me" or "unbearable". *(Fixed card: see 2.3.)* | "cramping so bad im on the bathroom floor crying 3 hrs" |

#### R-15 · `overdose`

- **Level:** `emergency`
- **Applies to:** every user
- **Raised from:** typed text (2.3)

Card, shown in the first public version:

> **Contact your doctor right away**
>
> What you logged can be a sign of a serious problem. Contact your doctor right away. If it is an emergency, call 911.

This card shows a "Call 911" button and pauses the day's workout and food tips.

What triggers it in typed text:

| Code | What the person typed | Examples that trigger (checked) |
|----|------------------------------------|--------------------|
| R-15.1 | "Double dose", "double dosed", "double dosing", "double doses" (also "double-dose", "doubledose"). Or "double", "doubled", "double up" or "doubled up" (also with "on"), followed by "dose", "doses", "dosage", "shot", "shots", "injection", "pill", "pills", "meds", "medication", "tablet" or "tablets" ("my", "the" or "a" may stand in between), but not when a doctor, nurse or other provider, "they", "she" or "he" stands right before it ("my doctor doubled my dose"). *(Fixed card: see 2.3.)* | "double dosed"; "I may have taken a double dose of Rybelsus this morning." |
| R-15.2 | "Took", "taken", "take", "taking", "injected", "inject", "injecting", "used", "gave myself", "given myself", "dosed", "shot myself with", "drew up", "drawn up", "pulled up", "dialed", "dialled", "clicked", "put in" or "pushed", followed by "too much", or by "too many" plus "units", "clicks", "pills", "tablets", "doses", "shots", "injections", "pens", "mg", "ml" or "mls" ("of my" or "of the" may stand after "too many"; "way", "far", "much", "a lot", "a bit", "slightly" or "a little" may stand in between), but not "too much time", "too much of my time", "too much off", "too much on my plate" or "too much for granted". *(Fixed card: see 2.3.)* | "I think I took too much"; "injected way too much"; "drew up way too much from the vial"; "I drew up too many units from the vial"; "I took too many of my shots" |
| R-15.3 | "Took", "taken", "injected", "did", "gave myself", "used", "dosed" or "shot", then "twice" ("my", "the", "a", "this week's", "today's", "it" or "myself", then "weekly", "daily", "morning", "evening", "usual" or "regular", then "shot", "dose", "injection", "pill", "tablet", "meds", "medication", "pen" or a brand name, may stand in between). Not "twice a day", "twice a week", "twice per day", "twice each day", "twice every day", "twice daily" or "twice weekly". *(Fixed card: see 2.3.)* | "took my shot twice today"; "accidentally injected twice this week" |
| R-15.4 | Two or more at once. "Took", "taken", "injected", "did", "gave myself", "used" or "had", then "2", "two", "3", "three", "4", "four" or "both", then "shots", "doses", "injections", "pens" or a brand name ("of my", "of the" and one more word may stand in between). Or "took", "taken", "swallowed" or "had", then such a count, then "pills" or "tablets", when the same sentence also says "instead", "by mistake", "accidentally", "by accident", "on accident", "forgot", "extra" or "already". Or "2", "two", "3", "three", "double" or "twice", then (within about 30 characters) "instead of 1", "instead of one", "instead of a single", "instead of the usual" or "instead of my usual". *(Fixed card: see 2.3.)* | "I took two doses by mistake"; "took 2 pills today instead of 1"; "Took 2 Foundayo today, forgot I took one" |
| R-15.5 | "Injected", "inject", "injecting", "used", "use", "took", "take", "gave myself", "give myself", "emptied", "empty" or "shot", followed by "the whole", "the entire", "the full" or "all of the" (also "my" or "a" for "the", or nothing: "inject whole pen"), plus "pen", "vial", "syringe", "cartridge" or "box". Or "clicked", "turned", "dialed" or "dialled", plus "the dial", "the pen" or "the dose" (also without "the"), plus "all the way". *(Fixed card: see 2.3.)* | "I injected the whole pen"; "I clicked the dial all the way"; "by mistake inject whole pen" |
| R-15.6 | "Overdose", "overdosed", "overdoses" or "overdosing", but not "overdosed on" sugar, carbs, chocolate, coffee, caffeine, candy, cake, pizza, sweets, junk, TV, Netflix, love, cuteness, sleep, food, fun or vitamin C. "OD'd" or "ODd" (also "O.D.'d"). *(Fixed card: see 2.3.)* | "overdosed on my ozempic" |
| R-15.7 | A **dose verb** or "give myself", followed by "extra" or "additional" plus "shot", "dose", "injection", "pill" or "tablet" ("a", "an", "one" or "my" may stand before "extra"). Not when "of" plus "espresso", "coffee", "caffeine", "vodka", "tequila", "whiskey", "rum", "gin", "wheatgrass", "ginger", "b12" or "vitamin" follows ("had an extra shot of espresso"). *(Fixed card: see 2.3.)* | "took an extra dose by mistake"; "I take extra shot because I think I miss it but I didn't" |
| R-15.8 | "More", "higher", "bigger", "larger" or "stronger" (perhaps with "dose"), then "than prescribed", "than I was prescribed", "than I am prescribed", "than what I was prescribed", "than what was prescribed", "than my dose", "than my prescription", "than my doctor said", "than my doctor prescribed", "than I should", "than I should have", "than I was supposed to" or "than I was supposed to have". Or "wrong dose", then (within about 30 characters, in the same sentence) "more", "higher", "too much", "extra", "double" or "bigger". Or "too high", "too big", "too large" or "too strong", plus "dose" or "a dose". *(Fixed card: see 2.3.)* | "gave myself the wrong dose, way more than prescribed" |
| R-15.9 | By mistake, and again or more. A **mistake phrase**, then (within about 40 characters) "took", "taken", "injected", "did", "dosed" or "gave myself", then (within about 30 characters, in the same sentence) a **one-more phrase**. Or those words for taking first, then (within about 40 characters) a **one-more phrase**, then (within about 30 characters) a **mistake phrase**. *(Fixed card: see 2.3.)* | "accidentally took my weekly dose again yesterday"; "took mounjaro 2 days in a row by mistake"; "I took my weekly shot on Monday and then forgot and took it again on Wednesday"; "took a second wegovy shot because i forgot i already did it sunday" |
| R-15.10 | "On top of mine", or "on top of my" plus "dose", "shot", "pill" or "injection" ("own", "usual", "regular" or "normal" may stand before it). *(Fixed card: see 2.3.)* | "took my wife's pen dose on top of mine" |
| R-15.11 | A dose, then more than one dose's worth in the same part of the sentence. A **dose verb**, then (within about 30 characters) "2x" to "10x" (also "x2" to "x10"), "triple", "twice", "two times", "three times" or "2 times" to "9 times", then "my", "the", "a", "what my" or "as much as my" (or nothing), then perhaps "usual", "normal", "regular", "prescribed", "weekly" or "daily", then a **dose word** or "amount". Or a **dose verb**, then (within about 40 characters) a **two-doses phrase**. Or a **dose verb**, then "my", "the", "a", "this" or "another" (or nothing), then perhaps "weekly", "daily" or "usual", then a **dose word**, then up to two more words, then "twice", "two times", "2 times", "three times", "3 times" or "2x" to "9x", plus "today", "in one day", "in a day", "in the same day", "this morning" or "tonight". *(Fixed card: see 2.3.)* | "took like 3x my dose"; "pretty sure i took tomorrows dose today too, so two in one day"; "I mistakenly took my medication three times today"; "I used my new pen and my old pen on the same day" |
| R-15.12 | An extra dose with the words for a mistake, and no verb: "extra", "additional", "second", "another" or "double", plus "dose", "shot", "injection", "pill" or "tablet", then (within about 40 characters, in the same sentence) "accidentally", "by accident", "by mistake", "mistakenly" or "on accident". Or one of those words first, then (within about 40 characters) the extra dose. *(Fixed card: see 2.3.)* | "extra dose by accident now so sick" |
| R-15.13 | "Overdid", "overdo", "overdone" or "overdoing", plus "my", "the" or "on" (perhaps after "it with" or "it on"), plus a **dose word** or "insulin". *(Fixed card: see 2.3.)* | "overdid my dose, what do i do" |
| R-15.14 | Two amounts, the one taken larger than the one meant. A **dose verb**, "dial", "dials" or "put", then (within about 20 characters) a number, perhaps with "mg", "unit", "units", "u", "ml", "cc", "click", "clicks", "pill", "pills", "tablet" or "tablets" (and perhaps "of the", "of my" or "of this" plus one to three words), then "instead of" (also "instead" alone), "rather than" or "not", then perhaps "the", "my" or "a" and "usual", "normal", "regular" or "prescribed", then a second number. It counts only when the first number is larger than the second ("did 2.5 instead of .25" counts; "took 1 instead of 2" does not). *(Fixed card: see 2.3.)* | "injected 50 units instead of 5"; "dialed the wrong dose did 2.5 instead of .25"; "I dial to wrong number 2.4 instead 0.25" |
| R-15.15 | Two amounts joined by other words, the one taken larger than the one meant. A **dose verb**, "dial", "dials" or "put", then (within about 20 characters) a number with "mg", "unit", "units", "u", "ml", "cc", "click" or "clicks", then (within about 15 characters) "but", "and", "when", "while", "though", "although", "even though" or "yet", then perhaps "my" or "the" and "real", "right", "correct", "prescribed", "usual", "normal", "regular" or "weekly", then "dose", "dosage" or "prescription" plus "is", "was", "should be" or "is supposed to be", or "I'm", "I am" or "I was" plus "on", "prescribed" or "supposed to take", "do" or "use" ("only" may stand before these), then perhaps "only", then a second number. It counts only when the first number is larger ("injected 15 mg but my dose is 5" counts; "took 1 mg but my dose is 2" does not). *(Fixed card: see 2.3.)* | "I injected 15 mg but my dose is 5"; "took 2 mg when I am only on 0.5" |
| R-15.16 | Two or more doses close together, by count. A **dose verb**, "inject", "injects" or "give myself", then (within about 30 characters) "2", "two", "3", "three", "4", "four" or "both", then perhaps "of my" or "of the" and one more word, then "shot", "injection", "dose", "pen", "time", "tablet", "pill" or a **medication name**, singular or plural. Or the same count with no verb, at the start of the text or after a comma or the end of a sentence (perhaps after "I" or "and"). Later in the same sentence there must be a **close-together word**. A count of tablets or pills counts only when a **medication name** is in the sentence; a count of "times" only after "inject", "injects" or "give myself", or when "shot", "injection", "dose", "pen" or a **medication name** is in the sentence ("took the dog out 3 times today" does not count). With no verb, only shots, injections, doses and pens count. *(Fixed card: see 2.3.)* | "I inject two time today by mistake"; "took my rybelsus 3 tablet today"; "two injection same day, oops"; "I injected two times today by mistake" |
| R-15.17 | A dose, then again a day or hours later. A **dose verb**, "inject" or "injects", then (within about 40 characters) a **dose word**, a **medication name** or "it", then (within about 30 characters) "again", plus "next day", "same day", "following day" (also "morning", "night" or "evening", and perhaps "the" or "on the" before), "day after", "a day later", "one day later", "an hour later", "a few hours later", "2 hours later" and the like, or "that night", "that evening" or "that afternoon". "Again today" alone does not count: a weekly dose is taken "again" each week. *(Fixed card: see 2.3.)* | "I took my weekly dose and then again next day"; "injected my shot and again a few hours later" |
| R-15.18 | A higher strength instead of the one prescribed: a **dose verb**, then (within about 30 characters) "higher", "bigger", "larger" or "stronger", plus "strength", "dose", "dosage" or "pen", then (within about 20 characters) "instead of", "rather than", "by mistake" or "accidentally". *(Fixed card: see 2.3.)* | "I injected the full higher strength instead of the starting dose" |
| R-15.19 | A dose, then "and again" with a second time. A **dose verb**, "inject" or "injects", then (within about 40 characters) a **dose word**, a **medication name** or "it", then (within about 40 characters) "and", "then" or "but" (perhaps with "then", and perhaps "I" plus a **dose verb** and "it" or "one"), then "again" plus "tonight", "this evening" or "this afternoon" (perhaps after "later"), "later" (also "later that day", "later in the evening" and the like), "a few hours later", "2 hours later" and the like, a weekday (perhaps after "on"), or "1" to "5" days later or after ("a couple of days later", "a few days after"). It does not count when the first dose was "last week", "last month", "last time", last plus a weekday, or weeks ago, or when the second weekday is the one already named before "and": that is the weekly routine ("I took my shot last Sunday and again today", "on Sunday and again on Sunday"). *(Fixed card: see 2.3.)* | "I took my shot this morning and again tonight"; "I took my dose today and then again tonight"; "I took my weekly shot on Monday and again on Wednesday" |
| R-15.20 | A dose taken again only days after the last one. A **dose verb**, "inject" or "injects" (perhaps with "my", "the", "a", "another" or "it", "weekly" or "daily", and a **dose word** or a **medication name**), then "again", then perhaps "only" or "just", then "1" to "5" days ("a couple of days", "a few days"), "a day" or "the day", then "after", "later" or "since". *(Fixed card: see 2.3.)* | "I injected again 2 days after my last shot"; "I injected again a day after my last dose" |
| R-15.21 | Two days' doses at once. A **dose verb** or "inject", then (within about 20 characters) "yesterday's", "tomorrow's", "last week's" or "next week's" (also without the apostrophe), perhaps with a **dose word** or "one", then "and", "plus", "&", "with" or "along with", then perhaps "my" or "the", then "today's", "tonight's" or "this week's". Or the same with the two days the other way round. *(Fixed card: see 2.3.)* | "I took yesterday's pill and today's pill this morning"; "took last week's shot and this week's shot today" |
| R-15.22 | A second dose from someone else after one's own. A **dose verb**, then (within about 40 characters) a **dose word** or a **medication name**, then (within about 60 characters) "gave", "given", "injected" or "did", plus "me", plus "another", "a second", "an extra" or "one more" (perhaps with "one", "dose", "shot", "injection", "pill" or "tablet"). Or "gave", "given" or "injected", plus "me", plus "another", "a second", "an extra" or "one more", plus "dose", "shot", "injection", "pill", "tablet" or "one", then (within about 40 characters, in the same sentence) a **mistake phrase**. "The nurse gave me another shot today" alone does not count. *(Fixed card: see 2.3.)* | "I took my dose and then my husband gave me another one" |
| R-15.23 | Two or more pills on one day. "Took", "taken", "swallowed" or "had", then "2", "two", "3", "three", "4", "four" or "both" (perhaps "of my" or "of the", and one more word), then "pills" or "tablets", when later in the same sentence there is "today", "tonight", "this morning", "this evening", "this afternoon", "at once", "at the same time", "same day", "in one day", "in a day" or "back to back". It does not count when the sentence names another medicine or a reason for it: Tylenol, Advil, Motrin, Aleve, ibuprofen, acetaminophen, aspirin, Excedrin, Benadryl, Claritin, Zyrtec, Allegra, Imodium, Pepto, Tums, Dramamine, melatonin, vitamins, supplements, iron, fiber, probiotics, magnesium, stool softeners, laxatives, antibiotics, Zofran, ondansetron, metformin, birth control, sleeping or allergy pills, antacids, painkillers, or "for" plus a headache, pain, back, a cold, flu, allergies, a period, cramps, nausea, stomach, heartburn, sleep, fever, blood pressure, cholesterol or anxiety ("I took two pills today for my headache"). *(Fixed card: see 2.3.)* | "I took two pills today"; "took 2 tablets this morning" |

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
| O-06 | "I do not want to die" | Fires: R-01 `crisis` (`crisis`) | A "do not" that begins the self-harm words does not stop the rule. The support card is shown. |
| O-07 | "never had chest pain like this before" | Fires: R-03 `chest_or_faint` (`emergency`) | "Never ... like this" means the pain is there now. |

**Not caught on purpose**

| Code | What a person may write | Examples (checked: each raises nothing) | Why |
|----|----------------|------------------------|------------------------|
| O-08 | Low mood or depression, without words about harming oneself | "I feel hopeless"; "depressed"; "Feeling very depressed lately, can't get out of bed"; "feel so down, crying all the time since starting" | No item of the seven guides names low mood or depression (only "irritability or mood changes", as a sign of low blood sugar), and the self-harm rule is kept to words about ending one's life or harming oneself, so the app raises no card; the reviewer is asked whether it should. |

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
| X-02 | "hoarse from cheering at the game" | Fires: R-09 `thyroid` (`urgent`) |
| X-03 | "drank too much and passed out on the couch" | Fires: R-03 `chest_or_faint` (`emergency`) |
| X-04 | "really bad stomach cramps from my period" | Fires: R-02 `pancreatitis` (`emergency`) |
| X-05 | "itchy all over after the shower" | Fires: R-04 `anaphylaxis` (`emergency`) |
| X-06 | "wheezing from my asthma" | Fires: R-04 `anaphylaxis` (`emergency`) |
| X-07 | "poop is black from iron pills" | Fires: R-14 `abdominal_pain_severe` (`urgent`) |
| X-08 | "sedated at the dentist last month" | Fires: R-11 `procedure` (`remind`) |
| X-09 | "throwing up everything" | Fires: R-07 `dehydration` (`urgent`) |
| X-10 | "can't pass gas and my belly is swollen" | Fires: R-14 `abdominal_pain_severe` (`urgent`) |
| X-11 | "no bowel movement for a week" | Fires: R-14 `abdominal_pain_severe` (`urgent`) |
| X-12 | "slurred speech" | Fires: R-03 `chest_or_faint` (`emergency`) |
| X-13 | "my blood sugar was 60 this morning" | Fires: R-06 `hypoglycemia` (`urgent`) |
| X-14 | "I took a double dose by mistake" | Fires: R-15 `overdose` (`emergency`) |
| X-15 | "I think I took too much" | Fires: R-15 `overdose` (`emergency`) |
| X-16 | "heart was pounding after cardio" | Stays quiet |
| X-17 | "watched a show about suicide prevention" | Stays quiet |
| X-18 | "my son can't breathe" | Stays quiet |
| X-19 | "how do I know if it is an allergic reaction" | Stays quiet |
| X-20 | "nauseous all day" | Stays quiet |
| X-21 | "throwing up and stomach pain" | Stays quiet |
| X-22 | "threw up 4 times" | Stays quiet |
| X-23 | "dark urine" | Stays quiet |
| X-24 | "a rash on my arms and chest" | Stays quiet |
| X-25 | "I feel confused" | Stays quiet |
| X-26 | "feeling hopeless" | Stays quiet |
| X-27 | "feeling depressed" | Stays quiet |
| X-28 | "I missed my shot two weeks in a row" | Stays quiet |

### 2.6 The warning signs shown in the app: the words of the Medication Guides

The app has one screen named "Warning signs in the Medication Guide". A person opens it from the "Me" tab, or with the button on an alert (2.1). It shows three parts of the FDA Medication Guide of the person's own medication: the "most important information", the serious side effects, and the sentence about taking too much under the heading it has in the guide. Only a profile whose region is the United States sees a guide: for every other region the screen shows the line that no guide is on file (below), also for a brand sold there under the same name. The sentence about taking too much is quoted for every guide at the end of section 2.7. The text is the guide's own, in the guide's order, with its sub-bullets as bullets. The app adds no word to the list, sets nothing in bold and marks no item as more urgent than another.

**Status of everything quoted in this section:** Copied from the FDA Medication Guide on 2026-11-22; not yet confirmed by a reviewer. A script took the words from the label files published on DailyMed, and a second script checked every one of them against those files. No person outside our team has compared them with the guides.

Above the list the screen says where it is from. These words are ours:

| Code | Where | Screen text |
|----|------------------------|----------------------------------------|
| T-01 | First line, for every guide | "From the Medication Guide for [brand], [revised or issued, and the date of the guide]. These are the manufacturer's words, approved by the FDA. Nothing here is written by this app." |
| T-02 | The same line for Wegovy | "From the Medication Guide for Wegovy, revised 06/2026. These are the manufacturer's words, approved by the FDA. Nothing here is written by this app." |
| T-03 | Second line, followed by the page address as a link | "These are three parts of the guide: the most important information, the serious side effects, and what to do if you take too much. The full guide comes with your prescription. It is also at this address:" |
| T-04 | No guide to show: any region other than the United States, no medication set up, "Other / custom", a medication with no US brand | "This app has no Medication Guide on file for your medication. The Medication Guide comes with your prescription." |
| T-05 | Tirzepatide in the United States, when the person has not said whether it is Zepbound or Mounjaro | “The Medication Guides for Zepbound and Mounjaro are separate. So the list needs to know your brand. To choose it, go to Me and tap "Change medication or redo setup".” |

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
| K-18 |   |   | "slurred speech" | R-06 `hypoglycemia`, R-03 `chest_or_faint` | Alone it raises the card through the rule for general emergency signs: speech that is suddenly slurred is a sign of a stroke. |
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

**The other instructions of the guides.** Outside the two parts, the guides tell the patient in a few more places to tell, call or talk to someone. Only one of these names signs: the Wegovy sentence about taking too much (severe nausea, severe vomiting, severe low blood sugar). The app shows the sentence about taking too much on the screen (2.6), and a rule raises the alert when a person writes that they took too much; it shows none of the others, and raises no alert for them:

| Code | Kind of instruction | In the guides for | Example, word for word | What the app does |
|----|----------------|------------|------------------------------------|------------------------|
| K-35 | Before use condition (tell, call or talk to the healthcare provider (no "right away")) | all 7 guides | Wegovy, Wegovy pill: under "Before using WEGOVY, tell your healthcare provider if you have any other medical conditions, including if you:": "have or have had problems with your pancreas or kidneys." | No rule. A condition to tell the healthcare provider about before starting the medication, not a sign. |
| K-36 | Pregnancy (tell, call or talk to the healthcare provider (no "right away")) | Wegovy, Wegovy pill; Ozempic; Rybelsus, Ozempic pill; Zepbound; Mounjaro; Foundayo | Wegovy, Wegovy pill: under "Before using WEGOVY, tell your healthcare provider if you have any other medical conditions, including if you:": "are pregnant or plan to become pregnant. WEGOVY may harm your unborn baby. You should stop using WEGOVY 2 months before you plan to become pregnant." | No alert. The reminder rule R-10 `pregnancy` matches such text; it shows no alert in the first public version. Not a sign: something to tell the healthcare provider about. |
| K-37 | Pregnancy registry (tell, call or talk to the healthcare provider (no "right away")) | Wegovy, Wegovy pill; Zepbound; Foundayo | Wegovy, Wegovy pill: under "Before using WEGOVY, tell your healthcare provider if you have any other medical conditions, including if you:": "Pregnancy Exposure Registry: There is a pregnancy exposure registry for women who use WEGOVY during pregnancy. The purpose of this registry is to collect information about the health of you and your baby. Talk to your healthcare provider about how you can take part in this registry or you may contact Novo Nordisk at 1-877-390-2760 or www.wegovypregnancyregistry.com." | No alert. The reminder rule R-10 `pregnancy` matches such text; it shows no alert in the first public version. Not a sign: an invitation to take part in a registry. |
| K-38 | Breastfeeding (tell, call or talk to the healthcare provider (no "right away")) | all 7 guides | Wegovy, Wegovy pill: under "Before using WEGOVY, tell your healthcare provider if you have any other medical conditions, including if you:": "are breastfeeding or plan to breastfeed. Breastfeeding is not recommended during treatment with WEGOVY tablets. It is not known if WEGOVY when received through an injection passes into your breast milk. You should talk with your healthcare provider about the best way to feed your baby while using WEGOVY." | No alert. The reminder rule R-10 `pregnancy` matches such text; it shows no alert in the first public version. Not a sign: something to talk over with the healthcare provider. |
| K-39 | Birth control (tell, call or talk to the healthcare provider (no "right away")) | Zepbound; Mounjaro; Foundayo | Zepbound: under "Before using ZEPBOUND, tell your healthcare provider about all of your medical conditions, including if you:": "Birth control pills by mouth may not work as well while using ZEPBOUND. If you take birth control pills by mouth, your healthcare provider may recommend another type of birth control for 4 weeks after you start ZEPBOUND and for 4 weeks after each increase in your dose of ZEPBOUND. Talk to your healthcare provider about birth control methods that may be right for you while using ZEPBOUND." | No alert. The reminder rule R-12 `contraception` matches such text; it shows no alert in the first public version. Not a sign: something to talk over with the healthcare provider. The reminder rule applies to tirzepatide only. |
| K-40 | Medicines (tell, call or talk to the healthcare provider (no "right away")) | all 7 guides | Wegovy, Wegovy pill: under "Before using WEGOVY, tell your healthcare provider if you have any other medical conditions, including if you:": "Tell your healthcare provider about all the medicines you take, including prescription and over-the-counter medicines, vitamins, and herbal supplements. WEGOVY may affect the way some medicines work and some medicines may affect the way WEGOVY works. Tell your healthcare provider if you are taking other medicines to treat diabetes, including sulfonylureas or insulin. WEGOVY slows stomach emptying and can affect medicines that need to pass through the stomach quickly." | No rule. Not a sign: the patient is asked to tell the healthcare provider about other medicines. |
| K-41 | Diabetes medicines (tell, call or talk to the healthcare provider (no "right away")) | Ozempic; Rybelsus, Ozempic pill; Zepbound; Mounjaro; Saxenda; Foundayo | Ozempic: under "Before using OZEMPIC, tell your healthcare provider if you have any other medical conditions, including if you:": "Before using OZEMPIC, talk to your healthcare provider about low blood sugar and how to manage it. Tell your healthcare provider if you are taking other medicines to treat diabetes, including insulin or sulfonylureas." | No rule. Not a sign: the patient is asked to talk about low blood sugar and diabetes medicines before starting. |
| K-42 | Overdose (get medical help, or go to an emergency room, "right away") | all 7 guides | Wegovy, Wegovy pill: under "How should I use WEGOVY?": "If you take too much WEGOVY, you may have severe nausea, severe vomiting and severe low blood sugar. Call your healthcare provider or Poison Help line at 1-800-222-1222 or go to the nearest hospital emergency room right away. Advice is also available online at poisonhelp.org." | The rule R-15 `overdose` raises the alert (the fixed card, in every version). Taking too much is an event, not a sign; the rule for it raises the fixed card when a person writes that they took too much, and the screen shows the sentence word for word as a third part. The guides say to call the healthcare provider or the Poison Help line, or to go to the nearest emergency room, right away. |
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

Every rule that shows an alert in the first public version must stand for an item of the guides, or for one of their other instructions (the rule for taking too much), or carry the mark "general emergency sign, not from a Medication Guide" with the reason it is kept. A rule with neither would be taken out of the first public version. Today none is. An item is named here by a short name of ours; where it is not in every guide, the guides that have it follow in brackets.

| Rule | Alert in the first public version | Guide items it stands for | Parts with no guide behind them |
|------------|------------|--------------------------------|--------------------------------|
| R-01 `crisis` | Its own card | None | **General emergency sign, not from a Medication Guide**: the whole rule. None of the seven guides has an item about thoughts of self-harm; words about ending one's life are an emergency whatever the medication, and the rule shows its own card with the crisis line, not the fixed card. |
| R-02 `pancreatitis` | The fixed card | Inflammation of the pancreas (pancreatitis); Severe stomach problems |   |
| R-03 `chest_or_faint` | The fixed card | Low blood sugar; Serious allergic reactions; Increased heart rate (Wegovy, Wegovy pill; Saxenda) | **General emergency sign, not from a Medication Guide**: chest pain, pressure or tightness. No guide names chest pain; it is kept because chest pain can be an emergency whatever the medication. **General emergency sign, not from a Medication Guide**: a blood pressure of 180/120 or more, a feeling of dying with words about the heart, chest or breathing, and saying one is in the emergency room now. No guide names these; they are kept because each can be an emergency whatever the medication. |
| R-04 `anaphylaxis` | The fixed card | Thyroid tumors; Serious allergic reactions |   |
| R-05 `vision` | The fixed card | Low blood sugar; Changes in vision (Wegovy, Wegovy pill; Ozempic; Rybelsus, Ozempic pill; Zepbound; Mounjaro; Foundayo) |   |
| R-06 `hypoglycemia` | The fixed card | Low blood sugar; Serious allergic reactions |   |
| R-07 `dehydration` | The fixed card | Low blood sugar; Dehydration leading to kidney problems; Severe stomach problems; Serious allergic reactions | **General emergency sign, not from a Medication Guide**: passing very little urine, dark brown urine, and kidney pain or kidney lab results that are off. The guides warn of "dehydration leading to kidney problems" but name no sign about urine or the kidneys; passing very little urine, urine as dark as tea or cola, and kidney pain or kidney lab results that are off are kept as signs of those kidney problems. |
| R-08 `gallbladder` | The fixed card | Gallbladder problems |   |
| R-09 `thyroid` | The fixed card | Thyroid tumors; Serious allergic reactions |   |
| R-10 `pregnancy` | None | None as an alert. As a reminder it matches text about: pregnancy, pregnancy registry, breastfeeding (2.7) |   |
| R-11 `procedure` | None | None as an alert. As a reminder it matches text about: aspiration anesthesia (2.7) |   |
| R-12 `contraception` | None | None as an alert. As a reminder it matches text about: birth control (2.7) |   |
| R-13 `eating_too_little` | None | None | **Not from a Medication Guide**: the whole rule. No guide has an item about eating very little for days; the rule is a reminder of the full test build and shows no card in the first public version. |
| R-14 `abdominal_pain_severe` | The fixed card | Inflammation of the pancreas (pancreatitis); Gallbladder problems; Severe stomach problems | **General emergency sign, not from a Medication Guide**: blood in vomit or stool, and black or tarry stool. No guide names bleeding; it is kept because it is a stomach problem no one should wait on, whatever the medication. |
| R-15 `overdose` | The fixed card | No item of the two parts. It stands for the guides' instruction about overdose: taking too much (2.7) |   |

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

The alerts of "Nausea" and "Dizziness" (only where it raises R-07 `dehydration`) are marked to show the fixed card (2.2): the card written for R-07 `dehydration` does not name nausea or dizziness.

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
| Q-02 | The trigger phrases, the level of each rule and the English card texts in section 2 have never been reviewed. Which danger signs are missing? Which rules sit at the wrong level? Which card text could harm or mislead a person? | `src/core/triage.ts` line 4, 98, 1950 |
| Q-03 | The emergency number on the cards is marked as still to be verified. For a US user it is 911. On which cards is "call 911" the wrong instruction, and what should those cards say? | `src/core/triage.ts` line 1796 |
| Q-04 | The crisis line on the self-harm card is marked as still to be verified. For a US user the card says "crisis line 988". Is that the right line, and the right way to name it? | `src/core/triage.ts` line 1818, 1829 |
| Q-05 | Section 2.6 holds the warning signs of each Medication Guide as the app shows them. A script copied them from the label files on 2026-11-22 and a second script checked the copy; no reviewer has compared them with the guides. Please check each list against the current guide. Is any item missing, changed or out of order? Is any guide out of date? | `src/core/medGuide.ts` line 42 |
| Q-06 | The tables in sections 2.7 and 2.8 are our reading of the guides: how we read each instruction ("right away" or not), which rule stands for which sign, and the reason where no rule does. Which rows are wrong? | `src/core/guideCoverage.ts` line 24 |
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
| Q-14 | In the first public version a person can report a danger sign in two ways only: with a symptom button (section 2.2), or by typing it where the app checks typed text (section 2.3). No button leads to R-01 `crisis`, R-02 `pancreatitis`, R-03 `chest_or_faint`, R-04 `anaphylaxis`, R-05 `vision`, R-08 `gallbladder`, R-09 `thyroid`, R-10 `pregnancy`, R-11 `procedure`, R-12 `contraception`, R-13 `eating_too_little`, R-15 `overdose`. Which danger signs need their own button before launch? |
| Q-15 | In the first public version R-10 `pregnancy`, R-11 `procedure`, R-12 `contraception`, R-13 `eating_too_little` show no alert (section 2.1): their own cards are hidden until reviewed, and the fixed card with its call button does not fit a reminder. A person who types text that matches only these rules sees nothing. Is that acceptable for the first public version? If one of them needs to show something at launch, which one, and what should it say? |
| Q-16 | An alert raised from the box for questions for the doctor leaves no reminder on the main screen once it is closed (section 2), while an alert from a symptom button stays at the top for the rest of the day. In the first public version that box is the only way to raise R-01 `crisis`, R-02 `pancreatitis`, R-03 `chest_or_faint`, R-04 `anaphylaxis`, R-05 `vision`, R-08 `gallbladder`, R-09 `thyroid`, R-15 `overdose`. Is it acceptable that these alerts are shown once and then gone? |
| Q-17 | The first public version shows one fixed card for every sign: "Contact your doctor right away", with the call button (2.1). For these items the guides say only "tell your healthcare provider", for some medications or for all (2.7), so the card says more than the guide: thyroid tumors; gallbladder problems; low blood sugar; severe stomach problems; changes in vision; increased heart rate. Is one card for all of them acceptable? And is "contact your doctor right away" strong enough where the guides say "get medical help right away" (serious allergic reactions)? |
| Q-18 | For inflammation of the pancreas (pancreatitis) and for serious allergic reactions the guides' instruction begins "Stop using" or "Stop taking". The fixed card does not say that: the app gives no advice about doses. The button under the card opens the guide's own words (2.6). Is that enough? |
| Q-19 | The app shows three parts of each Medication Guide: the most important information, the serious side effects, and the sentence about taking too much (2.6). Is that the right selection? Should it also show the list of the most common side effects, so that a person does not take the short list for the whole guide? |
| Q-20 | These rules, or parts of rules, raise an alert although no Medication Guide names the sign (2.8): R-01 `crisis`: the whole rule; R-03 `chest_or_faint`: chest pain, pressure or tightness; R-03 `chest_or_faint`: a blood pressure of 180/120 or more, a feeling of dying with words about the heart, chest or breathing, and saying one is in the emergency room now; R-07 `dehydration`: passing very little urine, dark brown urine, and kidney pain or kidney lab results that are off; R-14 `abdominal_pain_severe`: blood in vomit or stool, and black or tarry stool. Is each of them right to keep? Is a sign of this kind missing? |
| Q-21 | For low blood sugar the guides list signs but, for most medications, give no instruction to call anyone. The rule R-06 `hypoglycemia` fires on the words "low blood sugar" and on two signs together; hunger, headache, weakness and anxiety or mood changes count only next to another sign (2.4). Is two the right number? Should any single sign raise the alert on its own, for example slurred speech or confusion? A reading under 70 raises it ("my blood sugar was 60"). Is 70 the right line? |
| Q-22 | Where a guide names a sign without saying how bad it must be, the rules fire on the plain word: any fever, any hoarseness, any dizziness, a racing heart, any change in vision (2.4). Dizziness, a racing heart and hoarseness stay quiet only when the person calls them slight. Is that too wide, or right for a reminder that is meant to come once too often? |
| Q-23 | For nausea, vomiting and diarrhea the guides say "that does not go away". The rules read that as: vomiting or diarrhea that keeps on, lasts all day, or comes five times or more; nausea only with words for more than one day ("nauseous all day" stays quiet, "nauseous for 4 days" fires). Are these lines in the right place? |
| Q-24 | Two symptom buttons were added to the ones that raise an alert at "Severe" (2.2, 2.8): nausea, because the guides name it with vomiting and diarrhea, and dizziness for every person, because "fainting or feeling dizzy" is a sign of a serious allergic reaction in every guide and no other button leads there. Severe nausea is common on these medications. Is an alert for it right? The buttons for constipation and acid reflux raise nothing, while the typed words "severe constipation" do. Which way should both go? |
| Q-25 | A match does not count when the text is about someone else, about a time long past, or a general question (2.3). So "my son can't breathe" and "what are the signs of low blood sugar?" raise nothing. Is that acceptable? The lists in section 2.5 show where the line sits. |
| Q-26 | Some guides tell the patient to call the healthcare provider after missing doses for some time (2.7). The app has no rule for missed doses, and typed words such as "I missed two doses" raise nothing. Should they raise the alert? |
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
| Q-39 | The rule for taking too much R-15 `overdose` raises the fixed card ("Contact your doctor right away", with the call button) when a person writes that they took too much, took a dose twice, or took an extra dose (its patterns are in 2.4). The guides say to call the healthcare provider or the Poison Help line, or to go to the nearest emergency room, right away (2.7). Is the fixed card enough here, or should this alert name the Poison Help line (1-800-222-1222 in the United States) or the emergency room? |
| Q-40 | Low mood or depression, without words about harming oneself raises nothing today: "I feel hopeless", "depressed", "Feeling very depressed lately, can't get out of bed", "feel so down, crying all the time since starting". No item of the seven guides names low mood or depression (only "irritability or mood changes", as a sign of low blood sugar), and the self-harm rule is kept to words about ending one's life or harming oneself, so the app raises no card. Should such words raise a card, for example a gentler one with the crisis line, or a note to talk to the doctor? |
| Q-41 | A person can check "A history of an eating disorder" at setup (section 6.7). Almost nothing changes when they do. What should the app do differently for them, for example with the goal weight, the weight chart or the fast-drop line? |

### 7.3 Anything else

Please add anything you saw that no question covers. A short note with the item code is enough.

