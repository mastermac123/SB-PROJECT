// Friendly check before `npm run dev` / `npm start`: RideSync needs Node 22.13+ (built-in SQLite).
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`\n  RideSync needs Node.js 22.13 or newer. You have ${process.versions.node}.`)
  console.error('  Download the LTS version from https://nodejs.org and run this again.\n')
  process.exit(1)
}
