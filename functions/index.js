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

const LIFF_URL = "https://liff.line.me/2010400559-X4eBS5zg";

async function pushLineMessage(messages) {
    return axios.post("https://api.line.me/v2/bot/message/push", {
        to: LINE_GROUP_ID,
        messages
    }, { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_ACCESS_TOKEN}` } });
}

async function replyLineMessage(replyToken, messages) {
    return axios.post("https://api.line.me/v2/bot/message/reply", {
        replyToken,
        messages
    }, { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_ACCESS_TOKEN}` } });
}

function getRealPlayers(match) {
    const regData = match.registrations || {};
    return Object.keys(regData)
        .map(k => regData[k])
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        .slice(0, parseInt(match.maxPlayers));
}

function getMedalByRank(rank) {
    if (rank === 1) return { key: "gold", icon: "🥇", label: "เหรียญทอง" };
    if (rank === 2) return { key: "silver", icon: "🥈", label: "เหรียญเงิน" };
    if (rank === 3) return { key: "bronze", icon: "🥉", label: "เหรียญทองแดง" };
    return null;
}

function buildMedalLeaderboardText(records) {
    const rows = Object.keys(records || {}).map(userId => {
        const r = records[userId] || {};
        return {
            userId,
            name: r.name || "ไม่ทราบชื่อ",
            gold: Number(r.gold || 0),
            silver: Number(r.silver || 0),
            bronze: Number(r.bronze || 0)
        };
    }).sort((a, b) => (b.gold - a.gold) || (b.silver - a.silver) || (b.bronze - a.bronze) || a.name.localeCompare(b.name, 'th'));

    if (rows.length === 0) return "ยังไม่มีประวัติเหรียญการจ่ายเงิน";
    return rows.map((r, i) => `${i + 1}. ${r.name} — 🥇${r.gold} 🥈${r.silver} 🥉${r.bronze}`).join("\n");
}

