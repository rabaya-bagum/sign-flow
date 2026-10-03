import { serveJson } from '../_shared/serve.ts';
import { ProcessUploadInput, processUpload } from './logic.ts';

serveJson(ProcessUploadInput, processUpload);
