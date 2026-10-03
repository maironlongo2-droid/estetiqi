import type { Role } from "@/lib/auth/types";
import { requireCurrentUser } from "@/lib/auth/require-current-user";

export type Resource =
  | "clients"
  | "procedures"
  | "appointments"
  | "users"
  | "organization"
  | "finance"
  | "intelligence";

export type Action = "read" | "create" | "update" | "delete";

const rolePermissions: Record<Role, Record<Resource, readonly Action[]>> = {
  owner: {
    clients: ["read", "create", "update", "delete"],
    procedures: ["read", "create", "update", "delete"],
    appointments: ["read", "create", "update", "delete"],
    users: ["read", "create", "update", "delete"],
    organization: ["read", "update", "delete"],
    finance: ["read", "create", "update", "delete"],
    intelligence: ["read", "create", "update", "delete"],
  },

  admin: {
    clients: ["read", "create", "update", "delete"],
    procedures: ["read", "create", "update", "delete"],
    appointments: ["read", "create", "update", "delete"],
    users: ["read", "create", "update"],
    organization: ["read"],
    finance: ["read", "create", "update"],
    intelligence: ["read", "create", "update"],
  },

  member: {
    clients: ["read", "create", "update"],
    procedures: ["read"],
    appointments: ["read", "create", "update"],
    users: ["read"],
    organization: ["read"],
    finance: ["read"],
    intelligence: ["read"],
  },
};

export function hasPermission(
  role: Role,
  resource: Resource,
  action: Action
): boolean {
  return rolePermissions[role][resource].includes(action);
}

export async function requirePermission(
  resource: Resource,
  action: Action
) {
  const currentUser = await requireCurrentUser();

  if (!hasPermission(currentUser.role, resource, action)) {
    throw new Error("FORBIDDEN");
  }

  return currentUser;
}
