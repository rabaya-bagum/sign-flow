import { voidDocument, VoidDocumentInput } from '../_shared/lifecycle.ts';
import { serveJson } from '../_shared/serve.ts';

serveJson(VoidDocumentInput, voidDocument);
