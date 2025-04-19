import fs from "fs"
import { spawnSync } from "child_process"
import ffmpegStatic from "ffmpeg-static"

// Usage: ts-node verify-mp3.ts path/to/file.mp3

const filePath = process.argv[2]

if (!filePath) {
  console.error("Please provide a file path")
  process.exit(1)
}

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`)
  process.exit(1)
}

console.log(`Verifying MP3 file: ${filePath}`)
console.log(`File size: ${fs.statSync(filePath).size} bytes`)

// Check file format
console.log("\n=== File Format ===")
const fileCommand = spawnSync("file", [filePath])
console.log(fileCommand.stdout.toString())

// Check MP3 format details
console.log("\n=== FFprobe Format Info ===")
const probe = spawnSync(ffmpegStatic!, [
  "-v",
  "error",
  "-show_entries",
  "format=format_name,format_long_name,duration,bit_rate:stream=codec_name,codec_long_name",
  "-of",
  "default=noprint_wrappers=1",
  filePath,
])
console.log(probe.stdout.toString())

// Check ID3 tags
console.log("\n=== ID3 Tags ===")
const id3Command = spawnSync(ffmpegStatic!, [
  "-v",
  "error",
  "-show_entries",
  "format_tags",
  "-of",
  "default=noprint_wrappers=1",
  filePath,
])
console.log(id3Command.stdout.toString())

// Check for Xing header
console.log("\n=== Checking for Xing/VBR header ===")
const hexdump = spawnSync("hexdump", ["-C", "-n", "1024", filePath])
const hexOutput = hexdump.stdout.toString()
if (hexOutput.includes("Xing") || hexOutput.includes("Info")) {
  console.log("✅ Xing/Info header found")
} else {
  console.log("❌ No Xing/Info header found")
}

console.log("\nVerification complete!")
