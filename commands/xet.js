const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const pino = require('pino');

const execFileAsync = promisify(execFile);

module.exports = {
    name: 'تعرف',
    aliases: ['شنو_هذي', 'shazam', 'اعرف_الاغنية'],
    execute: async ({ sock, msg, reply, from }) => {
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        const audioMsg = quoted?.audioMessage || msg.message.audioMessage;
        if (!audioMsg) return;

        try {
            const targetMsg = quoted ? {
                ...msg,
                message: quoted,
                key: {
                    ...msg.key,
                    id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                    participant: msg.message.extendedTextMessage.contextInfo.participant,
                },
            } : msg;

            const buffer = await downloadMediaMessage(
                targetMsg, 'buffer', {},
                { logger: pino({ level: 'silent' }) }
            );

            const form = new FormData();
            form.append('file', new Blob([buffer]), 'audio.ogg');
            form.append('api_token', 'test');
            form.append('return', 'apple_music,spotify');

            const { data } = await axios.post('https://api.audd.io/', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 30000
            });

            if (data.status !== 'success' || !data.result) return;

            const song = data.result;
            const artist = song.artist;
            const title = song.title;

            let infoText = `🎵 *${title}*\n🎤 ${artist}\n`;
            if (song.album) infoText += `💿 ${song.album}\n`;
            if (song.release_date) infoText += `📅 ${song.release_date}\n`;
            if (song.song_link) infoText += `🔗 ${song.song_link}`;

            await reply(infoText);

            const query = `ytsearch1:${artist} ${title}`;
            const tmpFile = path.join(os.tmpdir(), `song_${Date.now()}.mp3`);

            try {
                await execFileAsync('yt-dlp', [
                    query,
                    '-x', '--audio-format', 'mp3',
                    '--audio-quality', '0',
                    '-o', tmpFile,
                    '--no-playlist',
                    '--max-filesize', '50M'
                ], { timeout: 90000 });

                if (fs.existsSync(tmpFile)) {
                    const audioBuffer = fs.readFileSync(tmpFile);
                    await sock.sendMessage(from, {
                        audio: audioBuffer,
                        mimetype: 'audio/mp4',
                        ptt: false
                    }, { quoted: msg });
                    fs.unlinkSync(tmpFile);
                }
            } catch (dlErr) {
                await reply('⚠️ تعذر تحميل الأغنية.');
            }

        } catch {
            return;
        }
    }
};
