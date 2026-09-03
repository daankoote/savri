import { existsSync, realpathSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CLASSIFICATION = Object.freeze({
  ALLOW: "ALLOW",
  DENY: "DENY",
  DEFER: "DEFER",
});

export const MAX_WRAPPER_DEPTH = 3;

const ROOT = realpathSync(
  resolve(fileURLToPath(new URL("../../", import.meta.url))),
);
const SHELLS = new Set(["zsh", "bash", "sh"]);
const GIT_MUTATIONS = new Set([
  "add",
  "am",
  "apply",
  "bisect",
  "branch",
  "checkout-index",
  "checkout",
  "cherry-pick",
  "clean",
  "clone",
  "commit",
  "commit-graph",
  "config",
  "fast-import",
  "fetch",
  "filter-branch",
  "gc",
  "index-pack",
  "init",
  "maintenance",
  "merge",
  "mv",
  "notes",
  "pack-refs",
  "prune",
  "pull",
  "push",
  "rebase",
  "reflog",
  "remote",
  "reset",
  "restore",
  "revert",
  "replace",
  "repack",
  "rm",
  "sparse-checkout",
  "stash",
  "submodule",
  "switch",
  "tag",
  "update-index",
  "update-ref",
  "worktree",
]);
const NETWORK_CLIENTS = new Set([
  "curl",
  "ftp",
  "nc",
  "netcat",
  "rsync",
  "scp",
  "sftp",
  "ssh",
  "telnet",
  "wget",
]);
const GENERIC_DATABASE_TOOLS = new Set([
  "createdb",
  "dropdb",
  "mysql",
  "mysqladmin",
  "pg_restore",
  "psql",
  "redis-cli",
  "sqlite3",
]);
const SYSTEM_TOOLS = new Set([
  "chflags",
  "chmod",
  "chown",
  "csrutil",
  "doas",
  "dscl",
  "security",
  "spctl",
  "sudo",
  "visudo",
  "xattr",
]);
const SAFE_SHORT_RG_FLAGS = new Set([
  "A",
  "a",
  "B",
  "b",
  "c",
  "F",
  "H",
  "h",
  "i",
  "L",
  "l",
  "M",
  "N",
  "n",
  "p",
  "S",
  "s",
  "U",
  "u",
  "v",
  "w",
  "x",
  "0",
]);
const SAFE_LONG_RG_FLAGS = new Set([
  "--binary",
  "--block-buffered",
  "--byte-offset",
  "--case-sensitive",
  "--column",
  "--count",
  "--count-matches",
  "--crlf",
  "--debug",
  "--files-with-matches",
  "--files-without-match",
  "--fixed-strings",
  "--heading",
  "--help",
  "--hidden",
  "--ignore-case",
  "--include-zero",
  "--invert-match",
  "--json",
  "--line-buffered",
  "--line-number",
  "--line-regexp",
  "--messages",
  "--multiline",
  "--multiline-dotall",
  "--no-config",
  "--no-heading",
  "--no-ignore",
  "--no-ignore-dot",
  "--no-ignore-exclude",
  "--no-ignore-files",
  "--no-ignore-global",
  "--no-ignore-messages",
  "--no-ignore-parent",
  "--no-ignore-vcs",
  "--no-messages",
  "--no-require-git",
  "--no-unicode",
  "--null",
  "--null-data",
  "--one-file-system",
  "--only-matching",
  "--passthru",
  "--pcre2",
  "--pcre2-unicode",
  "--pretty",
  "--quiet",
  "--smart-case",
  "--stats",
  "--text",
  "--trim",
  "--type-list",
  "--unicode",
  "--version",
  "--vimgrep",
  "--with-filename",
  "--word-regexp",
]);
const SAFE_LONG_RG_VALUE_FLAGS = new Set([
  "--after-context",
  "--before-context",
  "--color",
  "--colors",
  "--context",
  "--context-separator",
  "--dfa-size-limit",
  "--encoding",
  "--engine",
  "--field-context-separator",
  "--field-match-separator",
  "--glob",
  "--hyperlink-format",
  "--iglob",
  "--max-columns",
  "--max-count",
  "--max-depth",
  "--max-filesize",
  "--path-separator",
  "--regex-size-limit",
  "--replace",
  "--sort",
  "--sortr",
  "--type",
  "--type-add",
  "--type-clear",
  "--type-not",
]);

function result(classification, reason) {
  return Object.freeze({ classification, reason });
}

function commandName(token) {
  return basename(token ?? "");
}

function isWithinRoot(path, cwd) {
  const absolute = resolve(cwd, path);
  let checked = absolute;
  if (existsSync(absolute)) {
    try {
      checked = realpathSync(absolute);
    } catch {
      return false;
    }
  }
  return checked === ROOT || checked.startsWith(`${ROOT}/`);
}

function validCwd(cwd) {
  try {
    return isWithinRoot(".", cwd);
  } catch {
    return false;
  }
}

function lex(script) {
  const commands = [];
  let words = [];
  let word = "";
  let wordStarted = false;
  let quote = null;

  const pushWord = () => {
    if (!wordStarted) return;
    words.push(word);
    word = "";
    wordStarted = false;
  };
  const pushCommand = () => {
    pushWord();
    if (words.length === 0) throw new Error("empty_command");
    commands.push(words);
    words = [];
  };

  for (let index = 0; index < script.length; index += 1) {
    const character = script[index];

    if (quote === "single") {
      if (character === "'") quote = null;
      else word += character;
      wordStarted = true;
      continue;
    }

    if (quote === "double") {
      if (character === '"') {
        quote = null;
      } else if (character === "\\") {
        const next = script[++index];
        if (next === undefined) throw new Error("dangling_escape");
        word += next;
      } else if (character === "$" || character === "`") {
        throw new Error("shell_expansion");
      } else {
        word += character;
      }
      wordStarted = true;
      continue;
    }

    if (character === "'") {
      quote = "single";
      wordStarted = true;
      continue;
    }
    if (character === '"') {
      quote = "double";
      wordStarted = true;
      continue;
    }
    if (character === "\\") {
      const next = script[++index];
      if (next === undefined || next === "\n") {
        throw new Error("shell_continuation");
      }
      word += next;
      wordStarted = true;
      continue;
    }
    if (character === "$" || character === "`") {
      throw new Error("shell_expansion");
    }
    if ("|&<>(){}".includes(character)) {
      if (character === "&" && script[index + 1] === "&") {
        pushCommand();
        index += 1;
        continue;
      }
      throw new Error("unsupported_shell_control");
    }
    if (character === ";" || character === "\n") {
      pushCommand();
      continue;
    }
    if (/\s/.test(character)) {
      pushWord();
      continue;
    }
    if (character === "#" && !wordStarted) throw new Error("shell_comment");
    if ("*?[".includes(character)) throw new Error("shell_glob");
    word += character;
    wordStarted = true;
  }

  if (quote !== null) throw new Error("unterminated_quote");
  pushWord();
  if (words.length > 0) commands.push(words);
  if (commands.length === 0) throw new Error("empty_script");
  return commands;
}

function shellScript(words) {
  if (
    SHELLS.has(commandName(words[0])) && words.length >= 3 &&
    ["-c", "-lc", "-cl"].includes(words[1])
  ) return words[2];
  return null;
}

function gitSubcommand(words) {
  if (commandName(words[0]) !== "git") return null;
  const optionsWithValues = new Set([
    "-C",
    "-c",
    "--exec-path",
    "--git-dir",
    "--namespace",
    "--super-prefix",
    "--work-tree",
  ]);
  const optionsWithoutValues = new Set([
    "--bare",
    "--html-path",
    "--info-path",
    "--literal-pathspecs",
    "--man-path",
    "--no-lazy-fetch",
    "--no-optional-locks",
    "--no-pager",
    "--no-replace-objects",
    "--paginate",
    "-P",
    "-p",
    "--version",
  ]);
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    if (optionsWithValues.has(word)) {
      index += 1;
      continue;
    }
    if (
      [
        "--exec-path",
        "--git-dir",
        "--namespace",
        "--super-prefix",
        "--work-tree",
      ].some((name) => word.startsWith(`${name}=`))
    ) continue;
    if (optionsWithoutValues.has(word)) continue;
    if (word.startsWith("-")) return null;
    return { operation: word, index };
  }
  return null;
}

