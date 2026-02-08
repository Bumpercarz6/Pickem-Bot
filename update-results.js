import fetch from "node-fetch";
import { google } from "googleapis";

/* =========================
   CONFIG
========================= */
const SHEET_NAME = "Results"; // tab you already created
const TIMEZONE = "America/Edmonton";

/* =========================
   HELPERS
========================= */
function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

/* =========================
   GOOGLE AUTH
========================= */
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

/* =========================
   FETCH WHL GAMES
========================= */
async function fetchWHLGames(date) {
  const url = `https://lscluster.hockeytech.com/feed/?feed=statviewfeed&view=schedule&date=${date}&league_id=1&key=public`;
  const res = await fetch(url);
  const data = await res.json();
  return data?.schedule ?? [];
}

/* =========================
   MAIN
========================= */
async function main() {
  const date = todayISO();
  const games = await fetchWHLGames(date);

  if (!games.length) {
    console.log("No games found for", date);
    return;
  }

  // Read existing rows to avoid duplicates
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:G`,
  });

  const existingRows = existing.data.values ?? [];
  const existingKeys = new Set(
    existingRows.map(r => `${r[0]}|${r[1]}|${r[2]}`)
  );

  const inserts = [];

  for (const g of games) {
    const home = g.home_team_name;
    const away = g.visiting_team_name;
    const homeScore = g.home_goal_count ?? "";
    const awayScore = g.visiting_goal_count ?? "";
    const status =
      g.game_status === "Final"
        ? g.game_status_string || "Final"
        : "Scheduled";

    const key = `${date}|${home}|${away}`;
    if (existingKeys.has(key)) continue;

    inserts.push([
      date,
      home,
      away,
      homeScore,
      awayScore,
      status,
    ]);
  }

  if (!inserts.length) {
    console.log("No new rows to insert");
    return;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:G`,
    valueInputOption: "RAW",
    requestBody: {
      values: inserts,
    },
  });

  console.log(`Inserted ${inserts.length} rows`);
}

main().catch(console.error);
