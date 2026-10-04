/**
 * ESIGN/UETA Consumer Disclosure (SPEC §17.1). Versioned: the accepted version is stored in
 * esign_consents and shown on the certificate. Changing the text means bumping the version.
 * Get legal review before launch.
 */
export const ESIGN_DISCLOSURE_VERSION = '2026-10-01';

export const ESIGN_DISCLOSURE = {
  title: 'Consent to do business electronically',
  intro:
    'Before you sign, please read this disclosure. By continuing, you agree to receive documents and sign them electronically.',
  sections: [
    {
      heading: 'Electronic records and signatures',
      body: 'You agree that documents sent to you through SignFlow may be provided electronically, and that your electronic signature has the same legal effect as a handwritten signature.',
    },
    {
      heading: 'Paper copies',
      body: 'You may ask the sender for a paper copy of any document at any time. You can also download a copy after signing.',
    },
    {
      heading: 'Withdrawing consent',
      body: 'You may withdraw your consent before signing by declining the document or by contacting the sender. Withdrawing does not affect documents you have already signed.',
    },
    {
      heading: 'What you need',
      body: 'A current web browser or the SignFlow app, an internet connection, a valid email address, and the ability to open PDF files.',
    },
  ],
} as const;
