import { getClient } from "@/lib/wa-client";
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
  const stream = new ReadableStream({
    async start(controller) {

      // const intervalId = setInterval(async () => {
      //   const state = await client.getState();
      // }, 2000);
      const listener = async (msg: { from: string; body: string }) => {
        const message = `data: ${JSON.stringify({ message: msg })}\n\n`;
        controller.enqueue(encoder.encode(message));
      }

      client.on('message', listener);

      // Clean up interval if connection closes early
      request.signal.addEventListener('abort', () => {
        client.removeListener('message', listener);
      });

      const state = await client.getState();
      const message = `data: ${JSON.stringify({ state })}\n\n`;
      controller.enqueue(encoder.encode(message));
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