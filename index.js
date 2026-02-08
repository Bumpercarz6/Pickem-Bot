/***********************
 * ENV + LIBRARIES
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
 * GOOGLE AUTH (ENV SAFE)
 ***********************/
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

/***********************
 * CONFIG
 ***********************/
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const PICKS_SHEET = "Picks";
const USERS_SHEET = "Users";
const META_SHEET  = "Meta";

const GUILD_ID = process.env.GUILD_ID;

/***********************
 * READY — REGISTER /pick
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
          description: "Comma separated OR one per line",
          type: 3,
          required: true
        }
      ]
    },
    GUILD_ID
  );

  console.log("✅ /pick command registered");
});

/***********************
 * PICK HANDLER
 ***********************/
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "pick") return;

  await interaction.deferReply({ ephemeral: true });

  try {
    /******** PARSE PICKS ********/
    const raw = interaction.options.getString("picks");

    const picks = raw
      .split(/,|\n/)
      .map(p => p.trim())
      .filter(Boolean);

    /******** READ META ********/
    const metaRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${META_SHEET}!A:B`
    });

    const meta = Object.fromEntries(metaRes.data.values || []);

    const gamesToday = Number(meta.games_today);
    const startRow   = Number(meta.start_row);

    if (!gamesToday || !startRow) {
      return interaction.editReply(
        "❌ Meta sheet must contain **games_today** and **start_row**"
      );
    }

    if (picks.length !== gamesToday) {
      return interaction.editReply(
        `❌ You must submit **${gamesToday}** picks.\nYou submitted **${picks.length}**.`
      );
    }

    /******** FIND USER COLUMN ********/
    const usersRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USERS_SHEET}!A:B`
    });

    const users = usersRes.data.values || [];
    const user = users.find(r => r[0] === interaction.user.id);

    if (!user) {
      return interaction.editReply("❌ You are not registered in the Users sheet.");
    }

    const column = user[1];

    /******** WRITE PICKS ********/
    const endRow = startRow + gamesToday - 1;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${PICKS_SHEET}!${column}${startRow}:${column}${endRow}`,
      valueInputOption: "RAW",
      requestBody: {
        values: picks.map(p => [p])
      }
    });

    await interaction.editReply("✅ Picks submitted successfully!");

  } catch (err) {
    console.error("❌ PICK ERROR:", err);
    await interaction.editReply("❌ Error writing picks. Check bot logs.");
  }
});

/***********************
 * LOGIN
 ***********************/
client.login(process.env.DISCORD_TOKEN);
