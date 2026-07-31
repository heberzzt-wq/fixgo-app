# B2C Crew Identity and Policy Alignment Contract

Status: architecture contract, not deployed and not legal advice.
Date: 2026-07-31
Branch: v5.9-polish

## 1. Current repository gap

The current technician registration creates one Firebase Auth account and one `users/{uid}` profile containing one name, one profile image, one INE, one vehicle and one banking identity. It has no crew, assistant, foreman, engineer or member model.

The current customer service UI denormalizes a single `tecnico_nombre`, vehicle and plate into the service ticket. It cannot tell the customer every person who will enter the property.

The current customer and technician policy texts do not yet describe:

- standard versus premium/distant initial authorization;
- cancellation windows and percentages;
- customer no-show or denied access review;
- fallback evidence and human review;
- crew identity and substitution rules;
- separate operational and financial authorization;
- evidence retention and privacy boundaries.

## 2. Required identity model

### 2.1 Responsible account

Each professional account has one contractual and operational responsible person:

```text
users/{responsibleUid}
  crew_profile:
    mode: solo | crew
    responsible_uid
    crew_id
    active_member_count
    verification_status
```

The responsible person owns the account, receives assignments, manages the crew and remains accountable for the service. Shared credentials are prohibited.

### 2.2 Crew members

Each person who may enter a customer property requires an individual member record:

```text
users/{responsibleUid}/crew_members/{memberId}
  full_name
  role: assistant | technician | engineer | foreman | specialist | other
  profile_photo_url
  identity_document_status
  background_check_status
  phone_masked
  active
  created_at
  updated_at
```

Recommended security properties:

- each member has an immutable member ID;
- identity documents remain private to administration;
- the customer sees name, role, approved photo and verification badge only;
- members cannot inherit the responsible person's login;
- inactive, rejected or expired members cannot be placed in a service snapshot.

## 3. Immutable service crew snapshot

At assignment or before departure, the service stores the exact people authorized to attend:

```text
services/{serviceId}
  crew_snapshot:
    snapshot_id
    responsible_uid
    leader:
      uid
      name
      role
      photo_url
      verification_status
    members[]:
      member_id
      name
      role
      photo_url
      verification_status
    declared_count
    created_at
    confirmed_at
    source_version
```

The snapshot is evidence, not a live pointer. Later edits to the technician profile must not silently alter who the customer was told would arrive.

Any substitution after assignment requires:

1. a new snapshot version;
2. reason for substitution;
3. server timestamp;
4. customer notification;
5. customer acknowledgement before entry when reasonably possible;
6. administrative review if the substitution occurs after arrival.

## 4. Customer presentation

Before the crew arrives, the customer must see:

- responsible technician name and photo;
- each accompanying person's name, role and approved photo;
- total number of people expected;
- vehicle and plates when applicable;
- a warning not to admit undeclared people;
- a button to report a crew mismatch.

Arrival evidence and no-show evidence must bind to the same `crew_snapshot.snapshot_id`.

## 5. Administrative controls

Administration must be able to:

- approve or reject each crew member independently;
- suspend a member without disabling the responsible account when appropriate;
- see document and background-check status;
- audit additions, removals and substitutions;
- block assignment when required crew verification has expired;
- compare arrival evidence against the service crew snapshot.

## 6. Operational pricing and cancellation policy to reflect

The visible policies must be aligned with the implemented business rules before production publication:

### Initial authorization / retention

- Standard or central service: MXN 350.
- Premium or distant service: MXN 550.
- Accepted quote: the initial amount is credited to the final approved price.
- Rejected quote after visit and diagnosis: the full initial amount is charged.
- Platform or technician cancellation: full release or refund.

### Customer cancellation while technician is en route

- Before five minutes: full release.
- At or after five minutes: 30% charge and 70% release.
- MXN 350 authorization: MXN 105 charge and MXN 245 release.
- MXN 550 authorization: MXN 165 charge and MXN 385 release.

### Customer cancellation after verified arrival

- 100% of the initial authorization, subject to valid arrival evidence and dispute review.

### Customer no-show or denied access

- customer notification;
- authoritative five-minute wait;
- second location validation;
- new contextual evidence;
- proposed 50% charge and 50% release;
- no automatic movement of funds;
- mandatory administrative review and separate financial authorization.

### GPS or evidence fallback

- GPS failure never creates automatic approval;
- fallback evidence is marked for review;
- any monetary consequence remains blocked until human review;
- the service must retain server time, latest position, accuracy, notification status and contextual media.

## 7. Policy text corrections required

### Customer policy

Replace or qualify statements that currently imply:

- every visit is always MXN 550;
- every final Stripe charge is automatic immediately after work;
- every claim has a fixed six-month guarantee regardless of service category or written scope;
- a domicile is permanently banned without review;
- only one technician will enter.

Add sections for:

- crew disclosure and undeclared-person reporting;
- cancellation windows and exact percentages;
- no-show and denied-access procedure;
- evidence, privacy and human review;
- distinction between authorization, charge, release and refund;
- separate operational and financial decisions.

### Technician policy

Replace or qualify statements that currently imply:

- a fixed 32% applies universally without reference to configured commercial terms;
- a fixed MXN 150 penalty applies automatically after five minutes;
- all disputes are resolved solely from GPS or a single photo;
- the account holder may bring undeclared helpers.

Add duties for:

- declaring every crew member;
- using no shared accounts;
- keeping member identity and verification current;
- notifying substitutions;
- respecting customer privacy during evidence capture;
- waiting for administrative review before treating proposed charges as earned funds;
- responsibility for acts and omissions of crew members.

## 8. Delivery sequence

1. Administrative evidence review desk and financial hold.
2. Financial execution guard at every settlement entry point.
3. Crew registration data model and UI.
4. Admin crew-member approval workflow.
5. Immutable crew snapshot on service assignment.
6. Customer crew display and mismatch report.
7. Arrival/evidence binding to crew snapshot.
8. Customer policy rewrite.
9. Technician policy rewrite.
10. Rules tests, emulator tests and production publication only with explicit authorization.

## 9. Non-negotiable safety constraints

- no merge to `main` during this workstream;
- no Firebase Hosting, Functions, Firestore rules or Storage rules deployment without explicit authorization;
- no financial movement from evidence modules;
- no silent crew substitution;
- no Base64 media persisted in Firestore;
- no customer access to private identity documents;
- preserve `V95-multimodal-batch-integrity.patch`.
