import { serveGuest } from '../_shared/serveGuest.ts';
import { guestOtp, GuestOtpInput } from '../_shared/signingHandlers.ts';

serveGuest(GuestOtpInput, guestOtp);
