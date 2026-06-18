const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

const REGION = "asia-northeast1";

// Gmail / Google Workspace の送信元アドレスとアプリパスワード
// `firebase functions:secrets:set GMAIL_USER` / `GMAIL_APP_PASSWORD` で設定
const GMAIL_USER = defineSecret("GMAIL_USER");
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

// 非機密の設定値。functions/.env.<project-id> に書く（params のデフォルト値が使われる）
const SITE_URL = defineString("SITE_URL", { default: "https://your-project.web.app" });
const ORG_NAME = defineString("ORG_NAME", { default: "災害位置情報報告システム" });

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER.value(),
      pass: GMAIL_APP_PASSWORD.value(),
    },
  });
}

async function getAllUserEmails() {
  const emails = [];
  let nextPageToken;
  do {
    const result = await admin.auth().listUsers(1000, nextPageToken);
    result.users.forEach((u) => {
      if (u.email) emails.push(u.email);
    });
    nextPageToken = result.pageToken;
  } while (nextPageToken);
  return emails;
}

async function sendBroadcast(subject, text) {
  const emails = await getAllUserEmails();
  if (emails.length === 0) return;

  const transporter = getTransporter();
  // 宛先同士が見えないよう、1人ずつ個別に送信（BCC送信ではなく逐次送信）
  for (const to of emails) {
    await transporter.sendMail({
      from: `"${ORG_NAME.value()}" <${GMAIL_USER.value()}>`,
      to,
      subject,
      text,
    });
  }
}

// 新規報告が登録されたら全ユーザーに通知
exports.onReportCreated = onDocumentCreated(
  { document: "reports/{reportId}", region: REGION, secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (event) => {
    const report = event.data.data();
    if (!report) return;

    const subject = `【${ORG_NAME.value()}】新しい報告が登録されました`;
    const text = [
      "新しい被害報告が登録されました。",
      "",
      `報告時刻: ${report.reportedAt || ""}`,
      `被害情報: ${report.damageInfo || ""}`,
      `位置: ${report.latitude}, ${report.longitude}`,
      `対応状況: ${report.status || ""}`,
      "",
      "詳細はシステムでご確認ください。",
      SITE_URL.value(),
    ].join("\n");

    await sendBroadcast(subject, text);
  }
);

// 対応状況（status）が変更されたら全ユーザーに通知
exports.onReportStatusUpdated = onDocumentUpdated(
  { document: "reports/{reportId}", region: REGION, secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before || !after || before.status === after.status) return;

    const subject = `【${ORG_NAME.value()}】対応状況が更新されました`;
    const text = [
      "報告の対応状況が更新されました。",
      "",
      `被害情報: ${after.damageInfo || ""}`,
      `対応状況: ${before.status || ""} → ${after.status || ""}`,
      "",
      "詳細はシステムでご確認ください。",
      SITE_URL.value(),
    ].join("\n");

    await sendBroadcast(subject, text);
  }
);

// 管理者がWeb画面から任意のメッセージを全ユーザーに送信（警報など）
exports.sendManualAlert = onCall(
  { region: REGION, secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "ログインが必要です");
    }
    const message = (request.data && request.data.message || "").trim();
    if (!message) {
      throw new HttpsError("invalid-argument", "メッセージを入力してください");
    }

    const subject = `【${ORG_NAME.value()}】お知らせ`;
    const text = `${message}\n\n${SITE_URL.value()}`;
    await sendBroadcast(subject, text);
    return { success: true };
  }
);