function deployGate(words) {
  const executable = commandName(words[0]).toLowerCase();
  const deployScript = words.slice(1).some((word) =>
    /(^|[-_.])deploy($|[-_.])/.test(basename(word).toLowerCase())
  );
  if (
    deployScript && ["bash", "deno", "node", "sh", "zsh"].includes(executable)
  ) {
    return true;
  }
  if (executable === "make" && words.slice(1).includes("deploy")) return true;
  if (
    ["npm", "pnpm", "yarn", "bun"].includes(executable) &&
    ["run", "run-script"].includes(words[1]) &&
    words[2] === "deploy"
  ) return true;
  if (executable === "netlify" && [undefined, "deploy"].includes(words[1])) {
    return true;
  }
  if (
    executable === "vercel" &&
    [undefined, "deploy", "--prod"].includes(words[1])
  ) return true;
  if (
    executable === "wrangler" &&
    ["deploy", "publish", "delete"].includes(words[1])
  ) return true;
  return false;
}

function dependencyGate(words) {
  const executable = commandName(words[0]).toLowerCase();
  const operation = words[1]?.toLowerCase();
  const denied = {
    npm: ["add", "ci", "exec", "i", "install", "remove", "uninstall", "update"],
    npx: [undefined],
    pnpm: [
      "add",
      "dlx",
      "exec",
      "i",
      "import",
      "install",
      "remove",
      "rm",
      "uninstall",
      "update",
      "up",
    ],
    yarn: [
      undefined,
      "add",
      "dlx",
      "install",
      "remove",
      "set",
      "up",
      "upgrade",
    ],
    bun: ["add", "install", "remove", "rm", "update", "upgrade", "x"],
    deno: ["add", "cache", "install", "remove", "uninstall", "upgrade"],
    pip: ["install", "uninstall"],
    pip3: ["install", "uninstall"],
    poetry: ["add", "install", "remove", "update"],
    uv: ["add", "remove", "sync"],
    cargo: ["add", "install", "uninstall", "update"],
    composer: ["install", "remove", "require", "update"],
    brew: ["install", "reinstall", "uninstall", "update", "upgrade"],
  };
  if (!(executable in denied)) return false;
  if (executable === "npx") return true;
  if (executable === "uv" && operation === "pip") {
    return ["install", "uninstall", "sync"].includes(words[2]?.toLowerCase());
  }
  return denied[executable].includes(operation);
}

