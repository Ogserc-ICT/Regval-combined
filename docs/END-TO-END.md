# End-to-end checklist

How the app works from first sign-in to a registration certificate, as a list you can tick while trying it. Each step names the role that does it. The rules behind each step are in `docs/SPEC.md`.

A user can hold several roles, but on one submission the Registration officer who saved it, the evaluating officer, the reviewing supervisor and the approving officer must be four different people, and a Finance officer cannot confirm a payment they recorded. So a full run needs at least four people; the admin and Finance roles can be held by any of them.

## 1. Set up (Admin)

- [ ] Sign in with the bootstrap admin and choose a new password.
- [ ] **Admin › Staff & roles:** create one account per person, with a role each. Note the one-time password shown for each.
- [ ] **Admin › Settings:** check the Effective Date (clear "placeholder" once gazetted), the 17:00 office closing time, the ACK number prefix and "Sign out after inactivity".
- [ ] **Admin › Signatories:** confirm the Chairman / CEO (Jide Onakoya) and add the Commissioner (Femi Omisanjo), both ticked confirmed. Without a Commissioner, new registrations cannot be approved; while either is unconfirmed the certificate prints as a draft.
- [ ] **Admin › Holidays:** confirm the provisional and estimated dates; deemed receipt and working days depend on them.
- [ ] **Admin › Go-live checks:** work down the list until every row is ready.
- [ ] Each person signs in once and replaces the one-time password. The eye button shows what they type.

## 2. A new registration arrives (Registration officer)

- [ ] **Register › New submission:** filing type "New registration", form REG-01A to K, registered name, LGA, primary activity, capacity, licence status, operating on the Effective Date.
- [ ] Enter the **date received, time received and how it came** (By hand, Email, Online portal).
- [ ] Not sure what a field is for? See §10, "The New submission form, field by field".
- [ ] Save. The app works out the **deemed receipt date**: email or portal at or after 17:00, or any filing on a weekend or holiday, counts from the next working day. It issues the **ACK** in that year and prices the filing (fee, and the late charge if received after the deadline).
- [ ] Open the entry: Summary shows the receipt, the deemed receipt date, the category, the fees and the next action. The receipt can no longer be changed.
- [ ] **Documents card** (Summary tab): open the **acknowledgement letter** (para 10(3)) and send it to the operator. Tick the Schedule 2 documents first so the letter lists them as received; it is generated afresh each time it is opened.
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
- [ ] The **EVAL-01 form** can be printed from the Documents card at any stage, for signing by the three officers.
- [ ] **Evaluator or supervisor:** "Mark complete" once documents and payment are complete. It starts the 30-day determination clock. The approver and supervisor are notified "Ready for decision".

### If something is missing: the deficiency notice

- [ ] **Reviewing supervisor:** "Issue deficiency notice". It gets a DEF number; the Registration officers and the evaluator are notified to send it. The clock has not started.
- [ ] **Supervisor or Registration officer:** open the notice from the submission's **Documents** card to check it. It prints "DRAFT – NOT ISSUED" until it is sent, and says what was outstanding when it was issued.
- [ ] **Registration officer:** record the **date it was sent** (Evaluation tab › Letters sent), then print the final notice (dated that day, with its response date) and send it. The 14-day response period runs from that date.
- [ ] When the response arrives, **evaluator or supervisor:** "Mark complete" asks for the **date the response was received**.
- [ ] If no response comes in time, **approving officer:** "Lapse" (only after the period, and only once the notice was sent).

## 5. Decision (approving officer)

- [ ] **Approve and register:** blocked, with every reason listed, until the checks, documents, payment, signatories and separation of duties allow it. Data flags need a written reason first.
- [ ] On approval the entry gets its **registration number** (`OGSERC/REG/{year}/{category}-{activity}/{serial}`) and the certificate date. Registration officers and the evaluator are notified.
- [ ] **Registration officer:** print the **CERT-01 certificate** from the Documents card (serial number, both signatories, QR code), have it signed and sealed, send it, and record the date it was sent (Letters sent).
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

## 10. The New submission form, field by field

What each input on **Register › New submission** is for. A \* means the entry cannot be saved without it.

The fields do one of three jobs, and most confusion comes from mixing them up:

- **Set the money:** filing type, activities, installed capacity, "operating on the Effective Date", planned start date, waiver, category override, and the date and time received.
- **Set the document checklist:** form filed, activities, capacity, licence status and the document conditions.
- **Record or cross-check:** everything else. These never change a fee; at most they raise a data flag, which needs a written reason before approval.

### Submission