async function updatePaymentRankingAndNotify(matchId, memberId, memberName, isNewPaidNotice = true) {
    const matchSnap = await db.ref(`matches/${matchId}`).get();
    const match = matchSnap.val();
    if (!match) return { paidRank: null, allPaid: false };

    const realPlayers = getRealPlayers(match);
    const paidPlayers = realPlayers
        .filter(p => p.isPaid)
        .sort((a, b) => (a.paymentCheckedAt || Number.MAX_SAFE_INTEGER) - (b.paymentCheckedAt || Number.MAX_SAFE_INTEGER));

    const ranking = paidPlayers.map((p, index) => {
        const rank = index + 1;
        const medal = getMedalByRank(rank);
        return { id: p.id, name: p.name, rank, paidAt: p.paymentCheckedAt || Date.now(), medal: medal?.key || null };
    });
    await db.ref(`matches/${matchId}/paymentRanking`).set(ranking);

    const currentRank = ranking.find(r => r.id === memberId)?.rank || null;
    const currentMedal = getMedalByRank(currentRank);
    const paidList = ranking.map(r => {
        const medal = getMedalByRank(r.rank);
        return `${r.rank}. ${medal ? medal.icon + ' ' : ''}${r.name}`;
    }).join("\n") || "ยังไม่มีคนจ่าย";
    const allPaid = realPlayers.length > 0 && paidPlayers.length === realPlayers.length;

    if (isNewPaidNotice) {
        const medalText = currentMedal ? `\n🏅 ได้${currentMedal.label} ลำดับที่ ${currentRank}!` : `\nลำดับการจ่าย: #${currentRank}`;
        await pushLineMessage([{ type: "text", text: `✅ [มีคนจ่ายเงินแล้ว]\n${memberName} ชำระเงินเรียบร้อยแล้ว${medalText}\n\n📊 อันดับจ่ายเงินตี้นี้\n${paidList}\n\nคงเหลือ ${Math.max(realPlayers.length - paidPlayers.length, 0)} คน` }]);
    }

    if (allPaid && !match.paymentMedalsFinalized) {
        const medalUpdates = {};
        ranking.slice(0, 3).forEach(r => {
            const medal = getMedalByRank(r.rank);
            if (!medal) return;
            medalUpdates[`paymentMedalRecords/${r.id}/name`] = r.name;
            medalUpdates[`paymentMedalRecords/${r.id}/${medal.key}`] = admin.database.ServerValue.increment(1);
            medalUpdates[`paymentMedalRecords/${r.id}/total`] = admin.database.ServerValue.increment(1);
            medalUpdates[`paymentMedalRecords/${r.id}/history/${matchId}`] = {
                matchId, location: match.location || '', date: match.date || '', rank: r.rank, medal: medal.key, medalLabel: medal.label, awardedAt: Date.now()
            };
        });
        medalUpdates[`matches/${matchId}/paymentMedalsFinalized`] = true;
        await db.ref().update(medalUpdates);

        const recordsSnap = await db.ref('paymentMedalRecords').get();
        const leaderboard = buildMedalLeaderboardText(recordsSnap.val() || {});
        const finalText = ranking.map(r => {
            const medal = getMedalByRank(r.rank);
            return `${r.rank}. ${medal ? medal.icon + ' ' : ''}${r.name}`;
        }).join("\n");
        await pushLineMessage([{ type: "text", text: `🎉 [จ่ายครบทุกคนแล้ว!]\nตี้: ${match.location || '-'} ${match.time || ''}-${match.endTime || ''} น.\n\n🏁 สรุปอันดับการจ่ายเงินตี้นี้\n${finalText}\n\n🏆 สรุปอันดับรวมเหรียญการจ่ายเงิน\n${leaderboard}` }]);
    }

    return { paidRank: currentRank, allPaid };
}

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

    const { matchId, memberId, memberName, status, remark } = dataObj;
    const isPaid = status === 'paid';
    const textMsg = isPaid
        ? `✅ [ชำระเงินแล้ว]\n${memberName} ชำระเงินเรียบร้อย ระบบตรวจยอดและวันที่ถูกต้องแล้วจ้า 🧾✨`
        : `⚠️ [สลิปต้องตรวจสอบอีกที]\n${memberName} ส่งสลิปแล้ว แต่${remark || 'ยอด/วันที่ไม่ตรง'}\nรบกวนหัวตี้ตรวจสอบอีกครั้งนะครับ`;

    try {
        if (isPaid && memberId) {
            await updatePaymentRankingAndNotify(matchId, memberId, memberName, true);
        } else {
            await pushLineMessage([{ type: "text", text: `${textMsg}\n\nเปิดหน้าตี้: ${LIFF_URL}?matchId=${matchId}` }]);
        }
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


// ============================
// 🤖 8. LINE Webhook: เรียกบอทด้วยคำว่า "บ๊อกแบ๊ก"
// ============================
exports.lineWebhook = functions.https.onRequest(async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const events = req.body.events || [];
    await Promise.all(events.map(async (event) => {
        if (!event.replyToken) return;
        const text = event.message?.type === 'text' ? (event.message.text || '').trim() : '';

        if (text === 'บ๊อกแบ๊ก') {
            return replyLineMessage(event.replyToken, [{
                type: 'text',
                text: 'บ๊อกแบ๊กมาแล้วครับ 🐾 อยากทำอะไรต่อ?',
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'uri', label: 'สร้างตี้', uri: LIFF_URL } },
                        { type: 'action', action: { type: 'postback', label: 'จ่ายเงิน', data: 'action=payment_menu', displayText: 'จ่ายเงิน' } }
                    ]
                }
            }]);
        }

        if (event.type === 'postback' && event.postback?.data === 'action=payment_menu') {
            const snapshot = await db.ref('matches').get();
            const matches = snapshot.val() || {};
            const billingMatches = Object.keys(matches)
                .map(id => ({ id, ...matches[id] }))
                .filter(m => m.status === 'billing')
                .sort((a, b) => (b.billingSentAt || 0) - (a.billingSentAt || 0))
                .slice(0, 10);

            if (billingMatches.length === 0) {
                return replyLineMessage(event.replyToken, [{ type: 'text', text: 'ตอนนี้ยังไม่มีตี้ที่เรียกเก็บเงินครับ 🏸' }]);
            }

            const messages = billingMatches.map((m, i) => {
                const amount = m.paymentPerHead ? `${m.paymentPerHead} บาท` : '-';
                const bank = m.bankInfo || 'หัวตี้ยังไม่ได้ระบุเลขบัญชี';
                return `${i + 1}. ${m.location || '-'} ${m.time || ''}-${m.endTime || ''} น.\n👑 หัวตี้: ${m.creatorName || '-'}\n💸 ยอด: ${amount}\n🏦 บัญชี: ${bank}\n👉 ${LIFF_URL}?matchId=${m.id}`;
            }).join('\n\n');

            return replyLineMessage(event.replyToken, [{ type: 'text', text: `เลือกตี้ที่ต้องการจ่ายเงินได้เลยครับ\n\n${messages}` }]);
        }
    }));

    return res.status(200).send('OK');
});
