#!/usr/bin/env node
/**
 * `brain` binary entry — wires {@link run} to the real process (argv, env, stdout/stderr) and sets
 * the exit code. All logic lives in `run.ts`; this file is intentionally trivial.
 */
import { run } from './run.js';

run(process.argv.slice(2), {
  env: process.env,
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
})
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
