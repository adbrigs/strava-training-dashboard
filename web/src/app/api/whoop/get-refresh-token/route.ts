import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Returns the stored refresh token so the user can add it as a GitHub secret.
// Only accessible when the WHOOP session cookie exists.
export async function GET(req: NextRequest) {
  const refreshToken = req.cookies.get('whoop_refresh')?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: 'Not connected to WHOOP' }, { status: 401 });
  }
  return NextResponse.json({ refreshToken });
}
