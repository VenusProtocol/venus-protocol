/**
 * Fails if a contract's storage layout is no longer a compatible upgrade of the implementation
 * currently running behind its proxy.
 *
 * Two sides are compared. The old side is the `storageLayout` recorded in
 * deployments/<network>/<Name>_Implementation.json, the layout of the bytecode actually live on
 * chain. The new side is the layout of today's source, read from artifacts/build-info, so a
 * `yarn hardhat compile` has to have run first or every contract reports as missing. Nothing here
 * touches the network.
 *
 * On a pull request the old side is read from the base branch rather than the working tree. A
 * deploy PR overwrites the implementation artifact, so reading the working tree would compare the
 * new source against an artifact generated from that same source and pass for free, exactly when
 * an upgrade is shipping. Reading the base ref keeps the live layout as the reference. A
 * deployment absent from the base branch is new and has nothing to stay compatible with.
 *
 * Appending a variable is a legal upgrade and passes. Inserting, deleting, reordering, resizing,
 * retyping or renaming one shifts every slot after it and fails. That distinction is
 * OpenZeppelin's: getStorageUpgradeReport applies the same rules the upgrades plugin applies at
 * deploy time.
 *
 * The targets come from deployment files rather than from source. `openzeppelin-upgrades-core
 * validate` only reaches contracts inheriting Initializable, which is what leaves Diamond,
 * VAIController and XVSVault outside its scope; they are covered here because they have a
 * deployment artifact. Contracts behind Venus's own delegation have an artifact but no proxy
 * marker, so they are listed by hand in CUSTOM_DELEGATION.
 *
 *   yarn check:storage-layout                       compares against the working tree (local)
 *   STORAGE_LAYOUT_BASE_REF=origin/develop yarn ...  compares against a git ref
 */
import {
  getContractVersion,
  getStorageLayout,
  getStorageUpgradeReport,
  solcInputOutputDecoder,
  validate,
  withValidationDefaults,
} from "@openzeppelin/upgrades-core";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

/** Chains whose deployments are the reference. Testnet layouts drift on purpose; zksync builds
 *  through hardhat.config.zksync.ts into a different build-info directory. */
const NETWORKS = [
  "bscmainnet",
  "ethereum",
  "arbitrumone",
  "opbnbmainnet",
  "basemainnet",
  "opmainnet",
  "unichainmainnet",
];

/** hardhat-deploy writes the implementation behind a proxy under this suffix. */
const SUFFIX = "_Implementation.json";

/**
 * Implementations behind Venus's own delegation, keyed by network and named by deployment file.
 *
 * The suffix scan above only finds hardhat-deploy's proxies, which it marks with a matching
 * `_Proxy.json`. Venus predates that plugin in two places and neither leaves a marker, so nothing
 * in the artifacts distinguishes these from an ordinary standalone deployment -- they have to be
 * listed. Getting that wrong is silent in one direction: a contract left off this list is simply
 * never compared, which is how a storage insertion in VTokenInterfaces reached every vToken market
 * with the check still green.
 *
 * Do not add a contract that is merely stateful. A standalone deployment is replaced by deploying a
 * fresh one, so its layout is free to change and listing it would report legal work as a failure.
 * The test is whether something delegatecalls into it.
 */
const CUSTOM_DELEGATION: Record<string, string[]> = {
  bscmainnet: [
    // Every vToken market is a VBep20Delegator that delegatecalls this one shared implementation,
    // so a slot inserted anywhere in VToken's inheritance chain shifts storage under all of them.
    "VBep20Delegate",
    // Unitroller is a Diamond and these are its facets, each delegatecalled with the Comptroller
    // storage layout that Unitroller_Implementation also carries. They are deployed and upgraded
    // one at a time, so each needs its own comparison rather than inheriting the Diamond's.
    "FlashLoanFacet",
    "MarketFacet",
    "PolicyFacet",
    "RewardFacet",
    "SetterFacet",
  ],
};

const ROOT = path.join(__dirname, "..");
const BUILD_INFO_DIR = path.join(ROOT, "artifacts", "build-info");
const ALLOWLIST_PATH = path.join(__dirname, "storage-layout-allowlist.json");

