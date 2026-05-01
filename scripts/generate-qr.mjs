#!/usr/bin/env node
/**
 * Prints an SVG QR code for the homepage (pipe to a file or print from your editor).
 *
 * Usage:
 *   node scripts/generate-qr.mjs https://your-site.example
 *   NEXT_PUBLIC_SITE_URL=https://your-site.example node scripts/generate-qr.mjs
 */

import QRCode from "qrcode";

const url =
  process.argv[2]?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();

if (!url) {
  console.error(
    "Provide a URL argument or set NEXT_PUBLIC_SITE_URL.\nExample: node scripts/generate-qr.mjs https://wedding.example",
  );
  process.exit(1);
}

const svg = await QRCode.toString(url, {
  type: "svg",
  margin: 1,
  width: 280,
  color: { dark: "#4A4A4AFF", light: "#FFFFFFFF" },
});

process.stdout.write(svg);
