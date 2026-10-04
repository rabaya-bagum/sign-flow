import { serveJson } from '../_shared/serve.ts';
import { DeleteAccountInput, deleteAccount } from './logic.ts';

serveJson(DeleteAccountInput, deleteAccount);
