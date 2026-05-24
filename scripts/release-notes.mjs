import fs from 'node:fs';

const tag = process.argv[2] || process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME;
if (!tag) {
  console.error('Release tag is required');
  process.exit(1);
}

const changelogPath = 'CHANGELOG.md';
const commitSha = process.env.GITHUB_SHA || 'unknown';
const notes = findChangelogEntry(changelogPath, tag) || fallbackNotes(tag, commitSha);
process.stdout.write(`${notes}\n`);

function findChangelogEntry(filePath, releaseTag) {
  if (!fs.existsSync(filePath)) return '';
  const changelog = fs.readFileSync(filePath, 'utf8');
  const escapedTag = releaseTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^##\\s+${escapedTag}\\s*$`, 'm');
  const match = heading.exec(changelog);
  if (!match) return '';

  const start = match.index + match[0].length;
  const rest = changelog.slice(start).replace(/^\r?\n/, '');
  const nextHeading = rest.search(/^##\s+/m);
  const entry = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  return entry.trim();
}

function fallbackNotes(releaseTag, sha) {
  return [
    `Canary build for ${releaseTag}.`,
    '',
    `Commit: ${sha}`
  ].join('\n');
}
