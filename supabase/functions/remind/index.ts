import { remind, RemindInput } from '../_shared/lifecycle.ts';
import { serveJson } from '../_shared/serve.ts';

serveJson(RemindInput, remind);
