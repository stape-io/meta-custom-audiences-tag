# Meta Custom Audiences Tag for Google Tag Manager Server-Side

The **Meta Custom Audiences Tag** for Google Tag Manager Server-Side allows you to send audience data to Meta's advertising products using the [Marketing API](https://developers.facebook.com/docs/marketing-api/). This enables you to programmatically add users to or remove them from your Custom Audiences.

This tag supports three primary actions:
- **Add to Audience**: Adds users to one or more specific Custom Audiences.
- **Remove from Audience**: Removes users from one or more specific Custom Audiences.
- **Remove from All Audiences**: Removes users from all Custom Audiences within one or more Ad Accounts.

## How to use the Meta Custom Audiences Tag

1.  Add the **Meta Custom Audiences Tag** to your server container in GTM.
2.  Select the **Action** you want to perform (`Add to Audience`, `Remove from Audience`, or `Remove from All Audiences`).
3.  Configure the **Destination Audiences** or **Destination Ad Accounts** by providing the required IDs and Access Tokens.
4.  Configure the **Audience Members** section with the user data you want to send. You can provide data for a single user or multiple users in a batch.
5.  The tag will automatically hash user identifiers (like email and phone) using SHA256 if they are not already hashed.

## Parameters

### Main Configuration
- **Action**: Choose the operation to perform.
- **Destination Audiences**: (For `Add`/`Remove` actions) A list of Audience IDs and their corresponding Access Tokens.
- **Destination Ad Accounts**: (For `Remove from All` action) A list of Ad Account IDs and their corresponding Access Tokens.
- **Access Token**: A System User access token with the `ads_management` permission. This token must be associated with the Ad Account that owns the audience. You can find more details on how to generate on the [Generating a System User Access Token section](#generating-a-system-user-access-token).

### Audience Members
The tag can be configured to send data for a single user or for multiple users at once.

- **User Mode**:
    - **Single User**: Manually input identifiers for one user through the UI fields.
    - **Multiple Users**: Provide a pre-formatted array of audience members and a corresponding schema. A maximum of **10,000 audience members** can be submitted per request.

- **User Identifiers (Single User)**:
    - A list of key-value pairs for user data, such as `EMAIL`, `PHONE`, `FN` (First Name), `LN` (Last Name), `MADID` (Mobile Advertiser ID), etc.
    - The tag automatically hashes most identifiers. The `MADID` (IDFA/GAID) is the exception and must **not** be hashed.
    - If providing pre-hashed data, ensure it follows Meta's [normalization guidelines](https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences/#hash).

- **Audience Members (Multiple Users)**:
    - **Audience Members Identifiers Schema**: A comma-separated string or an array defining the structure of your user data (e.g., `EMAIL,PHONE,FN`).
    - **Audience Members Array**: An array containing the data for up to 10,000 users, matching the defined schema.

- **Data Processing Options**:
    - For compliance with US state privacy regulations (Limited Data Use), you can enable and configure data processing options for `Country` and `State`.

### Advanced Options
- **Use Optimistic Scenario**: If `true`, the tag fires `gtmOnSuccess()` immediately without waiting for a response from the API. This speeds up container response time but may hide downstream errors.
- **Consent Settings**: Prevent the tag from firing unless the necessary ad storage consent is granted by the user.
- **Logging**: Configure console and/or BigQuery logging for debugging and monitoring requests and responses.


## Generating a System User Access Token

This tag requires a long-lived System User access token for server-to-server authentication. Below are the steps to create the necessary Meta App and generate the token.

❗ You must have **Admin** access to that Business Manager.

> ⚠️ Meta enforces rate limits on API calls. Make sure your usage stays within these limits to avoid errors.
>
>  - For apps with **Standard Access** to the Ads Management Standard Access:
>    - This is the default access level when you create a new app.
>    - The rate limit is: `5000 + 40 * Number of Active Custom Audiences` per hour.
>  - For apps with **Advanced Access** to the Ads Management Standard Access feature the limit is:,
>    - You must apply the [app for a review](https://developers.facebook.com/docs/marketing-api/get-started/authorization#permissions-and-features) to obtain this access level.
>    - The rate limit increases to: `190000 + 40 * Number of Active Custom Audiences` per hour.
>
> Learn more: [Rate Limiting](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting) and [Rate Limiting for Custom Audiences](https://developers.facebook.com/docs/graph-api/overview/rate-limiting#custom-audience).


### Part 1: Create a Meta App

A Meta App is required to grant your system the correct permissions.

1.  Navigate to the [Meta for Developers Portal](https://developers.facebook.com/apps) and log in.
2.  Click **Create App**.
3.  Select **Business** as the app type. To see this option you may have to select **Other** on the *Use cases* form step.
4.  Provide an **App display name** and ensure your **App contact email** is correct.
5.  Select the correct **Meta Business Manager account** from the dropdown. This should be the Business Account that owns the Ad Account and will contain the System User.
6.  Click **Create app**.
7.  Once the app is created, go to **"Add Products"** and enable the **Marketing API**.

> If you are not able to create it, then you must already have a System User created and your account limit has been reached, or you don't have the required permissions (you must be Admin of the Business Manager account).

### Part 2: Generate the System User Token

Follow these steps within your [Meta Business Settings](https://business.facebook.com/settings).

1.  **Create a System User**:
    * Navigate to **Users** > **System Users**.
    * Click **Add**.
    * Enter a name for your System User and assign it the **Employee** role (Admin is not required).

> If you are not able to create it, then you must already have a System User created and your account limit has been reached, or you don't have the required permissions (you must be Admin of the Business Manager account).

2.  **Assign Assets to the System User**:
    The System User needs permission to access both the Ad Account and the App.
    * With the new System User selected, click **Assign Assets**.
    * **Assign the App**: Select the **Apps** asset type, choose the app you created in Part 1, and enable the **Develop app** permission.
    * **Assign the Ad Account**: Click **Assign Assets** again. Select the **Ad accounts** asset type, choose the target Ad Account(s), and enable the **Manage campaigns (ads)** permission.

3.  **Generate the Token**:
    * With the System User selected, click **Generate new token**.
    * Select the **App** you created.
    * Under **Available permissions**, select `ads_management`.
    * Choose a **Permanent token** (never expires) if available.
    * Click **Generate Token**.
    * **Important**: Copy the token and store it securely (e.g., as a variable in your GTM Server Container).

### ⚠️ Accessing Ad Accounts in Other Business Managers

A System User from one Business Manager (e.g., an Agency) cannot directly access an Ad Account owned by another (e.g., a Client). To enable this, you must establish a **Partner Relationship**:

1.  The **Client** must add the **Agency's** Business ID as a partner in their Business Settings.
2.  The **Client** must then share their **Ad Account** asset with the Agency partner, granting the `Manage ad account` role.
3.  The **Agency** can now assign this shared Ad Account to its own System User.
4.  The token generated by the Agency's System User will now be authorized to manage the Client's audiences.


## Useful resources

- [About the Custom Audiences API](https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences)
- [Custom Audiences API reference](https://developers.facebook.com/docs/marketing-api/reference/custom-audience/users/)
- [Normalization Guidelines](https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences/#hash)

## Open Source

The **Meta Custom Audiences Tag for GTM Server-Side** is developed and maintained by the [Stape Team](https://stape.io/) under the Apache 2.0 license.
