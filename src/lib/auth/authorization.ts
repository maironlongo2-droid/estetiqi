import type { Role } from "@/lib/auth/types";

export type Resource =
  | "clients"
  | "procedures"
  | "appointments"
  | "users"
  | "organization";

export type Action = "read" | "create" | "update" | "delete";

const rolePermissions: Record<Role, Record<Resource, readonly Action[]>> = {
  owner: {
    clients: ["read", "create", "update", "delete"],
    procedures: ["read", "create", "update", "delete"],
    appointments: ["read", "create", "update", "delete"],
    users: ["read", "create", "update", "delete"],
    organization: ["read", "update", "delete"],
  },

  admin: {
    clients: ["read", "create", "update", "delete"],
    procedures: ["read", "create", "update", "delete"],
    appointments: ["read", "create", "update", "delete"],
    users: ["read", "create", "update"],
    organization: ["read"],
  },

  member: {
    clients: ["read", "create", "update"],
    procedures: ["read"],
    appointments: ["read", "create", "update"],
    users: ["read"],
    organization: ["read"],
  },
};

export function hasPermission(
  role: Role,
  resource: Resource,
  action: Action
): boolean {
  return rolePermissions[role][resource].includes(action);
}
