const { onSchedule } = require("firebase-functions/v2/scheduler");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const MY_DATABASE_URL = "https://bokbak-badminton-default-rtdb.firebaseio.com";

admin.initializeApp({
    databaseURL: MY_DATABASE_URL
});
const db = admin.database();

const LINE_ACCESS_TOKEN = "fgXW8VjBTGRcvHOHDMWH0edxxnb4YQ2OpIXvooT8IG3yfwvExyYyuYc/+dBwEqYS6poYGnaMCO6KoGVGjIGBonCGNorv/18cSqQJ2dgMm55EALWchtAaYNCcQV7JFEOrDdSXO2Auarc84XSuvFnu9AdB04t89/1O/w1cDnyilFU=";
const LINE_GROUP_ID = "Ce835d108875b2dbf5265af2cf5a9367b";
const THAILAND_UTC_OFFSET = "+07:00";

function getMatchDateTime(match) {
    return new Date(`${match.date}T${match.time}:00${THAILAND_UTC_OFFSET}`);
}

function getTimeUntilMatchMs(match, now = new Date()) {
    return getMatchDateTime(match).getTime() - now.getTime();
}

// ============================
// 🔐 ตรวจสอบว่า userId เป็นสมาชิกกลุ่ม LINE หรือไม่
// ============================
async function isGroupMember(userId) {
    try {
        const response = await axios.get(
            `https://api.line.me/v2/bot/group/${LINE_GROUP_ID}/member/${userId}`,
            { headers: { "Authorization": `Bearer ${LINE_ACCESS_TOKEN}` } }
        );
        return response.status === 200;
    } catch (error) {
        // 404 = ไม่ใช่สมาชิกกลุ่ม
        return false;
    }
}

// ============================
// 🔐 API ตรวจสอบสมาชิกกลุ่ม (เรียกจาก LIFF)
// ============================
exports.apiCheckGroupMember = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).send('');

    const { userId } = req.body.data || {};
    if (!userId) return res.status(400).send({ data: { isMember: false } });

    const isMember = await isGroupMember(userId);
    return res.status(200).send({ data: { isMember } });
});

// ============================
// 🚀 1. API แจ้งเตือนเมื่อมีการสร้างตี้ใหม่
// ============================
exports.apiNotifyMatchCreated = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).send('');

    const matchData = req.body.data;
    if (!matchData || !matchData.id) return res.status(400).send("ไม่พบข้อมูลแมตช์");

    const thaiDate = new Date(matchData.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long' });

    const flexMessage = {
        type: "flex",
        altText: "🏸 มีตี้แบดมินตันเปิดใหม่จ้าาา! 🐾",
        contents: {
            type: "bubble",
            hero: {
                type: "image",
                url: "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=1000",
                size: "full",
                aspectRatio: "20:13",
                aspectMode: "cover"
            },
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    { type: "text", text: "🏸 เปิดตี้แบดมินตันใหม่! 🐾", weight: "bold", size: "xl", color: "#1db446" },
                    {
                        type: "box",
                        layout: "vertical",
                        margin: "md",
                        spacing: "sm",
                        contents: [
                            { type: "text", text: `📍 สนาม: ${matchData.location}`, size: "sm", color: "#555555", wrap: true },
                            { type: "text", text: `📅 วันที่: ${thaiDate}`, size: "sm", color: "#555555" },
                            { type: "text", text: `⏰ เวลา: ${matchData.time} - ${matchData.endTime} น.`, size: "sm", color: "#555555" },
                            { type: "text", text: `👑 หัวหน้าตี้: ${matchData.creatorName}`, size: "sm", color: "#e67e22", weight: "bold" },
                            { type: "text", text: `👥 รับตัวจริงสูงสุด: ${matchData.maxPlayers} คน`, size: "sm", color: "#27ae60", weight: "bold" }
                        ]
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                spacing: "sm",
                contents: [
                    {
                        type: "button",
                        style: "link",
                        height: "sm",
                        action: {
                            type: "uri",
                            label: "🙋‍♂️ กดส่องและลงชื่อเข้าตี้",
                            uri: `https://liff.line.me/2010400559-X4eBS5zg?matchId=${matchData.id}`
                        }
                    }
                ]
            }
        }
    };

    try {
        await axios.post("https://api.line.me/v2/bot/message/push", {
            to: LINE_GROUP_ID,
            messages: [flexMessage]
        }, { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_ACCESS_TOKEN}` } });
        return res.status(200).send({ data: { success: true, message: "ส่งข่าวเปิดตี้สำเร็จ" } });
    } catch (error) {
        console.error(error);
        return res.status(500).send({ data: { error: error.message } });
    }
});

// ============================
// 🗑️ 2. API แจ้งเตือนเมื่อยกเลิกตี้
// ============================
exports.apiNotifyMatchDeleted = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).send('');

    const matchData = req.body.data;
    if (!matchData) return res.status(400).send("ไม่มีข้อมูล");

    const thaiDate = new Date(matchData.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    const textMsg = `🗑️ [ประกาศยกเลิกตี้แบดมินตัน]\n📌 สนาม: ${matchData.location}\n📅 วันที่: ${thaiDate}\n⏰ เวลา: ${matchData.time} - ${matchData.endTime} น.\n\nตี้ดังกล่าวถูกยกเลิกโดยหัวหน้าตี้แล้วครับ 🙏`;

    try {
        await axios.post("https://api.line.me/v2/bot/message/push", {
            to: LINE_GROUP_ID,
            messages: [{ type: "text", text: textMsg }]
        }, { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_ACCESS_TOKEN}` } });
        return res.status(200).send({ data: { success: true } });
    } catch (error) {
        console.error(error);
        return res.status(500).send({ data: { error: error.message } });
    }
});

