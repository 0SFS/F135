import { existsSync, readFileSync } from "node:fs";

const manifestPath = "public/0sfs-mod.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const failures = [];
const fail = (message) => failures.push(message);

if (manifest.schemaVersion !== 1) fail("schemaVersion must be 1.");
if (!["aircraft", "engine", "component", "payload", "plugin", "modpack"].includes(manifest.kind)) fail("kind must be aircraft, engine, component, payload, plugin, or modpack.");
if (typeof manifest.id !== "string" || !manifest.id) fail("id is required.");
if (typeof manifest.name !== "string" || typeof manifest.summary !== "string") fail("name and summary are required.");
const execution = manifest.js ? "js" : manifest.wasm ? "wasm" : "declarative";
if (manifest.execution !== execution) fail(`execution is ${manifest.execution}; the entries make it ${execution}.`);
const provenance = manifest.provenance ?? {};
if (typeof provenance.owner !== "string" || typeof provenance.repository !== "string" || typeof provenance.license !== "string") {
  fail("provenance needs an owner, repository, and license.");
}
for (const dependency of manifest.dependencies ?? []) {
  const source = typeof dependency === "string" ? dependency : dependency?.source;
  if (typeof source !== "string" || !source.includes("/")) fail("Each dependency needs an owner/repo source.");
}
if (manifest.kind === "payload") {
  const payloadType = manifest.payload?.payloadType;
  if (payloadType !== "store" && payloadType !== "external-tank") fail("A payload mod needs payloadType store or external-tank.");
}
if (manifest.kind === "modpack") {
  if (!manifest.dependencies?.length) fail("A modpack lists at least one mod in dependencies.");
  for (const key of ["aircraft", "engine", "payload", "jsbsimFiles", "quadcopter", "dji", "quad", "camera", "cameraPreview", "wasm", "js"]) {
    if (manifest[key] !== undefined) fail(`A modpack only lists mods; remove its ${key}.`);
  }
}
if (manifest.wasm?.path) {
  const wasmPath = `public/${manifest.wasm.path}`;
  if (!existsSync(wasmPath)) fail(`Missing ${wasmPath}. Build the Rust crate before validating a WASM mod.`);
  else {
    const compiled = await WebAssembly.instantiate(readFileSync(wasmPath), { env: {} });
    for (const name of ["memory", "osfs_mod_abi_version", "osfs_mod_init", "osfs_mod_reset", "osfs_mod_input_ptr", "osfs_mod_output_ptr", "osfs_mod_step"]) {
      if (compiled.instance.exports[name] === undefined) fail(`WASM mod is missing export ${name}.`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`${manifest.id} is a valid ${manifest.kind} mod.`);
