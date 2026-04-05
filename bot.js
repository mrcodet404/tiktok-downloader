require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");
const axios = require("axios");

// ============================================
// KONFIGURASI
// ============================================
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// Validasi environment variables
// HAPUS atau COMMENT bagian ini dulu untuk test
// if (!TOKEN || !CLIENT_ID) {
//   console.error("❌ ERROR: DISCORD_TOKEN dan CLIENT_ID harus diset!")
//   process.exit(1);
// }

// Ganti dengan ini untuk debug
console.log("🔍 DEBUG ENV CHECK:");
console.log("TOKEN ada?", !!process.env.DISCORD_TOKEN);
console.log("CLIENT_ID ada?", !!process.env.CLIENT_ID);
console.log("TOKEN (5 karakter pertama):", process.env.DISCORD_TOKEN?.substring(0, 5));
console.log("CLIENT_ID value:", process.env.CLIENT_ID);

// ============================================
// INISIALISASI CLIENT DISCORD
// ============================================
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ============================================
// DEFINISI SLASH COMMANDS
// ============================================
const commands = [
  new SlashCommandBuilder()
    .setName("tiktok")
    .setDescription("Download video TikTok tanpa watermark")
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("Link video TikTok yang ingin didownload")
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Tampilkan bantuan penggunaan bot")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Cek apakah bot aktif")
    .toJSON(),
];

// ============================================
// FUNGSI: REGISTER SLASH COMMANDS
// ============================================
async function registerCommands() {
  try {
    console.log("🔄 Mendaftarkan slash commands...");

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: commands,
    });

    console.log("✅ Slash commands berhasil didaftarkan!");
  } catch (error) {
    console.error("❌ Gagal mendaftarkan slash commands:", error);
  }
}

