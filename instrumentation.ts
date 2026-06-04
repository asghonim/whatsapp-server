import { closeAllClients } from "./lib/wa-client";

export async function register() {
  // Ensure this code only runs on the Node.js server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    
    const cleanup = async (signal: string) => {
      console.log(`Received ${signal}: Starting custom shutdown cleanup...`);
      
      try {
        await closeAllClients();
        console.log('Cleanup completed successfully.');
      } catch (error) {
        console.error('Error during cleanup:', error);
      } finally {
        console.log('Exiting process.');
        process.exit(0);
      }
    };

    // process.on('SIGTERM', async () => await cleanup('SIGTERM'));
    process.on('SIGINT', async () => await cleanup('SIGINT'));
  }
}