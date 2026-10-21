module.exports = {
    name: 'معلومات_قناة',
    aliases: ['قناة', 'فحص_قناة', 'channelinfo'],
    category: 'قنوات',
    description: 'جلب معلومات وإحصائيات قناة واتساب عبر الرابط أو كود الدعوة.',

    execute: async ({ sock, msg, reply, from, text }) => {
        // ============================================================
        // [1] استخراج كود الدعوة بأمان
        // ============================================================
        const raw = (text || '').trim();
        if (!raw) {
            return reply(
                '⚠️ *يُرجى إرفاق رابط القناة أو كود الدعوة.*\n' +
                '📌 *مثال:* `.قناة https://whatsapp.com/channel/0029Va...`'
            );
        }

        // يقبل الرابط الكامل أو الكود المباشر (بدون رابط)
        let inviteCode = null;
        const linkMatch = raw.match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i);
        if (linkMatch) {
            inviteCode = linkMatch[1];
        } else if (/^[A-Za-z0-9_-]{15,40}$/.test(raw)) {
            // كود مباشر (عادة 22 حرفًا)
            inviteCode = raw;
        }

        if (!inviteCode) {
            return reply(
                '❌ *لم أتمكن من استخراج كود القناة من النص.*\n' +
                '📌 أرسل رابطًا مثل:\n`https://whatsapp.com/channel/0029Va...`'
            );
        }

        // ============================================================
        // [2] جلب الميتاداتا مع معالجة أخطاء دقيقة
        // ============================================================
        try {
            await reply('🔍 *جاري فحص سجلات القناة...*');

            const meta = await sock.newsletterMetadata('invite', inviteCode);

            if (!meta?.id) {
                throw new Error('لم تُرجع الواجهة بيانات صالحة للقناة');
            }

            // ============================================================
            // [3] استخراج الحقول بأمان (كلها اختيارية ما عدا id و name)
            // ============================================================
            const name = meta.name || 'غير معروف';

            // المشتركون: قد يكون غير موجود للقنوات التي لا يتابعها البوت
            const subsRaw = meta.subscribers;
            const subs = typeof subsRaw === 'number'
                ? subsRaw.toLocaleString('en-US')
                : 'مخفي (البوت لا يتابع القناة)';

            // الوصف: قد يكون مباشرًا أو داخل thread_metadata
            const description =
                meta.description ||
                meta.thread_metadata?.description ||
                'لا يوجد وصف.';

            // تاريخ الإنشاء: مباشر أو داخل thread_metadata
            const creationTs =
                meta.creation_time ||
                meta.thread_metadata?.creation_time;
            const creation = creationTs
                ? new Date(creationTs * 1000).toLocaleDateString('ar-SA')
                : 'غير متوفر';

            // حالة التحقق
            const verification =
                meta.verification === 'VERIFIED'
                    ? 'موثقة ✅'
                    : meta.verification === 'UNVERIFIED'
                    ? 'غير موثقة ⚪'
                    : 'غير معروفة';

            // حالة النشر (state قد لا يكون موجودًا دائمًا)
            const state =
                meta.state === 'ACTIVE'
                    ? 'نشطة 🟢'
                    : meta.state === 'SUSPENDED'
                    ? 'معلقة 🔴'
                    : 'غير معروفة';

            // رابط القناة
            const channelLink = `https://whatsapp.com/channel/${inviteCode}`;

            // ============================================================
            // [4] بناء رابط الصورة بشكل صحيح
            // ============================================================
            let pictureUrl = null;
            const pic = meta.picture;

            if (pic) {
                if (typeof pic === 'string') {
                    // بعض الإصدارات تعيد نصًا مباشرًا
                    pictureUrl = pic;
                } else if (typeof pic === 'object') {
                    // الكائن قد يحتوي على url جاهز
                    if (pic.url) pictureUrl = pic.url;
                    // أو directPath (يُبنى منه الرابط)
                    else if (pic.directPath) {
                        pictureUrl = `https://pps.whatsapp.net${pic.directPath}`;
                    }
                }
            }

            // احتياطي: بعض الاستجابات تحتوي على preview فقط (لغير المتابعين)
            if (!pictureUrl && meta.preview) {
                pictureUrl = meta.preview;
            }
            if (!pictureUrl && meta.image) {
                pictureUrl = meta.image;
            }

            // ============================================================
            // [5] تنسيق الرسالة
            // ============================================================
            const report =
                `❖ ════ 📢 ﴿ هوية القناة ﴾ 📢 ════ ❖\n\n` +
                `📛 *الاسم:* ${name}\n` +
                `👥 *المتابعون:* ${subs}\n` +
                `📊 *الحالة:* ${state}\n` +
                `🛡️ *التحقق:* ${verification}\n` +
                `📅 *تاريخ التأ��يس:* ${creation}\n` +
                `🆔 *المعرّف (JID):*\n\`${meta.id}\`\n\n` +
                `🔗 *الرابط:*\n${channelLink}\n\n` +
                `📝 *الوصف:*\n${description}\n\n` +
                `❖ ════════════════════════ ❖\n` +
                `*— TARZAN VIP ⚔️*`;

            // ============================================================
            // [6] الإرسال (صورة + نص، أو نص فقط)
            // ============================================================
            const target = from || msg?.key?.remoteJid;

            if (pictureUrl) {
                try {
                    await sock.sendMessage(
                        target,
                        {
                            image: { url: pictureUrl },
                            caption: report,
                        },
                        { quoted: msg }
                    );
                    return;
                } catch (imgErr) {
                    // إذا فشلت الصورة (رابط غير صالح أو منتهي)، أرسل النص فقط
                    console.warn('⚠️ فشل إرسال صورة القناة، إرسال النص فقط:', imgErr.message);
                }
            }

            await reply(report);
        } catch (e) {
            console.error('❌ فشل فحص القناة:', e?.message || e);

            // رسائل خطأ أكثر تحديدًا
            let reason = 'قد يكون الرابط خاطئًا أو القناة خاصة.';
            if (e?.message?.includes('not found')) reason = 'القناة غير موجودة.';
            else if (e?.message?.includes('invite')) reason = 'كود الدعوة غير صالح.';
            else if (e?.message?.includes('timeout')) reason = 'انتهت مهلة الاتصال بخادم واتساب.';

            await reply(`❌ *فشل فحص القناة.*\n${reason}`);
        }
    },
};
