const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");

const MY_DATABASE_URL = "https://bokbak-badminton-default-rtdb.firebaseio.com";

admin.initializeApp({
    databaseURL: MY_DATABASE_URL
});
const db = admin.database();

// 🚨 ใส่ค่า Token และ Group ID ของคุณตรงนี้
const LINE_ACCESS_TOKEN = "ไอ้ตัวยาวๆ_CHANNEL_ACCESS_TOKEN_ของคุณ";
const LINE_GROUP_ID = "รหัสห้องกลุ่มไลน์ของคุณ_ที่ขึ้นต้นด้วย_C..."; 

/**
 * 🚀 ฟังก์ชันที่ 1: รับสัญญาณตรงจากหน้าเว็บ แล้วยิง Flex Message เข้า LINE ทันที (HTTP onRequest เวอร์ชันเสถียรสุด)
 */
exports.onMatchCreated = onRequest({ cors: true }, async (req, res) => {
    // ดึงข้อมูลตี้ที่หน้าเว็บส่งมาให้
    const matchData = req.body.data;
    
    if (!matchData || !matchData.hasActive) {
        return res.status(400).send("ไม่มีข้อมูลแมตช์ส่งมา");
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
                            { type: "text", text: `📍 สนาม: ${matchData.location}`, size: "sm", color: "#555555" },
                            { type: "text", text: `📅 วันที่: ${thaiDate}`, size: "sm", color: "#555555" },
                            { type: "text", text: `⏰ เวลาเริ่ม: ${matchData.time} น. เป็นต้นไป`, size: "sm", color: "#555555" },
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
                            label: "🙋‍♂️ กดเปิดหน้าต่างลงชื่อเข้าตี้",
                            uri: "https://liff.line.me/2010400559-X4eBS5zg"
                        }
                    }
                ],
                flex: 1
            }
        }
    };

    try {
        await axios.post("https://api.line.me/v2/bot/message/push", {
            to: LINE_GROUP_ID,
            messages: [flexMessage]
        }, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${LINE_ACCESS_TOKEN}`
            }
        });
        return res.status(200).send("ส่งแจ้งเตือนเข้าไลน์กลุ่มสำเร็จ");
    } catch (error) {
        console.error("ยิงไลน์ไม่ผ่าน:", error.message);
        return res.status(500).send("บอทไลน์ทำงานล้มเหลว");
    }
});

/**
 * ⏰ ฟังก์ชันที่ 2: ตั้งเวลาปลุกทุก 15 นาที เพื่อเช็กตี้และยิงแจ้งเตือนล่วงหน้า 2 ชั่วโมง
 */
exports.check2HourReminder = onSchedule("every 15 minutes", async (event) => {
    const matchSnapshot = await db.ref("activeMatch").get();
    const match = matchSnapshot.val();

    if (!match || !match.hasActive || match.notified2Hr) return;

    const matchDateTime = new Date(`${match.date}T${match.time}:00`);
    const now = new Date();

    const timeDiffMs = matchDateTime - now;
    const twoHoursInMs = 2 * 60 * 60 * 1000;

    if (timeDiffMs > 0 && timeDiffMs <= twoHoursInMs) {
        const regSnapshot = await db.ref("registrations").get();
        const regData = regSnapshot.val() || {};
        const players = Object.keys(regData).map(key => regData[key]);

        const realPlayers = players.slice(0, parseInt(match.maxPlayers));
        
        let playerNamesText = "";
        realPlayers.forEach((p, idx) => {
            playerNamesText += `${idx + 1}. ${p.name}\n`;
        });

        if (realPlayers.length === 0) playerNamesText = "ยังไม่มีสมาชิกลงชื่อตัวจริง";

        const reminderText = `📢 [ประกาศแจ้งเตือนตี้แบดอีก 2 ชั่วโมง!]\n` +
                             `สนาม: ${match.location}\n` +
                             `เวลาเริ่ม: ${match.time} น.\n\n` +
                             `🔥 สรุปรายชื่อตัวจริงยื่นยันสิทธิ์:\n${playerNamesText}\n` +
                             `⚠️ สมาชิกท่านใดในรายชื่อตัวจริงติดธุระด่วน รบกวนกด 'ยกเลิกคิว' ออกจากตี้ผ่านแอป LIFF ทันที เพื่อให้คิวสำรองดันขึ้นมาแทนที่โดยอัตโนมัติครับ! 🐾`;

        try {
            await axios.post("https://api.line.me/v2/bot/message/push", {
                to: LINE_GROUP_ID,
                messages: [{ type: "text", text: reminderText }]
            }, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${LINE_ACCESS_TOKEN}`
                }
            });

            await db.ref("activeMatch/notified2Hr").set(true);
            console.log("ส่งข้อความเตือนความพร้อม 2 ชั่วโมงเรียบร้อย");
        } catch (error) {
            console.error("ส่งข้อความนับถอยหลังล้มเหลว:", error.message);
        }
    }
});
