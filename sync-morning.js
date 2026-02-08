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

  if (!games.length) {
    console.log("No games today");
    return;
  }

  const sheet = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:F`,
  });

  const rows = sheet.data.values ?? [];
  const existingKeys = new Set(
    rows.map(r => `${r[0]}|${r[1]}|${r[2]}`)
  );

  const inserts = [];

  for (const g of games) {
    const home = g.home_team_name;
    const away = g.visiting_team_name;
    const key = `${date}|${home}|${away}`;

    if (!existingKeys.has(key)) {
      inserts.push([date, home, away, "", "", "Scheduled"]);
    }
  }

  if (inserts.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:F`,
      valueInputOption: "RAW",
      requestBody: { values: inserts },
    });

    console.log(`Inserted ${inserts.length} games`);
  } else {
    console.log("All games already exist");
  }
}

main().catch(console.error);
