import { serveGuest } from '../_shared/serveGuest.ts';
import { guestSubmit, GuestSubmitInput } from '../_shared/signingHandlers.ts';

serveGuest(GuestSubmitInput, guestSubmit);
