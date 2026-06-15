import { closeAllClients } from "./lib/wa-client";

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    process.stdin.resume();

    let shuttingDown = false;

    const cleanup = async (signal: NodeJS.Signals) => {
      if (shuttingDown) {
        console.debug(` [] Received ${signal}. Cleanup already in progress. Skipping...`);
        return;
      }
      shuttingDown = true;
      console.log('');
      console.log(` [] Received ${signal}: Starting custom shutdown cleanup...`);
      await closeAllClients()
      console.log(' [] All clients have been closed. Cleanup complete.');
      process.exit(0);
    };

    process.on('SIGTERM', () => cleanup('SIGTERM'));
    process.on('SIGINT', () => cleanup('SIGINT'));
  }
}