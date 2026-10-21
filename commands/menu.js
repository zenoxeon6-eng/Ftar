const axios = require('axios');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const execFileAsync = promisify(execFile);

const surahs = ["الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس","هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه","الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم","لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر","فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق","الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة","الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة","المعارج","نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس","التكوير","الانفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد","الشمس","الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات","القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر","المسد","الإخلاص","الفلق","الناس"];

const normalizeText = (text) => text.replace(/ة/g, 'ه').replace(/[أإآ]/g, 'ا').replace(/\s/g, '').trim();

async function convertToPtt(inputBuffer) {
    const tmpDir = os.tmpdir();
    const id = crypto.randomBytes(8).toString('hex');
    const inputPath = path.join(tmpDir, `quran_${id}.mp3`);
    const outputPath = path.join(tmpDir, `quran_${id}.ogg`);

    fs.writeFileSync(inputPath, inputBuffer);

    try {
        await execFileAsync('ffmpeg', [
            '-i', inputPath,
            '-vn',
            '-ar', '48000',
            '-ac', '1',
            '-c:a', 'libopus',
            '-b:a', '64k',
            '-application', 'voip',
            '-avoid_negative_ts', 'make_zero',
            '-map_metadata', '-1',
            '-f', 'ogg',
            outputPath,
            '-y'
        ], { timeout: 30000 });

        const outputBuffer = fs.readFileSync(outputPath);
        return outputBuffer;
    } finally {
        try { fs.unlinkSync(inputPath); } catch {}
        try { fs.unlinkSync(outputPath); } catch {}
    }
}

module.exports = {
    name: 'قرآن',
    aliases: ['ايه', 'آية', 'راحه', 'quran'],

    execute: async ({ reply, sock, from, msg, args }) => {
        await sock.sendMessage(from, { react: { text: '🕋', key: msg.key } });

        try {
            const userInput = args.join(' ').trim();
            let queryRef = null;

            if (!userInput) {
                queryRef = Math.floor(Math.random() * 6236) + 1;
            } else {
                const cleanInput = userInput.replace(/سورة|سوره/g, '').trim();
                const matchNum = cleanInput.match(/\d+/);
                const ayahNum = matchNum ? matchNum[0] : 1;
                const textWithoutNum = cleanInput.replace(/\d+/g, '').trim();
                const normalizedInput = normalizeText(textWithoutNum);
                const surahIndex = surahs.findIndex(s => normalizeText(s) === normalizedInput);

                if (surahIndex !== -1) {
                    queryRef = `${surahIndex + 1}:${ayahNum}`;
                } else {
                    const searchUrl = `https://api.alquran.cloud/v1/search/${encodeURIComponent(userInput)}/all/ar`;
                    const searchRes = await axios.get(searchUrl);

                    if (searchRes.data.data.count > 0) {
                        queryRef = searchRes.data.data.matches[0].number;
                    } else {
                        await sock.sendMessage(from, { react: { text: '❓', key: msg.key } });
                        return reply('❌ *لم أتمكن من العثور على هذه السورة أو الآية، تأكد من الكتابة.*');
                    }
                }
            }

            const [audioRes, tafsirRes] = await Promise.all([
                axios.get(`https://api.alquran.cloud/v1/ayah/${queryRef}/ar.alafasy`),
                axios.get(`https://api.alquran.cloud/v1/ayah/${queryRef}/ar.muyassar`)
            ]);

            const audioData = audioRes.data.data;
            const tafsirData = tafsirRes.data.data;

            if (!audioData || !tafsirData) throw new Error('API Error');

            const quranText =
                `❖ ════ 🕋 ﴿ نُورٌ عَلَى نُور ﴾ 🕋 ════ ❖\n\n` +
                `📖 *الآيَة:*\n﴿ ${audioData.text} ﴾\n\n` +
                `💡 *التَّفْسِير (المُيَسَّر):*\n${tafsirData.text}\n\n` +
                `📌 *السُّورَة:* ${audioData.surah.name} - آيَة [${audioData.numberInSurah}]\n` +
                `🎙️ *القَارِئ:* مِشَارِي بن رَاشِد العَفَاسِي\n\n` +
                `❖ ════════════════════════ ❖`;

            await reply(quranText);

            if (audioData.audio) {
                await sock.sendPresenceUpdate('recording', from);

                const audioBufferRes = await axios.get(audioData.audio, { responseType: 'arraybuffer' });
                const pttBuffer = await convertToPtt(Buffer.from(audioBufferRes.data));

                await sock.sendMessage(from, {
                    audio: pttBuffer,
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt: true
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            }

        } catch (error) {
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });

            if (error.response && error.response.status === 404) {
                return reply('❌ *رقم الآية الذي أدخلته غير موجود في هذه السورة.*');
            }

            reply('❌ *حدث خطأ، حاول مجدداً.*');
        }
    }
};