// ============================
// 💰 3. API แจ้งเตือนเรียกเก็บเงิน
// ============================
exports.apiNotifyBilling = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).send('');

    const dataObj = req.body.data;
    if (!dataObj) return res.status(400).send("ไม่มีข้อมูล");

    const { matchId, summaryText, bankInfo, paymentDate } = dataObj;
    const paymentDateText = paymentDate ? `\n📅 ระบบรับโอนตั้งแต่หลังส่งบิล: ${paymentDate}` : '';
    const textMsg = `💰 [เรียกเก็บค่าตีแบดมินตันมาแล้วจ้า!]\n\n${summaryText}${paymentDateText}\n\n🏦 ช่องทางชำระเงิน:\n${bankInfo}\n\n🤖 แนบสลิปแล้วระบบตรวจยอด และเวลาโอนต้องอยู่หลังส่งบิลเข้ากลุ่ม LINE\n👉 กดแนบสลิปได้ที่นี่:\nhttps://liff.line.me/2010400559-X4eBS5zg?matchId=${matchId}`;
    try {
        await axios.post("https://api.line.me/v2/bot/message/push", {
            to: LINE_GROUP_ID,
            messages: [{ type: "text", text: textMsg }]
        }, { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_ACCESS_TOKEN}` } });
        return res.status(200).send({ data: { success: true } });
    } catch (error) {
        console.error(error);
        return res.status(500).send({ data: { error: error.message } });
    }
});

// ============================
// ⏰ 4. Scheduler: แจ้งเตือนก่อนตี้ 2 ชั่วโมง
// ============================
exports.check2HourReminder = onSchedule("every 15 minutes", async (event) => {
    const snapshot = await db.ref("matches").get();
    const matches = snapshot.val() || {};
    const now = new Date();

    for (let key in matches) {
        const match = matches[key];
        if (match.status !== 'active' || match.notified2Hr) continue;

        const timeDiffMs = getTimeUntilMatchMs(match, now);
        const twoHoursMs = 2 * 60 * 60 * 1000;

        if (timeDiffMs > 0 && timeDiffMs <= twoHoursMs) {
            const regData = match.registrations || {};
            const players = Object.keys(regData).map(k => regData[k]).sort((a, b) => a.timestamp - b.timestamp);
             const maxPlayers = parseInt(match.maxPlayers);
            const realPlayers = players.slice(0, maxPlayers);
            const waitingPlayers = players.slice(maxPlayers);

            let playerNamesText = realPlayers.length > 0
                ? realPlayers.map((p, i) => `${i + 1}. ${p.name}`).join("\n")
                : "ยังไม่มีสมาชิกลงชื่อตัวจริง";

           let waitingText = waitingPlayers.length > 0
                ? `\n\n⏳ คิวสำรอง (${waitingPlayers.length} คน):\n${waitingPlayers.map((p, i) => `${i + 1}. ${p.name}`).join("\n")}`
                : "\n\n⏳ คิวสำรอง: ยังไม่มีคิวสำรอง";

            const reminderText = `📢 [แจ้งเตือน! เหลืออีก 2 ชั่วโมงก็จะถึงเวลาตี้แบดแล้ว!]\n\n📍 สนาม: ${match.location}\n⏰ เวลา: ${match.time} - ${match.endTime} น.\n\n🔥 รายชื่อตัวจริง (${realPlayers.length} คน):\n${playerNamesText}${waitingText}\n\n⚠️ หลังจากนี้อีก 1 ชั่วโมง ระบบจะล็อครายชื่อ ไม่สามารถยกเลิกได้แล้ว!\n(ถ้าจะถอนตัวรีบทำตอนนี้เลยนะครับ) 🐾`;
            try {
                await axios.post("https://api.line.me/v2/bot/message/push", {
                    to: LINE_GROUP_ID,
                    messages: [{ type: "text", text: reminderText }]
                }, { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_ACCESS_TOKEN}` } });

                await db.ref(`matches/${key}/notified2Hr`).set(true);
                console.log(`✅ ส่งแจ้งเตือน 2 ชม. สำเร็จ: Match ${key}`);
            } catch (error) {
                console.error("แจ้งเตือน 2 ชม. พัง Match:", key, error);
            }
        }
    }
});

