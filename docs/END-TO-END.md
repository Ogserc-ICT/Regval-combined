# End-to-end checklist

How the app works from first sign-in to a registration certificate, as a list you can tick while trying it. Each step names the role that does it. The rules behind each step are in `docs/SPEC.md`.

A user can hold several roles, but on one submission the Registration officer who saved it, the evaluating officer, the reviewing supervisor and the approving officer must be four different people, and a Finance officer cannot confirm a payment they recorded. So a full run needs at least four people; the admin and Finance roles can be held by any of them.

## 1. Set up (Admin)

- [ ] Sign in with the bootstrap admin and choose a new password.
- [ ] **Admin › Staff & roles:** create one account per person, with a role each. Note the one-time password shown for each.
- [ ] **Admin › Settings:** check the Effective Date (clear "placeholder" once gazetted), the 17:00 office closing time, the ACK number prefix and "Sign out after inactivity".
- [ ] **Admin › Signatories:** confirm the Chairman / CEO and add the Commissioner. Without a Commissioner, new registrations cannot be approved.
- [ ] **Admin › Holidays:** confirm the provisional and estimated dates; deemed receipt and working days depend on them.
- [ ] **Admin › Go-live checks:** work down the list until every row is ready.
- [ ] Each person signs in once and replaces the one-time password. The eye button shows what they type.

## 2. A new registration arrives (Registration officer)

- [ ] **Register › New submission:** filing type "New registration", form REG-01A to K, registered name, LGA, primary activity, capacity, licence status, operating on the Effective Date.
- [ ] Enter the **date received, time received and how it came** (By hand, Email, Online portal).
- [ ] Save. The app works out the **deemed receipt date**: email or portal at or after 17:00, or any filing on a weekend or holiday, counts from the next working day. It issues the **ACK** in that year and prices the filing (fee, and the late charge if received after the deadline).
- [ ] Open the entry: Summary shows the receipt, the deemed receipt date, the category, the fees and the next action. The receipt can no longer be changed.
- [ ] Try a bad phone (8021846578): it is refused with an example of the right form (08021846578).

## 3. Payment and the Finance gate

- [ ] **Registration officer:** on the entry's Payments tab, record the payment (date, amount, channel, RRR). It gets a PAY number and waits for Finance.
- [ ] The Finance officers' bell turns amber and chimes: "Payment to confirm".
- [ ] **Finance officer:** Payments & Finance, find it, tick "verified with the bank / Remita" and confirm. The officer who recorded a payment cannot confirm it.
- [ ] When confirmed payments cover what is due, the submission is **released for evaluation** and the assigned evaluator (or the supervisors, if nobody is assigned yet) is notified.
- [ ] A wrong payment can be rejected (with a reason) or, once confirmed, reversed.

## 4. Evaluation (supervisor, evaluator)

- [ ] **Reviewing supervisor:** Evaluation tab › assign the evaluating officer, reviewing supervisor and approving officer. Each is notified.
- [ ] **Documents tab:** tick each Schedule 2 document received (Registration officer, evaluator or supervisor).
- [ ] **Evaluator:** answer the EVAL-01 checks, and confirm the category if the form filed does not match.
- [ ] **Evaluator or supervisor:** "Mark complete" once documents and payment are complete. It starts the 30-day determination clock. The approver and supervisor are notified "Ready for decision".

### If something is missing: the deficiency notice

- [ ] **Reviewing supervisor:** "Issue deficiency notice". It gets a DEF number; the Registration officers and the evaluator are notified to send it. The clock has not started.
- [ ] **Registration officer:** send the notice, then record the **date it was sent** (Evaluation tab › Letters sent). The 14-day response period runs from that date.
- [ ] When the response arrives, **evaluator or supervisor:** "Mark complete" asks for the **date the response was received**.
- [ ] If no response comes in time, **approving officer:** "Lapse" (only after the period, and only once the notice was sent).

## 5. Decision (approving officer)

- [ ] **Approve and register:** blocked, with every reason listed, until the checks, documents, payment, signatories and separation of duties allow it. Data flags need a written reason first.
- [ ] On approval the entry gets its **registration number** (`OGSERC/REG/{year}/{category}-{activity}/{serial}`) and the certificate date. Registration officers and the evaluator are notified.
- [ ] **Registration officer:** record the date the **certificate was sent** (Letters sent).
- [ ] Refusing instead: record the **show-cause letter sent** date, wait 14 days, then refuse with one of the three grounds.
- [ ] If nobody decides within 30 days of completion, the daily review makes the registration **provisional** (para 13(4)).

## 6. Other filings

- [ ] **Update or annual confirmation:** a new submission quoting the registration number. On approval the changes are copied to the registration; certificate fields set "certificate needs reissue".
- [ ] **Own-use (REG-01I):** Own-use › New, with the date, time and channel received and the generator units (200 kW to below 1 MW). It gets an ACK and an OUN; 1 MW or more is refused.

## 7. Every day

- [ ] **Dashboard:** your work queues (my evaluations, awaiting payment, Finance Desk, ready for decision, overdue deficiency responses, deficiency notices to send, certificates to send) and the figures by category, status, activity and LGA.
- [ ] **Bell:** amber with a count when something waits for you; it chimes; "Turn on pop-ups" for alerts when the app is minimised; a sound switch.
- [ ] **Live updates:** another person's change shows within about 5 seconds without refreshing. If you are typing in a form, a "Refresh" button appears instead.
- [ ] **Inactivity:** after the set minutes with no activity a 30-second warning shows, then sign-out. Sign in again: you return to the same page with your typing put back.
- [ ] **Daily review:** runs at 07:00 every day (Admin › Daily review shows the runs; "Run now" for admins).
- [ ] **Audit log:** every action, who and when; it cannot be changed or cleared.
- [ ] **Admin › Export registers:** the Register, payments, own-use or the audit log as Excel or CSV.

## 8. Clearing data (Admin)

- [ ] **Admin › Data management:** tick what to clear, enter your password, confirm. "Entries only" clears every submission, payment, own-use notification, notification and saved draft; "Everything" also puts the settings, fees, lists, holidays and signatories back to the defaults (a factory reset). Staff, roles and the audit log always stay. A number series starts again at 1 once nothing holds one of its numbers.
- [ ] **Delete one entry:** open it (Register entry: Summary tab; Own-use page) › "Delete this …" › type its ACK. Payments, documents and the evaluation go with it; it is refused while an update or annual confirmation links to it. Its numbers are never given out again.
- [ ] **Delete one payment:** in a payments list, "Delete…" on a pending, rejected or reversed payment. A confirmed payment must be reversed first.
- [ ] Each clear and delete appears in the audit log.

## 9. Staff changes (Admin)

- [ ] Deactivate someone (they are signed out at once), issue a new one-time password, or **delete** them: they leave every list, but their name stays on the records they worked on. You cannot delete yourself, the last admin, or an officer still assigned to an open evaluation.
