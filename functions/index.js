const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const axios = require("axios");

// เริ่มต้นระบบเชื่อมต่อฐานข้อมูล Firebase
admin.initializeApp();
const db = admin.firestore();

// ใส่ Token ของ LINE แชนแนลที่คุณให้มา
const LINE_ACCESS_TOKEN = 'rz2zRB//sleSPgt2mwuPkCPvivHc7Wt7I3FxzRg7msZCNpj00H2of4jlHFQPg6786poYGnaMCO6KoGVGjIGBonCGNorv/18cSqQJ2dgMm55/VqAaui3UvauJi5imMPw+NR0a1KSjHdiEEuYCfWsQjwdB04t89/1O/w1cDnyilFU=';

// ฟังก์ชันหลักที่เชื่อมต่อกับ LINE Webhook
exports.lineWebhook = onRequest({ cors: true }, async (req, res) => {
    // ตรวจสอบโครงสร้างข้อความที่ส่งมาจาก LINE
    const events = req.body.events;
    if (!events || events.length === 0) {
        return res.status(200).send("OK");
    }

    for (let event of events) {
        // ทำงานเฉพาะเมื่อมีข้อความตัวอักษรส่งเข้ามาในกลุ่ม
        if (event.type === 'message' && event.message.type === 'text') {
            const replyToken = event.replyToken;
            const userMessage = event.message.text.trim();

            // 💰 คำสั่งของก๊วน: /คิดเงิน [รหัสแมตช์] [ราคารวม]
            if (userMessage.startsWith('/คิดเงิน')) {
                const parts = userMessage.split(/\s+/); // แยกคำด้วยช่องว่าง
                
                if (parts.length < 3) {
                    await replyToLine(replyToken, "❌ รูปแบบคำสั่งไม่ถูกต้องน้า!\nกรุณาพิมพ์: /คิดเงิน [รหัสแมตช์] [ราคารวม]");
                    continue;
                }

                const matchId = parts[1];
                const totalCost = parseFloat(parts[2]);

                if (isNaN(totalCost) || totalCost <= 0) {
                    await replyToLine(replyToken, "❌ จำนวนเงินต้องเป็นตัวเลขที่มากกว่า 0 ครับ");
                    continue;
                }

                try {
                    // 1. ดึงข้อมูลรายละเอียดของแมตช์นั้นจากคอลเลกชัน matches
                    const matchDoc = await db.collection('matches').doc(matchId).get();
                    if (!matchDoc.exists) {
                        await replyToLine(replyToken, "❌ ไม่พบรหัสแมตช์นี้ในระบบก๊วน บ๊อกแบ๊ก แบดมินตัน ครับ");
                        continue;
                    }
                    const matchData = matchDoc.data();

                    // 2. ดึงรายชื่อผู้ลงทะเบียน โดยเรียงลำดับตามเวลา ใครกดก่อนได้สิทธิ์ก่อน
                    const regSnapshot = await db.collection('matches').doc(matchId).collection('registrations')
                                                .orderBy('timestamp', 'asc').get();

                    let players = [];
                    let count = 0;

                    // คัดเอาเฉพาะคนที่เป็น "ตัวจริง" (ไม่เกินจำนวน Max ที่ตั้งไว้ของตี้่นั้น)
                    regSnapshot.forEach(doc => {
                        if (count < matchData.maxPlayers) {
                            players.push(doc.data().displayName);
                        }
                        count++;
                    });

                    if (players.length === 0) {
                        await replyToLine(replyToken, "❌ แมตช์นี้ยังไม่มีผู้ลงทะเบียนเป็นตัวจริง จึงยังคิดเงินไม่ได้ครับ");
                        continue;
                    }

                    // 3. คำนวณเงินหารเท่า (ปัดเศษขึ้นเป็นจำนวนเต็มเพื่อไม่ให้คนสำรองจ่ายขาดทุนเศษสตางค์)
                    const costPerPerson = Math.ceil(totalCost / players.length);

                    // 4. บันทึกผลลัพธ์การคิดเงินลงฐานข้อมูล และเปลี่ยนสถานะแมตช์เป็นจบแล้ว (finished)
                    await db.collection('matches').doc(matchId).update({
                        status: 'finished',
                        totalCost: totalCost,
                        costPerPerson: costPerPerson,
                        calculatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    // 5. สรุปยอดเงินพิมพ์ตอบกลับแจ้งเตือนสมาชิกทุกคนในกลุ่ม LINE
                    let summaryMessage = `💰 สรุปค่าใช้จ่าย ก๊วนบ๊อกแบ๊ก แบดมินตัน 💰\n`;
                    summaryMessage += `📍 สนาม: ${matchData.location}\n`;
                    summaryMessage += `📅 วันที่: ${matchData.date} (${matchData.time})\n`;
                    summaryMessage += `💵 ยอดรวม: ${totalCost.toLocaleString()} บาท / หาร ${players.length} คน\n`;
                    summaryMessage += `💸 ตกคนละ: *${costPerPerson.toLocaleString()}* บาท\n`;
                    summaryMessage += `---------------------------\n`;
                    summaryMessage += `รายชื่อตัวจริงที่ร่วมแชร์ตี้:\n`;
                    
                    players.forEach((name, i) => {
                        summaryMessage += `${i + 1}. ${name} (${costPerPerson} บ.)\n`;
                    });
                    
                    summaryMessage += `\n🙏 รบกวนสมาชิกก๊วนโอนเงินคืนให้ผู้สำรองจ่ายด้วยนะคร้าบ! 🐶🐾`;

                    await replyToLine(replyToken, summaryMessage);

                } catch (error) {
                    console.error("Error calculating cost:", error);
                    await replyToLine(replyToken, "❌ เกิดข้อผิดพลาดของระบบฐานข้อมูล ไม่สามารถคิดเงินได้ในขณะนี้");
                }
            }
        }
    }
    return res.status(200).send('OK');
});

// ฟังก์ชันสำหรับยิงข้อความตอบกลับหาผู้ใช้ผ่าน LINE Messaging API
async function replyToLine(replyToken, textMessage) {
    try {
        await axios({
            method: 'post',
            url: 'https://api.line.me/v2/bot/message/reply',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
            },
            data: {
                replyToken: replyToken,
                messages: [{ type: 'text', text: textMessage }]
            }
        });
    } catch (err) {
        console.error("LINE Reply API Error:", err.response ? err.response.data : err.message);
    }
}
