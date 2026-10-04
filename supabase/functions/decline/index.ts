import { serveJson } from '../_shared/serve.ts';
import { decline, DeclineInput } from '../_shared/signingHandlers.ts';

serveJson(DeclineInput, decline);
