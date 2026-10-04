import { serveJson } from '../_shared/serve.ts';
import { esignConsent, EsignConsentInput } from '../_shared/signingHandlers.ts';

serveJson(EsignConsentInput, esignConsent);
