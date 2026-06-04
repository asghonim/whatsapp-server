import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Client, LocalAuth, RemoteAuth } from "whatsapp-web.js";
import { AwsS3Store } from "wwebjs-aws-s3";
import ReadWriteLock from 'rwlock';

const lock = new ReadWriteLock();

const clients: Record<string, Client> = {};
const qrs: Record<string, {
  qr: string | null;
  date: Date;
}> = {};

const getS3 = () => {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_REGION) {
    return null;
  }
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
}

async function createClient(app_id: string) {
  return new Promise<Client>((resolve, reject) => {
    lock.writeLock(app_id, async (release) => {
      if (clients[app_id]) {
        resolve(clients[app_id]);
        release();
        return;
      }
      // const s3Client = getS3();
      // if (!s3Client) {
      //   release();
      //   reject(new Error("S3 client not available"));
      //   return;
      // }
      // const store = new AwsS3Store({
      //   bucketName: 'whatsapp-next.js-304838291832-eu-west-1-an',
      //   remoteDataPath: '/auth/',
      //   s3Client: s3Client,
      //   putObjectCommand: PutObjectCommand,
      //   headObjectCommand: HeadObjectCommand,
      //   getObjectCommand: GetObjectCommand,
      //   deleteObjectCommand: DeleteObjectCommand
      // });
      const client = new Client({
        authStrategy: new LocalAuth(
          {
            clientId: `client-${app_id}`,
          }
        ),
        // authStrategy: new RemoteAuth({
        //   clientId: `client-${app_id}`,
        //   store: store,
        //   backupSyncIntervalMs: 600000
        // }),
        puppeteer: {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', ''],
        }
      });
      console.debug(` [APP:${app_id}] Creating WhatsApp client `);
      clients[app_id] = client;
      client.on('qr', (qr) => {
        qrs[app_id] = {
          qr,
          date: new Date()
        };
        console.debug(` [APP:${app_id}] QR code received:`, qr);
      });
      client.on('ready', () => {
        console.debug(` [APP:${app_id}] WhatsApp client is ready`);
        delete qrs[app_id];
      });
      client.on('auth_failure', (msg) => {
        console.error(` [APP:${app_id}] Authentication failure:`, msg);
        delete clients[app_id];
        delete qrs[app_id];
      });
      client.on('disconnected', (reason) => {
        console.warn(` [APP:${app_id}] Client disconnected:`, reason);
        delete clients[app_id];
        delete qrs[app_id];
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
      try {
        await client.initialize();
      } catch (error) {
        console.error(` [APP:${app_id}] Client initialization error:`, error);
        delete clients[app_id];
        delete qrs[app_id];
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
  const appIds = Object.keys(clients);
  return Promise.all(appIds.map(app_id => closeClient(app_id)));
};

export async function closeClient(app_id: string) {
  return new Promise<void>((resolve) => {
    lock.writeLock(app_id, async (release) => {
      const client = clients[app_id];
      if (client) {
        try {
          await client.destroy();
          console.log(` [APP:${app_id}] Client destroyed successfully.`);
        } catch (error) {
          console.error(` [APP:${app_id}] Error destroying client:`, error);
        }
        delete clients[app_id];
      }
      delete qrs[app_id];
      resolve();
      release();
    });
  });
}

export async function getClient(app_id: string) {
  if (clients[app_id]) {
    return clients[app_id];
  }
  return await createClient(app_id);
}

export function getQR(app_id: string) {
  const qrData = qrs[app_id];
  if (!qrData) {
    return null;
  }
  // If the QR code is older than 90 seconds, it's likely expired, so we can ignore it.
  if (new Date().getTime() - qrData.date.getTime() > 90 * 1000) {
    delete qrs[app_id];
    return null;
  }
  return qrData;
}