/**
 * Git ref the reference artifacts are read from.
 *
 * GITHUB_BASE_REF holds a bare branch name, so `origin/` is prepended to reach the
 * remote-tracking ref. That only resolves because the workflow checks out with `fetch-depth: 0`;
 * at the default depth of 1 only the pull request's merge ref is fetched and `origin/<branch>`
 * does not exist. Unset means the working tree, which is the intent locally and a misconfiguration
 * in CI, so assertReferenceIsUsable refuses it there.
 */
const BASE_REF =
  process.env.STORAGE_LAYOUT_BASE_REF || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "");

/** OZ's StorageLayout. Inferred from the function we pass it to, since the type itself is only
 *  exported from dist/. */
type Layout = Parameters<typeof getStorageUpgradeReport>[0];

interface Target {
  key: string;
  fqName?: string;
  deployed?: Layout;
  isNew?: boolean;
  blocked?: string;
}

/** Deployment artifacts store raw solc output, which gives each storage item a `contract` and an
 *  `astId` but no `src`. OZ requires `src` and uses it only to point at a source location in the
 *  failure report, so a synthesised one is enough. `types` is passed through untouched because
 *  struct members carry no `src` to begin with. */
const normalize = (raw: { storage?: Record<string, unknown>[]; types?: Record<string, unknown> }): Layout => ({
  storage: (raw.storage ?? []).map(item => ({ ...item, src: item.src ?? `${item.contract}:${item.astId ?? 0}` })),
  types: raw.types ?? {},
});

/**
 * The reference artifact, read from BASE_REF when set. Undefined means the deployment is absent from
 * the reference, which is what makes it new.
 *
 * Only the read is allowed to mean "absent". A malformed artifact throws instead, because reading a
 * corrupt file as a new deployment would pass it without comparing anything.
 */
function readReference(relPath: string): Record<string, unknown> | undefined {
  let raw: string;
  try {
    raw = BASE_REF
      ? // stderr is dropped: git reports a missing path as fatal, which here just means the
        // deployment is new.
        execFileSync("git", ["show", `${BASE_REF}:${relPath}`], {
          encoding: "utf8",
          maxBuffer: 1 << 28,
          stdio: ["ignore", "pipe", "ignore"],
        })
      : fs.readFileSync(path.join(ROOT, relPath), "utf8");
  } catch {
    return undefined;
  }
  return JSON.parse(raw);
}

/**
 * Refuses to run in any configuration that would compare nothing.
 *
 * Both failure modes pass rather than fail. With no base ref the branch is compared against
 * itself. With a base ref that does not resolve, every `git show` errors, so every deployment
 * looks new and nothing is compared. Either way the run reports success having checked nothing,
 * which is worse than not running at all because the green badge says otherwise.
 */
function assertReferenceIsUsable(): void {
  if (!BASE_REF) {
    // Locally the working tree is the intended reference. In CI it means the job is not running on
    // a pull_request event, the only event GitHub sets GITHUB_BASE_REF on.
    if (!process.env.CI) return;
    console.error(
      "No base ref. GitHub sets GITHUB_BASE_REF on pull_request events only, so this job must be " +
        "gated on `if: github.event_name == 'pull_request'`. Comparing against the working tree " +
        "here would compare the branch with itself.\nSet STORAGE_LAYOUT_BASE_REF to pick a ref explicitly.",
    );
    process.exit(1);
  }
  try {
    execFileSync("git", ["rev-parse", "--verify", `${BASE_REF}^{commit}`], { stdio: "ignore" });
  } catch {
    console.error(
      `Cannot resolve '${BASE_REF}'. Every deployment would look new and this check would pass ` +
        `without comparing anything.\nFetch the base branch (actions/checkout needs fetch-depth: 0) ` +
        `or unset STORAGE_LAYOUT_BASE_REF to compare against the working tree.`,
    );
    process.exit(1);
  }
}

/** The contract a deployment was compiled from, which is often not its deployment name:
 *  Unitroller is deployed from Diamond.sol:Diamond. */
function readFqName(metadata?: string): string | undefined {
  if (!metadata) return undefined;
  const target = JSON.parse(metadata)?.settings?.compilationTarget;
  const source = target && Object.keys(target)[0];
  return source ? `${source}:${target[source]}` : undefined;
}

