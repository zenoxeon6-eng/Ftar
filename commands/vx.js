const axios = require('axios');

module.exports = {
    name: 'اغنية',
    aliases: ['song', 'موسيقى'],
    execute: async ({ sock, msg, reply, text, from }) => {
        if (!text) return;

        try {
            const { data } = await axios.get(
                `https://api.vevioz.com/api/button/mp3/${encodeURIComponent(text)}`,
                { timeout: 20000 }
            );

            if (data?.url) {
                await sock.sendMessage(from, {
                    audio: { url: data.url },
                    mimetype: 'audio/mp4',
                    ptt: false
                }, { quoted: msg });
            }
        } catch {
            return;
        }
    }
};
