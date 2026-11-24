// Checks the launch build after it is built: `pnpm build:launch` runs this and fails if it fails.
// Usage: node scripts/check-launch.mjs [dir]   (default: dist-launch)
//
// The launch build must not be able to send anything the user enters to a server. That is
// checked on the built files, not on the source: the script code that ships must contain
//   1. no trace of the note and photo reader (its address and its request fields), and
//   2. no network call, except the one place that sends anonymous counts, and that one only in
//      a build that was given a count address. The app is static files plus storage on the phone.
//   3. no source map: no .map file anywhere in the build, and no script that points to one.
// A switch in src/core/features.ts that is turned on by mistake, or code that reaches a hidden
// feature around its switch, shows up here as a failed build.
//
// Whether the build counts is read from VITE_COUNT_URL, the same variable the build reads. Give
// it to this check the same way as to the build (`VITE_COUNT_URL=... pnpm build:launch` does).
// - Not set: the build must open no connection at all. Not even one "fetch(" is accepted.
// - Set: exactly one "fetch(" is accepted, and it must be the counter: send() in
//   src/web/counting.ts. It is recognised by the options only that call uses (COUNTER_MARKS)
//   and by the count address being in the same file. Any other "fetch(" fails the build.
//
// The service worker (sw.js) is not a page script and is not scanned: it only requests the app's
// own files again, to keep them for offline use.
//
// If the launch build later gets another feature that really needs the network, describe its
// call here the way the counter is described, with the reason, in the same change.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist-launch';

/** Text that only the note and photo reader contains. */
const READER = ['/api/parse', 'api/parse', 'imageJpegBase64', 'createImageBitmap'];
/** Every way a page script can open a connection. */
const NETWORK = ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'RTCPeerConnection', 'importScripts('];
/**
 * What the counter's one fetch( call looks like in the built script: it sends no cookies and no
 * address of the page. Both options must follow the call within COUNTER_REACH characters.
 */
const COUNTER_MARKS = ['credentials:"omit"', 'referrerPolicy:"no-referrer"'];
const COUNTER_REACH = 400;
/** The count address this build was given, written the way the app keeps it. Empty: the build must not count. */
const countUrl = (process.env.VITE_COUNT_URL ?? '').trim().replace(/\/+$/, '');
/** An address in the page itself: every script, style and icon must come from the app's own files. */
const OUTSIDE_ADDRESS = /(?:src|href)\s*=\s*["'](?:https?:)?\/\//i;

const problems = [];
const assets = join(dir, 'assets');
if (!existsSync(join(dir, 'index.html')) || !existsSync(assets)) {
  console.error(`check-launch: ${dir} is not a build. Run "pnpm build:launch" first.`);
  process.exit(1);
}

for (const file of readdirSync(dir, { recursive: true })) {
  if (String(file).endsWith('.map')) problems.push(`${join(dir, String(file))} is a source map; the launch build must not ship one`);
}

const scripts = readdirSync(assets).filter((f) => f.endsWith('.js'));
if (scripts.length === 0) problems.push(`${assets} has no script file`);
/** How many times each network marker appears, all script files together. */
const found = Object.fromEntries(NETWORK.map((marker) => [marker, 0]));
/** fetch( calls that are the counter, and fetch( calls that are something else. */
let counterCalls = 0;
let otherFetches = 0;
for (const file of scripts) {
  const code = readFileSync(join(assets, file), 'utf8');
  for (const marker of READER) if (code.includes(marker)) problems.push(`${file} contains "${marker}": the note and photo reader is in the launch build`);
  if (code.includes('sourceMappingURL')) problems.push(`${file} points to a source map; the launch build must not ship one`);
  for (const marker of NETWORK) found[marker] += code.split(marker).length - 1;
  for (let at = code.indexOf('fetch('); at >= 0; at = code.indexOf('fetch(', at + 1)) {
    const call = code.slice(at, at + COUNTER_REACH);
    const isCounter = countUrl !== '' && COUNTER_MARKS.every((mark) => call.includes(mark)) && code.includes(countUrl);
    if (isCounter) counterCalls += 1;
    else otherFetches += 1;
  }
}
for (const marker of NETWORK) {
  if (marker === 'fetch(' || found[marker] === 0) continue;
  problems.push(`"${marker}" appears ${found[marker]} time${found[marker] === 1 ? '' : 's'} in the script files; the launch build must not use it`);
}
if (countUrl === '') {
  if (found['fetch('] > 0) {
    problems.push(
      `"fetch(" appears ${found['fetch(']} time${found['fetch('] === 1 ? '' : 's'} in the script files, but this build was given no count address, so it must not open any connection. ` +
        'If the build was given VITE_COUNT_URL, give this check the same value.',
    );
  }
} else {
  if (otherFetches > 0) problems.push(`"fetch(" appears ${otherFetches} time${otherFetches === 1 ? '' : 's'} outside the anonymous counter (send() in src/web/counting.ts); the launch build must not open any other connection`);
  if (counterCalls > 1) problems.push(`the anonymous counter's fetch( appears ${counterCalls} times; it must be one place`);
  if (counterCalls === 0 && otherFetches === 0) problems.push(`VITE_COUNT_URL is set (${countUrl}), but the build does not send counts. Was it built with the same value?`);
}
if (OUTSIDE_ADDRESS.test(readFileSync(join(dir, 'index.html'), 'utf8'))) problems.push('index.html loads a file from another site');

if (problems.length) {
  console.error(`check-launch: ${dir} is NOT a valid launch build:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('Is VITE_BUILD_PROFILE "launch" (see .env.launch), and are the switches in src/core/features.ts as intended?');
  process.exit(1);
}
const network = counterCalls ? `one network call site: anonymous counts to ${countUrl}` : 'no network calls';
console.log(`check-launch: ${dir} ok (${scripts.length} script file${scripts.length === 1 ? '' : 's'}, no note or photo reader, ${network}, no source map)`);
