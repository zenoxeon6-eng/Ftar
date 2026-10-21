const axios = require('axios');

module.exports = {
    name: 'tweet',
    aliases: ['تغريدة', 'تويتر', 'غرد'],
    execute: async ({ sock, msg, text, reply, from, pushName, sender }) => {
        if (!text) return;

        try {
            const userName = (pushName || 'Tarzan User').slice(0, 32);
            const userHandle = (userName.replace(/\s+/g, '_').toLowerCase() + '123').slice(0, 15);

            let profilePicUrl;
            try {
                profilePicUrl = await sock.profilePictureUrl(sender, 'image');
            } catch {
                profilePicUrl = 'https://i.ibb.co/3Fh9Q6M/blank-profile-picture-973460-1280.png';
            }

            const comment = text.slice(0, 1000);

            const apiUrl = `https://some-random-api.com/canvas/misc/tweet?avatar=${encodeURIComponent(profilePicUrl)}&displayname=${encodeURIComponent(userName)}&username=${encodeURIComponent(userHandle)}&comment=${encodeURIComponent(comment)}`;

            const response = await axios.get(apiUrl, {
                responseType: 'arraybuffer',
                timeout: 30000,
                validateStatus: () => true
            });

            const contentType = response.headers['content-type'] || '';

            if (response.status !== 200 || !contentType.includes('image')) {
                return reply(`❌ فشل إنشاء الصورة (${response.status})`);
            }

            const imageBuffer = Buffer.from(response.data);

            await sock.sendMessage(from, {
                image: imageBuffer,
                caption: `🐦 *تم نشر التغريدة!*\n*— TARZAN VIP 👑*`
            }, { quoted: msg });

        } catch (error) {
            return reply('❌ حدث خطأ أثناء معالجة الطلب.');
        }
    }
};
