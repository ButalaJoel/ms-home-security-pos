import fs from "node:fs";

const settingsFile = "client/src/pages/SettingsPage.tsx";
const navigationFile = "client/src/data/navigation.ts";
const appFile = "client/src/App.tsx";

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  return fs.readFileSync(file, "utf8");
}

const edits = [];

function prepare(file, edit) {
  const before = read(file);
  const after = edit(before);
  if (before !== after) edits.push({ file, before, after });
}

prepare(settingsFile, (source) => {
  let s = source;

  if (!s.includes('import UsersPage from "./UsersPage";')) {
    const marker = 'import { apiFetch } from "../lib/api";';
    if (!s.includes(marker)) throw new Error("Settings import marker not found.");
    s = s.replace(marker, marker + '\nimport UsersPage from "./UsersPage";');
  }

  if (!s.includes('import { useAuth } from "../context/AuthContext";')) {
    s = s.replace(
      'import UsersPage from "./UsersPage";',
      'import UsersPage from "./UsersPage";\nimport { useAuth } from "../context/AuthContext";'
    );
  }

  if (!s.includes('const { user } = useAuth();')) {
    s = s.replace(
      'export default function SettingsPage() {',
      'export default function SettingsPage() {\n  const { user } = useAuth();'
    );
  }

  const oldUsersCase = /      case "users":\s*return renderComingSoon\(\s*"Users & permissions",\s*"Staff accounts, administrator access and role-based permissions will be configured here\.",\s*Users,\s*\);/;

  if (oldUsersCase.test(s)) {
    s = s.replace(oldUsersCase, '      case "users":\n        return <UsersPage />;');
  } else if (!s.includes('case "users":\n        return <UsersPage />;')) {
    throw new Error("Users placeholder not found; Settings file left unchanged.");
  }

  s = s.replace(
    '{sections.map((section) => {',
    '{sections.filter((section) => section.id !== "users" || user?.role === "admin").map((section) => {'
  );

  const controlsStart = '          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-[#dce5f0] pt-5">';
  const footerStart = '          <p className="mt-4 text-[11px] leading-5 text-[#8a9db6]">';

  if (!s.includes('activeSection !== "users"')) {
    const start = s.indexOf(controlsStart);
    const footer = s.indexOf(footerStart, start);

    if (start < 0 || footer < 0) {
      throw new Error("Could not safely locate Settings save/discard controls.");
    }

    const close = s.lastIndexOf('          </div>', footer);
    if (close < start) throw new Error("Could not locate end of Settings controls.");

    const controls = s.slice(start, close + '          </div>'.length);
    s = s.slice(0, start) +
      '          {activeSection !== "users" && (\n' +
      controls + '\n          )}\n\n' +
      s.slice(close + '          </div>'.length);
  }

  s = s.replace(
    '<p className="mt-4 text-[11px] leading-5 text-[#8a9db6]">',
    '<p className={`mt-4 text-[11px] leading-5 text-[#8a9db6] ${activeSection === "users" ? "hidden" : ""}`}>'
  );

  return s;
});

prepare(navigationFile, (source) => {
  let s = source.replace(
    /^\s*\{\s*label:\s*"Users & Permissions",\s*path:\s*"\/users",\s*icon:\s*Users,\s*adminOnly:\s*true\s*\},?\s*$/m,
    ""
  );

  if (s.includes('path: "/users"')) {
    throw new Error("A standalone Users navigation entry remains; navigation file left unchanged.");
  }

  if (!s.includes("icon: Users")) {
    s = s.replace(/^\s*Users,\s*$/m, "");
  }

  return s;
});

prepare(appFile, (source) => {
  let s = source.replace(
    /^\s*import UsersPage from "\.\/pages\/UsersPage";\s*\r?\n/m,
    ""
  );

  s = s.replace(
    /^\s*<Route path="\/users" element=\{<UsersPage \/>\} \/>\s*\r?\n/m,
    ""
  );

  if (s.includes('path="/users"')) {
    throw new Error("A standalone /users route remains; App.tsx left unchanged.");
  }

  return s;
});

// Validate all prepared edits before writing any of them.
const settings = edits.find((e) => e.file === settingsFile)?.after ?? read(settingsFile);
if (!settings.includes('case "users":\n        return <UsersPage />;')) {
  throw new Error("Validation failed: Settings is not rendering UsersPage.");
}
if (!settings.includes('activeSection !== "users"')) {
  throw new Error("Validation failed: Settings save buttons are not isolated.");
}

for (const edit of edits) {
  fs.copyFileSync(edit.file, `${edit.file}.backup-${Date.now()}`);
  fs.writeFileSync(edit.file, edit.after, "utf8");
  console.log(`UPDATED ${edit.file}`);
}

console.log(`\nDone. ${edits.length} file(s) updated.`);
console.log("Users & Permissions now lives inside Settings; the duplicate sidebar entry is removed.");
