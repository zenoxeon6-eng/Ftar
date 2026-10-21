const axios = require('axios');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');

// ============================================================
// [1] إعدادات قابلة للتعديل
// ============================================================
const CONFIG = {
    // نماذج Pollinations المتاحة للمستخدم المجهول: flux, turbo, stable-diffusion
    defaultModel: 'flux',
    // أبعاد الصورة المولدة (مربعة = أفضل للملصقات)
    width: 512,
    height: 512,
    // جودة الملصق النهائي (0-100) — 100 هي الأفضل
    stickerQuality: 100,
    // جودة الصورة من Pollinations (low | medium | high | hd)
    imageQuality: 'high',
    // مهلة الطلبات بالمللي ثانية
    timeout: 30000,
    // الحد الأقصى لطول الوصف (حماية من الإساءة)
    maxPromptLength: 300,
};

// ============================================================
// [2] دوال مساعدة
// ============================================================

/**
 * ترجمة نص إلى الإنجليزية باستخدام Google Translate (مجاني، بدون مفتاح)
 * @returns {Promise<string>} النص المترجم، أو النص الأصلي إن فشلت الترجمة
 */
async function translateToEnglish(text) {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
        const res = await axios.get(url, { timeout: 10000 });
        const translated = res.data[0].map((item) => item[0]).join('');
        return translated || text;
    } catch (e) {
        console.warn('⚠️ فشلت الترجمة، استخدام النص الأصلي:', e.message);
        return text;
    }
}

/**
 * بناء الـ Prompt النهائي بأسلوب ملصق احترافي
 */
function buildPrompt(englishDescription) {
    return [
        englishDescription,
        'highly detailed 3D sticker style',
        'vector art',
        'cute',
        '8k resolution',
        'premium quality',
        'clean white outline',
        'solid flat background',
        'no shadows on background',
        'centered composition',
    ].join(', ');
}

/**
 * جلب الصورة من Pollinations AI مع معاملات تحسين الجودة
 * @returns {Promise<Buffer>}
 */
async function fetchFromPollinations(prompt, model = CONFIG.defaultModel) {
    const params = new URLSearchParams({
        width: String(CONFIG.width),
        height: String(CONFIG.height),
        model,
        nologo: 'true',          // إزالة شعار Pollinations
        enhance: 'true',          // تحسين الـ prompt تلقائيًا
        quality: CONFIG.imageQuality,
        seed: String(Math.floor(Math.random() * 1_000_000)),
        negative_prompt: 'blurry, low quality, text, watermark, logo, ugly, deformed',
    });

    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: CONFIG.timeout,
    });
    return Buffer.from(res.data, 'binary');
}

/**
 * واجهة احتياطية اختيارية عبر Hugging Face Inference API
 * تعمل فقط إذا كان متغير البيئة HF_TOKEN موجودًا
 * @returns {Promise<Buffer|null>}
 */
async function fetchFromHuggingFace(prompt) {
    const token = process.env.HF_TOKEN;
    if (!token) return null;

    const MODEL = 'black-forest-labs/FLUX.1-schnell';
    try {
        const res = await axios.post(
            `https://api-inference.huggingface.co/models/${MODEL}`,
            { inputs: prompt, parameters: { width: CONFIG.width, height: CONFIG.height } },
            {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                responseType: 'arraybuffer',
                timeout: CONFIG.timeout,
            }
        );
        return Buffer.from(res.data, 'binary');
    } catch (e) {
        console.warn('⚠️ فشلت Hugging Face الاحتياطية:', e.message);
        return null;
    }
}

/**
 * تحويل الصورة إلى ملصق WhatsApp بجودة عالية
 * @returns {Promise<Buffer>}
 */
async function imageToSticker(imageBuffer) {
    const sticker = new Sticker(imageBuffer, {
        pack: 'Tarzan VIP 👑',
        author: 'الذكاء الاصطناعي',
        type: StickerTypes.FULL,        // ملصق كامل (لا يتم قصه)
        quality: CONFIG.stickerQuality, // 100 بدلاً من 70
        background: 'transparent',
    });
    return sticker.toBuffer();
}

// ============================================================
// [3] الأمر الرئيسي
// ============================================================
module.exports = {
    name: 'ملصق_ذكي',
    aliases: ['ملصق', 'م', 'sticker_ai'],
    description: 'توليد ملصق من وصف نصي عبر واجهات AI مجانية',

    execute: async ({ sock, msg, reply, from, args }) => {
        // ---------- التحقق من المدخلات ----------
        let description = args.join(' ').trim();

        if (!description) {
            return reply(
                '❌ *يرجى كتابة وصف للملصق الذي تريده.*\n\n' +
                '*مثال:* `.ملصق أسد يلبس نظارات شمسية ويشرب قهوة`'
            );
        }

        if (description.length > CONFIG.maxPromptLength) {
            description = description.slice(0, CONFIG.maxPromptLength);
        }

        try {
            // ---------- 1) الترجمة ----------
            await sock.sendMessage(from, { react: { text: '🧠', key: msg.key } });
            await reply('⏳ *جاري ترجمة الوصف وتخيل الملصق...*');

            const english = await translateToEnglish(description);
            const prompt = buildPrompt(english);

            // ---------- 2) توليد الصورة ----------
            await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });

            let imageBuffer = null;
            let source = '';

            try {
                imageBuffer = await fetchFromPollinations(prompt);
                source = 'Pollinations (flux)';
            } catch (e) {
                console.warn('⚠️ فشل Pollinations، تجربة Hugging Face...', e.message);
                imageBuffer = await fetchFromHuggingFace(prompt);
                source = imageBuffer ? 'Hugging Face (FLUX.1-schnell)' : '';
            }

            if (!imageBuffer) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                return reply(
                    '❌ *تعذّر توليد الصورة من جميع الواجهات.*\n' +
                    'حاول مرة أخرى، أو بسّط الوصف.'
                );
            }

            // ---------- 3) تحويل إلى ملصق ----------
            await sock.sendMessage(from, { react: { text: '⚙️', key: msg.key } });
            const stickerBuffer = await imageToSticker(imageBuffer);

            // ---------- 4) إرسال ----------
            await sock.sendMessage(
                from,
                {
                    sticker: stickerBuffer,
                },
                { quoted: msg }
            );

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

            // (اختياري) إرسال اسم المصدر في رسالة منفصلة — يمكن حذفها لو أردت
            // await reply(`📡 *المصدر:* ${source}`);
        } catch (error) {
            console.error('❌ خطأ في أمر الملصق الذكي:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            await reply(
                '❌ *حدث خطأ أثناء صناعة الملصق.*\n' +
                'قد يكون الوصف معقدًا جدًا أو الواجهة مشغولة، جرّب مرة أخرى.'
            );
        }
    },
};
