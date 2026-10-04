import { serveGuest } from '../_shared/serveGuest.ts';
import { guestDecline, GuestDeclineInput } from '../_shared/signingHandlers.ts';

serveGuest(GuestDeclineInput, guestDecline);
