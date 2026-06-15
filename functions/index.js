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

// Webhook เปล่าคงไว้ตามโครงสร้างเดิมของคุณ
exports.webhook = functions.https.onRequest((req, res) => {
    res.sendStatus(200);
});

// 🚀 1. API แจ้งเตือนเมื่อมีการสร้างตี้ใหม่
exports.apiNotifyMatchCreated = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }

    const matchData = req.body.data;
    if (!matchData || !matchData.id) {
        return res.status(400).send("ไม่พบข้อมูลแชร์แมตช์");
    }

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

// 🗑️ 2. API แจ้งเตือนเมื่อหัวตี้กดลบ/ยกเลิกตี้
exports.apiNotifyMatchDeleted = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }

    const matchData = req.body.data;
    if (!matchData) {
        return res.status(400).send("ไม่มีข้อมูล");
    }

    const thaiDate = new Date(matchData.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    const textMsg = `🗑️ [ประกาศยกเลิกตี้แบดมินตัน]\n📌 สนาม: ${matchData.location}\n📅 วันที่: ${thaiDate}\n⏰ เวลา: ${matchData.time} - ${matchData.endTime} น.\n\nตี้ดังกล่าวได้ถูกยุบหรือยกเลิกเรียบร้อยแล้วโดยหัวหน้าตี้ครับ 🙏`;

    try {
        await axios.post("https://api.line.me/v2/bot/message/push", {
            to: LINE_GROUP_ID,
            messages: [{ type: "text", text: textMsg }]
        }, { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_ACCESS_TOKEN}` } });
        return res.status(200).send({ data: { success: true, message: "แจ้งยกเลิกตี้สำเร็จ" } });
    } catch (error) { 
        console.error(error);
        return res.status(500).send({ data: { error: error.message } });
    }
});

// 💰 3. API แจ้งเตือนเรียกเก็บเงินแชร์ค่าคอร์ด
exports.apiNotifyBilling = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }

    const dataObj = req.body.data;
    if (!dataObj) {
        return res.status(400).send("ไม่มีข้อมูลเรียกเก็บเงิน");
    }

    const { matchId, summaryText, bankInfo } = dataObj;
    const textMsg = `💰 [เรียกเก็บค่าตีแบดมินตันมาแล้วจ้า!]\n\n${summaryText}\n\n🏦 ช่องทางชำระเงินของหัวตี้:\n${bankInfo}\n\n👉 คลิกเพื่อเข้าไปแนบหลักฐานสลิปเงินคืนหัวตี้ได้ที่นี่เลย:\nhttps://liff.line.me/2010400559-X4eBS5zg?matchId=${matchId}`;

    try {
        await axios.post("https://api.line.me/v2/bot/message/push", {
            to: LINE_GROUP_ID,
            messages: [{ type: "text", text: textMsg }]
        }, { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_ACCESS_TOKEN}` } });
        return res.status(200).send({ data: { success: true, message: "ส่งบิลเข้ากลุ่มสำเร็จ" } });
    } catch (error) { 
        console.error(error);
        return res.status(500).send({ data: { error: error.message } });
    }
});

// ⏰ 4. ระบบเช็กยอดแจ้งเตือนอัตโนมัติล่วงหน้า 2 ชั่วโมง (v2 Cloud Scheduler)
exports.check2HourReminder = onSchedule("every 15 minutes", async (event) => {
    const snapshot = await db.ref("matches").get();
    const matches = snapshot.val() || {};
    const now = new Date();

    for (let key in matches) {
        const match = matches[key];
        if (match.status !== 'active' || match.notified2Hr) continue;

        const matchDateTime = new Date(`${match.date}T${match.time}:00`);
        const timeDiffMs = matchDateTime - now;
        const twoHoursInMs = 2 * 60 * 60 * 1000;

        if (timeDiffMs > 0 && timeDiffMs <= twoHoursInMs) {
            const regData = match.registrations || {};
            const players = Object.keys(regData).map(k => regData[k]).sort((a,b) => a.timestamp - b.timestamp);
            const realPlayers = players.slice(0, parseInt(match.maxPlayers));

            let playerNamesText = "";
            realPlayers.forEach((p, idx) => { playerNamesText += `${idx + 1}. ${p.name}\n`; });
            if (realPlayers.length === 0) playerNamesText = "ยังไม่มีสมาชิกลงชื่อตัวจริง";

            const reminderText = `📢 [ประกาศแจ้งเตือนตี้แบดอีก 2 ชั่วโมง!]\nสนาม: ${match.location}\nเวลา: ${match.time} - ${match.endTime} น.\n\n🔥 สรุปรายชื่อตัวจริงยื่นยันสิทธิ์:\n${playerNamesText}\n⚠️ สมาชิกท่านใดติดธุระ รบกวนกด 'ยกเลิกคิว' ออกจากตี้ผ่านแอปด้วยครับ! 🐾`;

            try {
                await axios.post("https://api.line.me/v2/bot/message/push", {
                    to: LINE_GROUP_ID,
                    messages: [{ type: "text", text: reminderText }]
                }, { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_ACCESS_TOKEN}` } });

                await db.ref(`matches/${key}/notified2Hr`).set(true);
            } catch (error) { 
                console.error("ระบบแจ้งเตือนผิดพลาดที่ ID แมตช์:", key, error); 
            }
        }
    }
});