// ============================
// ⏰ 5. Scheduler: แจ้งเตือนก่อนตี้ 1 ชั่วโมง + ล็อครายชื่อ
// ============================
exports.check1HourReminder = onSchedule("every 15 minutes", async (event) => {
    const snapshot = await db.ref("matches").get();
    const matches = snapshot.val() || {};
    const now = new Date();

    for (let key in matches) {
        const match = matches[key];
        if (match.status !== 'active' || match.notified1Hr) continue;

        const timeDiffMs = getTimeUntilMatchMs(match, now);
        const oneHourMs = 60 * 60 * 1000;

        if (timeDiffMs > 0 && timeDiffMs <= oneHourMs) {
            const regData = match.registrations || {};
            const players = Object.keys(regData).map(k => regData[k]).sort((a, b) => a.timestamp - b.timestamp);
            const realPlayers = players.slice(0, parseInt(match.maxPlayers));
            const waitingPlayers = players.slice(parseInt(match.maxPlayers));

            // 🔒 ล็อครายชื่อ — ไม่ให้ยกเลิก/ถอนตัวแล้ว
            await db.ref(`matches/${key}/isLocked`).set(true);

            let realText = realPlayers.length > 0
                ? realPlayers.map((p, i) => `${i + 1}. ${p.name}`).join("\n")
                : "ยังไม่มีสมาชิก";


            const reminderText = `🔔 [สรุปรายชื่อ! เหลืออีก 1 ชั่วโมงก็จะถึงเวลาตี้แล้ว!]\n\n📍 สนาม: ${match.location}\n⏰ เวลา: ${match.time} - ${match.endTime} น.\n\n✅ รายชื่อตัวจริง (ล็อคแล้ว ${realPlayers.length} คน):\n${realText}\n\n🔒 ระบบล็อครายชื่อแล้ว ไม่สามารถยกเลิก/ถอนตัวได้อีกแล้วนะครับ!\nพบกันที่สนามครับ 🏸🐾`;

            try {
                await axios.post("https://api.line.me/v2/bot/message/push", {
                    to: LINE_GROUP_ID,
                    messages: [{ type: "text", text: reminderText }]
                }, { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_ACCESS_TOKEN}` } });

                await db.ref(`matches/${key}/notified1Hr`).set(true);
                console.log(`✅ ส่งแจ้งเตือน 1 ชม. + ล็อคแล้ว: Match ${key}`);
            } catch (error) {
                console.error("แจ้งเตือน 1 ชม. พัง Match:", key, error);
            }
        }
    }
});


// ============================
// 🤖 6. API แจ้งผลตรวจสลิปอัตโนมัติ
// ============================
exports.apiNotifySlipChecked = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).send('');

    const dataObj = req.body.data;
    if (!dataObj) return res.status(400).send("ไม่มีข้อมูล");

    const { matchId, memberName, status, remark } = dataObj;
    const isPaid = status === 'paid';
    const textMsg = isPaid
        ? `✅ [ชำระเงินแล้ว]
${memberName} ชำระเงินเรียบร้อย ระบบตรวจยอดและวันที่ถูกต้องแล้วจ้า 🧾✨`
        : `⚠️ [สลิปต้องตรวจสอบอีกที]
${memberName} ส่งสลิปแล้ว แต่${remark || 'ยอด/วันที่ไม่ตรง'}
รบกวนหัวตี้ตรวจสอบอีกครั้งนะครับ`;

    try {
        await axios.post("https://api.line.me/v2/bot/message/push", {
            to: LINE_GROUP_ID,
            messages: [{ type: "text", text: `${textMsg}\n\nเปิดหน้าตี้: https://liff.line.me/2010400559-X4eBS5zg?matchId=${matchId}` }]
        }, { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_ACCESS_TOKEN}` } });
        return res.status(200).send({ data: { success: true } });
    } catch (error) {
        console.error(error);
        return res.status(500).send({ data: { error: error.message } });
    }
});

// ============================
// ⏰ 7. Scheduler: ตามคนยังไม่จ่ายทุก 6 ชั่วโมง
// ============================
exports.remindUnpaidEvery6Hours = onSchedule("every 6 hours", async (event) => {
    const snapshot = await db.ref("matches").get();
    const matches = snapshot.val() || {};

    for (let key in matches) {
        const match = matches[key];
        if (match.status !== 'billing') continue;

        const regData = match.registrations || {};
        const players = Object.keys(regData).map(k => regData[k]).sort((a, b) => a.timestamp - b.timestamp);
        const realPlayers = players.slice(0, parseInt(match.maxPlayers));
        const unpaidPlayers = realPlayers.filter(p => !p.isPaid);
        if (unpaidPlayers.length === 0) continue;

        const unpaidText = unpaidPlayers.map((p, i) => `${i + 1}. ${p.name}${p.paymentStatus === 'rejected' ? ' (สลิปยอด/วันที่ไม่ตรง)' : ''}`).join("\n");
        const reminderText = `⏰ [แจ้งเตือนชำระเงินทุก 6 ชม.]\n\nตี้: ${match.location} ${match.time}-${match.endTime} น.\nยอดคนละ: ${match.paymentPerHead || '-'} บาท\n\nยังรอชำระ/รอตรวจสอบ:\n${unpaidText}\n\nแนบสลิปได้ที่ https://liff.line.me/2010400559-X4eBS5zg?matchId=${key}`;

        try {
            await axios.post("https://api.line.me/v2/bot/message/push", {
                to: LINE_GROUP_ID,
                messages: [{ type: "text", text: reminderText }]
            }, { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_ACCESS_TOKEN}` } });
            await db.ref(`matches/${key}/lastUnpaidReminderAt`).set(Date.now());
            console.log(`✅ ส่งแจ้งเตือนค้างชำระ 6 ชม.: Match ${key}`);
        } catch (error) {
            console.error("แจ้งเตือนค้างชำระพัง Match:", key, error);
        }
    }
});
