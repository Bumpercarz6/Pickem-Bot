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
 * GOOGLE AUTH
 ***********************/
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

/***********************
 * 🔧 CONFIG — YOU MUST EDIT THESE
 ***********************/

// 🔴 1. GOOGLE SHEET ID
// From URL: https://docs.google.com/spreadsheets/d/THIS_PART/edit
const SPREADSHEET_ID = "1Z-odT9UxUyc11bWDYehgKTthxdOD_VHGoQ_2A8nc3FE";

// 🔴 2. SHEET NAMES (must match exactly)
const PICKS_SHEET = "Picks";
const USERS_SHEET = "Users";
const META_SHEET = "Meta";

// 🔴 3. DISCORD SERVER (GUILD) ID
const GUILD_ID = "1418861060294705154";

/***********************
 * READY — REGISTER SLASH COMMAND
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
          description: "One team per line OR comma separated",
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
    console.log("📥 /pick received from", interaction.user.id);

    /***** PARSE PICKS *****/
    const rawPicks = interaction.options.getString("picks");
    const picks = rawPicks
      .split(/,|\n/)
      .map(p => p.trim())
      .filter(Boolean);

    /***** READ META SHEET *****/
    const metaRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${META_SHEET}!A:B`
    });

    const meta = Object.fromEntries(metaRes.data.values || []);
    const gamesToday = Number(meta.games_today);

    if (!gamesToday) {
      await interaction.editReply("❌ games_today not set in Meta sheet.");
      return;
    }

    /***** VALIDATE PICK COUNT *****/
    if (picks.length !== gamesToday) {
      await interaction.editReply(
        `❌ You must submit exactly **${gamesToday}** picks.\nYou submitted **${picks.length}**.`
      );
      return;
    }

    /***** FIND USER COLUMN *****/
    const usersRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USERS_SHEET}!A:B`
    });

    const users = usersRes.data.values || [];
    const userRow = users.find(r => r[0] === interaction.user.id);

    if (!userRow) {
      await interaction.editReply("❌ You are not registered in the Users sheet.");
      return;
    }

    const columnLetter = userRow[1];
    console.log("➡️ Writing to column", columnLetter);

    /***** FIND NEXT EMPTY ROW *****/
    const colRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${PICKS_SHEET}!${columnLetter}:${columnLetter}`
    });

    const colValues = colRes.data.values || [];
    const startRow = colValues.length + 1;

    console.log(
      `📝 Writing rows ${startRow} → ${startRow + picks.length - 1}`
    );

    /***** WRITE PICKS *****/
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${PICKS_SHEET}!${columnLetter}${startRow}:${columnLetter}${startRow + picks.length - 1}`,
      valueInputOption: "RAW",
      requestBody: {
        values: picks.map(p => [p])
      }
    });

    await interaction.editReply("✅ Picks submitted successfully!");
    console.log("✅ Picks written");

  } catch (err) {
    console.error("❌ PICK ERROR:", err);
    await interaction.editReply("❌ Error writing picks. Check bot console.");
  }
});

/***********************
 * LOGIN
 ***********************/
client.login(process.env.BOT_TOKEN);
