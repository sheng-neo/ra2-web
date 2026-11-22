> **Draft for a US lawyer to review.** This is not legal advice. Do not rely on it before that review.

# Incident plan (internal, one page)

Last reviewed: [EFFECTIVE DATE]. Review it again before any new kind of data is collected (email backup, AI features).

## Who is responsible

- **Incident lead:** [INCIDENT LEAD ROLE]. Decides, keeps the log, sends the notices.
- **Backup:** [BACKUP ROLE], if the lead cannot be reached within 24 hours.
- **Lawyer to call:** [LAWYER CONTACT].

## What we hold

Usage counts tied to random install IDs, support email, and server logs. All of it is treated as health data. Users' records are on their phones. We do not hold a copy.

## What counts as an incident

Any sign that health data reached someone it should not have, with or without a hacker. Examples:

- Someone outside got into the server, the database or the support mailbox.
- The app sent counts without consent, or sent more than the privacy policy lists.
- A tool or library in the app sent data to another company.
- Counts were not deleted after a user turned them off.
- A laptop or phone holding server keys was lost.
- The hosting or email company told us about a breach on their side.

## How we check a suspected breach

1. **Write down the date and time we first knew.** The 60-day clock starts here.
2. **Stop it.** Turn off the endpoint, change the keys, or pull the app version.
3. **Keep the evidence.** Save logs and copies. Delete nothing.
4. **Find the facts.** What data, how many install IDs, from when to when, who got it, and was it encrypted.
5. **Call the lawyer.** Decide together whether this is a breach under the Health Breach Notification Rule or a state law.
6. **Notify, fix and write it up.**

Internal target: facts within 7 days, notices within 30 days. [LAWYER: confirm the targets.]

## Who we notify, and when

Under the Federal Trade Commission's Health Breach Notification Rule, as we understand it [LAWYER: confirm each line]:

| Who | When |
|---|---|
| Each affected user | Without unreasonable delay, and no later than 60 calendar days after we found the breach |
| The Federal Trade Commission, if 500 or more people are affected | At the same time as the users, through the breach form on ftc.gov |
| The Federal Trade Commission, if fewer than 500 | In a yearly log, within 60 days after the end of the calendar year |
| News media in a state, if 500 or more of its residents are affected | Within the same 60 days |

**How we reach users.** We have no names, emails or phone numbers. So the notice goes in the app (through an update), on the website home page for at least 90 days, and in the app store listing. People whose support emails were involved get an email. [LAWYER: is this enough, and do we need a toll-free phone number?]

**Also check:** state breach laws and state attorneys general (some deadlines are shorter than 60 days), the Hong Kong privacy regulator, and what our app store and hosting contracts require. [LAWYER]

## Checklist

- [ ] Date and time of discovery written down
- [ ] Leak stopped, keys changed
- [ ] Evidence saved
- [ ] Facts found: data, number of people, dates, who received it
- [ ] Lawyer called, decision written down with reasons
- [ ] Notice to users posted (app, website, store listing)
- [ ] Notice to the Federal Trade Commission sent, or entry added to the yearly log
- [ ] News media and state offices notified, if required
- [ ] Cause fixed, privacy policy updated if needed
- [ ] Incident log entry closed

## Notice template

> **Notice about your information in [APP NAME]**
>
> **What happened.** On [DATE OF BREACH], [SHORT DESCRIPTION]. We found out on [DATE OF DISCOVERY].
>
> **What information was involved.** [FOR EXAMPLE: usage counts tied to a random install ID, which show use of a GLP-1 medication app]. It did not include [LIST].
>
> **Who received it.** [NAME OR DESCRIPTION OF WHO GOT THE INFORMATION, IF KNOWN].
>
> **What we are doing.** [STEPS TAKEN TO LOOK INTO IT, LIMIT HARM AND PREVENT IT FROM HAPPENING AGAIN].
>
> **What you can do.** [STEPS THE USER CAN TAKE].
>
> **How to reach us.** Email [CONTACT EMAIL] or see [WEBSITE URL]. [SECOND CONTACT METHOD]
>
> [COMPANY LEGAL NAME], [DATE OF NOTICE]
