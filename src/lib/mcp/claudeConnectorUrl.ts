/** The name the claude.ai form shows prefilled, and the one the install steps name. */
export const MCP_CONNECTOR_NAME = "OpenCouncil";

/**
 * A claude.ai deep link that opens the "Add custom connector" form with the
 * name and the address filled in. The reader only confirms, so the address is
 * never retyped and a connector cannot land on the wrong realm from a paste.
 */
export function claudeAddConnectorUrl(serverUrl: string): string {
    const params = new URLSearchParams({
        modal: "add-custom-connector",
        connectorName: MCP_CONNECTOR_NAME,
        connectorUrl: serverUrl,
    });
    return `https://claude.ai/customize/connectors?${params}`;
}
