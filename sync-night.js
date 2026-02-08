async function run() {
  console.log("Starting night sync");

  // fetch games
  // update Results sheet

  run().then(() => {
  console.log("Night sync finished");
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
