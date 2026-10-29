import fs from "node:fs";

const routeFile = "server/src/userRoutes.ts";
const pageFile = "client/src/pages/UsersPage.tsx";

function patch(file, transform) {
  const original = fs.readFileSync(file, "utf8");
  const updated = transform(original);

  if (updated === original) {
    console.log(`UNCHANGED ${file}`);
    return;
  }

  fs.copyFileSync(file, `${file}.backup-${Date.now()}`);
  fs.writeFileSync(file, updated, "utf8");
  console.log(`UPDATED ${file}`);
}

patch(routeFile, (source) => {
  let result = source;

  // Return the response shape expected by UsersPage.
  result = result.replace(
    'res.json(users.map((user) => serializeUser(user)));',
    `res.json({
      success: true,
      users: users.map((user) => ({
        ...serializeUser(user),
        active: user.active !== false,
      })),
    });`
  );

  result = result.replace(
    `res.status(201).json({
      message: "Staff account created successfully.",
      user: serializeUser(created),
    });`,
    `res.status(201).json({
      success: true,
      message: "Staff account created successfully.",
      user: { ...serializeUser(created), active: created.active !== false },
    });`
  );

  result = result.replace(
    `res.json({
      message: req.body.active ? "Staff account activated." : "Staff account deactivated.",
      user: updated ? serializeUser(updated) : null,
    });`,
    `res.json({
      success: true,
      message: req.body.active ? "Staff account activated." : "Staff account deactivated.",
      user: updated
        ? { ...serializeUser(updated), active: updated.active !== false }
        : null,
    });`
  );

  if (!result.includes("users: users.map((user) => ({")) {
    throw new Error("Could not patch the users-list response safely.");
  }
  if (!result.includes("success: true")) {
    throw new Error("Could not add the expected success response.");
  }

  return result;
});

patch(pageFile, (source) => {
  let result = source;

  result = result.replace(
    'role: "admin" | "staff";\n  photoUrl?: string;',
    'role: "admin" | "staff";\n  photoUrl?: string;\n  active: boolean;'
  );

  result = result.replace(
    'const nextActive = !(user as StaffUser & { active?: boolean }).active;',
    'const nextActive = !user.active;'
  );

  result = result.replace(
    'const active = (user as StaffUser & { active?: boolean }).active !== false;',
    'const active = user.active;'
  );

  if (!result.includes("active: boolean;")) {
    throw new Error("Could not update the frontend user type safely.");
  }
  if (result.includes("(user as StaffUser & { active?: boolean })")) {
    throw new Error("An old active-status cast remains in UsersPage.");
  }

  return result;
});

console.log("\nRepair complete. Run both builds to verify.");
