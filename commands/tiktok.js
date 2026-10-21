const axios = require('axios');

/**
 * أمر تحميل مقاطع وصور تيك توك - TARZAN VIP Edition v2
 * الميزات:
 * - تحميل فيديو HD بدون علامة مائية
 * - دعم ألبومات صور تيك توك (Slideshows)
 * - سلسلة من 3 واجهات برمجية احتياطية تلقائية
 * - تنسيق فخم مع إحصائيات كاملة
 */
module.exports = {
    name: 'tiktok',
    aliases: ['تيك', 'tt', 'تيكتوك', 'تيك_توك'],
    description: 'تحميل فيديوهات وألبومات صور تيك توك بدون علامة مائية',

    execute: async ({ sock, msg, args, reply, from }) => {
        const text = args.join(' ');

        const tiktokRegex = /(https?:\/\/(?:www\.|vm\.|vt\.|t\.)?tiktok\.com\/[^\s]+)/gi;
        const match = text.match(tiktokRegex);

        if (!match) {
            return reply(
                '❌ *يرجى إرسال رابط تيك توك صالح مع الأمر.*\n\n' +
                '💡 *أمثلة:*\n' +
                '• `.tt https://vt.tiktok.com/ZS...`\n' +
                '• `.تيك https://www.tiktok.com/@user/video/12345...`'
            );
        }

        const url = match[0];

        try {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            // ==========================================
            // سلسلة جلب البيانات: TikWM ← TikXedd ← TikMate
            // ==========================================
            let data = null;
            let source = '';

            // ---------- [1] TikWM (الأساسي) ----------
            try {
                const response = await axios.post(
                    'https://www.tikwm.com/api/',
                    new URLSearchParams({ url, hd: 1 }),
                    {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        },
                        timeout: 12000
                    }
                );

                if (response.data?.code === 0 && response.data?.data) {
                    data = response.data.data;
                    source = 'TikWM';
                }
            } catch (errPrimary) {
                console.warn('⚡ TikWM فشل، تجربة TikXedd...', errPrimary.message);
            }

            // ---------- [2] TikXedd (احتياطي 1) ----------
            if (!data) {
                try {
                    const fallbackRes = await axios.get(
                        `https://tikxedd.vercel.app/api/resolve?url=${encodeURIComponent(url)}`,
                        { timeout: 10000 }
                    );

                    if (fallbackRes.data) {
                        const fb = fallbackRes.data;
                        // توحيد البيانات مع هيكل TikWM
                        data = {
                            play: fb.download?.noWatermark || fb.download?.watermark,
                            hdplay: fb.download?.noWatermark,
                            title: fb.description || fb.title || 'بدون عنوان',
                            author: {
                                nickname: fb.author?.name || fb.author || 'مجهول',
                                unique_id: fb.author?.unique_id || 'unknown'
                            },
                            play_count: fb.stats?.playCount || fb.meta?.playCount || 0,
                            digg_count: fb.stats?.likeCount || fb.meta?.likeCount || 0,
                            comment_count: fb.stats?.commentCount || fb.meta?.commentCount || 0,
                            share_count: fb.stats?.shareCount || fb.meta?.shareCount || 0,
                            music_info: fb.music || { title: 'صوت أصلي', author: 'غير معروف' },
                            images: fb.images || fb.slides || null
                        };
                        source = 'TikXedd';
                    }
                } catch (errFallback) {
                    console.warn('⚡ TikXedd فشل، تجربة TikMate...', errFallback.message);
                }
            }

            // ---------- [3] TikMate (احتياطي 2) ----------
            if (!data) {
                try {
                    const tikmateRes = await axios.post(
                        'https://tikmate.app/api/download',
                        new URLSearchParams({ url }),
                        {
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'User-Agent': 'Mozilla/5.0'
                            },
                            timeout: 12000
                        }
                    );

                    if (tikmateRes.data) {
                        const tm = tikmateRes.data;
                        data = {
                            play: tm.video?.noWatermark || tm.video?.url,
                            hdplay: tm.video?.hd || tm.video?.noWatermark,
                            title: tm.title || tm.description || 'بدون عنوان',
                            author: { nickname: tm.author || 'مجهول', unique_id: tm.authorId || 'unknown' },
                            play_count: tm.stats?.playCount || 0,
                            digg_count: tm.stats?.likeCount || 0,
                            comment_count: tm.stats?.commentCount || 0,
                            share_count: tm.stats?.shareCount || 0,
                            music_info: tm.music || { title: 'صوت أصلي', author: 'غير معروف' },
                            images: tm.images || null
                        };
                        source = 'TikMate';
                    }
                } catch (errTikmate) {
                    console.error('❌ فشلت جميع الواجهات:', errTikmate.message);
                }
            }

            // ---------- التحقق النهائي ----------
            if (!data) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                return reply(
                    '❌ *عذراً!* يتعذر تحميل هذا المحتوى حالياً.\n' +
                    'قد يكون الحساب خاصاً، أو الفيديو محذوفاً، أو الواجهات غير مستجيبة.'
                );
            }

            // ==========================================
            // تجهيز التنسيق الفخم
            // ==========================================
            const title = data.title || 'لا يوجد وصف';
            const author = data.author?.nickname || 'مجهول';
            const authorId = data.author?.unique_id || 'مجهول';

            const formatNum = (num) => (num || 0).toLocaleString('en-US');

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
┣━━━━━━━━[ 🛰️ مصدر التحميل ]━━━━━━━━┫
┃
┃ 📡 *الواجهة:* ${source}
┃
╰━━━━━━━━━━━━━━━━━━━━━━━╯
*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 👑*
`.trim();

            // ==========================================
            // إرسال النتيجة (صور أو فيديو)
            // ==========================================
            if (data.images && Array.isArray(data.images) && data.images.length > 0) {
                await reply(`📸 *تم العثور على ألبوم صور (${data.images.length} صورة).* جاري الإرسال...`);

                for (let i = 0; i < data.images.length; i++) {
                    const imgUrl = data.images[i];
                    await sock.sendMessage(from, {
                        image: { url: imgUrl },
                        caption: i === 0 ? captionText : `🖼️ *صورة (${i + 1}/${data.images.length})*`
                    }, { quoted: i === 0 ? msg : undefined });
                }
            } else {
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
