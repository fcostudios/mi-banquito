# Auth0 Runbook

## Application Type

Use a Regular Web Application. This app uses `@auth0/nextjs-auth0/server`, server sessions, and `AUTH0_CLIENT_SECRET`; it is not a browser-only SPA.

## Required Local URLs

- Allowed Callback URL: `http://localhost:3000/auth/callback`
- Allowed Logout URL: `http://localhost:3000`
- Allowed Web Origin: `http://localhost:3000`

## Organization Metadata

Each Auth0 Organization must include:

```txt
db_org_id=<uuid from the app database organization.id>
```

## Post-Login Action

```js
exports.onExecutePostLogin = async (event, api) => {
  const namespace = "https://mi-banquito.app";
  const dbOrgId = event.organization?.metadata?.db_org_id;

  if (dbOrgId) {
    api.idToken.setCustomClaim(`${namespace}/org_id`, dbOrgId);
  }

  if (event.authorization?.roles) {
    api.idToken.setCustomClaim(`${namespace}/roles`, event.authorization.roles);
  }
};
```