| Field | What it is | What it affects |
|---|---|---|
| **Filing type \*** | New registration, Update (material change, para 16(1)) or Annual confirmation (para 16(2)). Fixed once saved. | Only a **New** registration has a deadline and late charges. Updates and annual confirmations pay a fee only if the "fee on updates" setting is Y. |
| **Form filed \*** | The REG-01 form the applicant actually used (A to K). REG-01I is refused here; record it under Own-use. | A cross-check only. The category comes from the activities and capacity, not from the form. If they differ, a "form does not match the category" flag appears, settled on the evaluation by confirming the category. |
| **Linked registration no. \*** (updates and annual confirmations only) | The OGSERC/REG number the filing is for. | Must be a **Registered new registration** on the Register, or the save is refused. |
| **Date received \*, Time received \*, Received by \*** | When and how the filing arrived: By hand, Email or Online portal. | Give the **deemed receipt date** (para 10(3)): a weekend or holiday moves to the next working day; Email or portal at or after the closing time also moves to the next working day; By hand does not. That date sets the **ACK year** and the **days late**. All three are **locked once saved**. |

### Identity and service area

| Field | What it affects |
|---|---|
| **Registered name \*** | Required. The same name on another submission raises a flag. |
| Trading name, registered address, other LGAs served, towns / estates served | Record only. |
| **Registrant type** | Record. When it is set and is not "Company", the EVAL-01 checks for non-company registrants apply. |
| **CAC no.** | Must be RC, BN or IT followed by digits. The same CAC number on another submission raises a flag (one registration per person, para 11(4)). |
| **TIN** | Record only; the format is not yet confirmed by Finance. |
| **Principal LGA \*** | Required, from the 20 Ogun LGAs. Used in the dashboard figures and filters. |

### Activities and capacity: these set the fee

| Field | What it affects |
|---|---|
| **Primary activity \*** and **Other activities** | Each activity has a category at the submission's capacity. The **category charged is the highest of them all**: A beats B, then the one with the highest fee. Adding an other activity can therefore **raise the fee**. Other activities also add their own documents to the checklist. |
| **Installed capacity (MW)** | One figure for the whole operator, used for **every** activity. The bands are below 1 MW, 1 to below 10 MW, and 10 MW or more. A capacity-based activity with no capacity raises a flag; captive generation below 1 MW raises a flag pointing to REG-01I (own-use). |
| **Customers** | Record only. |

### Licences: two different things

- **Licence status \*** is the applicant's legal position (for example Unlicensed, Licence pending, OGSERC licence/permit, NERC multi-State licence). It decides:
  - the *holds any licence* document condition, which is Y unless the status is Unlicensed;
  - for an Unlicensed operator, the date by which a licence application is due (para 18(2));
  - which EVAL-01 checks apply.
- **Licences held (number and expiry)** are the actual licences or permits. They are only checked against the status:
  - a number entered while the status is Unlicensed or Licence pending raises a flag;
  - a licence status that means one is held, with no number entered, raises a flag;
  - a licence that expires within 6 months of the Effective Date raises a renewal flag (para 8(5)).

### Contact

Compliance officer, phone and email: record only. The phone must be 11 digits starting with 0 (08021846578), or +234 and 10 digits.

### Timeline and fees

| Field | What it affects |
|---|---|
| **Operating on the Effective Date? \*** | Sets the **deadline** for a new registration. **Y** (existing operator): the Effective Date. **N** (new operator): 30 days before the planned start date. |
| **Planned start date** (required when N) | Used only for that deadline. |
| **Approved waiver (₦)** | Comes off the registration fee (para 17(3)). It cannot be more than the fee. Whether it also reduces the late charge is an admin setting. |
| **Category override** and **Override reason** | Leave on **(calculated)** unless the Commission has decided on a different category. An override that differs from the calculated category needs a reason. This is not the same as **Confirmed category** on the evaluation, which settles a form that does not match. |

**Late charge (new registrations only):** days late = deemed receipt date − deadline. The charge is the initial amount plus the daily rate for each day late, but never more than the category's cap.

### Document conditions

These are not questions the applicant has to answer. Each one can take a document off the checklist:

- **Blank** (the default) or **Y**: the document stays required.
- **N**: the document becomes **N/A**.

The eight conditions: multi-State licensee, generation for sale, grid-connected, interconnected mini-grid, Form F distribution part, Form F trading part, Form G DisCo bulk supply, sub-franchise. A ninth, *holds any licence*, is not shown because the licence status sets it.

Set **N** only where the applicant clearly does not do that thing, so nobody chases a document that does not apply.

### Form sections summary

The app does not hold the detailed REG-01 sections. Record a short summary for the evaluator:

- **Sections not complete** (for example "G, J"): raises a "sections not complete" flag.
- **Capacity stated in sections (MW)**: the capacity the applicant wrote inside the technical sections. If it differs from *Installed capacity* by more than 1%, a capacity mismatch flag appears. It is a cross-check only; the fee is always worked out from *Installed capacity*.
- **Remarks**: free text.
