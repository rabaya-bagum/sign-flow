import { serveJson } from '../_shared/serve.ts';
import { SendDocumentInput, sendDocument } from './logic.ts';

serveJson(SendDocumentInput, sendDocument);