/**
 * One target from one deployment file, blocked if its artifact cannot be read.
 *
 * `readReference` throws on malformed JSON and `readFqName` throws on malformed metadata. Both land
 * here so that one unreadable artifact fails its own target instead of taking down the whole run.
 */
function targetFor(key: string, relPath: string): Target {
  try {
    return toTarget(key, readReference(relPath));
  } catch (error) {
    return { key, blocked: `artifact could not be read: ${(error as Error).message}` };
  }
}

/**
 * Every proxied implementation to check, one target per deployment file.
 *
 * Which files exist comes from the working tree, but each file's contents come from the base ref.
 * A deployment the branch deletes or renames is therefore never enumerated, so it leaves the check
 * rather than failing it.
 */
function collectTargets(): Target[] {
  const targets: Target[] = [];
  for (const network of NETWORKS) {
    const dir = path.join(ROOT, "deployments", network);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith(SUFFIX))) {
      const key = `${network}/${file.slice(0, -SUFFIX.length)}`;
      targets.push(targetFor(key, path.posix.join("deployments", network, file)));
    }
    for (const name of CUSTOM_DELEGATION[network] ?? []) {
      // A name with no deployment file is a typo in CUSTOM_DELEGATION, not a new deployment.
      // Letting it reach readReference would report it as new and pass, quietly dropping the target
      // the list was added to cover.
      if (!fs.existsSync(path.join(dir, `${name}.json`))) {
        targets.push({ key: `${network}/${name}`, blocked: "listed in CUSTOM_DELEGATION but has no deployment file" });
        continue;
      }
      targets.push(targetFor(`${network}/${name}`, path.posix.join("deployments", network, `${name}.json`)));
    }
  }
  return targets;
}

function toTarget(key: string, artifact?: Record<string, unknown>): Target {
  if (!artifact) return { key, isNew: true };
  const layout = artifact.storageLayout as { storage?: Record<string, unknown>[] } | undefined;
  if (!layout) return { key, blocked: "deployment artifact records no storageLayout" };
  const fqName = readFqName(artifact.metadata as string | undefined);
  if (!fqName) return { key, blocked: "deployment artifact records no compiler metadata, so its source is unknown" };
  return { key, fqName, deployed: normalize(layout) };
}

/**
 * Current layouts for the contracts we need, keyed by fully qualified name.
 *
 * A full compile leaves around 20 build-info files totalling roughly 200MB, so this stops as soon
 * as every wanted contract is found and never holds two parsed files at once. A single name that
 * never resolves -- a deployment whose source has since been renamed or removed -- defeats the
 * early exit and parses all of them, which is what CI's 4GB heap is sized for.
 *
 * Files are read newest first so a stale build-info from an earlier compile cannot shadow the
 * current one. Going through validate() rather than raw solc output is what makes
 * `@custom:oz-renamed-from` and `@custom:oz-retyped-from` count.
 *
 * Newest-first only orders the build-info files against each other. Whether the newest of them is
 * current at all is `hardhat run`'s job: it compiles before this script is loaded.
 */