function supabaseGate(words) {
  if (commandName(words[0]) !== "supabase") return false;
  const first = words[1]?.toLowerCase();
  const second = words[2]?.toLowerCase();
  if (["link", "unlink", "secrets"].includes(first)) return true;
  if (first === "db" && ["push", "reset", "dump"].includes(second)) return true;
  if (first === "migration" && ["up", "repair", "squash"].includes(second)) {
    return true;
  }
  if (first === "functions" && ["deploy", "delete"].includes(second)) {
    return true;
  }
  if (first === "projects" && ["create", "delete"].includes(second)) {
    return true;
  }
  return false;
}

function dockerGate(words) {
  if (commandName(words[0]) !== "docker") return false;
  return new Set([
    "build",
    "compose",
    "container",
    "exec",
    "kill",
    "network",
    "plugin",
    "pull",
    "push",
    "restart",
    "rm",
    "rmi",
    "run",
    "start",
    "stop",
    "system",
    "trust",
    "volume",
  ]).has(words[1]?.toLowerCase());
}

function secretsGate(words) {
  const executable = commandName(words[0]).toLowerCase();
  if (executable === "gh" && words[1] === "secret") return true;
  if (executable === "op" && ["item", "document", "vault"].includes(words[1])) {
    return ["create", "delete", "edit"].includes(words[2]);
  }
  if (
    executable === "defaults" &&
    ["write", "delete", "rename"].includes(words[1])
  ) return true;
  if (executable === "sysctl" && words.includes("-w")) return true;
  return false;
}

