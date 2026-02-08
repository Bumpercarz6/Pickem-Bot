async function run() {
  console.log("Starting night sync");

  // fetch games
  // update Results sheet

  console.log("Night sync finished");
  process.exit(0); // ✅ ADD THIS LINE
}

run().catch(err => {
  console.error(err);
  process.exit(1); // ✅ ADD THIS TOO
});
