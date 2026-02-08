/********************
 * REQUIREMENTS
 ********************/
require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { google } = require("googleapis");

import { runMorningSync } from "./sync-morning.js";
import { runNightSync } from "./sync-night.js";

/********************
 * DISCORD CLIENT
 ********************/
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/********************
 * GOOGLE AUTH
 ********************/
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: "v4", auth });

/********************
 * CONFIG — YOU MUST EDIT THESE
 ********************/

// 🔴 GOOGLE SHEET ID (from the URL)
const SPREADSHEET_ID = "1Z-odT9UxUyc11bWDYehgKTthxdOD_VHGoQ_2A8nc3FE";

// 🔴 SHEET NAMES (must match exactly)
const PICKS_SHEET = "Picks";
const USERS_SHEET = "Users";
const META_SHEET = "Meta";

// 🔴 DISCORD SERVER (GUILD) ID
const GUILD_ID = "1418861060294705154";

/********************
 * READY — REGISTER SLASH COMMAND
 ********************/
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  await client.application.commands.create(
    {
      name: "pick",
      description: "Submit your picks",
      options: [
        {
          name: "picks",
          description: "One team per line or comma separated",
          type: 3,
          required: true
        }
      ]
    },
    GUILD_ID
  );

  console.log("✅ /pick command registered");
});

/********************
 * PICK HANDLER
 ********************/
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "pick") return;

  await interaction.deferReply({ ephemeral: true });

  try {
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
    const startRow = Number(meta.start_row);
    const gamesToday = Number(meta.games_today);

    if (!startRow || !gamesToday) {
      await interaction.editReply("❌ Meta sheet missing start_row or games_today.");
      return;
    }

    if (picks.length !== gamesToday) {
      await interaction.editReply(
        `❌ You must submit exactly ${gamesToday} picks. You submitted ${picks.length}.`
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

    /***** WRITE PICKS (ONE CELL AT A TIME — BULLETPROOF) *****/
    let row = startRow;

    for (const pick of picks) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${PICKS_SHEET}!${columnLetter}${row}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [[pick]]
        }
      });

      row++;
    }

    await interaction.editReply("✅ Picks submitted successfully!");

  } catch (err) {
    console.error(err);
    await interaction.editReply("❌ Error writing picks.");
  }
});

/********************
 * LOGIN
 ********************/
client.login(process.env.BOT_TOKEN);

import { DateTime } from "luxon";

const TIMEZONE = "America/Edmonton";

let lastMorningRun = null;
let lastNightRun = null;

async function schedulerLoop() {
  const now = DateTime.now().setZone(TIMEZONE);

  // Morning window: 8:00–10:00 AM
  if (now.hour >= 8 && now.hour < 10) {
    if (lastMorningRun !== now.toISODate()) {
      console.log("☀️ Running morning game sync");
      await runMorningSync();
      lastMorningRun = now.toISODate();
    }
  }

  // Night window: 10:30 PM – 1:00 AM
  if (now.hour >= 22 || now.hour < 1) {
    if (lastNightRun !== now.toISODate()) {
      console.log("🌙 Running night score sync");
      await runNightSync();
      lastNightRun = now.toISODate();
    }
  }
}

// Run every 5 minutes
setInterval(() => {
  schedulerLoop().catch(console.error);
}, 5 * 60 * 1000);

