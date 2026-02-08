import fetch from "node-fetch";
import { google } from "googleapis";

const SHEET_NAME = "Results";
const TIMEZONE = "America/Edmonton";

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

async function fetchWHLGames() {
  const date = todayISO();
  const url = `https://lscluster.hockeytech.com/feed/?feed=statviewfeed&view=schedule&date=${date}&league_id=1&key=public`;

  const res = await fetch(url);
  const data = await res.json();
  return data?.schedule ?? [];
}

async function main() {
  const date = todayISO();
  const games = await fetchWHLGames();

  const sheet = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:F`,
  });

  const rows = sheet.data.values ?? [];

  for (let i = 0; i < rows.length; i++) {
    const [rDate, home, away] = rows[i];
    if (rDate !== date) continue;

    const game = games.find(
      g =>
        g.home_team_name === home &&
        g.visiting_team_name === away &&
        g.game_status === "Final"
    );

    if (!game) continue;

    let status = "Final";
    if (game.overtime === "1") status = "OT";
    if (game.shootout === "1") status = "SO";

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${SHEET_NAME}!D${i + 2}:F${i + 2}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          game.home_goal_count,
          game.visiting_goal_count,
          status
        ]],
      },
    });

    console.log(`Updated ${away} @ ${home}`);
  }
}

main().catch(console.error);
