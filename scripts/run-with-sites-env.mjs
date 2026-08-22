import { createSitesEnvironment, reportFailure, runLocalBin, runNodeScript } from "./lib/sites-runtime.mjs";

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  const mode = args.shift();
  const target = args.shift();
  if (!target || !["--bin", "--node"].includes(mode)) {
    throw new Error("Usage: node scripts/run-with-sites-env.mjs --bin <name> [args] | --node <file> [args]");
  }

  const { environment, projectRoot } = createSitesEnvironment();
  if (mode === "--node") {
    await runNodeScript(target, args, { environment, cwd: projectRoot });
    return;
  }

  const packageNames = {
    eslint: "eslint",
    tsc: "typescript",
    "drizzle-kit": "drizzle-kit",
  };
  const packageName = packageNames[target] ?? target;
  await runLocalBin(packageName, target, args, { environment, cwd: projectRoot });
}

main().catch(reportFailure);
