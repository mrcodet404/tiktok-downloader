require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder 
} = require('discord.js');
const axios = require('axios');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ===== FUNCTION AMBIL VIDEO =====
async function getTikTokVideo(url) {
    try {
        const api = `https://tikwm.com/api/?url=${encodeURIComponent(url)}`;
        const res = await axios.get(api);

        if (res.data.code === 0) {
            return {
                video: res.data.data.play,
                author: res.data.data.author?.unique_id || "tiktok"
            };
        } else {
            throw new Error("API gagal");
        }
    } catch (err) {
        throw err;
    }
}

// ===== READY =====
client.once('ready', () => {
    console.log(`✅ Bot ready: ${client.user.tag}`);
});

// ===== INTERACTION =====
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'tiktok') {
        const url = interaction.options.getString('url');

        if (!url.includes("tiktok.com")) {
            return interaction.reply({
                content: "❌ Link tidak valid!",
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const data = await getTikTokVideo(url);

            await interaction.editReply({
                content: `✅ Video berhasil diambil!\n👤 Author: ${data.author}`,
                files: [data.video]
            });

        } catch (err) {
            console.error(err);
            await interaction.editReply("❌ Gagal mengambil video!");
        }
    }
});

client.login(process.env.TOKEN);
