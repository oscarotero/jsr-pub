import { expandGlob } from "jsr:@std/fs@0.229.3/expand-glob";
import { join } from "jsr:@std/path@0.225.2/join";
import { parseArgs } from "jsr:@std/cli@0.224.6/parse-args";

interface JSR {
  name: string;
  version: string;
  exports: string | Record<string, string>;
}

interface Options {
  name: string;
  version?: string;
  exports?: string;
  ignored?: string;
}

export async function main(options: Options): Promise<void> {
  const data = await jsr(options);
  const [file, config] = getConfig();
  Object.assign(config, data);
  await Deno.writeTextFile(file, JSON.stringify(config, null, 2));

  console.log(`Updated ${file}`);
}

export async function jsr(options: Options): Promise<JSR> {
  return {
    name: options.name,
    version: await getVersion(options.version),
    exports: await getExports(
      options.exports?.split(",") || ["./*.ts", "./**/*.ts"],
    ),
  };
}

async function getVersion(version?: string): Promise<string> {
  const v = version?.trim() || await getLatestTag();

  if (!v) {
    throw new Error("No version found");
  }

  if (v.startsWith("v")) {
    return v.slice(1);
  }

  return v;
}

async function getExports(paths: string[]): Promise<Record<string, string>> {
  const exports: Record<string, string> = {};
  const root = Deno.cwd();

  for (const path of paths) {
    for await (const entry of expandGlob(path, { root })) {
      if (entry.isDirectory) {
        continue;
      }
      const name = "." + join("/", entry.path.slice(root.length));

      if (!mustBeIgnored(name)) {
        if (name.match(/^\.\/mod\.\w+$/)) {
          exports["."] = name;
        } else {
          exports[name] = name;
        }
      }
    }
  }

  return exports;
}

function mustBeIgnored(path: string): boolean {
  const extensions = [".ts", ".js", ".tsx", ".jsx", ".mjs"];
  const fileExtension = path.slice(path.lastIndexOf("."));

  if (!extensions.includes(fileExtension)) {
    return true;
  }

  return path.includes("/tests/") ||
    path.includes("/test/") ||
    path.includes("/docs/") ||
    path.includes("/deps.") ||
    path.includes("/deps/") ||
    path.includes("/node_modules/") ||
    path.endsWith(".d.ts") ||
    path.includes("/test.") ||
    path.includes(".test.") ||
    path.includes("_test.") ||
    path.includes("/bench.") ||
    path.includes(".bench.") ||
    path.includes("_bench.") ||
    path.includes("/.") ||
    path.includes("/_");
}

async function getLatestTag(): Promise<string | undefined> {
  const command = new Deno.Command("git", {
    args: ["describe", "--tags", "--abbrev=0"],
  });

  const { stdout } = await command.output();
  const tag = new TextDecoder().decode(stdout).trim();

  if (tag.match(/^v?\d+\.\d+\.\d+$/)) {
    return tag;
  }
}

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    string: ["name", "version", "exports"],
  });

  if (!args.name) {
    throw new Error("Missing name");
  }

  await main({
    name: args.name,
    version: args.version,
    exports: args.exports,
  });
}

// deno-lint-ignore no-explicit-any
function getConfig(): [string, Record<string, any>] {
  const files = ["deno.json", "deno.jsonc", "jsr.json", "jsr.jsonc"];

  for (const file of files) {
    try {
      const content = Deno.readTextFileSync(file);
      return [file, JSON.parse(content)];
    } catch {
      // Ignore
    }
  }

  return ["jsr.json", {}];
}
