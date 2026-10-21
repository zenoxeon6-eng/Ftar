const axios = require('axios');
const crypto = require('crypto');

// ============================================================
// [1] إعدادات mail.tm
// ============================================================
const MAILTM_BASE = 'https://api.mail.tm';
const POLL_INTERVAL_MS = 10 * 1000;      // فحص كل 10 ثوانٍ
const MAIL_TTL_MS = 20 * 60 * 1000;      // صلاحية البريد 20 دقيقة
const MAX_ACCOUNTS_PER_IP = 4;           // لتجنب تجاوز 8 QPS (طلبان لكل حساب)
const REQUEST_TIMEOUT = 10000;

// ============================================================
// [2] المخزن العالمي
// ============================================================
if (!global.tempMailCache) global.tempMailCache = new Map();
if (global.tempMailInterval) clearInterval(global.tempMailInterval);

// ============================================================
// [3] دوال مساعدة
// ============================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function genPassword(len = 16) {
    return crypto.randomBytes(len).toString('base64').replace(/[+/=]/g, '').slice(0, len);
}

function genUsername() {
    return 'user' + crypto.randomBytes(6).toString('hex');
}

/**
 * إنشاء حساب بريد جديد على mail.tm
 * @returns {Promise<{address, password, token, accountId}>}
 */
async function createMailTmAccount() {
    // 1) جلب النطاقات المتاحة
    const domRes = await axios.get(`${MAILTM_BASE}/domains`, { timeout: REQUEST_TIMEOUT });
    const domains = domRes.data?.['hydra:member'] || domRes.data || [];
    if (!domains.length) throw new Error('لا توجد نطاقات متاحة');
    const domain = domains[0].domain;

    // 2) إنشاء الحساب
    const address = `${genUsername()}@${domain}`;
    const password = genPassword(20);

    const accRes = await axios.post(
        `${MAILTM_BASE}/accounts`,
        { address, password },
        { headers: { 'Content-Type': 'application/json' }, timeout: REQUEST_TIMEOUT }
    );
    const accountId = accRes.data?.id;

    // 3) الحصول على التوكن
    const tokRes = await axios.post(
        `${MAILTM_BASE}/token`,
        { address, password },
        { headers: { 'Content-Type': 'application/json' }, timeout: REQUEST_TIMEOUT }
    );
    const token = tokRes.data?.token;

    if (!token) throw new Error('فشل الحصول على التوكن');

    return { address, password, token, accountId };
}

/**
 * جلب الرسائل من صندوق الوارد
 */
async function fetchMessages(token) {
    const res = await axios.get(`${MAILTM_BASE}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: REQUEST_TIMEOUT,
    });
    return res.data?.['hydra:member'] || res.data || [];
}

/**
 * جلب تفاصيل رسالة محددة
 */
async function fetchMessageDetail(token, id) {
    const res = await axios.get(`${MAILTM_BASE}/messages/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: REQUEST_TIMEOUT,
    });
    return res.data;
}

// ============================================================
// [4] رادار المراقبة التلقائي
// ============================================================
global.tempMailInterval = setInterval(async () => {
    const now = Date.now();
    let processed = 0;

    for (const [sender, data] of global.tempMailCache.entries()) {
        // انتهاء الصلاحية
        if (now - data.timestamp > MAIL_TTL_MS) {
            try {
                await data.sock.sendMessage(sender, {
                    text:
                        `⚠️ *[ تنبيه رادار البريد ]*\n\n` +
                        `انتهت صلاحية بريدك المؤقت (\`${data.address}\`) وتم إيقاف المراقبة تلقائياً لحماية خصوصيتك.`,
                });
            } catch {}
            global.tempMailCache.delete(sender);
            continue;
        }

        // حماية من تجاوز 8 QPS
        if (processed >= MAX_ACCOUNTS_PER_IP) break;
        processed++;

        try {
            const messages = await fetchMessages(data.token);

            if (messages.length > 0) {
                const latest = messages[0];
                // mail.tm يعيد الرسائل مرتبة من الأحدث إلى الأقدم
                if (data.lastMsgId !== latest.id) {
                    const detail = await fetchMessageDetail(data.token, latest.id);

                    data.lastMsgId = latest.id;
                    global.tempMailCache.set(sender, data);

                    const from = detail.from?.address || 'غير معروف';
                    const fromName = detail.from?.name ? `${detail.from.name} <${detail.from.address}>` : from;
                    const subject = detail.subject || 'بدون موضوع';
                    const date = detail.createdAt
                        ? new Date(detail.createdAt).toLocaleString('ar-SA')
                        : new Date().toLocaleString('ar-SA');

                    // نص الرسالة: mail.tm يعيد text و html
                    let body = detail.text || '';
                    if (!body && Array.isArray(detail.html)) {
                        body = detail.html.join('\n').replace(/<[^>]+>/g, '');
                    }
                    // اقتطاع طويل (حماية من الرسائل الضخمة)
                    if (body.length > 3500) body = body.slice(0, 3500) + '\n... (مقتطع)';

                    const mailAlert =
                        `📬 *[ رَادَارُ البَرِيدِ التِّلْقَائِيِّ ]* 📬\n\n` +
                        `📥 *وصلت رسالة جديدة لبريدك:* \n\`${data.address}\`\n\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `👤 *المرسل:* ${fromName}\n` +
                        `📑 *الموضوع:* ${subject}\n` +
                        `📅 *الوقت:* ${date}\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `💬 *المحتوى:*\n\n${body.trim()}\n\n` +
                        `*— تَمَّ جَلْبُ البَيَانَاتِ بِتَشْفِيرٍ آمِنٍ تِلْقَائِيَّاً 🛡️*`;

                    await data.sock.sendMessage(sender, { text: mailAlert });
                }
            }
        } catch (e) {
            // تجاهل أخطاء الشبكة المؤقتة؛ لا نطبع شيئًا لتجنب إغراق السجلات
            if (e.response?.status === 401) {
                // التوكن انتهى — نبلغ المستخدم بإنشاء بريد جديد
                try {
                    await data.sock.sendMessage(sender, {
                        text: `⚠️ *انتهت صلاحية جلسة البريد.*\nأرسل \`.ايميل\` من جديد لإنشاء عنوان جديد.`,
                    });
                } catch {}
                global.tempMailCache.delete(sender);
            }
        }

        // تأخير بسيط بين الحسابات لتجنب 429
        await sleep(150);
    }
}, POLL_INTERVAL_MS);

