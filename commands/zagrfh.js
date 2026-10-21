const { formatAll } = require('fontsall');

module.exports = {
    name: 'زخرفة',
    aliases: ['زخرف', 'font', 'fancy'],
    execute: async ({ reply, text }) => {
        if (!text) return;

        try {
            const styles = formatAll(text);

            const result =
                `✨ *[ 𝑻𝑨𝑹𝒁𝑨𝑵 𝑭𝑶𝑵𝑻𝑺 ]* ✨\n\n` +
                `📌 *الأصلي:* ${text}\n\n` +
                `1️⃣ ${styles.gothic}\n` +
                `2️⃣ ${styles.bold}\n` +
                `3️⃣ ${styles.script}\n` +
                `4️⃣ ${styles.doubleStruck}\n` +
                `5️⃣ ${styles.circled}\n` +
                `6️⃣ ${styles.monospace}\n\n` +
                `*— اختر ما يناسب فخامتك 🍷*`;

            await reply(result);
        } catch {
            return;
        }
    }
};
