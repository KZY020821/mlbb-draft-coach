// Google OAuth endpoints. Overridable only so local tests can use a mock server.
export const google = {
  authUrl: () => process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: () => process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token",
  userinfoUrl: () => process.env.GOOGLE_USERINFO_URL || "https://openidconnect.googleapis.com/v1/userinfo"
};

export const redirectUri = (base: string) => `${base}/api/auth/callback/google`;
