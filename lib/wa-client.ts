import ReadWriteLock from 'rwlock';
import { Client, LocalAuth } from "whatsapp-web.js";

const lock = new ReadWriteLock();

declare global {
  var clients: Record<string, Client>;
  var qrs: Record<string, {
    qr: string | null;
    date: Date;
  }>;
}

globalThis.clients = {}; // Expose clients to prevent garbage collection in case of memory pressure
globalThis.qrs = {}; // Expose QR codes to prevent garbage collection in case of memory pressure

async function createClient(app_id: string) {
  return new Promise<Client>((resolve, reject) => {
    lock.writeLock(app_id, async (release) => {
      if (globalThis.clients[app_id]) {
        resolve(globalThis.clients[app_id]);
        release();
        return;
      }
      const client = new Client({
        authStrategy: new LocalAuth(
          {
            clientId: `client-${app_id}`,
          }
        ),
        puppeteer: {
          handleSIGINT: false,
          handleSIGTERM: false,
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', ''],
        }
      });
      console.debug(` [APP:${app_id}] Creating WhatsApp client...`);
      globalThis.clients[app_id] = client;
      client.on('qr', (qr) => {
        globalThis.qrs[app_id] = {
          qr,
          date: new Date()
        };
        console.debug(` [APP:${app_id}] QR code received:`, qr);
      });
      client.on('ready', async () => {
        console.debug(` [APP:${app_id}] WhatsApp client is ready`);
        delete globalThis.qrs[app_id];
      });
      client.on('auth_failure', (msg) => {
        console.error(` [APP:${app_id}] Authentication failure:`, msg);
        delete globalThis.clients[app_id];
        delete globalThis.qrs[app_id];
      });
      client.on('disconnected', (reason) => {
        console.warn(` [APP:${app_id}] Client disconnected:`, reason);
        delete globalThis.clients[app_id];
        delete globalThis.qrs[app_id];
      });
      client.on('error', (error) => {
        console.error(` [APP:${app_id}] Client error:`, error);
      });
      client.on('change_state', (state) => {
        console.debug(` [APP:${app_id}] Client state changed:`, state);
      });
      client.on('loading_screen', (percent) => {
        console.debug(` [APP:${app_id}] Loading screen: ${percent}%`);
      });
      client.on('authenticated', () => {
        console.debug(` [APP:${app_id}] Client authenticated`);
      });
      client.on('remote_session_saved', () => {
        console.debug(` [APP:${app_id}] Session saved successfully to remote database!`);
      });
      try {
        await client.initialize();
      } catch (error) {
        console.error(` [APP:${app_id}] Client initialization error:`, error);
        delete globalThis.clients[app_id];
        delete globalThis.qrs[app_id];
        release();
        reject(error);
        return;
      }
      resolve(client);
      release();
    });
  });
}

export async function closeAllClients() {
  const appIds = Object.keys(globalThis.clients);
  console.log(` [] Closing all clients: ${appIds.length} client(s) found`);
  return await Promise.all(appIds.map(async (app_id) => await closeClient(app_id)));
};

export async function closeClient(app_id: string) {
  return new Promise<void>((resolve, reject) => {
    lock.writeLock(app_id, async (release) => {
      console.log(` [] Closing client for app_id: ${app_id}`);
      const client = globalThis.clients[app_id];
      if (!client) {
        console.log(` [APP:${app_id}] No client found to close.`);
        release();
        resolve();
        return;
      }
      console.log(` [APP:${app_id}] Client found, initiating close...`);
      try {
        await client.destroy();
        console.log(` [APP:${app_id}] Client destroyed successfully.`);
        delete globalThis.clients[app_id];
        delete globalThis.qrs[app_id];
        resolve();
      } catch (error) {
        console.error(` [APP:${app_id}] Error while destroying client:`, error);
        reject(error);
      } finally {
        release();
      }
    });
  });
}

export async function getClient(app_id: string) {
  if (globalThis.clients[app_id]) {
    return globalThis.clients[app_id];
  }
  return await createClient(app_id);
}

export function getQR(app_id: string) {
  const qrData = globalThis.qrs[app_id];
  if (!qrData) {
    return null;
  }
  // If the QR code is older than 90 seconds, it's likely expired, so we can ignore it.
  if (new Date().getTime() - qrData.date.getTime() > 90 * 1000) {
    delete globalThis.qrs[app_id];
    return null;
  }
  return qrData;
}