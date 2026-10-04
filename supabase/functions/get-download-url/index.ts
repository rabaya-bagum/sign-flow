import { serveJson } from '../_shared/serve.ts';
import { GetDownloadUrlInput, getDownloadUrl } from './logic.ts';

serveJson(GetDownloadUrlInput, getDownloadUrl);