function resolveCurrentLayouts(wanted: Set<string>): Map<string, Layout> {
  const found = new Map<string, Layout>();
  if (!fs.existsSync(BUILD_INFO_DIR)) return found;

  const files = fs
    .readdirSync(BUILD_INFO_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => path.join(BUILD_INFO_DIR, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  for (const file of files) {
    if (found.size === wanted.size) break;
    const { input, output, solcVersion } = JSON.parse(fs.readFileSync(file, "utf8"));
    const present = [...wanted].filter(fq => !found.has(fq) && hasContract(output, fq));
    if (present.length === 0) continue;

    const validation = validate(output, solcInputOutputDecoder(input, output), solcVersion, input);
    for (const fqName of present) {
      // Throwing here means the contract is in solc's output but not upgrade-validated, an
      // interface or an abstract contract for instance. Leaving it unresolved makes the caller
      // report it instead of passing it.
      try {
        found.set(fqName, getStorageLayout(validation, getContractVersion(validation, fqName)));
      } catch {
        continue;
      }
    }
  }
  return found;
}

function hasContract(output: { contracts?: Record<string, Record<string, unknown>> }, fqName: string): boolean {
  const at = fqName.lastIndexOf(":");
  return Boolean(output.contracts?.[fqName.slice(0, at)]?.[fqName.slice(at + 1)]);
}

/** Compares one deployed layout against the current source, returning undefined when they are
 *  compatible. A contract missing from build-info is a failure rather than a skip, so a source
 *  that was renamed or deleted cannot drop out of the check unnoticed. */
function check(target: Target, current: Map<string, Layout>): string | undefined {
  const updated = target.fqName ? current.get(target.fqName) : undefined;
  if (!updated) return `${target.fqName} was not found in artifacts/build-info`;
  const report = getStorageUpgradeReport(target.deployed as Layout, updated, withValidationDefaults({}));
  return report.ok ? undefined : report.explain(false);
}

interface Results {
  /** Rendered failure blocks, ready to print. */
  failures: string[];
  /** Allowlisted targets that now pass, so their entry has outlived its reason and should go. */
  stale: string[];
}

type Verdict =
  | { kind: "new" }
  | { kind: "ok" }
  /** Not comparable, but allowlisted with a reason. */
  | { kind: "skipped" }
  | { kind: "stale" }
  | { kind: "failed"; detail: string };

/** An allowlist entry only suppresses a failure; it never creates one. A target that is simply new
 *  is passed before the allowlist is consulted, which is why new deployments must not be listed. */
function verdictFor(target: Target, current: Map<string, Layout>, allowlist: Record<string, string>): Verdict {
  if (target.isNew) return { kind: "new" };
  const detail = target.blocked ?? check(target, current);
  const allowed = target.key in allowlist;
  if (detail) return allowed ? { kind: "skipped" } : { kind: "failed", detail };
  return allowed ? { kind: "stale" } : { kind: "ok" };
}

const indent = (text: string): string => text.replace(/^/gm, "      ");

/** Classifies every target, printing the ones that need no attention as it goes and collecting the
 *  ones that do, so failures print together at the end rather than scattered through the log. */
function classify(targets: Target[], current: Map<string, Layout>, allowlist: Record<string, string>): Results {
  const results: Results = { failures: [], stale: [] };

  for (const target of targets) {
    const verdict = verdictFor(target, current, allowlist);
    if (verdict.kind === "failed") {
      results.failures.push(`  FAILED    ${target.key}  (${target.fqName ?? "unresolved"})\n${indent(verdict.detail)}`);
    } else if (verdict.kind === "stale") {
      results.stale.push(target.key);
    } else {
      const source = verdict.kind === "ok" ? `  (${target.fqName})` : "";
      console.log(`  ${verdict.kind.padEnd(9)} ${target.key}${source}`);
    }
  }
  return results;
}

function main(): void {
  assertReferenceIsUsable();

  const allowlist: Record<string, string> = fs.existsSync(ALLOWLIST_PATH)
    ? (JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8")).skip ?? {})
    : {};

  const targets = collectTargets();
  const current = resolveCurrentLayouts(new Set(targets.flatMap(t => t.fqName ?? [])));

  console.log(`Reference: ${BASE_REF || "working tree"} | ${targets.length} deployed implementations\n`);
  const { failures, stale } = classify(targets, current, allowlist);

  failures.forEach(f => console.log(`\n${f}`));
  // A stale entry counts towards the verdict like a real failure: the allowlist is only trustworthy
  // if an entry cannot outlive the problem it documents. It is summarised here rather than only at
  // the bottom so the headline never reads PASSED on a run that exits non-zero.
  const verdict = failures.length === 0 && stale.length === 0 ? "PASSED" : "FAILED";
  const staleCount = stale.length > 0 ? `, ${stale.length} stale` : "";
  console.log(`\n${verdict} (${targets.length} checked, ${failures.length} incompatible${staleCount})`);

  if (stale.length > 0) {
    console.log(
      `\nThese now pass -- delete them from storage-layout-allowlist.json:\n${stale.map(s => `  ${s}`).join("\n")}`,
    );
  }
  if (verdict === "FAILED") process.exit(1);
}

main();
