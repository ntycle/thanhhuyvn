import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json({ error: 'Missing code parameter' }, { status: 400 });
    }

    const appId = process.env.ZALO_APP_ID;
    const secretKey = process.env.ZALO_SECRET_KEY;
    const tokenUrl = "https://oauth.zaloapp.com/v4/access_token";

    const body = new URLSearchParams();
    body.append('code', code);
    body.append('app_id', appId);
    body.append('grant_type', 'authorization_code');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': secretKey
      },
      body: body.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Zalo API responded with ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in Zalo token route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
