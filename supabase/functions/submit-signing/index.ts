import { serveJson } from '../_shared/serve.ts';
import { submitSigningHandler, SubmitSigningInput } from '../_shared/signingHandlers.ts';

serveJson(SubmitSigningInput, submitSigningHandler);
