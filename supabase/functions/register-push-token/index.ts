import { registerPushToken, RegisterPushTokenInput } from '../_shared/lifecycle.ts';
import { serveJson } from '../_shared/serve.ts';

serveJson(RegisterPushTokenInput, registerPushToken);
