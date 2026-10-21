const { createCanvas } = require('@napi-rs/canvas');

// طبقة اختيارية لتشكيل النص العربي (إن كانت مثبتة)
// npm install bidi-shaper
let shapeArabic = (t) => t;
try {
    const { shape } = require('bidi-shaper');
    shapeArabic = (text) => shape(text);
} catch {
    // إذا لم تُثبّت bidi-shaper، يُرسم النص كما هو (قد يعمل مع Skia)
}

module.exports = {
    name: 'receipt',
    aliases: ['حواله', 'حوالة', 'سند', 'صرف'],
    description: 'إصدار سند صرف حوالة مالية بصورة احترافية',

    execute: async ({ sock, msg, args, reply, from }) => {
        // ---------- 1) التحقق من المدخلات ----------
        const input = args.join(' ').trim();
        const details = input.split('|').map((s) => s.trim());

        if (details.length < 3 || !details[0] || !details[1] || !details[2]) {
            return reply(
                '❌ *طريقة الاستخدام:* `.حواله الاسم | الهاتف | المبلغ`\n' +
                '*مثال:* `.حواله طارق الواقدي | 7737996293 | 50000`'
            );
        }

        const name = details[0].slice(0, 60);
        const rawPhone = details[1].replace(/[^\d+]/g, '');
        const rawAmount = details[2].replace(/[^\d]/g, '');

        if (rawPhone.length < 7) {
            return reply('❌ رقم الهاتف غير صالح. أرسل الأرقام فقط.');
        }
        if (!rawAmount || parseInt(rawAmount, 10) <= 0) {
            return reply('❌ المبلغ غير صالح. أرسل رقمًا موجبًا.');
        }

        const phone = rawPhone;
        const amount = parseInt(rawAmount, 10).toLocaleString('en-US') + ' ريال';

        // تاريخ مخصص اختياريًا (الجزء الرابع)
        let date;
        if (details[3]) {
            const custom = new Date(details[3]);
            date = isNaN(custom.getTime())
                ? new Date().toLocaleDateString('en-GB')
                : custom.toLocaleDateString('en-GB');
        } else {
            date = new Date().toLocaleDateString('en-GB');
        }

        const receiptNumber = 'WQ-' + Math.floor(Math.random() * 90000 + 10000);
        const transferNumber = 'TRN-' + Math.floor(Math.random() * 90000000 + 10000000);

        try {
            await sock.sendMessage(from, { react: { text: '🖨️', key: msg.key } });
            await reply('⏳ *جاري طباعة السند من النظام المركزي...*');

            // ---------- 2) إنشاء اللوحة ----------
            const width = 1000;
            const height = 750;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);

            // إطار مزدوج
            ctx.strokeStyle = '#1a3a5c';
            ctx.lineWidth = 6;
            ctx.strokeRect(20, 20, width - 40, height - 40);
            ctx.lineWidth = 2;
            ctx.strokeRect(30, 30, width - 60, height - 60);

            // ---------- 3) الترويسة ----------
            ctx.fillStyle = '#1a3a5c';
            ctx.fillRect(30, 30, width - 60, 110);

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 42px Arial';
            ctx.fillText(shapeArabic('شركة الواقدي للصرافة والتحويلات'), width / 2, 72);

            ctx.fillStyle = '#ecf0f1';
            ctx.font = '20px Arial';
            ctx.fillText('Al-Waqdi Exchange & Remittances - License No. 4059', width / 2, 118);

            // ---------- 4) عنوان السند ----------
            ctx.fillStyle = '#c0392b';
            ctx.font = 'bold 34px Arial';
            ctx.fillText(shapeArabic('سند صرف حوالة مالية'), width / 2, 182);

            // ---------- 5) الجدول ----------
            const tableY = 230;
            const rowH = 60;

            const drawBox = (x, y, w, h, text, opts = {}) => {
                const { title = false, amount: isAmount = false } = opts;

                if (title) ctx.fillStyle = '#f0f3f4';
                else if (isAmount) ctx.fillStyle = '#e8f8f5';
                else ctx.fillStyle = '#ffffff';
                ctx.fillRect(x, y, w, h);

                ctx.strokeStyle = '#7f8c8d';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, w, h);

                if (isAmount && !title) {
                    ctx.fillStyle = '#27ae60';
                    ctx.font = 'bold 28px Arial';
                } else {
                    ctx.fillStyle = title ? '#2c3e50' : '#000000';
                    ctx.font = title ? 'bold 23px Arial' : '23px Arial';
                }

                const safe = String(text || '');
                const rendered = title || isAmount ? shapeArabic(safe) : shapeArabic(safe);
                ctx.fillText(rendered, x + w / 2, y + h / 2);
            };

            // الصف 1
            drawBox(750, tableY, 200, rowH, 'رقم السند', { title: true });
            drawBox(500, tableY, 250, rowH, receiptNumber);
            drawBox(300, tableY, 200, rowH, 'التاريخ', { title: true });
            drawBox(50, tableY, 250, rowH, date);

            // الصف 2
            drawBox(750, tableY + rowH, 200, rowH, 'رقم الحوالة', { title: true });
            drawBox(50, tableY + rowH, 700, rowH, transferNumber);

            // الصف 3
            drawBox(750, tableY + rowH * 2, 200, rowH, 'اسم المستفيد', { title: true });
            drawBox(50, tableY + rowH * 2, 700, rowH, name);

            // الصف 4
            drawBox(750, tableY + rowH * 3, 200, rowH, 'رقم الهاتف', { title: true });
            drawBox(500, tableY + rowH * 3, 250, rowH, phone);
            drawBox(300, tableY + rowH * 3, 200, rowH, 'المبلغ', { title: true });
            drawBox(50, tableY + rowH * 3, 250, rowH, amount, { amount: true });

            // ---------- 6) التوقيعات ----------
            const signY = 530;
            ctx.fillStyle = '#2c3e50';
            ctx.font = 'bold 23px Arial';
            ctx.fillText(shapeArabic('توقيع المستلم'), 800, signY);
            ctx.fillText(shapeArabic('توقيع المدير العام'), 200, signY);

            ctx.strokeStyle = '#bdc3c7';
            ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.moveTo(700, signY + 40); ctx.lineTo(900, signY + 40); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(100, signY + 40); ctx.lineTo(300, signY + 40); ctx.stroke();
            ctx.setLineDash([]);

            // ---------- 7) الختم ----------
            ctx.save();
            ctx.translate(width / 2, 590);
            ctx.rotate(-0.15);

            const stampColor = 'rgba(192, 57, 43, 0.9)';
            ctx.strokeStyle = stampColor;
            ctx.fillStyle = stampColor;

            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(0, 0, 100, 0, Math.PI * 2); ctx.stroke();
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, 90, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.stroke();

            const engText = ' AL-WAQDI EXCHANGE - APPROVED -';
            ctx.font = 'bold 16px Arial';
            for (let i = 0; i < engText.length; i++) {
                ctx.save();
                ctx.rotate(i * ((Math.PI * 2) / engText.length));
                ctx.fillText(engText[i], 0, -75);
                ctx.restore();
            }

            ctx.font = 'bold 25px Arial';
            ctx.fillText(shapeArabic('طرزان الواقدي'), 0, 0);
            ctx.font = 'bold 16px Arial';
            ctx.fillText(shapeArabic('معتمد'), 0, -30);
            ctx.font = 'bold 20px Arial';
            ctx.fillText('PAID', 0, 35);
            ctx.font = '14px Arial';
            ctx.fillText('★', -60, 0);
            ctx.fillText('★', 60, 0);

            ctx.restore();

            // ---------- 8) الإرسال ----------
            const buffer = canvas.toBuffer('image/png');

            const captionMsg = `
*• ───── ❨ 🏦 نـظـام الـصـرافـة ❩ ───── •*

✅ *تـم إصـدار الـسـنـد وتـوثـيـقـه بـنـجـاح*
🔖 *رقـم الـحـوالـة:* ${transferNumber}
👤 *الـمـسـتـلـم:* ${name}

*— الإدارة | 𝑻𝑨𝑹𝒁𝑨𝑵 👑*
`.trim();

            await sock.sendMessage(
                from,
                { image: buffer, caption: captionMsg },
                { quoted: msg }
            );

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
        } catch (error) {
            console.error('❌ خطأ في السند:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حـدث خـطـأ فـي الـنـظـام الـمـركـزي.*');
        }
    }
};
