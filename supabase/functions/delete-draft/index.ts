import { serveJson } from '../_shared/serve.ts';
import { DeleteDraftInput, deleteDraft } from './logic.ts';

serveJson(DeleteDraftInput, deleteDraft);
