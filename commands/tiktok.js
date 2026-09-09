const axios = require('axios');

/**
 * أمر تحميل مقاطع وصور تيك توك المطور لـ WhatsApp Bot (Baileys)
 * الميزات:
 * - تحميل فيديو بدون علامة مائية (HD)
 * - دعم ألبومات صور تيك توك (Slideshows)
 * - نظام سيرفر احتياطي عند فشل السيرفر الرئيسي
 * - استخراج ذكي للروابط وتنسيق فخم جداً
 */
module.exports = {
    name: 'tiktok',
    aliases: ['تيك', 'tt', 'تيكتوك', 'تيك_توك'],
    description: 'تحميل فيديوهات وألبومات صور تيك توك بدون علامة مائية وبأعلى جودة',
    execute: async ({ sock, msg, args, reply, from }) => {
        const text = args.join(' ');
        
        // التعرف على جميع أنواع روابط تيك توك المختصرة والطويلة
        const tiktokRegex = /(https?:\/\/(?:www\.|vm\.|vt\.|t\.)?tiktok\.com\/[^\s]+)/gi;
        const match = text.match(tiktokRegex);

        if (!match) {
            return reply(
                '❌ *يرجى إرسال رابط تيك توك صالح مع الأمر.*\n\n' +
                '💡 *أمثلة لاستخدام الأمر:*\n' +
                '• `.tt https://vt.tiktok.com/ZS...` \n' +
                '• `.تيك https://www.tiktok.com/@user/video/12345...`'
            );
        }

        const url = match[0];

        try {
            // إضافة تفاعل الانتظار
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            let data = null;

            // المحاولة الأولى: السيرفر الرئيسي (TikWM)
            try {
                const response = await axios.post(
                    'https://www.tikwm.com/api/', 
                    new URLSearchParams({ url, hd: 1 }), 
                    {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        },
                        timeout: 12000
                    }
                );

                if (response.data && response.data.code === 0 && response.data.data) {
                    data = response.data.data;
                }
            } catch (errPrimary) {
                console.warn('⚡ فشل السيرفر الرئيسي، جاري الانتقال للسيرفر الاحتياطي...', errPrimary.message);
            }

            // المحاولة الثانية: السيرفر الاحتياطي (Tiklydown) في حال تعطل الأول
            if (!data) {
                try {
                    const fallbackRes = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`, { timeout: 10000 });
                    if (fallbackRes.data && (fallbackRes.data.video || fallbackRes.data.images)) {
                        const fb = fallbackRes.data;
                        data = {
                            play: fb.video?.noWatermark || fb.video?.watermark,
                            hdplay: fb.video?.noWatermark,
                            title: fb.title || 'بدون عنوان',
                            author: { nickname: fb.author?.name || 'مجهول', unique_id: fb.author?.unique_id || 'unknown' },
                            play_count: fb.stats?.playCount || 0,
                            digg_count: fb.stats?.likeCount || 0,
                            comment_count: fb.stats?.commentCount || 0,
                            share_count: fb.stats?.shareCount || 0,
                            music_info: { title: fb.music?.title || 'صوت أصلي', author: fb.music?.author || 'غير معروف' },
                            images: fb.images ? fb.images.map(img => img.url) : null
                        };
                    }
                } catch (errFallback) {
                    console.error('❌ فشلت جميع السيرفرات في جلب الفيديو:', errFallback.message);
                }
            }

            if (!data) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                return reply('❌ *عذراً!* يتعذر تحميل هذا المحتوى حالياً.\nقد يكون الحساب خاصاً، أو الفيديو محذوفاً، أو السيرفر غير مستجيب.');
            }

            const title = data.title || 'لا يوجد وصف';
            const author = data.author?.nickname || 'مجهول';
            const authorId = data.author?.unique_id || 'مجهول';
            
            // دالة لتنسيق الأرقام بأسلوب رائع (مثال: 1,250,000)
            const formatNum = (num) => (num || 0).toLocaleString();
            
            const views = formatNum(data.play_count);
            const likes = formatNum(data.digg_count);
            const comments = formatNum(data.comment_count);
            const shares = formatNum(data.share_count);
            
            const musicTitle = data.music_info?.title || data.music || 'صوت أصلي';
            const musicAuthor = data.music_info?.author || 'غير معروف';

            const captionText = `
╭━━━━━━━━━━━━━━━━━━━━━━━╮
┃ 🎬 *𝐓 𝐈 𝐊 𝐓 𝐎 𝐊  𝐃 𝐎 𝐖 𝐍 𝐋 𝐎 𝐀 𝐃 𝐄 𝐑*
┣━━━━━━━━━━━━━━━━━━━━━━━┫
┃
┃ 👤 *الحساب:* ${author} (@${authorId})
┃ 📝 *الوصف:* ${title}
┃
┣━━━━━━━━[ 📊 الإحـصـائـيـات ]━━━━━━━━┫
┃
┃ 👁️ *المشاهدات:* ${views}
┃ ❤️ *الإعجابات:* ${likes}
┃ 💬 *التعليقات:* ${comments}
┃ 🔗 *المشاركات:* ${shares}
┃
┣━━━━━━━[ 🎵 معلومات الصوت ]━━━━━━━┫
┃
┃ 🎶 *العنوان:* ${musicTitle}
┃ 🎤 *الفنان:* ${musicAuthor}
┃
╰━━━━━━━━━━━━━━━━━━━━━━━╯
*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 👑*
`.trim();

            // 1. إذا كان المنشور عبارة عن ألبوم صور (Slideshow)
            if (data.images && Array.isArray(data.images) && data.images.length > 0) {
                await reply(`📸 *تم العثور على ألبوم صور يحتوي على (${data.images.length}) صورة.* جاري إرسالها...`);

                for (let i = 0; i < data.images.length; i++) {
                    const imgUrl = data.images[i];
                    await sock.sendMessage(from, {
                        image: { url: imgUrl },
                        caption: i === 0 ? captionText : `🖼️ *صورة (${i + 1}/${data.images.length})*`
                    }, { quoted: i === 0 ? msg : undefined });
                }
            } 
            // 2. إذا كان المنشور مقطع فيديو عادي
            else {
                const videoUrl = data.hdplay || data.play;

                if (!videoUrl) {
                    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                    return reply('❌ *خطأ:* لم يتم العثور على رابط فيديو صالح للتنزيل.');
                }

                await sock.sendMessage(from, {
                    video: { url: videoUrl },
                    mimetype: 'video/mp4',
                    caption: captionText
                }, { quoted: msg });
            }

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر تيك توك:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ أثناء معالجة الطلب!* يرجى المحاولة مرة أخرى لاحقاً.');
        }
    }
};
