require("dotenv").config();

const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require("discord.js");
const { google } = require("googleapis");

/* =====================
   DISCORD CLIENT
===================== */
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* =====================
   GOOGLE SHEETS AUTH
===================== */
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

/* =====================
   COMMAND DEFINITION
===================== */
const pickCommand = new SlashCommandBuilder()
  .setName("pick")
  .setDescription("Submit a pick")
  .addStringOption(opt =>
    opt.setName("team")
      .setDescription("Team name")
      .setRequired(true)
  );

/* =====================
   REGISTER COMMAND
===================== */
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
    { body: [pickCommand.toJSON()] }
  );

  console.log("✅ Slash commands registered");
}

/* =====================
   BOT READY
===================== */
client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await registerCommands();
});

/* =====================
   INTERACTION HANDLER
===================== */
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "pick") return;

  try {
    const team = interaction.options.getString("team");
    const user = interaction.user.username;

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "Picks!A:C",
      valueInputOption: "RAW",
      requestBody: {
        values: [[new Date().toISOString(), user, team]]
      }
    });

    await interaction.reply({ content: "✅ Pick submitted!", ephemeral: true });
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: "❌ Error writing picks.", ephemeral: true });
  }
});

/* =====================
   LOGIN
===================== */
client.login(process.env.DISCORD_TOKEN);
