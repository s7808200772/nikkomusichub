import { NextResponse } from 'next/server';

export async function GET() {
  const git = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || 'dev';
  return NextResponse.json({ git });
}
