const roles = {
    teacher: [
        "assignments:create",
        "assignments:read:own",
        "assignments:update:own",
        "assignments:grade",
        "students:view_list:assigned",
        "students:view_grades:assigned",
    ],
    admin: [
        "users:create",
        "users:read",
        "users:update",
        "users:delete",
        "teachers:read",
        "teachers:create",
        "teachers:update",
        "teachers:delete",
        "teachers:unassign",
        "analytics:read",
    ],
    systemadmin: [
        "users:create",
        "users:read",
        "users:update",
        "users:delete",
        "teachers:read",
        "teachers:create",
        "teachers:update",
        "teachers:delete",
        "teachers:unassign",
        "assignments:create",
        "assignments:read:own",
        "assignments:update:own",
        "assignments:grade",
        "students:view_list:assigned",
        "students:view_grades:assigned",
        "analytics:read",
    ],
    // ... other roles
};

export default roles;
