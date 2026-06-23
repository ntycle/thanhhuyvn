import { NextResponse } from 'next/server';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const accessToken = searchParams.get('access_token');
  
  if (!accessToken) {
    return NextResponse.json({ error: 'Missing access_token' }, { status: 400 });
  }

  try {
    const res = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
      headers: {
        'access_token': accessToken
      }
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
