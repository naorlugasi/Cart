// Vercel serverless entry point: every request is routed here (see vercel.json) and handled
// by the same request listener the standalone server uses.
import { createApp } from '../server/app.js';

const app = createApp({ persist: false });

export default function handler(req, res) {
  return app.requestListener(req, res);
}
