import fs from "node:fs";

const files = {
  settings: "client/src/pages/SettingsPage.tsx",
  navigation: "client/src/data/navigation.ts",
  app: "client/src/App.tsx",
};

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`);
  return fs.readFileSync(file, "utf8");
}

const changes = [];

function transform(file, edit) {
  const before = read(file);
  const after = edit(before);
  if (after !== before) changes.push({ file, before, after });
}

transform(files.settings, (source) => {
  let result = source;

  if (!result.includes('import UsersPage from "./UsersPage";')) {
    const marker = 'import { apiFetch } from "../lib/api";';
    if (!result.includes(marker)) throw new Error("Settings import marker not found.");
    result = result.replace(marker, marker + '\nimport UsersPage from "./UsersPage";\nimport { useAuth } from "../context/AuthContext";');
  } else if (!result.includes('import { useAuth } from "../context/AuthContext";')) {
    result = result.replace(
      'import UsersPage from "./UsersPage";',
      'import UsersPage from "./UsersPage";\nimport { useAuth } from "../context/AuthContext";'
    );
  }

  if (!result.includes('const { user } = useAuth();')) {
    result = result.replace(
      'export default function SettingsPage() {',
      'export default function SettingsPage() {\n  const { user } = useAuth();'
    );
  }

  const oldCase = `      case "users":
        return renderComingSoon(
          "Users & permissions",
          "Staff accounts, administrator access and role-based permissions will be configured here.",
          Users,
        );`;

  if (result.includes(oldCase)) {
    result = result.replace(oldCase, `      case "users":
        return <UsersPage />;`);
  } else if (!result.includes('case "users":\n        return <UsersPage />;')) {
    throw new Error("Could not safely locate the Users & Permissions placeholder.");
  }

  result = result.replace(
    '{sections.map((section) => {',
    '{sections.filter((section) => section.id !== "users" || user?.role === "admin").map((section) => {'
  );

  // Settings save/discard buttons do not apply to user accounts.
  const controlsStart = '          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-[#dce5f0] pt-5">';
  const controlsEnd = '          </div>\n\n          <p className="mt-4 text-[11px] leading-5 text-[#8a9db6]">';

  if (result.includes(controlsStart) && result.includes(controlsEnd)) {
    const start = result.indexOf(controlsStart);
    const end = result.indexOf(controlsEnd, start);
    const controls = result.slice(start, end + '          </div>'.length);
    result = result.slice(0, start) +
      '          {activeSection !== "users" && (\n' +
      controls + '\n          )}' +
      result.slice(end + '          </div>'.length);
  } else if (!result.includes('activeSection !== "users"')) {
    throw new Error("Could not safely locate the Settings action buttons.");
  }

  // Hide the settings-specific footer when showing user management.
  result = result.replace(
    '<p className="mt-4 text-[11px] leading-5 text-[#8a9db6]">',
    '<p className={`mt-4 text-[11px] leading-5 text-[#8a9db6] ${activeSection === "users" ? "hidden" : ""}`}>'
  );

  return result;
});

transform(files.navigation, (source) => {
  let result = source.replace(
    /\s*\{\s*label:\s*"Users & Permissions",\s*path:\s*"\/users",\s*icon:\s*Users,\s*adminOnly:\s*true\s*\},?\s*/g,
    "\n"
  );

  // Remove the Users icon import only if no remaining navigation item uses it.
  if (!result.includes("icon: Users")) {
    result = result.replace(/^\s*Users,\s*\r?\n/m, "\n");
  }

  return result;
});

transform(files.app, (source) => {
  let result = source.replace(/^\s*import UsersPage from "\.\/pages\/UsersPage";\s*\r?\n/m, "");
  result = result.replace(/^\s*<Route path="\/users" element=\{<UsersPage \/>\} \/>\s*\r?\n/m, "");
  return result;
});

// Validate every change before writing any file.
for (const change of changes) {
  if (change.file === files.settings &&
      !change.after.includes('case "users":\n        return <UsersPage />;')) {
    throw new Error("Settings integration validation failed.");
  }
}

for (const change of changes) {
  fs.copyFileSync(change.file, `${change.file}.backup-${Date.now()}`);
  fs.writeFileSync(change.file, change.after, "utf8");
  console.log(`UPDATED ${change.file}`);
}

console.log(`\nIntegration complete. ${changes.length} file(s) updated.`);