function guardedWrapperGate(words, cwd) {
  if (sameScript(words, cwd, "scripts/tools/enval-supabase-target.mjs")) {
    const operationIndex = words.indexOf("--operation", 2);
    return operationIndex >= 0 &&
      ["start", "stop", "db-reset"].includes(words[operationIndex + 1]);
  }
  if (sameScript(words, cwd, "scripts/tools/enval-verify.mjs")) {
    const modeIndex = words.indexOf("--mode", 2);
    return modeIndex >= 0 && words[modeIndex + 1]?.toUpperCase() === "RELEASE";
  }
  return false;
}

function hardGate(words, cwd) {
  const executable = commandName(words[0]).toLowerCase();
  const git = gitSubcommand(words);
  if (git && GIT_MUTATIONS.has(git.operation.toLowerCase())) {
    const operation = git.operation.toLowerCase();
    const args = words.slice(git.index + 1);
    if (operation === "branch" && classifyGitBranch(args)) return false;
    if (operation === "worktree" && classifyGitWorktree(args)) return false;
    if (
      operation === "remote" &&
      args.every((argument) => ["-v", "--verbose"].includes(argument))
    ) {
      return false;
    }
    return true;
  }
  if (
    executable === "git" &&
    words.some((word) =>
      word === "-c" || word === "--exec-path" ||
      word.startsWith("--exec-path=") || word === "--config-env" ||
      word.startsWith("--config-env=")
    )
  ) return true;
  if (deployGate(words) || dependencyGate(words) || supabaseGate(words)) {
    return true;
  }
  if (
    dockerGate(words) || secretsGate(words) || guardedWrapperGate(words, cwd)
  ) return true;
  if (
    NETWORK_CLIENTS.has(executable) || GENERIC_DATABASE_TOOLS.has(executable)
  ) return true;
  if (SYSTEM_TOOLS.has(executable)) return true;
  return false;
}

function safeRepoPath(path, cwd) {
  return path !== "-" && !path.startsWith("~") && isWithinRoot(path, cwd);
}

function classifyPwd(words) {
  return words.slice(1).every((word) => ["-L", "-P"].includes(word));
}

function classifySimpleRead(words, cwd) {
  const executable = commandName(words[0]);
  const args = words.slice(1);
  const files = [];
  let afterOptions = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!afterOptions && argument === "--") {
      afterOptions = true;
      continue;
    }
    if (!afterOptions && argument.startsWith("-")) {
      if (executable === "cat") {
        if (
          !/^-[AbEnsTuv]+$/.test(argument) &&
          ![
            "--number",
            "--number-nonblank",
            "--squeeze-blank",
            "--show-ends",
            "--show-tabs",
            "--show-nonprinting",
            "--show-all",
          ].includes(argument)
        ) return false;
      } else if (executable === "wc") {
        if (
          !/^-[clmwL]+$/.test(argument) &&
          !["--bytes", "--chars", "--lines", "--max-line-length", "--words"]
            .includes(argument)
        ) return false;
      } else if (["head", "tail"].includes(executable)) {
        if (
          ["-f", "-F", "--follow", "--retry", "--pid"].some((flag) =>
            argument === flag || argument.startsWith(`${flag}=`)
          )
        ) return false;
        if (["-n", "--lines", "-c", "--bytes"].includes(argument)) {
          const count = args[++index];
          if (!/^[+-]?\d+$/.test(count ?? "")) return false;
        } else if (
          !/^(?:-[0-9]+|--(?:lines|bytes)=[+-]?\d+|-q|--quiet|--silent|-v|--verbose|-z|--zero-terminated)$/
            .test(argument)
        ) return false;
      }
      continue;
    }
    files.push(argument);
  }
  return files.length > 0 && files.every((path) => safeRepoPath(path, cwd));
}

