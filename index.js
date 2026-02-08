const fetch = require("node-fetch");
const { google } = require("googleapis");

/* CONFIG */
const SHEET_NAME = "Results";
const TIMEZONE = "America/Edmonton";

/* TIME HELPERS */
function getMountainHour() {
  const now = new Date();
  const mountain = new Date(
    now.toLocaleString("en-US", { timeZone: TIMEZONE })
  );
  return mountain.getHours();
}

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

async function fetchWHLGames(date) {
  const url = `https://lscluster.hockeytech.com/feed/?feed=statviewfeed&view=schedule&date=${date}&league_id=1&key=public`;
  const res = await fetch(url);
  const data = await res.json();
  return data?.schedule ?? [];
}

async function updateScheduledGames() {
  const date = todayISO();
  const games = await fetchWHLGames(date);

  if (!games.length) {
    console.log("No games scheduled today");
    return;
  }

  const sheet = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:F`,
  });

  const rows = sheet.data.values ?? [];
  const existing = new Set(rows.map(r => `${r[0]}|${r[1]}|${r[2]}`));

  const inserts = [];

  for (const g of games) {
    const home = g.home_team_name;
    const away = g.visiting_team_name;
    const key = `${date}|${home}|${away}`;

    if (!existing.has(key)) {
      inserts.push([date, home, away, "", "", "Scheduled"]);
    }
  }

  if (!inserts.length) {
    console.log("No new games to insert");
    return;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2`,
    valueInputOption: "RAW",
    requestBody: { values: inserts },
  });

  console.log(`Inserted ${inserts.length} scheduled games`);
}

async function updateFinalScores() {
  const date = todayISO();
  const games = await fetchWHLGames(date);

  if (!games.length) return;

  const sheet = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:F`,
  });

  const rows = sheet.data.values ?? [];
  const updates = [];

  games.forEach((g, i) => {
    if (!g.home_goal_count && !g.visiting_goal_count) return;

    const status =
      g.game_status === "Final"
        ? "Final"
        : g.game_status === "OT"
        ? "OT"
        : g.game_status === "SO"
        ? "SO"
        : "";

    updates.push({
      range: `${SHEET_NAME}!D${i + 2}:F${i + 2}`,
      values: [[g.visiting_goal_count, g.home_goal_count, status]],
    });
  });

  if (!updates.length) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "RAW",
      data: updates,
    },
  });

  console.log("Updated final scores");
}

/********************
 * REQUIREMENTS
 ********************/
require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { google } = require("googleapis");

import { DateTime } from "luxon";

const now = DateTime.now().setZone("America/Edmonton");
const hour = now.hour;

if (hour >= 8 && hour < 12) {
  await updateScheduledGames();
}

if (hour >= 22 || hour < 2) {
  await updateFinalScores();
}

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

async function runAutomation() {
  const hour = getMountainHour();
  console.log("Mountain hour:", hour);

  // Morning run
  if (hour >= 8 && hour < 12) {
    await updateScheduledGames();
  }

  // Night run
  if (hour >= 22 || hour < 2) {
    await updateFinalScores();
  }
}

runAutomation().catch(console.error);
