import { serveGuest } from '../_shared/serveGuest.ts';
import { guestOpen, GuestOpenInput } from '../_shared/signingHandlers.ts';

serveGuest(GuestOpenInput, guestOpen);
