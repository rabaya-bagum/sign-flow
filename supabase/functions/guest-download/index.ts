import { serveGuest } from '../_shared/serveGuest.ts';
import { guestDownloadHandler, GuestDownloadInput } from '../_shared/signingHandlers.ts';

serveGuest(GuestDownloadInput, guestDownloadHandler);
