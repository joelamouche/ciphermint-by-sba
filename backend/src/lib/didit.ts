/**
 * Didit API Client
 *
 * Implements Didit \"Create Session\" using v3 API.
 *
 * Docs:
 * - API authentication: https://docs.didit.me/reference/api-authentication
 * - Create Session v3: https://docs.didit.me/reference/create-session-verification-sessions
 */

interface CreateDiditSessionRequest {
  walletAddress: string;
  /**
   * Optional encryption key we might want to pass later via vendor_data
   * or a custom field in the workflow.
   */
  encryptionKey?: string;
}

interface CreateDiditSessionResponse {
  sessionId: string;
  sessionUrl: string;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Create a new Didit KYC session
 *
 * Uses:
 * - POST https://verification.didit.me/v3/session/
 * - Header: x-api-key: YOUR_API_KEY
 * - Body:
 *   {
 *     \"workflow_id\": \"WORKFLOW_ID\",
 *     \"vendor_data\": \"USER_ID\",
 *     \"callback\": \"CALLBACK_URL\"
 *   }
 */
export async function createDiditSession(
  request: CreateDiditSessionRequest
): Promise<CreateDiditSessionResponse> {
  const diditApiKey = process.env.DIDIT_API_KEY;
  const diditWorkflowId = process.env.DIDIT_WORKFLOW_ID;
  const diditCallbackUrl = process.env.DIDIT_CALLBACK_URL;
  const diditBaseUrl =
    process.env.DIDIT_API_URL || "https://verification.didit.me";

  // If config is missing, fall back to mock behavior for development
  if (!diditApiKey || !diditWorkflowId) {
    console.warn(
      "DIDIT_API_KEY or DIDIT_WORKFLOW_ID not set, using mock Didit session response"
    );
    const mockId = `mock-session-${Date.now()}`;
    return {
      sessionId: mockId,
      sessionUrl: `https://app.didit.me/session/${mockId}`,
    };
  }

  const url = `${normalizeBaseUrl(diditBaseUrl)}/v3/session/`;

  const body: Record<string, unknown> = {
    workflow_id: diditWorkflowId,
    // Use wallet address as vendor_data so we can map the Didit session
    // back to the user in webhooks.
    vendor_data: request.walletAddress.toLowerCase(),
  };

  if (diditCallbackUrl) {
    body.callback = diditCallbackUrl;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": diditApiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Didit API error: ${response.status} ${response.statusText}${
        text ? ` - ${text}` : ""
      }`
    );
  }

  const data: any = await response.json().catch(() => ({}));

  // The exact shape depends on Didit, so we defensively pick common fields.
  const sessionId: string =
    data.id || data.session_id || data.sessionId || `unknown-${Date.now()}`;
  const sessionUrl: string =
    data.url || data.session_url || data.sessionUrl || data.link || "";

  if (!sessionUrl) {
    console.warn(
      "Didit create session response missing URL field, returning ID only"
    );
  }

  return {
    sessionId,
    sessionUrl,
  };
}
