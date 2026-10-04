# Store listing (draft)

The copy and assets for the App Store and Google Play. Placeholders such as the name, bundle ID,
domain and brand colours stay until SPEC §22 Q1, Q2 and Q7 are answered.

## Text

| Field                        | Draft                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| App name (30)                | SignFlow: Sign Documents                                                           |
| Subtitle, iOS (30)           | Sign and send PDFs securely                                                        |
| Short description, Play (80) | Sign PDFs, request signatures and track every document, with an audit certificate. |
| Keywords, iOS (100)          | sign,signature,pdf,e-sign,esign,contract,document,scan,fill,agreement,nda,lease    |
| Category                     | Business (secondary: Productivity)                                                 |
| Age rating                   | 4+ / Everyone (no user-generated public content)                                   |
| Support URL                  | ⏳ https://<domain>/support                                                        |
| Privacy policy URL           | ⏳ https://<domain>/privacy (also in the app: Account → Privacy policy)            |

**Description.**

> Sign documents anywhere. Upload a PDF, scan paper with your camera, or turn photos into a PDF,
> then add your signature in seconds by drawing, typing or uploading it.
>
> Request signatures from one person or several, in order or all at once. Recipients sign in the
> app or straight from the email link. No account is needed.
>
> Track every document: see when it is opened and signed, send reminders, and get the signed PDF
> with a certificate of completion that records who signed, when, and the document's fingerprint.
>
> Security built in: two-factor authentication, Face ID / fingerprint unlock, encrypted storage, and
> deletion of your account from the app at any time.

## Assets

| Asset                                            | Status | Notes                                                                                                                                               |
| ------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| App icon 1024×1024 (no alpha, iOS)               | ⚠️     | `assets/icon.png` is a placeholder (SPEC §22 Q7)                                                                                                    |
| Android adaptive icon (fg/bg/monochrome)         | ⚠️     | `assets/android-icon-*.png`, placeholders                                                                                                           |
| Splash                                           | ⚠️     | `assets/splash-icon.png`, placeholder                                                                                                               |
| iPhone 6.7" screenshots (1290×2796)              | ⚠️     | Drafts from the web build in `screenshots/` (`node scripts/store-screenshots.mjs`). Retake from a device build for the native status bar and fonts. |
| iPhone 6.5" / iPad 13" screenshots               | ⏳     | iPad is needed because `supportsTablet: true`                                                                                                       |
| Play phone screenshots, feature graphic 1024×500 | ⏳     |                                                                                                                                                     |

Draft screenshots: onboarding, Home, Documents, tracking (details), signing, security.

## Review notes for Apple and Google

- **Demo account:** create one on the production project, with a document waiting for its signature, and
  give the reviewer the email and password. Do not turn on 2FA for it.
- **Account deletion:** Account → Delete account (guideline 5.1.1(v)).
- **Sign in with Apple** is offered next to Google on iOS (guideline 4.8).
- **Face ID usage string:** "SignFlow uses Face ID to unlock the app." Camera and photos strings are in
  `app.config.ts`.
