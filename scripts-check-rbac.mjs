import { hasPermission } from "./src/lib/auth/authorization.ts";

const permissions = {
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

const resources = [
  "clients",
  "procedures",
  "appointments",
  "users",
  "organization",
];

const actions = ["read", "create", "update", "delete"];

let failed = 0;
let total = 0;

for (const [role, resourcePermissions] of Object.entries(permissions)) {
  for (const resource of resources) {
    for (const action of actions) {
      const expected = resourcePermissions[resource].includes(action);
      const actual = hasPermission(role, resource, action);

      total++;

      if (actual !== expected) {
        console.error(
          `FALHOU: ${role} -> ${resource}:${action}. Esperado ${expected}, recebido ${actual}`
        );
        failed++;
      }
    }
  }
}

if (failed > 0) {
  throw new Error(`${failed} teste(s) de RBAC falharam.`);
}

console.log(`RBAC OK: ${total} combinações passaram.`);
