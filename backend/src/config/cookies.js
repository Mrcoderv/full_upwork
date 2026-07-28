const AUTH_COOKIE_NAME = "token";

const AUTH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
};

export function setAuthCookie(res, token) {
    res.cookie(AUTH_COOKIE_NAME, token, {
        ...AUTH_COOKIE_OPTIONS,
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
}

export function clearAuthCookie(res) {
    res.clearCookie(AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS);
}

export { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS };
