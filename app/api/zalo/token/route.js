import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    }

    const body = await req.json();

    // PHASE 1: Exchange code for access_token (works on Vercel US IP)
    if (body.code) {
      const tokenResponse = await fetch('https://oauth.zaloapp.com/v4/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          secret_key: process.env.ZALO_APP_SECRET,
        },
        body: new URLSearchParams({
          app_id: process.env.NEXT_PUBLIC_ZALO_APP_ID,
          grant_type: 'authorization_code',
          code: body.code,
          code_verifier: body.codeVerifier || '',
        }),
      });

      const tokenData = await tokenResponse.json();
      if (tokenData.error) {
        return NextResponse.json({ error: tokenData.error_name || 'Token error' }, { status: 400 });
      }
      return NextResponse.json({ zaloAccessToken: tokenData.access_token });
    }

    // PHASE 2: Mint Custom Token using the Client-provided zaloId
    if (body.zaloId && body.zaloAccessToken) {
      // NOTE: Because Vercel IPs are blocked by Zalo Graph API, we cannot verify this zaloId on the server.
      // We trust the Client to provide its real Zalo ID obtained via its local Vietnamese IP.
      const uid = `zalo:${body.zaloId}`;

      const customToken = await getAuth().createCustomToken(uid, {
        zaloId: body.zaloId,
      });

      return NextResponse.json({ customToken });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Server Error', details: error.message }, { status: 500 });
  }
}