// ============================================
// FUNGSI: EKSTRAK VIDEO ID DARI URL TIKTOK
// ============================================
function extractVideoId(url) {
  // Pattern untuk berbagai format URL TikTok
  const patterns = [
    /\/video\/(\d+)/,
    /\/v\/(\d+)/,
    /tiktok\.com\/@[\w.]+\/video\/(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

// ============================================
// FUNGSI: VALIDASI URL TIKTOK
// ============================================
function isValidTikTokUrl(url) {
  const tiktokPatterns = [
    /https?:\/\/(www\.)?tiktok\.com\/@[\w.]+\/video\/\d+/,
    /https?:\/\/vm\.tiktok\.com\/\w+/,
    /https?:\/\/vt\.tiktok\.com\/\w+/,
    /https?:\/\/m\.tiktok\.com\/v\/\d+/,
  ];

  return tiktokPatterns.some((pattern) => pattern.test(url));
}

// ============================================
// FUNGSI: RESOLVE URL PENDEK TIKTOK
// ============================================
async function resolveShortUrl(url) {
  try {
    // Jika URL sudah panjang, langsung return
    if (url.includes("/video/")) return url;

    // Resolve URL pendek (vm.tiktok.com, vt.tiktok.com)
    const response = await axios.get(url, {
      maxRedirects: 5,
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    return response.request.res.responseUrl || url;
  } catch (error) {
    // Jika redirect gagal, coba ambil dari response
    if (error.response) {
      return error.response.headers.location || url;
    }
    return url;
  }
}

// ============================================
// FUNGSI: DOWNLOAD VIDEO DARI TIKWM API
// ============================================
async function downloadTikTokVideo(videoUrl) {
  // Resolve URL pendek jika perlu
  const resolvedUrl = await resolveShortUrl(videoUrl);

  // Ekstrak Video ID
  const videoId = extractVideoId(resolvedUrl);

  // Coba dengan URL yang sudah diketahui
  const urlsToTry = [
    resolvedUrl,
    videoId
      ? `https://www.tiktok.com/@user/video/${videoId}`
      : null,
    videoId
      ? `https://www.tiktok.com/video/${videoId}`
      : null,
  ].filter(Boolean);

  let lastError = null;

  for (const tryUrl of urlsToTry) {
    try {
      console.log(`🔄 Mencoba API dengan URL: ${tryUrl}`);

      const apiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(tryUrl)}`;

      const response = await axios.get(apiUrl, {
        timeout: 30000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
          Referer: "https://tikwm.com/",
        },
      });

      const data = response.data;

      // Cek apakah response sukses
      if (data.code === 0 && data.data) {
        const videoData = data.data;

        return {
          success: true,
          videoUrl: videoData.play,        // Video tanpa watermark
          videoUrlWm: videoData.wmplay,    // Video dengan watermark
          hdVideoUrl: videoData.hdplay,    // Video HD
          coverUrl: videoData.cover,       // Thumbnail
          author: {
            username: videoData.author?.unique_id || "unknown",
            nickname: videoData.author?.nickname || "Unknown User",
            avatar: videoData.author?.avatar,
          },
          stats: {
            likes: videoData.digg_count || 0,
            comments: videoData.comment_count || 0,
            shares: videoData.share_count || 0,
            plays: videoData.play_count || 0,
          },
          description: videoData.title || "TikTok Video",
          duration: videoData.duration || 0,
          videoId: videoData.id || videoId,
          music: {
            title: videoData.music_info?.title || "Unknown",
            author: videoData.music_info?.author || "Unknown",
          },
        };
      }

      lastError = data.msg || "API returned error";
    } catch (error) {
      lastError = error.message;
      console.error(`❌ Error dengan URL ${tryUrl}:`, error.message);
    }
  }

  return {
    success: false,
    error: lastError || "Gagal mendapatkan video dari semua URL yang dicoba",
  };
}

// ============================================
// FUNGSI: FORMAT ANGKA (1000 -> 1K)
// ============================================
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

// ============================================
// FUNGSI: FORMAT DURASI DETIK -> MM:SS
// ============================================
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ============================================
// FUNGSI: CEK UKURAN FILE VIDEO
// ============================================
async function getVideoSize(url) {
  try {
    const response = await axios.head(url, { timeout: 10000 });
    const size = parseInt(response.headers["content-length"] || "0");
    return size;
  } catch {
    return 0;
  }
}

// ============================================
// FUNGSI: KIRIM VIDEO KE DISCORD
// ============================================
// ============================================
// FUNGSI: KIRIM VIDEO KE DISCORD (VERSI BARU - SELALU LINK)
// ============================================
async function sendVideoToDiscord(interaction, videoData, originalUrl) {
  console.log(`✅ Data video diterima, mengirim sebagai link...`);

  // Buat embed informasi video
  const embed = new EmbedBuilder()
    .setColor("#FE2C55") // Warna TikTok
    .setTitle("📱 TikTok Video Downloaded!")
    .setDescription(
      videoData.description.length > 200
        ? videoData.description.substring(0, 197) + "..."
        : videoData.description || "No description."
    )
    .addFields(
      {
        name: "👤 Creator",
        value: `**${videoData.author.nickname}** (@${videoData.author.username})`,
        inline: true,
      },
      {
        name: "⏱️ Durasi",
        value: formatDuration(videoData.duration),
        inline: true,
      },
      {
        name: "🎵 Music",
        value: `${videoData.music.title} - ${videoData.music.author}`,
        inline: false,
      },
      {
        name: "❤️ Likes",
        value: formatNumber(videoData.stats.likes),
        inline: true,
      },
      {
        name: "💬 Komentar",
        value: formatNumber(videoData.stats.comments),
        inline: true,
      },
      {
        name: "🔄 Share",
        value: formatNumber(videoData.stats.shares),
        inline: true,
      },
      {
        name: "▶️ Total Views",
        value: formatNumber(videoData.stats.plays),
        inline: true,
      },
      {
        name: "📥 Download Links",
        value: [
          `🎬 **[Video Tanpa Watermark](${videoData.videoUrl})**`,
          videoData.hdVideoUrl ? `📷 [Video HD](${videoData.hdVideoUrl})` : null,
          videoData.videoUrlWm
            ? `💧 [Video Dengan Watermark](${videoData.videoUrlWm})`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
        inline: false,
      }
    )
    .setThumbnail(videoData.coverUrl)
    .setFooter({
      text: `TikTok Downloader • Video ID: ${videoData.videoId}`,
      iconURL:
        "https://sf16-website-login.neutral.ttwstatic.com/obj/tiktok_web_login_static/tiktok/webapp/main/webapp-desktop/8152caf0c8e8bc67ae0d.png",
    })
    .setTimestamp();

  // Kirim embed dengan link
  await interaction.editReply({
    embeds: [embed],
  });

  console.log(`✅ Link video berhasil dikirim!`);
}

// ============================================
// EVENT: BOT READY
// ============================================
client.once("ready", async () => {
  console.log(`✅ Bot aktif sebagai: ${client.user.tag}`);
  console.log(`🆔 Client ID: ${client.user.id}`);
  console.log(`📡 Tersambung ke ${client.guilds.cache.size} server`);

  // Set status bot
  client.user.setPresence({
    activities: [
      {
        name: "/tiktok [url] | Download TikTok",
        type: 3, // Watching
      },
    ],
    status: "online",
  });

  // Register commands
  await registerCommands();
});

// ============================================
// EVENT: INTERACTION (SLASH COMMANDS)
// ============================================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // ==================
  // COMMAND: /ping
  // ==================
  if (commandName === "ping") {
    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("🏓 Pong!")
          .addFields(
            {
              name: "📡 Latency Bot",
              value: `${latency}ms`,
              inline: true,
            },
            {
              name: "💓 API Latency",
              value: `${Math.round(client.ws.ping)}ms`,
              inline: true,
            }
          )
          .setTimestamp(),
      ],
    });
    return;
  }

  // ==================
  // COMMAND: /help
  // ==================
  if (commandName === "help") {
    const helpEmbed = new EmbedBuilder()
      .setColor("#FE2C55")
      .setTitle("📖 Bantuan TikTok Bot")
      .setDescription("Bot untuk download video TikTok tanpa watermark!")
      .addFields(
        {
          name: "📥 `/tiktok [url]`",
          value:
            "Download video TikTok dari URL yang diberikan\n" +
            "**Contoh:** `/tiktok https://www.tiktok.com/@user/video/123456789`",
          inline: false,
        },
        {
          name: "🔗 Format URL yang Didukung",
          value: [
            "• `https://www.tiktok.com/@username/video/ID`",
            "• `https://vm.tiktok.com/XXXXX` (URL pendek)",
            "• `https://vt.tiktok.com/XXXXX` (URL pendek)",
          ].join("\n"),
          inline: false,
        },
        {
          name: "ℹ️ Informasi",
          value: [
            "• Video ≤ 25MB akan diupload langsung",
            "• Video > 25MB akan dikirim sebagai link download",
            "• Semua video bebas watermark",
          ].join("\n"),
          inline: false,
        },
        {
          name: "🏓 `/ping`",
          value: "Cek status bot",
          inline: true,
        },
        {
          name: "❓ `/help`",
          value: "Tampilkan bantuan ini",
          inline: true,
        }
      )
      .setFooter({ text: "Powered by TikWM API" })
      .setTimestamp();

    await interaction.reply({ embeds: [helpEmbed] });
    return;
  }

  // ==================
  // COMMAND: /tiktok
  // ==================
  if (commandName === "tiktok") {
    const videoUrl = interaction.options.getString("url");

    // Validasi input URL
    if (!videoUrl) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Error")
            .setDescription("URL tidak boleh kosong!")
            .addFields({
              name: "💡 Contoh Penggunaan",
              value:
                "`/tiktok https://www.tiktok.com/@username/video/123456789`",
            }),
        ],
        ephemeral: true,
      });
      return;
    }

    // Validasi format URL TikTok
    if (!isValidTikTokUrl(videoUrl)) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF9900")
            .setTitle("⚠️ URL Tidak Valid")
            .setDescription(
              "URL yang diberikan bukan URL TikTok yang valid!"
            )
            .addFields({
              name: "🔗 Format URL yang Diterima",
              value: [
                "• `https://www.tiktok.com/@username/video/ID`",
                "• `https://vm.tiktok.com/XXXXX`",
                "• `https://vt.tiktok.com/XXXXX`",
              ].join("\n"),
            }),
        ],
        ephemeral: true,
      });
      return;
    }

    // Defer reply karena proses bisa memakan waktu
    await interaction.deferReply();

    console.log(
      `📥 Request download dari ${interaction.user.tag}: ${videoUrl}`
    );

    try {
      // Kirim status loading
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FE2C55")
            .setTitle("⏳ Memproses...")
            .setDescription(
              `Sedang mengambil video dari:\n\`${videoUrl}\``
            )
            .addFields({
              name: "🔄 Status",
              value: "Menghubungi TikWM API...",
            })
            .setTimestamp(),
        ],
      });

      // Download video
      const result = await downloadTikTokVideo(videoUrl);

      if (!result.success) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ Gagal Download")
              .setDescription(
                "Tidak bisa mengambil video dari URL yang diberikan."
              )
              .addFields(
                {
                  name: "🔍 Error",
                  value: result.error || "Unknown error",
                  inline: false,
                },
                {
                  name: "💡 Saran",
                  value: [
                    "• Pastikan video masih tersedia (tidak dihapus)",
                    "• Pastikan akun tidak private",
                    "• Coba beberapa saat lagi",
                    "• Pastikan URL lengkap dan benar",
                  ].join("\n"),
                  inline: false,
                }
              )
              .setTimestamp(),
          ],
        });
        return;
      }

      // Kirim video ke Discord
      await sendVideoToDiscord(interaction, result, videoUrl);

      console.log(
        `✅ Sukses download video untuk ${interaction.user.tag}`
      );
    } catch (error) {
      console.error("❌ Error tidak terduga:", error);

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("❌ Error Tidak Terduga")
            .setDescription(
              "Terjadi kesalahan yang tidak terduga. Silakan coba lagi."
            )
            .addFields({
              name: "🔍 Detail Error",
              value: error.message || "Unknown error",
            })
            .setTimestamp(),
        ],
      });
    }
  }
});

// ============================================
// ERROR HANDLING
// ============================================
client.on("error", (error) => {
  console.error("❌ Discord Client Error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled Promise Rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
});

// ============================================
// LOGIN BOT
// ============================================
console.log("🚀 Menjalankan TikTok Discord Bot...");
client.login(TOKEN).catch((error) => {
  console.error("❌ Gagal login:", error.message);
  process.exit(1);
});
