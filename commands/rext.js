const axios = require('axios');

const CONFIG = {
    timeout: 15000,
    maxUrlLength: 2048,
};

function extractUrl(text, msg) {
    if (text && text.trim()) return text.trim();
    const ctx = msg?.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    if (quoted) {
        if (quoted.conversation) return quoted.conversation.trim();
        if (quoted.extendedTextMessage?.text) return quoted.extendedTextMessage.text.trim();
    }
    return null;
}

function isValidUrl(url) {
    try {
        const u = new URL(url);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

async function shorten(url) {
    const res = await axios.get(
        `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`,
        { timeout: CONFIG.timeout }
    );
    return res.data;
}

module.exports = {
    name: 'اختصار',
    aliases: ['رابط', 'short'],

    execute: async ({ reply, text, msg }) => {
        const link = extractUrl(text, msg);
        if (!link) return;

        if (link.length > CONFIG.maxUrlLength) return;
        if (!isValidUrl(link)) return;

        let shortUrl;
        try {
            shortUrl = await shorten(link);
        } catch {
            return;
        }

        if (!shortUrl || typeof shortUrl !== 'string' || !shortUrl.startsWith('http')) return;

        await reply(
            `✨ *[ مصنع الروابط الملكي ]* ✨\n\n` +
            `✅ *الرابط المختصر:*\n${shortUrl}\n\n` +
            `*— تم الاختصار بنجاح 🛡️*`
        );
    }
};
