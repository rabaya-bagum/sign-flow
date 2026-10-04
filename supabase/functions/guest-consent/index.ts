import { serveGuest } from '../_shared/serveGuest.ts';
import { guestConsent, GuestConsentInput } from '../_shared/signingHandlers.ts';

serveGuest(GuestConsentInput, guestConsent);
