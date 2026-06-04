import { getClient, getQR } from "@/lib/wa-client";
import { NextResponse } from "next/server";

type RouteParams = {
  params: Promise<{ app_id: string }>;
};

export async function GET(request: Request, { params }: RouteParams) {
  const { app_id: appId } = await params;
  const client = await getClient(appId);
  if (!client) {
    return NextResponse.json({ error: 'Failed to create WhatsApp client' }, { status: 500 });
  }
  const state = await client.getState();
  if (state === 'CONNECTED') {
    return NextResponse.json({ state });
  }
  const qr = getQR(appId);
  return NextResponse.json({ state, qr: qr?.qr, date: qr?.date });
}