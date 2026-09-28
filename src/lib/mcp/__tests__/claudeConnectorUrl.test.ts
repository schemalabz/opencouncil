import { claudeAddConnectorUrl } from '../claudeConnectorUrl';

describe('claudeAddConnectorUrl', () => {
    it('opens the add-connector form with the name and the encoded address', () => {
        expect(claudeAddConnectorUrl('https://opencouncil.gr/mcp')).toBe(
            'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=OpenCouncil&connectorUrl=https%3A%2F%2Fopencouncil.gr%2Fmcp'
        );
    });

    it('carries a personal token as part of the address', () => {
        const url = new URL(claudeAddConnectorUrl('https://opencouncil.cy/mcp/oc_abc123'));
        expect(url.searchParams.get('connectorUrl')).toBe('https://opencouncil.cy/mcp/oc_abc123');
    });
});
