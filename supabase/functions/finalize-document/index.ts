import { serveJson } from '../_shared/serve.ts';
import { finalizeDocumentHandler, FinalizeDocumentInput } from '../_shared/signingHandlers.ts';

serveJson(FinalizeDocumentInput, finalizeDocumentHandler);
