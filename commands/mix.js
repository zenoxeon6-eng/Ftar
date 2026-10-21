const axios = require('axios');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const getEmojiMixUrl = require('emoji-mixer').default;

module.exports = {
    name: 'emix',
    aliases: ['دمج', 'مكس'],

    execute: async ({ sock, msg, text, reply, from }) => {
        if (!text || !text.includes(',')) return;

        const [emoji1, emoji2] = text.split(',').map(e => e.trim());
        if (!emoji1 || !emoji2) return;

        try {
            const mixUrl = getEmojiMixUrl(emoji1, emoji2);
            if (!mixUrl) return;

            const imgRes = await axios.get(mixUrl, { responseType: 'arraybuffer', timeout: 15000 });
            const buffer = Buffer.from(imgRes.data);

            const sticker = new Sticker(buffer, {
                pack: 'TARZAN VIP 👑',
                author: 'طرزان الواقدي',
                type: StickerTypes.FULL,
                quality: 100,
                background: 'transparent'
            });

            const stickerBuffer = await sticker.build();
            await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });

        } catch (err) {
            return;
        }
    }
};
