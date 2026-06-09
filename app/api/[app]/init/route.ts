import { getClient, getQR } from "@/lib/wa-client";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic'; // Prevent Vercel from caching the response

type RouteParams = {
  params: Promise<{ app: string }>;
};

export async function GET(request: Request, { params }: RouteParams) {
  const { app } = await params;
  const client = await getClient(app);
  if (!client) {
    return NextResponse.json({ error: 'Failed to create WhatsApp client' }, { status: 500 });
  }
  const encoder = new TextEncoder();
  let lastQR: { qr: string | null; date: Date } | null = null;
  const stream = new ReadableStream({
    async start(controller) {

      // Keep sending data intervals every 2 seconds
      const intervalId = setInterval(async () => {

        const state = await client.getState();
        if (state === 'CONNECTED') {
          const message = `data: ${JSON.stringify({ state })}\n\n`;
          controller.enqueue(encoder.encode(message));
          clearInterval(intervalId); // Stop sending updates once connected
          return;
        }
        const qr = getQR(app);
        if (qr && (!lastQR || lastQR.qr !== qr.qr)) {
          lastQR = qr;
          const message = `data: ${JSON.stringify({ state, qr: qr?.qr, date: qr?.date })}\n\n`;
          controller.enqueue(encoder.encode(message));
        }
      }, 2000);

      // Clean up interval if connection closes early
      request.signal.addEventListener('abort', () => {
        clearInterval(intervalId);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}