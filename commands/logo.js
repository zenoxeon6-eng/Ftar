const delay = ms => new Promise(res => setTimeout(res, ms));

const CONFIG = {
    charDelayMs: 350,
    maxLength: 300,
    minNumberLength: 8,
    cursor: ' █',
};

function cleanNumber(raw) {
    return String(raw || '').replace(/\D/g, '');
}

function isValidNumber(num) {
    return num.length >= CONFIG.minNumberLength && num.length <= 15;
}

async function editMessage(sock, jid, text, key) {
    try {
        await sock.sendMessage(jid, { text, edit: key });
        return true;
    } catch {
        return false;
    }
}

async function typeToTarget(sock, targetJid, message) {
    let buffer = '';
    let lastKey = null;

    for (let i = 0; i < message.length; i++) {
        buffer += message[i];
        const isLast = i === message.length - 1;
        const display = isLast ? buffer : buffer + CONFIG.cursor;

        if (lastKey === null) {
            const sent = await sock.sendMessage(targetJid, { text: display });
            lastKey = sent.key;
        } else {
            const ok = await editMessage(sock, targetJid, display, lastKey);
            if (!ok) {
                const sent = await sock.sendMessage(targetJid, { text: display });
                lastKey = sent.key;
            }
        }

        if (!isLast) await delay(CONFIG.charDelayMs);
    }

    return lastKey;
}

module.exports = {
    name: 'type',
    aliases: ['اكتب', 'شبح', 'طباعة'],
    execute: async ({ sock, text }) => {
        const input = String(text || '').trim();
        const idx = input.indexOf(' ');
        if (idx === -1) return;

        const rawNumber = input.substring(0, idx).trim();
        const secretMessage = input.substring(idx + 1).trim();
        if (!rawNumber || !secretMessage) return;

        const targetNumber = cleanNumber(rawNumber);
        if (!isValidNumber(targetNumber)) return;
        if (secretMessage.length > CONFIG.maxLength) return;

        const targetJid = `${targetNumber}@s.whatsapp.net`;

        try {
            const onCheck = await sock.onWhatsApp(targetJid).catch(() => null);
            if (!Array.isArray(onCheck) || !onCheck[0]?.exists) return;

            await typeToTarget(sock, targetJid, secretMessage);
        } catch {
            return;
        }
    },
};
