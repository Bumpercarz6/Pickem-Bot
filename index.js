/***********************
 * REQUIRED LIBRARIES
 ***********************/
require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { google } = require("googleapis");

/***********************
 * DISCORD CLIENT
 ***********************/
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/***********************
 * GOOGLE AUTH (ENV ONLY)
 ***********************/
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

/***********************
 * CONFIG
 ***********************/
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const PICKS_SHEET = "Picks";
const USERS_SHEET = "Users";
const META_SHEET = "Meta";
const GUILD_ID = process.env.GUILD_ID;

/***********************
 * READY
 ***********************/
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  await client.application.commands.create(
    {
      name: "pick",
      description: "Submit your picks",
      options: [
        {
          name: "picks",
          description: "Comma or newline separated",
          type: 3,
          required: true
        }
      ]
    },
    GUILD_ID
  );

  console.log("✅ /pick registered");
});

/***********************
 * PICK HANDLER
 ***********************/
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "pick") return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const raw = interaction.options.getString("picks");

    const picks = raw
      .replace(/\r/g, "")
      .split(/[,|\n]+/)
      .map(p => p.trim())
      .filter(Boolean);

    console.log("Parsed picks:", picks);

    /** META **/
    const metaRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${META_SHEET}!A:B`
    });

    const meta = Object.fromEntries(metaRes.data.values || []);
    const gamesToday = Number(meta.games_today);

    if (!gamesToday) {
      return interaction.editReply("❌ games_today missing in Meta sheet.");
    }

    if (picks.length !== gamesToday) {
      return interaction.editReply(
        `❌ You must submit **${gamesToday}** picks (you sent ${picks.length}).`
      );
    }

    /** USERS **/
    const usersRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USERS_SHEET}!A:B`
    });

    const user = usersRes.data.values?.find(r => r[0] === interaction.user.id);
    if (!user) {
      return interaction.editReply("❌ You are not registered.");
    }

    const column = user[1];

    /** FIND NEXT ROW **/
    const colRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${PICKS_SHEET}!${column}:${column}`
    });

    const startRow = (colRes.data.values?.length || 0) + 1;

    /** WRITE **/
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${PICKS_SHEET}!${column}${startRow}`,
      valueInputOption: "RAW",
      requestBody: {
        values: picks.map(p => [p])
      }
    });

    await interaction.editReply("✅ Picks submitted!");

  } catch (err) {
    console.error("❌ PICK ERROR:", err);
    await interaction.editReply("❌ Error writing picks. Check logs.");
  }
});

/***********************
 * LOGIN
 ***********************/
client.login(process.env.BOT_TOKEN);
