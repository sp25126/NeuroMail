# GCP Credential Discovery Protocol

To bridge the gap between "code" and "reality," you need to pull these 4 strings from the Google Cloud Console. Follow this precisely.

## 1. OAuth 2.0 Credentials
*   **Location:** [GCP Console > APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
*   **Action:** Click **"Create Credentials"** > **"OAuth client ID"**.
*   **Type:** Web Application.
*   **Authorized Redirect URIs:** `http://localhost:3000/api/auth/callback/google`
*   **Outcome:** You will get `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## 2. API Enablement
*   **Location:** [API Library](https://console.cloud.google.com/apis/library)
*   **Action:** Search for and **Enable** these two:
    1.  **Gmail API**
    2.  **Cloud Pub/Sub API**

## 3. Pub/Sub Setup (Phase 3 Real-time)
*   **Location:** [Pub/Sub > Topics](https://console.cloud.google.com/cloudpubsub/topic/list)
*   **Action:** 
    1.  Create a Topic (e.g., `gmail-notifications`).
    2.  **CRITICAL:** Under "Permissions" for the topic, add `gmail-api-push@system.gserviceaccount.com` with the role **"Pub/Sub Publisher"**. If you skip this, Google will never send you mail alerts.
*   **Outcome:** `GMAIL_PUB_SUB_TOPIC` will be `projects/[YOUR_PROJECT_ID]/topics/gmail-notifications`.

## 4. Consent Screen
*   **Location:** [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)
*   **Action:** Set to "External," add your email as a "Test User," and add these scopes:
    - `https://www.googleapis.com/auth/gmail.modify`
    - `https://www.googleapis.com/auth/gmail.send`

---

## Your Current .env.local Status
I've already generated and inserted your `NEXTAUTH_SECRET`. 
Paste the remaining values into the file: [ .env.local ](file:///c:/Users/saumy/OneDrive/Desktop/task/.env.local)

**Don't build anything else until you've logged in once.**