// ============================================================
// [5] الأمر
// ============================================================
module.exports = {
    name: 'ايميل',
    aliases: ['بريد', 'tempmail', 'رادار'],

    execute: async ({ reply, sender, sock, text }) => {
        // ---------- إيقاف ----------
        if (['ايقاف', 'إيقاف', 'stop'].includes((text || '').trim())) {
            if (global.tempMailCache.has(sender)) {
                const data = global.tempMailCache.get(sender);
                global.tempMailCache.delete(sender);
                return reply(`✅ *تم إيقاف رادار المراقبة وحذف البريد:*\n\`${data.address}\``);
            }
            return reply('⚠️ *ليس لديك بريد نشط حالياً لتقوم بإيقافه.*');
        }

        // ---------- حماية من الإنشاء المتكرر ----------
        if (global.tempMailCache.has(sender)) {
            const existing = global.tempMailCache.get(sender);
            const remaining = Math.ceil((MAIL_TTL_MS - (Date.now() - existing.timestamp)) / 60000);
            return reply(
                `📧 *لديك بريد نشط بالفعل:*\n\`${existing.address}\`\n\n` +
                `⏳ *المتبقي:* ${remaining} دقيقة\n\n` +
                `❌ *للإلغاء:* \`.ايميل ايقاف\``
            );
        }

        // ---------- إنشاء بريد جديد ----------
        try {
            await reply('⏳ *جاري إنشاء بريد مؤقت آمن...*');

            const account = await createMailTmAccount();

            global.tempMailCache.set(sender, {
                address: account.address,
                password: account.password,
                token: account.token,
                accountId: account.accountId,
                lastMsgId: null,
                sock,
                timestamp: Date.now(),
            });

            const welcome =
                `📧 *[ بَرِيدُ طَرْزَانَ الـ VIP التِّلْقَائِيُّ ]* 📧\n\n` +
                `📌 *بريدك الجديد:*\n\`${account.address}\`\n\n` +
                `⚡ *حالة الرادار:* 【 🟢 نَشِطٌ وَيُرَاقِبُ 】\n\n` +
                `⚙️ *كيف يعمل؟*\n` +
                `انسخ الإيميل وسجل به في أي موقع، وبمجرد وصول كود التفعيل أو رسالة التأكيد، سيقوم البوت بإرسالها لك هنا تلقائياً.\n\n` +
                `❌ *للإلغاء:* \`.ايميل ايقاف\`\n\n` +
                `*— المراقبة الذاتية تعمل الآن لـ 20 دقيقة 🛡️*`;

            await reply(welcome);
        } catch (e) {
            console.error('❌ خطأ إنشاء بريد mail.tm:', e.response?.data || e.message);
            reply(
                '❌ *حدث خطأ أثناء إنشاء البريد المؤقت.*\n' +
                (e.response?.status === 429 ? 'الخدمة مزدحمة، جرّب بعد 40 ثانية.' : 'حاول مرة أخرى بعد قليل.')
            );
        }
    },
};
