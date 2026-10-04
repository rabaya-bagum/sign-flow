# Privacy labels: App Store "App Privacy" and Google Play "Data safety" (draft)

These come from what the code collects as of Phase 8. Have them legally reviewed together with the
privacy policy (SPEC §22 Q4). Rule of thumb: if a new feature sends something new to a server,
update this file in the same PR.

## What the app collects

| Data                                   | Where it goes                     | Purpose                                        | Linked to user | Optional             |
| -------------------------------------- | --------------------------------- | ---------------------------------------------- | -------------- | -------------------- |
| Name, email                            | Supabase (profiles, auth)         | Account, shown to people you sign with         | Yes            | No                   |
| Phone number                           | Supabase (profile)                | Shown on your profile only                     | Yes            | Yes                  |
| Profile photo                          | Supabase Storage (avatars)        | Shown to people you sign with                  | Yes            | Yes                  |
| Documents (PDFs, scans, photos)        | Supabase Storage                  | The service                                    | Yes            | No                   |
| Signatures and initials (images)       | Supabase Storage                  | Signing                                        | Yes            | No                   |
| Recipients' names and emails           | Supabase                          | Sending documents (third-party data you enter) | Yes            | No                   |
| IP address, user agent at signing      | Supabase (audit events, consents) | Legal audit trail and certificate              | Yes            | No                   |
| Push token                             | Supabase → Expo Push Service      | Notifications                                  | Yes            | Yes (Push switch)    |
| Crash reports (scrubbed; user id only) | Sentry, when configured           | App functionality (diagnostics)                | Yes (id)       | No (off without DSN) |
| Approximate performance traces (10%)   | Sentry, production only           | App functionality                              | Yes (id)       | No                   |

Not collected: precise or coarse location, contacts, browsing history, advertising ID, health data,
financial data, purchases. No tracking across other companies' apps or websites, and no data is sold
or used for ads.

## App Store answers

- **Data used to track you:** none.
- **Data linked to you:**
  - Contact info: name, email address, phone number;
  - User content: photos or videos (scans, avatar), other user content (documents, signatures);
  - Identifiers: user ID;
  - Diagnostics: crash data, performance data;
  - Other: IP address in the signing audit trail.
- **Purposes:** App Functionality for all of the above. Diagnostics are App Functionality only (no
  Analytics, no Product Personalization).

## Google Play answers

- **Data collected:**
  - Personal info: name, email, phone (optional), user IDs;
  - Photos and videos: photos (optional);
  - Files and docs: files and docs;
  - App activity: other actions (signing audit);
  - App info and performance: crash logs, diagnostics;
  - Device or other IDs: push token.
- **Shared with third parties:** none for their own purposes. Service providers (Supabase, Expo Push,
  Sentry, Resend for email) process data on our behalf, which Play does not count as sharing.
- **Encrypted in transit:** yes (HTTPS only).
- **Users can request deletion:** yes, in the app (Account → Delete account) and on the web ⏳
  (Play requires a web link for deletion requests: add a page at https://<domain>/delete-account).
- **Retention after deletion:** documents involving other people keep the user's name and email as the
  signer or sender record (SPEC §17.3). State this in both forms and the privacy policy.