function classifySed(words, cwd) {
  const args = words.slice(1);
  if (args.length < 3 || args[0] !== "-n") return false;
  const program = args[1];
  const printOnly = /^(?:\d+|\$)(?:,(?:\d+|\$))?p$/.test(program) ||
    /^\/[^/\n]+\/p$/.test(program);
  return printOnly && args.slice(2).every((path) => safeRepoPath(path, cwd));
}

function classifyRg(words, cwd) {
  const args = words.slice(1);
  if (args.length === 0) return false;
  const paths = [];
  let patternSeen = false;
  let filesMode = false;
  let afterOptions = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!afterOptions && argument === "--") {
      afterOptions = true;
      continue;
    }
    if (
      !afterOptions && (argument === "--pre" || argument.startsWith("--pre="))
    ) return false;
    if (!afterOptions && argument === "--files") {
      filesMode = true;
      patternSeen = true;
      continue;
    }
    if (
      !afterOptions &&
      ["-g", "-t", "-T", "-m", "-C", "-A", "-B"].includes(argument)
    ) {
      if (args[++index] === undefined) return false;
      continue;
    }
    if (
      !afterOptions &&
      ["-f", "--file", "--ignore-file", "--pre-glob"].includes(argument)
    ) return false;
    if (!afterOptions && ["-e", "--regexp"].includes(argument)) {
      if (args[++index] === undefined) return false;
      patternSeen = true;
      continue;
    }
    if (!afterOptions && argument.startsWith("--") && argument.includes("=")) {
      const name = argument.slice(0, argument.indexOf("="));
      if (["--file", "--ignore-file", "--pre", "--pre-glob"].includes(name)) {
        return false;
      }
      if (!SAFE_LONG_RG_VALUE_FLAGS.has(name)) return false;
      continue;
    }
    if (!afterOptions && SAFE_LONG_RG_VALUE_FLAGS.has(argument)) {
      if (args[++index] === undefined) return false;
      continue;
    }
    if (!afterOptions && argument.startsWith("--")) {
      if (!SAFE_LONG_RG_FLAGS.has(argument)) return false;
      continue;
    }
    if (!afterOptions && /^-[A-Za-z0-9]+$/.test(argument)) {
      if (
        ![...argument.slice(1)].every((flag) => SAFE_SHORT_RG_FLAGS.has(flag))
      ) return false;
      continue;
    }
    if (!patternSeen && !filesMode) {
      patternSeen = true;
      continue;
    }
    paths.push(argument);
  }

  return patternSeen &&
    (paths.length === 0 || paths.every((path) => safeRepoPath(path, cwd)));
}

function classifyGitBranch(args) {
  if (args.length === 1 && args[0] === "--show-current") return true;
  if (args[0] !== "--list") return false;

  let afterOptions = false;
  for (const argument of args.slice(1)) {
    if (!afterOptions && argument === "--") {
      afterOptions = true;
      continue;
    }
    if (!afterOptions && argument.startsWith("-")) return false;
  }
  return true;
}

function classifyGitWorktree(args) {
  if (args[0] !== "list") return false;
  return args.slice(1).every((argument) =>
    ["-v", "--verbose", "--porcelain", "-z"].includes(argument)
  );
}

function classifyGit(words) {
  const parsed = gitSubcommand(words);
  if (!parsed || parsed.index !== 1) return false;
  const operation = parsed.operation;
  const args = words.slice(parsed.index + 1);
  if (operation === "status") {
    const optionsWithValues = new Set([
      "--find-renames",
      "--ignored",
      "--untracked-files",
    ]);
    for (let index = 0; index < args.length; index += 1) {
      const argument = args[index];
      if (optionsWithValues.has(argument) && args[++index] === undefined) {
        return false;
      }
      if (!argument.startsWith("-") && args[index - 1] !== "--") return false;
    }
    return true;
  }
  if (operation === "rev-parse") return args.length > 0;
  if (["diff", "log", "show"].includes(operation)) {
    if (
      args.some((argument) =>
        argument === "--ext-diff" || argument === "--textconv" ||
        argument === "--no-index" || argument === "--output" ||
        argument.startsWith("--output=")
      )
    ) return false;
    return true;
  }
  if (operation === "branch") return classifyGitBranch(args);
  if (operation === "worktree") return classifyGitWorktree(args);
  return false;
}

