// Account roles. Stored in users/{uid}.role and enforced by firestore.rules;
// the UI only uses them to decide what to show.
export type Role = "admin" | "teacher" | "student";

export const ROLES: Role[] = ["student", "teacher", "admin"];

/** The site owner's account, which makes itself the first admin (see firestore.rules). */
export const BOOTSTRAP_ADMIN_EMAIL = "rlagmlckd@gmail.com";

export const parseRole = (v: unknown): Role => (v === "admin" || v === "teacher" ? v : "student");

export const canSeeSolutions = (r: Role | null) => r === "admin" || r === "teacher";

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", teacher: "Teacher", student: "Student" };
