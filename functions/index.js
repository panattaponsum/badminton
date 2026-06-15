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
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }

    try {
        const match = req.body.data;
        const thaiDate = new Date(match.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
        const flexMessage = {
            type: "flex",
            altText: "🏸 มีตี้แบดมินตันเปิดใหม่จ้า 🐾",
            contents: {
                type: "bubble",
                body: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        { type: "text", text: "🏸 ก๊วนบ๊อกแบ๊ก แบดมินตัน 🐾", weight: "bold", color: "#1DB954", size: "sm" },
                        { type: "text", text: "เปิดนัดตีแบดมินตันตี้ใหม่!", weight: "bold", size: "xl", margin: "md" },
                        {
                            type: "box", layout: "vertical", margin: "lg", spacing: "sm", contents: [
                                { type: "box", layout: "baseline", spacing: "sm", contents: [{ type: "text", text: "สนาม", color: "#aaaaaa", size: "sm", flex: 2 }, { type: "text", text: match.location, wrap: true, color: "#666666", size: "sm", flex: 5 }] },
                                { type: "box", layout: "baseline", spacing: "sm", contents: [{ type: "text", text: "วันที่ตี", color: "#aaaaaa", size: "sm", flex: 2 }, { type: "text", text: thaiDate, wrap: true, color: "#666666", size: "sm", flex: 5 }] },
                                { type: "box", layout: "baseline", spacing: "sm", contents: [{ type: "text", text: "เวลา", color: "#aaaaaa", size: "sm", flex: 2 }, { type: "text", text: `${match.time} - ${match.endTime} น.`, wrap: true, color: "#666666", size: "sm", flex: 5 }] },
                                { type: "box", layout: "baseline", spacing: "sm", contents: [{ type: "text", text: "ผู้สร้าง", color: "#aaaaaa", size: "sm", flex: 2 }, { type: "text", text: match.creatorName, wrap: true, color: "#1DB954", size: "sm", flex: 5 }] }
                            ]
                        }
                    ]
                },
                footer: {
                    type: "box", layout: "vertical", spacing: "sm", contents: [
                        { type: "button", style: "link", height: "sm", action: { type: "uri", label: "🙋‍♂️ คลิกจองต่อคิวเข้าตี้", uri: `https://liff.line.me/2010400559-X4eBS5zg?matchId=${match.id}` } }
                    ]
                }
            }
        };

        await axios.post("https://api.line.me/v2/bot/message/push", { to: LINE_GROUP_ID, messages: [flexMessage] }, { headers: { "Authorization": `Bearer ${LINE_ACCESS_TOKEN}` } });
        res.status(200).send({ result: "ส่งใบการ์ดชวนตี้แบดเข้าไลน์กลุ่มเรียบร้อยแล้ว!" });
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.message });
    }
});

// 🚀 2. API แจ้งสรุปเรียกเก็บเงิน (Billing) พร้อมเลขบัญชี
exports.apiNotifyBilling = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }

    try {
        const { matchId, summaryText, bankInfo } = req.body.data;
        const billingMessage = {
            type: "flex",
            altText: "💰 บิลเรียกเก็บค่าแชร์ตี้แบดออกแล้วจ้า!",
            contents: {
                type: "bubble",
                body: {
                    type: "box", layout: "vertical", contents: [
                        { type: "text", text: "💰 สรุปบิลค่าใช้จ่ายก๊วนแบด 🐾", weight: "bold", color: "#E63946", size: "sm" },
                        { type: "text", text: summaryText, wrap: true, size: "sm", margin: "md", fontStyle: "normal", weight: "medium", leading: "md" },
                        { type: "separator", margin: "md" },
                        { type: "text", text: `🏦 ช่องทางโอนเงินคืนหัวตี้:\n${bankInfo}`, wrap: true, color: "#1D3557", size: "sm", weight: "bold", margin: "md" }
                    ]
                },
                footer: {
                    type: "box", layout: "vertical", spacing: "sm", contents: [
                        { type: "button", style: "primary", color: "#E63946", height: "sm", action: { type: "uri", label: "📤 แนบหลักฐานสลิปโอนเงิน", uri: `https://liff.line.me/2010400559-X4eBS5zg?matchId=${matchId}` } }
                    ]
                }
            }
        };

        await axios.post("https://api.line.me/v2/bot/message/push", { to: LINE_GROUP_ID, messages: [billingMessage] }, { headers: { "Authorization": `Bearer ${LINE_ACCESS_TOKEN}` } });
        res.status(200).send({ result: "ส่งบิลแชร์เรียกเก็บเงินสำเร็จ!" });
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.message });
    }
});