function sameScript(words, cwd, relativePath) {
  return words.length >= 2 && commandName(words[0]) === "node" &&
    resolve(cwd, words[1]) === resolve(ROOT, relativePath);
}

function classifyVerifier(words, cwd) {
  if (!sameScript(words, cwd, "scripts/tools/enval-verify.mjs")) return false;
  const args = words.slice(2);
  let mode = null;
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--mode" && !seen.has(argument)) {
      mode = args[++index]?.toUpperCase() ?? null;
      seen.add(argument);
    } else if (
      ["--dry-run", "--json"].includes(argument) && !seen.has(argument)
    ) {
      seen.add(argument);
    } else {
      return false;
    }
  }
  return ["QUICK", "TARGETED"].includes(mode);
}

function classifyGuarded(words, cwd) {
  if (classifyVerifier(words, cwd)) return true;
  if (sameScript(words, cwd, "scripts/proofs/enval-verify-runner.proof.mjs")) {
    return words.length === 2;
  }
  if (sameScript(words, cwd, "scripts/tools/enval-readonly-sql.mjs")) {
    return words.length === 4 && words[2] === "--proof-id" &&
      words[3] === "enval-local-readonly-catalog";
  }
  if (sameScript(words, cwd, "scripts/tools/enval-local-dev.mjs")) {
    const args = words.slice(2);
    let operation = null;
    let viteUrl = "http://127.0.0.1:5175";
    const seen = new Set();
    for (let index = 0; index < args.length; index += 1) {
      const argument = args[index];
      if (argument === "--operation" && !seen.has(argument)) {
        operation = args[++index] ?? null;
        seen.add(argument);
      } else if (argument === "--vite-url" && !seen.has(argument)) {
        viteUrl = args[++index] ?? "";
        seen.add(argument);
      } else return false;
    }
    try {
      const parsed = new URL(viteUrl);
      return ["ready", "serve"].includes(operation) &&
        parsed.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(parsed.hostname) &&
        ["5174", "5175"].includes(parsed.port) && parsed.pathname === "/" &&
        parsed.username === "" && parsed.password === "" &&
        parsed.search === "" && parsed.hash === "";
    } catch {
      return false;
    }
  }
  if (sameScript(words, cwd, "scripts/tools/enval-supabase-target.mjs")) {
    const args = words.slice(2);
    let target = null;
    let operation = "inspect";
    const seen = new Set();
    for (let index = 0; index < args.length; index += 1) {
      const argument = args[index];
      if (argument === "--target" && !seen.has(argument)) {
        target = args[++index] ?? null;
        seen.add(argument);
      } else if (argument === "--operation" && !seen.has(argument)) {
        operation = args[++index] ?? null;
        seen.add(argument);
      } else return false;
    }
    return ["CONTROL_PLANE", "TENANT_ENVAL"].includes(target) &&
      ["inspect", "status"].includes(operation);
  }
  if (commandName(words[0]) === "docker" && words[1] === "ps") {
    return words.slice(2).every((argument, index, args) => {
      if (["--format", "--filter"].includes(argument)) {
        return args[index + 1] !== undefined;
      }
      if (index > 0 && ["--format", "--filter"].includes(args[index - 1])) {
        return true;
      }
      return argument.startsWith("-");
    });
  }
  return false;
}

