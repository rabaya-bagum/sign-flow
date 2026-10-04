import { serveJson } from '../_shared/serve.ts';
import { signingSession, SigningSessionInput } from '../_shared/signingHandlers.ts';

serveJson(SigningSessionInput, signingSession);
