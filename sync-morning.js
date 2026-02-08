async function run() {
  console.log("Starting morning sync");

  // fetch games
  // update Results sheet
}
run().then(() => {
  console.log("Morning sync finished");
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