function classifyOperation(words, cwd) {
  if (
    ["command", "exec", "env", "nohup", "time"].includes(commandName(words[0]))
  ) {
    const executable = commandName(words[0]);
    let index = 1;
    while (index < words.length) {
      const word = words[index];
      if (word === "--") {
        index += 1;
        break;
      }
      if (executable === "env" && /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(word)) {
        index += 1;
        continue;
      }
      if (
        executable === "env" &&
        ["-u", "--unset", "-C", "--chdir"].includes(word)
      ) {
        index += 2;
        continue;
      }
      if (word.startsWith("-")) {
        index += 1;
        continue;
      }
      break;
    }
    const inner = words.slice(index);
    const classified = inner.length > 0
      ? classifyOperation(inner, cwd)
      : result(CLASSIFICATION.DEFER, "UNSUPPORTED_TRANSPORT");
    return classified.classification === CLASSIFICATION.DENY
      ? classified
      : result(CLASSIFICATION.DEFER, "UNSUPPORTED_TRANSPORT");
  }
  if (commandName(words[0]) === "eval") {
    return result(CLASSIFICATION.DENY, "HUMAN_GATE");
  }
  if (hardGate(words, cwd)) return result(CLASSIFICATION.DENY, "HUMAN_GATE");
  const executable = commandName(words[0]);
  if (executable === "pwd" && classifyPwd(words)) {
    return result(CLASSIFICATION.ALLOW, "READ_ONLY_REPO");
  }
  if (
    ["cat", "head", "tail", "wc"].includes(executable) &&
    classifySimpleRead(words, cwd)
  ) {
    return result(CLASSIFICATION.ALLOW, "READ_ONLY_REPO");
  }
  if (executable === "sed" && classifySed(words, cwd)) {
    return result(CLASSIFICATION.ALLOW, "READ_ONLY_REPO");
  }
  if (executable === "rg" && classifyRg(words, cwd)) {
    return result(CLASSIFICATION.ALLOW, "READ_ONLY_REPO");
  }
  if (executable === "git" && classifyGit(words)) {
    return result(CLASSIFICATION.ALLOW, "READ_ONLY_GIT");
  }
  if (classifyGuarded(words, cwd)) {
    return result(CLASSIFICATION.ALLOW, "GUARDED_ENVAL");
  }
  return result(CLASSIFICATION.DEFER, "UNCLASSIFIED");
}

function classifyCommands(commands, cwd, depth) {
  const results = [];
  for (const words of commands) {
    const innerScript = shellScript(words);
    if (innerScript !== null) {
      if (depth >= MAX_WRAPPER_DEPTH) {
        results.push(result(CLASSIFICATION.DEFER, "WRAPPER_DEPTH"));
        continue;
      }
      const classified = classifyScript(innerScript, { cwd, depth: depth + 1 });
      results.push(
        words.length === 3 || classified.classification === CLASSIFICATION.DENY
          ? classified
          : result(CLASSIFICATION.DEFER, "WRAPPER_ARGUMENTS"),
      );
    } else {
      results.push(classifyOperation(words, cwd));
    }
  }
  const denied = results.find((entry) =>
    entry.classification === CLASSIFICATION.DENY
  );
  if (denied) return denied;
  const deferred = results.find((entry) =>
    entry.classification === CLASSIFICATION.DEFER
  );
  if (deferred) return deferred;
  const reasons = [...new Set(results.map((entry) => entry.reason))];
  return result(CLASSIFICATION.ALLOW, reasons.join("+"));
}

export function classifyScript(script, { cwd = ROOT, depth = 0 } = {}) {
  if (
    typeof script !== "string" || script.length === 0 || script.length > 32_768
  ) {
    return result(CLASSIFICATION.DEFER, "INVALID_INPUT");
  }
  if (!validCwd(cwd)) return result(CLASSIFICATION.DEFER, "OUTSIDE_REPOSITORY");
  let commands;
  try {
    commands = lex(script);
  } catch (error) {
    return result(CLASSIFICATION.DEFER, error.message.toUpperCase());
  }
  return classifyCommands(commands, cwd, depth);
}

export { ROOT };
