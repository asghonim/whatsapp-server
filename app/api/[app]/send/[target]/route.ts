import { getClient } from "@/lib/wa-client";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic'; // Prevent Vercel from caching the response

type RouteParams = {
  params: Promise<{ app: string, target: string }>;
};

export async function POST(request: Request, { params }: RouteParams) {
  const { app, target } = await params;
  const client = await getClient(app);
  if (!client) {
    return NextResponse.json({ error: 'Failed to create WhatsApp client' }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: 'Target phone number is required' }, { status: 400 });
  }
  const state = await client.getState();
  if (state !== 'CONNECTED') {
    return NextResponse.json({ error: 'WhatsApp client is not connected', state }, { status: 503 });
  }
  const data = await (async () => {
    try {
      const json = await request.json();
      return json;
    } catch {
      return null;
    }
  })();
  if (!data) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const message = data.message;
  if (!message) {
    return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
  }
  const chatId = `${target}@c.us`; 
  try {
    await client.sendMessage(chatId, message);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(` [APP:${app}] Error sending message to ${target}:`, error);
    return NextResponse.json({ error: 'Failed to send message', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}