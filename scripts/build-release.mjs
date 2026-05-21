import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { validateExtension } from './validate-extension.mjs';

const root = process.cwd();
const { manifest, releaseFiles } = validateExtension(root);
const releaseTag = getReleaseTag(manifest.version);
const zipName = `humble-owned-overlay-${releaseTag}.zip`;
const distDir = path.join(root, 'dist');
const zipPath = path.join(distDir, zipName);

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(zipPath, createZip(root, releaseFiles));

console.log(`Built ${path.relative(root, zipPath)}`);
console.log(`Packaged files: ${releaseFiles.join(', ')}`);

function getReleaseTag(version) {
  const envTag = process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME;
  if (!envTag) return `v${version}-canary.local`;

  const match = /^v(\d+\.\d+\.\d+)-canary\.(\d+)$/.exec(envTag);
  if (!match) {
    throw new Error(`Release tag must look like v${version}-canary.N: ${envTag}`);
  }
  if (match[1] !== version) {
    throw new Error(`Release tag version ${match[1]} does not match manifest version ${version}`);
  }
  return envTag;
}

function createZip(baseDir, files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.replace(/\\/g, '/'));
    const source = fs.readFileSync(path.join(baseDir, file));
    const compressed = zlib.deflateRawSync(source, { level: 9 });
    const crc = crc32(source);
    const { time, date } = dosDateTime(new Date('2026-01-01T00:00:00Z'));

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(source.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(source.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function dosDateTime(dateValue) {
  const year = Math.max(1980, dateValue.getUTCFullYear());
  const month = dateValue.getUTCMonth() + 1;
  const day = dateValue.getUTCDate();
  const hours = dateValue.getUTCHours();
  const minutes = dateValue.getUTCMinutes();
  const seconds = Math.floor(dateValue.getUTCSeconds() / 2);

  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: ((year - 1980) << 9) | (month << 5) | day
  };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < CRC_TABLE.length; i += 1) {
  let value = i;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  CRC_TABLE[i] = value >>> 0;
}
