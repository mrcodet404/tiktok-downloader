require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('tiktok')
        .setDescription('Download video TikTok tanpa watermark')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('Link TikTok')
                .setRequired(true)
        )
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('⏳ Deploy command...');

        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            { body: commands }
        );

        console.log('✅ Command berhasil didaftarkan!');
    } catch (err) {
        console.error(err);
    }
})();
