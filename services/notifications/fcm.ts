import admin from "firebase-admin";
import serviceAccount from "../../firebase-service-account.json";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount)
  });
}

export async function sendPushNotification({
  token,
  title,
  body,
  data = {}
}: {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      data
    });
    console.log(`✅ Push sent to ${token}`);
  } catch (err) {
    console.error(`❌ Push failed:`, err);
  }
}