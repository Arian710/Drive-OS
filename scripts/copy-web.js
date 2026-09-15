// Kopiert die statischen Web-Assets (Quelle: Repo-Root, auch von Vercel genutzt)
// in den www/-Ordner, den Capacitor als webDir fuer die native App verwendet.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = ["index.html", "supabase.js"];

fs.mkdirSync(path.join(root, "www"), { recursive: true });
for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(root, "www", file));
  console.log(`copied ${file} -> www/${file}`);
}
