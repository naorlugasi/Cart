import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const app = createApp();

app.listen(port, host).then((address) => {
  const shown = host === '0.0.0.0' ? 'localhost' : host;
  console.log(`Cart Transfer & Redirect MVP listening on http://${shown}:${address.port}`);
  console.log(`  UI:          http://${shown}:${address.port}/`);
  console.log(`  Demo store:  http://${shown}:${address.port}/demo-store/`);
  console.log(`  API health:  http://${shown}:${address.port}/api/health`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