// 🚀 3. Scheduler ทำงานทุกๆ 15 นาที เพื่อตรวจเช็กตี้แบดอีก 2 ชั่วโมงจะเริ่ม (เวอร์ชันแก้บั๊กเวลาไทย + จัดการ Memory)
exports.checkTwoHourReminder = onSchedule({
    schedule: "every 15 minutes",
    timeZone: "Asia/Bangkok", // 🌟 บังคับเซิร์ฟเวอร์ยึดตามเขตเวลาประเทศไทย
    memory: "256MiB"
}, async (event) => {
    // คำนวณเวลาปัจจุบันให้เป็นเวลาไทย
    const nowThailand = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    
    try {
        const snapshot = await db.ref("matches").once("value");
        const matches = snapshot.val() || {};

        for (const matchId in matches) {
            const match = matches[matchId];
            
            // ข้ามตี้ที่แจ้งเตือนไปแล้ว หรือไม่ได้อยู่ในสถานะ active
            if (match.notified2Hr || match.status !== "active") continue;

            // แปลงเวลาของตี้แบดมินตัน
            const matchDateTime = new Date(`${match.date}T${match.time}:00`);
            const timeDiffMs = matchDateTime - nowThailand;
            const twoHoursInMs = 2 * 60 * 60 * 1000;

            // 🎯 เงื่อนไข: ถ้าตี้กำลังจะเริ่มในอีกไม่เกิน 2 ชั่วโมงล่วงหน้า
            if (timeDiffMs > 0 && timeDiffMs <= twoHoursInMs) {
                const regData = match.registrations || {};
                const players = Object.keys(regData).map(k => regData[k]).sort((a,b) => a.timestamp - b.timestamp);
                const realPlayers = players.slice(0, parseInt(match.maxPlayers));

                let playerNamesText = "";
                realPlayers.forEach((p, idx) => {
                    playerNamesText += `${idx + 1}. ${p.name}\n`;
                });
                if (realPlayers.length === 0) playerNamesText = "ยังไม่มีสมาชิกลงชื่อตัวจริง";

                const reminderText = `📢 [ประกาศแจ้งเตือนตี้แบดอีก 2 ชั่วโมง!]\nสนาม: ${match.location}\nเวลา: ${match.time} - ${match.endTime} น.\n\n🔥 สรุปรายชื่อตัวจริงยืนยันสิทธิ์:\n${playerNamesText}\n⚠️ สมาชิกท่านใดติดธุระ รบกวนกด 'ยกเลิกคิว' ออกจากตี้ผ่านแอปด้วยครับ! 🐾`;

                // ส่งการ์ดเตือนเข้ากลุ่ม LINE
                await axios.post("https://api.line.me/v2/bot/message/push", {
                    to: LINE_GROUP_ID,
                    messages: [{ type: "text", text: reminderText }]
                }, {
                    headers: { "Authorization": `Bearer ${LINE_ACCESS_TOKEN}` }
                });

                // อัปเดตสถานะลงฐานข้อมูลเพื่อไม่ให้ส่งซ้ำๆ อีก
                await db.ref(`matches/${matchId}/notified2Hr`).set(true);
            }
        }
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในระบบตั้งเวลาเตือน 2 ชม.:", error);
    }
});
