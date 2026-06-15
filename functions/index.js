const { onValueCreated } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.database();

// 🚨 ใส่ค่า Token และ Group ID ของคุณตรงนี้
const LINE_ACCESS_TOKEN = "ไอ้ตัวยาวๆ_CHANNEL_ACCESS_TOKEN_ของคุณ";
const LINE_GROUP_ID = "รหัสห้องกลุ่มไลน์ของคุณ_ที่ขึ้นต้นด้วย_C..."; 

/**
 * 🚀 ฟังก์ชันที่ 1: ตรวจจับเมื่อมีการสร้างตี้ใหม่ -> ยิง Flex Message หรูเข้ากลุ่ม LINE ทันที
 */
exports.onMatchCreated = onValueCreated("/activeMatch", async (event) => {
    const matchData = event.data.val();
    if (!matchData || !matchData.hasActive) return;

    // แปลงฟอร์แมตวันที่ให้อ่านง่าย
    const thaiDate = new Date(matchData.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long' });

    // โครงสร้างกล่องข้อความสวยงามบน LINE (Flex Message)
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

    // ยิงข้อความเข้าห้องไลน์กลุ่มหลัก
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
        console.log("ส่งการ์ดแจ้งเตือนเปิดตี้เข้าไลน์กลุ่มสำเร็จแล้ว");
    } catch (error) {
        console.error("ยิงไลน์ไม่ผ่าน:", error.response ? error.response.data : error.message);
    }
});

/**
 * ⏰ ฟังก์ชันที่ 2: ตั้งเวลาปลุกทุก 15 นาที เพื่อเช็กตี้และยิงแจ้งเตือนล่วงหน้า 2 ชั่วโมง
 */
exports.check2HourReminder = onSchedule("every 15 minutes", async (event) => {
    const matchSnapshot = await db.ref("activeMatch").get();
    const match = matchSnapshot.val();

    // ถ้าไม่มีตี้ หรือ ตี้นั้นเคยแจ้งเตือนล่วงหน้า 2 ชม. ไปแล้ว ให้ข้ามเลย
    if (!match || !match.hasActive || match.notified2Hr) return;

    // คำนวณหาจุดเวลาเริ่มตี้ (ผสมวันที่ YYYY-MM-DD กับเวลา HH:MM)
    const matchDateTime = new Date(`${match.date}T${match.time}:00`);
    const now = new Date();

    // หาระยะห่างของเวลาปัจจุบัน กับเวลาเริ่มตี (แปลงค่าเป็นหน่วยมิลลิวินาที)
    const timeDiffMs = matchDateTime - now;
    const twoHoursInMs = 2 * 60 * 60 * 1000;

    // หากเวลาถอยหลังเหลือต่ำกว่าหรือเท่ากับ 2 ชั่วโมงพอดี ให้ทำกระบวนการคอนเฟิร์ม
    if (timeDiffMs > 0 && timeDiffMs <= twoHoursInMs) {
        
        // ดึงรายชื่อผู้เล่นทั้งหมดที่มาต่อคิว ณ ปัจจุบัน
        const regSnapshot = await db.ref("registrations").get();
        const regData = regSnapshot.val() || {};
        const players = Object.keys(regData).map(key => regData[key]);

        // แยกรายชื่อเฉพาะฝั่ง "ตัวจริง" ออกมาตามโควตาที่กำหนดไว้ตอนสร้าง
        const realPlayers = players.slice(0, parseInt(match.maxPlayers));
        
        let playerNamesText = "";
        realPlayers.forEach((p, idx) => {
            playerNamesText += `${idx + 1}. ${p.name}\n`;
        });

        if (realPlayers.length === 0) playerNamesText = "ยังไม่มีสมาชิกลงชื่อตัวจริง";

        // เขียนข้อความสรุปยอดส่งหาห้องแชทไลน์กลุ่ม
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

            // ปักหมุดบันทึกลงฐานข้อมูลว่าแมตช์นี้ยิงเตือน 2 ชม. สำเร็จแล้ว จะได้ไม่ส่งซ้ำซ้อนอีก
            await db.ref("activeMatch/notified2Hr").set(true);
            console.log("ส่งข้อความเตือนความพร้อม 2 ชั่วโมงเข้าห้องแชทเรียบร้อย");
        } catch (error) {
            console.error("ส่งข้อความนับถอยหลังล้มเหลว:", error.message);
        }
    }
});
