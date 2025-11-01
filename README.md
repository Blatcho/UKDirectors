# UKDirectors
Checks UK Company Directors benefits

## HMRC API access

The dashboard talks to the [Individual Benefits API v1.1](https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/individual-benefits/1.1),
which is exposed at these base URLs:

| Environment | Base URL | Notes |
| --- | --- | --- |
| Sandbox | `https://test-api.service.hmrc.gov.uk` | Supports `Gov-Test-Scenario` headers that return documented test payloads. |
| Live | `https://api.service.hmrc.gov.uk` | Real director benefit data; requires HMRC approval and production credentials. |

Requests are sent to `/individual-benefits/individual-benefits` with the header `Accept: application/vnd.hmrc.1.1+json`.

### Generate a bearer token

1. Sign in (or create an account) at the [HMRC Developer Hub](https://developer.service.hmrc.gov.uk/).
2. Create a new application, add the **Individual Benefits** API (v1.1), and enable both **Sandbox** and **Live** environments.
3. Use the API's *Create an access token* steps (Client Credentials OAuth flow) to exchange your client id/secret for a bearer token.
4. Provide that token to the app:
   - Either replace the `REPLACE_WITH_YOUR_HMRC_API_KEY` placeholder in `app.js` (never commit your real token).
   - Or paste the token into the **HMRC API key** input on the page. The key is saved to `localStorage` on the current browser only.

### Triggering sandbox test data

When the **Environment** control is set to Sandbox the app sends requests to `https://test-api.service.hmrc.gov.uk` and includes any
value entered into the **Gov-Test-Scenario** input as the `Gov-Test-Scenario` header. Populate this field with one of the scenario
identifiers documented by HMRC to receive a deterministic test response.
