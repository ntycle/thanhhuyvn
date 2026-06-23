import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

function getFirebaseAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      })
    });
  }
}

export async function POST(request) {
  try {
    const { code, codeVerifier } = await request.json();

    if (!code) {
      return NextResponse.json({ error: 'Missing code parameter' }, { status: 400 });
    }

    const appId = process.env.ZALO_APP_ID;
    const secretKey = process.env.ZALO_SECRET_KEY;
    const tokenUrl = "https://oauth.zaloapp.com/v4/access_token";

    // 1. Get access token from Zalo
    const body = new URLSearchParams();
    body.append('code', code);
    body.append('app_id', appId);
    body.append('grant_type', 'authorization_code');
    if (codeVerifier) {
      body.append('code_verifier', codeVerifier);
    }

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': secretKey
      },
      body: body.toString()
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Zalo API responded with ${tokenResponse.status}: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
        throw new Error("Failed to get Zalo access token");
    }

    // 2. Fetch user profile from Zalo (only 'id' to avoid foreign IP restriction on personal info)
    const profileResponse = await fetch('https://graph.zalo.me/v2.0/me?fields=id', {
      headers: {
        'access_token': tokenData.access_token
      }
    });

    if (!profileResponse.ok) {
        throw new Error("Failed to get Zalo user profile");
    }

    const profileData = await profileResponse.json();
    if (profileData.error) {
        throw new Error(`Zalo Graph API error: ${profileData.message}`);
    }

    const zaloId = profileData.id;
    const zaloName = profileData.name || "Người dùng Zalo";
    
    // The fake email pattern used by the system
    const fakeEmail = `${zaloId}@zalo.com`;

    // 3. Admin SDK: Ensure user exists and mint Custom Token
    getFirebaseAdmin();
    const auth = admin.auth();
    let uid;

    try {
        // Find existing user by fake email
        const userRecord = await auth.getUserByEmail(fakeEmail);
        uid = userRecord.uid;
    } catch (e) {
        if (e.code === 'auth/user-not-found') {
            // Create new user without a password
            const newUser = await auth.createUser({
                email: fakeEmail,
                emailVerified: true,
                displayName: zaloName
            });
            uid = newUser.uid;
        } else {
            throw e;
        }
    }

    // 4. Mint custom token
    const customToken = await admin.auth().createCustomToken(uid);

    return NextResponse.json({ 
        customToken, 
        zaloId, 
        name: zaloName,
        zaloAccessToken: tokenData.access_token 
    });

  } catch (error) {
    console.error('Error in Zalo token route:', error);
    
    // In some edge cases on Next.js/Vercel, if the error is weird, JSON.stringify might fail.
    // Ensure we safely stringify the error response.
    // Use status 400 instead of 500 so Vercel doesn't intercept it with an HTML error page
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Server Error", details: errorMessage }, { status: 400 });
  }
}

